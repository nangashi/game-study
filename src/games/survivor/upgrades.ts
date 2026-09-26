import type { UpgradeDef } from '../types';

// ずっと残る強化（docs/03 4. 7.）。ねだんは レベルが上がるほど 高くなる（40 → 60 → … → 220）
// 数値の強化を ぜんぶ買うと 5200コイン（勉強とゲームで 2〜3か月）。推奨コインとの つりあいは stages.ts の enemyPower
const stat = (id: string, icon: string, name: string): UpgradeDef =>
  ({ id, icon, name, max: 10, cost: { base: 40, step: 20 } });

export const SURVIVOR_UPGRADES: UpgradeDef[] = [
  stat('hp', 'heart', 'たいりょく'),
  stat('atk', 'sword', 'こうげき'),
  stat('speed', 'shoe', 'すばやさ'),
  stat('magnet', 'magnet', 'じしゃく'),
  // 解放: ぶきの しゅるいを ふやす（プレイの中で でてくる ぶきが ふえる）
  { id: 'w_orbit',   kind: 'unlock', icon: 'orbit',   name: 'まわるほし', desc: 'ちかく: まわりを まもる', max: 1, cost: { base: 120, step: 0 } },
  { id: 'w_frost',   kind: 'unlock', icon: 'shard',   name: 'こおり',     desc: 'おそくする: てきが のろくなる', max: 1, cost: { base: 150, step: 0 } },
  { id: 'w_thunder', kind: 'unlock', icon: 'thunder', name: 'かみなり',   desc: 'ランダム: がめんの どこかに おちる', max: 1, cost: { base: 150, step: 0 } },
  { id: 'w_sword',   kind: 'unlock', icon: 'slash',   name: 'つるぎ',     desc: 'ちかく: すすむ ほうを きる', max: 1, cost: { base: 180, step: 0 } },
  // 解放: えらべる はばを ふやす
  { id: 'slot',   kind: 'unlock', icon: 'chest', name: 'ぶきの わく', desc: 'もてる ぶきが 3 → 4', max: 1, cost: { base: 300, step: 0 } },
  { id: 'reroll', kind: 'unlock', icon: 'dice',  name: 'えらびなおし', desc: 'スキルと おみせを えらびなおせる', max: 3, cost: { base: 80, step: 40 } },
];
