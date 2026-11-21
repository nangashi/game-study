import type { Tolerance } from '../learn/handwriting/judge';
import type { HeroId } from '../art';

// 'k' = 年長
export type Grade = 'k' | 1 | 2 | 3;

export const GRADES: Grade[] = ['k', 1, 2, 3];
export const gradeRank = (g: Grade) => GRADES.indexOf(g);

// 間隔反復（ライトナー方式）。box が上がるほど次に出るまでの日数が伸びる
// ms: けいさんりょく（ドリル）で最後に答えたときの時間。遅い問題を先に出すのに使う
export interface CardState { box: number; due: string; ms?: number }

// 古い保存データにある コイン・券・ゲームの欄（coins など）は、読み込んでも消さずに残す（型には入れない）
export interface Profile {
  id: string;
  name: string;
  avatar: HeroId;   // 主人公の見た目
  grade: Grade;
  tolerance: Tolerance;
  cards: Record<string, CardState>; // key: 'hira:あ' など
  daily: Daily;
  streak: { count: number; last: string };
  stats: { quests: number; correct: number };
  best?: Record<string, number>;     // ドリルのベスト記録（カテゴリの id → 10問の合計時間 ms）
  catLast: Record<string, string>;   // カテゴリ（'教科:カテゴリ'）の問題に最後に正解した日（きょうより前）
}

// 「きょう」のカウンタ。日付が変わるとリセット
export interface Daily {
  date: string;
  quests: number;
  subjects: string[];                // きょうやった勉強の id
  cats: Record<string, number>;      // カテゴリ（'教科:カテゴリ'）ごとの、きょうの正解数
}

export interface Settings {
  questLength: number;      // 1クエストの問題数
  drillSlowSec: number;     // けいさんりょく: これより遅い正解は「まだ速くない」とみなす（秒）
}

export interface SaveData {
  version: 1;
  profiles: Profile[];
  settings: Settings;
}
