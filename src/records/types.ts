import type { Tolerance } from '../learn/handwriting/judge';
import type { KeisanStageRecord, TestProgress } from '../learn/keisan';
import type { KanjiCard } from '../learn/kanji/srs';

// 新しい記録の形（docs/04-records.md）。家族で1つのデータに、子どもごとの記録が入る

export const RECORDS_VERSION = 2;

// 更新時刻つきの値。端末どうしで合わせるとき、あとから保存した方が勝つ
export interface Stamped<T> { value: T; at: number } // at: 更新時刻（ms）

// 子どもの設定（まとめて後勝ち）。removed: 子どもを消した印（合わせたときに復活しないように残す）
export interface ChildSettings {
  name: string;
  avatar: string;
  tolerance: Tolerance;  // 書き取りの許容度
  sound: boolean;        // 音のオン／オフ
  removed: boolean;
}

// 単元の進み具合（けいさん以外。けいさんは KeisanRecord.stages）
export interface UnitProgress {
  stars: number;    // ベスト（0〜3）
  cleared: boolean;
}

// けいさんの記録（算数練習アプリの records[i] と同じ中身）
export interface KeisanRecord {
  stages: Record<string, KeisanStageRecord>;     // ステージ id（'s1' など）→ 記録
  playableThrough: number;                       // 1〜48
  testDone: boolean;                             // ちからだめしを一度さいごまでやった
  testProgress: Stamped<TestProgress | null>;    // ちからだめしの途中の記録
  lastStage: Stamped<string | null>;             // さいごにあそんだステージ（つづきから用）
}

export interface ChildRecord {
  id: string;
  createdAt: number;               // ならび順に使う
  settings: Stamped<ChildSettings>;
  units: Record<string, UnitProgress>; // 単元 id → 進み具合
  keisan: KeisanRecord;
  // 漢字の書き取りのカード（字 → 状態と更新時刻）。出題していない字は持たない。合わせるときは字ごとに後勝ち
  kanji: Record<string, Stamped<KanjiCard>>;
}

export interface FamilyRecords {
  version: typeof RECORDS_VERSION;
  // 全消しの印（ms、0 は一度も消していない）。合わせるときは、これより古い控えの進み具合を持ち込まない
  resetAt: number;
  children: Record<string, ChildRecord>; // 子どもの id → 記録
}
