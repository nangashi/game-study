// 算数の文章題の型。数はプログラムで入れ、式と答えもプログラムで決める（答えはまちがえない）
// 文の型は LLM でふやしてよいが、「どの計算になるか」（op）と数の範囲は人が決める
// 文の中の漢字は、その学年までに習う字だけにする（テストで確かめる）

export type BunOp = '+' | '−' | '×' | '÷';

export interface BunTemplate {
  id: string;
  op: BunOp;
  unit: string;                        // 答えの単位（こ・まい・にん …）
  // 数の組（a, b）。式は「a op b」
  pairs(): [number, number][];
  text(a: number, b: number): string;
}

// あまりのあるわり算の文章題。あまりを「切り上げる」か「切り捨てる」かを型ごとに決める
export interface AmariTemplate {
  id: string;
  up: boolean;                         // true: 答えは 商 + 1（はこが いくつ いるか など）
  unit: string;
  text(a: number, b: number): string;
}

const range = (lo: number, hi: number) => Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
const all = (as: number[], bs: (a: number) => number[]) => as.flatMap(a => bs(a).map(b => [a, b] as [number, number]));

// ---- 1年: たし算・ひき算（20まで） ----
const add1 = () => all(range(2, 9), () => range(2, 9)).filter(([a, b]) => a !== b);   // 同じ数だと、はずれの式が同じになる
const sub1 = () => all(range(5, 18), a => range(2, Math.min(9, a - 1)));
export const BUN1: BunTemplate[] = [
  { id: 'hana', op: '+', unit: 'ほん', pairs: add1, text: (a, b) => `あかい はなが ${a}ほん、しろい はなが ${b}ほん あります。あわせて なんぼん ありますか。` },
  { id: 'kodomo', op: '+', unit: 'にん', pairs: add1, text: (a, b) => `こうえんに こどもが ${a}にん います。あとから ${b}にん きました。みんなで なんにんに なりましたか。` },
  { id: 'seal', op: '+', unit: 'まい', pairs: add1, text: (a, b) => `シールを ${a}まい もって います。${b}まい もらうと、ぜんぶで なんまいに なりますか。` },
  { id: 'ame', op: '−', unit: 'こ', pairs: sub1, text: (a, b) => `あめが ${a}こ あります。${b}こ たべると、のこりは なんこですか。` },
  { id: 'bus', op: '−', unit: 'にん', pairs: sub1, text: (a, b) => `バスに ${a}にん のって います。${b}にん おりました。のこりは なんにんですか。` },
  { id: 'ringo', op: '−', unit: 'こ', pairs: sub1, text: (a, b) => `りんごが ${a}こ、みかんが ${b}こ あります。りんごは みかんより なんこ おおいですか。` },
  { id: 'tori', op: '−', unit: 'わ', pairs: sub1, text: (a, b) => `木に とりが ${a}わ います。${b}わ とんで いきました。なんわ のこって いますか。` },
];

// ---- 2年: 2けたの たし算・ひき算、かけ算 ----
const add2 = () => all(range(12, 60), () => range(11, 39)).filter(([a, b], i) => i % 7 === 0 && a !== b);
const sub2 = () => all(range(40, 99), a => range(11, a - 10)).filter((_, i) => i % 13 === 0);
const kuku = () => all(range(2, 9), () => range(2, 9));
export const BUN2: BunTemplate[] = [
  { id: 'card', op: '+', unit: 'まい', pairs: add2, text: (a, b) => `カードを ${a}まい もって います。${b}まい もらいました。ぜんぶで なんまいに なりましたか。` },
  { id: 'book', op: '−', unit: 'ページ', pairs: sub2, text: (a, b) => `${a}ページの 本を、${b}ページ まで よみました。のこりは なんページですか。` },
  { id: 'kaeru', op: '−', unit: 'にん', pairs: sub2, text: (a, b) => `こうていで ${a}にん あそんで います。${b}にん 帰りました。のこりは なんにんですか。` },
  { id: 'ball', op: '−', unit: 'こ', pairs: sub2, text: (a, b) => `あかい ボールが ${a}こ、あおい ボールが ${b}こ あります。ちがいは なんこですか。` },
  { id: 'ichigo', op: '×', unit: 'こ', pairs: kuku, text: (a, b) => `1さらに いちごが ${a}こずつ のって います。${b}さらでは、ぜんぶで なんこですか。` },
  { id: 'enpitsu', op: '×', unit: 'ほん', pairs: kuku, text: (a, b) => `1はこに えんぴつが ${a}本ずつ はいって います。${b}はこでは、ぜんぶで なんぼんですか。` },
  { id: 'retsu', op: '×', unit: 'にん', pairs: kuku, text: (a, b) => `子どもが 1れつに ${a}にんずつ ならんで います。${b}れつでは、ぜんぶで なんにんですか。` },
  { id: 'shiiru', op: '×', unit: 'えん', pairs: kuku, text: (a, b) => `1まい ${a}円の シールを ${b}まい かいます。ぜんぶで なん円ですか。` },
  { id: 'tape', op: '×', unit: 'cm', pairs: kuku, text: (a, b) => `${a}cmの テープを ${b}本 つくりました。テープは ぜんぶで なんcmですか。` },
];

// ---- 3年: わり算・かけ算 ----
const waru = () => all(range(2, 9), () => range(2, 9)).map(([b, q]) => [b * q, b] as [number, number]);
const kake2 = () => all(range(12, 98), () => range(2, 9)).filter((_, i) => i % 9 === 0);
export const BUN3: BunTemplate[] = [
  { id: 'wakeru', op: '÷', unit: 'こ', pairs: waru, text: (a, b) => `${a}こ の あめを、${b}人で 同じ 数ずつ 分けます。1人 なんこに なりますか。` },
  { id: 'origami', op: '÷', unit: 'にん', pairs: waru, text: (a, b) => `おりがみが ${a}まい あります。1人に ${b}まいずつ 分けると、なん人に 分けられますか。` },
  { id: 'hako', op: '÷', unit: 'はこ', pairs: waru, text: (a, b) => `ケーキが ${a}こ あります。1はこに ${b}こずつ 入れると、なんはこに なりますか。` },
  { id: 'pan', op: '×', unit: 'えん', pairs: kake2, text: (a, b) => `1こ ${a}円の パンを ${b}こ 買うと、ぜんぶで なん円ですか。` },
  { id: 'hon', op: '×', unit: 'ページ', pairs: kake2, text: (a, b) => `1日に ${a}ページずつ 本を 読みます。${b}日間では なんページ 読めますか。` },
];

export const AMARI: AmariTemplate[] = [
  { id: 'box', up: true, unit: 'はこ', text: (a, b) => `ボールが ${a}こ あります。1はこに ${b}こずつ 入れます。ぜんぶ 入れるには、はこは なんはこ いりますか。` },
  { id: 'car', up: true, unit: 'だい', text: (a, b) => `${a}人が 1だいに ${b}人ずつ のります。みんなが のるには、車は なんだい いりますか。` },
  { id: 'ribbon', up: false, unit: 'ほん', text: (a, b) => `${a}cmの リボンから、${b}cmの リボンを 切りとります。${b}cmの リボンは なん本 とれますか。` },
  { id: 'gum', up: false, unit: 'こ', text: (a, b) => `${a}円 もって います。1こ ${b}円の ガムは、なんこ 買えますか。` },
];
