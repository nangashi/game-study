import { describe, expect, it } from 'vitest';
import { applyAnswer, battleQuiz, buildQuest, track } from './engine';
import { newProfile } from '../state/store';
import { CHAR_SETS } from '../data/char-sets.js';
import { KANJI_WORDS, parseWord } from '../data/kanji-words';
import strokes from './handwriting/strokes.json';

const DAY = '2026-09-26';

describe('buildQuest', () => {
  it('学年と教科ごとに問題が作れて、同じ字が2回出ない', () => {
    for (const grade of ['k', 1, 2, 3] as const) {
      for (const subject of ['kokugo', 'sansu'] as const) {
        const p = newProfile('t', 'wizard', grade);
        const qs = buildQuest(Math.random, p, subject, 10, DAY);
        expect(qs).toHaveLength(10);
        const chars = qs.flatMap(q => (q.kind === 'write' ? [q.char] : []));
        expect(new Set(chars).size).toBe(chars.length);
        for (const c of chars) expect((strokes as Record<string, string[]>)[c]).toBeTruthy();
      }
    }
  });

  it('年長さんには字を読まないと解けない問題を出さない', () => {
    const p = newProfile('t', 'wizard', 'k');
    const qs = [...buildQuest(Math.random, p, 'kokugo', 10, DAY), ...buildQuest(Math.random, p, 'sansu', 10, DAY)];
    expect(qs.every(q => ['hira-write', 'hira-match', 'kazu'].includes(q.track))).toBe(true);
    for (let i = 0; i < 30; i++) expect(['kazu', 'hira-match']).toContain(battleQuiz(Math.random, p, DAY).track);
  });
});

describe('applyAnswer', () => {
  it('3問連続正解でレベルアップ、2問連続まちがいでレベルダウン', () => {
    const p = newProfile('t', 'wizard', 2);
    const q = buildQuest(Math.random, p, 'sansu', 1, DAY)[0];
    const start = track(p, q.track).level;
    for (let i = 0; i < 3; i++) applyAnswer(p, q, { correct: true }, DAY);
    expect(track(p, q.track).level).toBe(start + 1);
    applyAnswer(p, q, { correct: false }, DAY);
    applyAnswer(p, q, { correct: false }, DAY);
    expect(track(p, q.track).level).toBe(start);
  });

  it('手書きは正解すると次の日まで出ず、おてほんを見たら次も出る', () => {
    const p = newProfile('t', 'wizard', 'k');
    const [q1] = buildQuest(Math.random, p, 'kokugo', 1, DAY);
    if (q1.kind !== 'write') throw new Error();
    applyAnswer(p, q1, { correct: true }, DAY);
    expect(p.cards[q1.card]).toEqual({ box: 1, due: '2026-09-27' });
    const [q2] = buildQuest(Math.random, p, 'kokugo', 1, DAY);
    if (q2.kind !== 'write') throw new Error();
    expect(q2.char).not.toBe(q1.char);
    applyAnswer(p, q2, { correct: true, helped: true }, DAY);
    expect(p.cards[q2.card].due).toBe(DAY);
  });
});

describe('data', () => {
  it('1〜2年の漢字すべてに出題用のことばがある', () => {
    for (const c of CHAR_SETS.g1 + CHAR_SETS.g2) {
      expect(KANJI_WORDS[c], c).toBeTruthy();
      expect(parseWord(c).reading).toMatch(/^[ぁ-ん]+$/);
    }
    expect(Object.keys(KANJI_WORDS)).toHaveLength(240);
  });
  it('すべての文字に筆順データがある', () => {
    for (const c of Object.values(CHAR_SETS).join('')) expect((strokes as Record<string, string[]>)[c]?.length, c).toBeGreaterThan(0);
  });
});
