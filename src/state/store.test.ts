import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, store } from './store';

describe('古いデータの読み込み', () => {
  it('羽と星はコインに換算し、強化とバトルの記録はサバイバーに引きつぐ', () => {
    store.importJson(JSON.stringify({
      version: 1,
      settings: { ticketsPerDay: 2, questLength: 5, runSeconds: 180 },
      profiles: [{
        id: 'a', name: 't', avatar: 'wizard', grade: 1, tolerance: 'easy',
        coins: 10, feathers: 3, stars: 4, tickets: 1,
        upgrades: { hp: 2, atk: 1, speed: 0, magnet: 0 },
        tracks: {}, cards: {},
        daily: { date: '2026-09-26', quests: 1, ticketsEarned: 1 },
        streak: { count: 1, last: '2026-09-26' },
        stats: { quests: 3, correct: 12, runs: 5, clears: 2, bestKills: 80 },
      }],
    }));
    const p = store.profile('a')!;
    expect(p.coins).toBe(17);
    expect(p.games.survivor).toEqual({ stage: 1, best: 80, plays: 5, clears: 2, upgrades: { hp: 2, atk: 1, speed: 0, magnet: 0 } });
    expect(p.stats).toEqual({ quests: 3, correct: 12 });
    expect(p.daily.subjects).toEqual([]);
    expect('feathers' in p).toBe(false);
    expect(store.settings).toEqual({ ...DEFAULT_SETTINGS, ticketsPerDay: 2 });
  });

  it('むりょう券の設定は消し、上限3（教科2つ）はミッションのぶん4にする。きょうのカウンタとミッションの記録を足す', () => {
    store.importJson(JSON.stringify({
      version: 1,
      settings: { freePlaysPerDay: 1, playsPerSubject: 1, ticketsPerDay: 3, questLength: 5, drillSlowSec: 5 },
      profiles: [{
        id: 'b', name: 't', avatar: 'wizard', grade: 1, tolerance: 'easy', coins: 0, tickets: 9, games: {}, cards: {},
        daily: { date: '2026-09-26', quests: 1, ticketsEarned: 1, subjects: ['kokugo'] },
        streak: { count: 1, last: '2026-09-26' }, stats: { quests: 1, correct: 5 },
      }],
    }));
    expect(store.settings).toEqual(DEFAULT_SETTINGS);
    const p = store.profile('b')!;
    expect(p.tickets).toBe(9);   // 上限より多い券は そのまま
    expect(p.daily).toMatchObject({ ticketsEarned: 1, subjects: ['kokugo'], pending: 0, cats: {}, reviews: 0, claimed: [] });
    expect(p.catLast).toEqual({});
    expect(p.achieved).toEqual({});
  });
});
