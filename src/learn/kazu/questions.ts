import { pick, randInt, shuffle, type Rng } from '../random';

// 算数「かず」の問題の形と作り方。形式は「かず 問題形式モック」（Space）で承認されたもの。仕様は docs/05-kazu.md
// 画面から切り離した純粋な関数。図は種類と数だけを持ち、SVG にするのは画面（src/ui/kazu-figs.ts）

// 図。offset: ぬる区切りの始まり（0 は 12時／左はし から）
export type Fig =
  | { kind: 'numberLine'; max: number; step: number; value: number }  // 0〜max の数直線と、value をさす矢印
  | { kind: 'dots'; total: number; on: number }                       // 丸 total こ（はじめの on こに色）
  | { kind: 'tenFrame'; on: number }                                  // 10マスの枠（on マスに丸）
  | { kind: 'pie'; parts: number; filled: number; offset: number }    // 円を parts に分け、filled こぶんを ぬる
  | { kind: 'bar'; parts: number; filled: number; offset: number };   // 長方形を parts に分け、filled こぶんを ぬる

// 分数の上下。数か、入力欄（field の番号）
export type Slot = number | { field: number };

// 問題文・選択肢の部品
export type Piece =
  | { t: 'text'; s: string }
  | { t: 'field'; i: number }                // 入力欄（answers[i] が答え）
  | { t: 'frac'; num: Slot; den: Slot }      // 分数（上が分子、下が分母）
  | { t: 'fig'; fig: Fig };

export type KazuType =
  | 'compare' | 'sequence' | 'numberLine' | 'placeIntro'          // 1. 100までの かず
  | 'decompose' | 'compose' | 'tenSplit'                         // 2. いくつと いくつ
  | 'place3' | 'words'                                           // 3. 1000までの かず（+ compare・numberLine）
  | 'halfPick' | 'quarterPick' | 'partName'                      // 4. はんぶん・4とうぶん
  | 'place5' | 'times10' | 'tenth'                               // 5. 10000までの かずと おおきな かず（+ compare・numberLine）
  | 'fracRead' | 'fracCompare' | 'fracAdd'                       // 6. ぶんすう
  | 'decimalCount' | 'decimalCompare' | 'decimalCalc';           // 7. しょうすう

interface Base {
  type: KazuType;
  key: string;      // 10問の重複チェック用（中身が同じなら同じ）
  fig?: Fig;        // 問題文の上の図
  text: Piece[];    // 問題文（1行。入力欄もここに入る）
  note?: string;    // 問題文の下の小さな ひとこと
}
// 数字入力。answers は欄ごとの答え。decimal: 小数点キーを出す
export type InputQuestion = Base & { mode: 'input'; answers: number[]; decimal: boolean };
// タップ選択。answer は正しい選択肢の位置。words: 選択肢が言葉（字を小さめに）
export type ChoiceQuestion = Base & { mode: 'choice'; options: Piece[]; answer: number; words?: boolean };
export type KazuQuestion = InputQuestion | ChoiceQuestion;

export type KazuGen = (rng: Rng) => KazuQuestion;

// ---- 部品 ----

const T = (s: string): Piece => ({ t: 'text', s });
const F = (i = 0): Piece => ({ t: 'field', i });
const frac = (num: Slot, den: Slot): Piece => ({ t: 'frac', num, den });
const fig = (f: Fig): Piece => ({ t: 'fig', fig: f });

function makeKey(type: KazuType, q: { fig?: Fig; text: Piece[]; options?: Piece[] }): string {
  // 選択肢の並びがちがうだけなら同じ問題とみなす
  const opts = q.options ? q.options.map(o => JSON.stringify(o)).sort() : null;
  return JSON.stringify([type, q.fig ?? null, q.text, opts]);
}

function input(type: KazuType, text: Piece[], answers: number[], o: { fig?: Fig; note?: string; decimal?: boolean } = {}): InputQuestion {
  return { type, key: makeKey(type, { fig: o.fig, text }), mode: 'input', text, answers, decimal: !!o.decimal, ...(o.fig ? { fig: o.fig } : {}), ...(o.note ? { note: o.note } : {}) };
}

// 正解の選択肢と、ほかの選択肢（正解と重ならないもの）を並べかえて出す
function choice(rng: Rng, type: KazuType, text: Piece[], right: Piece, wrong: Piece[], o: { fig?: Fig } = {}): ChoiceQuestion {
  const options = shuffle(rng, [right, ...wrong]);
  const answer = options.indexOf(right);
  return {
    type, key: makeKey(type, { fig: o.fig, text, options }), mode: 'choice', text, options, answer,
    ...(o.fig ? { fig: o.fig } : {}),
  };
}

