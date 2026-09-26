import { SHEETS } from './assets.gen';

// ラン内の成長（1回だけの成長。docs/03 4.）
// ぶき7つ（とどく きょりと あたる かずで やくを わける。docs/games/survivor.md「武器の役」）+ ほじょ3つ。もてる ぶきは 3つまで（わく）。
// でてくる ぶきは「つよくする」で 解放したものだけ。ぶきは MAX にして たからばこを あけると しんかする

export type WeaponId = 'bolt' | 'rang' | 'boom' | 'orbit' | 'frost' | 'thunder' | 'sword';
export type PassiveId = 'shoes' | 'heart' | 'magnet';
export type SkillId = WeaponId | PassiveId;

// アイコンは2つのシートのどちらか
export type Art = { sheet: 'icons'; frame: keyof typeof SHEETS.icons.frames } | { sheet: 'items'; frame: keyof typeof SHEETS.items.frames };
const icons = (frame: keyof typeof SHEETS.icons.frames): Art => ({ sheet: 'icons', frame });
const items = (frame: keyof typeof SHEETS.items.frames): Art => ({ sheet: 'items', frame });

// tag: こうげきの とくちょう（カードに 出す）
export interface SkillDef { art: Art; name: string; desc: string; max: number; tag?: string; evo?: { art: Art; name: string; desc: string } }

export const WEAPONS: WeaponId[] = ['bolt', 'rang', 'boom', 'orbit', 'frost', 'thunder', 'sword'];
export const BASE_WEAPONS: WeaponId[] = ['bolt', 'rang', 'boom']; // さいしょから でてくる ぶき
export const PASSIVES: PassiveId[] = ['shoes', 'heart', 'magnet'];
export const BASE_SLOTS = 3;
export const unlockId = (w: WeaponId) => `w_${w}`;

export const SKILLS: Record<SkillId, SkillDef> = {
  bolt:    { art: items('orb'), name: 'まほうだま', tag: 'とおく・ねらう', desc: 'とおくの てきを ねらう', max: 5,
    evo: { art: items('comet'), name: 'ながれぼし', desc: 'つらぬく ほしが たくさん' } },
  rang:    { art: items('rang'), name: 'ブーメラン', tag: 'つらぬく・むれ', desc: 'いって かえってくる', max: 5,
    evo: { art: items('tornado'), name: 'たつまき', desc: 'てきを すいこむ' } },
  boom:    { art: items('cherrybomb'), name: 'ばくだん', tag: 'とおく・かたまり', desc: 'とおくの かたまりに なげる', max: 5,
    evo: { art: items('firework'), name: 'はなび', desc: 'ばくはつが はじけて ひろがる' } },
  orbit:   { art: icons('orbit'), name: 'まわるほし', tag: 'まもる・たまをけす', desc: 'まわりを まもる', max: 5,
    evo: { art: items('planet'), name: 'ぎんがリング', desc: 'おおきな わが のびちぢみ' } },
  frost:   { art: items('shard'), name: 'こおり', tag: 'のろくする', desc: 'あたった てきが のろくなる', max: 5,
    evo: { art: items('blizzard'), name: 'ふぶき', desc: 'まわりが ずっと こおる' } },
  thunder: { art: items('thunder'), name: 'かみなり', tag: 'つながる・しびれる', desc: 'てきから てきへ つながる', max: 5,
    evo: { art: items('storm'), name: 'らいうん', desc: 'かみなりが ふりつづく' } },
  sword:   { art: items('slash'), name: 'つるぎ', tag: 'ちかい・つよい', desc: 'ちかくの てきを きる', max: 5,
    evo: { art: icons('swords'), name: 'にとうりゅう', desc: 'ぐるっと まわりを きる' } },
  shoes:   { art: icons('shoe'), name: 'はやあし', desc: 'はやく うごける', max: 5 },
  heart:   { art: icons('heart'), name: 'げんき', desc: 'ハートが ふえる', max: 5 },
  magnet:  { art: icons('magnet'), name: 'すいよせ', desc: 'ジェムを あつめやすい', max: 5 },
};

export const isWeapon = (id: SkillId): id is WeaponId => (WEAPONS as string[]).includes(id);
export const emptyLevels = (): Record<SkillId, number> =>
  ({ bolt: 0, rang: 0, boom: 0, orbit: 0, frost: 0, thunder: 0, sword: 0, shoes: 0, heart: 0, magnet: 0 });

// プレイの中の ルール: でてくる ぶき（解放したもの）と、もてる ぶきの数
export interface Loadout { pool: WeaponId[]; slots: number }

// いま えらべる スキル: MAX でないもの。ぶきの わくが いっぱいなら、もっている ぶきだけ
export function openSkills(levels: Record<SkillId, number>, lo: Loadout): SkillId[] {
  const owned = WEAPONS.filter(w => levels[w] > 0).length;
  return [...lo.pool, ...PASSIVES].filter(id =>
    levels[id] < SKILLS[id].max && (!isWeapon(id) || levels[id] > 0 || owned < lo.slots));
}

function shuffle<T>(a: T[], rng: () => number): T[] {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// レベルアップで出す3つ
export function skillChoices(levels: Record<SkillId, number>, lo: Loadout, rng = Math.random, n = 3): SkillId[] {
  return shuffle(openSkills(levels, lo), rng).slice(0, n);
}

// たからばこの中身: MAX のぶきがあれば しんか。なければ 持っているものを3つまで +1
export type ChestReward = { evolve: WeaponId } | { levelUp: SkillId[] } | { heal: true };

export function chestReward(levels: Record<SkillId, number>, evolved: WeaponId[], lo: Loadout, rng = Math.random): ChestReward {
  const ready = WEAPONS.filter(w => levels[w] >= SKILLS[w].max && !evolved.includes(w));
  if (ready.length) return { evolve: ready[Math.floor(rng() * ready.length)] };
  const open = openSkills(levels, lo);
  const owned = open.filter(id => levels[id] > 0);
  const pool = owned.length ? owned : open;
  if (!pool.length) return { heal: true };
  return { levelUp: shuffle([...pool], rng).slice(0, 3) };
}

// ---- おみせ（⭐メダル。プレイの中だけの お金。docs/03 6.） ----
// ねだんは 小さい数にする（年長さんでも くらべられるように）

export type ShopItem =
  | { kind: 'skill'; id: SkillId; price: number }
  | { kind: 'heal'; price: number }
  | { kind: 'chest'; price: number };

export const skillPrice = (lv: number) => (lv === 0 ? 8 : 6 + 2 * lv);
export const HEAL_PRICE = 5;
export const CHEST_PRICE = 20;

export function shopOffers(levels: Record<SkillId, number>, lo: Loadout, rng = Math.random): ShopItem[] {
  const skills = skillChoices(levels, lo, rng, 3).map(id => ({ kind: 'skill' as const, id, price: skillPrice(levels[id]) }));
  return [...skills, { kind: 'heal', price: HEAL_PRICE }, { kind: 'chest', price: CHEST_PRICE }];
}
