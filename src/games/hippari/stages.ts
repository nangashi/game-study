import { recommendedLevel as levelFor } from '../../state/economy';
import { HIPPARI_UPGRADES } from './upgrades';
import { shuffle, pick, type Rng } from '../../learn/random';
import type { SHEETS } from './assets.gen';

// ステージの中身（docs/03-rewards-and-games.md 5.）
// 敵の強さは推奨強化レベルにそろえて足し算で上げる。ステージ1〜3は数と種類だけで変える

export const HIPPARI_STAGES = 20;
export const isBossStage = (stage: number) => stage % 5 === 0;

export type EnemyKind = keyof typeof SHEETS.enemies.frames;
export interface EnemySpec { kind: EnemyKind; hp: number; atk: number; turns: number; size: number; x: number; y: number } // x, y は 0〜1
export interface StageSpec { waves: EnemySpec[][] }

// turns: 何回ひっぱったら こうげきしてくるか / from: 出はじめるステージ
const KINDS: Record<EnemyKind, { hp: number; turns: number; size: number; from: number }> = {
  robot:  { hp: 3,  turns: 3, size: 100, from: 1 },  // ねじまきロボ
  top:    { hp: 4,  turns: 2, size: 100, from: 2 },  // こま
  dino:   { hp: 3,  turns: 2, size: 100, from: 3 },  // おもちゃのきょうりゅう
  teddy:  { hp: 6,  turns: 3, size: 108, from: 5 },  // くまのぬいぐるみ
  blocks: { hp: 10, turns: 4, size: 140, from: 7 },  // つみきゴーレム
  king:   { hp: 24, turns: 3, size: 200, from: 5 },  // ボス: ロボのおうさま
};
const SMALL: EnemyKind[] = ['robot', 'top', 'dino', 'teddy'];

// 敵をおく場所（上の方）
const SLOTS: [number, number][] = [
  [0.2, 0.14], [0.5, 0.12], [0.8, 0.14],
  [0.32, 0.28], [0.68, 0.28],
  [0.16, 0.42], [0.5, 0.42], [0.84, 0.42],
];

// ステージごとにいつも同じ並びにする
function seeded(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// 敵の強さの倍率。ステージが1つ進むと、こうげき強化1段階（+25%）ぶん強くなる
export const recommendedLevel = (stage: number) => levelFor(stage, HIPPARI_UPGRADES);
export const enemyPower = (stage: number) => 1 + 0.125 * recommendedLevel(stage);

export function stageSpec(stage: number, easy: boolean): StageSpec {
  const rng = seeded(stage * 7919);
  const r = recommendedLevel(stage);
  const power = enemyPower(stage);
  const atk = 1 + Math.floor(r / 10);
  const small = SMALL.filter(k => KINDS[k].from <= stage);
  const enemy = (kind: EnemyKind, [x, y]: [number, number], bonusAtk = 0): EnemySpec => ({
    kind, x, y, size: KINDS[kind].size,
    hp: Math.round(KINDS[kind].hp * power),
    atk: atk + bonusAtk,
    turns: KINDS[kind].turns + (easy ? 1 : 0),
  });

  const waveCount = stage === 1 ? 2 : 3;
  const waves = Array.from({ length: waveCount }, (_, w) => {
    const last = w === waveCount - 1;
    const count = Math.min(2 + Math.floor((stage - 1) / 4) + w, 6);
    // 5ステージごとにボス
    if (last && isBossStage(stage)) {
      return [enemy('king', [0.5, 0.24], 1), enemy(pick(rng, small), [0.16, 0.46]), enemy(pick(rng, small), [0.84, 0.46])];
    }
    // 4ステージから、さいごの波には大きい敵（まわりの場所はあける）
    const big = last && stage >= 4;
    const slots = shuffle(rng, big ? SLOTS.filter(([x, y]) => Math.hypot(x - 0.5, y - 0.2) > 0.2) : SLOTS);
    const list = Array.from({ length: big ? count - 1 : count }, (_, i) => enemy(pick(rng, small), slots[i]));
    if (big) list.unshift(enemy(KINDS.blocks.from <= stage ? 'blocks' : 'teddy', [0.5, 0.2]));
    return list;
  });
  return { waves };
}
