import type { Tolerance } from '../learn/handwriting/judge';
import type { HeroId } from '../art';

// 'k' = 年長
export type Grade = 'k' | 1 | 2 | 3;

export const GRADES: Grade[] = ['k', 1, 2, 3];
export const gradeRank = (g: Grade) => GRADES.indexOf(g);

// 間隔反復（ライトナー方式）。box が上がるほど次に出るまでの日数が伸びる
// ms: けいさんりょく（ドリル）で最後に答えたときの時間。遅い問題を先に出すのに使う
export interface CardState { box: number; due: string; ms?: number }

// ゲームごとの進みぐあい（docs/03-rewards-and-games.md）
export interface GameProgress {
  stage: number;                     // クリアした一番先のステージ（0 = まだ）
  best: number;                      // ベスト記録（ゲームごとの意味: サバイバーは倒した数）
  plays: number;
  clears: number;
  upgrades: Record<string, number>;  // 強化の id → レベル
  data?: unknown;                    // ゲームだけが使う小さな保存データ（えらんだキャラなど）
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
  cards: Record<string, CardState>; // key: 'hira:あ' など
  daily: { date: string; quests: number; ticketsEarned: number; subjects: string[] }; // subjects: きょうやった勉強の id
  streak: { count: number; last: string };
  stats: { quests: number; correct: number };
  best?: Record<string, number>;     // ドリルのベスト記録（カテゴリの id → 10問の合計時間 ms）
}

export interface Settings {
  freePlaysPerDay: number;  // 毎日むりょうでもらえるゲーム券
  playsPerSubject: number;  // その日はじめてやった教科（勉強）ごとにもらえるゲーム券
  ticketsPerDay: number;    // 勉強でもらえるゲーム券の1日の上限
  questLength: number;      // 1クエストの問題数
  drillSlowSec: number;     // けいさんりょく: これより遅い正解は「まだ速くない」とみなす（秒）
}

export interface SaveData {
  version: 1;
  profiles: Profile[];
  settings: Settings;
}