// 小数（10分の1の位まで）。tenths は 10倍した整数（7 → 0.7、13 → 1.3、10 → 1）
export const fmtTenths = (tenths: number) => (tenths % 10 === 0 ? String(tenths / 10) : `${Math.floor(tenths / 10)}.${tenths % 10}`);

// 答えの表示（まちがえたときに「こたえは …」で出す）。2つの欄は分数（上が分子）
export function answerPieces(q: InputQuestion): Piece[] {
  if (q.answers.length === 2) return [frac(q.answers[0], q.answers[1])];
  return [T(String(q.answers[0]))];
}

// a に近い、ちがう数（けたの入れかえ・1けただけ変える・少しずらす）。lo〜hi の中
export function nearInt(rng: Rng, a: number, lo: number, hi: number): number {
  for (let tries = 0; tries < 30; tries++) {
    const s = String(a).split('');
    let b: number;
    const r = rng();
    if (r < 0.35 && s.length >= 2) {
      const i = randInt(rng, 0, s.length - 2);
      [s[i], s[i + 1]] = [s[i + 1], s[i]];
      if (s[0] === '0') continue;
      b = Number(s.join(''));
    } else if (r < 0.7) {
      const i = randInt(rng, 0, s.length - 1);
      const d = randInt(rng, i === 0 ? 1 : 0, 9);
      s[i] = String(d);
      b = Number(s.join(''));
    } else {
      const mag = s.length >= 3 ? 10 ** (s.length - 2) : 1;
      b = a + (rng() < 0.5 ? -1 : 1) * randInt(rng, 1, 9) * mag;
    }
    if (b !== a && b >= lo && b <= hi) return b;
  }
  return a + 1 <= hi ? a + 1 : a - 1;
}

const COMPARE_Q = [T('どっちが おおきい？')];

function compareInts(rng: Rng, a: number, b: number): ChoiceQuestion {
  const big = Math.max(a, b), small = Math.min(a, b);
  return choice(rng, 'compare', COMPARE_Q, T(String(big)), [T(String(small))]);
}

function numberLine(rng: Rng, max: number, step: number, unit: number): InputQuestion {
  const value = randInt(rng, 1, max / unit - 1) * unit;
  const f: Fig = { kind: 'numberLine', max, step, value };
  return input('numberLine', [T('やじるしの かずは いくつ？'), F()], [value], { fig: f });
}

// ---- 1. 100までの かず ----

export const genCompare100: KazuGen = rng => {
  const a = rng() < 0.1 ? 100 : randInt(rng, 10, 99);
  return compareInts(rng, a, nearInt(rng, a, 1, 100));
};

export const genSequence: KazuGen = rng => {
  const start = randInt(rng, 1, 97);
  const blank = randInt(rng, 0, 3);
  const text = [0, 1, 2, 3].map(i => (i === blank ? F() : T(String(start + i))));
  return input('sequence', text, [start + blank]);
};

export const genNumberLine100: KazuGen = rng => numberLine(rng, 100, 10, 5);

// 58は 10が □こ と、1が 8こ（どちらか1か所が空欄）
export const genPlaceIntro: KazuGen = rng => {
  const tens = randInt(rng, 1, 9), ones = randInt(rng, 1, 9);
  const n = tens * 10 + ones;
  return rng() < 0.5
    ? input('placeIntro', [T(`${n}は 10が`), F(), T(`こ と、1が ${ones}こ`)], [tens])
    : input('placeIntro', [T(`${n}は 10が ${tens}こ と、1が`), F(), T('こ')], [ones]);
};

// ---- 2. いくつと いくつ（10まで） ----

export const genDecompose: KazuGen = rng => {
  const total = randInt(rng, 3, 9);
  const a = randInt(rng, 1, total - 1);
  return input('decompose', [T(`${total}は ${a}と`), F()], [total - a], { fig: { kind: 'dots', total, on: a } });
};

export const genCompose: KazuGen = rng => {
  const a = randInt(rng, 1, 9);
  const b = randInt(rng, 1, 10 - a);
  return input('compose', [T(`${a}と ${b}で`), F()], [a + b]);
};

