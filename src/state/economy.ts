import type { Profile, Settings } from './types';
import type { GameContext, GameDef, GameResult, GameReward, UpgradeDef } from '../games/types';
import { gameProgress, rollDaily, touchStreak } from './store';

// ごほうびの決まりは docs/03-rewards-and-games.md

export const QUEST_BONUS = 10;   // さいごまでやったら
export const GAME_COINS = { play: 3, firstClear: 25, replayClear: 8 };

export interface QuestReward { coins: number; tickets: number }

// クエストのごほうび。answerCoins は問題ごとのコインの合計（applyAnswer のもどり値）
// ゲーム券は、その日はじめてやった教科のときだけ
export function questReward(p: Profile, s: Settings, studyId: string, answerCoins: number, today: string): QuestReward {
  rollDaily(p, s, today);
  touchStreak(p, today);
  let tickets = 0;
  if (!p.daily.subjects.includes(studyId)) {
    p.daily.subjects.push(studyId);
    tickets = Math.max(0, Math.min(s.playsPerSubject, s.ticketsPerDay - p.daily.ticketsEarned));
  }
  const r: QuestReward = { coins: QUEST_BONUS + answerCoins, tickets };
  p.coins += r.coins;
  p.tickets += tickets;
  p.daily.ticketsEarned += tickets;
  p.daily.quests++;
  p.stats.quests++;
  return r;
}

// きょう、まだゲーム券がもらえる教科か
export function studyGivesTicket(p: Profile, s: Settings, studyId: string): boolean {
  return !p.daily.subjects.includes(studyId) && s.playsPerSubject > 0 && p.daily.ticketsEarned < s.ticketsPerDay;
}

export const upgradeLevel = (p: Profile, game: GameDef, u: UpgradeDef) => gameProgress(p, game.id).upgrades[u.id] ?? 0;
// ステージ n の推奨強化レベル（全強化のレベルの合計）。1〜3は強化なし、そのあと1ステージにつき2段階
export const recommendedLevel = (stage: number) => Math.max(0, 2 * (stage - 3));

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
