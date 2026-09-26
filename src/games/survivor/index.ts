import type { GameDef } from '../types';
import { SHEETS } from './assets.gen';

// 設計: docs/games/survivor.md
export const SURVIVOR: GameDef = {
  id: 'survivor',
  name: 'サバイバー',
  desc: 'てきを たおして いきのころう',
  cover: { sheet: SHEETS.icons, frame: 'swords' },
  stages: 1, // まだステージがない（3分生きのこればクリア）
  upgrades: [
    { id: 'hp',     icon: 'heart',  name: 'たいりょく', max: 10, cost: { base: 25, step: 0 } },
    { id: 'atk',    icon: 'sword',  name: 'こうげき',   max: 10, cost: { base: 25, step: 0 } },
    { id: 'speed',  icon: 'shoe',   name: 'すばやさ',   max: 10, cost: { base: 25, step: 0 } },
    { id: 'magnet', icon: 'magnet', name: 'じしゃく',   max: 10, cost: { base: 25, step: 0 } },
  ],
  load: () => import('./main'), // Phaser は遊ぶときだけ読む
};