export const genTenSplit: KazuGen = rng => {
  const a = randInt(rng, 1, 9);
  return input('tenSplit', [T(`10は ${a}と`), F()], [10 - a], { fig: { kind: 'tenFrame', on: a } });
};

// ---- 3. 1000までの かず ----

// 472は 100が □こ、10が 7こ、1が 2こ（1か所だけ空欄）
export const genPlace3: KazuGen = rng => {
  const d = [randInt(rng, 1, 9), randInt(rng, 0, 9), randInt(rng, 0, 9)];
  const n = d[0] * 100 + d[1] * 10 + d[2];
  const blank = randInt(rng, 0, 2);
  const label = ['100が', '10が', '1が'];
  const text: Piece[] = [];
  let buf = `${n}は `;
  for (let i = 0; i < 3; i++) {
    const tail = i < 2 ? 'こ、' : 'こ';
    if (i === blank) {
      text.push(T(buf + label[i]), F());
      buf = tail;
    } else buf += `${label[i]} ${d[i]}${tail}`;
  }
  text.push(T(buf));
  return input('place3', text, [d[blank]]);
};

// 数の読み（ひらがな）。1〜1000。くらいごとに半角スペースで区切る（「さんびゃく じゅう ご」）
const ONES = ['', 'いち', 'に', 'さん', 'よん', 'ご', 'ろく', 'なな', 'はち', 'きゅう'];
const TENS = ['', 'じゅう', 'にじゅう', 'さんじゅう', 'よんじゅう', 'ごじゅう', 'ろくじゅう', 'ななじゅう', 'はちじゅう', 'きゅうじゅう'];
const HUNDREDS = ['', 'ひゃく', 'にひゃく', 'さんびゃく', 'よんひゃく', 'ごひゃく', 'ろっぴゃく', 'ななひゃく', 'はっぴゃく', 'きゅうひゃく'];
export function yomi(n: number): string {
  if (n === 1000) return 'せん';
  return [HUNDREDS[Math.floor(n / 100)], TENS[Math.floor(n / 10) % 10], ONES[n % 10]].filter(Boolean).join(' ');
}

export const genWords: KazuGen = rng => {
  const n = randInt(rng, 101, 999);
  return input('words', [T(`${yomi(n)}　→`), F()], [n]);
};

export const genCompare1000: KazuGen = rng => {
  const a = randInt(rng, 100, 999);
  return compareInts(rng, a, nearInt(rng, a, 100, 1000));
};

export const genNumberLine1000: KazuGen = rng => numberLine(rng, 1000, 100, 50);

// ---- 4. はんぶん・4とうぶん（絵のタップ選択だけ） ----

type Shape = 'pie' | 'bar';
const part = (rng: Rng, kind: Shape, parts: number, filled: number): Fig =>
  ({ kind, parts, filled, offset: parts === 1 ? 0 : randInt(rng, 0, parts - 1) });

// はんぶんでない ぬり方（円）
const NOT_HALF: [number, number][] = [[3, 1], [1, 1], [4, 1], [3, 2], [4, 3]];
// 4分の1でない ぬり方（長方形）
const NOT_QUARTER: [number, number][] = [[2, 1], [4, 2], [3, 1], [4, 3], [1, 1]];

export const genHalfPick: KazuGen = rng => {
  const wrong = shuffle(rng, NOT_HALF).slice(0, 2).map(([p, f]) => fig(part(rng, 'pie', p, f)));
  return choice(rng, 'halfPick', [T('はんぶんに ぬられているのは どれ？')], fig(part(rng, 'pie', 2, 1)), wrong);
};

export const genQuarterPick: KazuGen = rng => {
  const wrong = shuffle(rng, NOT_QUARTER).slice(0, 2).map(([p, f]) => fig(part(rng, 'bar', p, f)));
  return choice(rng, 'quarterPick', [T('4分の1に ぬられているのは どれ？')], fig(part(rng, 'bar', 4, 1)), wrong);
};

// ぬられた絵を見て「はんぶん？ 4分の1？」。選択肢の並びは いつも はんぶん → 4分の1
export const genPartName: KazuGen = rng => {
  const parts = pick(rng, [2, 4]);
  const f = part(rng, pick(rng, ['pie', 'bar'] as const), parts, 1);
  const text = [T('ぬられているのは どっち？')];
  const options = [T('はんぶん'), T('4分の1')];
  return { type: 'partName', key: makeKey('partName', { fig: f, text, options }), mode: 'choice', fig: f, text, options, answer: parts === 2 ? 0 : 1, words: true };
};

