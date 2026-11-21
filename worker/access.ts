// Cloudflare Access の証明（Cf-Access-Jwt-Assertion）を Worker の中でも確かめる。
// Access の外から（設定ミス・別の入口から）来たリクエストを、Worker 側でも通さないため。
//
// 設定（wrangler.jsonc の vars）:
//   ACCESS_TEAM_DOMAIN … チームのドメイン（例: https://<team>.cloudflareaccess.com）。JWT の iss と公開鍵の取り先
//   ACCESS_AUD         … Access アプリケーションの AUD タグ。JWT の aud
// 2つとも空で、しかも localhost への開発リクエストのときだけ、確かめずに通す（wrangler dev 用）。
// それ以外で設定が足りないときは、安全側に倒して 500 で断る。

export interface AccessConfig {
  teamDomain?: string;
  aud?: string;
}

export type AccessResult =
  | { ok: true; dev: boolean; email: string | null }
  | { ok: false; status: 401 | 403 | 500; error: string };

export const ACCESS_HEADER = 'Cf-Access-Jwt-Assertion';

const LEEWAY_SEC = 60;            // 時計のずれの許し
const JWKS_TTL_MS = 60 * 60_000;  // 公開鍵の控えを使う時間
const JWKS_RETRY_MS = 60_000;     // 知らない鍵 id のとき、取り直すまでの最短の間

const DEV_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// 'team.cloudflareaccess.com' でも 'https://team.cloudflareaccess.com/' でも同じ iss にそろえる
export function issuerOf(teamDomain: string): string {
  const host = teamDomain.trim().replace(/^https?:\/\//, '').replace(/\/+$/, '');
  return `https://${host}`;
}

function b64urlBytes(s: string): Uint8Array {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function b64urlJson(s: string): Record<string, unknown> | null {
  try {
    const v: unknown = JSON.parse(new TextDecoder().decode(b64urlBytes(s)));
    return typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

interface Jwk { kid?: string; kty?: string; alg?: string; n?: string; e?: string }
interface KeySet { keys: Map<string, CryptoKey>; fetchedAt: number }

export interface VerifierDeps {
  fetch?: (url: string) => Promise<Response>;
  now?: () => number; // ms
}

// 公開鍵の控えを持つ確かめ役を作る（Worker では1つを使い回す。テストでは fetch と時計を差し替える）
export function createAccessVerifier(deps: VerifierDeps = {}) {
  const doFetch = deps.fetch ?? ((url: string) => fetch(url));
  const now = deps.now ?? Date.now;
  const cache = new Map<string, KeySet>(); // iss → 鍵

  async function loadKeys(iss: string): Promise<KeySet> {
    const res = await doFetch(`${iss}/cdn-cgi/access/certs`);
    if (!res.ok) throw new Error(`certs ${res.status}`);
    const body = (await res.json()) as { keys?: Jwk[] };
    const keys = new Map<string, CryptoKey>();
    for (const k of body.keys ?? []) {
      if (!k.kid || k.kty !== 'RSA' || !k.n || !k.e) continue;
      const key = await crypto.subtle.importKey(
        'jwk', { kty: 'RSA', n: k.n, e: k.e, alg: 'RS256', ext: true },
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
      keys.set(k.kid, key);
    }
    const set = { keys, fetchedAt: now() };
    cache.set(iss, set);
    return set;
  }

  async function keyFor(iss: string, kid: string): Promise<CryptoKey | null> {
    let set = cache.get(iss);
    if (!set || now() - set.fetchedAt > JWKS_TTL_MS) set = await loadKeys(iss);
    else if (!set.keys.has(kid) && now() - set.fetchedAt > JWKS_RETRY_MS) set = await loadKeys(iss); // 鍵の入れかえ
    return set.keys.get(kid) ?? null;
  }

  return async function verify(req: Request, cfg: AccessConfig): Promise<AccessResult> {
    const teamDomain = (cfg.teamDomain ?? '').trim();
    const aud = (cfg.aud ?? '').trim();

    if (!teamDomain && !aud) {
      const host = new URL(req.url).hostname;
      if (DEV_HOSTS.has(host)) return { ok: true, dev: true, email: null };
      return { ok: false, status: 500, error: 'access not configured' };
    }
    if (!teamDomain || !aud) return { ok: false, status: 500, error: 'access config incomplete' };

    const token = req.headers.get(ACCESS_HEADER);
    if (!token) return { ok: false, status: 401, error: 'missing access token' };

    const parts = token.split('.');
    if (parts.length !== 3) return { ok: false, status: 403, error: 'malformed token' };
    const header = b64urlJson(parts[0]);
    const payload = b64urlJson(parts[1]);
    if (!header || !payload) return { ok: false, status: 403, error: 'malformed token' };
    if (header.alg !== 'RS256' || typeof header.kid !== 'string') return { ok: false, status: 403, error: 'unsupported token' };

    const iss = issuerOf(teamDomain);
    let key: CryptoKey | null;
    try {
      key = await keyFor(iss, header.kid);
    } catch {
      return { ok: false, status: 500, error: 'cannot load access keys' };
    }
    if (!key) return { ok: false, status: 403, error: 'unknown key' };

    let sig: Uint8Array;
    try { sig = b64urlBytes(parts[2]); } catch { return { ok: false, status: 403, error: 'malformed token' }; }
    const signed = new TextEncoder().encode(`${parts[0]}.${parts[1]}`);
    const good = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', key, sig as BufferSource, signed as BufferSource);
    if (!good) return { ok: false, status: 403, error: 'bad signature' };

    const t = now() / 1000;
    if (typeof payload.exp !== 'number' || payload.exp + LEEWAY_SEC < t) return { ok: false, status: 403, error: 'token expired' };
    if (typeof payload.nbf === 'number' && payload.nbf - LEEWAY_SEC > t) return { ok: false, status: 403, error: 'token not yet valid' };
    if (payload.iss !== iss) return { ok: false, status: 403, error: 'bad issuer' };
    const auds = Array.isArray(payload.aud) ? payload.aud : [payload.aud];
    if (!auds.includes(aud)) return { ok: false, status: 403, error: 'bad audience' };

    return { ok: true, dev: false, email: typeof payload.email === 'string' ? payload.email : null };
  };
}

export type AccessVerifier = ReturnType<typeof createAccessVerifier>;
