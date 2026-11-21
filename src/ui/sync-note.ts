import type { SyncStatus } from '../records';

// 同期の小さな表示（画面の下のすみ）。遊びは止めない。つながったら消える
const TEXT: Record<Exclude<SyncStatus, 'ok'>, string> = {
  offline: 'いまは つながって いないよ。きろくは この たんまつに のこるよ',
  auth: 'ログインが きれたよ。おうちの ひとに みてもらってね（タップで やりなおし）',
  server: 'きろくを おくれなかったよ。この たんまつには のこるよ',
};
const HIDE_MS = 8000;

let el: HTMLButtonElement | null = null;
let timer = 0;

export function showSyncStatus(s: SyncStatus): void {
  if (typeof document === 'undefined') return;
  clearTimeout(timer);
  if (s === 'ok') { el?.remove(); el = null; return; }
  if (!el) {
    el = document.createElement('button');
    el.type = 'button';
    el.className = 'sync-note';
    el.setAttribute('role', 'status');
    document.body.append(el);
  }
  const node = el;
  node.textContent = TEXT[s];
  node.classList.toggle('auth', s === 'auth');
  // ログイン切れは、おうちの人が読み込みなおすまで出しておく（Access のログイン画面へ）
  node.onclick = s === 'auth' ? () => location.reload() : () => { node.remove(); if (el === node) el = null; };
  if (s !== 'auth') timer = window.setTimeout(() => { node.remove(); if (el === node) el = null; }, HIDE_MS);
}
