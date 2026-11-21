import { describe, expect, it } from 'vitest';
import { newChild, recordUnitResult } from './records';
import { SUBJECTS, themeStars } from './themes';

describe('テーマ', () => {
  it('ひらがなの単元数と星の最大は、絵の単元を足した15単元に追随する', () => {
    const hira = SUBJECTS[0].themes.find(t => t.id === 'hira')!;
    expect(hira.desc).toBe('ひらがなを かく ・ 15たんげん');
    let c = newChild('a', { name: 'たろう' }, 0);
    expect(themeStars(c, 'hira')).toEqual({ stars: 0, max: 45 });
    c = recordUnitResult(c, 'hira:a', 3, true);
    c = recordUnitResult(c, 'hira:e5', 2, true);
    expect(themeStars(c, 'hira')).toEqual({ stars: 5, max: 45 });
  });
});
