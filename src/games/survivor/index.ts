import type { GameDef } from '../types';
import { SHEETS } from './assets.gen';
import { SURVIVOR_STAGES } from './stages';
import { SURVIVOR_UPGRADES } from './upgrades';

// 設計: docs/games/survivor.md
export const SURVIVOR: GameDef = {
  id: 'survivor',
  name: 'サバイバー',
  desc: 'てきを たおして いきのころう',
  cover: { sheet: SHEETS.icons, frame: 'swords' },
  stages: SURVIVOR_STAGES, // 3つの せかい × 5ステージ（stages.ts）
  upgrades: SURVIVOR_UPGRADES,
  load: () => import('./main'), // Phaser は遊ぶときだけ読む
};
