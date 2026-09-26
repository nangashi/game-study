import { describe, expect, it } from 'vitest';
import { LEVELS, kazu, keisan, numberToChoice, tokei } from './math';

const seeded = (seed = 1) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('keisan', () => {
  it('どのレベルでも式と答えが合っている', () => {
    const rng = seeded();
    for (let lv = 1; lv <= LEVELS.keisan; lv++) {
      for (let i = 0; i < 300; i++) {
        const q = keisan(rng, lv);
        if (q.kind !== 'number') throw new Error();
        const [, a, op, b] = q.prompt.match(/(\d+) (.) (\d+)/)!;
        const expected = op === '+' ? +a + +b : op === '−' ? +a - +b : +a * +b;
        expect(q.answer).toBe(expected);
        expect(q.answer).toBeGreaterThanOrEqual(0);
        if (lv === 2) expect(q.answer).toBeGreaterThan(10); // くりあがり
        if (lv === 3) expect(+a % 10).toBeLessThan(+b);     // くりさがり
      }
    }
  });
});

describe('choice questions', () => {
  it('選択肢に正解がちょうど1つあり、重複しない', () => {
    const rng = seeded(7);
    const qs = [
      ...Array.from({ length: 200 }, (_, i) => kazu(rng, (i % LEVELS.kazu) + 1)),
      ...Array.from({ length: 200 }, (_, i) => tokei(rng, (i % LEVELS.tokei) + 1)),
      ...Array.from({ length: 200 }, (_, i) => { const q = keisan(rng, (i % 8) + 1); return q.kind === 'number' ? numberToChoice(rng, q) : q; }),
    ];
    for (const q of qs) {
      if (q.kind !== 'choice') throw new Error();
      expect(new Set(q.choices).size).toBe(q.choices.length);
      expect(q.choices.length).toBe(3);
      expect(q.answer).toBeGreaterThanOrEqual(0);
    }
  });

  it('kazu の絵の数が正解と一致する（かぞえる問題）', () => {
    const rng = seeded(3);
    for (let i = 0; i < 100; i++) {
      const q = kazu(rng, 2);
      if (q.kind !== 'choice') throw new Error();
      const n = (q.prompt.match(/class="ico"/g) ?? []).length;
      expect(Number(q.choices[q.answer])).toBe(n);
    }
  });
});
