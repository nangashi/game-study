import type { UpgradeDef } from '../types';

// ずっと残る強化（数値だけ。1段階 40コインで一定 → 1ステージにつき 2段階。docs/03 5.）
// 4種類 × 10 = 40 ≥ ステージ20の推奨強化レベル 34
export const HIPPARI_UPGRADES: UpgradeDef[] = [
  { id: 'hp',    icon: 'heart', name: 'たいりょく', max: 10, cost: { base: 40, step: 0 } },
  { id: 'atk',   icon: 'glove', name: 'こうげき',   max: 10, cost: { base: 40, step: 0 } },
  { id: 'speed', icon: 'wing',  name: 'いきおい',   max: 10, cost: { base: 40, step: 0 } },
  { id: 'heal',  icon: 'apple', name: 'かいふく',   max: 10, cost: { base: 40, step: 0 } },
];
