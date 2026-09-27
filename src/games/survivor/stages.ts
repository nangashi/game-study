import { recommendedLevel } from '../../state/economy';
import { SURVIVOR_UPGRADES } from './upgrades';
import type { SHEETS, IMAGES } from './assets.gen';

// ステージの中身（docs/games/survivor.md「ステージ」、docs/03 5.）
// 3つのせかい × 5ステージ。5ステージめは せかいのボス。
// 敵の強さは推奨強化レベルにそろえて足し算で上げる。ステージ1〜3は 種類・数・イベントだけで変える

export const STAGES_PER_WORLD = 5;
// 1回の長さ（docs/03 2.: 3〜7分）。4分 いきのこるか、3分で出る ボスを たおせば クリア
export const MAIN_SECONDS = 240;
export const BOSS_AT = 180;
export const SURVIVOR_STAGES = 15;
export const isBossStage = (stage: number) => stage % STAGES_PER_WORLD === 0;

// 敵の役（うごき方）
export type Role = 'swarm' | 'fast' | 'dasher' | 'shooter' | 'tank' | 'boss';
export type EnemySheet = 'enemies' | 'enemies_snow' | 'enemies_candy';

// 敵ごとの とくちょう（役の うごきに たす）。15たい ぜんぶ ちがう
export type Trait =
  | 'split' | 'zigzag' | 'phase' | 'spread' | 'stomp'          // くさはら
  | 'throw' | 'freeze' | 'slide' | 'bigball' | 'charge'        // ゆきやま
  | 'hop' | 'swoop' | 'bounce' | 'lob' | 'spawner'             // おかしのくに
  | 'ring' | 'icering' | 'bombrain';                           // ボス

// ずかんに 出す せつめい
export const TRAIT_DESC: Record<Trait, string> = {
  split: 'たおすと 2ひきに わかれる', zigzag: 'ジグザグに とぶ', phase: 'ときどき すきとおって こうげきが きかない',
  spread: 'たまを 3つ うつ', stomp: 'ちかくで ドシン！（赤い わに はいらない）',
  throw: 'ゆきだまを なげる', freeze: 'さわると うごきが のろくなる', slide: 'おなかで すーっと とおくまで すべる',
  bigball: 'おおきな ゆきだまを なげる', charge: 'うなって から とっしん',
  hop: 'ぴょんぴょん はねて ちかづく', swoop: 'まわりを まわって から とびこむ', bounce: '2かい つづけて ころがる',
  lob: 'ばくだんを なげる（赤い わから にげる）', spawner: 'グミを うみだす',
  ring: 'たまを わっかに うつ・てしたを よぶ', icering: 'こおりの たまを わっかに うつ', bombrain: 'ばくだんを たくさん なげる',
};

export interface World {
  name: string;
  sheet: EnemySheet;
  ground: keyof typeof IMAGES;
  emblem: 'grass' | 'snow' | 'candy'; // せかいの しるし（items のフレーム名）
  bg: string;           // 地面が読みこまれるまでの色
  groundTint: number;   // 地面を すこし暗くして、白っぽい敵を見やすくする
  kinds: Record<Role, string>; // 役 → 敵の絵（シートのフレーム名）
  traits: Record<Role, Trait>;
}

export const WORLDS: World[] = [
  { name: 'くさはら', sheet: 'enemies', ground: 'ground', emblem: 'grass', bg: '#bbf7d0', groundTint: 0xffffff,
    kinds: { swarm: 'slime', fast: 'bat', dasher: 'ghost', shooter: 'mushroom', tank: 'golem', boss: 'dragon' },
    traits: { swarm: 'split', fast: 'zigzag', dasher: 'phase', shooter: 'spread', tank: 'stomp', boss: 'ring' } },
  { name: 'ゆきやま', sheet: 'enemies_snow', ground: 'ground_snow', emblem: 'snow', bg: '#e0f2fe', groundTint: 0xa9c6e6,
    kinds: { swarm: 'snowman', fast: 'icebat', dasher: 'penguin', shooter: 'yeti', tank: 'polarbear', boss: 'icedragon' },
    traits: { swarm: 'throw', fast: 'freeze', dasher: 'slide', shooter: 'bigball', tank: 'charge', boss: 'icering' } },
  { name: 'おかしのくに', sheet: 'enemies_candy', ground: 'ground_candy', emblem: 'candy', bg: '#fce7f3', groundTint: 0xf3d4e4,
    kinds: { swarm: 'gummy', fast: 'candybat', dasher: 'donut', shooter: 'cupcake', tank: 'cake', boss: 'chocoking' },
    traits: { swarm: 'hop', fast: 'swoop', dasher: 'bounce', shooter: 'lob', tank: 'spawner', boss: 'bombrain' } },
];

