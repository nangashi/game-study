import type { Question } from './types';
import type { Grade, Profile } from '../state/types';
import type { Category } from '../studies/types';
import { once } from '../studies/types';
import { makeChoices, pick, shuffle, type Rng } from './random';
import { iconHtml, type IconName } from '../art';
import { AMARI, BUN1, BUN2, BUN3, type AmariTemplate, type BunOp, type BunTemplate } from '../data/sansu-bank';

// 算数の問題の作り方。カテゴリの一覧は src/studies/sansu.ts
// カードは1問ずつ（例: 'keisan:7+8'、'tani2:cm_mm,3,4'）。カードが同じなら同じ問題になる（選択肢のならびだけ変わる）
// 数が多すぎる種類は、決まった並びでえらんだものだけをプールにする

// ---- 道具 ----

const THINGS: IconName[] = ['apple', 'fish', 'star', 'car', 'frog', 'donut', 'tulip', 'ladybug', 'balloon'];
const row = (thing: IconName, n: number, size = 52) => `<span class="things">${iconHtml(thing, size).repeat(n)}</span>`;
const range = (lo: number, hi: number, step = 1) => Array.from({ length: Math.floor((hi - lo) / step) + 1 }, (_, i) => lo + i * step);
const all = <T>(as: number[], bs: (a: number) => T[]) => as.flatMap(a => bs(a).map(b => [a, b] as [number, T]));
// いくつかの数の範囲の、すべての組み合わせ
const product = (...lists: number[][]): number[][] => lists.reduce<number[][]>((acc, l) => acc.flatMap(x => l.map(y => [...x, y])), [[]]);
const args = (card: string) => card.slice(card.indexOf(':') + 1).split(',');
const box = '<span class="box">？</span>';
const formula = (s: string) => `<span class="formula">${s}</span>`;
const sentence = (s: string) => `<span class="sentence">${s}</span>`;
const stack = (...parts: string[]) => `<div class="stack">${parts.join('')}</div>`;
const frac = (a: number, b: number) => (a === b ? '1' : `<span class="frac"><span>${a}</span><span>${b}</span></span>`);

