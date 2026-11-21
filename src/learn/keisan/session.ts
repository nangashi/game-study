import type { Rng } from '../random';
import type { Gen, KeisanQuestion } from './generators';
import { STAGE_COUNT, stageByNum, type KeisanStage } from './stages';

// ステージを1回あそぶときの決まり（10問・星・クリア・記録の更新）。算数練習アプリと同じ

export const SET_SIZE = 10;
export const CLEAR_LINE = 8;         // 8問以上でクリア
export const MAX_INPUT_DIGITS = 4;   // 答えの入力は4けたまで
// 答えたあと次の問題までの待ち(ms)。経過時間には待ちもふくむ
export const FEEDBACK_MS = { correct: 500, wrong: 1100 } as const;
export const FEEDBACK_MS_REDUCED = { correct: 250, wrong: 500 } as const; // 動きを減らす設定のとき

// 10問のセット。問題文がかぶらないようにする（300回試してもそろわなければ、かぶりを許して埋める）
export function makeSet(gen: Gen, rng: Rng): KeisanQuestion[] {
  const qs: KeisanQuestion[] = [];
  const seen = new Set<string>();
  let guard = 0;
  while (qs.length < SET_SIZE && guard < 300) {
    guard++;
    const q = gen(rng);
    if (seen.has(q.text)) continue;
    seen.add(q.text);
    qs.push(q);
  }
  while (qs.length < SET_SIZE) qs.push(gen(rng));
  return qs;
}

// 数字キーの入力（先頭の0はおきかえる。4けたをこえたら受けつけない）
export function typeDigit(input: string, digit: string): string {
  if (input.length >= MAX_INPUT_DIGITS) return input;
  if (input === '0') return digit;
  return input + digit;
}

// 星: 8問→★1、9問→★2、10問→★3。8問より少ないと0でクリアなし
export function judgeScore(correct: number): { cleared: boolean; stars: number } {
  const cleared = correct >= CLEAR_LINE;
  const stars = correct >= 10 ? 3 : correct === 9 ? 2 : correct === 8 ? 1 : 0;
  return { cleared, stars };
}

// ステージの記録（算数練習アプリの records[i].stages[id] と同じ形）
export interface KeisanStageRecord {
  cleared: boolean;
  stars: number;      // ベスト（0〜3）
  bestScore: number;  // ベストの正解数
  bestTime: number;   // ベストタイム（秒）。クリアできなかった回でも更新する
}

// 1回の結果を記録に合わせる。faster: 前のベストより速くクリアした（筆算ステージでは出さない）
export function mergeStageResult(
  prev: KeisanStageRecord | null | undefined,
  stage: KeisanStage,
  correct: number,
  elapsedSec: number,
): { record: KeisanStageRecord; cleared: boolean; stars: number; faster: boolean } {
  const { cleared, stars } = judgeScore(correct);
  const record: KeisanStageRecord = {
    cleared: cleared || (prev ? prev.cleared : false),
    stars: Math.max(stars, prev ? prev.stars : 0),
    bestScore: Math.max(correct, prev ? prev.bestScore : 0),
    bestTime: prev && prev.bestTime ? Math.min(prev.bestTime, elapsedSec) : elapsedSec,
  };
  const faster = !!(cleared && prev && prev.bestTime && elapsedSec < prev.bestTime && !stage.paper);
  return { record, cleared, stars, faster };
}

// ---- どこまで遊べるか（playableThrough）----
// playableThrough 以下のステージは警告なしで遊べる。48 は「ぜんぶクリア」。
// 先のステージも警告つきで挑戦でき、クリアすればそこまでが解放される

export const clampPlayableThrough = (pt: number | undefined) => Math.max(1, Math.min(STAGE_COUNT + 1, pt || 1));

// クリアしたら、そのステージ以下は全部解放され、次が警告なしで遊べる
export const playableAfterClear = (pt: number | undefined, stageNum: number) =>
  Math.max(pt || 1, Math.min(STAGE_COUNT + 1, stageNum + 1));

export const isPlayable = (stage: KeisanStage, pt: number | undefined, cleared: boolean) =>
  cleared || stage.num <= clampPlayableThrough(pt);

// 「つづきから」で始めるステージ。ぜんぶクリアなら null
export function continueTarget(pt: number | undefined): KeisanStage | null {
  const p = clampPlayableThrough(pt);
  return p > STAGE_COUNT ? null : stageByNum(p);
}

export const nextStageOf = (stage: KeisanStage): KeisanStage | null =>
  stage.num < STAGE_COUNT ? stageByNum(stage.num + 1) : null;
