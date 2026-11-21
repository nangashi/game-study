// 生成画像（かぞえる問題の絵）。元の生成画像と並べ方は art/common/art.json（docs/02-asset-generation.md）
// 子どものアバターは画像ではなく、算数練習アプリと同じマスコット（src/ui/mascot.ts）
import { SHEETS } from './assets/common.gen';
import { spriteHtml } from './assets/sprite';

export const ICONS = SHEETS.icons;
export type IconName = keyof typeof ICONS.frames;

export const iconHtml = (name: IconName, size: number | string = '1.2em') => spriteHtml(ICONS, name, size);
