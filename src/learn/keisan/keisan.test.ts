import { describe, expect, it } from 'vitest';
import * as g from './generators';
import { borrowCount, carryCount, type Gen, type KeisanQuestion } from './generators';
import { STAGES, STAGE_COUNT, stageByNum } from './stages';
import { judgeScore, makeSet, mergeStageResult, playableAfterClear, typeDigit } from './session';
import { mulberry32 } from './__original__/harness';

// ステージごとに何度も作って、答えの正しさと出題の条件を確かめる（性質テスト）

const N = 3000;
const T = (n: number) => Math.floor(n / 10);
const o = (n: number) => n % 10;
const between = (x: number, lo: number, hi: number) => x >= lo && x <= hi;

// 問題文を数と演算子に分ける。演算子は全角（＋ U+FF0B、− U+2212、×、÷）で、前後に半角スペース
const OPS = ['＋', '−', '×', '÷'] as const;
function parse(text: string): { nums: number[]; ops: string[] } {
  const parts = text.split(' ');
  const nums: number[] = [], ops: string[] = [];
  parts.forEach((p, i) => {
    if (i % 2 === 0) { expect(p, text).toMatch(/^[1-9]\d*$/); nums.push(Number(p)); }
    else { expect(OPS as readonly string[], text).toContain(p); ops.push(p); }
  });
  return { nums, ops };
}
// 左から計算する（たし・ひきと、かけ・わりはまざらない）
function evaluate({ nums, ops }: { nums: number[]; ops: string[] }): number {
  return ops.reduce((acc, op, i) => {
    const b = nums[i + 1];
    return op === '＋' ? acc + b : op === '−' ? acc - b : op === '×' ? acc * b : acc / b;
  }, nums[0]);
}

type Check = (n: number[], ops: string[]) => boolean;
const bin = (op: string, f: (a: number, b: number) => boolean): Check => (n, ops) => ops.length === 1 && ops[0] === op && f(n[0], n[1]);
const ADD = '＋', SUB = '−', MUL = '×', DIV = '÷';

const kufu2: Check = (n, ops) => {
  if (ops.length !== 2 || ops.some(x => x !== ADD) || !n.every(x => between(x, 1, 9))) return false;
  // 10になるペアがちょうど1組（x∈2..8）。残りの数はペアのどちらとも同じでない
  const pairs = [[0, 1], [0, 2], [1, 2]].filter(([i, j]) => n[i] + n[j] === 10);
  if (pairs.length !== 1) return false;
  const [i, j] = pairs[0], k = 3 - i - j;
  return between(n[i], 2, 8) && n[k] !== n[i] && n[k] !== n[j];
};
const kufu3: Check = (n, ops) => {
  if (ops.length !== 2 || ops.some(x => x !== ADD)) return false;
  const pairs = [[0, 1], [0, 2], [1, 2]].filter(([i, j]) => n[i] + n[j] === 100);
  if (pairs.length !== 1) return false;
  const [i, j] = pairs[0], k = 3 - i - j;
  return between(n[i], 12, 88) && n[i] % 10 !== 0 && between(n[k], 11, 98) && n[k] !== n[i] && n[k] !== n[j]
    && (n[i] + n[k]) % 10 !== 0 && (n[j] + n[k]) % 10 !== 0;
};
const kufu4: Check = (n, ops) => {
  if (ops.length !== 2) return false;
  if (ops[0] === ADD && ops[1] === SUB) return between(n[0], 5, 25) && between(n[1], 3, 20) && between(n[2], 1, n[0] + n[1] - 1);
  if (ops[0] === SUB && ops[1] === ADD) return between(n[0], 10, 30) && between(n[1], 2, n[0] - 2) && between(n[2], 2, 20);
  return false;
};
const dan = (d: number): Check => bin(MUL, (a, b) => a === d && between(b, 1, 9));

