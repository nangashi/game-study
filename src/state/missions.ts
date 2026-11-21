import type { Profile, Settings } from './types';
import { GRADES, gradeRank, type Grade } from './types';
import { mastery, selectedCategories } from '../learn/engine';
import { STUDIES } from '../studies/registry';
import type { Category, StudyDef } from '../studies/types';
import { rollDaily } from './store';
import { HISASHIBURI_GOAL, hisashiburiBest, hisashiburiCats, recordCorrect } from './records';

// ミッションとゲーム券の受け取り（docs/03-rewards-and-games.md の「ゲーム券」）

// 券入れに空きがあるか / きょう、まだ券がもらえるか
export const hasRoom = (p: Profile, s: Settings) => p.tickets < s.ticketMax;
export const todayLeft = (p: Profile, s: Settings) => Math.max(0, s.ticketsPerDay - p.daily.ticketsEarned);

// 答えを1つ記録する（正解したときだけ呼ぶ。おてほん・さいごのやりなおし・ドリルはのぞく）
// review: 答える前に、復習の日が来ていた問題
export function noteCorrect(p: Profile, study: string, cat: Category, review: boolean, today: string): void {
  if (cat.drill) return;
  recordCorrect(p, study, cat, today);
  if (review) p.daily.reviews++;
}

// ---- きょうのミッション ----

export type DailyId = 'hisashiburi' | 'fukushu';
export interface DailyMission { id: DailyId; progress: number; goal: number; done: boolean; claimed: boolean }
// きょうのミッション。できないもの（ひさしぶりのカテゴリがない・復習がない）は出さない
// ひさしぶりのカテゴリは records.ts（学習の案内）
export function dailyMissions(p: Profile, today: string): DailyMission[] {
  rollDaily(p, today);
  const d = p.daily;
  const make = (id: DailyId, progress: number, goal: number): DailyMission =>
    ({ id, progress: Math.min(progress, goal), goal, done: progress >= goal, claimed: d.claimed.includes(id) });
  const out: DailyMission[] = [];
  const cats = hisashiburiCats(p, today);
  if (cats.length) out.push(make('hisashiburi', hisashiburiBest(p, cats), HISASHIBURI_GOAL));
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
// 下の学年はのぞく（はじめての正解で すぐ おぼえた になるので、かんたんな問題で券を集められないように）
export function checkAchievements(p: Profile, today: string): string[] {
  const ids: string[] = [];
  const full = (cats: Category[]) => { const m = mastery(p, cats, today); return m.total > 0 && m.learned === m.total; };
  const lower = (g: Grade) => gradeRank(g) < gradeRank(p.grade);
  for (const study of STUDIES) {
    for (const c of study.categories) if (!c.drill && !lower(c.grade) && full([c])) ids.push(`cat:${study.id}:${c.id}`);
    for (const g of GRADES.filter(g => !lower(g))) {
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
