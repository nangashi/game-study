import type { Rng } from '../random';
import type { KeisanQuestion } from './generators';
import { STAGE_COUNT, stageByNum } from './stages';

// ちからだめし（登っていく階段方式）。算数練習アプリの仕組みを、画面から切り離して移したもの（docs/03-keisan.md）
//   系統順: たし算(くふう含む) → ひき算 → かけ算 → わり算。各系統は一番易しい段から登る。
//   1段の採点は2問（1問正解なら3問目、3問中2問で合格）。
//   2段続けて全問正解（3問目なし）で合格したら、次は2段先へ進む。
//   2段先で不合格なら、飛ばした1段だけを試してから系統を終える。
//   歩幅1段で不合格なら、その系統は終了（上限＝最後に合格した段）。
//   上限が決まったら締めの1問を出し（まちがえたら1段下からもう1問）、系統を終える。測定には影響しない。
//   まとめ（7,15,24,29,43,47）と46は測らない。全体の上限は60問（ブロック終了後に判定）。
//   系統が終わるたびに仮のスタート地点を出し、それより先から始まる系統は測らずに打ち切る。
// 関数はどれも状態を書きかえず、新しい状態を返す。状態はそのまま JSON にできる

export const LADDER_VERSION = 1;
export const TEST_MAX_QUESTIONS = 60;

export interface LadderSystem { sys: number; name: string; steps: readonly number[]; minStage: number }
const sys = (n: number, name: string, steps: number[]): LadderSystem => ({ sys: n, name, steps, minStage: Math.min(...steps) });
export const TEST_LADDER: readonly LadderSystem[] = [
  sys(0, 'たし算', [1, 3, 5, 8, 9, 11, 12, 14, 16, 18, 20, 23, 25, 27]),
  sys(1, 'ひき算', [2, 4, 6, 10, 13, 17, 19, 21, 22, 26, 28]),
  sys(2, 'かけ算', [30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42]),
  sys(3, 'わり算', [44, 45]),
];

// 測らないステージ（まとめと46）。スタート地点の計算では「前が全部できたら通りぬける」
const isUnmeasured = (num: number) => !!stageByNum(num).matome || num === 46;

export interface TestState {
  ladderSys: number;          // いま測っている系統
  stepIdx: number;            // 系統の中の段（steps の位置）
  lastPassedIdx: number;      // 最後に合格した段（-1 はまだ）
  perfectStreak: number;      // 全問正解での合格の連続
  currentJump: number;        // いまの段に来たときの歩幅
  pendingFallback: boolean;   // 2段先で落ちて、飛ばした1段を試している
  phase: 'measure' | 'closing';
  closingStepIdx: number;
  closingAttempt: number;
  blockAsked: number;
  blockCorrect: number;
  asked: number;              // 測った問題の数（締めの問題は数えない）。60問の上限に使う
  questionCount: number;      // 出した問題の数（締めの問題もふくむ）
  able: number[];             // 合格したステージ番号（小さい順）
  completedSystems: number[]; // 終わった（または打ち切った）系統
  tentativeS: number | null;  // 仮のスタート地点
  stageNum: number;           // 次の問題を出すステージ
  lastText: string | null;    // 直前の問題文（同じ問題が続かないように）
}

// 途中でやめたときに保存するもの（系統の切れ目でだけやめられる）
export interface TestProgress {
  ladderVersion: number;
  able: number[];
  asked: number;
  completedSystems: number[];
  tentativeS: number | null;
  nextSys: number;
}

export interface TestResult {
  start: number;  // スタート地点（1〜48。48 はぜんぶできそう）
  total: number;  // 登れた段の合計
  able: number[];
}

export type NextAfterSystem = { type: 'break'; nextSys: number } | { type: 'end'; result: TestResult };
export type TestOutcome =
  // 次の問題を出す。levelUp: 段が上がった（「レベルアップ」を出してから）
  | { type: 'question'; levelUp: boolean }
  // 系統が終わった（「ここまで登れた！」/「ここは これから」）。そのあと next へ
  | { type: 'systemDone'; sys: number; climbed: number; next: NextAfterSystem }
  // 60問に達して終わった
  | { type: 'end'; result: TestResult };

const clone = (s: TestState): TestState => ({ ...s, able: [...s.able], completedSystems: [...s.completedSystems] });
const addNum = (list: number[], n: number) => { if (!list.includes(n)) { list.push(n); list.sort((a, b) => a - b); } };

