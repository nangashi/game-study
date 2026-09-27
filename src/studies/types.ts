import type { IconName } from '../art';
import type { Question } from '../learn/types';
import type { Rng } from '../learn/random';
import type { Grade, Profile } from '../state/types';

// 問題の種類（カテゴリ）。問題プール（カード）を持ち、カードから1問を作る
export interface Category {
  id: string;        // 教科の中で一意。後から変えない
  name: string;      // ひらがな
  grade: Grade;
  write?: boolean;   // 手書き（まぜこぜでは1回に出す数をおさえる）
  quiz?: boolean;    // すぐ答えられる3択にできる（ゲームの中のクイズで使う）
  // ドリル（けいさんりょく）: 時間を計り、遅い問題を先に出す。まぜこぜには入れない
  drill?: { length: number };
  // 計算のわく: カードは「要素のわく」で、出すたびに数が変わる（docs/03-rewards-and-games.md）
  varied?: boolean;
  cards(): readonly string[];  // 問題プール。まだやっていない問題はこの順に出す（やさしい順）
  make(card: string, rng: Rng, p: Profile): Question;
}

// 勉強（教科）。ホームのボタンと、ゲーム券の「きょうはじめての教科」の単位になる
// 足しかたは docs/03-rewards-and-games.md の「新しい勉強を足すときの手順」
export interface StudyDef {
  id: string;        // 保存データのキーになるので後から変えない
  name: string;      // ひらがな
  icon: IconName;
  color: string;     // ボタンの色
  categories: Category[];
}

// えらんだ勉強。category がないときは、その学年の「まぜこぜ」。drill: けいさんりょく（ドリル）のカテゴリ
export interface Selection { study: string; grade: Grade; category?: string; drill?: boolean }

// くり返し呼ばれるので、問題プールは1回だけ作る
export function once<T>(f: () => T): () => T {
  let v: T | undefined;
  return () => (v ??= f());
}
