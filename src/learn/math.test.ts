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
        if (q.kind !== 'number') continue;
        const [, a, op, b] = q.prompt.match(/(\d+) (.) (\d+)/)!;
        expect(q.answer).toBe(op === '+' ? +a + +b : op === '−' ? +a - +b : +a * +b);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        if (c.id === 'add-carry') expect(q.answer).toBeGreaterThan(10);
        if (c.id === 'sub-borrow') expect(+a % 10).toBeLessThan(+b);
      }
    }
  });

  it('プールは同じ並びで作られ、大きすぎない', () => {
    for (const c of SANSU.categories) {
      expect(c.cards().length, c.id).toBeGreaterThan(0);
      expect(c.cards().length, c.id).toBeLessThanOrEqual(150);
    }
    expect(cat('add-3').cards()[0]).toBe(cat('add-3').cards()[0]);
  });

  it('3択の選択肢に正解がちょうど1つあり、重複しない', () => {
    const rng = seeded(7);
    for (const c of SANSU.categories) {
      for (const card of c.cards().slice(0, 40)) {
        let q = c.make(card, rng, p);
        if (q.kind === 'number') q = numberToChoice(rng, q);
        if (q.kind !== 'choice') throw new Error();
        expect(new Set(q.choices).size).toBe(3);
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
