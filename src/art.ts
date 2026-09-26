// 画像の一覧。画像は public/sprites/（scripts/build-art.mjs で art/raw/ から作る）
// 主人公: 2x2 の歩きアニメ / 敵: 3x2 / アイコン: 4x4

export const SPRITE_BASE = `${import.meta.env.BASE_URL}sprites/`;

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

export const ENEMY_FRAME = { slime: 0, ghost: 1, bat: 2, mushroom: 3, golem: 4, dragon: 5 } as const;

const ICON_FRAMES = {
  icons1: ['coin', 'feather', 'star', 'ticket', 'bolt', 'orbit', 'gem', 'boom', 'heart', 'shoe', 'magnet', 'sword', 'pencil', 'abacus', 'swords', 'hammer'],
  icons2: ['apple', 'fish', 'car', 'frog', 'donut', 'tulip', 'ladybug', 'balloon', 'flame', 'clock', 'trophy', 'home', 'back', 'family', 'maru', 'sweat'],
} as const;
export type IconName = typeof ICON_FRAMES[keyof typeof ICON_FRAMES][number];

export function iconFrame(name: IconName): { sheet: keyof typeof ICON_FRAMES; frame: number } {
  for (const sheet of Object.keys(ICON_FRAMES) as (keyof typeof ICON_FRAMES)[]) {
    const frame = (ICON_FRAMES[sheet] as readonly string[]).indexOf(name);
    if (frame >= 0) return { sheet, frame };
  }
  throw new Error(`unknown icon ${name}`);
}

// CSS スプライト（DOM 用）。size は px または CSS の長さ
function spriteStyle(file: string, cols: number, rows: number, frame: number, size: string): string {
  const c = frame % cols, r = Math.floor(frame / cols);
  const x = cols > 1 ? (c / (cols - 1)) * 100 : 0, y = rows > 1 ? (r / (rows - 1)) * 100 : 0;
  return `width:${size};height:${size};background-image:url(${SPRITE_BASE}${file});background-size:${cols * 100}% ${rows * 100}%;background-position:${x}% ${y}%`;
}

const len = (size: number | string) => (typeof size === 'number' ? `${size}px` : size);

export function iconHtml(name: IconName, size: number | string = '1.2em'): string {
  const { sheet, frame } = iconFrame(name);
  return `<span class="ico" role="img" aria-label="${name}" style="${spriteStyle(`${sheet}.webp`, 4, 4, frame, len(size))}"></span>`;
}

// 主人公。walk=true で歩きアニメ（CSS）
export function heroHtml(id: HeroId, size: number | string, walk = false): string {
  return `<span class="ico hero${walk ? ' hero-walk' : ''}" role="img" aria-label="${id}" style="${spriteStyle(`hero_${id}.webp`, 2, 2, 0, len(size))}"></span>`;
}
