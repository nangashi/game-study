import type { Tolerance } from '../learn/handwriting/judge';
import type { HeroId } from '../art';

// 'k' = 年長
export type Grade = 'k' | 1 | 2 | 3;
export type Subject = 'kokugo' | 'sansu';

export type TrackId =
  | 'hira-write' | 'hira-match'   // 年長〜
  | 'kazu'                        // 年長: かず
  | 'kata-write' | 'kanji-write' | 'kanji-read'
  | 'keisan' | 'tokei';

export interface TrackState { level: number; streak: number; miss: number }

// 間隔反復（ライトナー方式）。box が上がるほど次に出るまでの日数が伸びる
export interface CardState { box: number; due: string }

export type UpgradeId = 'hp' | 'atk' | 'speed' | 'magnet';

export interface Profile {
  id: string;
  name: string;
  avatar: HeroId;   // 主人公の見た目
  grade: Grade;
  tolerance: Tolerance;
  coins: number;
  feathers: number; // こくごで手に入る「ことばの羽」
  stars: number;    // さんすうで手に入る「ひかりの星」
  tickets: number;  // バトル券
  upgrades: Record<UpgradeId, number>;
  tracks: Partial<Record<TrackId, TrackState>>;
  cards: Record<string, CardState>; // key: 'hira:あ' など
  daily: { date: string; quests: number; ticketsEarned: number };
  streak: { count: number; last: string };
  stats: { quests: number; correct: number; runs: number; clears: number; bestKills: number };
}

export interface Settings {
  ticketsPerDay: number;    // 1日にもらえるバトル券の上限
  questLength: number;      // 1クエストの問題数
  runSeconds: number;       // 1回のバトルの長さ
}

export interface SaveData {
  version: 1;
  profiles: Profile[];
  settings: Settings;
}
