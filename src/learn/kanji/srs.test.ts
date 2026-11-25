import { describe, expect, it } from 'vitest';
import { addDays, applyResult, buildSession, isDate, localDate, wordFor, type KanjiCard, type SelfGrade } from './srs';
import { ALL_KANJI, type KanjiEntry } from './words';

const T = '2026-11-25';
const NOW = 1_000;

// 結果を順に当てる（日付は毎回 today のまま）
const run = (grades: SelfGrade[], today = T, start?: KanjiCard) =>
  grades.reduce<KanjiCard | undefined>((c, g) => applyResult(c, g, false, today, NOW), start)!;

const learningCard = (track: 'A' | 'B', interval: number, due = T): KanjiCard =>
  ({ status: 'learning', track, interval, due, firstSeen: 1, asked: 3 });
const gradCard = (interval: number, due = T): KanjiCard => ({ status: 'graduated', interval, due, firstSeen: 1, asked: 9 });

describe('日付', () => {
  it('ローカル日を YYYY-MM-DD にする', () => {
    expect(localDate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
    expect(localDate(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
  });
  it('月・年・うるう年をまたいで足す', () => {
    expect(addDays('2026-11-25', 14)).toBe('2026-12-09');
    expect(addDays('2026-12-25', 60)).toBe('2027-02-23');
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
    expect(addDays('2027-02-28', 1)).toBe('2027-03-01');
    expect(addDays('2026-11-25', 365)).toBe('2027-11-25');
  });
  it('isDate', () => {
    expect(isDate('2026-11-25')).toBe(true);
    expect(isDate('2026-02-30')).toBe(false);
    expect(isDate('2026-1-5')).toBe(false);
    expect(isDate(20261125)).toBe(false);
  });
});

describe('遷移', () => {
  it('未出題で正解 → トラックA、14日', () => {
    expect(applyResult(undefined, 'correct', false, T, NOW)).toEqual(
      { status: 'learning', track: 'A', interval: 14, due: '2026-12-09', firstSeen: NOW, asked: 1 });
  });

  it('未出題で おしい／できなかった → 未正解', () => {
    for (const g of ['close', 'wrong'] as const) {
      expect(applyResult(undefined, g, false, T, NOW)).toEqual({ status: 'failed', firstSeen: NOW, asked: 1 });
    }
  });

  it('未正解で おしい／できなかった → 未正解のまま（はじめて出した時刻は変えない）', () => {
    const f = applyResult(undefined, 'wrong', false, T, 5);
    expect(applyResult(f, 'close', false, T, 99)).toEqual({ status: 'failed', firstSeen: 5, asked: 2 });
    expect(applyResult(f, 'wrong', false, T, 99)).toEqual({ status: 'failed', firstSeen: 5, asked: 2 });
  });

  it('未正解で正解 → トラックB、3日', () => {
    expect(run(['wrong', 'wrong', 'correct'])).toMatchObject({ status: 'learning', track: 'B', interval: 3, due: '2026-11-28', asked: 3 });
  });

  it('トラックA: 14 → 60 → 卒業（180日）→ 正解で365日', () => {
    const steps = ['correct', 'correct', 'correct', 'correct', 'correct'] as const;
    let c: KanjiCard | undefined;
    const seen: [string, number, string][] = [];
    for (const g of steps) {
      c = applyResult(c, g, false, T, NOW);
      seen.push([c.status, c.status === 'failed' ? 0 : c.interval, c.status === 'failed' ? '' : c.due]);
    }
    expect(seen).toEqual([
      ['learning', 14, '2026-12-09'],
      ['learning', 60, '2027-01-24'],
      ['graduated', 180, addDays(T, 180)],
      ['graduated', 365, addDays(T, 365)],
      ['graduated', 365, addDays(T, 365)],
    ]);
  });

  it('トラックB: 1 → 3 → 7 → 14 → 30 → 60 → 卒業', () => {
    let c: KanjiCard = learningCard('B', 1);
    const intervals: number[] = [];
    for (let i = 0; i < 6; i++) {
      c = applyResult(c, 'correct', false, T, NOW);
      intervals.push(c.status === 'failed' ? -1 : c.interval);
      if (c.status === 'learning') expect(c.track).toBe('B');
    }
    expect(intervals).toEqual([3, 7, 14, 30, 60, 180]);
    expect(c.status).toBe('graduated');
  });

  it('正解済みで間違えた: 7日以下ならトラックBの1日、14日以上なら3日', () => {
    const cases: [KanjiCard, number][] = [
      [learningCard('B', 1), 1], [learningCard('B', 3), 1], [learningCard('B', 7), 1],
      [learningCard('B', 14), 3], [learningCard('B', 30), 3], [learningCard('B', 60), 3],
      [learningCard('A', 14), 3], [learningCard('A', 60), 3],
    ];
    for (const [c, want] of cases) {
      expect(applyResult(c, 'wrong', false, T, NOW)).toEqual(
        { status: 'learning', track: 'B', interval: want, due: addDays(T, want), firstSeen: 1, asked: 4 });
    }
  });

  it('おしい は段階も日付も据え置き（出題回数だけ増える）', () => {
    const c = learningCard('A', 14, '2026-11-20');
    expect(applyResult(c, 'close', false, T, NOW)).toEqual({ ...c, asked: 4 });
    const g = gradCard(180, '2026-11-01');
    expect(applyResult(g, 'close', false, T, NOW)).toEqual({ ...g, asked: 10 });
  });

  it('卒業した字を間違えたら トラックBの7日', () => {
    expect(applyResult(gradCard(365), 'wrong', false, T, NOW)).toEqual(
      { status: 'learning', track: 'B', interval: 7, due: '2026-12-02', firstSeen: 1, asked: 10 });
  });

  describe('回の中で一度でも できなかった（missed）', () => {
    it('未出題: 間違えてから正解 → トラックAでなくトラックBの3日', () => {
      expect(applyResult(undefined, 'correct', true, T, NOW)).toEqual(
        { status: 'learning', track: 'B', interval: 3, due: '2026-11-28', firstSeen: NOW, asked: 1 });
    });
    it('未出題: もう1回も できなかった／おしい → 未正解', () => {
      for (const g of ['close', 'wrong'] as const) {
        expect(applyResult(undefined, g, true, T, NOW)).toEqual({ status: 'failed', firstSeen: NOW, asked: 1 });
      }
    });
    it('未正解: 最終結果で決める（正解ならトラックBの3日）', () => {
      const f: KanjiCard = { status: 'failed', firstSeen: 5, asked: 1 };
      expect(applyResult(f, 'correct', true, T, NOW)).toMatchObject({ status: 'learning', track: 'B', interval: 3, firstSeen: 5, asked: 2 });
      expect(applyResult(f, 'close', true, T, NOW)).toEqual({ status: 'failed', firstSeen: 5, asked: 2 });
    });
    it('正解済み: もう1回の結果にかかわらず戻す（7日以下 → 1日、14日以上 → 3日）', () => {
      const cases: [KanjiCard, number][] = [
        [learningCard('B', 1), 1], [learningCard('B', 7), 1], [learningCard('B', 14), 3], [learningCard('B', 60), 3],
        [learningCard('A', 14), 3], [learningCard('A', 60), 3],
      ];
      for (const [c, want] of cases) {
        for (const g of ['correct', 'close', 'wrong'] as const) {
          expect(applyResult(c, g, true, T, NOW)).toEqual(
            { status: 'learning', track: 'B', interval: want, due: addDays(T, want), firstSeen: 1, asked: 4 });
        }
      }
    });
    it('卒業: もう1回の結果にかかわらずトラックBの7日', () => {
      for (const g of ['correct', 'close', 'wrong'] as const) {
        expect(applyResult(gradCard(180), g, true, T, NOW)).toEqual(
          { status: 'learning', track: 'B', interval: 7, due: '2026-12-02', firstSeen: 1, asked: 10 });
      }
    });
    it('間違えなかったら従来どおり（正解済みは次の段、卒業は365日）', () => {
      expect(applyResult(learningCard('B', 7), 'correct', false, T, NOW)).toMatchObject({ track: 'B', interval: 14 });
      expect(applyResult(learningCard('A', 14), 'correct', false, T, NOW)).toMatchObject({ track: 'A', interval: 60 });
      expect(applyResult(gradCard(180), 'correct', false, T, NOW)).toMatchObject({ status: 'graduated', interval: 365 });
    });
  });

  it('次回日付は答えた日から数える（期限を過ぎて答えても）', () => {
    const c = learningCard('B', 3, '2026-11-01');
    expect(applyResult(c, 'correct', false, T, NOW)).toMatchObject({ interval: 7, due: '2026-12-02' });
  });
});

describe('単語の入れ替え', () => {
  const e: KanjiEntry = { kanji: '山', words: ['[やま]', 'か[ざん]', '[やま]のぼり'] };
  it('出題回数で順に回る', () => {
    expect(wordFor(e, undefined)).toBe('[やま]');
    let c: KanjiCard | undefined;
    const ws: string[] = [];
    for (let i = 0; i < 4; i++) { c = applyResult(c, 'wrong', false, T, NOW); ws.push(wordFor(e, c)); }
    expect(ws).toEqual(['か[ざん]', '[やま]のぼり', '[やま]', 'か[ざん]']);
  });
});

describe('回を組む（10問）', () => {
  // 20字の小さなデータ（k0〜k19）
  const entries: KanjiEntry[] = Array.from({ length: 20 }, (_, i) => ({ kanji: `k${i}`, words: [`[a${i}]`, `[b${i}]`] }));
  const kinds = (items: ReturnType<typeof buildSession>) => items.map(i => `${i.kind}:${i.kanji}`);

  it('はじめては 未出題の字をデータ順に10問', () => {
    const s = buildSession({}, T, entries);
    expect(s.map(i => i.kanji)).toEqual(entries.slice(0, 10).map(e => e.kanji));
    expect(s.every(i => i.kind === 'new')).toBe(true);
    expect(s[0].word).toBe('[a0]');
  });

  it('全体の既定は全1026字のデータ順', () => {
    expect(buildSession({}, T, ALL_KANJI).map(i => i.kanji)).toEqual(ALL_KANJI.slice(0, 10).map(e => e.kanji));
  });

  it('復習は最大5問。間隔の小さい順 → 期限を過ぎた日数の多い順。卒業は最後。期限前は出さない', () => {
    const cards: Record<string, KanjiCard> = {
      k0: learningCard('A', 14, '2026-11-20'),
      k1: learningCard('B', 1, '2026-11-24'),
      k2: learningCard('B', 1, '2026-11-10'),
      k3: gradCard(180, '2026-01-01'),
      k4: learningCard('B', 3, T),
      k5: learningCard('B', 1, '2026-11-26'), // 期限前
      k6: learningCard('B', 60, '2026-11-25'),
      k7: learningCard('B', 30, '2026-11-25'),
    };
    const s = buildSession(cards, T, entries);
    expect(kinds(s).slice(0, 5)).toEqual(['review:k2', 'review:k1', 'review:k4', 'review:k0', 'review:k7']);
    expect(s.map(i => i.kanji)).not.toContain('k3');
    expect(s.map(i => i.kanji)).not.toContain('k5');
    expect(s.slice(5).every(i => i.kind === 'new')).toBe(true);
    expect(s.length).toBe(10);
  });

  it('卒業の字は枠が余ったときだけ（期限の古い順）', () => {
    const cards: Record<string, KanjiCard> = {
      k0: gradCard(365, '2026-11-01'),
      k1: learningCard('B', 7, '2026-11-25'),
      k2: gradCard(180, '2026-10-01'),
    };
    expect(kinds(buildSession(cards, T, entries)).slice(0, 3)).toEqual(['review:k1', 'review:k2', 'review:k0']);
  });

  it('残りは 未正解の字（はじめて出した順）→ 未出題の字（データ順）', () => {
    const failed = (firstSeen: number): KanjiCard => ({ status: 'failed', firstSeen, asked: 1 });
    const cards: Record<string, KanjiCard> = {
      k0: learningCard('A', 14, '2026-12-01'), // 期限前
      k1: failed(300), k2: failed(100), k3: failed(200),
      k4: learningCard('B', 1, '2026-11-24'),
    };
    expect(kinds(buildSession(cards, T, entries))).toEqual([
      'review:k4', 'failed:k2', 'failed:k3', 'failed:k1',
      'new:k5', 'new:k6', 'new:k7', 'new:k8', 'new:k9', 'new:k10',
    ]);
  });

  it('未正解の字が多ければ、未出題の字は入らない', () => {
    const cards = Object.fromEntries(entries.slice(0, 12).map((e, i) => [e.kanji, { status: 'failed', firstSeen: i, asked: 1 } as KanjiCard]));
    const s = buildSession(cards, T, entries);
    expect(s.length).toBe(10);
    expect(s.every(i => i.kind === 'failed')).toBe(true);
  });

  it('出す単語は出題回数でまわす', () => {
    const cards: Record<string, KanjiCard> = { k0: { status: 'failed', firstSeen: 1, asked: 1 } };
    expect(buildSession(cards, T, entries)[0]).toEqual({ kanji: 'k0', word: '[b0]', kind: 'failed' });
  });

  it('字が足りなければ10問より少ない', () => {
    const cards = Object.fromEntries(entries.map(e => [e.kanji, learningCard('A', 60, '2027-01-01')]));
    expect(buildSession(cards, T, entries)).toEqual([]);
  });
});
