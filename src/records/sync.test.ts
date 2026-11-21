import { describe, expect, it } from 'vitest';
import { createAccessVerifier } from '../../worker/access';
import { handleApi, type KVLike } from '../../worker/api';
import { stageByNum } from '../learn/keisan';
import { emptyFamily, finishKeisanStage, newChild, resetFamily } from './model';
import { createSync, type FetchLike, type SyncStatus } from './sync';
import { RECORDS_VERSION, type FamilyRecords } from './types';

// 端末（createSync）と Worker（handleApi + 偽の KV）を、ネットワークなしでつないで確かめる

function fakeServer() {
  const map = new Map<string, string>();
  const kv: KVLike & { puts: number } = { puts: 0, async get(k) { return map.get(k) ?? null; }, async put(k, v) { this.puts++; map.set(k, v); } };
  const env = { FAMILY: kv, ASSETS: { fetch: async () => new Response('') }, ACCESS_TEAM_DOMAIN: '', ACCESS_AUD: '' };
  const verify = createAccessVerifier();
  let down: 'offline' | 'auth' | null = null;
  const calls: string[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push(init.method ?? 'GET');
    if (down === 'offline') throw new TypeError('Failed to fetch');
    if (down === 'auth') return new Response('<html>login</html>', { status: 302, headers: { location: 'https://team.cloudflareaccess.com/' } });
    return handleApi(new Request(`http://localhost:8787${url}`, init as RequestInit), env, verify);
  };
  return { kv, fetch, calls, setDown: (d: typeof down) => { down = d; } };
}

function device(fetch: FetchLike, init: FamilyRecords = emptyFamily()) {
  const d = { data: init, statuses: [] as SyncStatus[] };
  const sync = createSync({ fetch, get: () => d.data, set: f => { d.data = f; }, onStatus: s => d.statuses.push(s) });
  return Object.assign(d, sync);
}

const s1 = stageByNum(1), s2 = stageByNum(2);

describe('端末とサーバーの同期', () => {
  it('2台の端末が結果画面で送り、起動時に取ると、両方の記録がそろう', async () => {
    const srv = fakeServer();
    const taro = newChild('a', { name: 'たろう' }, 100);
    const fam = { version: RECORDS_VERSION, resetAt: 0, children: { a: taro } } as FamilyRecords;
    const A = device(srv.fetch, fam), B = device(srv.fetch, fam);
    await A.pull(); await B.pull();

    A.data = { ...A.data, children: { a: finishKeisanStage(A.data.children.a, s1, 10, 40, 200).child } };
    await A.push();
    B.data = { ...B.data, children: { a: finishKeisanStage(B.data.children.a, s2, 9, 50, 210).child } };
    await B.push(); // B は送ると同時に A の分も受け取る
    expect(B.data.children.a.keisan.stages.s1?.cleared).toBe(true);
    expect(B.data.children.a.keisan.stages.s2?.cleared).toBe(true);

    expect(await A.pull()).toBe(true);
    expect(A.data).toEqual(B.data);
    expect(A.statuses.every(s => s === 'ok')).toBe(true);
  });

  it('サーバーと同じなら送らない（KV の書き込みを増やさない）', async () => {
    const srv = fakeServer();
    const A = device(srv.fetch, { ...emptyFamily(), children: { a: newChild('a', { name: 'たろう' }, 100) } });
    await A.pull();
    await A.push();
    await A.push();
    expect(srv.calls).toEqual(['GET', 'PUT']);
    expect(srv.kv.puts).toBe(1);
  });

  it('送っている間に次の結果が来たら、終わってから1回だけ送る', async () => {
    const srv = fakeServer();
    const A = device(srv.fetch, { ...emptyFamily(), children: { a: newChild('a', { name: 'たろう' }, 100) } });
    const first = A.push();
    A.data = { ...A.data, children: { a: finishKeisanStage(A.data.children.a, s1, 10, 40, 200).child } };
    void A.push(); void A.push();
    await first;
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    expect(srv.calls).toEqual(['PUT', 'PUT']);
  });

  it('オフライン・ログイン切れでも端末の記録はそのまま。状態だけ知らせ、自動で送り直さない', async () => {
    const srv = fakeServer();
    const fam = { ...emptyFamily(), children: { a: newChild('a', { name: 'たろう' }, 100) } };
    const A = device(srv.fetch, fam);
    srv.setDown('offline');
    expect(await A.pull()).toBe(false);
    await A.push();
    srv.setDown('auth');
    await A.push();
    expect(A.data).toBe(fam);
    expect(A.statuses).toEqual(['offline', 'offline', 'auth']);
    expect(srv.calls).toEqual(['GET', 'PUT', 'PUT']);
    // つながったら、次の結果画面でまとめて送れる
    srv.setDown(null);
    await A.push();
    expect(A.statuses.at(-1)).toBe('ok');
    expect(srv.kv.puts).toBe(1);
  });

  it('全消しは他の端末にも伝わり、古い控えから記録が戻らない', async () => {
    const srv = fakeServer();
    const taro = finishKeisanStage(newChild('a', { name: 'たろう' }, 100), s1, 10, 40, 200).child;
    const fam = { ...emptyFamily(), children: { a: taro } };
    const A = device(srv.fetch, fam), B = device(srv.fetch, fam);
    await A.push(); await B.pull();

    A.data = resetFamily(A.data, 1000);
    await A.push();

    // B は全消しを知らないまま遊んで、結果画面で送る → 全消しのデータを受け取る
    B.data = { ...B.data, children: { a: finishKeisanStage(B.data.children.a, s2, 10, 30, 900).child } };
    await B.push();
    expect(B.data).toEqual({ version: RECORDS_VERSION, resetAt: 1000, children: {} });

    // 起動しなおした A も、空のまま
    expect(await A.pull()).toBe(false);
    expect(A.data.children).toEqual({});
  });
});
