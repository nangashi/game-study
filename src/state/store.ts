import type { Daily, GameProgress, Grade, Profile, SaveData, Settings } from './types';
import { HEROES, isHero, type HeroId } from '../art';

const KEY = 'manabi-survivor:v1';

export const DEFAULT_SETTINGS: Settings = {
  ticketMax: 5, playsPerSubject: 1, ticketsPerDay: 4, questLength: 5, drillSlowSec: 5,
};

// 端末のローカル時刻での日付（YYYY-MM-DD）
export function today(now = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

export function addDays(date: string, days: number): string {
  const d = new Date(date + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return today(d);
}

export function daysBetween(a: string, b: string): number {
  return Math.round((new Date(b + 'T00:00:00').getTime() - new Date(a + 'T00:00:00').getTime()) / 86400000);
}

// きょうのカウンタ。ふくしゅうミッションの目標は、その日のはじめに復習の日が来ている問題の数（5まで）
export const REVIEW_GOAL = 5;
function newDaily(p: Pick<Profile, 'cards'>, date: string): Daily {
  const due = Object.values(p.cards).filter(c => c.due <= date).length;
  return { date, quests: 0, ticketsEarned: 0, subjects: [], pending: 0, cats: {}, reviews: 0, reviewGoal: Math.min(REVIEW_GOAL, due), claimed: [] };
}

export function newProfile(name: string, avatar: HeroId, grade: Grade): Profile {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name, avatar, grade,
    tolerance: 'easy',
    coins: 0, tickets: 1,
    games: {},
    cards: {},
    daily: newDaily({ cards: {} }, today()),
    streak: { count: 0, last: '' },
    stats: { quests: 0, correct: 0 },
    catLast: {},
    achieved: {},
  };
}

// ゲームの進みぐあい。はじめて遊ぶゲームなら作る
export function gameProgress(p: Profile, gameId: string): GameProgress {
  return (p.games[gameId] ??= { stage: 0, best: 0, plays: 0, clears: 0, upgrades: {} });
}

function empty(): SaveData {
  return { version: 1, profiles: [], settings: { ...DEFAULT_SETTINGS } };
}

// 羽・星・バトル専用の強化があったころのデータ
interface LegacyProfile {
  feathers?: number; stars?: number;
  upgrades?: Record<string, number>;
  stats: { runs?: number; clears?: number; bestKills?: number };
}

// 古いデータを今の形にそろえる
function normalize(d: SaveData): SaveData {
  const out = { ...empty(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  // ゲームの設定は土台に置かない（サバイバーの長さはゲームの中で決める）
  delete (out.settings as Partial<Record<'runSeconds', number>>).runSeconds;
  // むりょう券はやめた。券に上限がなかったころの1日の上限3（教科2つ）は、ミッションのぶん4にする
  const st = out.settings as Settings & Partial<Record<'freePlaysPerDay', number>>;
  if (d.settings && !('ticketMax' in d.settings) && st.ticketsPerDay === 3) st.ticketsPerDay = DEFAULT_SETTINGS.ticketsPerDay;
  delete st.freePlaysPerDay;
  out.profiles.forEach((p, i) => {
    if (!isHero(p.avatar)) p.avatar = HEROES[i % HEROES.length].id;
    const old = p as Profile & LegacyProfile;
    p.daily = { ...newDaily(p, p.daily.date), ...p.daily };
    p.catLast ??= {};
    p.achieved ??= {};
    // 問題の種類ごとのレベルは使わなくなった（カードの定着度で出す順を決める）
    delete (p as Partial<Record<'tracks', unknown>>).tracks;
    if (!p.games) {
      // 羽と星はコインに換算し、強化とバトルの記録はサバイバーに引きつぐ
      p.coins += (old.feathers ?? 0) + (old.stars ?? 0);
      p.games = { survivor: {
        stage: old.stats.clears ? 1 : 0, best: old.stats.bestKills ?? 0,
        plays: old.stats.runs ?? 0, clears: old.stats.clears ?? 0, upgrades: { ...old.upgrades },
      } };
      delete old.feathers; delete old.stars; delete old.upgrades;
      delete old.stats.runs; delete old.stats.clears; delete old.stats.bestKills;
    }
  });
  return out;
}

let data: SaveData = load();

function load(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return empty();
    return normalize(JSON.parse(raw) as SaveData);
  } catch {
    return empty();
  }
}

export function save(): void {
  try { localStorage.setItem(KEY, JSON.stringify(data)); } catch { /* 保存できない環境でも遊べるようにする */ }
}

export const store = {
  get data() { return data; },
  get settings() { return data.settings; },
  profile(id: string): Profile | undefined { return data.profiles.find(p => p.id === id); },
  addProfile(p: Profile) { data.profiles.push(p); save(); },
  removeProfile(id: string) { data.profiles = data.profiles.filter(p => p.id !== id); save(); },
  exportJson(): string { return JSON.stringify(data, null, 2); },
  importJson(json: string) {
    const d = JSON.parse(json) as SaveData;
    if (d.version !== 1 || !Array.isArray(d.profiles)) throw new Error('形式がちがいます');
    data = normalize(d);
    save();
  },
};

// 日付が変わっていたら「きょう」のカウンタを戻す。受け取らなかった きょうの券は消える
// きのうまでに正解したカテゴリは、ここで最後にやった日（catLast）に入れる
export function rollDaily(p: Profile, now = today()): void {
  if (p.daily.date === now) return;
  for (const [key, n] of Object.entries(p.daily.cats)) if (n > 0) p.catLast[key] = p.daily.date;
  p.daily = newDaily(p, now);
}

// 連続日数。1日休んでもつながる（おやすみ1日ぶんは許す）
export function touchStreak(p: Profile, now = today()): void {
  if (p.streak.last === now) return;
  const gap = p.streak.last ? daysBetween(p.streak.last, now) : Infinity;
  p.streak.count = gap <= 2 ? p.streak.count + 1 : 1;
  p.streak.last = now;
}
