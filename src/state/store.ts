import type { Grade, Profile, SaveData, Settings } from './types';
import { HEROES, isHero, type HeroId } from '../art';

const KEY = 'manabi-survivor:v1';

export const DEFAULT_SETTINGS: Settings = { ticketsPerDay: 3, questLength: 5, runSeconds: 180 };

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

export function newProfile(name: string, avatar: HeroId, grade: Grade): Profile {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name, avatar, grade,
    tolerance: 'easy',
    coins: 0, feathers: 0, stars: 0, tickets: 1,
    upgrades: { hp: 0, atk: 0, speed: 0, magnet: 0 },
    tracks: {}, cards: {},
    daily: { date: today(), quests: 0, ticketsEarned: 0 },
    streak: { count: 0, last: '' },
    stats: { quests: 0, correct: 0, runs: 0, clears: 0, bestKills: 0 },
  };
}

function empty(): SaveData {
  return { version: 1, profiles: [], settings: { ...DEFAULT_SETTINGS } };
}

// 古いデータ（アバターが絵文字だったころ）を今の形にそろえる
function normalize(d: SaveData): SaveData {
  const out = { ...empty(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  out.profiles.forEach((p, i) => { if (!isHero(p.avatar)) p.avatar = HEROES[i % HEROES.length].id; });
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

// 日付が変わっていたら「きょう」のカウンタを戻す
export function rollDaily(p: Profile, now = today()): void {
  if (p.daily.date !== now) p.daily = { date: now, quests: 0, ticketsEarned: 0 };
}

// 連続日数。1日休んでもつながる（おやすみ1日ぶんは許す）
export function touchStreak(p: Profile, now = today()): void {
  if (p.streak.last === now) return;
  const gap = p.streak.last ? daysBetween(p.streak.last, now) : Infinity;
  p.streak.count = gap <= 2 ? p.streak.count + 1 : 1;
  p.streak.last = now;
}
