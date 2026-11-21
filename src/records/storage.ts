import { emptyFamily, normalizeFamily } from './model';
import type { FamilyRecords } from './types';

// 端末への保存（localStorage）。旧記録（manabi-survivor:v1）とは別のキーに置く
export const RECORDS_KEY = 'manabi:v2';

// localStorage と同じ形（テストで差し替える）
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const defaultStorage = (): KeyValueStorage | null => {
  try { return globalThis.localStorage ?? null; } catch { return null; }
};

// 読み込み。ない・こわれているときは空のデータ
export function loadRecords(storage: KeyValueStorage | null = defaultStorage()): FamilyRecords {
  try {
    const raw = storage?.getItem(RECORDS_KEY);
    return raw ? normalizeFamily(JSON.parse(raw)) : emptyFamily();
  } catch {
    return emptyFamily();
  }
}

// 保存。保存できない環境（容量オーバー・プライベートモードなど）では false を返し、遊びは止めない
export function saveRecords(data: FamilyRecords, storage: KeyValueStorage | null = defaultStorage()): boolean {
  if (!storage) return false;
  try {
    storage.setItem(RECORDS_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

// 全消し
export function clearRecords(storage: KeyValueStorage | null = defaultStorage()): void {
  try { storage?.removeItem(RECORDS_KEY); } catch { /* 消せなくても遊びは止めない */ }
}
