// PWA の更新（Service Worker）。デプロイしても端末が古いままにならないようにする
// - 起動時と前面に戻ったときに registration.update() で更新を確かめる
// - 新しい SW が制御を取ったら（controllerchange）1回だけリロードする
// - registerSW（autoUpdate）の「activated でリロード」も同じ reloadOnce を通す（2重リロードしない）

export type UpdateResult = 'reloading' | 'latest' | 'unsupported' | 'error';

type SWLike = Pick<ServiceWorkerContainer, 'controller' | 'addEventListener'> & {
  getRegistration(): Promise<ServiceWorkerRegistration | undefined>;
};

export interface Deps {
  sw: SWLike | undefined;
  doc: Pick<Document, 'visibilityState' | 'addEventListener'>;
  reload: () => void;
  storage: Pick<Storage, 'getItem' | 'setItem'> | undefined;
  now: () => number;
}

const GUARD_KEY = 'manabi:sw-reload';
const GUARD_MS = 15_000; // この間に2回目のリロードはしない（無限ループよけ）
const WAIT_MS = 10_000; // 手動更新で新しい版が制御を取るまで待つ上限

export function createUpdater(d: Deps) {
  let reloading = false;
  // 起動時に制御していた SW があったか。初回インストール（制御なし → あり）ではリロードしない
  let hadController = !!d.sw?.controller;

  const reloadOnce = () => {
    if (reloading) return;
    const last = Number(d.storage?.getItem(GUARD_KEY) ?? 0);
    if (last && d.now() - last < GUARD_MS) return;
    reloading = true;
    try { d.storage?.setItem(GUARD_KEY, String(d.now())); } catch { /* 保存できなくても続ける */ }
    d.reload();
  };

  const check = async (): Promise<ServiceWorkerRegistration | undefined> => {
    const reg = await d.sw?.getRegistration();
    if (!reg) return undefined;
    await reg.update();
    return reg;
  };
  const checkQuietly = () => { void check().catch(() => { /* オフラインなど。次の機会に */ }); };

  const start = () => {
    if (!d.sw) return;
    d.sw.addEventListener('controllerchange', () => {
      if (hadController) reloadOnce();
      hadController = true;
    });
    d.doc.addEventListener('visibilitychange', () => {
      if (d.doc.visibilityState === 'visible') checkQuietly();
    });
    checkQuietly();
  };

  // 設定の「アプリを さいしんに する」。新しい版があれば切り替え（リロード）、なければ 'latest'
  const updateNow = async (): Promise<UpdateResult> => {
    if (!d.sw) return 'unsupported';
    let reg: ServiceWorkerRegistration | undefined;
    try { reg = await check(); } catch { return 'error'; }
    if (!reg) return 'unsupported';
    const next = reg.installing ?? reg.waiting;
    if (!next) return 'latest';
    // autoUpdate なので新しい SW はすぐ有効化され、controllerchange でリロードされる。
    // 待っている SW には念のため skipWaiting をお願いし、それでも切り替わらなければ自分でリロードする
    reg.waiting?.postMessage({ type: 'SKIP_WAITING' });
    hadController = true;
    setTimeout(() => { if (!reloading) { reloading = true; d.reload(); } }, WAIT_MS);
    return 'reloading';
  };

  return { start, reloadOnce, updateNow };
}

let updater: ReturnType<typeof createUpdater> | null = null;

// main.ts から1回呼ぶ。registerSW の onNeedReload には reloadOnce を渡す
export function startPwaUpdate() {
  updater = createUpdater({
    sw: 'serviceWorker' in navigator ? navigator.serviceWorker : undefined,
    doc: document,
    reload: () => location.reload(),
    storage: (() => { try { return sessionStorage; } catch { return undefined; } })(),
    now: () => Date.now(),
  });
  updater.start();
  return updater;
}

export const updateAppNow = (): Promise<UpdateResult> => updater?.updateNow() ?? Promise.resolve('unsupported');
