import type { Question } from './types';
import type { Grade } from '../state/types';
import type { Category } from '../studies/types';
import { once } from '../studies/types';
import { makeChoices, pick, shuffle, type Rng } from './random';
import { iconHtml, type IconName } from '../art';

const THINGS: IconName[] = ['apple', 'fish', 'star', 'car', 'frog', 'donut', 'tulip', 'ladybug', 'balloon'];

// 算数の問題の作り方。カテゴリの一覧は src/studies/sansu.ts
// カードは1問ずつ（例: 'keisan:7+8'）。数が多い種類は、決まった並びで150問だけ選んでプールにする

const row = (thing: IconName, n: number) => `<span class="things">${iconHtml(thing, 52).repeat(n)}</span>`;
const numChoices = (rng: Rng, ans: number, spread: number[]) =>
  makeChoices(rng, ans, spread.map(d => ans + d).filter(n => n >= 0));

// いつも同じ並びになる乱数（プールを作るため）
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

function pairs(aMin: number, aMax: number, b: (a: number) => [number, number]): [number, number][] {
  const out: [number, number][] = [];
  for (let a = aMin; a <= aMax; a++) { const [lo, hi] = b(a); for (let x = lo; x <= hi; x++) out.push([a, x]); }
  return out;
}
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
// 多すぎるときは、決まった並びで n 問だけ
const sample = <T>(id: string, all: T[], n = 150): T[] => (all.length <= n ? all : shuffle(seeded(id), all).slice(0, n));

type Op = '+' | '−' | '×';
const calc = (a: number, op: Op, b: number) => (op === '+' ? a + b : op === '−' ? a - b : a * b);

// 年長〜1年: 絵をかぞえる → 絵のたし算・ひき算（字が読めなくても解ける）
function kazuCategory(id: string, name: string, cards: () => string[]): Category {
  return {
    id, name, grade: 'k', quiz: true, cards: once(cards),
    make(card, rng) {
      const m = card.match(/^kazu:(\d+)(?:([+-])(\d+))?$/)!;
      const e = pick(rng, THINGS);
      const a = Number(m[1]), b = Number(m[3] ?? 0);
      const ans = m[2] === '+' ? a + b : m[2] === '-' ? a - b : a;
      const prompt = !m[2] ? row(e, a) : `${row(e, a)}<span class="op">${m[2] === '+' ? '＋' : 'ー'}</span>${row(e, b)}`;
      const [choices, answer] = numChoices(rng, ans, [-2, -1, 1, 2]);
      return { kind: 'choice', card, prompt, choices: choices.map(String), answer };
    },
  };
}

export const kazuCount = kazuCategory('kazu-count', 'かぞえる', () => Array.from({ length: 10 }, (_, i) => `kazu:${i + 1}`));
export const kazuAdd = kazuCategory('kazu-add', 'えの たしざん', () =>
  pairs(1, 9, a => [1, 10 - a]).sort((x, y) => x[0] + x[1] - y[0] - y[1]).map(([a, b]) => `kazu:${a}+${b}`));
export const kazuSub = kazuCategory('kazu-sub', 'えの ひきざん', () => pairs(2, 10, a => [1, a - 1]).map(([a, b]) => `kazu:${a}-${b}`));

// けいさん（テンキーで答える）
function keisanCategory(id: string, name: string, grade: Grade, op: Op, list: () => [number, number][]): Category {
  return {
    id, name, grade, quiz: true,
    cards: once(() => list().map(([a, b]) => `keisan:${a}${op}${b}`)),
    make(card) {
      const [, a, o, b] = card.match(/^keisan:(\d+)([+−×])(\d+)$/)!;
      return { kind: 'number', card, prompt: `<span class="formula">${a} ${o} ${b} ＝ ?</span>`, answer: calc(Number(a), o as Op, Number(b)) };
    },
  };
}

