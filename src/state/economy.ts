import type { Profile, Settings } from './types';
import { gradeRank } from './types';
import type { Selection } from '../studies/types';
import type { GameContext, GameDef, GameResult, GameReward, UpgradeDef } from '../games/types';
import { gameProgress, rollDaily, touchStreak } from './store';

// ごほうびの決まりは docs/03-rewards-and-games.md

export const QUEST_BONUS = 10;   // さいごまでやったら
export const GAME_COINS = { play: 3, firstClear: 25, replayClear: 8 };

// 勉強のコインの倍率。まぜこぜがいちばん多く、下の学年はかなり少ない。上の学年は自分の学年と同じ
export const RATE = { mixed: 1, category: 0.7, lower: 0.3 };

export const isLowerGrade = (p: Profile, sel: Selection) => gradeRank(sel.grade) < gradeRank(p.grade);
export const selectionRate = (p: Profile, sel: Selection) =>
  isLowerGrade(p, sel) ? RATE.lower : sel.category ? RATE.category : RATE.mixed;

// 1回ぶんのコイン = (完走ボーナス + 問題ごとのコイン) × 倍率（切り上げ）
export const questCoins = (answerCoins: number, rate: number) => Math.ceil((QUEST_BONUS + answerCoins) * rate - 1e-9);

export interface QuestReward { coins: number; tickets: number }

// クエストのごほうび。answerCoins は問題ごとのコインの合計（applyAnswer のもどり値）
// ゲーム券は、その日はじめてやった教科のときだけ。下の学年をえらんだときは券なし
export function questReward(p: Profile, s: Settings, sel: Selection, answerCoins: number, today: string): QuestReward {
  rollDaily(p, s, today);
  touchStreak(p, today);
  let tickets = 0;
  if (!isLowerGrade(p, sel) && !p.daily.subjects.includes(sel.study)) {
    p.daily.subjects.push(sel.study);
    tickets = Math.max(0, Math.min(s.playsPerSubject, s.ticketsPerDay - p.daily.ticketsEarned));
  }
  const r: QuestReward = { coins: questCoins(answerCoins, selectionRate(p, sel)), tickets };
  p.coins += r.coins;
  p.tickets += tickets;
  p.daily.ticketsEarned += tickets;
  p.daily.quests++;
  p.stats.quests++;
  return r;
}

// きょう、まだゲーム券がもらえる教科か（sel をわたすと、下の学年なら false）
export function studyGivesTicket(p: Profile, s: Settings, studyId: string, sel?: Selection): boolean {
  if (sel && isLowerGrade(p, sel)) return false;
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
