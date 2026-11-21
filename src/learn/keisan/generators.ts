import { pick, randInt, shuffle, type Rng } from '../random';

// けいさんの問題の作り方。算数練習アプリ（Space 試作）の実装をそのまま移したもの（docs/03-keisan.md）
// 数の範囲・くり上がりのパターン・あきらめるまでの回数・あきらめたときの問題・乱数を使う順番まで元と同じ。
// 同じ乱数の並びなら、元の実装と同じ問題になる（keisan.original.test.ts で照合）

export interface KeisanQuestion {
  text: string;    // 問題文（例: "8 ＋ 4"）。10問の重複チェックにも使う
  answer: number;
}
export type Gen = (rng: Rng) => KeisanQuestion;

// 演算子は全角の ＋（U+FF0B）・−（U+2212）・×・÷。前後に半角スペース
export const PLUS = ' ＋ ', MINUS = ' − ', TIMES = ' × ', DIVIDE = ' ÷ ';

const Q = (text: string, answer: number): KeisanQuestion => ({ text, answer });
const rnd = randInt;
const tens = (n: number) => Math.floor(n / 10);

// けたごとの くり上がり／くり下がりの回数（3けたまで）
export function carryCount(a: number, b: number): number {
  let c = 0, carry = 0;
  for (let i = 0; i < 3; i++) {
    const sm = (a % 10) + (b % 10) + carry;
    if (sm >= 10) { c++; carry = 1; } else carry = 0;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return c;
}
export function borrowCount(a: number, b: number): number {
  let c = 0, bor = 0;
  for (let i = 0; i < 3; i++) {
    const d = (a % 10) - bor - (b % 10);
    if (d < 0) { c++; bor = 1; } else bor = 0;
    a = Math.floor(a / 10); b = Math.floor(b / 10);
  }
  return c;
}

// ---- たし算・ひき算（1けた） ----
export const gAdd1: Gen = r => { const a = rnd(r, 1, 8), b = rnd(r, 1, 10 - a); return Q(a + PLUS + b, a + b); };
export const gSub1: Gen = r => { const a = rnd(r, 3, 10), b = rnd(r, 1, a - 1); return Q(a + MINUS + b, a - b); };
export const gAddCarryIntro: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 2, 9), b = rnd(r, 2, 9), sm = a + b; if (sm >= 11 && sm <= 13) return Q(a + PLUS + b, sm); }
  return Q('8' + PLUS + '4', 12);
};
export const gAdd2: Gen = r => { const a = rnd(r, 2, 9), b = rnd(r, 11 - a, 9); return Q(a + PLUS + b, a + b); };
export const gSubBorrowIntro: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 11, 16), ones = a % 10; if (ones === 0 || ones === 9) continue; const b = rnd(r, ones + 1, 9); return Q(a + MINUS + b, a - b); }
  return Q('13' + MINUS + '5', 8);
};
// 元のまま: a=19 のとき rnd(10, 9) は 10 になり「19 − 10」が出る
export const gSub2: Gen = r => { const a = rnd(r, 12, 19), ones = a % 10, b = rnd(r, ones + 1, 9); return Q(a + MINUS + b, a - b); };

// ---- 2けた ＋／− 1けた ----
export const gAdd21NoCarry: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 12, 98), b = rnd(r, 2, 9); if ((a % 10) + b < 10) return Q(a + PLUS + b, a + b); }
  return Q('34' + PLUS + '5', 39);
};
export const gSub21NoBorrow: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 12, 99), b = rnd(r, 2, 9); if ((a % 10) >= b) return Q(a + MINUS + b, a - b); }
  return Q('38' + MINUS + '5', 33);
};
export const gAdd21Carry: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 15, 98), b = rnd(r, 2, 9); if ((a % 10) + b >= 10 && a + b <= 99) return Q(a + PLUS + b, a + b); }
  return Q('47' + PLUS + '5', 52);
};
export const gAdd21Over100: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 92, 99), b = rnd(r, 2, 9); if (a + b > 100) return Q(a + PLUS + b, a + b); }
  return Q('95' + PLUS + '7', 102);
};
export const gSub21Borrow: Gen = r => {
  for (let t = 0; t < 200; t++) { const a = rnd(r, 21, 99), b = rnd(r, 2, 9); if ((a % 10) < b) return Q(a + MINUS + b, a - b); }
  return Q('52' + MINUS + '6', 46);
};

