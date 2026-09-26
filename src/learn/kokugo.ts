import type { Grade, Profile } from '../state/types';
import type { Question } from './types';
import type { Category } from '../studies/types';
import { once } from '../studies/types';
import { CHAR_SETS } from '../data/char-sets.js';
import { YOMI_EXTRA, parseWord, parseYomi } from '../data/kanji-words';
import * as B from '../data/kokugo-bank';
import { makeChoices, pick, shuffle, type Rng } from './random';

// 国語の問題の作り方。カテゴリの一覧は src/studies/kokugo.ts

const box = (p: Profile, card: string) => p.cards[card]?.box ?? 0;
const after = (card: string) => card.slice(card.indexOf(':') + 1);
const blank = (s: string) => s.replace('＿', '<span class="blank">？</span>');
const toKatakana = (s: string) => s.replace(/[ぁ-ゖ]/g, c => String.fromCharCode(c.charCodeAt(0) + 0x60));
const toHiragana = (s: string) => s.replace(/[ァ-ヶ]/g, c => String.fromCharCode(c.charCodeAt(0) - 0x60));

// 学年ごとの漢字（3年はまだない）
export const KANJI: Partial<Record<Grade, string>> = { 1: CHAR_SETS.g1, 2: CHAR_SETS.g2 };
// その学年までに習う漢字
export function knownKanji(grade: Grade): string {
  return grade === 'k' ? '' : grade === 1 ? CHAR_SETS.g1 : CHAR_SETS.g1 + CHAR_SETS.g2;
}

// 選択肢の問題（はじめが正解）
function choice(card: string, rng: Rng, prompt: string, correct: string, wrong: string[], note?: string): Question {
  const [choices, answer] = makeChoices(rng, correct, wrong);
  return { kind: 'choice', card, prompt, choices, answer, note };
}

// 問題データ（はじめの選択肢が正解）から作るカテゴリ
function bankCategory(id: string, name: string, grade: Grade, items: B.ChoiceItem[], quiz = false): Category {
  const byId = new Map(items.map(x => [`${id}:${x.id}`, x]));
  return {
    id, name, grade, quiz,
    cards: once(() => [...byId.keys()]),
    make(card, rng) {
      const x = byId.get(card)!;
      const prompt = x.before
        ? `<div class="stack"><div class="passage">${x.before}</div><div class="sentence">${blank(x.q)}</div></div>`
        : `<span class="sentence">${blank(x.q)}</span>`;
      return choice(card, rng, prompt, x.choices[0], x.choices.slice(1), x.note);
    },
  };
}

// ---- 文字を書く ----

export const hiraWrite = (grade: Grade): Category => ({
  id: grade === 'k' ? 'hira-write' : 'hira-write-1', name: 'ひらがなを かく', grade, write: true,
  cards: once(() => [...CHAR_SETS.hira].map(c => `hira:${c}`)),
  make(card, _rng, p) {
    const char = after(card);
    return { kind: 'write', card, char, guide: box(p, card) >= 2 ? 'model' : 'trace', prompt: `<span class="big-char">${char}</span>` };
  },
});

export const kataWrite: Category = {
  id: 'kata-write', name: 'カタカナを かく', grade: 1, write: true,
  cards: once(() => [...CHAR_SETS.kata].map(c => `kata:${c}`)),
  make(card, _rng, p) {
    const char = after(card);
    return {
      kind: 'write', card, char, guide: box(p, card) === 0 ? 'model' : 'none',
      prompt: `<span class="big-char">${toHiragana(char)}</span> を カタカナで`,
    };
  },
};

export const kanjiWrite = (grade: 1 | 2): Category => ({
  id: `kanji-write-${grade}`, name: 'かんじを かく', grade, write: true,
  cards: once(() => [...KANJI[grade]!].map(c => `kanji:${c}`)),
  make(card, _rng, p) {
    const char = after(card);
    const w = parseWord(char);
    return {
      kind: 'write', card, char, guide: box(p, card) === 0 ? 'model' : 'none',
      prompt: `<span class="word">${w.before}<em>${w.reading}</em>${w.after}</span>`,
    };
  },
});

