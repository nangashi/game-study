import { describe, expect, it } from 'vitest';
import { DEFAULT_SETTINGS, store } from './store';

describe('古いデータの読み込み', () => {
  // コイン・券・ゲーム・ミッションがあったころの保存データ
  const OLD = {
    version: 1,
    settings: { ticketMax: 5, playsPerSubject: 1, ticketsPerDay: 4, questLength: 7, drillSlowSec: 4 },
    profiles: [{
      id: 'a', name: 't', avatar: 'wizard', grade: 1, tolerance: 'normal',
      coins: 120, tickets: 3,
      games: { survivor: { stage: 2, best: 80, plays: 5, clears: 2, upgrades: { hp: 2 } } },
      cards: { 'hira:あ': { box: 3, due: '2026-10-01' }, 'keisan:3×4': { box: 1, due: '2026-09-27', ms: 4200 } },
      daily: { date: '2026-09-26', quests: 2, ticketsEarned: 2, subjects: ['kokugo'], pending: 1, cats: { 'kokugo:hira': 3 }, reviews: 1, reviewGoal: 2, claimed: ['fukushu'] },
      streak: { count: 8, last: '2026-09-26' },
      stats: { quests: 30, correct: 140 },
      best: { 'drill-2': 31000 },
      catLast: { 'kokugo:hira': '2026-09-25' },
      achieved: { 'streak:7': 'claimed', 'cat:kokugo:hira': 'open' },
    }],
  };

  it('コイン・券・ゲームのある古いデータでも、学習の記録はそのまま残る', () => {
    store.importJson(JSON.stringify(OLD));
    const p = store.profile('a')!;
    const old = OLD.profiles[0];
    expect(p.cards).toEqual(old.cards);
    expect(p.streak).toEqual(old.streak);
    expect(p.stats).toEqual(old.stats);
    expect(p.best).toEqual(old.best);
    expect(p.catLast).toEqual(old.catLast);
    expect(p.tolerance).toBe('normal');
    expect(p.daily).toMatchObject({ date: '2026-09-26', quests: 2, subjects: ['kokugo'], cats: { 'kokugo:hira': 3 } });
    expect(store.settings).toMatchObject({ questLength: 7, drillSlowSec: 4 });
  });

  it('もう使わない欄（コイン・券・ゲームなど）は消さずに残し、書きかえない', () => {
    store.importJson(JSON.stringify(OLD));
    const p = store.profile('a')! as unknown as Record<string, unknown>;
    const old = OLD.profiles[0];
    expect(p.coins).toBe(120);
    expect(p.tickets).toBe(3);
    expect(p.games).toEqual(old.games);
    expect(p.achieved).toEqual(old.achieved);
    expect(p.daily).toMatchObject({ reviews: 1, reviewGoal: 2, claimed: ['fukushu'] });
    expect(store.settings).toMatchObject({ ticketMax: 5, playsPerSubject: 1, ticketsPerDay: 4 });
    // 書き出して読みなおしても同じ（読み込むたびに変わらない）
    const once = store.exportJson();
    store.importJson(once);
    expect(store.exportJson()).toBe(once);
  });

  it('games のない もっと古いデータでも、記録を残し、games を作らない', () => {
    store.importJson(JSON.stringify({
      version: 1,
      settings: { ticketsPerDay: 2, questLength: 5, runSeconds: 180 },
      profiles: [{
        id: 'b', name: 't', avatar: 'wizard', grade: 1, tolerance: 'easy',
        coins: 10, feathers: 3, stars: 4, tickets: 1,
        upgrades: { hp: 2, atk: 1, speed: 0, magnet: 0 },
        tracks: {}, cards: { 'hira:い': { box: 2, due: '2026-09-28' } },
        daily: { date: '2026-09-26', quests: 1, ticketsEarned: 1 },
        streak: { count: 1, last: '2026-09-26' },
        stats: { quests: 3, correct: 12, runs: 5, clears: 2, bestKills: 80 },
      }],
    }));
    const p = store.profile('b')!;
    expect(p.cards).toEqual({ 'hira:い': { box: 2, due: '2026-09-28' } });
    expect(p.streak).toEqual({ count: 1, last: '2026-09-26' });
    expect(p.stats).toMatchObject({ quests: 3, correct: 12 });
    expect(p.daily).toMatchObject({ subjects: [], cats: {} });
    expect('reviews' in p.daily).toBe(false);
    expect(p.catLast).toEqual({});
    expect('games' in p).toBe(false);
    expect((p as unknown as Record<string, unknown>).coins).toBe(10);
    expect(store.settings).toMatchObject({ ...DEFAULT_SETTINGS });
  });
});
