// 土台（プラットフォーム）の画像。ゲームの画像は src/games/<id>/assets.gen.ts
// 元の生成画像と並べ方は art/common/art.json（docs/02-asset-generation.md）
import { SHEETS } from './assets/common.gen';
import { spriteHtml, spriteStyle } from './assets/sprite';

export { IMAGES as COMMON_IMAGES } from './assets/common.gen';

// 子どものアバター（主人公）。2x2 の歩きアニメ
export const HEROES = [
  { id: 'wizard', name: 'まほうつかい' },
  { id: 'witch', name: 'まじょ' },
  { id: 'knight', name: 'きし' },
  { id: 'ninja', name: 'にんじゃ' },
  { id: 'cat', name: 'ねこ' },
  { id: 'dino', name: 'きょうりゅう' },
] as const;
export type HeroId = typeof HEROES[number]['id'];
export const isHero = (id: string): id is HeroId => HEROES.some(h => h.id === id);
export const heroSheet = (id: HeroId) => SHEETS[`hero_${id}`];

export const ICONS = SHEETS.icons;
export type IconName = keyof typeof ICONS.frames;

export const iconHtml = (name: IconName, size: number | string = '1.2em') => spriteHtml(ICONS, name, size);

// 主人公。walk=true で歩きアニメ（CSS）
export function heroHtml(id: HeroId, size: number | string, walk = false): string {
  return `<span class="ico hero${walk ? ' hero-walk' : ''}" role="img" aria-label="${id}" style="${spriteStyle(heroSheet(id), 0, size)}"></span>`;
}
