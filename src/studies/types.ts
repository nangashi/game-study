import type { Question } from '../learn/types';
import type { Rng } from '../learn/random';

// 学年（'k' = 年長）。道のならびの参考にだけ使い、画面には出さない
export type Grade = 'k' | 1 | 2 | 3;

// 問題の種類（カテゴリ）。問題プール（カード）を持ち、カードから1問を作る
// けいさん（src/learn/keisan/）以外のテーマを足すときの材料として残している
export interface Category {
  id: string;        // 教科の中で一意。後から変えない
  name: string;      // ひらがな
  grade: Grade;
  write?: boolean;   // 手書き
  // ドリル（けいさんりょく）: 時間を計る
  drill?: { length: number };
  // 計算のわく: カードは「要素のわく」で、出すたびに数が変わる
  varied?: boolean;
  cards(): readonly string[];  // 問題プール（やさしい順）
  // level: その問題になれた度合い（0 = はじめて）。書き取りのおてほんの出し方などに使う
  make(card: string, rng: Rng, level?: number): Question;
}

// 勉強（教科）
export interface StudyDef {
  id: string;        // 後から変えない
  name: string;      // ひらがな
  categories: Category[];
}

// くり返し呼ばれるので、問題プールは1回だけ作る
export function once<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}
