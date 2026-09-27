import type { Profile, Settings } from './types';
import { gradeRank } from './types';
import type { Selection } from '../studies/types';
import type { GameContext, GameDef, GameResult, GameReward, UpgradeDef } from '../games/types';
import { gameProgress, rollDaily, touchStreak } from './store';
import { checkAchievements } from './missions';

// ごほうびの決まりは docs/03-rewards-and-games.md

export const QUEST_BONUS = 10;   // さいごまでやったら
export const GAME_COINS = { play: 3, firstClear: 25, replayClear: 8 };

// 勉強のコインの倍率。まぜこぜがいちばん多く、下の学年はかなり少ない。上の学年は自分の学年と同じ
// ドリルは10問で、1問がすぐ終わるので低め（10問ぜんぶ新しい問題でも、まぜこぜ5問より少なくなる）
export const RATE = { mixed: 1, category: 0.7, drill: 0.5, lower: 0.3 };

export const isLowerGrade = (p: Profile, sel: Selection) => gradeRank(sel.grade) < gradeRank(p.grade);
export const selectionRate = (p: Profile, sel: Selection) =>
  isLowerGrade(p, sel) ? RATE.lower : sel.drill ? RATE.drill : sel.category ? RATE.category : RATE.mixed;

// 1回ぶんのコイン = (完走ボーナス + 問題ごとのコイン) × 倍率（切り上げ）
export const questCoins = (answerCoins: number, rate: number) => Math.ceil((QUEST_BONUS + answerCoins) * rate - 1e-9);

// tickets: もらった教科の券（pending: そのうち満タンで入らず、うけとりまちにしたもの）
// achieved: 新しく たっせいした たっせいミッション
export interface QuestReward { coins: number; tickets: number; pending: number; achieved: string[] }

// クエストのごほうび。answerCoins は問題ごとのコインの合計（applyAnswer のもどり値）
// ゲーム券は、その日はじめてやった教科のときだけ。下の学年・ドリルは券なし
export function questReward(p: Profile, s: Settings, sel: Selection, answerCoins: number, today: string): QuestReward {
  rollDaily(p, today);
  touchStreak(p, today);
  let tickets = 0, pending = 0;
  if (!isLowerGrade(p, sel) && !sel.drill && !p.daily.subjects.includes(sel.study)) {
    p.daily.subjects.push(sel.study);
    tickets = Math.max(0, Math.min(s.playsPerSubject, s.ticketsPerDay - p.daily.ticketsEarned));
    pending = Math.min(tickets, Math.max(0, tickets - (s.ticketMax - p.tickets)));
  }
  const coins = questCoins(answerCoins, selectionRate(p, sel));
  p.coins += coins;
  p.tickets += tickets - pending;
  p.daily.pending += pending;
  p.daily.ticketsEarned += tickets;
  p.daily.quests++;
  p.stats.quests++;
  return { coins, tickets, pending, achieved: checkAchievements(p, today) };
}

// きょう、まだゲーム券がもらえる教科か（sel をわたすと、下の学年・ドリルなら false）
export function studyGivesTicket(p: Profile, s: Settings, studyId: string, sel?: Selection): boolean {
  if (sel && (isLowerGrade(p, sel) || sel.drill)) return false;
  return !p.daily.subjects.includes(studyId) && s.playsPerSubject > 0 && p.daily.ticketsEarned < s.ticketsPerDay;
}

export const upgradeLevel = (p: Profile, game: GameDef, u: UpgradeDef) => gameProgress(p, game.id).upgrades[u.id] ?? 0;
// ステージ n までに 強化に使う目安のコイン（docs/03 5.）。1〜3は0、そのあと1ステージにつき 80
// （はじめてのクリア 28 + 勉強 約2回ぶん）
export const COINS_PER_STAGE = 80;
export const recommendedCoins = (stage: number) => Math.max(0, COINS_PER_STAGE * (stage - 3));

// 推奨強化レベル: recommendedCoins を 数値の強化（stat）に、安いものから じゅんに使ったときの レベルの合計。
// 敵の強さは これに そろえる。解放（unlock）は ふくめない
export function recommendedLevel(stage: number, upgrades: UpgradeDef[]): number {
  const stats = upgrades.filter(u => (u.kind ?? 'stat') === 'stat');
  const lv = stats.map(() => 0);
  let coins = recommendedCoins(stage), total = 0;
  for (;;) {
    let best = -1;
    stats.forEach((u, i) => { if (lv[i] < u.max && (best < 0 || upgradeCost(u, lv[i]) < upgradeCost(stats[best], lv[best]))) best = i; });
    if (best < 0 || upgradeCost(stats[best], lv[best]) > coins) return total;
    coins -= upgradeCost(stats[best], lv[best]);
    lv[best]++; total++;
  }
}

export const upgradeCost = (u: UpgradeDef, level: number) => u.cost.base + u.cost.step * level;

export function canUpgrade(p: Profile, game: GameDef, u: UpgradeDef): boolean {
  const lv = upgradeLevel(p, game, u);
  return lv < u.max && p.coins >= upgradeCost(u, lv);
}

export function buyUpgrade(p: Profile, game: GameDef, u: UpgradeDef): boolean {
  if (!canUpgrade(p, game, u)) return false;
  const lv = upgradeLevel(p, game, u);
  p.coins -= upgradeCost(u, lv);
  gameProgress(p, game.id).upgrades[u.id] = lv + 1;
  return true;
}

export function gameContext(p: Profile, game: GameDef): GameContext {
  const g = gameProgress(p, game.id);
  return {
    avatar: p.avatar,
    easy: p.grade === 'k',
    stage: Math.min(g.stage + 1, game.stages),
    upgrades: Object.fromEntries(game.upgrades.map(u => [u.id, g.upgrades[u.id] ?? 0])),
  };
}

// ゲームのごほうび（全ゲーム共通）。ステージによらず一定なので、1ステージに要る勉強もいつも同じくらいになる
export function finishGame(p: Profile, gameId: string, r: GameResult): GameReward {
  const g = gameProgress(p, gameId);
  g.plays++;
  g.best = Math.max(g.best, r.score);
  const firstClear = r.cleared && r.stage > g.stage;
  let coins = GAME_COINS.play;
  if (firstClear) {
    coins += GAME_COINS.firstClear;
    g.stage = r.stage;
  } else if (r.cleared) {
    coins += GAME_COINS.replayClear;
  }
  if (r.cleared) g.clears++;
  p.coins += coins;
  return { coins, firstClear };
}