// ---- 漢字のよみ（ひらがなで入力） ----

// ことばの学年 = ふくまれる漢字のいちばん上の学年
const wordGrade = (kanji: string): 1 | 2 => ([...kanji].some(c => !CHAR_SETS.g1.includes(c)) ? 2 : 1);

export const kanjiRead = (grade: 1 | 2): Category => ({
  id: `kanji-read-${grade}`, name: 'かんじの よみ', grade,
  // 1字ずつのことばのあとに、その字までで読めることばをはさむ
  cards: once(() => {
    const extras = YOMI_EXTRA.filter(s => wordGrade(parseYomi(s).kanji) === grade);
    const known = new Set(grade === 2 ? CHAR_SETS.g1 : '');
    const out: string[] = [];
    for (const c of KANJI[grade]!) {
      out.push(`read:${c}`);
      known.add(c);
      for (const s of extras) {
        if (!out.includes(`yomi:${s}`) && [...parseYomi(s).kanji].every(k => known.has(k))) out.push(`yomi:${s}`);
      }
    }
    return out;
  }),
  make(card) {
    let w: { before: string; kanji: string; reading: string; after: string };
    if (card.startsWith('read:')) { const x = parseWord(after(card)); w = { ...x, kanji: after(card) }; } else w = parseYomi(after(card));
    return {
      kind: 'kana', card, answers: [w.reading],
      prompt: `<div class="stack"><span class="word">${w.before}<em>${w.kanji}</em>${w.after}</span><span class="hint">せんの ところの よみを かこう</span></div>`,
    };
  },
});

// ---- 年長 ----

// 形がにていて、まちがえやすい字
const LOOKALIKE = ['あおめぬ', 'さきちら', 'はほまよ', 'るろ', 'われねぬ', 'いりこに', 'くへし', 'つのし', 'けはに'];

// 同じ字をさがす（字が読めなくても解ける）。一度正解した字は、形のにた字をまぜる
export const hiraMatch: Category = {
  id: 'hira-match', name: 'おなじ じ さがし', grade: 'k', quiz: true,
  cards: once(() => [...CHAR_SETS.hira].map(c => `match:${c}`)),
  make(card, rng, p) {
    const char = after(card);
    const all = [...CHAR_SETS.hira].filter(c => c !== char);
    const group = LOOKALIKE.find(g => g.includes(char));
    const near = box(p, card) >= 1 && group ? shuffle(rng, [...group].filter(c => c !== char)) : [];
    const choices = shuffle(rng, [char, ...[...near, ...shuffle(rng, all)].slice(0, 2)]);
    return { kind: 'choice', card, prompt: `<span class="big-char">${char}</span>`, choices, answer: choices.indexOf(char) };
  },
};

// ---- 1年 ----

// ちいさい じ: まちがえやすい書き方を規則で作る
const SMALL: Record<string, string> = { ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: 'つ' };
const O_ROW = 'おこそとのほもよろごぞどぼぽょ';
const U_ROW = 'うくすつぬふむゆるぐずづぶぷゅ';
export function tokushuWrong(word: string): string[] {
  const out = new Set<string>();
  out.add(word.replace(/[ゃゅょっ]/g, c => SMALL[c]));   // 小さい字を大きく
  out.add(word.replace(/っ/g, ''));                        // っ をぬかす
  out.add(word.replace(/ゃ/g, 'ょ'));
  out.add(word.replace(/ょ/g, 'ゃ'));
  // のばす音（おう・ゆう）
  for (let i = 1; i < word.length; i++) {
    if (word[i] !== 'う' || !(O_ROW + U_ROW).includes(word[i - 1])) continue;
    const at = (s: string) => word.slice(0, i) + s + word.slice(i + 1);
    if (O_ROW.includes(word[i - 1])) out.add(at('お'));
    out.add(at('ー'));
    out.add(at(''));
  }
  out.delete(word);
  return [...out];
}

