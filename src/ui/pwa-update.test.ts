import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUpdater, type Deps } from './pwa-update';

// 偽の SW まわり
function setup(opt: { controller?: boolean; reg?: Partial<ServiceWorkerRegistration> | null; now?: number; noSw?: boolean } = {}) {
  const swHandlers: Record<string, (() => void)[]> = {};
  const docHandlers: Record<string, (() => void)[]> = {};
  const store = new Map<string, string>();
  const update = vi.fn(async () => undefined);
  const reg = opt.reg === null ? undefined
    : { installing: null, waiting: null, update, ...opt.reg } as unknown as ServiceWorkerRegistration;
  const doc = { visibilityState: 'hidden' as DocumentVisibilityState, addEventListener: (t: string, f: () => void) => { (docHandlers[t] ??= []).push(f); } };
  const reload = vi.fn();
  let t = opt.now ?? 100_000;
  const deps: Deps = {
    sw: opt.noSw ? undefined : {
      controller: opt.controller === false ? null : ({} as ServiceWorker),
      addEventListener: ((ty: string, f: () => void) => { (swHandlers[ty] ??= []).push(f); }) as ServiceWorkerContainer['addEventListener'],
      getRegistration: async () => reg,
    },
    doc: doc as unknown as Deps['doc'],
    reload,
    storage: { getItem: k => store.get(k) ?? null, setItem: (k, v) => { store.set(k, v); } },
    now: () => t,
  };
  const u = createUpdater(deps);
  return {
    u, reload, update, store, doc,
    fire: (ty: string) => swHandlers[ty]?.forEach(f => f()),
    fireDoc: (ty: string) => docHandlers[ty]?.forEach(f => f()),
    tick: (ms: number) => { t += ms; },
  };
}

afterEach(() => { vi.useRealTimers(); });

describe('pwa-update', () => {
  it('起動時と前面に戻ったときに update() を呼ぶ', async () => {
    const s = setup();
    s.u.start();
    await vi.waitFor(() => expect(s.update).toHaveBeenCalledTimes(1));
    s.doc.visibilityState = 'hidden';
    s.fireDoc('visibilitychange');
    s.doc.visibilityState = 'visible';
    s.fireDoc('visibilitychange');
    await vi.waitFor(() => expect(s.update).toHaveBeenCalledTimes(2));
  });

  it('controllerchange で1回だけリロードする', () => {
    const s = setup();
    s.u.start();
    s.fire('controllerchange');
    s.fire('controllerchange');
    s.u.reloadOnce(); // autoUpdate 側からも来る
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('初回インストール（制御なし → あり）ではリロードしない', () => {
    const s = setup({ controller: false });
    s.u.start();
    s.fire('controllerchange');
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('リロード直後のページでは続けてリロードしない（ループよけ）', () => {
    const s = setup();
    s.store.set('manabi:sw-reload', String(100_000 - 1000));
    s.u.start();
    s.fire('controllerchange');
    expect(s.reload).not.toHaveBeenCalled();
    // 時間がたてば、また切り替えられる
    s.tick(60_000);
    s.u.reloadOnce();
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('手動更新: 新しい版がなければ latest', async () => {
    const s = setup();
    expect(await s.u.updateNow()).toBe('latest');
    expect(s.update).toHaveBeenCalled();
    expect(s.reload).not.toHaveBeenCalled();
  });

  it('手動更新: 新しい版があれば reloading で、切り替わらなければ自分でリロード', async () => {
    vi.useFakeTimers();
    const postMessage = vi.fn();
    const s = setup({ reg: { waiting: { postMessage } as unknown as ServiceWorker } });
    expect(await s.u.updateNow()).toBe('reloading');
    expect(postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
    vi.advanceTimersByTime(10_000);
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('手動更新: controllerchange が先に来れば1回だけ', async () => {
    vi.useFakeTimers();
    const s = setup({ controller: false, reg: { installing: {} as ServiceWorker } });
    s.u.start();
    expect(await s.u.updateNow()).toBe('reloading');
    s.fire('controllerchange');
    vi.advanceTimersByTime(10_000);
    expect(s.reload).toHaveBeenCalledTimes(1);
  });

  it('SW がない・登録がない・失敗', async () => {
    expect(await setup({ noSw: true }).u.updateNow()).toBe('unsupported');
    expect(await setup({ reg: null }).u.updateNow()).toBe('unsupported');
    const s = setup();
    s.update.mockRejectedValueOnce(new Error('offline'));
    expect(await s.u.updateNow()).toBe('error');
  });
});
