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
