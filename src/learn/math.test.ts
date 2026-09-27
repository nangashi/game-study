import { describe, expect, it } from 'vitest';
import { SANSU } from '../studies/sansu';
import { newProfile } from '../state/store';
import { numberToChoice } from './math';

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const cat = (id: string) => SANSU.categories.find(c => c.id === id)!;

describe('さんすうの問題', () => {
  const p = newProfile('t', 'wizard', 2);

  it('どのカードでも式と答えが合っていて、答えは0以上', () => {
    const rng = seeded();
    for (const c of SANSU.categories) {
      for (const card of c.cards()) {
        const q = c.make(card, rng, p);
        if (q.kind !== 'number' || !card.startsWith('keisan:')) continue;
        const [, a, op, b] = card.match(/^keisan:(\d+)(.)(\d+)$/)!;
        expect(q.answer, card).toBe(op === '+' ? +a + +b : op === '−' ? +a - +b : op === '×' ? +a * +b : +a / +b);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        if (c.id === 'add-carry') expect(q.answer).toBeGreaterThan(10);
        if (c.id === 'sub-borrow') expect(+a % 10).toBeLessThan(+b);
      }
    }
  });

  it('答えは0以上の整数', () => {
    for (const c of SANSU.categories) {
      for (const card of c.cards()) {
        const q = c.make(card, Math.random, p);
        if (q.kind === 'number') expect(Number.isInteger(q.answer) && q.answer >= 0 && q.answer < 100000, card).toBe(true);
      }
    }
  });

  it('プールは「習熟したと言える量」（覚えるもの以外は要素 × 数問）', () => {
    for (const c of SANSU.categories.filter(c => !c.drill)) {
      expect(c.cards().length, c.id).toBeGreaterThan(0);
      expect(c.cards().length, c.id).toBeLessThanOrEqual(c.id === 'waru' ? 72 : 45);
    }
    for (const g of [1, 2, 3] as const) {
      const n = SANSU.categories.filter(c => c.grade === g && !c.drill).reduce((s, c) => s + c.cards().length, 0);
      expect(n, `${g}年`).toBeLessThanOrEqual(400);
    }
  });

  // 問題文の式（筆算・横の式）を左から計算する
  const parse = (prompt: string) => {
    const [, ...rest] = prompt.replace(/<[^>]+>/g, '').replace(/\s/g, '').match(/^(\d+)([＋−×÷])(\d+)(?:([＋−])(\d+))?/)!;
    return rest.filter(x => x != null);
  };
  const OPS: Record<string, (a: number, b: number) => number> = { '＋': (a, b) => a + b, '−': (a, b) => a - b, '×': (a, b) => a * b, '÷': (a, b) => a / b };
  const digit = (n: number, k: number) => Math.floor(n / 10 ** k) % 10;
  // 要素の条件（いくつか）
  const RULES: Record<string, (a: number, b: number) => boolean> = {
    'nanjuu:-1juu': (a, b) => (a - b) % 10 === 0,
    'add-2:ari': (a, b) => a % 10 + b % 10 >= 10 && a + b < 100,
    'add-2:nikai': (a, b) => a % 10 + b % 10 >= 10 && a + b >= 100,
    'sub-2:1keta': (a, b) => a - b < 10 && a % 10 < b % 10,
    'add-3:sen': (a, b) => a + b >= 1000,
    'sub-3:zero': (a, b) => digit(a, 1) === 0 && a % 10 < b % 10 && a > b,
    'kake-1:zero': a => a > 100 && digit(a, 1) === 0,
    'kake-2:nanjuu': (_a, b) => b % 10 === 0,
  };

  it('計算のわく: 出すたびに数が変わり、答えと要素の条件が合う', () => {
    const rng = seeded(11);
    for (const c of SANSU.categories.filter(c => c.varied)) {
      for (const card of c.cards()) {
        const prompts = new Set<string>();
        for (let i = 0; i < 30; i++) {
          const q = c.make(card, rng, p);
          expect(q.card).toBe(card);
          prompts.add(q.prompt);
          if (q.kind !== 'number') continue;
          const [a, o1, b, o2, x] = parse(q.prompt);
          let ans = OPS[o1](+a, +b);
          if (o2) ans = OPS[o2](ans, +x);
          expect(q.answer, `${card} ${q.prompt}`).toBe(ans);
          const rule = RULES[card.split(':').slice(0, 2).join(':')];
          if (rule) expect(rule(+a, +b), `${card}: ${a} ${o1} ${b}`).toBe(true);
        }
        expect(prompts.size, card).toBeGreaterThan(1);
      }
    }
  });

  it('3択の選択肢に正解がちょうど1つあり、重複しない', () => {
    const rng = seeded(7);
    for (const c of SANSU.categories) {
      for (const card of c.cards().slice(0, 40)) {
        let q = c.make(card, rng, p);
        if (q.kind === 'number') q = numberToChoice(rng, q);
        if (q.kind !== 'choice') throw new Error();
        expect(new Set(q.choices).size, card).toBe(3);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('かぞえる問題の絵の数が正解と一致する', () => {
    const rng = seeded(3);
    for (const card of cat('kazu-count').cards()) {
      const q = cat('kazu-count').make(card, rng, p);
      if (q.kind !== 'choice') throw new Error();
      expect(Number(q.choices[q.answer])).toBe((q.prompt.match(/class="ico"/g) ?? []).length);
    }
  });
});