const CHECKS = new Map<Gen, Check>([
  [g.gAdd1, bin(ADD, (a, b) => between(a, 1, 8) && b >= 1 && a + b <= 10)],
  [g.gSub1, bin(SUB, (a, b) => between(a, 3, 10) && between(b, 1, a - 1))],
  [g.gAddCarryIntro, bin(ADD, (a, b) => between(a, 2, 9) && between(b, 2, 9) && between(a + b, 11, 13))],
  [g.gSubBorrowIntro, bin(SUB, (a, b) => between(a, 11, 16) && between(b, o(a) + 1, 9))],
  [g.gAdd2, bin(ADD, (a, b) => between(a, 2, 9) && between(b, 11 - a, 9))],
  // 元のまま: 19 − 10 も出る
  [g.gSub2, bin(SUB, (a, b) => between(a, 12, 19) && (between(b, o(a) + 1, 9) || (a === 19 && b === 10)))],
  [g.gKufu1, (n, ops) => ops.length === 2 && ops.every(x => x === ADD) && between(n[0], 3, 19) && between(n[1], 2, 9) && between(n[2], 2, 9)],
  [g.gAdd21NoCarry, bin(ADD, (a, b) => between(a, 12, 98) && between(b, 2, 9) && o(a) + b < 10)],
  [g.gSub21NoBorrow, bin(SUB, (a, b) => between(a, 12, 99) && between(b, 2, 9) && o(a) >= b)],
  [g.gAdd21Carry, bin(ADD, (a, b) => between(a, 15, 98) && between(b, 2, 9) && o(a) + b >= 10 && a + b <= 99)],
  [g.gAdd21Over100, bin(ADD, (a, b) => between(a, 92, 99) && between(b, 2, 9) && a + b > 100)],
  [g.gSub21Borrow, bin(SUB, (a, b) => between(a, 21, 99) && between(b, 2, 9) && o(a) < b)],
  [g.gKufu2, kufu2],
  [g.gAdd22NoCarry, bin(ADD, (a, b) => between(a, 12, 99) && between(b, 12, 99) && o(a) + o(b) < 10 && T(a) + T(b) < 10)],
  [g.gSub22NoBorrow, bin(SUB, (a, b) => between(a, 23, 99) && between(b, 12, 89) && o(a) >= o(b) && T(a) > T(b))],
  [g.gAdd22OnesCarry, bin(ADD, (a, b) => between(a, 15, 99) && between(b, 12, 89) && o(a) + o(b) >= 10 && T(a) + T(b) + 1 < 10)],
  [g.gSub22OnesBorrow, bin(SUB, (a, b) => between(a, 25, 99) && between(b, 12, 89) && o(a) < o(b) && T(a) - T(b) >= 2)],
  [g.gAdd22BothCarry, bin(ADD, (a, b) => between(a, 25, 99) && between(b, 25, 99) && o(a) + o(b) >= 10 && T(a) + T(b) >= 9)],
  [g.gSub22HardBorrow, bin(SUB, (a, b) => between(a, 25, 99) && between(b, 12, 89) && o(a) < o(b) && T(a) - T(b) === 1)],
  [g.gSubZeroCross, bin(SUB, (a, b) => between(a, 100, 909) && T(a) % 10 === 0 && between(b, 12, 99) && a > b && borrowCount(a, b) >= 2)],
  [g.gKufu3, kufu3],
  [g.gAdd33Few, bin(ADD, (a, b) => between(a, 102, 999) && between(b, 102, 999) && carryCount(a, b) <= 1)],
  [g.gSub33Few, bin(SUB, (a, b) => between(a, 210, 999) && between(b, 102, 899) && a > b && borrowCount(a, b) <= 1)],
  [g.gAdd33Many, bin(ADD, (a, b) => between(a, 155, 999) && between(b, 155, 999) && carryCount(a, b) >= 2)],
  [g.gSub33Many, bin(SUB, (a, b) => between(a, 210, 999) && between(b, 105, 899) && a > b && borrowCount(a, b) >= 2)],
  [g.gMul3, bin(MUL, (a, b) => between(a, 2, 9) && between(b, 2, 9))],
  [g.gMul21NoCarry, bin(MUL, (a, b) => between(T(a), 1, 9) && between(o(a), 1, 9) && between(b, 2, 9) && T(a) * b < 10 && o(a) * b < 10)],
  [g.gMul21Carry, bin(MUL, (a, b) => between(a, 13, 99) && between(b, 2, 9) && (o(a) * b >= 10 || T(a) * b >= 10))],
  [g.gMul31, bin(MUL, (a, b) => between(a, 102, 999) && between(b, 2, 9))],
  [g.gDivEasy, bin(DIV, (a, b) => [2, 5, 3, 1].includes(b) && a % b === 0 && between(a / b, 2, 9))],
  [g.gDivHard, bin(DIV, (a, b) => [4, 6, 7, 8, 9].includes(b) && a % b === 0 && between(a / b, 2, 9))],
  [g.gKufu4, kufu4],
]);
const any = (...gens: Gen[]): Check => (n, ops) => gens.some(x => CHECKS.get(x)!(n, ops));
// ステージ番号 → 条件。まとめは元の実装の混ぜ方（その時点までのテーマ）
const STAGE_CHECK: Record<number, Check> = {
  7: any(g.gAdd1, g.gSub1, g.gAddCarryIntro, g.gSubBorrowIntro, g.gAdd2, g.gSub2),
  15: any(g.gAdd1, g.gSub1, g.gAdd2, g.gSub2, g.gAdd21NoCarry, g.gSub21NoBorrow, g.gAdd21Carry, g.gAdd21Over100, g.gSub21Borrow, g.gKufu1, g.gKufu2),
  24: any(g.gAdd21NoCarry, g.gSub21NoBorrow, g.gAdd21Carry, g.gSub21Borrow, g.gAdd22NoCarry, g.gSub22NoBorrow, g.gAdd22OnesCarry, g.gSub22OnesBorrow, g.gAdd22BothCarry, g.gSub22HardBorrow, g.gSubZeroCross, g.gKufu3),
  29: any(g.gAdd22NoCarry, g.gSub22NoBorrow, g.gAdd22BothCarry, g.gSub22HardBorrow, g.gSubZeroCross, g.gAdd33Few, g.gSub33Few, g.gAdd33Many, g.gSub33Many),
  30: dan(2), 31: dan(5), 32: dan(3), 33: dan(4), 34: dan(6), 35: dan(7), 36: dan(8), 37: dan(9), 38: dan(1),
  43: any(g.gAdd22OnesCarry, g.gSub22OnesBorrow, g.gAdd33Few, g.gSub33Few, g.gMul3, g.gMul21NoCarry, g.gMul21Carry, g.gMul31),
  46: any(g.gKufu2, g.gKufu3, g.gKufu4),
  47: any(g.gAdd2, g.gSub2, g.gAdd22BothCarry, g.gSubZeroCross, g.gAdd33Many, g.gSub33Many, g.gMul3, g.gMul21Carry, g.gMul31, g.gDivEasy, g.gDivHard, g.gKufu2, g.gKufu3, g.gKufu4),
};
const checkFor = (num: number): Check => STAGE_CHECK[num] ?? CHECKS.get(stageByNum(num).gen)!;

