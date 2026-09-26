import type { GameDef } from './types';
import { SURVIVOR } from './survivor';
import { HIPPARI } from './hippari';

// ゲームを足すときはここに追加する（docs/03-rewards-and-games.md）
export const GAMES: GameDef[] = [SURVIVOR, HIPPARI];

export const gameDef = (id: string): GameDef | undefined => GAMES.find(g => g.id === id);
