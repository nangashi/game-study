import type { KanjiEntry } from './words';

// 漢字の書き取りの間隔反復（設計は game-study-design/07-kanji-srs.md）。
// 1字＝1カード。出題していない字はカードを持たない（undefined）

// 自己採点: できた／おしい／できなかった
export type SelfGrade = 'correct' | 'close' | 'wrong';
// A: 初見で正解した字、B: 一度でも間違えた字
export type Track = 'A' | 'B';

// 間隔のはしご（日）。最後の段で正解したら卒業
export const LADDER: Record<Track, readonly number[]> = {
  A: [14, 60],
  B: [1, 3, 7, 14, 30, 60],
};
export const GRADUATE_FIRST = 180; // 卒業して最初の復習まで
export const GRADUATE_NEXT = 365;  // 卒業した字を正解したあと

interface CardBase {
  firstSeen: number; // はじめて出した時刻（ms）。未正解の字の並び順に使う
  asked: number;     // 出題回数（結果を受けた回数）。単語の入れ替えに使う
}
export type KanjiCard =
  | (CardBase & { status: 'failed' })                                                  // 出題したが一度も正解していない
  | (CardBase & { status: 'learning'; track: Track; interval: number; due: string })   // 正解済み
  | (CardBase & { status: 'graduated'; interval: number; due: string });               // 卒業（interval は 180 か 365）

// ---- 日付（端末のローカル日 YYYY-MM-DD） ----

const pad = (n: number, w = 2) => String(n).padStart(w, '0');

export const localDate = (d: Date): string => `${pad(d.getFullYear(), 4)}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// 暦の上で n 日後（時差・夏時間の影響を受けないよう UTC で数える）
export function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${pad(t.getUTCFullYear(), 4)}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export const isDate = (v: unknown): v is string =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && addDays(v, 0) === v;

// ---- 遷移 ----

const learning = (base: CardBase, track: Track, interval: number, today: string): KanjiCard =>
  ({ ...base, status: 'learning', track, interval, due: addDays(today, interval) });
const graduated = (base: CardBase, interval: number, today: string): KanjiCard =>
  ({ ...base, status: 'graduated', interval, due: addDays(today, interval) });

// 1字の結果を受けて次の状態を返す（回の中で2回出た字は、最後の結果で1回だけ呼ぶ）。
// missed: 回の中で一度でも「できなかった」か。正解済み・卒業の字は、もう1回で正解しても間違えた扱い。
// 未出題の字は最終結果で決めるが、間違えてから正解した字はトラックAでなくトラックBの3日へ。
// today: 答えた日（ローカル日）、now: 時刻（ms、はじめて出したときの firstSeen に入る）
export function applyResult(card: KanjiCard | undefined, grade: SelfGrade, missed: boolean, today: string, now: number): KanjiCard {
  if (!card) {
    const base = { firstSeen: now, asked: 1 };
    if (grade !== 'correct') return { ...base, status: 'failed' };
    return missed ? learning(base, 'B', 3, today) : learning(base, 'A', LADDER.A[0], today);
  }
  const base = { firstSeen: card.firstSeen, asked: card.asked + 1 };
  if (missed && card.status !== 'failed') grade = 'wrong';
  switch (card.status) {
    case 'failed':
      return grade === 'correct' ? learning(base, 'B', 3, today) : { ...base, status: 'failed' };
    case 'learning': {
      if (grade === 'close') return { ...card, ...base }; // 段階も日付も据え置き（期限は過ぎたまま）
      if (grade === 'wrong') return learning(base, 'B', card.interval <= 7 ? 1 : 3, today);
      const ladder = LADDER[card.track];
      const i = ladder.indexOf(card.interval);
      return i >= 0 && i + 1 < ladder.length
        ? learning(base, card.track, ladder[i + 1], today)
        : graduated(base, GRADUATE_FIRST, today);
    }
    case 'graduated':
      if (grade === 'close') return { ...card, ...base };
      if (grade === 'wrong') return learning(base, 'B', 7, today);
      return graduated(base, GRADUATE_NEXT, today);
  }
}

// ---- 回（セッション）を組む ----

export const SESSION_SIZE = 10;
export const REVIEW_MAX = 5;

export type SessionKind = 'review' | 'failed' | 'new'; // 復習／未正解の字／未出題の字
export interface SessionItem {
  kanji: string;
  word: string; // 出す単語（[ ] つき）
  kind: SessionKind;
}

// 単語は出題回数で入れ替える
export const wordFor = (entry: KanjiEntry, card: KanjiCard | undefined): string =>
  entry.words[(card ? card.asked : 0) % entry.words.length];

// 10問を組む。
// 1. 期限（due <= today）の来た正解済み・卒業の字を最大5問（卒業でない字が先: 間隔の小さい順→期限を過ぎた日数の多い順。卒業の字は枠が余ったときだけ）
// 2. 残りを 未正解の字（はじめて出した順）→ 未出題の字（データ順）で埋める
// entries は出題の候補（データ順。全部なら ALL_KANJI）。字が足りなければ10問より少なくなる
export function buildSession(
  cards: Readonly<Record<string, KanjiCard>>,
  today: string,
  entries: readonly KanjiEntry[],
  size = SESSION_SIZE,
  reviewMax = REVIEW_MAX,
): SessionItem[] {
  const order = new Map(entries.map((e, i) => [e.kanji, i]));
  const byOrder = (a: KanjiEntry, b: KanjiEntry) => order.get(a.kanji)! - order.get(b.kanji)!;
  const learningDue: [KanjiEntry, Extract<KanjiCard, { status: 'learning' }>][] = [];
  const graduatedDue: [KanjiEntry, Extract<KanjiCard, { status: 'graduated' }>][] = [];
  const failed: [KanjiEntry, KanjiCard][] = [];
  const unseen: KanjiEntry[] = [];
  for (const e of entries) {
    const c = cards[e.kanji];
    if (!c) unseen.push(e);
    else if (c.status === 'failed') failed.push([e, c]);
    else if (c.due > today) continue;
    else if (c.status === 'learning') learningDue.push([e, c]);
    else graduatedDue.push([e, c]);
  }
  // YYYY-MM-DD は文字列の大小が日付の前後と同じ。期限が古いほど過ぎた日数が多い
  learningDue.sort(([ea, a], [eb, b]) => a.interval - b.interval || cmp(a.due, b.due) || byOrder(ea, eb));
  graduatedDue.sort(([ea, a], [eb, b]) => cmp(a.due, b.due) || byOrder(ea, eb));
  failed.sort(([ea, a], [eb, b]) => a.firstSeen - b.firstSeen || byOrder(ea, eb));

  const items: SessionItem[] = [];
  const add = (e: KanjiEntry, kind: SessionKind) => items.push({ kanji: e.kanji, word: wordFor(e, cards[e.kanji]), kind });
  for (const [e] of [...learningDue, ...graduatedDue].slice(0, Math.min(reviewMax, size))) add(e, 'review');
  for (const [e] of failed) if (items.length < size) add(e, 'failed');
  for (const e of unseen) if (items.length < size) add(e, 'new');
  return items;
}

const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);
