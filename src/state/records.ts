import type { Profile } from './types';
import { gradeRank } from './types';
import { mastery } from '../learn/engine';
import { STUDIES } from '../studies/registry';
import type { Category, Selection, StudyDef } from '../studies/types';
import { addDays, rollDaily, touchStreak } from './store';

// 学習の記録（きょうの記録・連続日数・回数）と、記録をもとにした学習の案内。
// コイン・券・ミッションのごほうびは ここでは あつかわない

export const catKey = (study: string, cat: string) => `${study}:${cat}`;

export const isLowerGrade = (p: Profile, sel: Selection) => gradeRank(sel.grade) < gradeRank(p.grade);

// クエストを さいごまでやったときの記録。
// newSubject: きょうはじめての教科として daily.subjects に入れたか（下の学年・ドリルは入れない）
export function finishQuest(p: Profile, sel: Selection, today: string): { newSubject: boolean } {
  rollDaily(p, today);
  touchStreak(p, today);
  let newSubject = false;
  if (!isLowerGrade(p, sel) && !sel.drill && !p.daily.subjects.includes(sel.study)) {
    p.daily.subjects.push(sel.study);
    newSubject = true;
  }
  p.daily.quests++;
  p.stats.quests++;
  return { newSubject };
}

// 正解したカテゴリを きょうの記録（daily.cats）に入れる。次の日に rollDaily で catLast になる。ドリルはのぞく
export function recordCorrect(p: Profile, study: string, cat: Category, today: string): void {
  if (cat.drill) return;
  rollDaily(p, today);
  const key = catKey(study, cat.id);
  p.daily.cats[key] = (p.daily.cats[key] ?? 0) + 1;
}

// ---- ひさしぶりのカテゴリ（学習の案内） ----

export const HISASHIBURI_DAYS = 3;  // これだけの日数やっていないカテゴリが「ひさしぶり」
export const HISASHIBURI_GOAL = 2;  // その日に正解する数
export const HISASHIBURI_SHOW = 3;  // すすめる数

export interface CatRef { study: StudyDef; cat: Category }

// ひさしぶりのカテゴリ（下の学年・ドリル・ぜんぶ おぼえたカテゴリはのぞく）
// catLast はきのうまでの記録なので、きょうやっても外れない
export function isHisashiburi(p: Profile, study: StudyDef, c: Category, today: string): boolean {
  if (c.drill || gradeRank(c.grade) < gradeRank(p.grade)) return false;
  const last = p.catLast[catKey(study.id, c.id)];
  if (last && last > addDays(today, -HISASHIBURI_DAYS)) return false;
  const m = mastery(p, [c], today);
  return m.learned < m.total;
}

// ひさしぶりのカテゴリ。自分の学年 → 上の学年。始めていて やっていない日が長いもの → まだ始めていないもの
export function hisashiburiCats(p: Profile, today: string): CatRef[] {
  const all = STUDIES.flatMap(study => study.categories.filter(c => isHisashiburi(p, study, c, today)).map(cat => ({ study, cat })));
  const last = (x: CatRef) => p.catLast[catKey(x.study.id, x.cat.id)] ?? '9999';
  return all.sort((a, b) => Number(a.cat.grade !== p.grade) - Number(b.cat.grade !== p.grade) || last(a).localeCompare(last(b)));
}

// ひさしぶりのカテゴリのうち、きょういちばん多く正解した数
export const hisashiburiBest = (p: Profile, cats: CatRef[]) =>
  Math.max(0, ...cats.map(x => p.daily.cats[catKey(x.study.id, x.cat.id)] ?? 0));

// えらぶ画面で すすめる ひさしぶりのカテゴリ（たっせいしたら出さない）
export function suggestedCats(p: Profile, today: string): CatRef[] {
  rollDaily(p, today);
  const cats = hisashiburiCats(p, today);
  return cats.length && hisashiburiBest(p, cats) < HISASHIBURI_GOAL ? cats.slice(0, HISASHIBURI_SHOW) : [];
}
