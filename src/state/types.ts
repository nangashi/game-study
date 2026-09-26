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

// ゲームごとの進みぐあい（docs/03-rewards-and-games.md）
export interface GameProgress {
  stage: number;                     // クリアした一番先のステージ（0 = まだ）
  best: number;                      // ベスト記録（ゲームごとの意味: サバイバーは倒した数）
  plays: number;
  clears: number;
  upgrades: Record<string, number>;  // 強化の id → レベル
}

export interface Profile {
  id: string;
  name: string;
  avatar: HeroId;   // 主人公の見た目
  grade: Grade;
  tolerance: Tolerance;
  coins: number;
  tickets: number;  // ゲーム券（全ゲーム共通）
  games: Record<string, GameProgress>; // key: ゲームの id
  tracks: Partial<Record<TrackId, TrackState>>;
  cards: Record<string, CardState>; // key: 'hira:あ' など
  daily: { date: string; quests: number; ticketsEarned: number; subjects: Subject[] };
  streak: { count: number; last: string };
  stats: { quests: number; correct: number };
}

export interface Settings {
  freePlaysPerDay: number;  // 毎日むりょうでもらえるゲーム券
  playsPerSubject: number;  // その日はじめてやった教科ごとにもらえるゲーム券
  ticketsPerDay: number;    // 勉強でもらえるゲーム券の1日の上限
  questLength: number;      // 1クエストの問題数
  runSeconds: number;       // 1回のバトルの長さ
}

export interface SaveData {
  version: 1;
  profiles: Profile[];
  settings: Settings;
}