// ---- 2けた ＋／− 2けた ----
export const gAdd22NoCarry: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 12, 99), b = rnd(r, 12, 99); if ((a % 10) + (b % 10) < 10 && tens(a) + tens(b) < 10) return Q(a + PLUS + b, a + b); }
  return Q('34' + PLUS + '25', 59);
};
export const gSub22NoBorrow: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 23, 99), b = rnd(r, 12, 89); if ((a % 10) >= (b % 10) && tens(a) > tens(b)) return Q(a + MINUS + b, a - b); }
  return Q('56' + MINUS + '24', 32);
};
export const gAdd22OnesCarry: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 15, 99), b = rnd(r, 12, 89); if ((a % 10) + (b % 10) >= 10 && tens(a) + tens(b) + 1 < 10) return Q(a + PLUS + b, a + b); }
  return Q('47' + PLUS + '25', 72);
};
export const gSub22OnesBorrow: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 25, 99), b = rnd(r, 12, 89); if ((a % 10) < (b % 10) && tens(a) - tens(b) >= 2) return Q(a + MINUS + b, a - b); }
  return Q('56' + MINUS + '28', 28);
};
export const gAdd22BothCarry: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 25, 99), b = rnd(r, 25, 99); if ((a % 10) + (b % 10) >= 10 && tens(a) + tens(b) >= 9) return Q(a + PLUS + b, a + b); }
  return Q('47' + PLUS + '58', 105);
};
// 一の位で借りて、十の位がちょうど0になる（いちばん難しい形）
export const gSub22HardBorrow: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 25, 99), b = rnd(r, 12, 89); if ((a % 10) < (b % 10) && tens(a) - tens(b) === 1) return Q(a + MINUS + b, a - b); }
  return Q('53' + MINUS + '48', 5);
};
export const gSubZeroCross: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 1, 9) * 100 + rnd(r, 0, 9), b = rnd(r, 12, 99); if (a > b && borrowCount(a, b) >= 2) return Q(a + MINUS + b, a - b); }
  return Q('205' + MINUS + '58', 147);
};

// ---- 3けた ＋／− 3けた ----
export const gAdd33Few: Gen = r => {
  for (let t = 0; t < 400; t++) { const a = rnd(r, 102, 999), b = rnd(r, 102, 999); if (carryCount(a, b) <= 1) return Q(a + PLUS + b, a + b); }
  return Q('234' + PLUS + '156', 390);
};
export const gSub33Few: Gen = r => {
  for (let t = 0; t < 400; t++) { const a = rnd(r, 210, 999), b = rnd(r, 102, 899); if (a > b && borrowCount(a, b) <= 1) return Q(a + MINUS + b, a - b); }
  return Q('456' + MINUS + '123', 333);
};
export const gAdd33Many: Gen = r => {
  for (let t = 0; t < 400; t++) { const a = rnd(r, 155, 999), b = rnd(r, 155, 999); if (carryCount(a, b) >= 2) return Q(a + PLUS + b, a + b); }
  return Q('478' + PLUS + '586', 1064);
};
export const gSub33Many: Gen = r => {
  for (let t = 0; t < 400; t++) { const a = rnd(r, 210, 999), b = rnd(r, 105, 899); if (a > b && borrowCount(a, b) >= 2) return Q(a + MINUS + b, a - b); }
  return Q('512' + MINUS + '268', 244);
};

// ---- かけ算・わり算 ----
// gMul1・gMul2・gDiv1・gMul5 は元の実装にあるがステージでは使っていない
export const gMul1: Gen = r => { const d = pick(r, [2, 3, 5, 1]), b = d === 1 ? rnd(r, 2, 9) : rnd(r, 1, 9); return Q(d + TIMES + b, d * b); };
export const gMul2: Gen = r => { const d = pick(r, [4, 6, 7, 8, 9]), b = rnd(r, 2, 9); return Q(d + TIMES + b, d * b); };
export const gMul3: Gen = r => { const d = rnd(r, 2, 9), b = rnd(r, 2, 9); return Q(d + TIMES + b, d * b); };
// 九九の1つの段（かける数は 1〜9）
export const danGen = (d: number): Gen => r => { const b = rnd(r, 1, 9); return Q(d + TIMES + b, d * b); };
export const gDiv1: Gen = r => { const b = rnd(r, 2, 9), q = rnd(r, 2, 9); return Q((b * q) + DIVIDE + b, q); };
export const gDivEasy: Gen = r => { const d = pick(r, [2, 5, 3, 1]), q = rnd(r, 2, 9); return Q((d * q) + DIVIDE + d, q); };
export const gDivHard: Gen = r => { const d = pick(r, [4, 6, 7, 8, 9]), q = rnd(r, 2, 9); return Q((d * q) + DIVIDE + d, q); };
export const gMul21NoCarry: Gen = r => {
  for (let t = 0; t < 300; t++) { const tn = rnd(r, 1, 9), on = rnd(r, 1, 9), b = rnd(r, 2, 9); if (tn * b < 10 && on * b < 10) { const a = tn * 10 + on; return Q(a + TIMES + b, a * b); } }
  return Q('23' + TIMES + '2', 46);
};
export const gMul21Carry: Gen = r => {
  for (let t = 0; t < 300; t++) { const a = rnd(r, 13, 99), b = rnd(r, 2, 9); if ((a % 10) * b >= 10 || tens(a) * b >= 10) return Q(a + TIMES + b, a * b); }
  return Q('24' + TIMES + '3', 72);
};
export const gMul31: Gen = r => { const a = rnd(r, 102, 999), b = rnd(r, 2, 9); return Q(a + TIMES + b, a * b); };
export const gMul5: Gen = r => gMul21Carry(r);

