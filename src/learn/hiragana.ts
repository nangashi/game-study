// 国語「ひらがなを かく」の道。
// 旧まなびランドの「ひらがなを かく」（年長・1年。どちらも46字で、はじめは なぞる → なれたら おてほんを みて かく）を、
// 間隔反復なしで回せるように 行ごとの単元にした。1回の中で、まず全字を「なぞる」で一周し、つぎに全字を「みて かく」で一周する。
// 道の最後は「えを みて かく」の5単元。見本なしで、絵と空欄つきの言葉を手がかりに思い出して書く。
// 結果は星とクリアだけ（時間は競わない）

// trace: うすい字をなぞる / model: 横のおてほんを見て書く / recall: 見本なしで、絵と言葉から思い出して書く
export type HiraGuide = 'trace' | 'model' | 'recall';

// 絵の問題1つ。word のうち blankAt の字（= char）を「？」にして出す
export interface HiraPicture { char: string; word: string; emoji: string; blankAt: number }

export interface HiraUnit {
  id: string;     // 記録のキー（'hira:a' など）。後から変えない
  num: number;    // 道の上の番号（1〜）
  name: string;
  chars: string;
  pictures?: readonly HiraPicture[]; // 「えを みて かく」の単元だけ
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

// 字: 言葉 絵文字。空欄は最初の字（ん だけは最後の字）。「を」は絵の問題にしない
const PICTURE_ROWS: [string, string, string][] = [
  ['e1', 'あ行・か行', 'あ:あめ:🍬 い:いぬ:🐶 う:うさぎ:🐰 え:えんぴつ:✏️ お:おにぎり:🍙 か:かえる:🐸 き:きのこ:🍄 く:くま:🐻 け:けーき:🍰 こ:こあら:🐨'],
  ['e2', 'さ行・た行', 'さ:さくら:🌸 し:しか:🦌 す:すいか:🍉 せ:せっけん:🧼 そ:そり:🛷 た:たこ:🐙 ち:ちょうちょ:🦋 つ:つき:🌙 て:てがみ:💌 と:とり:🐦'],
  ['e3', 'な行・は行', 'な:なす:🍆 に:にじ:🌈 ぬ:ぬいぐるみ:🧸 ね:ねこ:🐱 の:のこぎり:🪚 は:はな:🌼 ひ:ひまわり:🌻 ふ:ふね:🚢 へ:へび:🐍 ほ:ほし:⭐'],
  ['e4', 'ま行・や行', 'ま:まめ:🫛 み:みかん:🍊 む:むし:🐛 め:めがね:👓 も:もも:🍑 や:やま:🏔️ ゆ:ゆき:⛄ よ:よっと:⛵'],
  ['e5', 'ら行・わ行', 'ら:らいおん:🦁 り:りんご:🍎 る:るーぺ:🔍 れ:れもん:🍋 ろ:ろうそく:🕯️ わ:わに:🐊 ん:ほん:📕'],
];

const toPicture = (s: string): HiraPicture => {
  const [char, word, emoji] = s.split(':');
  return { char, word, emoji, blankAt: char === 'ん' ? word.lastIndexOf(char) : word.indexOf(char) };
};

export const HIRA_UNITS: readonly HiraUnit[] = [
  ...ROWS.map(([id, row, chars]) => ({ id: `hira:${id}`, name: `ひらがなを かく（${row}）`, chars })),
  ...PICTURE_ROWS.map(([id, rows, list]) => {
    const pictures = list.split(' ').map(toPicture);
    return { id: `hira:${id}`, name: `えを みて かく（${rows}）`, chars: pictures.map(p => p.char).join(''), pictures };
  }),
].map((u, i) => ({ ...u, num: i + 1 }));

// 空欄つきの言葉（「？め」「ほ？」など）
export const blankWord = (p: HiraPicture) => [...p.word].map((c, i) => (i === p.blankAt ? '？' : c)).join('');

export const hiraUnitById = (id: string) => HIRA_UNITS.find(u => u.id === id);

export interface HiraItem { char: string; guide: HiraGuide; picture?: HiraPicture }

// 1回で書く字の並び（全字を なぞる → 全字を みて かく）。絵の単元は 絵ごとに1回ずつ思い出して かく
export const hiraItems = (u: HiraUnit): HiraItem[] =>
  u.pictures
    ? u.pictures.map(picture => ({ char: picture.char, guide: 'recall', picture }))
    : (['trace', 'model'] as const).flatMap(guide => [...u.chars].map(char => ({ char, guide })));

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
