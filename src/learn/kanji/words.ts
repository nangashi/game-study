import { KANJI_GRADES } from './words-data';

// 漢字の書き取りの単語データ。1字につき 2〜3語。
// 単語はかな表記で、答える字の読みの部分を [ ] で囲む（例: [やま]のぼり、か[ざん]）
export interface KanjiEntry {
  kanji: string;
  words: readonly string[];
}

export { KANJI_GRADES };

// 全学年をつないだもの（1年から順、学年内は配当表の順）。出題の「データ順」
export const ALL_KANJI: readonly KanjiEntry[] = KANJI_GRADES.flat();

const byKanji = new Map(ALL_KANJI.map(e => [e.kanji, e]));
const gradeByKanji = new Map(KANJI_GRADES.flatMap((es, g) => es.map(e => [e.kanji, g + 1] as const)));

export const kanjiEntry = (kanji: string): KanjiEntry | undefined => byKanji.get(kanji);
export const kanjiGrade = (kanji: string): number | undefined => gradeByKanji.get(kanji);

// 単語を「前・答える読み・後」に分ける（画面で読みに傍線を引くため）。[ ] がちょうど1つでなければ null
export function splitWord(word: string): { before: string; reading: string; after: string } | null {
  const m = /^([^[\]]*)\[([^[\]]+)\]([^[\]]*)$/.exec(word);
  return m ? { before: m[1], reading: m[2], after: m[3] } : null;
}
