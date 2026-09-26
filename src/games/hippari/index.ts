import type { GameDef } from '../types';
import { HIPPARI_STAGES } from './stages';
import { HIPPARI_UPGRADES } from './upgrades';
import { SHEETS } from './assets.gen';

// 設計: docs/games/hippari.md
export const HIPPARI: GameDef = {
  id: 'hippari',
  name: 'ひっぱりアタック',
  desc: 'ひっぱって はなして てきに ぶつけよう',
  cover: { sheet: SHEETS.chars, frame: 'panda' },
  stages: HIPPARI_STAGES,
  upgrades: HIPPARI_UPGRADES,
  load: () => import('./main'),
};
