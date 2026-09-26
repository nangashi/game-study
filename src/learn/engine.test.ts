import { describe, expect, it } from 'vitest';
import { NEW_PER_SET, applyAnswer, buildSet, planSet } from './engine';
import { knownKanji } from './kokugo';
import { BUSHU } from '../data/kokugo-bank';
import { STUDIES, studyDef } from '../studies/registry';
import { battleQuiz } from '../studies/quiz';
import { newProfile } from '../state/store';
import { GRADES, type Grade } from '../state/types';
import { CHAR_SETS } from '../data/char-sets.js';
import { KANJI_WORDS, YOMI_EXTRA, parseWord, parseYomi } from '../data/kanji-words';
import { dakuten, handakuten, smallKana } from '../ui/widgets/kanapad';
import strokes from './handwriting/strokes.json';

const DAY = '2026-09-26';
const KOKUGO = studyDef('kokugo')!;
const text = (html: string) => html.replace(/<[^>]+>/g, '');

describe('カテゴリと問題プール', () => {
  const p = newProfile('t', 'wizard', 2);

  it('どのカードからも問題が作れる', () => {
    for (const s of STUDIES) {
      const ids = s.categories.map(c => c.id);
      expect(new Set(ids).size, s.id).toBe(ids.length);
      for (const c of s.categories) {
        const cards = c.cards();
        expect(cards.length, c.id).toBeGreaterThan(0);
        expect(new Set(cards).size, c.id).toBe(cards.length);
        for (const card of cards) {
          const q = c.make(card, Math.random, p);
          expect(q.card).toBe(card);
          if (q.kind === 'choice') {
            expect(q.choices, card).toHaveLength(3);
            expect(new Set(q.choices).size, card).toBe(3);
          }
          if (q.kind === 'write') expect((strokes as Record<string, string[]>)[q.char], card).toBeTruthy();
          if (q.kind === 'kana') for (const a of q.answers) expect(a, card).toMatch(/^[ぁ-ゖ]+$/);
          if (q.kind === 'order') expect(q.items.length).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('国語の問題文と選択肢には、その学年までに習う漢字だけを使う', () => {
    for (const c of KOKUGO.categories) {
      const known = knownKanji(c.grade === 3 ? 2 : c.grade) + BUSHU.map(([, mark]) => mark).join('');
      for (const card of c.cards()) {
        const q = c.make(card, Math.random, p);
        const all = text(q.prompt + (q.kind === 'choice' ? q.choices.join('') + (q.note ?? '') : ''));
        for (const k of all.match(/[一-鿿]/g) ?? []) expect(known, `${card}: ${k}`).toContain(k);
      }
    }
  });

  it('ならべる問題（じしょの じゅんばん）は、正しい順になっている', () => {
    const jisho = KOKUGO.categories.find(c => c.id === 'jisho')!;
    for (const card of jisho.cards()) {
      const q = jisho.make(card, Math.random, p);
      if (q.kind !== 'order') throw new Error();
      expect([...q.items].sort((a, b) => a.localeCompare(b, 'ja'))).toEqual(q.items);
    }
  });
});

describe('問題の選び方（planSet）', () => {
  it('はじめてなら新しい問題だけで、まぜこぜは手書きとカテゴリがかたよらない', () => {
    for (const grade of GRADES) {
      for (const s of STUDIES) {
        const p = newProfile('t', 'wizard', grade);
        const picks = planSet(s, p, { study: s.id, grade }, 5, DAY);
        expect(picks, `${s.id} ${grade}`).toHaveLength(5);
        expect(new Set(picks.map(x => x.card)).size).toBe(5);
        expect(picks.every(x => !x.review)).toBe(true);
        expect(picks.filter(x => x.cat.write).length).toBeLessThanOrEqual(2);
        for (const x of picks) expect(picks.filter(y => y.cat === x.cat).length).toBeLessThanOrEqual(3);
      }
    }
  });

  it('復習の日が来た問題を先に出す。ただし新しい問題も2問は入れる', () => {
    const p = newProfile('t', 'wizard', 2);
    const sel = { study: 'kokugo', grade: 2 as Grade, category: 'okuri' };
    const cat = KOKUGO.categories.find(c => c.id === 'okuri')!;
    const cards = cat.cards();
    cards.slice(0, 10).forEach((c, i) => { p.cards[c] = { box: i % 3, due: '2026-09-20' }; });
    p.cards[cards[10]] = { box: 0, due: '2026-10-10' };   // まだ復習の日ではない
    const picks = planSet(KOKUGO, p, sel, 5, DAY);
    expect(picks.filter(x => x.review)).toHaveLength(5 - NEW_PER_SET);
    expect(picks.filter(x => x.review).every(x => p.cards[x.card].box === 0)).toBe(true); // 定着していないものから
    expect(picks.filter(x => !x.review).map(x => x.card)).toEqual(cards.slice(11, 13));    // 新しい問題はプールの順
  });

  it('新しい問題がなくなったら、復習の日の前の問題で埋める', () => {
    const p = newProfile('t', 'wizard', 3);
    const cat = KOKUGO.categories.find(c => c.id === 'kosoado')!;
    for (const c of cat.cards()) p.cards[c] = { box: 3, due: '2026-10-10' };
    expect(planSet(KOKUGO, p, { study: 'kokugo', grade: 3, category: 'kosoado' }, 5, DAY)).toHaveLength(5);
  });

  it('自分の学年のまぜこぜには、下の学年の復習もまぜる（カテゴリをえらんだときはまぜない）', () => {
    const p = newProfile('t', 'wizard', 2);
    p.cards['kanji:一'] = { box: 0, due: DAY };
    expect(planSet(KOKUGO, p, { study: 'kokugo', grade: 2 }, 5, DAY).map(x => x.card)).toContain('kanji:一');
    expect(planSet(KOKUGO, p, { study: 'kokugo', grade: 2, category: 'okuri' }, 5, DAY).map(x => x.card)).not.toContain('kanji:一');
    expect(planSet(KOKUGO, p, { study: 'kokugo', grade: 3 }, 5, DAY).map(x => x.card)).not.toContain('kanji:一');
  });

  it('まぜこぜでは同じカテゴリがなるべく続かない', () => {
    const p = newProfile('t', 'wizard', 2);
    const set = buildSet(Math.random, KOKUGO, p, { study: 'kokugo', grade: 2 }, 5, DAY);
    for (let i = 1; i < set.length; i++) expect(set[i].cat).not.toBe(set[i - 1].cat);
  });
});

describe('applyAnswer', () => {
  it('はじめて・苦手な問題ほどコインが多く、同じ日のくり返しとやりなおしは少ない', () => {
    const p = newProfile('t', 'wizard', 2);
    const q = studyDef('sansu')!.categories[0].make('kazu:3', Math.random, p);
    expect(applyAnswer(p, q, { correct: true }, DAY)).toBe(4);             // はじめて
    expect(applyAnswer(p, q, { correct: true }, DAY)).toBe(1);             // 同じ日にもう一度
    expect(applyAnswer(p, q, { correct: false }, DAY)).toBe(0);
    expect(applyAnswer(p, q, { correct: true }, DAY, true)).toBe(0);       // やりなおし
    expect(p.cards['kazu:3']).toEqual({ box: 1, due: '2026-09-27' });
    expect(applyAnswer(p, q, { correct: true, helped: true }, DAY)).toBe(1);
    expect(p.cards['kazu:3'].due).toBe(DAY);
    p.cards['kazu:3'] = { box: 4, due: DAY };
    expect(applyAnswer(p, q, { correct: true }, DAY)).toBe(2);             // よく覚えている
  });
});

describe('ゲームの中のクイズ', () => {
  it('すぐ答えられる3択を、自分の学年から出す', () => {
    for (const grade of GRADES) {
      const p = newProfile('t', 'wizard', grade);
      for (let i = 0; i < 30; i++) expect(battleQuiz(Math.random, p, DAY).kind).toBe('choice');
    }
    const k = newProfile('t', 'wizard', 'k');
    for (let i = 0; i < 30; i++) expect(battleQuiz(Math.random, k, DAY).card).toMatch(/^(kazu|match):/);
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
  it('よみのことばは、1〜2年の漢字だけで、よみはひらがな', () => {
    for (const s of YOMI_EXTRA) {
      const w = parseYomi(s);
      for (const k of w.kanji) expect(CHAR_SETS.g1 + CHAR_SETS.g2, s).toContain(k);
      expect(w.reading, s).toMatch(/^[ぁ-ん]+$/);
    }
    expect(new Set(YOMI_EXTRA).size).toBe(YOMI_EXTRA.length);
  });
  it('すべての文字に筆順データがある', () => {
    for (const c of Object.values(CHAR_SETS).join('')) expect((strokes as Record<string, string[]>)[c]?.length, c).toBeGreaterThan(0);
  });
});

describe('五十音キー', () => {
  it('゛゜小 で直前の字を変える', () => {
    expect(['か', 'が', 'つ', 'づ', 'は', 'ば', 'ぱ'].map(dakuten)).toEqual(['が', 'か', 'づ', 'つ', 'ば', 'は', 'ば']);
    expect(['は', 'ぱ', 'ば', 'ひ'].map(handakuten)).toEqual(['ぱ', 'は', 'ぱ', 'ぴ']);
    expect(['や', 'ゃ', 'つ', 'あ', 'か'].map(smallKana)).toEqual(['ゃ', 'や', 'っ', 'ぁ', 'か']);
  });
});
