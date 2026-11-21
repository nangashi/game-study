import { beforeAll, describe, expect, it } from 'vitest';
import { ACCESS_HEADER, createAccessVerifier, issuerOf } from './access';

// テスト用に RSA の鍵を作り、Access と同じ形の JWT を自前で署名する

const TEAM = 'https://kazoku.cloudflareaccess.com';
const AUD = 'aud-tag-123';
const CFG = { teamDomain: TEAM, aud: AUD };
const NOW = 1_800_000_000_000; // ms

const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const b64urlJson = (v: unknown) => b64url(new TextEncoder().encode(JSON.stringify(v)));

let keyPair: CryptoKeyPair;
let otherPair: CryptoKeyPair;
let jwks: unknown;

const gen = () => crypto.subtle.generateKey(
  { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
  true, ['sign', 'verify']) as Promise<CryptoKeyPair>;

beforeAll(async () => {
  keyPair = await gen();
  otherPair = await gen();
  const pub = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  jwks = { keys: [{ ...pub, kid: 'k1', alg: 'RS256', use: 'sig' }] };
});

async function sign(payload: Record<string, unknown>, o: { kid?: string; key?: CryptoKey; alg?: string } = {}) {
  const head = b64urlJson({ alg: o.alg ?? 'RS256', kid: o.kid ?? 'k1', typ: 'JWT' });
  const body = b64urlJson(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', o.key ?? keyPair.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${b64url(new Uint8Array(sig))}`;
}

const goodClaims = () => ({ iss: TEAM, aud: [AUD], email: 'oya@example.com', exp: NOW / 1000 + 3600, iat: NOW / 1000 - 10, nbf: NOW / 1000 - 10 });

function setup() {
  const calls: string[] = [];
  const verify = createAccessVerifier({
    now: () => NOW,
    fetch: async url => { calls.push(url); return new Response(JSON.stringify(jwks), { status: 200 }); },
  });
  return { verify, calls };
}

const req = (token?: string, host = 'manabi.example.com') =>
  new Request(`https://${host}/api/family`, { headers: token ? { [ACCESS_HEADER]: token } : {} });

describe('Access の証明の検証', () => {
  it('正しい証明なら通す（公開鍵はチームのドメインから取って控えておく）', async () => {
    const { verify, calls } = setup();
    const t = await sign(goodClaims());
    expect(await verify(req(t), CFG)).toEqual({ ok: true, dev: false, email: 'oya@example.com' });
    expect(await verify(req(t), CFG)).toMatchObject({ ok: true });
    expect(calls).toEqual([`${TEAM}/cdn-cgi/access/certs`]);
  });

  it('証明のヘッダーがないときは 401 で断る', async () => {
    const { verify } = setup();
    expect(await verify(req(), CFG)).toEqual({ ok: false, status: 401, error: 'missing access token' });
  });

  it('こわれた・にせの・期限切れ・ちがうアプリの証明は 403 で断る', async () => {
    const { verify } = setup();
    const cases: [string, string][] = [
      ['abc', 'malformed token'],
      ['a.b.c', 'malformed token'],
      [await sign(goodClaims(), { key: otherPair.privateKey }), 'bad signature'],
      [await sign(goodClaims(), { kid: 'nope' }), 'unknown key'],
      [await sign(goodClaims(), { alg: 'HS256' }), 'unsupported token'],
      [await sign({ ...goodClaims(), exp: NOW / 1000 - 3600 }), 'token expired'],
      [await sign({ ...goodClaims(), nbf: NOW / 1000 + 3600 }), 'token not yet valid'],
      [await sign({ ...goodClaims(), iss: 'https://other.cloudflareaccess.com' }), 'bad issuer'],
      [await sign({ ...goodClaims(), aud: ['other-aud'] }), 'bad audience'],
    ];
    for (const [t, error] of cases) expect(await verify(req(t), CFG), error).toEqual({ ok: false, status: 403, error });
    // 署名の部分だけ差しかえても通らない
    const good = await sign(goodClaims());
    const forged = good.split('.').slice(0, 2).join('.') + '.' + (await sign({ ...goodClaims(), email: 'x' })).split('.')[2];
    expect(await verify(req(forged), CFG)).toMatchObject({ ok: false, status: 403 });
  });

  it('aud は文字列でもよい。チームのドメインは https:// なしでも同じ', async () => {
    const { verify } = setup();
    const t = await sign({ ...goodClaims(), aud: AUD });
    expect(await verify(req(t), { teamDomain: 'kazoku.cloudflareaccess.com/', aud: AUD })).toMatchObject({ ok: true });
    expect(issuerOf('kazoku.cloudflareaccess.com')).toBe(TEAM);
  });

  it('設定が2つとも空なら、localhost（wrangler dev）だけ検証なしで通す', async () => {
    const { verify, calls } = setup();
    for (const host of ['localhost:8787', '127.0.0.1:8787']) {
      expect(await verify(req(undefined, host), {})).toEqual({ ok: true, dev: true, email: null });
    }
    expect(await verify(req(undefined, 'localhost'), { teamDomain: ' ', aud: '' })).toMatchObject({ ok: true, dev: true });
    expect(calls).toEqual([]);
  });

  it('設定が空のまま本番のドメインに来たら、通さずに 500（設定ミスを知らせる）', async () => {
    const { verify } = setup();
    const t = await sign(goodClaims());
    expect(await verify(req(t), {})).toEqual({ ok: false, status: 500, error: 'access not configured' });
    expect(await verify(req(t), { teamDomain: TEAM })).toEqual({ ok: false, status: 500, error: 'access config incomplete' });
    // 設定が片方だけなら localhost でも通さない
    expect(await verify(req(undefined, 'localhost'), { aud: AUD })).toMatchObject({ ok: false, status: 500 });
  });

  it('公開鍵が取れないときは 500', async () => {
    const verify = createAccessVerifier({ now: () => NOW, fetch: async () => new Response('x', { status: 502 }) });
    expect(await verify(req(await sign(goodClaims())), CFG)).toEqual({ ok: false, status: 500, error: 'cannot load access keys' });
  });
});
