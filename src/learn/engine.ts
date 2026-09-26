import type { Profile } from '../state/types';
import { gradeRank } from '../state/types';
import type { Category, Selection, StudyDef } from '../studies/types';
import type { Answer, Question } from './types';
import { shuffle, type Rng } from './random';
import { cardCoins, updateCard } from './srs';

// 問題の選び方（Anki と同じ考え方。docs/03-rewards-and-games.md）
// 1. 復習の日が来た問題（定着していないもの・期限が古いものから）
// 2. まだやっていない問題（カテゴリの中のやさしい順。まぜこぜではカテゴリを順番に）
// 3. 足りなければ、復習の日がまだ来ていない問題

export const NEW_PER_SET = 2;   // 復習がたまっていても、新しい問題はこれだけ入れる

export interface Pick { cat: Category; card: string; review: boolean }
export interface SetItem { cat: Category; q: Question; retry?: boolean }

// えらんだカテゴリ（まぜこぜなら、その学年のカテゴリぜんぶ）
export function selectedCategories(study: StudyDef, sel: Selection): Category[] {
  return study.categories.filter(c => (sel.category ? c.id === sel.category : c.grade === sel.grade));
}

export function planSet(study: StudyDef, p: Profile, sel: Selection, length: number, today: string): Pick[] {
  const cats = selectedCategories(study, sel);
  const mixed = !sel.category;
  // 自分の学年のまぜこぜには、下の学年の「始めていて、復習の日が来た問題」もまぜる（コインは減らさない）
  const reviewCats = mixed && sel.grade === p.grade
    ? [...cats, ...study.categories.filter(c => gradeRank(c.grade) < gradeRank(p.grade))]
    : cats;
  return plan(p, cats, reviewCats, mixed, length, today);
}

function plan(p: Profile, cats: Category[], reviewCats: Category[], mixed: boolean, length: number, today: string): Pick[] {
  const seen = new Set<string>();
  const due: Pick[] = [], ahead: Pick[] = [];
  const fresh: Pick[][] = [];
  for (const cat of reviewCats) {
    const mine = cats.includes(cat);
    const f: Pick[] = [];
    for (const card of cat.cards()) {
      if (seen.has(card)) continue;
      seen.add(card);
      const s = p.cards[card];
      if (!s) { if (mine) f.push({ cat, card, review: false }); } else if (s.due <= today) due.push({ cat, card, review: true });
      else if (mine) ahead.push({ cat, card, review: true });
    }
    if (f.length) fresh.push(f);
  }
  const state = (x: Pick) => p.cards[x.card]!;
  const byNeed = (a: Pick, b: Pick) => state(a).box - state(b).box || state(a).due.localeCompare(state(b).due);
  due.sort(byNeed);
  ahead.sort(byNeed);
  // まぜこぜでは、新しい問題をカテゴリから順番に1つずつとる
  const freshList: Pick[] = [];
  for (let i = 0; fresh.some(f => i < f.length); i++) for (const f of fresh) if (i < f.length) freshList.push(f[i]);

  // まぜこぜでは、1つのカテゴリと手書きがかたよらないようにする
  const perCat = Math.max(2, Math.ceil(length / 2));
  const writeCap = Math.max(1, Math.floor(length * 0.4));
  const out: Pick[] = [];
  const taken = new Set<string>();
  const fits = (x: Pick) => !mixed
    || (out.filter(o => o.cat === x.cat).length < perCat && (!x.cat.write || out.filter(o => o.cat.write).length < writeCap));
  const take = (list: Pick[], upTo: number, strict: boolean) => {
    for (const x of list) {
      if (out.length >= upTo) return;
      if (!taken.has(x.card) && (!strict || fits(x))) { out.push(x); taken.add(x.card); }
    }
  };
  const reserve = Math.min(NEW_PER_SET, freshList.length);
  for (const strict of [true, false]) {
    take(due, length - reserve, strict);
    take(freshList, length, strict);
    take(due, length, strict);
    take(ahead, length, strict);
  }
  return out;
}

// 問題を作る。まぜこぜでは、同じカテゴリが続かないようにならべる
export function buildSet(rng: Rng, study: StudyDef, p: Profile, sel: Selection, length: number, today: string): SetItem[] {
  const picks = shuffle(rng, planSet(study, p, sel, length, today));
  for (let i = 1; i < picks.length; i++) {
    if (picks[i].cat !== picks[i - 1].cat) continue;
    const j = picks.findIndex((x, k) => k > i && x.cat !== picks[i - 1].cat);
    if (j > 0) [picks[i], picks[j]] = [picks[j], picks[i]];
  }
  return picks.map(x => ({ cat: x.cat, q: x.cat.make(x.card, rng, p) }));
}

// 1つのカテゴリから1問（ゲームの中のクイズ用）
export function pickOne(p: Profile, cat: Category, today: string): string {
  return plan(p, [cat], [cat], false, 1, today)[0]?.card ?? cat.cards()[0];
}

// 答えを記録する。もどり値はこの問題のコイン（倍率をかける前。docs/03-rewards-and-games.md）
// retry: まちがえた問題を、同じセットの最後にもう一度出したもの（コインなし）
export function applyAnswer(p: Profile, q: Question, a: Answer, today: string, retry = false): number {
  const good = a.correct && !a.helped;
  const coins = retry ? 0 : good ? cardCoins(p.cards[q.card], today) : a.correct ? 1 : 0;
  updateCard(p, q.card, good, today);
  if (a.correct) p.stats.correct++;
  return coins;
}
