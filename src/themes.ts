import { STAGES } from './learn/keisan';
import { HIRA_UNITS } from './learn/hiragana';
import { KAZU_UNITS } from './learn/kazu';
import type { ChildRecord } from './records';

// 教科 → テーマ。中身があるのは「ひらがな」（ひらがなを かく）・「かず」・「けいさん」。ほかは「あとで ふえる」

export type ThemeId = 'hira' | 'kazu' | 'keisan';

export interface ThemeDef {
  id: ThemeId | null;  // null は中身がまだない
  name: string;
  mark: string;        // カードの左の1文字
  desc: string;
}

export interface SubjectDef {
  id: 'kokugo' | 'sansu';
  name: string;
  themes: ThemeDef[];
}

export const SUBJECTS: SubjectDef[] = [
  {
    id: 'kokugo', name: 'こくご', themes: [
      { id: 'hira', name: 'ひらがな', mark: 'ひ', desc: `ひらがなを かく ・ ${HIRA_UNITS.length}たんげん` },
      { id: null, name: 'かんじ', mark: 'か', desc: 'かんじを おぼえる・かく' },
      { id: null, name: 'ことば', mark: 'こ', desc: 'ことばの れんしゅう' },
      { id: null, name: 'よむ', mark: 'よ', desc: 'ぶんを よむ' },
    ],
  },
  {
    id: 'sansu', name: 'さんすう', themes: [
      { id: 'kazu', name: 'かず', mark: 'か', desc: `かず・ぶんすう・しょうすう ・ ${KAZU_UNITS.length}たんげん` },
      { id: 'keisan', name: 'けいさん', mark: 'け', desc: `たしざん・ひきざん・かけざん ・ ${STAGES.length}ステージ` },
      { id: null, name: 'はかる', mark: 'は', desc: 'ながさ・じかん・かさ' },
      { id: null, name: 'かたちと グラフ', mark: 'か', desc: 'かたち・グラフを よむ' },
      { id: null, name: 'ぶんしょうだい', mark: 'ぶ', desc: 'ぶんを よんで こたえる' },
    ],
  },
];

// テーマの星の合計（単元の星のベストを足す）と、とれる星の数
export function themeStars(c: ChildRecord, id: ThemeId): { stars: number; max: number } {
  if (id === 'keisan') {
    return { stars: STAGES.reduce((n, s) => n + (c.keisan.stages[s.id]?.stars ?? 0), 0), max: STAGES.length * 3 };
  }
  const units = id === 'kazu' ? KAZU_UNITS : HIRA_UNITS;
  return { stars: units.reduce((n, u) => n + (c.units[u.id]?.stars ?? 0), 0), max: units.length * 3 };
}
