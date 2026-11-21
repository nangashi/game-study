import { describe, expect, it } from 'vitest';
import { STUDIES } from '../studies/registry';
import { HISASHIBURI_GOAL, hisashiburiBest, hisashiburiCats, isHisashiburi, recordCorrect, suggestedCats } from './records';
import { newProfile, rollDaily } from './store';

const kokugo = STUDIES.find(s => s.id === 'kokugo')!;
const okuri = kokugo.categories.find(c => c.id === 'okuri')!;   // 2年
const lower = kokugo.categories.find(c => c.grade === 1)!;
const DAY = '2026-09-26';
const progress = (p: ReturnType<typeof newProfile>, day = DAY) => hisashiburiBest(p, hisashiburiCats(p, day));

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
    recordCorrect(p, 'kokugo', okuri, DAY);
    expect(progress(p)).toBe(1);
    expect(suggestedCats(p, DAY).length).toBeGreaterThan(0);
    recordCorrect(p, 'kokugo', okuri, DAY);
    expect(progress(p)).toBe(HISASHIBURI_GOAL);
    expect(isHisashiburi(p, kokugo, okuri, DAY)).toBe(true);
    expect(suggestedCats(p, DAY)).toEqual([]);   // たっせいしたら すすめない
    rollDaily(p, '2026-09-27');
    expect(p.catLast['kokugo:okuri']).toBe(DAY);
    expect(isHisashiburi(p, kokugo, okuri, '2026-09-27')).toBe(false);
    expect(progress(p, '2026-09-27')).toBe(0);
  });
});

describe('正解の記録', () => {
  it('カテゴリごとの きょうの正解を数える。ドリルは数えない', () => {
    const p = newProfile('t', 'wizard', 2);
    const drill = STUDIES.find(s => s.id === 'sansu')!.categories.find(c => c.drill)!;
    recordCorrect(p, 'kokugo', okuri, DAY);
    recordCorrect(p, 'kokugo', lower, DAY);
    recordCorrect(p, 'sansu', drill, DAY);
    expect(p.daily.cats).toEqual({ 'kokugo:okuri': 1, [`kokugo:${lower.id}`]: 1 });
  });
});
