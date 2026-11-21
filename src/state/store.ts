import type { Daily, Grade, Profile, SaveData, Settings } from './types';
import { HEROES, isHero, type HeroId } from '../art';

const KEY = 'manabi-survivor:v1';

export const DEFAULT_SETTINGS: Settings = {
  questLength: 5, drillSlowSec: 5,
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

function newDaily(date: string): Daily {
  return { date, quests: 0, subjects: [], cats: {} };
}

export function newProfile(name: string, avatar: HeroId, grade: Grade): Profile {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name, avatar, grade,
    tolerance: 'easy',
    cards: {},
    daily: newDaily(today()),
    streak: { count: 0, last: '' },
    stats: { quests: 0, correct: 0 },
    catLast: {},
  };
}

function empty(): SaveData {
  return { version: 1, profiles: [], settings: { ...DEFAULT_SETTINGS } };
}

// 古いデータを今の形にそろえる。
// もう使わない欄（コイン・券・ゲーム・ミッションなど）は消さずに そのまま残す
function normalize(d: SaveData): SaveData {
  const out = { ...empty(), ...d, settings: { ...DEFAULT_SETTINGS, ...d.settings } };
  out.profiles.forEach((p, i) => {
    if (!isHero(p.avatar)) p.avatar = HEROES[i % HEROES.length].id;
    p.daily = { ...newDaily(p.daily.date), ...p.daily };
    p.catLast ??= {};
    // 問題の種類ごとのレベルは使わなくなった（カードの定着度で出す順を決める）
    delete (p as Partial<Record<'tracks', unknown>>).tracks;
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

// 日付が変わっていたら「きょう」のカウンタを戻す。前の日の、もう使わない欄（券など）はここで消える
// きのうまでに正解したカテゴリは、ここで最後にやった日（catLast）に入れる
export function rollDaily(p: Profile, now = today()): void {
  if (p.daily.date === now) return;
  for (const [key, n] of Object.entries(p.daily.cats)) if (n > 0) p.catLast[key] = p.daily.date;
  p.daily = newDaily(now);
}

// 連続日数。1日休んでもつながる（おやすみ1日ぶんは許す）
export function touchStreak(p: Profile, now = today()): void {
  if (p.streak.last === now) return;
  const gap = p.streak.last ? daysBetween(p.streak.last, now) : Infinity;
  p.streak.count = gap <= 2 ? p.streak.count + 1 : 1;
  p.streak.last = now;
}
