import { describe, expect, it } from 'vitest';
import { STUDIES } from '../studies/registry';
import { questReward } from './economy';
import {
  checkAchievements, claimAchievement, claimDaily, claimableCount, dailyMissions, hisashiburiCats, isHisashiburi, noteCorrect,
  streakMilestones,
} from './missions';
import { DEFAULT_SETTINGS, newProfile, rollDaily } from './store';

const kokugo = STUDIES.find(s => s.id === 'kokugo')!;
const okuri = kokugo.categories.find(c => c.id === 'okuri')!;   // 2年
const lower = kokugo.categories.find(c => c.grade === 1)!;
const DAY = '2026-09-26';
const mission = (p: ReturnType<typeof newProfile>, id: string, day = DAY) => dailyMissions(p, day).find(m => m.id === id);

describe('ひさしぶりのカテゴリ', () => {
  it('3日以上やっていない（まだ始めていない）自分の学年のカテゴリ。下の学年はのぞく', () => {
    const p = newProfile('t', 'wizard', 2);
    expect(isHisashiburi(p, kokugo, okuri, DAY)).toBe(true);
    expect(isHisashiburi(p, kokugo, lower, DAY)).toBe(false);
    p.catLast['kokugo:okuri'] = '2026-09-24';
    expect(isHisashiburi(p, kokugo, okuri, DAY)).toBe(false);
    p.catLast['kokugo:okuri'] = '2026-09-23';
    expect(isHisashiburi(p, kokugo, okuri, DAY)).toBe(true);
    expect(hisashiburiCats(p, DAY).every(x => x.cat.grade !== 1 && !x.cat.drill)).toBe(true);
    for (const c of okuri.cards()) p.cards[c] = { box: 3, due: '2026-10-10' };
    expect(isHisashiburi(p, kokugo, okuri, DAY)).toBe(false);   // ぜんぶ おぼえた
  });

  it('その日に2問正解でたっせい。きょうやっても、その日は ひさしぶり のまま。次の日からは外れる', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = DEFAULT_SETTINGS;
    noteCorrect(p, 'kokugo', okuri, false, DAY);
    expect(mission(p, 'hisashiburi')).toMatchObject({ progress: 1, done: false });
    noteCorrect(p, 'kokugo', okuri, false, DAY);
    expect(mission(p, 'hisashiburi')).toMatchObject({ progress: 2, done: true });
    const start = p.tickets;
    expect(claimDaily(p, s, 'hisashiburi', DAY)).toBe(true);
    expect(claimDaily(p, s, 'hisashiburi', DAY)).toBe(false);
    expect(p.tickets).toBe(start + 1);
    rollDaily(p, '2026-09-27');
    expect(p.catLast['kokugo:okuri']).toBe(DAY);
    expect(isHisashiburi(p, kokugo, okuri, '2026-09-27')).toBe(false);
    expect(mission(p, 'hisashiburi', '2026-09-27')).toMatchObject({ progress: 0, claimed: false });
  });
});

describe('ふくしゅうミッション', () => {
  it('目標は その日のはじめの復習の数（5まで）。0なら出さない', () => {
    const p = newProfile('t', 'wizard', 2);
    expect(mission(p, 'fukushu')).toBeUndefined();
    p.cards['a'] = { box: 1, due: '2026-09-27' };
    p.cards['b'] = { box: 1, due: '2026-09-27' };
    rollDaily(p, '2026-09-27');
    expect(mission(p, 'fukushu', '2026-09-27')).toMatchObject({ goal: 2, progress: 0 });
    noteCorrect(p, 'kokugo', lower, true, '2026-09-27');   // 下の学年の復習も数える
    noteCorrect(p, 'kokugo', okuri, true, '2026-09-27');
    expect(mission(p, 'fukushu', '2026-09-27')).toMatchObject({ done: true });
  });
});

describe('券の上限', () => {
  it('満タンや1日の上限では、きょうのミッションを受け取れない', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = DEFAULT_SETTINGS;
    noteCorrect(p, 'kokugo', okuri, false, DAY);
    noteCorrect(p, 'kokugo', okuri, false, DAY);
    p.tickets = s.ticketMax;
    expect(claimDaily(p, s, 'hisashiburi', DAY)).toBe(false);
    p.tickets = 0;
    p.daily.ticketsEarned = s.ticketsPerDay;
    expect(claimDaily(p, s, 'hisashiburi', DAY)).toBe(false);
    expect(claimableCount(p, s, DAY)).toBe(0);
  });

  it('1日にもらえるのは 教科2 + きょうのミッション2 = 4まい', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = DEFAULT_SETTINGS;
    p.tickets = 0;
    p.cards['a'] = { box: 1, due: DAY };
    rollDaily(p, DAY);
    p.daily = { ...p.daily, date: DAY };
    questReward(p, s, { study: 'kokugo', grade: 2 }, 0, DAY);
    questReward(p, s, { study: 'sansu', grade: 2 }, 0, DAY);
    noteCorrect(p, 'kokugo', okuri, true, DAY);
    noteCorrect(p, 'kokugo', okuri, false, DAY);
    expect(claimDaily(p, s, 'hisashiburi', DAY)).toBe(true);
    expect(claimDaily(p, s, 'fukushu', DAY)).toBe(true);
    expect(p.tickets).toBe(4);
  });
});

describe('たっせいミッション', () => {
  it('カテゴリを ぜんぶ おぼえたら1回だけ。おぼえた が減っても消えない', () => {
    const p = newProfile('t', 'wizard', 2);
    const s = DEFAULT_SETTINGS;
    for (const c of okuri.cards()) p.cards[c] = { box: 3, due: '2026-10-10' };
    expect(checkAchievements(p, DAY)).toContain('cat:kokugo:okuri');
    expect(checkAchievements(p, DAY)).not.toContain('cat:kokugo:okuri');
    p.cards[okuri.cards()[0]].box = 0;
    checkAchievements(p, DAY);
    expect(p.achieved['cat:kokugo:okuri']).toBe('open');
    p.tickets = s.ticketMax;
    expect(claimAchievement(p, s, 'cat:kokugo:okuri')).toBe(false);   // 満タン
    p.tickets = 0;
    p.daily.ticketsEarned = 99;   // 1日の上限は関係ない
    expect(claimAchievement(p, s, 'cat:kokugo:okuri')).toBe(true);
    expect(claimAchievement(p, s, 'cat:kokugo:okuri')).toBe(false);
    expect(p.tickets).toBe(1);
  });

  it('つづけた日数は 3・7日、そのあと7日ごと', () => {
    expect(streakMilestones(2)).toEqual([]);
    expect(streakMilestones(7)).toEqual([3, 7]);
    expect(streakMilestones(22)).toEqual([3, 7, 14, 21]);
    const p = newProfile('t', 'wizard', 2);
    p.streak = { count: 7, last: DAY };
    expect(checkAchievements(p, DAY)).toEqual(expect.arrayContaining(['streak:3', 'streak:7']));
  });
});
