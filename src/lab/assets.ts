// あそびラボの画像（art/lab/art.json → assets.gen.ts）。ラボのゲームはここから使う
import type Phaser from 'phaser';
import { SHEETS } from './assets.gen';
import { loadSheet } from '../games/kit/phaser';

export { SHEETS as LAB_SHEETS, IMAGES as LAB_IMAGES } from './assets.gen';

export type IconName = keyof typeof SHEETS.icons.frames;
export const ENEMY_FRAME = SHEETS.enemies.frames;

// Phaser のテクスチャ名とフレーム番号
export const iconFrame = (name: IconName) => ({ sheet: 'icons', frame: SHEETS.icons.frames[name] });

export function loadLabSheets(scene: Phaser.Scene): void {
  loadSheet(scene, 'icons', SHEETS.icons);
  loadSheet(scene, 'enemies', SHEETS.enemies);
}