// 合格した段から、道のスタート地点（最初のまだできない段）を出す。
// assumeUnmeasured: まだ測っていない系統は「できる」とみなす（仮のスタート地点）
export function computeStartFromAble(able: readonly number[], completedSystems: readonly number[], assumeUnmeasured: boolean): number {
  const eff = new Set(able);
  if (assumeUnmeasured) {
    for (const g of TEST_LADDER) if (!completedSystems.includes(g.sys)) g.steps.forEach(n => eff.add(n));
  }
  for (let num = 1; num <= STAGE_COUNT; num++) {
    if (isUnmeasured(num)) {
      let all = true;
      for (let p = 1; p < num; p++) {
        if (isUnmeasured(p)) continue;
        if (!eff.has(p)) { all = false; break; }
      }
      if (all) continue;
      return num;
    }
    if (eff.has(num)) continue;
    return num;
  }
  return STAGE_COUNT + 1;
}

export const totalStepsClimbed = (able: readonly number[]) =>
  TEST_LADDER.reduce((n, g) => n + g.steps.filter(rep => able.includes(rep)).length, 0);

const result = (s: TestState): TestResult => {
  const start = Math.max(1, Math.min(STAGE_COUNT + 1, computeStartFromAble(s.able, s.completedSystems, false)));
  return { start, total: totalStepsClimbed(s.able), able: [...s.able] };
};

// 系統を始める（状態を書きかえる内部用）
function beginSystem(s: TestState, sysIdx: number) {
  s.ladderSys = sysIdx;
  s.stepIdx = 0; s.lastPassedIdx = -1; s.perfectStreak = 0;
  s.currentJump = 0; s.pendingFallback = false;
  s.phase = 'measure'; s.blockAsked = 0; s.blockCorrect = 0;
  s.stageNum = TEST_LADDER[sysIdx].steps[0];
}

function emptyState(): TestState {
  return {
    ladderSys: 0, stepIdx: 0, lastPassedIdx: -1, perfectStreak: 0, currentJump: 0, pendingFallback: false,
    phase: 'measure', closingStepIdx: -1, closingAttempt: 0, blockAsked: 0, blockCorrect: 0,
    asked: 0, questionCount: 0, able: [], completedSystems: [], tentativeS: null, stageNum: 1, lastText: null,
  };
}

// はじめから
export function startTest(): TestState {
  const s = emptyState();
  beginSystem(s, 0);
  return s;
}

// 途中から（保存した系統の切れ目から）。直前の問題文は引きつがない
export function resumeTest(tp: TestProgress): TestState {
  const s = emptyState();
  s.able = [...new Set(tp.able)].sort((a, b) => a - b);
  s.asked = tp.asked || 0;
  s.completedSystems = [...new Set(tp.completedSystems)].sort((a, b) => a - b);
  s.tentativeS = tp.tentativeS === undefined ? null : tp.tentativeS;
  beginSystem(s, tp.nextSys || 0);
  return s;
}

// 保存してあった途中の記録が使えるか（段の組み方が変わっていたら使わない）
export const isValidProgress = (tp: TestProgress | null | undefined): tp is TestProgress =>
  !!tp && tp.ladderVersion === LADDER_VERSION;

// 休けいのあと、次の系統へ
export function continueTest(state: TestState, nextSys: number): TestState {
  const s = clone(state);
  beginSystem(s, nextSys);
  return s;
}

// 休けいでやめるときに保存するもの
export function saveProgress(state: TestState, nextSys: number): TestProgress {
  return {
    ladderVersion: LADDER_VERSION,
    able: [...state.able],
    asked: state.asked,
    completedSystems: [...state.completedSystems],
    tentativeS: state.tentativeS,
    nextSys,
  };
}

// 次の問題を作る（直前と同じ問題文は20回まで作り直す）
export function nextTestQuestion(state: TestState, rng: Rng): { state: TestState; question: KeisanQuestion } {
  const s = clone(state);
  const gen = stageByNum(s.stageNum || 1).gen;
  let q = gen(rng), guard = 0;
  while (s.lastText !== null && q.text === s.lastText && guard < 20) { q = gen(rng); guard++; }
  s.lastText = q.text;
  s.questionCount++;
  return { state: s, question: q };
}

// ---- 答えたあと ----

const group = (s: TestState) => TEST_LADDER[s.ladderSys];

function markPassedSteps(s: TestState) {
  const g = group(s);
  for (let i = 0; i <= s.stepIdx; i++) addNum(s.able, g.steps[i]);
  s.lastPassedIdx = s.stepIdx;
}

