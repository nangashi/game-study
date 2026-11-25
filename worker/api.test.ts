import { describe, expect, it } from 'vitest';
import {
  RECORDS_VERSION, emptyFamily, finishKeisanStage, newChild, recordKanjiResult, recordUnitResult, resetFamily, updateSettings,
  type FamilyRecords,
} from '../src/records';
import { stageByNum } from '../src/learn/keisan';
import type { AccessResult, AccessVerifier } from './access';
import { FAMILY_KEY, MAX_BODY_BYTES, handleApi, type Env, type KVLike } from './api';
import worker from './index';

// 偽の KV（書いた回数も数える）
function fakeKV(init?: string): KVLike & { map: Map<string, string>; puts: number } {
  const map = new Map<string, string>();
  if (init != null) map.set(FAMILY_KEY, init);
  return {
    map, puts: 0,
    async get(k) { return map.get(k) ?? null; },
    async put(k, v) { this.puts++; map.set(k, v); },
  };
}

const allow: AccessVerifier = async () => ({ ok: true, dev: false, email: 'oya@example.com' });
const deny = (r: AccessResult): AccessVerifier => async () => r;

function env(kv = fakeKV()): Env & { FAMILY: ReturnType<typeof fakeKV> } {
  return { FAMILY: kv, ASSETS: { fetch: async () => new Response('static') } };
}

const URL_ = 'https://manabi.example.com/api/family';
const get = () => new Request(URL_);
const put = (body: unknown, headers: Record<string, string> = { 'content-type': 'application/json' }) =>
  new Request(URL_, { method: 'PUT', headers, body: typeof body === 'string' ? body : JSON.stringify(body) });

const s1 = stageByNum(1), s2 = stageByNum(2);
const fam = (children: FamilyRecords['children'], resetAt = 0): FamilyRecords => ({ version: RECORDS_VERSION, resetAt, children });

describe('GET /api/family', () => {
  it('まだ何もないときは空のデータを返す（KV には書かない）', async () => {
    const e = env();
    const res = await handleApi(get(), e, allow);
    expect(res.status).toBe(200);
    expect(res.headers.get('cache-control')).toBe('no-store');
    expect(await res.json()).toEqual(emptyFamily());
    expect(e.FAMILY.puts).toBe(0);
  });

  it('保存してあるデータを、形をそろえて返す', async () => {
    const data = fam({ a: newChild('a', { name: 'たろう' }, 100) });
    const res = await handleApi(get(), env(fakeKV(JSON.stringify({ ...data, junk: 1 }))), allow);
    expect(await res.json()).toEqual(data);
  });
});

