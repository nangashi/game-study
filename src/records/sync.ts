import { mergeFamily, stableKey } from './merge';
import { normalizeFamily } from './model';
import { RECORDS_VERSION, type FamilyRecords } from './types';

// 家族のデータを Worker（/api/family）と合わせる。
// - 起動時に pull: サーバーのデータを取って、端末のデータと mergeFamily で合わせる
// - 結果画面で push: 端末のデータを送り、サーバーで合わせた結果を端末のデータとまた合わせる
// 失敗（オフライン・ログイン切れ・サーバーのエラー）しても端末の記録はそのまま。状態を知らせるだけで、
// 自動の再送はしない（次の結果画面でまとめて送る。KV の書き込み回数の節約）

export const API_FAMILY = '/api/family';
const TIMEOUT_MS = 10_000;

export type SyncFailure = 'offline' | 'auth' | 'server';
export type SyncStatus = 'ok' | SyncFailure;
type CallResult = { ok: true; data: FamilyRecords } | { ok: false; reason: SyncFailure };

export type FetchLike = (url: string, init: RequestInit) => Promise<Response>;

async function call(fetchFn: FetchLike, init: RequestInit): Promise<CallResult> {
  const ctl = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = ctl ? setTimeout(() => ctl.abort(), TIMEOUT_MS) : null;
  let res: Response;
  try {
    // redirect: 'manual' … Access のログインが切れると、ログイン画面への転送が返る。それを「ログイン切れ」として受ける
    res = await fetchFn(API_FAMILY, { ...init, credentials: 'same-origin', redirect: 'manual', cache: 'no-store', signal: ctl?.signal });
  } catch {
    return { ok: false, reason: 'offline' };
  } finally {
    if (timer) clearTimeout(timer);
  }
  if (res.type === 'opaqueredirect' || res.status === 401 || res.status === 403 || (res.status >= 300 && res.status < 400)) {
    return { ok: false, reason: 'auth' };
  }
  if (!res.ok) return { ok: false, reason: 'server' };
  // Access のログイン画面（HTML）が返ってきたときも、ログイン切れとみなす
  if (!(res.headers.get('content-type') ?? '').includes('application/json')) return { ok: false, reason: 'auth' };
  try {
    const raw = (await res.json()) as { version?: unknown };
    if (raw?.version !== RECORDS_VERSION) return { ok: false, reason: 'server' };
    return { ok: true, data: normalizeFamily(raw) };
  } catch {
    return { ok: false, reason: 'server' };
  }
}

export interface SyncDeps {
  fetch: FetchLike;
  get: () => FamilyRecords;           // いまの端末のデータ
  set: (f: FamilyRecords) => void;    // 合わせた結果を端末に入れる（保存も）
  onStatus?: (s: SyncStatus) => void;
}

export function createSync(deps: SyncDeps) {
  let busy = false;
  let queued = false;               // 送っている間に次の結果が来たら、終わってから1回だけ送る
  let serverKey: string | null = null; // サーバーにあると分かっているデータ（同じなら送らない）

  const report = (s: SyncStatus) => deps.onStatus?.(s);

  // サーバーの結果を端末のデータと合わせる。端末のデータが変わったら true
  function adopt(remote: FamilyRecords): boolean {
    serverKey = stableKey(remote);
    const local = deps.get();
    const merged = mergeFamily(local, remote);
    if (stableKey(merged) === stableKey(local)) return false;
    deps.set(merged);
    return true;
  }

  // 起動時。端末のデータが変わったら true
  async function pull(): Promise<boolean> {
    if (busy) return false;
    busy = true;
    try {
      const r = await call(deps.fetch, { method: 'GET' });
      report(r.ok ? 'ok' : r.reason);
      return r.ok ? adopt(r.data) : false;
    } finally {
      busy = false;
      if (queued) { queued = false; void push(); }
    }
  }

  // 結果画面のとき（と全消しのとき）。サーバーと同じなら送らない
  async function push(): Promise<void> {
    if (busy) { queued = true; return; }
    const snapshot = deps.get();
    if (serverKey !== null && stableKey(snapshot) === serverKey) return;
    busy = true;
    try {
      const r = await call(deps.fetch, {
        method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(snapshot),
      });
      report(r.ok ? 'ok' : r.reason);
      if (r.ok) adopt(r.data);
    } finally {
      busy = false;
      if (queued) { queued = false; void push(); }
    }
  }

  return { pull, push };
}
