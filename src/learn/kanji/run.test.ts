import { describe, expect, it } from 'vitest';
import { answer, currentItem, isDone, pendingOnQuit, runSummary, startRun } from './run';
import type { SessionItem } from './srs';

const item = (kanji: string, kind: SessionItem['kind'] = 'new'): SessionItem => ({ kanji, word: `[${kanji}]`, kind });

describe('書き取りの1回', () => {
  it('「できなかった」字は10問のあとにもう1回出し、その結果を記録する。「おしい」はもう1回出さない', () => {
    const run = startRun([item('一', 'review'), item('二'), item('三'), item('四')]);
    const rec: (ReturnType<typeof answer>)[] = [];
    expect(currentItem(run)).toEqual({ item: item('一', 'review'), retry: false });
    rec.push(answer(run, 'correct'));
    rec.push(answer(run, 'wrong'));
    rec.push(answer(run, 'close'));
    rec.push(answer(run, 'wrong'));
    expect(rec).toEqual([{ kanji: '一', grade: 'correct', missed: false }, null, { kanji: '三', grade: 'close', missed: false }, null]);
    // もう1回: 二 → 四 の順
    expect(currentItem(run)).toEqual({ item: item('二'), retry: true });
    expect(answer(run, 'correct')).toEqual({ kanji: '二', grade: 'correct', missed: true });
    expect(currentItem(run)).toEqual({ item: item('四'), retry: true });
    // もう1回でも できなかった字は、そのまま記録（3回目はない）
    expect(answer(run, 'wrong')).toEqual({ kanji: '四', grade: 'wrong', missed: true });
    expect(isDone(run)).toBe(true);
    expect(answer(run, 'correct')).toBeNull();
    expect(run.first).toEqual(['correct', 'wrong', 'close', 'wrong']);
    expect(pendingOnQuit(run)).toEqual([]);
    expect(runSummary(run)).toEqual({ fresh: ['二'], review: ['一'], practice: ['三', '四'] });
  });

  it('途中でやめたら、もう1回を待っている字だけ1回目の結果（できなかった）で返す', () => {
    const run = startRun([item('一'), item('二'), item('三')]);
    answer(run, 'wrong');
    answer(run, 'wrong');
    expect(pendingOnQuit(run)).toEqual([{ kanji: '一', grade: 'wrong', missed: true }, { kanji: '二', grade: 'wrong', missed: true }]);
    answer(run, 'correct');
    answer(run, 'correct'); // 一 のもう1回
    expect(pendingOnQuit(run)).toEqual([{ kanji: '二', grade: 'wrong', missed: true }]);
  });

  it('0問の回はすぐ終わる', () => {
    const run = startRun([]);
    expect(isDone(run)).toBe(true);
    expect(runSummary(run)).toEqual({ fresh: [], review: [], practice: [] });
  });
});