describe('PUT /api/family（サーバーでも合わせる）', () => {
  it('漢字のカードは字ごとに新しい方が残る', async () => {
    const e = env();
    const base = newChild('a', { name: 'たろう' }, 100);
    const a = fam({ a: recordKanjiResult(recordKanjiResult(base, '一', 'correct', '2026-11-25', 1000), '二', 'wrong', '2026-11-25', 1001) });
    const b = fam({ a: recordKanjiResult(base, '一', 'wrong', '2026-11-26', 2000) });
    await handleApi(put(a), e, allow);
    const m = (await (await handleApi(put(b), e, allow)).json()) as FamilyRecords;
    expect(m.children.a.kanji['一']).toEqual(b.children.a.kanji['一']);
    expect(m.children.a.kanji['二']).toEqual(a.children.a.kanji['二']);
    // 古い控え（A）をもう一度送っても変わらず、KV にも書かない
    const puts = e.FAMILY.puts;
    expect(await (await handleApi(put(a), e, allow)).json()).toEqual(m);
    expect(e.FAMILY.puts).toBe(puts);
  });

  it('はじめての保存はそのまま置き、合わせた結果を返す', async () => {
    const e = env();
    const data = fam({ a: newChild('a', { name: 'たろう' }, 100) });
    const res = await handleApi(put(data), e, allow);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual(data);
    expect(JSON.parse(e.FAMILY.map.get(FAMILY_KEY)!)).toEqual(data);
  });

  it('2台の端末が別々に進めて保存しても、両方の記録が残る', async () => {
    const e = env();
    const base = newChild('a', { name: 'たろう' }, 100);
    // 端末A: s1 を 10問 40秒でクリア ／ 端末B（A の保存を知らない）: s1 を 8問 30秒、s2 を 5問、ひらがな1 星2、名前を変える
    const a = fam({ a: finishKeisanStage(base, s1, 10, 40, 200).child });
    let bc = finishKeisanStage(base, s1, 8, 30, 150).child;
    bc = finishKeisanStage(bc, s2, 5, 60, 160).child;
    bc = updateSettings(recordUnitResult(bc, 'hira:1', 2, true), { name: 'たろちゃん' }, 170);
    // B は別の子ども（はなこ）も登録していた
    const b = fam({ a: bc, h: newChild('h', { name: 'はなこ' }, 120) });

    await handleApi(put(a), e, allow);
    const res = await handleApi(put(b), e, allow);
    const m = (await res.json()) as FamilyRecords;
    const stored = JSON.parse(e.FAMILY.map.get(FAMILY_KEY)!) as FamilyRecords;
    expect(stored).toEqual(m);
    expect(Object.keys(m.children).sort()).toEqual(['a', 'h']);
    expect(m.children.a.keisan.stages.s1).toEqual({ cleared: true, stars: 3, bestScore: 10, bestTime: 30 });
    expect(m.children.a.keisan.stages.s2).toMatchObject({ bestScore: 5 });
    expect(m.children.a.units['hira:1']).toEqual({ stars: 2, cleared: true });
    expect(m.children.a.settings.value.name).toBe('たろちゃん');
    expect(m.children.a.keisan.lastStage).toEqual({ value: 's1', at: 200 });

    // A が古い控え（自分の分だけ）をもう一度送っても、B の記録は消えない
    const again = (await (await handleApi(put(a), e, allow)).json()) as FamilyRecords;
    expect(again).toEqual(m);
  });

  it('合わせても変わらないときは KV に書かない', async () => {
    const e = env();
    const data = fam({ a: newChild('a', { name: 'たろう' }, 100) });
    await handleApi(put(data), e, allow);
    expect(e.FAMILY.puts).toBe(1);
    await handleApi(put(data), e, allow);
    await handleApi(put(emptyFamily()), e, allow); // 空の控え（新しい端末）を送っても
    expect(e.FAMILY.puts).toBe(1);
  });

  it('全消しを送ると KV のデータも空になり、ほかの端末の古い控えから戻らない', async () => {
    const e = env();
    let taro = finishKeisanStage(newChild('a', { name: 'たろう' }, 100), s1, 10, 40, 200).child;
    taro = recordUnitResult(taro, 'hira:1', 3, true);
    const old = fam({ a: taro });
    await handleApi(put(old), e, allow);

    // 端末A で全消し
    const reset = resetFamily(old, 1000);
    expect(await (await handleApi(put(reset), e, allow)).json()).toEqual(reset);

    // 端末B は全消しを知らず、古い控えに進み具合を足して保存してくる → 持ち込まれず、全消しのデータが返る
    const stale = fam({ a: finishKeisanStage(taro, s2, 10, 30, 900).child });
    const res = (await (await handleApi(put(stale), e, allow)).json()) as FamilyRecords;
    expect(res).toEqual(reset);
    expect(JSON.parse(e.FAMILY.map.get(FAMILY_KEY)!)).toEqual(reset);

    // 全消しのあとに登録・記録した分はふつうに合わさる
    const after = fam({ h: finishKeisanStage(newChild('h', { name: 'はなこ' }, 1100), s1, 9, 50, 1200).child }, reset.resetAt);
    const m = (await (await handleApi(put(after), e, allow)).json()) as FamilyRecords;
    expect(m.resetAt).toBe(1000);
    expect(Object.keys(m.children)).toEqual(['h']);
    expect(await (await handleApi(get(), e, allow)).json()).toEqual(m);
  });

  it('KV のデータがこわれていたら、送られたデータで置き直す', async () => {
    const e = env(fakeKV('{こわれた'));
    const data = fam({ a: newChild('a', { name: 'たろう' }, 100) });
    expect(await (await handleApi(put(data), e, allow)).json()).toEqual(data);
    expect(JSON.parse(e.FAMILY.map.get(FAMILY_KEY)!)).toEqual(data);
  });

  it('形のちがう・大きすぎる・JSON でないものは断り、KV は変えない', async () => {
    const e = env();
    const bad: [Request, number][] = [
      [put('{oops'), 400],
      [put({ version: 1, profiles: [] }), 400],
      [put({ version: 2, children: [] }), 400],
      [put([]), 400],
      [put(emptyFamily(), { 'content-type': 'text/plain' }), 415],
      [put(JSON.stringify({ ...emptyFamily(), pad: 'x'.repeat(MAX_BODY_BYTES) })), 413],
    ];
    for (const [r, status] of bad) expect((await handleApi(r, e, allow)).status).toBe(status);
    expect(e.FAMILY.puts).toBe(0);
  });
});

describe('/api のそのほか', () => {
  it('ちがう道は 404、ちがうメソッドは 405', async () => {
    expect((await handleApi(new Request('https://m.example.com/api/other'), env(), allow)).status).toBe(404);
    const r = await handleApi(new Request(URL_, { method: 'DELETE' }), env(), allow);
    expect(r.status).toBe(405);
    expect(r.headers.get('allow')).toBe('GET, PUT');
  });

  it('認証で断られたら、KV を読まずにその状態で返す', async () => {
    const kv = fakeKV();
    kv.get = async () => { throw new Error('KV を読んではいけない'); };
    for (const r of [{ ok: false, status: 401, error: 'missing access token' }, { ok: false, status: 403, error: 'bad signature' }] as const) {
      const res = await handleApi(put(emptyFamily()), env(kv), deny(r));
      expect(res.status).toBe(r.status);
      expect(await res.json()).toEqual({ error: r.error });
    }
    expect(kv.puts).toBe(0);
  });
});

describe('Worker の入口', () => {
  const access = { ACCESS_TEAM_DOMAIN: 'https://kazoku.cloudflareaccess.com', ACCESS_AUD: 'aud' };

  it('/api は認証ヘッダーがなければ 401（本物の検証で）', async () => {
    const e = { ...env(), ...access };
    for (const path of ['/api/family', '/api', '/api/other']) {
      const res = await worker.fetch(new Request(`https://manabi.example.com${path}`), e);
      expect(res.status, path).toBe(401);
    }
    expect(e.FAMILY.puts).toBe(0);
  });

  it('/api 以外は静的ファイルへ', async () => {
    const res = await worker.fetch(new Request('https://manabi.example.com/apiary'), { ...env(), ...access });
    expect(await res.text()).toBe('static');
  });

  it('設定が空でも localhost なら通る（wrangler dev）', async () => {
    const res = await worker.fetch(new Request('http://localhost:8787/api/family'), { ...env(), ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' });
    expect(res.status).toBe(200);
  });
});