// ---- くふう ----
export const gKufu1: Gen = r => { const a = rnd(r, 3, 19), b = rnd(r, 2, 9), c = rnd(r, 2, 9); return Q(a + PLUS + b + PLUS + c, a + b + c); };
// 10になるペア ＋ もう1つ
export const gKufu2: Gen = r => {
  for (let t = 0; t < 60; t++) {
    const x = rnd(r, 2, 8), p = 10 - x, y = rnd(r, 1, 9);
    if (y === x || y === p) continue;
    if (x + y === 10 || p + y === 10) continue;
    return Q(shuffle(r, [x, p, y]).join(PLUS), x + p + y);
  }
  return Q(['8', '5', '2'].join(PLUS), 15);
};
// 100になるペア ＋ もう1つ
export const gKufu3: Gen = r => {
  for (let t = 0; t < 80; t++) {
    const x = rnd(r, 12, 88); if (x % 10 === 0) continue;
    const p = 100 - x, z = rnd(r, 11, 98);
    if (z === x || z === p) continue;
    if ((x + z) % 10 === 0 || (p + z) % 10 === 0) continue;
    if (x + z === 100 || p + z === 100) continue;
    return Q(shuffle(r, [x, p, z]).join(PLUS), x + p + z);
  }
  return Q(['25', '17', '75'].join(PLUS), 117);
};
// たし・ひきの まじった 3つの数
export const gKufu4: Gen = r => {
  if (r() < 0.5) {
    const a = rnd(r, 5, 25), b = rnd(r, 3, 20), c = rnd(r, 1, a + b - 1);
    return Q(a + PLUS + b + MINUS + c, a + b - c);
  }
  const d = rnd(r, 10, 30), e = rnd(r, 2, d - 2), f = rnd(r, 2, 20);
  return Q(d + MINUS + e + PLUS + f, d - e + f);
};
export const gKufuMix: Gen = r => pick(r, [gKufu2, gKufu3, gKufu4])(r);

// ---- まとめ（その時点までのテーマから混合） ----
const mix = (gens: Gen[]): Gen => r => pick(r, gens)(r);
export const gMatome1 = mix([gAdd1, gSub1, gAddCarryIntro, gSubBorrowIntro, gAdd2, gSub2]);
export const gMatome2 = mix([gAdd1, gSub1, gAdd2, gSub2, gAdd21NoCarry, gSub21NoBorrow, gAdd21Carry, gAdd21Over100, gSub21Borrow, gKufu1, gKufu2]);
export const gMatome3 = mix([gAdd21NoCarry, gSub21NoBorrow, gAdd21Carry, gSub21Borrow, gAdd22NoCarry, gSub22NoBorrow, gAdd22OnesCarry, gSub22OnesBorrow, gAdd22BothCarry, gSub22HardBorrow, gSubZeroCross, gKufu3]);
export const gMatome4 = mix([gAdd22NoCarry, gSub22NoBorrow, gAdd22BothCarry, gSub22HardBorrow, gSubZeroCross, gAdd33Few, gSub33Few, gAdd33Many, gSub33Many]);
export const gMatome5 = mix([gAdd22OnesCarry, gSub22OnesBorrow, gAdd33Few, gSub33Few, gMul3, gMul21NoCarry, gMul21Carry, gMul31]);
export const gMatome6 = mix([gAdd2, gSub2, gAdd22BothCarry, gSubZeroCross, gAdd33Many, gSub33Many, gMul3, gMul21Carry, gMul31, gDivEasy, gDivHard, gKufu2, gKufu3, gKufu4]);