describe('けいさんのステージ', () => {
  it('47ステージで、id は s1〜s47、num は 1〜47', () => {
    expect(STAGE_COUNT).toBe(47);
    STAGES.forEach((s, i) => { expect(s.num).toBe(i + 1); expect(s.id).toBe(`s${i + 1}`); });
    expect(STAGES.filter(s => s.matome).map(s => s.num)).toEqual([7, 15, 24, 29, 43, 47]);
    expect(STAGES.filter(s => s.paper).map(s => s.num)).toEqual([25, 26, 27, 28, 42]);
  });

  for (const stage of STAGES) {
    it(`${stage.id} ${stage.name}: 答えが正しく、条件どおり、4けた以内`, () => {
      const rng = mulberry32(stage.num * 7919);
      const check = checkFor(stage.num);
      for (let i = 0; i < N; i++) {
        const q: KeisanQuestion = stage.gen(rng);
        const p = parse(q.text);
        expect(evaluate(p), q.text).toBe(q.answer);
        expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer <= 9999, q.text).toBe(true);
        expect(check(p.nums, p.ops), `${stage.id}: ${q.text}`).toBe(true);
      }
    });
  }

  it('あきらめたときの問題（固定）も条件を満たす', () => {
    const never = () => 0.999999; // 条件に合わない数ばかり出る乱数で、固定の問題を出させる
    for (const stage of STAGES) {
      if (stage.matome || stage.num === 46) continue;
      const q = stage.gen(never);
      const p = parse(q.text);
      expect(evaluate(p), q.text).toBe(q.answer);
      expect(checkFor(stage.num)(p.nums, p.ops), `${stage.id}: ${q.text}`).toBe(true);
    }
  });
});

