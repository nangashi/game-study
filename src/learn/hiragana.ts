// 国語「ひらがなを かく」の道。
// 旧まなびランドの「ひらがなを かく」（年長・1年。どちらも46字で、はじめは なぞる → なれたら おてほんを みて かく）を、
// 間隔反復なしで回せるように 行ごとの単元にした。1回の中で、まず全字を「なぞる」で一周し、つぎに全字を「みて かく」で一周する。
// 結果は星とクリアだけ（時間は競わない）

export type HiraGuide = 'trace' | 'model'; // trace: うすい字をなぞる / model: 横のおてほんを見て書く

export interface HiraUnit {
  id: string;     // 記録のキー（'hira:a' など）。後から変えない
  num: number;    // 道の上の番号（1〜）
  name: string;
  chars: string;
}

const ROWS: [string, string, string][] = [
  ['a', 'あ行', 'あいうえお'],
  ['ka', 'か行', 'かきくけこ'],
  ['sa', 'さ行', 'さしすせそ'],
  ['ta', 'た行', 'たちつてと'],
  ['na', 'な行', 'なにぬねの'],
  ['ha', 'は行', 'はひふへほ'],
  ['ma', 'ま行', 'まみむめも'],
  ['ya', 'や行', 'やゆよ'],
  ['ra', 'ら行', 'らりるれろ'],
  ['wa', 'わ行', 'わをん'],
];

export const HIRA_UNITS: readonly HiraUnit[] = ROWS.map(([id, row, chars], i) => ({
  id: `hira:${id}`, num: i + 1, name: `ひらがなを かく（${row}）`, chars,
}));

export const hiraUnitById = (id: string) => HIRA_UNITS.find(u => u.id === id);

export interface HiraItem { char: string; guide: HiraGuide }

// 1回で書く字の並び（全字を なぞる → 全字を みて かく）
export const hiraItems = (u: HiraUnit): HiraItem[] =>
  (['trace', 'model'] as const).flatMap(guide => [...u.chars].map(char => ({ char, guide })));

// 1字の結果。helped: おてほん（書きじゅんアニメ）を見た、または3回以上まちがえた（writepad の helped）
export interface HiraWriteResult { helped: boolean }

// 星とクリア。おてつだいなしで書けた数で決める（けいさんの10問で8問クリアと同じ数え方）
//   ぜんぶ → ★3、1つ足りない → ★2、2つ足りない → ★1（ここまでクリア）、それより少ない → ★0
export function judgeHira(results: readonly HiraWriteResult[]): { good: number; total: number; stars: number; cleared: boolean } {
  const total = results.length;
  const good = results.filter(r => !r.helped).length;
  const miss = total - good;
  const stars = total === 0 ? 0 : miss === 0 ? 3 : miss === 1 ? 2 : miss === 2 ? 1 : 0;
  return { good, total, stars, cleared: stars > 0 };
}