// 役ごとの基本の強さ。size は画面上の大きさ(px)、xp は落とすジェムの量
export const ROLES: Record<Role, { hp: number; speed: number; size: number; xp: number; weight: number }> = {
  swarm:   { hp: 1,   speed: 62,  size: 54, xp: 1, weight: 5 },
  fast:    { hp: 1.5, speed: 110, size: 56, xp: 1, weight: 3 },
  dasher:  { hp: 3,   speed: 55,  size: 62, xp: 2, weight: 2 },
  shooter: { hp: 3,   speed: 55,  size: 62, xp: 2, weight: 2 },
  tank:    { hp: 14,  speed: 40,  size: 88, xp: 5, weight: 1 },
  boss:    { hp: 220, speed: 46,  size: 180, xp: 0, weight: 0 },
};

// 時間で起きること
export type StageEvent =
  | { at: number; kind: 'flock' }   // はやい敵のむれが 画面をよこぎる
  | { at: number; kind: 'ring' }    // ぐるっと かこまれる
  | { at: number; kind: 'rush' }    // 10びょう、敵がいっぱい
  | { at: number; kind: 'elite' }   // つよい敵（たおすと たからばこ）
  | { at: number; kind: 'item' }    // ばくだん・じしゃく・おにく が おちる
  | { at: number; kind: 'shop' }    // おみせ（⭐メダルで かう）
  | { at: number; kind: 'boss' };

export interface StageSpec {
  stage: number;
  world: number;
  roles: Role[];        // ふつうに出てくる敵の役
  power: number;        // 敵の体力の倍率
  speed: number;        // 敵の はやさの倍率
  density: number;      // 出てくる多さの倍率
  shooterCap: number;   // うつ敵が 同時に 出ている かずの 上限
  events: StageEvent[];
  bossHp: number;
  bossSize: number;
  bigBoss: boolean;     // せかいのボス（こうげきが多い）
}

export const worldOf = (stage: number) => Math.floor((stage - 1) / STAGES_PER_WORLD);

// 敵の体力の倍率。推奨強化レベル1つにつき +7%。
// 強化は4つに分かれるので、こうげきに回るのは およそ 1/4（+25% × 1/4 ≒ +6%）。のこりの たいりょく・すばやさ・じしゃく の分だけ 少し強くしている
// （自動プレイで合わせた。docs/games/survivor.md）
export const ENEMY_POWER_PER_LEVEL = 0.07;
export const enemyPower = (stage: number) => 1 + ENEMY_POWER_PER_LEVEL * recommendedLevel(stage, SURVIVOR_UPGRADES);

// せかいの中の ステージ番号ごとの 出てくる多さ（4より先は 1）
const DENSITY = [0.75, 0.82, 0.9, 1];

export function stageSpec(stage: number): StageSpec {
  const world = worldOf(stage);
  const k = (stage - 1) % STAGES_PER_WORLD + 1; // せかいの中で何番め（1〜5）
  // ステージ1から たまを うつ敵を出す（あぶない ことが ないと 作業に なる）。あたらしい せかいは はじめから ぜんぶ
  const order: Role[] = ['swarm', 'fast', 'shooter', 'dasher', 'tank'];
  const roles = order.slice(0, world === 0 ? Math.min(5, k + 2) : 5);
  const events: StageEvent[] = [
    { at: 20, kind: 'item' },
    { at: 40, kind: 'flock' },
    { at: 60, kind: 'elite' },
    { at: 80, kind: 'item' },
    { at: 90, kind: 'shop' },
    ...(k >= 2 || world > 0 ? [{ at: 100, kind: 'ring' } as const] : []),
    { at: 120, kind: 'elite' },
    ...(k >= 3 || world > 0 ? [{ at: 135, kind: 'rush' } as const] : []),
    { at: 150, kind: 'item' },
    { at: 160, kind: 'flock' },
    { at: 170, kind: 'shop' },
    { at: BOSS_AT, kind: 'boss' },
    { at: 210, kind: 'item' },
  ];
  const big = isBossStage(stage);
  return {
    stage, world, roles, events,
    power: enemyPower(stage),
    speed: 1 + 0.01 * recommendedLevel(stage, SURVIVOR_UPGRADES),
    // ステージ1〜3（強化なし）は、数で少しずつ むずかしくする（ステージ2で おしつぶされない ように ゆるやかに。版6）
    density: DENSITY[Math.min(k, DENSITY.length) - 1],
    // うつ敵は おおいと 弾だらけで 近づけない。ステージ1で2、15で8
    shooterCap: 1 + k + world,
    bossHp: ROLES.boss.hp * enemyPower(stage) * (big ? 1.6 : 1),
    bossSize: big ? 200 : 150,
    bigBoss: big,
  };
}

// ★の数: クリア / ボスをたおした / ハートが半分より多く のこった
export function starsOf(r: { cleared: boolean; bossDefeated: boolean; hp: number; maxHp: number }): number {
  if (!r.cleared) return 0;
  return 1 + (r.bossDefeated ? 1 : 0) + (r.hp * 2 > r.maxHp ? 1 : 0);
}

export type EnemyFrame = keyof typeof SHEETS.enemies.frames | keyof typeof SHEETS.enemies_snow.frames | keyof typeof SHEETS.enemies_candy.frames;
