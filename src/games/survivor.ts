import type { GameDef } from './types';
import { showBattle } from '../ui/screens/battle';

export const SURVIVOR: GameDef = {
  id: 'survivor',
  name: 'サバイバー',
  icon: 'swords',
  desc: 'てきを たおして いきのころう',
  upgrades: [
    { id: 'hp',     icon: 'heart',  name: 'たいりょく', max: 10, cost: { base: 25, step: 0 } },
    { id: 'atk',    icon: 'sword',  name: 'こうげき',   max: 10, cost: { base: 25, step: 0 } },
    { id: 'speed',  icon: 'shoe',   name: 'すばやさ',   max: 10, cost: { base: 25, step: 0 } },
    { id: 'magnet', icon: 'magnet', name: 'じしゃく',   max: 10, cost: { base: 25, step: 0 } },
  ],
  open: id => void showBattle(id),
};
