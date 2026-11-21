import * as G from './questions';
import type { KazuGen, KazuType } from './questions';

// 算数「かず」の道（7単元）。学年は表に出さない（内部の grade はメモ）

export interface KazuUnit {
  id: string;       // 記録のキー（'kazu:n100' など）。後から変えない
  num: number;      // 道の上の番号（1〜）
  name: string;
  sample: string;   // 道のカードの2行目
  grade: 1 | 2 | 3; // 内部のメモ（画面には出さない）
  max: number;      // 問題に出る数の上限（テストで確かめる）
  gens: Partial<Record<KazuType, KazuGen>>; // 問題タイプ → 作り方（並びは道の仕様の順）
}

const UNITS: Omit<KazuUnit, 'num'>[] = [
  {
    id: 'kazu:n100', name: '100までの かず', sample: 'どっちが おおきい・45 46 □ 48・かずのせん', grade: 1, max: 100,
    gens: { compare: G.genCompare100, sequence: G.genSequence, numberLine: G.genNumberLine100, placeIntro: G.genPlaceIntro },
  },
  {
    id: 'kazu:ikutsu', name: 'いくつと いくつ', sample: '8は 3と □・4と 5で □・10は 6と □', grade: 1, max: 10,
    gens: { decompose: G.genDecompose, compose: G.genCompose, tenSplit: G.genTenSplit },
  },
  {
    id: 'kazu:n1000', name: '1000までの かず', sample: '100が □こ・さんびゃく じゅう ご・かずのせん', grade: 2, max: 1000,
    gens: { place3: G.genPlace3, words: G.genWords, compare: G.genCompare1000, numberLine: G.genNumberLine1000 },
  },
  {
    id: 'kazu:bunkatsu', name: 'はんぶん・4とうぶん', sample: 'えを みて えらぶ', grade: 2, max: 4,
    gens: { halfPick: G.genHalfPick, quarterPick: G.genQuarterPick, partName: G.genPartName },
  },
  {
    id: 'kazu:n10000', name: '10000までの かずと おおきな かず', sample: '万の くらい・10ばい・10分の1・かずのせん', grade: 3, max: 99999,
    gens: {
      place5: G.genPlace5, times10: G.genTimes10, tenth: G.genTenth, compare: G.genCompare5, numberLine: G.genNumberLine10000,
    },
  },
  {
    id: 'kazu:bunsu', name: 'ぶんすう', sample: 'ぬられた ところ・どっちが おおきい・たしざん', grade: 3, max: 10,
    gens: { fracRead: G.genFracRead, fracCompare: G.genFracCompare, fracAdd: G.genFracAdd },
  },
  {
    id: 'kazu:shosu', name: 'しょうすう', sample: '0.1が □こ・どっちが おおきい・0.6 ＋ 0.3', grade: 3, max: 9.9,
    gens: { decimalCount: G.genDecimalCount, decimalCompare: G.genDecimalCompare, decimalCalc: G.genDecimalCalc },
  },
];

export const KAZU_UNITS: readonly KazuUnit[] = UNITS.map((u, i) => ({ ...u, num: i + 1 }));

export const kazuUnitById = (id: string) => KAZU_UNITS.find(u => u.id === id);

export const unitTypes = (u: KazuUnit) => Object.keys(u.gens) as KazuType[];