// いつも同じ並びになる乱数（プールや図を作るため）
function seeded(seed: string): Rng {
  let x = [...seed].reduce((h, c) => Math.imul(h ^ c.charCodeAt(0), 16777619), 2166136261) >>> 0;
  return () => {
    x = (x + 0x6d2b79f5) >>> 0;
    let t = x;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
// 多すぎるときは、決まった並びで n 個だけ
const sample = <T>(id: string, list: T[], n: number): T[] => (list.length <= n ? list : shuffle(seeded(id), list).slice(0, n));
// いくつかのリストを、1つずつ順番にまぜる
function interleave<T>(lists: T[][]): T[] {
  const out: T[] = [];
  for (let i = 0; lists.some(l => i < l.length); i++) for (const l of lists) if (i < l.length) out.push(l[i]);
  return out;
}

function choice(card: string, rng: Rng, prompt: string, correct: string, wrong: string[], note?: string): Question {
  const [choices, answer] = makeChoices(rng, correct, wrong);
  return { kind: 'choice', card, prompt, choices, answer, note };
}
const number = (card: string, prompt: string, answer: number): Question => ({ kind: 'number', card, prompt, answer });

function category(id: string, name: string, grade: Grade, cards: () => string[], make: (card: string, rng: Rng, p: Profile) => Question, quiz = true): Category {
  return { id, name, grade, quiz, cards: once(cards), make };
}

// ---- 年長: 絵をかぞえる → 絵のたし算・ひき算（字が読めなくても解ける） ----

function kazuCategory(id: string, name: string, cards: () => string[]): Category {
  return category(id, name, 'k', cards, (card, rng) => {
    const m = card.match(/^kazu:(\d+)(?:([+-])(\d+))?$/)!;
    const e = pick(rng, THINGS);
    const a = Number(m[1]), b = Number(m[3] ?? 0);
    const ans = m[2] === '+' ? a + b : m[2] === '-' ? a - b : a;
    const prompt = !m[2] ? row(e, a) : `${row(e, a)}<span class="op">${m[2] === '+' ? '＋' : 'ー'}</span>${row(e, b)}`;
    return choice(card, rng, prompt, String(ans), [-2, -1, 1, 2].map(d => ans + d).filter(n => n >= 0).map(String));
  });
}

export const kazuCount = kazuCategory('kazu-count', 'かぞえる', () => range(1, 10).map(n => `kazu:${n}`));
export const kazuAdd = kazuCategory('kazu-add', 'えの たしざん', () =>
  all(range(1, 9), a => range(1, 10 - a)).sort((x, y) => x[0] + x[1] - y[0] - y[1]).map(([a, b]) => `kazu:${a}+${b}`));
export const kazuSub = kazuCategory('kazu-sub', 'えの ひきざん', () => all(range(2, 10), a => range(1, a - 1)).map(([a, b]) => `kazu:${a}-${b}`));

// どっちが おおい（絵の列をえらぶ。同じなら ＝）
export const kurabe = category('kurabe', 'どっちが おおい', 'k', () => all(range(1, 10), () => range(1, 10)).map(([a, b]) => `kurabe:${a},${b}`), (card, rng) => {
  const [a, b] = args(card).map(Number);
  const [e1, e2] = shuffle(rng, THINGS);
  return {
    kind: 'choice', card, prompt: '<span class="hint">おおい ほうを タップ</span>',
    choices: [row(e1, a, 36), row(e2, b, 36), '＝'], answer: a > b ? 0 : a < b ? 1 : 2,
  };
});

// ---- けいさん（テンキーで答える） ----

type Op = '+' | '−' | '×' | '÷';
const calc = (a: number, op: Op, b: number) => (op === '+' ? a + b : op === '−' ? a - b : op === '×' ? a * b : a / b);
const SIGN: Record<Op, string> = { '+': '＋', '−': '−', '×': '×', '÷': '÷' };

// たての式（筆算）
function hissan(a: number, op: Op, b: number): string {
  const w = String(Math.max(a, b, calc(a, op, b))).length;
  const cells = (n: number | string) => String(n).padStart(w, ' ').split('').map(c => `<td>${c.trim()}</td>`).join('');
  return `<table class="hissan"><tr><td></td>${cells(a)}</tr><tr><td>${SIGN[op]}</td>${cells(b)}</tr><tr class="line"><td></td>${cells('')}</tr></table>`;
}

function keisanCategory(id: string, name: string, grade: Grade, list: () => [number, Op, number][], vertical = false): Category {
  return category(id, name, grade, () => list().map(([a, op, b]) => `keisan:${a}${op}${b}`), card => {
    const [, a, o, b] = card.match(/^keisan:(\d+)([+−×÷])(\d+)$/)!;
    const op = o as Op;
    return number(card, vertical ? hissan(+a, op, +b) : formula(`${a} ${SIGN[op]} ${b} ＝ ?`), calc(+a, op, +b));
  });
}
const withOp = (op: Op, list: [number, number][]) => list.map(([a, b]) => [a, op, b] as [number, Op, number]);
const bySum = (x: [number, number], y: [number, number]) => x[0] + x[1] - y[0] - y[1];

// ランダムな組を、決まった並びで n 個（すべて並べると多すぎるとき）
function randomPairs(id: string, n: number, a: [number, number], b: (a: number) => [number, number]): [number, number][] {
  const rng = seeded(id), seen = new Set<string>(), out: [number, number][] = [];
  while (out.length < n) {
    const x = a[0] + Math.floor(rng() * (a[1] - a[0] + 1));
    const [lo, hi] = b(x);
    const y = lo + Math.floor(rng() * (hi - lo + 1));
    if (!seen.has(`${x},${y}`)) { seen.add(`${x},${y}`); out.push([x, y]); }
  }
  return out;
}

// 1年
export const add10 = keisanCategory('add-10', 'たしざん（10まで）', 1, () => withOp('+', all(range(1, 9), a => range(1, 10 - a)).sort(bySum)));
export const addCarry = keisanCategory('add-carry', 'くりあがりの たしざん', 1, () => withOp('+', all(range(2, 9), a => range(11 - a, 9)).sort(bySum)));
export const sub10 = keisanCategory('sub-10', 'ひきざん（10まで）', 1, () => withOp('−', all(range(2, 10), a => range(1, a - 1))));
export const subBorrow = keisanCategory('sub-borrow', 'くりさがりの ひきざん', 1, () => withOp('−', all(range(11, 18), a => range(a - 9, 9))));
// 何十の計算と、くり上がり・くり下がりのない 2けた ± 1けた
export const nanjuu = keisanCategory('nanjuu', 'なんじゅうの けいさん', 1, () => interleave([
  withOp('+', all(range(1, 9), a => range(1, 10 - a)).map(([a, b]) => [a * 10, b * 10])),
  withOp('−', all(range(2, 10), a => range(1, a - 1)).map(([a, b]) => [a * 10, b * 10])),
  withOp('+', sample('nanjuu+', all(range(21, 98).filter(n => n % 10 && n % 10 < 9), a => range(1, 9 - (a % 10))), 45)),
  withOp('−', sample('nanjuu-', all(range(22, 99).filter(n => n % 10 > 1), a => range(1, (a % 10) - 1)), 45)),
]));
// 2年（筆算の形）
export const add2 = keisanCategory('add-2', '2けたの たしざん', 2, () => withOp('+', sample('add-2', all(range(11, 79), a => range(11, 99 - a)), 150)), true);
export const sub2 = keisanCategory('sub-2', '2けたの ひきざん', 2, () => withOp('−', sample('sub-2', all(range(21, 99), a => range(11, a - 1)), 150)), true);
export const kuku1 = keisanCategory('kuku-1', 'かけざん（2〜5の だん）', 2, () => withOp('×', all(range(2, 5), () => range(1, 9))));
export const kuku2 = keisanCategory('kuku-2', 'かけざん（6〜9と 1の だん）', 2, () => withOp('×', [...all(range(6, 9), () => range(1, 9)), ...all([1], () => range(1, 9))]));
// 3年
export const add3 = keisanCategory('add-3', '3けたの たしざん', 3, () => withOp('+', randomPairs('add-3', 150, [101, 899], a => [11, 999 - a])), true);
export const sub3 = keisanCategory('sub-3', '3けたの ひきざん', 3, () => withOp('−', randomPairs('sub-3', 150, [101, 999], a => [11, a - 1])), true);
export const waru = keisanCategory('waru', 'わりざん', 3, () => withOp('÷', all(range(2, 9), () => range(1, 9)).map(([b, q]) => [b * q, b])));
export const kake1 = keisanCategory('kake-1', 'かけざん（×1けた）', 3, () => withOp('×', interleave([
  randomPairs('kake-1a', 100, [11, 99], () => [2, 9]),
  randomPairs('kake-1b', 50, [101, 999], () => [2, 9]),
])), true);
export const kake2 = keisanCategory('kake-2', 'かけざん（2けた×2けた）', 3, () => withOp('×', randomPairs('kake-2', 150, [11, 99], () => [11, 99])), true);

// あまりのある わりざん（3択）
export const amari = category('amari', 'あまりの ある わりざん', 3, () => all(range(2, 9), b => all(range(1, 9), () => range(1, b - 1)))
  .map(([b, [q, r]]) => `amari:${b * q + r},${b}`), (card, rng) => {
  const [a, b] = args(card).map(Number);
  const q = Math.floor(a / b), r = a % b;
  const lab = (x: number, y: number) => `${x} あまり ${y}`;
  // よくあるまちがい: あまりが わる数より大きい・答えが1ちがう
  return choice(card, rng, formula(`${a} ÷ ${b}`), lab(q, r), [lab(q - 1, r + b), lab(q + 1, r), lab(q, r === 1 ? 2 : r - 1)]);
});

// ---- 1年: 数のしくみ ----

// いくつと いくつ（● の絵つき）
export const ikutsu = category('ikutsu', 'いくつと いくつ', 1, () => all(range(2, 10), n => range(1, n - 1)).map(([n, a]) => `ikutsu:${n},${a}`), card => {
  const [n, a] = args(card).map(Number);
  return number(card, stack(`<span class="dots"><span class="on">${'●'.repeat(a)}</span><span class="off">${'●'.repeat(n - a)}</span></span>`, formula(`${n} は ${a} と ${box}`)), n - a);
});

// かずの ならび（1ずつ・2ずつ・5ずつ・10ずつ）
export const narabi = category('narabi', 'かずの ならび', 1, () => sample('narabi', [
  ...product(range(1, 96), [1]), ...product(range(2, 90, 2), [2]), ...product(range(5, 95, 5), [5]), ...product(range(1, 60), [10]),
].flatMap(([s, step]) => range(1, 4).map(k => `narabi:${s},${step},${k}`)), 120), card => {
  const [s, step, k] = args(card).map(Number);
  const seq = range(0, 4).map(i => s + step * i);
  return number(card, stack(sentence(`${box} に はいる かずは？`), formula(seq.map((x, i) => (i === k ? box : x)).join('、'))), seq[k]);
});

// 3つの かずの けいさん（とちゅうの答えも 0〜20）
export const mittsu = category('mittsu', '3つの かずの けいさん', 1, () => {
  const list: string[] = [];
  for (const a of range(1, 10)) for (const b of range(1, 9)) for (const c of range(1, 9)) for (const o1 of ['+', '−'] as Op[]) for (const o2 of ['+', '−'] as Op[]) {
    const mid = calc(a, o1, b), ans = calc(mid, o2, c);
    if (mid >= 0 && mid <= 20 && ans >= 0 && ans <= 20) list.push(`mittsu:${a},${o1},${b},${o2},${c}`);
  }
  return sample('mittsu', list, 120);
}, card => {
  const [a, o1, b, o2, c] = args(card);
  return number(card, formula(`${a} ${SIGN[o1 as Op]} ${b} ${SIGN[o2 as Op]} ${c} ＝ ?`), calc(calc(+a, o1 as Op, +b), o2 as Op, +c));
});

// ながさくらべ（マスの いくつぶん）
export const nagasa = category('nagasa', 'ながさくらべ', 1, () => all(range(3, 10), a => range(3, 10).filter(b => b !== a)).map(([a, b]) => `nagasa:${a},${b}`), (card, rng) => {
  const [a, b] = args(card).map(Number);
  const cell = 22, w = 10 * cell + 40;
  const grid = range(0, 10).map(i => `<line x1="${30 + i * cell}" y1="4" x2="${30 + i * cell}" y2="84" stroke="#cbd5e1"/>`).join('');
  const tape = (y: number, n: number, c: string, label: string) => `<text x="8" y="${y + 16}" font-size="16" font-weight="700" fill="#1f2937">${label}</text><rect x="30" y="${y}" width="${n * cell}" height="22" rx="4" fill="${c}"/>`;
  const svg = `<svg class="fig" viewBox="0 0 ${w} 88" width="${w}">${grid}${tape(10, a, '#fda4af', 'あ')}${tape(52, b, '#93c5fd', 'い')}</svg>`;
  const longer = a > b ? 'あ' : 'い', other = a > b ? 'い' : 'あ', d = Math.abs(a - b);
  const lab = (x: string, n: number) => `${x}が ${n}つぶん`;
  return choice(card, rng, stack(svg, sentence('どちらが マスの いくつぶん ながい？')), lab(longer, d), [lab(other, d), lab(longer, d + 1), lab(longer, d > 1 ? d - 1 : d + 2)]);
});

// ---- 文章題（式をえらぶ。答えは note で見せる） ----

const bunAnswer = (op: BunOp, a: number, b: number) => calc(a, op, b);
function bunWrong(op: BunOp, a: number, b: number): string[] {
  const s = (x: number, o: Op, y: number) => `${x} ${SIGN[o]} ${y}`;
  if (op === '+') return [s(a, '−', b), s(b, '−', a)];
  if (op === '−') return [s(a, '+', b), s(b, '−', a)];
  if (op === '×') return [s(a, '+', b), s(a, '−', b)];
  return [s(a, '×', b), s(a, '−', b)];
}

function bunCategory(id: string, grade: Grade, templates: BunTemplate[], per: number, amariTemplates: AmariTemplate[] = []): Category {
  const byId = new Map(templates.map(t => [t.id, t]));
  const amariById = new Map(amariTemplates.map(t => [t.id, t]));
  return category(id, 'ぶんしょうだい', grade, () => interleave([
    ...templates.map(t => sample(`${id}:${t.id}`, t.pairs(), per).map(([a, b]) => `${id}:${t.id},${a},${b}`)),
    ...amariTemplates.map(t => sample(`${id}:${t.id}`, all(range(3, 8), b => all(range(2, 7), () => range(1, b - 1))), per)
      .map(([b, [q, r]]) => `${id}:${t.id},${b * q + r},${b}`)),
  ]), (card, rng) => {
    const [tid, as, bs] = args(card);
    const a = Number(as), b = Number(bs);
    const t = byId.get(tid);
    if (t) {
      return choice(card, rng, stack(`<div class="passage">${t.text(a, b)}</div>`, sentence('しきは どれ？')),
        `${a} ${SIGN[t.op]} ${b}`, bunWrong(t.op, a, b), `こたえ ${bunAnswer(t.op, a, b)}${t.unit}`);
    }
    // あまりを かんがえる（切り上げ / 切り捨て は型ごとに決めてある）
    const m = amariById.get(tid)!;
    const q = Math.floor(a / b), r = a % b;
    const ans = m.up ? q + 1 : q;
    return choice(card, rng, `<div class="passage">${m.text(a, b)}</div>`, `${ans}${m.unit}`,
      [m.up ? q : q + 1, r, ans + 1, ans + 2].map(x => `${x}${m.unit}`), `${a} ÷ ${b} ＝ ${q} あまり ${r}`);
  }, false);
}

export const bun1 = bunCategory('bun1', 1, BUN1, 25);
export const bun2 = bunCategory('bun2', 2, BUN2, 20);
export const bun3 = bunCategory('bun3', 3, BUN3, 25, AMARI);

// ---- とけい・時こくと時間 ----

const hour12 = (h: number) => ((h + 11) % 12) + 1;
// 1年はまだ「時・分」の漢字を習わないので、ひらがなで
const timeKana = (h: number, m: number) => `${hour12(h)}じ${m ? `${m}${m % 10 === 5 ? 'ふん' : 'ぷん'}` : ''}`;
const timeLabel = (h: number, m: number) => `${hour12(h)}時${m ? `${m}分` : ''}`;
const addMin = (h: number, m: number, d: number): [number, number] => { const t = h * 60 + m + d; return [Math.floor(t / 60), ((t % 60) + 60) % 60]; };

function tokeiCategory(id: string, name: string, grade: Grade, list: () => [number, number][]): Category {
  const label = grade === 1 ? timeKana : timeLabel;
  return category(id, name, grade, () => list().map(([h, m]) => `tokei:${h}:${m}`), (card, rng) => {
    const [, hs, ms] = card.split(':');
    const h = Number(hs), m = Number(ms);
    return choice(card, rng, clockSvg(h, m), label(h, m), [
      label(h + 1, m), label(h - 1, m),
      // 長いはりと短いはりを取りちがえる
      label(Math.round(m / 5) || 12, (h % 12) * 5),
      label(h, (m + 5) % 60), label(h, (m + 55) % 60),
    ]);
  });
}

const hours = (mins: number[]) => mins.flatMap(m => range(1, 12).map(h => [h, m] as [number, number]));
export const tokei1 = tokeiCategory('tokei-1', 'とけい（なんじ・なんじはん）', 1, () => hours([0, 30]));
export const tokei2 = tokeiCategory('tokei-2', 'とけい（なんじ なんぷん）', 1, () => sample('tokei-2', hours(range(5, 55, 5).filter(m => m !== 30)), 144));
export const tokei3 = tokeiCategory('tokei-3', 'とけい（1ぷん きざみ）', 2, () => sample('tokei-3', hours(range(0, 59)), 150));

// ○分あと・○分まえの 時こく（時計の絵つき）
export const jikoku = category('jikoku', 'じこくと じかん', 2, () => sample('jikoku',
  product(range(1, 11), range(0, 55, 5), [5, 10, 15, 20, 30, 40, 50], [1, -1]).map(x => `jikoku:${x.join(',')}`), 150), (card, rng) => {
  const [h, m, d, s] = args(card).map(Number);
  const [h2, m2] = addMin(h, m, d * s);
  return choice(card, rng, stack(clockSvg(h, m), sentence(`${d}分 ${s > 0 ? 'あと' : 'まえ'}の 時こくは？`)), timeLabel(h2, m2), [
    timeLabel(h, m2),   // 時を またぐのを わすれる
    timeLabel(h2 + s, m2), timeLabel(h2, (m2 + 10) % 60), timeLabel(h2 - s, m2),
  ]);
});

// 3年: 時間の計算
export const jikan = category('jikan', 'じかんの けいさん', 3, () => interleave([
  sample('jikan-a', product(range(7, 10), range(5, 55, 5), range(10, 50, 5)).filter(([, m, d]) => m + d > 60).map(x => `jikan:after,${x.join(',')}`), 80),
  sample('jikan-k', product(range(7, 10), range(10, 55, 5), range(5, 50, 5)).map(x => `jikan:kan,${x.join(',')}`), 60),
  sample('jikan-b', all(range(1, 5), () => range(1, 59)).map(([a, b]) => `jikan:byou,${a},${b}`), 40),
]), (card, rng) => {
  const [t, ...rest] = args(card);
  const [a, b, c] = rest.map(Number);
  if (t === 'after') {
    const [h2, m2] = addMin(a, b, c);
    return choice(card, rng, sentence(`${timeLabel(a, b)} から ${c}分 たつと、なん時なん分？`), timeLabel(h2, m2), [
      `${hour12(a)}時${b + c}分`, timeLabel(h2 + 1, m2), timeLabel(h2, (m2 + 10) % 60), timeLabel(h2 - 1, m2)]);
  }
  if (t === 'kan') return number(card, sentence(`${timeLabel(a, b)} から ${timeLabel(a + 1, c)} まで、なん分間？`), 60 - b + c);
  return number(card, formula(`${a}分 ${b}びょう ＝ ${box} びょう`), a * 60 + b);
});

// ---- 2年: 数・長さ・かさ・分数・形・グラフ ----

// 1000までの数・10000までの数（位ごとの数を あわせる）
export const kazu2 = category('kazu2', '1000までの かず', 2, () => interleave([
  sample('kazu2-3', range(101, 999), 100), sample('kazu2-4', range(1001, 9999), 50),
]).map(n => `kazu2:${n}`), card => {
  const n = Number(args(card)[0]);
  const digits = String(n).split('').map(Number);
  const parts = digits.map((d, i) => [10 ** (digits.length - 1 - i), d]).filter(([, d]) => d > 0);
  return number(card, sentence(`${parts.map(([u, d]) => `${u}を ${d}こ`).join('、')} あわせた かずは？`), n);
});

// ものさし（cm・mm）
export const monosashi = category('monosashi', 'ものさし', 2, () => range(12, 98).map(mm => `mono:${mm}`), (card, rng) => {
  const mm = Number(args(card)[0]), W = 330, s = 3;
  const ticks = range(0, 100).map(i => {
    const x = 15 + i * s, hgt = i % 10 === 0 ? 18 : i % 5 === 0 ? 12 : 7;
    return `<line x1="${x}" y1="40" x2="${x}" y2="${40 + hgt}" stroke="#334155" stroke-width="${i % 10 ? 0.7 : 1.3}"/>` + (i % 10 === 0 ? `<text x="${x}" y="74" font-size="11" text-anchor="middle" fill="#1f2937">${i / 10}</text>` : '');
  }).join('');
  const svg = `<svg class="fig" viewBox="0 0 ${W} 82" width="${W}"><rect x="15" y="12" width="${mm * s}" height="20" rx="3" fill="#fda4af"/><rect x="8" y="38" width="${W - 16}" height="42" rx="4" fill="#fef9c3" stroke="#ca8a04"/>${ticks}</svg>`;
  const cm = Math.floor(mm / 10), r = mm % 10;
  const lab = (c: number, m: number) => (m ? `${c}cm ${m}mm` : `${c}cm`);
  return choice(card, rng, stack(svg, sentence('テープの ながさは？')), lab(cm, r), [lab(r, cm), lab(cm + 1, r), lab(cm, (r + 5) % 10), `${mm}cm`]);
});

// 長さの たんい（cm・mm・m）
export const nagasaTani = category('nagasa-tani', 'ながさの たんい', 2, () => interleave([
  sample('cm_mm', all(range(1, 15), () => range(1, 9)), 40).map(([a, b]) => `tani2:cm_mm,${a},${b}`),
  sample('mm_cm', all(range(1, 15), () => range(1, 9)), 40).map(([a, b]) => `tani2:mm_cm,${a},${b}`),
  sample('m_cm', all(range(1, 3), () => range(5, 95, 5)), 40).map(([a, b]) => `tani2:m_cm,${a},${b}`),
]), card => {
  const [t, as, bs] = args(card);
  const a = Number(as), b = Number(bs);
  if (t === 'cm_mm') return number(card, formula(`${a}cm ${b}mm ＝ ${box} mm`), a * 10 + b);
  if (t === 'mm_cm') return number(card, formula(`${a * 10 + b}mm ＝ ${box} cm ${b}mm`), a);
  return number(card, formula(`${a}m ${b}cm ＝ ${box} cm`), a * 100 + b);
});

// かさ（L・dL・mL）
export const kasa = category('kasa', 'かさ', 2, () => interleave([
  sample('L_dL', all(range(1, 9), () => range(1, 9)), 40).map(([a, b]) => `kasa:L_dL,${a},${b}`),
  sample('dL_L', all(range(1, 9), () => range(1, 9)), 40).map(([a, b]) => `kasa:dL_L,${a},${b}`),
  range(1, 9).map(a => `kasa:L_mL,${a},0`),
  range(1, 9).map(a => `kasa:dL_mL,${a},0`),
]), card => {
  const [t, as, bs] = args(card);
  const a = Number(as), b = Number(bs);
  if (t === 'L_dL') return number(card, formula(`${a}L ${b}dL ＝ ${box} dL`), a * 10 + b);
  if (t === 'dL_L') return number(card, formula(`${a * 10 + b}dL ＝ ${box} L ${b}dL`), a);
  if (t === 'L_mL') return number(card, formula(`${a}L ＝ ${box} mL`), a * 1000);
  return number(card, formula(`${a}dL ＝ ${box} mL`), a * 100);
});

// 分数（図の 1つぶん / いくつの 1/n）
function fracFigure(n: number, shape: string): string {
  if (shape === 'bar') {
    const W = 240, H = 64, w = (W - 20) / n;
    return `<svg class="fig" viewBox="0 0 ${W} ${H}" width="${W}">${range(0, n - 1).map(i => `<rect x="${10 + i * w}" y="8" width="${w}" height="${H - 16}" fill="${i === 0 ? '#fda4af' : '#fff'}" stroke="#0e7490" stroke-width="2"/>`).join('')}</svg>`;
  }
  // まるい ケーキ
  const cx = 60, cy = 60, r = 50;
  const pt = (k: number) => `${cx + r * Math.sin((k / n) * 2 * Math.PI)},${cy - r * Math.cos((k / n) * 2 * Math.PI)}`;
  const slices = range(0, n - 1).map(k => `<path d="M${cx},${cy} L${pt(k)} A${r},${r} 0 0 1 ${pt(k + 1)} Z" fill="${k === 0 ? '#fda4af' : '#fff'}" stroke="#0e7490" stroke-width="2"/>`).join('');
  return `<svg class="fig small" viewBox="0 0 120 120" width="130">${slices}</svg>`;
}
export const bunsu2 = category('bunsu2', 'ぶんすう', 2, () => interleave([
  all([2, 3, 4, 8], () => ['bar', 'pie']).map(([n, s]) => `bunsu2:fig,${n},${s}`),
  [2, 3, 4].flatMap(n => range(n * 2, 20, n).map(x => `bunsu2:of,${n},${x}`)),
]), (card, rng) => {
  const [t, ns, x] = args(card);
  const n = Number(ns);
  if (t === 'fig') {
    return choice(card, rng, stack(fracFigure(n, x), sentence('いろの ところは、もとの 大きさの なんぶんの 一？')), frac(1, n), [2, 3, 4, 8].filter(k => k !== n).map(k => frac(1, k)));
  }
  return number(card, sentence(`${x}この ${frac(1, n)} は なんこ？`), Number(x) / n);
});

// 形（長方形・正方形・直角三角形を見分ける）。図の形はカードごとに決まる
const SHAPE_STYLE = 'fill="#bae6fd" stroke="#0e7490" stroke-width="2"';
function shapeSvg(kind: string, rng: Rng): string {
  const svg = (inner: string) => `<svg class="shape" viewBox="0 0 60 60">${inner}</svg>`;
  const rot = (inner: string) => `<g transform="rotate(${pick(rng, [0, 90, 180, 270])} 30 30)">${inner}</g>`;
  const n = (lo: number, span: number) => lo + Math.floor(rng() * span);
  switch (kind) {
    case 'せいほうけい': { const s = n(26, 16); return svg(`<rect x="${30 - s / 2}" y="${30 - s / 2}" width="${s}" height="${s}" ${SHAPE_STYLE}/>`); }
    case 'ちょうほうけい': { const w = n(44, 10), h = n(18, 12); return svg(rot(`<rect x="${30 - w / 2}" y="${30 - h / 2}" width="${w}" height="${h}" ${SHAPE_STYLE}/>`)); }
    case 'ちょっかくさんかくけい': { const w = n(30, 20), h = n(30, 20); return svg(rot(`<polygon points="${30 - w / 2},${30 + h / 2} ${30 - w / 2},${30 - h / 2} ${30 + w / 2},${30 + h / 2}" ${SHAPE_STYLE}/>`)); }
    case 'さんかくけい': return svg(rot(`<polygon points="${n(16, 28)},8 54,52 6,52" ${SHAPE_STYLE}/>`));
    case 'だいけい': return svg(rot(`<polygon points="18,14 42,14 56,48 4,48" ${SHAPE_STYLE}/>`));
    case 'ひしがた': return svg(`<polygon points="30,4 54,30 30,56 6,30" ${SHAPE_STYLE}/>`);
    default: return svg(`<circle cx="30" cy="30" r="22" ${SHAPE_STYLE}/>`);
  }
}
const SHAPES = ['せいほうけい', 'ちょうほうけい', 'ちょっかくさんかくけい', 'さんかくけい', 'だいけい', 'ひしがた', 'えん'];
export const katachi = category('katachi', 'かたち', 2, () => all(range(0, 2), () => range(0, 9)).map(([t, v]) => `katachi:${t},${v}`), (card, rng) => {
  const target = SHAPES[Number(args(card)[0])];
  const fig = seeded(card);
  // 正方形は長方形の なかまなので、長方形の問題の はずれに 正方形を 入れない
  const others = shuffle(fig, SHAPES.filter(k => k !== target && !(target === 'ちょうほうけい' && k === 'せいほうけい'))).slice(0, 2);
  return choice(card, rng, sentence(`「${target}」は どれ？`), shapeSvg(target, fig), others.map(k => shapeSvg(k, fig)));
});

// 表とグラフ（絵グラフを読む）
const FRUITS = ['りんご', 'みかん', 'ぶどう', 'もも'];
const FRUIT_COLORS = ['#ef4444', '#f97316', '#8b5cf6', '#ec4899'];
export const graph = category('graph', 'ひょうと グラフ', 2, () => range(0, 59).map(i => `graph:${i}`), (card, rng) => {
  const fig = seeded(card);
  let c: number[];
  do c = FRUITS.map(() => 1 + Math.floor(fig() * 8)); while (c.filter(x => x === Math.max(...c)).length > 1);
  const cols = FRUITS.map((f, k) => `<div class="g-col"><div class="g-dots">${`<span style="color:${FRUIT_COLORS[k]}">●</span>`.repeat(c[k])}</div><div class="g-name">${f}</div></div>`).join('');
  const pic = `<div class="pictograph">${cols}</div>`;
  if (Number(args(card)[0]) % 2 === 0) {
    const top = FRUITS[c.indexOf(Math.max(...c))];
    return choice(card, rng, stack(pic, sentence('いちばん おおいのは？')), top, FRUITS.filter(f => f !== top));
  }
  // 数のちがう2つをくらべる（いちばん多いものは かならず ほかと ちがう）
  const x = c.indexOf(Math.max(...c));
  const y = shuffle(fig, [0, 1, 2, 3].filter(k => k !== x))[0];
  return number(card, stack(pic, sentence(`${FRUITS[x]}は ${FRUITS[y]}より いくつ おおい？`)), c[x] - c[y]);
});

// ---- 3年: 大きな数・小数・分数・たんい・円・□の式・ぼうグラフ ----

export const ookii = category('ookii', 'おおきな かず', 3, () => sample('ookii', all(range(1, 9), () => all(range(0, 9), () => range(0, 9))), 150)
  .map(([a, [b, c]]) => `ookii:${a},${b},${c}`), (card, rng) => {
  const [a, b, c] = args(card).map(Number);
  const n = a * 10000 + b * 1000 + c * 100;
  const parts = [[10000, a], [1000, b], [100, c]].filter(([, d]) => d > 0).map(([u, d]) => `${u}を ${d}こ`).join('、');
  // はずれは 位の ずれ
  return choice(card, rng, sentence(`${parts} あわせた かずは？`), String(n),
    [String(n / 10), String(n * 10), String(a * 10000 + b * 100 + c * 10), String(n + 10000)]);
});

const dec = (tenths: number) => (tenths % 10 === 0 ? String(tenths / 10) : (tenths / 10).toFixed(1));
export const shosu = category('shosu', 'しょうすう', 3, () => interleave([
  range(1, 19).filter(k => k !== 10).map(k => `shosu:line,${k},0`),
  sample('shosu+', all(range(1, 9), () => range(1, 9)), 60).map(([a, b]) => `shosu:add,${a},${b}`),
  sample('shosu-', all(range(2, 9), a => range(1, a - 1)), 30).map(([a, b]) => `shosu:sub,${a},${b}`),
]), (card, rng) => {
  const [t, as, bs] = args(card);
  const a = Number(as), b = Number(bs);
  if (t === 'line') {
    const W = 330, s = 15;
    const ticks = range(0, 20).map(i => `<line x1="${15 + i * s}" y1="30" x2="${15 + i * s}" y2="${i % 10 ? 40 : 46}" stroke="#334155" stroke-width="${i % 10 ? 1 : 2}"/>` + (i % 10 ? '' : `<text x="${15 + i * s}" y="62" font-size="13" text-anchor="middle" fill="#1f2937">${i / 10}</text>`)).join('');
    const x = 15 + a * s;
    const svg = `<svg class="fig" viewBox="0 0 ${W} 70" width="${W}"><line x1="15" y1="35" x2="${15 + 20 * s}" y2="35" stroke="#334155" stroke-width="2"/>${ticks}<polygon points="${x - 7},6 ${x + 7},6 ${x},22" fill="#e11d48"/></svg>`;
    return choice(card, rng, stack(svg, sentence('▼の ところの かずは？')), dec(a), [dec(a + 1), dec(a - 1), String(a)]);
  }
  const ans = t === 'add' ? a + b : a - b;
  return choice(card, rng, formula(`${dec(a)} ${t === 'add' ? '＋' : '−'} ${dec(b)}`), dec(ans), [dec(ans + 1), dec(ans - 1), String(ans)]);
});

export const bunsu3 = category('bunsu3', 'ぶんすう', 3, () => interleave([
  all(range(3, 10), n => range(2, n - 1)).map(([n, a]) => `bunsu3:nanko,${n},${a},0`),
  sample('bunsu3+', all(range(3, 10), n => all(range(1, n - 1), a => range(1, n - a))), 60)
    .flatMap(([n, [a, b]]) => [`bunsu3:add,${n},${a},${b}`]),
  sample('bunsu3-', all(range(3, 10), n => all(range(2, n), a => range(1, a - 1))), 40)
    .flatMap(([n, [a, b]]) => [`bunsu3:sub,${n},${a},${b}`]),
]), (card, rng) => {
  const [t, ...rest] = args(card);
  const [n, a, b] = rest.map(Number);
  if (t === 'nanko') return choice(card, rng, sentence(`${frac(1, n)} の ${a}こぶんは？`), frac(a, n), [frac(1, n * a), frac(n, a), frac(a + 1, n)]);
  const ans = t === 'add' ? a + b : a - b;
  // よくあるまちがい: 分母どうしも たす・ひく
  const wrong = t === 'add'
    ? [frac(ans, n + n), frac(ans < n ? ans + 1 : ans - 1, n), frac(ans, n + 1)]
    : [frac(a + b, n), frac(ans + 1, n), frac(ans, n * 2)];
  return choice(card, rng, formula(`${frac(a, n)} ${t === 'add' ? '＋' : '−'} ${frac(b, n)}`), frac(ans, n), wrong);
});

export const tani3 = category('tani3', 'ながさと おもさの たんい', 3, () => interleave([
  sample('km', all(range(1, 5), () => range(100, 900, 100)), 40).map(([a, b]) => `tani3:km,${a},${b}`),
  sample('kg', all(range(1, 5), () => range(100, 900, 100)), 40).map(([a, b]) => `tani3:kg,${a},${b}`),
  sample('g_kg', all(range(1, 5), () => range(100, 900, 100)), 40).map(([a, b]) => `tani3:g_kg,${a},${b}`),
  range(1, 9).map(a => `tani3:kg_g,${a},0`),
]), card => {
  const [t, as, bs] = args(card);
  const a = Number(as), b = Number(bs);
  if (t === 'km') return number(card, formula(`${a}km ${b}m ＝ ${box} m`), a * 1000 + b);
  if (t === 'kg') return number(card, formula(`${a}kg ${b}g ＝ ${box} g`), a * 1000 + b);
  if (t === 'g_kg') return number(card, formula(`${a * 1000 + b}g ＝ ${box} kg ${b}g`), a);
  return number(card, formula(`${a}kg ＝ ${box} g`), a * 1000);
});

export const en = category('en', 'えん', 3, () => interleave([range(1, 20).map(r => `en:r,${r}`), range(2, 40, 2).map(d => `en:d,${d}`)]), (card, rng) => {
  const [t, xs] = args(card);
  const x = Number(xs);
  const radius = t === 'r';
  const line = `<line x1="${radius ? 70 : 20}" y1="60" x2="120" y2="60" stroke="#e11d48" stroke-width="3"/>`;
  const svg = `<svg class="fig small" viewBox="0 0 140 120" width="140"><circle cx="70" cy="60" r="50" fill="#e0f2fe" stroke="#0e7490" stroke-width="2"/>${line}<circle cx="70" cy="60" r="3" fill="#1f2937"/><text x="${radius ? 95 : 70}" y="52" font-size="14" text-anchor="middle" fill="#e11d48" font-weight="700">${x}cm</text></svg>`;
  const ans = radius ? x * 2 : x / 2;
  return choice(card, rng, stack(svg, sentence(`この えんの ${radius ? 'ちょっけい' : 'はんけい'}は？`)), `${ans}cm`, [`${x}cm`, `${radius ? x + 2 : x * 2}cm`, `${ans + 1}cm`]);
});

// □を つかった しき（答えを先に決めてから式を作る）
export const shiki = category('shiki', '□を つかった しき', 3, () => sample('shiki', [
  ...all(range(2, 30), () => range(2, 20)).map(([x, a]) => `shiki:add,${x},${a}`),
  ...all(range(2, 30), () => range(2, 20)).map(([x, a]) => `shiki:sub,${x},${a}`),
  ...all(range(2, 20), () => range(1, 30)).map(([x, a]) => `shiki:rsub,${x},${a}`),
  ...all(range(2, 9), () => range(2, 9)).map(([x, a]) => `shiki:mul,${x},${a}`),
  ...all(range(2, 9), () => range(2, 9)).map(([x, a]) => `shiki:div,${x},${a}`),
], 150), card => {
  const [t, xs, as] = args(card);
  const x = Number(xs), a = Number(as);
  if (t === 'add') return number(card, formula(`${box} ＋ ${a} ＝ ${x + a}`), x);
  if (t === 'sub') return number(card, formula(`${box} − ${a} ＝ ${x}`), x + a);
  if (t === 'rsub') return number(card, formula(`${x + a} − ${box} ＝ ${a}`), x);
  if (t === 'mul') return number(card, formula(`${box} × ${a} ＝ ${x * a}`), x);
  return number(card, formula(`${box} ÷ ${a} ＝ ${x}`), x * a);
});

// ぼうグラフ（1目もりが 1・2・5・10）
export const bouGraph = category('bou-graph', 'ぼうグラフ', 3, () => range(0, 59).map(i => `bou:${i}`), card => {
  const rng = seeded(card);
  const unit = [1, 2, 5, 10][Number(args(card)[0]) % 4];
  const names = ['いぬ', 'ねこ', 'うさぎ', 'とり'];
  const vals = names.map(() => unit * (1 + Math.floor(rng() * 9)));
  const k = Math.floor(rng() * 4);
  const H = 150, top = 10, max = unit * 10, W = 260, bw = 36;
  const y = (v: number) => top + H - (v / max) * H;
  const grid = range(0, 10).map(i => `<line x1="40" y1="${y(i * unit)}" x2="${W}" y2="${y(i * unit)}" stroke="${i % 5 ? '#e2e8f0' : '#94a3b8'}"/>` + (i % 5 ? '' : `<text x="34" y="${y(i * unit) + 4}" font-size="11" text-anchor="end" fill="#1f2937">${i * unit}</text>`)).join('');
  const bars = vals.map((v, i) => `<rect x="${55 + i * 52}" y="${y(v)}" width="${bw}" height="${(v / max) * H}" fill="${i === k ? '#e11d48' : '#38bdf8'}"/><text x="${55 + i * 52 + bw / 2}" y="${top + H + 16}" font-size="12" text-anchor="middle" fill="#1f2937">${names[i]}</text>`).join('');
  const svg = `<svg class="fig" viewBox="0 0 ${W + 10} ${H + 30}" width="${W + 10}">${grid}${bars}</svg>`;
  return number(card, stack(svg, sentence(`すきな どうぶつ しらべ。${names[k]}は なん人？`)), vals[k]);
}, false);

// アナログ時計の絵
export function clockSvg(h: number, m: number): string {
  const ticks = Array.from({ length: 60 }, (_, i) => {
    const a = (i / 60) * Math.PI * 2, r1 = i % 5 ? 44 : 40;
    return `<line x1="${50 + Math.sin(a) * r1}" y1="${50 - Math.cos(a) * r1}" x2="${50 + Math.sin(a) * 46}" y2="${50 - Math.cos(a) * 46}" stroke="#334155" stroke-width="${i % 5 ? 0.6 : 1.6}"/>`;
  }).join('');
  const nums = Array.from({ length: 12 }, (_, i) => {
    const a = ((i + 1) / 12) * Math.PI * 2;
    return `<text x="${50 + Math.sin(a) * 33}" y="${50 - Math.cos(a) * 33 + 3.5}" font-size="10" text-anchor="middle" fill="#1f2937">${i + 1}</text>`;
  }).join('');
  const ha = ((h % 12) + m / 60) / 12 * Math.PI * 2, ma = m / 60 * Math.PI * 2;
  const hand = (a: number, len: number, w: number, c: string) =>
    `<line x1="50" y1="50" x2="${50 + Math.sin(a) * len}" y2="${50 - Math.cos(a) * len}" stroke="${c}" stroke-width="${w}" stroke-linecap="round"/>`;
  return `<svg class="clock" viewBox="0 0 100 100"><circle cx="50" cy="50" r="47" fill="#fff" stroke="#334155" stroke-width="2"/>${ticks}${nums}${hand(ha, 22, 4, '#dc2626')}${hand(ma, 38, 2.5, '#1d4ed8')}<circle cx="50" cy="50" r="2.5" fill="#1f2937"/></svg>`;
}

// ゲームの中のクイズ用: テンキーの問題を3択に変える
export function numberToChoice(rng: Rng, q: Extract<Question, { kind: 'number' }>): Question {
  const spread = q.answer >= 10 ? [-10, -2, -1, 1, 2, 10] : [-2, -1, 1, 2];
  const [choices, answer] = makeChoices(rng, q.answer, spread.map(d => q.answer + d).filter(n => n >= 0));
  return { kind: 'choice', card: q.card, prompt: q.prompt, choices: choices.map(String), answer };
}
