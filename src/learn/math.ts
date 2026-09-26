import type { Question } from './types';
import { makeChoices, pick, randInt, type Rng } from './random';
import { iconHtml, type IconName } from '../art';

const THINGS: IconName[] = ['apple', 'fish', 'star', 'car', 'frog', 'donut', 'tulip', 'ladybug', 'balloon'];
export const LEVELS = { kazu: 5, keisan: 8, tokei: 4 } as const;

const row = (thing: IconName, n: number) => `<span class="things">${iconHtml(thing, 52).repeat(n)}</span>`;
const numChoices = (rng: Rng, ans: number, spread: number[]) =>
  makeChoices(rng, ans, spread.map(d => ans + d).filter(n => n >= 0));

// 年長〜1年: 絵をかぞえる → 絵のたし算・ひき算（字が読めなくても解ける）
export function kazu(rng: Rng, level: number): Question {
  const e = pick(rng, THINGS);
  let prompt: string, ans: number;
  if (level <= 2) {
    ans = randInt(rng, 1, level === 1 ? 5 : 10);
    prompt = row(e, ans);
  } else if (level <= 4) {
    const max = level === 3 ? 5 : 10;
    const a = randInt(rng, 1, max - 1), b = randInt(rng, 1, max - a);
    ans = a + b;
    prompt = `${row(e, a)}<span class="op">＋</span>${row(e, b)}`;
  } else {
    const a = randInt(rng, 2, 6), b = randInt(rng, 1, a - 1);
    ans = a - b;
    prompt = `${row(e, a)}<span class="op">ー</span>${row(e, b)}`;
  }
  const [choices, answer] = numChoices(rng, ans, [-2, -1, 1, 2]);
  return { kind: 'choice', track: 'kazu', prompt, choices: choices.map(String), answer };
}

// 1年〜: けいさん（テンキーで答える）
export function keisan(rng: Rng, level: number): Question {
  let a: number, b: number, op: '+' | '−' | '×';
  switch (level) {
    case 1: a = randInt(rng, 1, 8); b = randInt(rng, 1, 9 - a); op = '+'; break;
    case 2: a = randInt(rng, 2, 9); b = randInt(rng, 11 - a, 9); op = '+'; break;          // くりあがり
    case 3: a = randInt(rng, 11, 18); b = randInt(rng, a - 9, 9); op = '−'; break;         // くりさがり
    case 4: a = randInt(rng, 11, 79); b = randInt(rng, 11, 99 - a); op = '+'; break;
    case 5: a = randInt(rng, 21, 99); b = randInt(rng, 11, a - 1); op = '−'; break;
    case 6: a = randInt(rng, 2, 5); b = randInt(rng, 1, 9); op = '×'; break;               // 九九 2〜5のだん
    case 7: a = randInt(rng, 2, 9); b = randInt(rng, 1, 9); op = '×'; break;
    default: {
      a = randInt(rng, 101, 899);
      if (rng() < 0.5) { b = randInt(rng, 11, 999 - a); op = '+'; } else { b = randInt(rng, 11, a - 1); op = '−'; }
    }
  }
  const answer = op === '+' ? a + b : op === '−' ? a - b : a * b;
  return { kind: 'number', track: 'keisan', prompt: `<span class="formula">${a} ${op} ${b} ＝ ?</span>`, answer };
}

// とけい（アナログ時計の読み）
export function tokei(rng: Rng, level: number): Question {
  const h = randInt(rng, 1, 12);
  const m = level === 1 ? 0 : level === 2 ? pick(rng, [0, 30]) : level === 3 ? randInt(rng, 0, 11) * 5 : randInt(rng, 0, 59);
  const label = (hh: number, mm: number) => `${((hh + 11) % 12) + 1}時${mm ? `${mm}分` : ''}`;
  const wrong = [
    label(h + 1, m), label(h - 1, m),
    // 長いはりと短いはりを取りちがえる
    label(Math.round(m / 5) || 12, (h % 12) * 5),
    label(h, (m + 5) % 60), label(h, (m + 55) % 60),
  ];
  const [choices, answer] = makeChoices(rng, label(h, m), wrong);
  return { kind: 'choice', track: 'tokei', prompt: clockSvg(h, m), choices, answer };
}

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
  return { kind: 'choice', track: q.track, prompt: q.prompt, choices: choices.map(String), answer };
}
