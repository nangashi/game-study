import { createSync, loadRecords, saveRecords, updateChild, type ChildRecord, type FamilyRecords } from '../records';
import { setSoundEnabled } from './sound';
import { showSyncStatus } from './sync-note';

// 画面どうしで共有する状態: 家族の記録（端末に保存）と、いまの子ども

export const app = {
  family: loadRecords() as FamilyRecords,
  childId: null as string | null,
};

export const now = () => Date.now();

export function save(): void {
  saveRecords(app.family);
}

// 家族のデータを Worker と合わせる（起動時に pullFamily、結果画面で pushFamily）。失敗しても遊びは止めない
const sync = createSync({
  fetch: (url, init) => fetch(url, init),
  get: () => app.family,
  set: f => { app.family = f; save(); },
  onStatus: showSyncStatus,
});

// 起動時。端末のデータが変わったら true（画面を描きなおす）
export const pullFamily = (): Promise<boolean> => sync.pull();

// 結果画面のとき（と全消しのとき）だけ送る。KV の書き込み回数を増やさないため、ほかの保存では送らない
export const pushFamily = (): void => { void sync.push(); };

// いまの子ども（いなければ null）
export function current(): ChildRecord | null {
  const c = app.childId ? app.family.children[app.childId] : undefined;
  return c && !c.settings.value.removed ? c : null;
}

// いまの子どもの記録を更新して保存する
export function updateCurrent(f: (c: ChildRecord) => ChildRecord): void {
  if (!app.childId) return;
  app.family = updateChild(app.family, app.childId, f);
  save();
}

// 動きを減らす設定（算数練習アプリと同じく、待ち時間と演出を短くする）
export const REDUCED = typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

setSoundEnabled(() => current()?.settings.value.sound ?? true);
