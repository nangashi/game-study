import type { Rng } from '../learn/random';
import { TOLERANCE, type Tolerance } from '../learn/handwriting/judge';
import {
  applyTestResult, clampPlayableThrough, mergeStageResult, playableAfterClear,
  type KeisanStage, type KeisanStageRecord, type TestProgress, type TestResult,
} from '../learn/keisan';
import { LADDER, GRADUATE_FIRST, GRADUATE_NEXT, applyResult, isDate, type KanjiCard, type SelfGrade } from '../learn/kanji/srs';
import {
  RECORDS_VERSION, type ChildRecord, type ChildSettings, type FamilyRecords, type KeisanRecord, type UnitProgress,
} from './types';

// 記録を作る・更新する関数。どれも元の記録は書きかえず、新しい記録を返す。
// now は更新時刻（ms）。端末どうしで合わせるときの後勝ちの判定に使う

export const emptyFamily = (): FamilyRecords => ({ version: RECORDS_VERSION, resetAt: 0, children: {} });

// 全消し。進み具合と子どもを空にし、リセット印を今にする（ほかの端末の古い控えから戻ってこないように）。
// 端末の時計がずれていても、印は前の印より必ず新しくする
export const resetFamily = (fam: FamilyRecords, now: number): FamilyRecords =>
  ({ version: RECORDS_VERSION, resetAt: Math.max(now, fam.resetAt + 1), children: {} });

export const emptyKeisan = (): KeisanRecord => ({
  stages: {},
  playableThrough: 1,
  testDone: false,
  testProgress: { value: null, at: 0 },
  lastStage: { value: null, at: 0 },
});

export const DEFAULT_SETTINGS: ChildSettings = { name: '', avatar: '', tolerance: 'easy', sound: true, removed: false };

// 子どもの id（8文字）
export function makeChildId(rng: Rng): string {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 8 }, () => abc[Math.floor(rng() * abc.length)]).join('');
}

export function newChild(id: string, settings: Partial<ChildSettings>, now: number): ChildRecord {
  return {
    id,
    createdAt: now,
    settings: { value: { ...DEFAULT_SETTINGS, ...settings, removed: false }, at: now },
    units: {},
    keisan: emptyKeisan(),
    kanji: {},
    kanjiRuns: {},
  };
}

// ---- 家族のデータ ----

export const addChild = (fam: FamilyRecords, child: ChildRecord): FamilyRecords =>
  ({ ...fam, children: { ...fam.children, [child.id]: child } });

// 1人ぶんを更新する（いない子どもなら そのまま）
export function updateChild(fam: FamilyRecords, id: string, f: (c: ChildRecord) => ChildRecord): FamilyRecords {
  const c = fam.children[id];
  return c ? { ...fam, children: { ...fam.children, [id]: f(c) } } : fam;
}

