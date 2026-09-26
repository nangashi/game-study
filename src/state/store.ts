import type { GameProgress, Grade, Profile, SaveData, Settings } from './types';
import { HEROES, isHero, type HeroId } from '../art';

const KEY = 'manabi-survivor:v1';

export const DEFAULT_SETTINGS: Settings = {
  freePlaysPerDay: 0, playsPerSubject: 1, ticketsPerDay: 3, questLength: 5, drillSlowSec: 5,
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

export function newProfile(name: string, avatar: HeroId, grade: Grade): Profile {
  return {
    id: Math.random().toString(36).slice(2, 10),
    name, avatar, grade,
    tolerance: 'easy',
    coins: 0, tickets: 1,
    games: {},
    cards: {},
    daily: { date: today(), quests: 0, ticketsEarned: 0, subjects: [] },
    streak: { count: 0, last: '' },
    stats: { quests: 0, correct: 0 },
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
  out.profiles.forEach((p, i) => {
    if (!isHero(p.avatar)) p.avatar = HEROES[i % HEROES.length].id;
    const old = p as Profile & LegacyProfile;
    p.daily.subjects ??= [];
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

// 日付が変わっていたら「きょう」のカウンタを戻し、むりょうのゲーム券をくばる
export function rollDaily(p: Profile, s: Settings, now = today()): void {
  if (p.daily.date === now) return;
  p.daily = { date: now, quests: 0, ticketsEarned: 0, subjects: [] };
  p.tickets += s.freePlaysPerDay;
}

// 連続日数。1日休んでもつながる（おやすみ1日ぶんは許す）
export function touchStreak(p: Profile, now = today()): void {
  if (p.streak.last === now) return;
  const gap = p.streak.last ? daysBetween(p.streak.last, now) : Infinity;
  p.streak.count = gap <= 2 ? p.streak.count + 1 : 1;
  p.streak.last = now;
}