// 仮のスタート地点より先から始まる系統は測らない
function decideNext(s: TestState): NextAfterSystem {
  let next = s.ladderSys + 1;
  while (next < TEST_LADDER.length) {
    if (s.tentativeS !== null && TEST_LADDER[next].minStage >= s.tentativeS) {
      addNum(s.completedSystems, next);
      next++;
      continue;
    }
    break;
  }
  if (next >= TEST_LADDER.length) return { type: 'end', result: result(s) };
  return { type: 'break', nextSys: next };
}

function afterSystemDone(s: TestState): TestOutcome {
  const climbed = s.lastPassedIdx + 1;
  return { type: 'systemDone', sys: s.ladderSys, climbed, next: decideNext(s) };
}

function endSystem(s: TestState): TestOutcome {
  addNum(s.completedSystems, s.ladderSys);
  s.tentativeS = computeStartFromAble(s.able, s.completedSystems, true);
  if (s.lastPassedIdx >= 0) {
    // 締めの1問: 最後に合格した段から出す
    s.phase = 'closing';
    s.closingStepIdx = s.lastPassedIdx;
    s.closingAttempt = 0;
    s.stageNum = group(s).steps[s.closingStepIdx];
    return { type: 'question', levelUp: false };
  }
  return afterSystemDone(s);
}

function handlePassAdvance(s: TestState, perfect: boolean): TestOutcome {
  const g = group(s);
  if (perfect) s.perfectStreak++; else s.perfectStreak = 0;
  if (s.pendingFallback) return endSystem(s);
  if (s.stepIdx >= g.steps.length - 1) return endSystem(s);
  const stride = s.perfectStreak >= 2 ? 2 : 1;
  let nextIdx = s.stepIdx + stride;
  if (nextIdx > g.steps.length - 1) nextIdx = g.steps.length - 1;
  s.currentJump = nextIdx - s.stepIdx;
  s.stepIdx = nextIdx;
  s.pendingFallback = false;
  s.stageNum = g.steps[s.stepIdx];
  return { type: 'question', levelUp: true };
}

function handleFail(s: TestState): TestOutcome {
  s.perfectStreak = 0;
  if (!s.pendingFallback && s.currentJump === 2) {
    // 2段先で落としたら、飛ばした1段だけを試す
    s.pendingFallback = true;
    s.stepIdx = s.stepIdx - 1;
    s.currentJump = 1;
    s.stageNum = group(s).steps[s.stepIdx];
    return { type: 'question', levelUp: false };
  }
  return endSystem(s);
}

function closingAfterAnswer(s: TestState, ok: boolean): TestOutcome {
  if (!ok && s.closingAttempt === 0) {
    s.closingAttempt = 1;
    const lower = Math.max(0, s.closingStepIdx - 1);
    s.stageNum = group(s).steps[lower];
    return { type: 'question', levelUp: false };
  }
  return afterSystemDone(s);
}

// 1問答えたあと。ok: 正解だったか
export function answerTest(state: TestState, ok: boolean): { state: TestState; outcome: TestOutcome } {
  const s = clone(state);
  const outcome = step(s, ok);
  return { state: s, outcome };
}

function step(s: TestState, ok: boolean): TestOutcome {
  if (s.phase === 'closing') return closingAfterAnswer(s, ok);
  s.asked++;
  if (ok) s.blockCorrect++;
  s.blockAsked++;
  if (s.blockAsked < 2) return { type: 'question', levelUp: false };
  if (s.blockAsked === 2 && s.blockCorrect === 1) return { type: 'question', levelUp: false };
  // ブロック確定: 2問正解 or 3問中2問正解で合格
  const passed = s.blockCorrect >= 2;
  const perfect = s.blockAsked === 2 && s.blockCorrect === 2;
  s.blockAsked = 0; s.blockCorrect = 0;
  // 安全上限60問: ブロック終了後に判定し、このブロックの結果を反映してから終える
  if (s.asked >= TEST_MAX_QUESTIONS) {
    if (passed) markPassedSteps(s);
    return { type: 'end', result: result(s) };
  }
  if (passed) {
    markPassedSteps(s);
    return handlePassAdvance(s, perfect);
  }
  return handleFail(s);
}

// ちからだめしの結果を記録に反映する（playableThrough は下がらない。途中保存は消す）
export function applyTestResult(playableThrough: number | undefined, res: TestResult): { playableThrough: number; lastStage: string; testDone: true } {
  const S = res.start;
  return {
    playableThrough: Math.max(playableThrough || 1, S),
    lastStage: S <= STAGE_COUNT ? stageByNum(S).id : 's47',
    testDone: true,
  };
}
