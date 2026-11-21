import * as g from './generators';
import type { Gen } from './generators';

// けいさんの道（1本の道・全47ステージ）。算数練習アプリの STAGES をそのまま移したもの
// id は保存データのキーになるので変えない。num は道の上の番号（1〜47）

export interface KeisanStage {
  id: string;        // 's1'〜's47'
  num: number;       // 1〜47
  name: string;
  theme: string;
  sample: string;
  gen: Gen;
  color: string;
  matome?: boolean;  // まとめ（ふくしゅう）。ちからだめしでは測らない
  paper?: boolean;   // 筆算むけ（紙に書いてよい）。「まえより はやい！」を出さない
}

export const C_ADD = '#2a9d8f', C_SUB = '#4a90d9', C_MUL = '#fb8500', C_KUFU = '#9b5de5', C_MAT = '#ef476f', C_BIG = '#00838f';

type Def = Omit<KeisanStage, 'num'>;
const DEFS: Def[] = [
  { id: 's1', name: 'たし算 10まで', theme: 'くり上がりなし', sample: '4 ＋ 3', gen: g.gAdd1, color: C_ADD },
  { id: 's2', name: 'ひき算 10まで', theme: 'くり下がりなし', sample: '7 − 3', gen: g.gSub1, color: C_SUB },
  { id: 's3', name: 'たし算 くり上がり入門', theme: '答えは 11〜13', sample: '8 ＋ 4', gen: g.gAddCarryIntro, color: C_ADD },
  { id: 's4', name: 'ひき算 くり下がり入門', theme: '十いくつ − 1けた', sample: '13 − 5', gen: g.gSubBorrowIntro, color: C_SUB },
  { id: 's5', name: 'たし算 くり上がり', theme: '答えは 11〜18', sample: '9 ＋ 6', gen: g.gAdd2, color: C_ADD },
  { id: 's6', name: 'ひき算 くり下がり', theme: '10から かりる', sample: '15 − 8', gen: g.gSub2, color: C_SUB },
  { id: 's7', name: 'まとめ①', theme: 'たし・ひき ふくしゅう（〜20）', sample: '12 ＋ 6 / 15 − 7', gen: g.gMatome1, color: C_MAT, matome: true },
  { id: 's8', name: 'くふう① 3つの数の たし算', theme: '左から じゅんに', sample: '4 ＋ 5 ＋ 3', gen: g.gKufu1, color: C_KUFU },
  { id: 's9', name: 'たし算 2けた＋1けた', theme: 'くり上がりなし', sample: '34 ＋ 5', gen: g.gAdd21NoCarry, color: C_ADD },
  { id: 's10', name: 'ひき算 2けた−1けた', theme: 'くり下がりなし', sample: '38 − 5', gen: g.gSub21NoBorrow, color: C_SUB },
  { id: 's11', name: 'たし算 2けた＋1けた くり上がり', theme: '答えは 99まで', sample: '47 ＋ 5', gen: g.gAdd21Carry, color: C_ADD },
  { id: 's12', name: 'たし算 2けた＋1けた 100をこえる', theme: '答えが 100を こえる', sample: '95 ＋ 7', gen: g.gAdd21Over100, color: C_ADD },
  { id: 's13', name: 'ひき算 2けた−1けた くり下がり', theme: '十の位から かりる', sample: '52 − 6', gen: g.gSub21Borrow, color: C_SUB },
  { id: 's14', name: 'くふう② 10になる ペア', theme: 'じゅん番を かえると ラク', sample: '8 ＋ 5 ＋ 2', gen: g.gKufu2, color: C_KUFU },
  { id: 's15', name: 'まとめ②', theme: 'ここまでの たし・ひき', sample: '47 ＋ 5 / 52 − 6', gen: g.gMatome2, color: C_MAT, matome: true },
  { id: 's16', name: 'たし算 2けた＋2けた', theme: 'くり上がりなし', sample: '34 ＋ 25', gen: g.gAdd22NoCarry, color: C_ADD },
  { id: 's17', name: 'ひき算 2けた−2けた', theme: 'くり下がりなし', sample: '56 − 24', gen: g.gSub22NoBorrow, color: C_SUB },
  { id: 's18', name: 'たし算 一の位だけ くり上がり', theme: '一の位から 上がる', sample: '47 ＋ 25', gen: g.gAdd22OnesCarry, color: C_ADD },
  { id: 's19', name: 'ひき算 一の位だけ くり下がり', theme: '一の位だけ かりる', sample: '56 − 28', gen: g.gSub22OnesBorrow, color: C_SUB },
  { id: 's20', name: 'たし算 両方 くり上がり', theme: '一の位も 十の位も 上がる', sample: '47 ＋ 58', gen: g.gAdd22BothCarry, color: C_ADD },
  { id: 's21', name: 'ひき算 十の位が 0になる', theme: 'かりると 十の位が 0', sample: '53 − 48', gen: g.gSub22HardBorrow, color: C_SUB },
  { id: 's22', name: 'ひき算 0をまたぐ くり下がり', theme: '2回 つづけて かりる', sample: '205 − 58', gen: g.gSubZeroCross, color: C_SUB },
  { id: 's23', name: 'くふう③ きりのいい数', theme: '100になる ペア', sample: '25 ＋ 17 ＋ 75', gen: g.gKufu3, color: C_KUFU },
  { id: 's24', name: 'まとめ③', theme: 'たし・ひき ふくしゅう（2けたまで）', sample: '47 ＋ 58 / 205 − 58', gen: g.gMatome3, color: C_MAT, matome: true },
  { id: 's25', name: 'たし算 3けた＋3けた（すこし）', theme: 'くり上がり 0〜1回', sample: '234 ＋ 156', gen: g.gAdd33Few, color: C_BIG, paper: true },
  { id: 's26', name: 'ひき算 3けた−3けた（すこし）', theme: 'くり下がり 0〜1回', sample: '456 − 123', gen: g.gSub33Few, color: C_BIG, paper: true },
  { id: 's27', name: 'たし算 3けた＋3けた（つづく）', theme: 'くり上がり 2回以上', sample: '478 ＋ 586', gen: g.gAdd33Many, color: C_BIG, paper: true },
  { id: 's28', name: 'ひき算 3けた−3けた（つづく）', theme: 'くり下がり 2回以上', sample: '512 − 268', gen: g.gSub33Many, color: C_BIG, paper: true },
  { id: 's29', name: 'まとめ④', theme: 'たし・ひき ふくしゅう（3けたまで）', sample: '478 ＋ 586 / 512 − 268', gen: g.gMatome4, color: C_MAT, matome: true },
  { id: 's30', name: 'かけ算 2の段', theme: '2の段だけ', sample: '2 × 4', gen: g.danGen(2), color: C_MUL },
  { id: 's31', name: 'かけ算 5の段', theme: '5の段だけ', sample: '5 × 3', gen: g.danGen(5), color: C_MUL },
  { id: 's32', name: 'かけ算 3の段', theme: '3の段だけ', sample: '3 × 4', gen: g.danGen(3), color: C_MUL },
  { id: 's33', name: 'かけ算 4の段', theme: '4の段だけ', sample: '4 × 6', gen: g.danGen(4), color: C_MUL },
  { id: 's34', name: 'かけ算 6の段', theme: '6の段だけ', sample: '6 × 7', gen: g.danGen(6), color: C_MUL },
  { id: 's35', name: 'かけ算 7の段', theme: '7の段だけ', sample: '7 × 8', gen: g.danGen(7), color: C_MUL },
  { id: 's36', name: 'かけ算 8の段', theme: '8の段だけ', sample: '8 × 6', gen: g.danGen(8), color: C_MUL },
  { id: 's37', name: 'かけ算 9の段', theme: '9の段だけ', sample: '9 × 7', gen: g.danGen(9), color: C_MUL },
  { id: 's38', name: 'かけ算 1の段', theme: '1の段だけ', sample: '1 × 8', gen: g.danGen(1), color: C_MUL },
  { id: 's39', name: 'かけ算 九九ランダム', theme: 'ぜんぶの段 ミックス', sample: '6 × 7', gen: g.gMul3, color: C_MUL },
  { id: 's40', name: 'かけ算 2けた×1けた', theme: 'くり上がりなし', sample: '23 × 2', gen: g.gMul21NoCarry, color: C_MUL },
  { id: 's41', name: 'かけ算 2けた×1けた くり上がり', theme: 'くり上がりあり', sample: '24 × 3', gen: g.gMul21Carry, color: C_MUL },
  { id: 's42', name: 'かけ算 3けた×1けた', theme: '大きな かけ算', sample: '123 × 3', gen: g.gMul31, color: C_BIG, paper: true },
  { id: 's43', name: 'まとめ⑤', theme: 'たし・ひき・かけ ふくしゅう', sample: '7 × 6 / 45 ＋ 38', gen: g.gMatome5, color: C_MAT, matome: true },
  { id: 's44', name: 'わり算① やさしい段', theme: '2・5・3・1の段の ぎゃく', sample: '10 ÷ 5', gen: g.gDivEasy, color: C_MUL },
  { id: 's45', name: 'わり算② むずかしい段', theme: '4・6・7・8・9の段の ぎゃく', sample: '24 ÷ 6', gen: g.gDivHard, color: C_MUL },
  { id: 's46', name: 'くふう④ 3つの数の 混合', theme: 'くふう 総合', sample: '37 ＋ 28 ＋ 63', gen: g.gKufuMix, color: C_KUFU },
  { id: 's47', name: 'まとめ⑥', theme: '全部の ふくしゅう', sample: '7 × 6 / 45 ＋ 38', gen: g.gMatome6, color: C_MAT, matome: true },
];

export const STAGES: readonly KeisanStage[] = DEFS.map((d, i) => ({ ...d, num: i + 1 }));
export const STAGE_COUNT = STAGES.length; // 47

const BY_ID = new Map(STAGES.map(s => [s.id, s]));
export const stageById = (id: string): KeisanStage | undefined => BY_ID.get(id);
// num は 1〜47
export const stageByNum = (num: number): KeisanStage => {
  const s = STAGES[num - 1];
  if (!s) throw new Error(`no keisan stage ${num}`);
  return s;
};