// ---- 5. 10000までの かずと おおきな かず（99999まで） ----

const PLACES = ['一', '十', '百', '千', '万'];

// 23645の 万の くらいは □
export const genPlace5: KazuGen = rng => {
  const n = rng() < 0.6 ? randInt(rng, 10000, 99999) : randInt(rng, 1000, 9999);
  const digits = String(n);
  const p = randInt(rng, 0, digits.length - 1); // 0 が一の位
  return input('place5', [T(`${n}の ${PLACES[p]}の くらいは`), F()], [Number(digits[digits.length - 1 - p])]);
};

export const genTimes10: KazuGen = rng => {
  const n = randInt(rng, 10, 9999);
  return input('times10', [T(`${n}の 10ばいは`), F()], [n * 10]);
};

export const genTenth: KazuGen = rng => {
  const n = randInt(rng, 10, 9999) * 10;
  return input('tenth', [T(`${n}の 10分の1は`), F()], [n / 10]);
};

export const genCompare5: KazuGen = rng => {
  // ときどき 4けた と 5けた（9876 と 10002 のような）
  if (rng() < 0.25) return compareInts(rng, randInt(rng, 9000, 9999), randInt(rng, 10000, 10999));
  const a = randInt(rng, 1000, 99999);
  return compareInts(rng, a, nearInt(rng, a, 1000, 99999));
};

export const genNumberLine10000: KazuGen = rng => numberLine(rng, 10000, 1000, 500);

// ---- 6. ぶんすう（分母は10まで） ----

export const genFracRead: KazuGen = rng => {
  const den = randInt(rng, 2, 8);
  const num = randInt(rng, 1, den - 1);
  return input('fracRead', [T('ぬられている ところは'), frac({ field: 0 }, { field: 1 })], [num, den],
    { fig: { kind: 'pie', parts: den, filled: num, offset: 0 }, note: 'うえが ぶんし、したが ぶんぼ' });
};

export const genFracCompare: KazuGen = rng => {
  const den = randInt(rng, 3, 10);
  const [a, b] = shuffle(rng, Array.from({ length: den - 1 }, (_, i) => i + 1)).slice(0, 2);
  return choice(rng, 'fracCompare', COMPARE_Q, frac(Math.max(a, b), den), [frac(Math.min(a, b), den)]);
};

// 同じ分母の たし算（和は1まで）。分子だけ入力
export const genFracAdd: KazuGen = rng => {
  const den = randInt(rng, 3, 10);
  const a = randInt(rng, 1, den - 1);
  const b = randInt(rng, 1, den - a);
  return input('fracAdd', [frac(a, den), T('＋'), frac(b, den), T('＝'), frac({ field: 0 }, den)], [a + b]);
};

// ---- 7. しょうすう（10分の1の位まで、9.9まで） ----

const notWhole = (t: number) => t % 10 !== 0;

export const genDecimalCount: KazuGen = rng => {
  const n = randInt(rng, 1, 19);
  return input('decimalCount', [T('0.1が'), F(), T(`こで ${fmtTenths(n)}`)], [n]);
};

export const genDecimalCompare: KazuGen = rng => {
  let a: number, b: number;
  do {
    a = randInt(rng, 1, 49);
    b = nearInt(rng, a, 1, 99);
  } while (!notWhole(a) || !notWhole(b));
  return choice(rng, 'decimalCompare', COMPARE_Q, T(fmtTenths(Math.max(a, b))), [T(fmtTenths(Math.min(a, b)))]);
};

// 0.6 ＋ 0.3 のような たし算・ひき算。半分は 1より小さい数どうし
export const genDecimalCalc: KazuGen = rng => {
  const small = rng() < 0.5;
  const add = rng() < 0.5;
  let a: number, b: number;
  do {
    if (add) {
      a = randInt(rng, 1, small ? 9 : 49);
      b = randInt(rng, 1, small ? 9 : 49);
    } else {
      a = randInt(rng, 2, small ? 9 : 99);
      b = randInt(rng, 1, a - 1);
    }
  } while (!notWhole(a) || !notWhole(b));
  const ans = add ? a + b : a - b;
  return input('decimalCalc', [T(`${fmtTenths(a)} ${add ? '＋' : '−'} ${fmtTenths(b)} ＝`), F()], [ans / 10], { decimal: true });
};
