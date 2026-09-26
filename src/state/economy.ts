import type { Profile, Settings, Subject, UpgradeId } from './types';
import { rollDaily, touchStreak } from './store';
import type { IconName } from '../art';

export interface QuestReward { coins: number; feathers: number; stars: number; ticket: boolean }

// クエストのごほうび。正解数よりも「さいごまでやった」ことを重く見る
export function questReward(p: Profile, s: Settings, subject: Subject, correct: number, today: string): QuestReward {
  rollDaily(p, today);
  touchStreak(p, today);
  const ticket = p.daily.ticketsEarned < s.ticketsPerDay;
  const mat = 2 + correct;
  const r: QuestReward = {
    coins: 10 + correct * 2,
    feathers: subject === 'kokugo' ? mat : 0,
    stars: subject === 'sansu' ? mat : 0,
    ticket,
  };
  p.coins += r.coins; p.feathers += r.feathers; p.stars += r.stars;
  if (ticket) { p.tickets++; p.daily.ticketsEarned++; }
  p.daily.quests++;
  p.stats.quests++;
  return r;
}

export const UPGRADES: Record<UpgradeId, { icon: IconName; name: string; material: 'feathers' | 'stars'; max: number }> = {
  hp:     { icon: 'heart', name: 'たいりょく', material: 'feathers', max: 10 },
  atk:    { icon: 'sword', name: 'こうげき',   material: 'stars',    max: 10 },
  speed:  { icon: 'shoe', name: 'すばやさ',   material: 'feathers', max: 10 },
  magnet: { icon: 'magnet', name: 'じしゃく',   material: 'stars',    max: 10 },
};

// こくごとさんすうの両方をやらないと、全部は強くできない
export function upgradeCost(p: Profile, id: UpgradeId) {
  const lv = p.upgrades[id];
  return { coins: 15 + lv * 10, material: UPGRADES[id].material, amount: 2 + lv * 2 };
}

export function canUpgrade(p: Profile, id: UpgradeId): boolean {
  const c = upgradeCost(p, id);
  return p.upgrades[id] < UPGRADES[id].max && p.coins >= c.coins && p[c.material] >= c.amount;
}

export function buyUpgrade(p: Profile, id: UpgradeId): boolean {
  if (!canUpgrade(p, id)) return false;
  const c = upgradeCost(p, id);
  p.coins -= c.coins; p[c.material] -= c.amount; p.upgrades[id]++;
  return true;
}

export interface RunResult { seconds: number; kills: number; cleared: boolean; level: number }

export function runReward(p: Profile, r: RunResult): number {
  const coins = Math.floor(r.kills / 3) + Math.floor(r.seconds / 10) + (r.cleared ? 30 : 0);
  p.coins += coins;
  p.stats.runs++;
  if (r.cleared) p.stats.clears++;
  p.stats.bestKills = Math.max(p.stats.bestKills, r.kills);
  return coins;
}