export const tokushu: Category = {
  id: 'tokushu', name: 'ちいさい じ・のばす おと', grade: 1, quiz: true,
  cards: once(() => B.TOKUSHU.map(([, w]) => `tokushu:${w}`)),
  make(card, rng) {
    const word = after(card);
    const pic = B.TOKUSHU.find(([, w]) => w === word)![0];
    return choice(card, rng, `<div class="stack"><span class="pic">${pic}</span><span class="hint">ただしい かきかたは どれ？</span></div>`, word, tokushuWrong(word));
  },
};

export const joshi = bankCategory('joshi', 'は・を・へ', 1, B.JOSHI, true);

export const katago: Category = {
  id: 'katago', name: 'カタカナの ことば', grade: 1, quiz: true,
  cards: once(() => B.KATAGO.map(w => `katago:${w}`)),
  make(card, rng) {
    const word = after(card);
    return choice(card, rng, '<span class="sentence">カタカナで かく ことばは どれ？</span>', word, shuffle(rng, B.HIRAGO).slice(0, 2), `${word} → ${toKatakana(word)}`);
  },
};

export const nakama: Category = {
  id: 'nakama', name: 'なかまはずれ', grade: 1,
  cards: once(() => {
    // なかまを順番にまぜる
    const groups = Object.values(B.NAKAMA);
    const out: string[] = [];
    for (let i = 0; groups.some(g => i < g.length); i++) for (const g of groups) if (i < g.length) out.push(`nakama:${g[i]}`);
    return out;
  }),
  make(card, rng) {
    const odd = after(card);
    const [name, words] = pick(rng, Object.entries(B.NAKAMA).filter(([, ws]) => !ws.includes(odd)));
    const [a, b] = shuffle(rng, words);
    return choice(card, rng, '<span class="sentence">なかまはずれは どれ？</span>', odd, [a, b], `${a}・${b}は ${name}`);
  },
};

export const bun = bankCategory('bun', 'ぶんを よもう', 1, B.BUN);

// ---- 2年 ----

// 送りがな: 送りがなを1字多く・漢字だけで読ませる・1字少なく
export function okuriWrong(kanji: string, reading: string, okuri: string): string[] {
  const out = [kanji + reading.slice(-1) + okuri, kanji + reading + okuri];
  if (okuri.length > 1) out.push(kanji + okuri.slice(1));
  return [...new Set(out)].filter(w => w !== kanji + okuri);
}

export const okuri: Category = {
  id: 'okuri', name: 'おくりがな', grade: 2, quiz: true,
  cards: once(() => B.OKURI.map(([k, , o]) => `okuri:${k}${o}`)),
  make(card, rng) {
    const [k, r, o] = B.OKURI.find(([k, , o]) => `okuri:${k}${o}` === card)!;
    return choice(card, rng, `<div class="stack"><span class="word">${r}${o}</span><span class="hint">ただしい かきかたは どれ？</span></div>`, k + o, okuriWrong(k, r, o).slice(0, 2));
  },
};

export const kanazukai: Category = {
  id: 'kanazukai', name: 'かなづかい', grade: 2, quiz: true,
  cards: once(() => B.KANAZUKAI.map(([, w]) => `kanazukai:${w}`)),
  make(card, rng) {
    const [pic, w, ...wrong] = B.KANAZUKAI.find(([, w]) => `kanazukai:${w}` === card)!;
    return choice(card, rng, `<div class="stack"><span class="pic">${pic}</span><span class="hint">ただしい かきかたは どれ？</span></div>`, w, wrong);
  },
};

export const hantai = bankCategory('hantai', 'はんたいの ことば', 2, B.HANTAI, true);
export const yousu = bankCategory('yousu', 'ようすの ことば', 2, B.YOUSU, true);
export const hanashi = bankCategory('hanashi', 'おはなしを よもう', 2, B.HANASHI);

// ---- 3年 ----

