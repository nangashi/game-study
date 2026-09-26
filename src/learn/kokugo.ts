import type { Profile } from '../state/types';
import type { Question } from './types';
import { CHAR_SETS } from '../data/char-sets.js';
import { KANJI_WORDS, parseWord } from '../data/kanji-words';
import { makeChoices, pick, shuffle, type Rng } from './random';
import { pickCard } from './srs';

// 形がにていて、まちがえやすい字
const LOOKALIKE = ['あおめぬ', 'さきちら', 'はほまよ', 'るろ', 'われねぬ', 'いりこに', 'くへし', 'つのし', 'けはに', 'ソンツシ', 'ワウフ', 'クタ', 'ノメナ'];

const kanjiPool = (grade: Profile['grade']) => {
  if (grade === 'k' || grade === 1) return CHAR_SETS.g1;
  // 2年生以上: 1年の漢字（復習）と2年の漢字を交互に並べる
  const g1 = [...CHAR_SETS.g1], g2 = [...CHAR_SETS.g2];
  return g2.flatMap((c, i) => (g1[i] ? [c, g1[i]] : [c])).join('');
};

const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function hiraWrite(p: Profile, today: string, used: Set<string>): Question {
  const char = pickCard(p, 'hira', CHAR_SETS.hira, today, used);
  const box = p.cards[`hira:${char}`]?.box ?? 0;
  return {
    kind: 'write', track: 'hira-write', card: `hira:${char}`, char,
    guide: box >= 2 ? 'model' : 'trace',
    prompt: `<span class="big-char">${char}</span>`,
  };
}

export function kataWrite(p: Profile, today: string, used: Set<string>): Question {
  const char = pickCard(p, 'kata', CHAR_SETS.kata, today, used);
  const box = p.cards[`kata:${char}`]?.box ?? 0;
  return {
    kind: 'write', track: 'kata-write', card: `kata:${char}`, char,
    guide: box === 0 ? 'model' : 'none',
    prompt: `<span class="big-char">${toHiragana(char)}</span> を カタカナで`,
  };
}

export function kanjiWrite(p: Profile, today: string, used: Set<string>): Question {
  const char = pickCard(p, 'kanji', kanjiPool(p.grade), today, used);
  const box = p.cards[`kanji:${char}`]?.box ?? 0;
  const w = parseWord(char);
  return {
    kind: 'write', track: 'kanji-write', card: `kanji:${char}`, char,
    guide: box === 0 ? 'model' : 'none',
    prompt: `<span class="word">${w.before}<em>${w.reading}</em>${w.after}</span>`,
  };
}

// 漢字のよみ（3択）。書きで一度出た字を優先する
export function kanjiRead(rng: Rng, p: Profile): Question {
  const pool = [...kanjiPool(p.grade)];
  const seen = pool.filter(c => p.cards[`kanji:${c}`]);
  const char = pick(rng, seen.length >= 3 ? seen : pool.slice(0, 20));
  const w = parseWord(char);
  const others = shuffle(rng, Object.keys(KANJI_WORDS)).map(k => parseWord(k).reading)
    .filter(r => r !== w.reading && Math.abs(r.length - w.reading.length) <= 1);
  const [choices, answer] = makeChoices(rng, w.reading, others.slice(0, 6));
  return {
    kind: 'choice', track: 'kanji-read', card: `read:${char}`,
    prompt: `<span class="word">${w.before}<em>${char}</em>${w.after}</span>`,
    choices: choices.map(r => `${w.before}<em>${r}</em>${w.after}`), answer,
  };
}

// 同じ字をさがす（字が読めなくても解ける）。レベル2からは形のにた字をまぜる
export function hiraMatch(rng: Rng, level: number): Question {
  const all = [...CHAR_SETS.hira];
  let char: string, others: string[];
  if (level >= 2) {
    const g = [...pick(rng, LOOKALIKE.filter(x => /^[ぁ-ん]+$/.test(x)))];
    char = pick(rng, g);
    others = [...shuffle(rng, g.filter(c => c !== char)), ...shuffle(rng, all.filter(c => !g.includes(c)))];
  } else {
    char = pick(rng, all);
    others = shuffle(rng, all.filter(c => c !== char));
  }
  const choices = shuffle(rng, [char, ...others.slice(0, 2)]);
  return { kind: 'choice', track: 'hira-match', prompt: `<span class="big-char">${char}</span>`, choices, answer: choices.indexOf(char), card: `match:${char}` };
}
