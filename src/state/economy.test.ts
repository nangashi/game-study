import { describe, expect, it } from 'vitest';
import { buyUpgrade, questReward, runReward } from './economy';
import { DEFAULT_SETTINGS, newProfile, touchStreak } from './store';

describe('questReward', () => {
  it('バトル券は1日の上限まで。日付が変わるとまたもらえる', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = { ...DEFAULT_SETTINGS, ticketsPerDay: 2 };
    const start = p.tickets;
    expect(questReward(p, s, 'kokugo', 5, '2026-09-26').ticket).toBe(true);
    expect(questReward(p, s, 'sansu', 0, '2026-09-26').ticket).toBe(true);
    expect(questReward(p, s, 'sansu', 5, '2026-09-26').ticket).toBe(false);
    expect(p.tickets).toBe(start + 2);
    expect(questReward(p, s, 'sansu', 5, '2026-09-27').ticket).toBe(true);
    expect(p.feathers).toBe(7);
    expect(p.stars).toBe(2 + 7 + 7);
  });
});

describe('upgrades', () => {
  it('こくごの羽とさんすうの星の両方が必要', () => {
    const p = newProfile('t', 'wizard', 2);
    p.coins = 1000; p.feathers = 100;
    expect(buyUpgrade(p, 'hp')).toBe(true);
    expect(buyUpgrade(p, 'atk')).toBe(false);
    p.stars = 2;
    expect(buyUpgrade(p, 'atk')).toBe(true);
    expect(p.upgrades).toMatchObject({ hp: 1, atk: 1 });
  });
  it('バトルのコイン', () => {
    const p = newProfile('t', 'wizard', 2);
    expect(runReward(p, { seconds: 180, kills: 90, cleared: true, level: 10 })).toBe(30 + 18 + 30);
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