// 消していない子ども（作った順）
export const activeChildren = (fam: FamilyRecords): ChildRecord[] =>
  Object.values(fam.children)
    .filter(c => !c.settings.value.removed)
    .sort((a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

// ---- 子どもの設定 ----

export const updateSettings = (c: ChildRecord, patch: Partial<ChildSettings>, now: number): ChildRecord =>
  ({ ...c, settings: { value: { ...c.settings.value, ...patch }, at: now } });

// 子どもを消す（合わせたときに戻ってこないよう、消した印だけ残す）
export const removeChild = (c: ChildRecord, now: number): ChildRecord => updateSettings(c, { removed: true }, now);

// ---- 単元の進み具合（けいさん以外） ----

// 1回の結果を合わせる（星はベスト、クリアは一度したら残る）
export function recordUnitResult(c: ChildRecord, unitId: string, stars: number, cleared: boolean): ChildRecord {
  const prev = c.units[unitId];
  const next: UnitProgress = {
    stars: Math.max(clampStars(stars), prev ? prev.stars : 0),
    cleared: cleared || (prev ? prev.cleared : false),
  };
  return { ...c, units: { ...c.units, [unitId]: next } };
}

// ---- けいさん ----

const withKeisan = (c: ChildRecord, k: Partial<KeisanRecord>): ChildRecord => ({ ...c, keisan: { ...c.keisan, ...k } });

// ステージを始めたとき（算数練習アプリと同じく、ここで lastStage を入れる）
export const startKeisanStage = (c: ChildRecord, stage: KeisanStage, now: number): ChildRecord =>
  withKeisan(c, { lastStage: { value: stage.id, at: now } });

// ステージを終えたとき。記録・lastStage・playableThrough（クリアしたら）を更新する
export function finishKeisanStage(c: ChildRecord, stage: KeisanStage, correct: number, elapsedSec: number, now: number):
  { child: ChildRecord; cleared: boolean; stars: number; faster: boolean } {
  const { record, cleared, stars, faster } = mergeStageResult(c.keisan.stages[stage.id], stage, correct, elapsedSec);
  const child = withKeisan(c, {
    stages: { ...c.keisan.stages, [stage.id]: record },
    lastStage: { value: stage.id, at: now },
    playableThrough: cleared ? playableAfterClear(c.keisan.playableThrough, stage.num) : c.keisan.playableThrough,
  });
  return { child, cleared, stars, faster };
}

// ちからだめしの途中の記録を入れる（休けいでやめたとき）／消す（はじめからやるとき・使えないとき）
export const setTestProgress = (c: ChildRecord, tp: TestProgress | null, now: number): ChildRecord =>
  withKeisan(c, { testProgress: { value: tp, at: now } });

// ちからだめしが終わったとき（playableThrough は下がらない。途中の記録は消す）
export function finishTest(c: ChildRecord, res: TestResult, now: number): ChildRecord {
  const r = applyTestResult(c.keisan.playableThrough, res);
  return withKeisan(c, {
    playableThrough: r.playableThrough,
    testDone: r.testDone,
    testProgress: { value: null, at: now },
    lastStage: { value: r.lastStage, at: now },
  });
}

// ---- 漢字の書き取り ----

// 1字の結果を入れる（回の中で2回出た字は、最後の結果で1回だけ）。today: 答えた日（ローカル日 YYYY-MM-DD）
export function recordKanjiResult(c: ChildRecord, kanji: string, grade: SelfGrade, today: string, now: number): ChildRecord {
  const card = applyResult(c.kanji[kanji]?.value, grade, today, now);
  return { ...c, kanji: { ...c.kanji, [kanji]: { value: card, at: now } } };
}

// 字 → カード（buildSession に渡す形）
export const kanjiCards = (c: ChildRecord): Record<string, KanjiCard> =>
  Object.fromEntries(Object.entries(c.kanji).map(([k, s]) => [k, s.value]));

// 書き取りの単元 id（星とクリアの記録のキー）
export const KAKITORI_UNIT = 'kanji:kakitori';

// 回をやりきったとき。星1つ・クリアを入れ、この端末の回数を1ふやす（deviceId: 端末の id）
export function finishKanjiRun(c: ChildRecord, deviceId: string): ChildRecord {
  const r = recordUnitResult(c, KAKITORI_UNIT, 1, true);
  return { ...r, kanjiRuns: { ...r.kanjiRuns, [deviceId]: (r.kanjiRuns[deviceId] ?? 0) + 1 } };
}

// やりきった回数（端末ごとの回数の合計）
export const kanjiRunCount = (c: ChildRecord): number => Object.values(c.kanjiRuns).reduce((n, x) => n + x, 0);

// 進み具合: とけた字（一度でも正解した字。卒業もふくむ）と、そつぎょうした字の数
export function kanjiProgress(c: ChildRecord): { solved: number; graduated: number } {
  let solved = 0, graduated = 0;
  for (const { value } of Object.values(c.kanji)) {
    if (value.status !== 'failed') solved++;
    if (value.status === 'graduated') graduated++;
  }
  return { solved, graduated };
}

// ---- 読み込んだデータをそろえる ----
// 形がおかしいところは空・初期値にする。知らない欄は捨てる

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const clampStars = (n: number) => Math.max(0, Math.min(3, Math.floor(n)));
const isTolerance = (v: unknown): v is Tolerance => typeof v === 'string' && v in TOLERANCE;
const numArray = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is number => typeof x === 'number' && Number.isFinite(x)) : []);

function normSettings(v: unknown): ChildSettings {
  const s = isObj(v) ? v : {};
  return {
    name: typeof s.name === 'string' ? s.name : DEFAULT_SETTINGS.name,
    avatar: typeof s.avatar === 'string' ? s.avatar : DEFAULT_SETTINGS.avatar,
    tolerance: isTolerance(s.tolerance) ? s.tolerance : DEFAULT_SETTINGS.tolerance,
    sound: typeof s.sound === 'boolean' ? s.sound : DEFAULT_SETTINGS.sound,
    removed: s.removed === true,
  };
}