const bySum = (x: [number, number], y: [number, number]) => x[0] + x[1] - y[0] - y[1];
export const add10 = keisanCategory('add-10', 'たしざん（10まで）', 1, '+', () => pairs(1, 9, a => [1, 10 - a]).sort(bySum));
export const addCarry = keisanCategory('add-carry', 'くりあがりの たしざん', 1, '+', () => pairs(2, 9, a => [11 - a, 9]).sort(bySum));
export const sub10 = keisanCategory('sub-10', 'ひきざん（10まで）', 1, '−', () => pairs(2, 10, a => [1, a - 1]));
export const subBorrow = keisanCategory('sub-borrow', 'くりさがりの ひきざん', 1, '−', () => pairs(11, 18, a => [a - 9, 9]));
export const add2 = keisanCategory('add-2', '2けたの たしざん', 2, '+', () => sample('add-2', pairs(11, 79, a => [11, 99 - a])));
export const sub2 = keisanCategory('sub-2', '2けたの ひきざん', 2, '−', () => sample('sub-2', pairs(21, 99, a => [11, a - 1])));
export const kuku1 = keisanCategory('kuku-1', 'かけざん（2〜5の だん）', 2, '×', () => pairs(2, 5, () => [1, 9]));
export const kuku2 = keisanCategory('kuku-2', 'かけざん（6〜9と 1の だん）', 2, '×', () => [...pairs(6, 9, () => [1, 9]), ...pairs(1, 1, () => [1, 9])]);
export const add3 = keisanCategory('add-3', '3けたの たしざん', 3, '+', () => randomPairs('add-3', 150, [101, 899], a => [11, 999 - a]));
export const sub3 = keisanCategory('sub-3', '3けたの ひきざん', 3, '−', () => randomPairs('sub-3', 150, [101, 999], a => [11, a - 1]));

// とけい（アナログ時計の読み）
function tokeiCategory(id: string, name: string, grade: Grade, list: () => [number, number][]): Category {
  return {
    id, name, grade, quiz: true,
    cards: once(() => list().map(([h, m]) => `tokei:${h}:${m}`)),
    make(card, rng) {
      const [, hs, ms] = card.split(':');
      const h = Number(hs), m = Number(ms);
      const label = (hh: number, mm: number) => `${((hh + 11) % 12) + 1}時${mm ? `${mm}分` : ''}`;
      const wrong = [
        label(h + 1, m), label(h - 1, m),
        // 長いはりと短いはりを取りちがえる
        label(Math.round(m / 5) || 12, (h % 12) * 5),
        label(h, (m + 5) % 60), label(h, (m + 55) % 60),
      ];
      const [choices, answer] = makeChoices(rng, label(h, m), wrong);
      return { kind: 'choice', card, prompt: clockSvg(h, m), choices, answer };
    },
  };
}

const hours = (mins: number[]) => mins.flatMap(m => Array.from({ length: 12 }, (_, i) => [i + 1, m] as [number, number]));
export const tokei1 = tokeiCategory('tokei-1', 'とけい（なんじ・なんじはん）', 1, () => hours([0, 30]));
export const tokei2 = tokeiCategory('tokei-2', 'とけい（なんじ なんぷん）', 2, () => sample('tokei-2', hours(Array.from({ length: 12 }, (_, i) => i * 5)), 144));
export const tokei3 = tokeiCategory('tokei-3', 'とけい（1ぷん きざみ）', 3, () => sample('tokei-3', hours(Array.from({ length: 60 }, (_, i) => i))));

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

// バトル中のクイズ用: テンキーの問題を3択に変える
export function numberToChoice(rng: Rng, q: Extract<Question, { kind: 'number' }>): Question {
  const spread = q.answer >= 10 ? [-10, -2, -1, 1, 2, 10] : [-2, -1, 1, 2];
  const [choices, answer] = numChoices(rng, q.answer, spread);
  return { kind: 'choice', card: q.card, prompt: q.prompt, choices: choices.map(String), answer };
}
