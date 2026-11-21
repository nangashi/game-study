import { loadRecords, saveRecords, updateChild, type ChildRecord, type FamilyRecords } from '../records';
import { setSoundEnabled } from './sound';

// 画面どうしで共有する状態: 家族の記録（端末に保存）と、いまの子ども

export const app = {
  family: loadRecords() as FamilyRecords,
  childId: null as string | null,
};

export const now = () => Date.now();

export function save(): void {
  saveRecords(app.family);
}

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