function normStamped<T>(v: unknown, norm: (x: unknown) => T): { value: T; at: number } {
  const s = isObj(v) ? v : {};
  return { value: norm(s.value), at: num(s.at) };
}

function normStage(v: unknown): KeisanStageRecord {
  const s = isObj(v) ? v : {};
  return {
    cleared: s.cleared === true,
    stars: clampStars(num(s.stars)),
    bestScore: Math.max(0, num(s.bestScore)),
    bestTime: Math.max(0, num(s.bestTime)), // 0 は記録なし
  };
}

function normTestProgress(v: unknown): TestProgress | null {
  if (!isObj(v)) return null;
  return {
    ladderVersion: num(v.ladderVersion),
    able: numArray(v.able),
    asked: num(v.asked),
    completedSystems: numArray(v.completedSystems),
    tentativeS: typeof v.tentativeS === 'number' ? v.tentativeS : null,
    nextSys: num(v.nextSys),
  };
}

function normKeisan(v: unknown): KeisanRecord {
  const k = isObj(v) ? v : {};
  const stages: Record<string, KeisanStageRecord> = {};
  if (isObj(k.stages)) for (const [id, r] of Object.entries(k.stages)) stages[id] = normStage(r);
  return {
    stages,
    playableThrough: clampPlayableThrough(num(k.playableThrough, 1)),
    testDone: k.testDone === true,
    testProgress: normStamped(k.testProgress, normTestProgress),
    lastStage: normStamped(k.lastStage, x => (typeof x === 'string' ? x : null)),
  };
}

// 形のおかしいカードは null（出題していない字として扱う）
function normKanjiCard(v: unknown): KanjiCard | null {
  if (!isObj(v)) return null;
  const base = { firstSeen: num(v.firstSeen), asked: Math.max(0, Math.floor(num(v.asked))) };
  if (v.status === 'failed') return { ...base, status: 'failed' };
  if (!isDate(v.due) || typeof v.interval !== 'number') return null;
  if (v.status === 'learning' && (v.track === 'A' || v.track === 'B') && LADDER[v.track].includes(v.interval)) {
    return { ...base, status: 'learning', track: v.track, interval: v.interval, due: v.due };
  }
  if (v.status === 'graduated' && (v.interval === GRADUATE_FIRST || v.interval === GRADUATE_NEXT)) {
    return { ...base, status: 'graduated', interval: v.interval, due: v.due };
  }
  return null;
}

function normChild(id: string, v: unknown): ChildRecord {
  const c = isObj(v) ? v : {};
  const units: Record<string, UnitProgress> = {};
  if (isObj(c.units)) {
    for (const [u, p] of Object.entries(c.units)) {
      const o = isObj(p) ? p : {};
      units[u] = { stars: clampStars(num(o.stars)), cleared: o.cleared === true };
    }
  }
  return {
    id,
    createdAt: num(c.createdAt),
    settings: normStamped(c.settings, normSettings),
    units,
    keisan: normKeisan(c.keisan),
    kanji: normKanji(c.kanji),
    kanjiRuns: normRuns(c.kanjiRuns),
  };
}

function normRuns(v: unknown): Record<string, number> {
  const out: Record<string, number> = {};
  if (!isObj(v)) return out;
  for (const [d, n] of Object.entries(v)) if (typeof n === 'number' && Number.isFinite(n) && n > 0) out[d] = Math.floor(n);
  return out;
}

function normKanji(v: unknown): Record<string, { value: KanjiCard; at: number }> {
  const out: Record<string, { value: KanjiCard; at: number }> = {};
  if (!isObj(v)) return out;
  for (const [k, s] of Object.entries(v)) {
    if (!isObj(s)) continue;
    const card = normKanjiCard(s.value);
    if (card) out[k] = { value: card, at: num(s.at) };
  }
  return out;
}

// 版がちがう・形がこわれているときは空のデータにする（旧形式からの移行はしない）
export function normalizeFamily(raw: unknown): FamilyRecords {
  if (!isObj(raw) || raw.version !== RECORDS_VERSION || !isObj(raw.children)) return emptyFamily();
  const children: Record<string, ChildRecord> = {};
  for (const [id, c] of Object.entries(raw.children)) children[id] = normChild(id, c);
  return { version: RECORDS_VERSION, resetAt: Math.max(0, num(raw.resetAt)), children };
}
