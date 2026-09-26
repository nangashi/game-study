import type { GameDef } from '../types';
import { HIPPARI_STAGES } from './stages';
import { SHEETS } from './assets.gen';

// 設計: docs/games/hippari.md
export const HIPPARI: GameDef = {
  id: 'hippari',
  name: 'ひっぱりアタック',
  desc: 'ひっぱって はなして てきに ぶつけよう',
  cover: { sheet: SHEETS.chars, frame: 'panda' },
  stages: HIPPARI_STAGES,
  // 4種類 × 10 = 40 ≥ ステージ20の推奨強化レベル 34
  upgrades: [
    { id: 'hp',    icon: 'heart', name: 'たいりょく', max: 10, cost: { base: 25, step: 0 } },
    { id: 'atk',   icon: 'glove', name: 'こうげき',   max: 10, cost: { base: 25, step: 0 } },
    { id: 'speed', icon: 'wing',  name: 'いきおい',   max: 10, cost: { base: 25, step: 0 } },
    { id: 'heal',  icon: 'apple', name: 'かいふく',   max: 10, cost: { base: 25, step: 0 } },
  ],
  load: () => import('./main'),
};
