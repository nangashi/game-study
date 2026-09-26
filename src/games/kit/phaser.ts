// Phaser でシートを読む（Phaser を使うゲームだけが import する）
import type Phaser from 'phaser';
import { assetUrl, type Sheet } from '../../assets/sprite';

export function loadSheet(scene: Phaser.Scene, key: string, sheet: Sheet): void {
  scene.load.spritesheet(key, assetUrl(sheet.url), { frameWidth: sheet.cell, frameHeight: sheet.cell });
}

export const frameOf = <S extends Sheet>(sheet: S, name: keyof S['frames'] & string): number => sheet.frames[name];
