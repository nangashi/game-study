import type { KeisanStageRecord } from '../learn/keisan';
import type { ChildRecord, FamilyRecords, KeisanRecord, Stamped, UnitProgress } from './types';
import { RECORDS_VERSION } from './types';

// 端末どうしの記録を合わせる（「合わせる方式」）。全体の上書きはしない。
// - 単元の進み具合: 星は大きい方、クリアはどちらかで残す、ベストタイムは速い方
// - playableThrough は大きい方、ちからだめしをやったか（testDone）はどちらかで残す
// - 名前などの設定・ちからだめしの途中の記録・lastStage は、あとから保存した方が勝つ
// - 漢字のカードは字ごとに、あとから更新した方が勝つ。書き取りをやりきった回数は端末ごとに大きい方
// - 全消しの印（resetAt）がちがうときは、新しい印の方だけを使う（古い印の控えは全消しより前のものとして持ち込まない）
// どちらから合わせても同じ結果になり（交換法則）、同じものを合わせても変わらない（冪等）

// キーの並びによらない文字列（後勝ちで更新時刻が同じときの決め手）
export function stableKey(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableKey).join(',')}]`;
  if (typeof v === 'object' && v !== null) {
    return `{${Object.keys(v).sort().map(k => `${JSON.stringify(k)}:${stableKey((v as Record<string, unknown>)[k])}`).join(',')}}`;
  }
  return JSON.stringify(v) ?? 'undefined';
}

// 後勝ち。更新時刻が同じなら、中身の文字列が大きい方（どちらから合わせても同じになるように）
export function mergeStamped<T>(a: Stamped<T>, b: Stamped<T>): Stamped<T> {
  if (a.at !== b.at) return a.at > b.at ? a : b;
  return stableKey(a.value) >= stableKey(b.value) ? a : b;
}

// 両方にあるキーは f で合わせ、片方にしかないキーはそのまま残す
function mergeMaps<T>(a: Record<string, T>, b: Record<string, T>, f: (x: T, y: T) => T): Record<string, T> {
  const out: Record<string, T> = { ...a };
  for (const [k, v] of Object.entries(b)) out[k] = k in a ? f(a[k], v) : v;
  return out;
}

export const mergeUnit = (a: UnitProgress, b: UnitProgress): UnitProgress =>
  ({ stars: Math.max(a.stars, b.stars), cleared: a.cleared || b.cleared });

// ベストタイムは 0 を「記録なし」とみなして速い方
const minTime = (a: number, b: number) => (a && b ? Math.min(a, b) : a || b);

export const mergeStage = (a: KeisanStageRecord, b: KeisanStageRecord): KeisanStageRecord => ({
  cleared: a.cleared || b.cleared,
  stars: Math.max(a.stars, b.stars),
  bestScore: Math.max(a.bestScore, b.bestScore),
  bestTime: minTime(a.bestTime, b.bestTime),
});

export const mergeKeisan = (a: KeisanRecord, b: KeisanRecord): KeisanRecord => ({
  stages: mergeMaps(a.stages, b.stages, mergeStage),
  playableThrough: Math.max(a.playableThrough, b.playableThrough),
  testDone: a.testDone || b.testDone,
  testProgress: mergeStamped(a.testProgress, b.testProgress),
  lastStage: mergeStamped(a.lastStage, b.lastStage),
});

export const mergeChild = (a: ChildRecord, b: ChildRecord): ChildRecord => ({
  id: a.id,
  createdAt: Math.min(a.createdAt, b.createdAt),
  settings: mergeStamped(a.settings, b.settings),
  units: mergeMaps(a.units, b.units, mergeUnit),
  keisan: mergeKeisan(a.keisan, b.keisan),
  kanji: mergeMaps(a.kanji, b.kanji, mergeStamped),
  kanjiRuns: mergeMaps(a.kanjiRuns, b.kanjiRuns, Math.max),
});

export function mergeFamily(a: FamilyRecords, b: FamilyRecords): FamilyRecords {
  // 全消しの前の控えは、子どもも進み具合もまとめて捨てる（単元ごとの時刻を持たないので、印より前と後を分けられない）
  if (a.resetAt !== b.resetAt) return a.resetAt > b.resetAt ? a : b;
  return { version: RECORDS_VERSION, resetAt: a.resetAt, children: mergeMaps(a.children, b.children, mergeChild) };
}
