import type { Profile, Settings } from './types';
import { GRADES, gradeRank, type Grade } from './types';
import { mastery, selectedCategories } from '../learn/engine';
import { STUDIES } from '../studies/registry';
import type { Category, StudyDef } from '../studies/types';
import { addDays, rollDaily } from './store';

// ミッションとゲーム券の受け取り（docs/03-rewards-and-games.md の「ゲーム券」）

export const HISASHIBURI_DAYS = 3;  // これだけの日数やっていないカテゴリが「ひさしぶり」
export const HISASHIBURI_GOAL = 2;  // その日に正解する数

export const catKey = (study: string, cat: string) => `${study}:${cat}`;

// 券入れに空きがあるか / きょう、まだ券がもらえるか
export const hasRoom = (p: Profile, s: Settings) => p.tickets < s.ticketMax;
export const todayLeft = (p: Profile, s: Settings) => Math.max(0, s.ticketsPerDay - p.daily.ticketsEarned);

// 答えを1つ記録する（正解したときだけ呼ぶ。おてほん・さいごのやりなおし・ドリルはのぞく）
// review: 答える前に、復習の日が来ていた問題
export function noteCorrect(p: Profile, study: string, cat: Category, review: boolean, today: string): void {
  if (cat.drill) return;
  rollDaily(p, today);
  const key = catKey(study, cat.id);
  p.daily.cats[key] = (p.daily.cats[key] ?? 0) + 1;
  if (review) p.daily.reviews++;
}

// ---- きょうのミッション ----

export type DailyId = 'hisashiburi' | 'fukushu';
export interface DailyMission { id: DailyId; progress: number; goal: number; done: boolean; claimed: boolean }
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

// ミッションの画面とえらぶ画面で すすめる ひさしぶりのカテゴリ（たっせいしたら出さない）
export const HISASHIBURI_SHOW = 3;
export function suggestedCats(p: Profile, today: string): CatRef[] {
  return dailyMissions(p, today).some(m => m.id === 'hisashiburi' && !m.done) ? hisashiburiCats(p, today).slice(0, HISASHIBURI_SHOW) : [];
}

// きょうのミッション。できないもの（ひさしぶりのカテゴリがない・復習がない）は出さない
export function dailyMissions(p: Profile, today: string): DailyMission[] {
  rollDaily(p, today);
  const d = p.daily;
  const make = (id: DailyId, progress: number, goal: number): DailyMission =>
    ({ id, progress: Math.min(progress, goal), goal, done: progress >= goal, claimed: d.claimed.includes(id) });
  const out: DailyMission[] = [];
  const cats = hisashiburiCats(p, today);
  if (cats.length) out.push(make('hisashiburi', Math.max(0, ...cats.map(x => d.cats[catKey(x.study.id, x.cat.id)] ?? 0)), HISASHIBURI_GOAL));
  if (d.reviewGoal > 0) out.push(make('fukushu', d.reviews, d.reviewGoal));
  return out;
}

// ---- たっせいミッション ----

// 連続日数: 3・7日、そのあと7日ごと
export const streakMilestones = (count: number) =>
  [3, 7, ...Array.from({ length: Math.max(0, Math.floor(count / 7) - 1) }, (_, i) => 14 + 7 * i)].filter(n => n <= count);

export type Achievement =
  | { id: string; kind: 'cat'; study: StudyDef; cat: Category }
  | { id: string; kind: 'grade'; study: StudyDef; grade: Grade }
  | { id: string; kind: 'streak'; days: number };

export function achievement(id: string): Achievement | undefined {
  const [kind, a, b] = id.split(':');
  if (kind === 'streak') return { id, kind, days: Number(a) };
  const study = STUDIES.find(x => x.id === a);
  if (!study) return undefined;
  if (kind === 'cat') { const cat = study.categories.find(c => c.id === b); return cat && { id, kind, study, cat }; }
  if (kind === 'grade') { const grade = GRADES.find(g => String(g) === b); return grade != null ? { id, kind, study, grade } : undefined; }
  return undefined;
}

// 新しく たっせいしたものを記録して返す（一度たっせいしたら、おぼえた が減っても消さない）
export function checkAchievements(p: Profile, today: string): string[] {
  const ids: string[] = [];
  const full = (cats: Category[]) => { const m = mastery(p, cats, today); return m.total > 0 && m.learned === m.total; };
  for (const study of STUDIES) {
    for (const c of study.categories) if (!c.drill && full([c])) ids.push(`cat:${study.id}:${c.id}`);
    for (const g of GRADES) {
      const cats = selectedCategories(study, { study: study.id, grade: g });
      if (cats.length && full(cats)) ids.push(`grade:${study.id}:${g}`);
    }
  }
  for (const n of streakMilestones(p.streak.count)) ids.push(`streak:${n}`);
  const opened = ids.filter(id => !p.achieved[id]);
  for (const id of opened) p.achieved[id] = 'open';
  return opened;
}

export const openAchievements = (p: Profile) =>
  Object.entries(p.achieved).filter(([, v]) => v === 'open').map(([id]) => id);

// ---- 受け取る ----

export function claimPending(p: Profile, s: Settings, today: string): boolean {
  rollDaily(p, today);
  if (p.daily.pending <= 0 || !hasRoom(p, s)) return false;
  p.daily.pending--;
  p.tickets++;
  return true;
}

export function claimDaily(p: Profile, s: Settings, id: DailyId, today: string): boolean {
  const m = dailyMissions(p, today).find(x => x.id === id);
  if (!m?.done || m.claimed || !hasRoom(p, s) || !todayLeft(p, s)) return false;
  p.daily.claimed.push(id);
  p.daily.ticketsEarned++;
  p.tickets++;
  return true;
}

export function claimAchievement(p: Profile, s: Settings, id: string): boolean {
  if (p.achieved[id] !== 'open' || !hasRoom(p, s)) return false;
  p.achieved[id] = 'claimed';
  p.tickets++;
  return true;
}

// 受け取れるものの数（ホームのバッジ）。満タンでも数える
export function claimableCount(p: Profile, s: Settings, today: string): number {
  const daily = dailyMissions(p, today).filter(m => m.done && !m.claimed).length;
  return p.daily.pending + Math.min(daily, todayLeft(p, s)) + openAchievements(p).length;
}
