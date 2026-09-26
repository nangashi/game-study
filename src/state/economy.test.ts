import { describe, expect, it } from 'vitest';
import { GAME_COINS, buyUpgrade, finishGame, questReward, recommendedLevel, upgradeLevel } from './economy';
import { DEFAULT_SETTINGS, newProfile, rollDaily, touchStreak } from './store';
import { SURVIVOR } from '../games/survivor';

const mix = (study: string) => ({ study, grade: 2 as const });

describe('questReward', () => {
  it('ゲーム券は、その日はじめての教科ごとに1枚。同じ教科の2回目はコインだけ', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = DEFAULT_SETTINGS;
    const start = p.tickets;
    expect(questReward(p, s, mix('kokugo'), 20, '2026-09-26')).toEqual({ coins: 30, tickets: 1 });
    expect(questReward(p, s, mix('kokugo'), 20, '2026-09-26')).toEqual({ coins: 30, tickets: 0 });
    expect(questReward(p, s, mix('sansu'), 0, '2026-09-26')).toEqual({ coins: 10, tickets: 1 });
    expect(p.tickets).toBe(start + 2);
    expect(questReward(p, s, mix('sansu'), 5, '2026-09-27').tickets).toBe(1);
    expect(p.coins).toBe(30 + 30 + 10 + 15);
  });

  it('1日の上限をこえない', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = { ...DEFAULT_SETTINGS, playsPerSubject: 2, ticketsPerDay: 3 };
    expect(questReward(p, s, mix('kokugo'), 0, '2026-09-26').tickets).toBe(2);
    expect(questReward(p, s, mix('sansu'), 0, '2026-09-26').tickets).toBe(1);
  });

  it('カテゴリは0.7倍、下の学年は0.3倍で券なし。上の学年は自分の学年と同じ', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = DEFAULT_SETTINGS;
    expect(questReward(p, s, { study: 'kokugo', grade: 1 }, 20, '2026-09-26')).toEqual({ coins: 9, tickets: 0 });
    expect(questReward(p, s, { study: 'kokugo', grade: 2, category: 'okuri' }, 20, '2026-09-26')).toEqual({ coins: 21, tickets: 1 });
    expect(questReward(p, s, { study: 'sansu', grade: 3 }, 20, '2026-09-26')).toEqual({ coins: 30, tickets: 1 });
    expect(questReward(p, s, { study: 'sansu', grade: 2, category: 'drill-2', drill: true }, 40, '2026-09-26').coins).toBe(25);
  });

  it('むりょうの券は日付が変わったときにくばる', () => {
    const p = newProfile('t', 'wizard', 2);
    const start = p.tickets;
    rollDaily(p, { ...DEFAULT_SETTINGS, freePlaysPerDay: 2 }, '2026-10-01');
    rollDaily(p, { ...DEFAULT_SETTINGS, freePlaysPerDay: 2 }, '2026-10-01');
    expect(p.tickets).toBe(start + 2);
    rollDaily(p, DEFAULT_SETTINGS, '2026-10-02');
    expect(p.tickets).toBe(start + 2);
  });
});

describe('upgrades', () => {
  it('コインで強化し、ゲームごとに記録する', () => {
    const p = newProfile('t', 'wizard', 2);
    const hp = SURVIVOR.upgrades[0];
    p.coins = 60;
    expect(buyUpgrade(p, SURVIVOR, hp)).toBe(true);   // 25
    expect(buyUpgrade(p, SURVIVOR, hp)).toBe(true);   // 25
    expect(buyUpgrade(p, SURVIVOR, hp)).toBe(false);
    expect(upgradeLevel(p, SURVIVOR, hp)).toBe(2);
    expect(p.games.survivor.upgrades).toEqual({ hp: 2 });
    expect(p.coins).toBe(10);
  });
});

describe('finishGame', () => {
  it('はじめてのクリアは一定、再クリアは少し、負けは参加ぶんだけ', () => {
    const p = newProfile('t', 'wizard', 2);
    expect(finishGame(p, 'x', { cleared: false, stage: 1, score: 10 })).toEqual({ coins: 3, firstClear: false });
    expect(finishGame(p, 'x', { cleared: true, stage: 1, score: 5 })).toEqual({ coins: 28, firstClear: true });
    expect(finishGame(p, 'x', { cleared: true, stage: 1, score: 5 })).toEqual({ coins: 11, firstClear: false });
    expect(finishGame(p, 'x', { cleared: true, stage: 3, score: 5 }).coins).toBe(28);
    expect(p.games.x).toMatchObject({ stage: 3, best: 10, plays: 4, clears: 3 });
  });
});

describe('つりあい', () => {
  it('ステージ4からは、1ステージにつき「ゲームクリア + 勉強の約22コイン」で足りる', () => {
    const cost = SURVIVOR.upgrades[0].cost.base;
    const clear = GAME_COINS.play + GAME_COINS.firstClear;
    const perStage = (n: number) => (recommendedLevel(n) - recommendedLevel(n - 1)) * cost - clear;
    expect([1, 2, 3].map(recommendedLevel)).toEqual([0, 0, 0]);
    for (let n = 4; n <= 20; n++) expect(perStage(n)).toBe(22);
    // 全部の強化をMAXにしたら、ステージ20の推奨レベルに届く
    expect(SURVIVOR.upgrades.reduce((a, u) => a + u.max, 0)).toBeGreaterThanOrEqual(recommendedLevel(20));
  });
});

describe('streak', () => {
  it('1日休んでもつながり、2日休むと1にもどる', () => {
    const p = newProfile('t', 'wizard', 2);
    touchStreak(p, '2026-09-01'); touchStreak(p, '2026-09-01'); touchStreak(p, '2026-09-02');
    expect(p.streak.count).toBe(2);
    touchStreak(p, '2026-09-04');
    expect(p.streak.count).toBe(3);
    touchStreak(p, '2026-09-07');
    expect(p.streak.count).toBe(1);
  });
});