describe('10問のセット', () => {
  // 九九の1つの段（s30〜s38）は問題が9通りしかないので、元の実装でも1問かぶる
  const DAN = new Set([30, 31, 32, 33, 34, 35, 36, 37, 38]);

  for (const stage of STAGES) {
    it(`${stage.id}: 10問で、問題文がかぶらない${DAN.has(stage.num) ? '（九九の段は9通り＋1問かぶり）' : ''}`, () => {
      const rng = mulberry32(stage.num * 104729);
      for (let i = 0; i < 200; i++) {
        const set = makeSet(stage.gen, rng);
        expect(set).toHaveLength(10);
        const unique = new Set(set.map(q => q.text)).size;
        expect(unique, stage.id).toBe(DAN.has(stage.num) ? 9 : 10);
      }
    });
  }
});

describe('星とクリア', () => {
  it('8問→★1、9問→★2、10問→★3。7問以下はクリアなし', () => {
    expect([0, 5, 7, 8, 9, 10].map(judgeScore)).toEqual([
      { cleared: false, stars: 0 }, { cleared: false, stars: 0 }, { cleared: false, stars: 0 },
      { cleared: true, stars: 1 }, { cleared: true, stars: 2 }, { cleared: true, stars: 3 },
    ]);
  });

  it('記録はベストを残し、ベストタイムはクリアできなかった回でも更新する', () => {
    const s1 = stageByNum(1);
    const a = mergeStageResult(null, s1, 7, 50);
    expect(a.record).toEqual({ cleared: false, stars: 0, bestScore: 7, bestTime: 50 });
    const b = mergeStageResult(a.record, s1, 9, 60);
    expect(b.record).toEqual({ cleared: true, stars: 2, bestScore: 9, bestTime: 50 });
    expect(b.faster).toBe(false);
    const c = mergeStageResult(b.record, s1, 5, 30);
    expect(c.record).toEqual({ cleared: true, stars: 2, bestScore: 9, bestTime: 30 });
    expect(c.faster).toBe(false); // クリアしていないので出さない
    const d = mergeStageResult(c.record, s1, 8, 20);
    expect(d.faster).toBe(true);
  });

  it('筆算のステージでは「まえより はやい！」を出さない', () => {
    const s25 = stageByNum(25);
    const prev = mergeStageResult(null, s25, 10, 100).record;
    expect(mergeStageResult(prev, s25, 10, 50).faster).toBe(false);
  });

  it('クリアすると、そのステージの次まで遊べる（下がらない、48まで）', () => {
    expect(playableAfterClear(1, 5)).toBe(6);
    expect(playableAfterClear(10, 5)).toBe(10);
    expect(playableAfterClear(1, 47)).toBe(48);
  });

  it('入力は4けたまで、先頭の0はおきかえる', () => {
    let s = '';
    for (const k of ['0', '0', '7', '1', '2', '3', '4']) s = typeDigit(s, k);
    expect(s).toBe('7123');
  });
});