// ローマ字: かな1字 → ローマ字（訓令式とヘボン式が同じ字だけ）
const ROWS: [string, string][] = [
  ['', 'あいうえお'], ['k', 'かきくけこ'], ['s', 'さ　すせそ'], ['t', 'た　　てと'], ['n', 'なにぬねの'],
  ['h', 'はひ　へほ'], ['m', 'まみむめも'], ['y', 'や　ゆ　よ'], ['r', 'らりるれろ'], ['w', 'わ　　　　'],
  ['g', 'がぎぐげご'], ['z', 'ざ　ずぜぞ'], ['d', 'だ　　でど'], ['b', 'ばびぶべぼ'], ['p', 'ぱぴぷぺぽ'],
];
const VOWELS = 'aiueo';
const romaOf = (c: string): string => {
  if (c === 'ん') return 'n';
  for (const [k, row] of ROWS) { const i = row.indexOf(c); if (i >= 0) return k + VOWELS[i]; }
  throw new Error(`no romaji: ${c}`);
};
export const toRomaji = (w: string) => [...w].map(romaOf).join('');
// 1字の母音を変えたまちがい（ローマ字とかなを同じようにずらす）
function romajiWrong(rng: Rng, w: string): string[] {
  const chars = [...w];
  const all = chars.flatMap((c, i) => {
    const row = ROWS.find(([, r]) => r.includes(c));
    return row ? [...row[1]].filter(v => v !== '　' && v !== c).map(v => chars.map((x, k) => (k === i ? v : x)).join('')) : [];
  });
  return shuffle(rng, all).slice(0, 2);
}

export const romaji: Category = {
  id: 'romaji', name: 'ローマ字', grade: 3, quiz: true,
  cards: once(() => B.ROMAJI_WORDS.flatMap(w => [`romaji:${w}`, `romaji-r:${w}`])),
  make(card, rng) {
    const w = after(card);
    const wrong = romajiWrong(rng, w);
    return card.startsWith('romaji:')
      ? choice(card, rng, `<div class="stack"><span class="word">${w}</span><span class="hint">ローマ字で かくと？</span></div>`, toRomaji(w), wrong.map(toRomaji))
      : choice(card, rng, `<div class="stack"><span class="word roma">${toRomaji(w)}</span><span class="hint">よみかたは？</span></div>`, w, wrong);
  },
};

export const jisho: Category = {
  id: 'jisho', name: 'じしょの じゅんばん', grade: 3,
  cards: once(() => B.JISHO.map(ws => `jisho:${ws.join(',')}`)),
  make(card) {
    return { kind: 'order', card, items: after(card).split(','), prompt: '<span class="sentence">じしょに のって いる じゅんに タップ</span>' };
  },
};

export const bushu: Category = {
  id: 'bushu', name: 'かんじの ぶしゅ', grade: 3, quiz: true,
  cards: once(() => {
    const out: string[] = [];
    for (let i = 0; B.BUSHU.some(([, , , ks]) => i < ks.length); i++) for (const [, , , ks] of B.BUSHU) if (i < ks.length) out.push(`bushu:${ks[i]}`);
    return out;
  }),
  make(card, rng) {
    const k = after(card);
    const [name, mark, meaning] = B.BUSHU.find(([, , , ks]) => ks.includes(k))!;
    const others = B.BUSHU.filter(([n]) => n !== name).flatMap(([, , , ks]) => [...ks]);
    return choice(card, rng, `<span class="sentence">「${name}」（${mark}）の かんじは どれ？</span>`, k, shuffle(rng, others).slice(0, 2), `${mark} は 「${meaning}」に かんけいが ある`);
  },
};

export const kosoado = bankCategory('kosoado', 'こそあど', 3, B.KOSOADO);
export const tsunagi = bankCategory('tsunagi', 'つなぎことば', 3, B.TSUNAGI);
export const kotowaza = bankCategory('kotowaza', 'ことわざ', 3, B.KOTOWAZA);
