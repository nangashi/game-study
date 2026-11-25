import { describe, expect, it } from 'vitest';
import { newChild, recordUnitResult } from './records';
import { KANJI_TOPICS, SUBJECTS, themeStars } from './themes';

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

  it('かずが選べるようになり、単元数（7）と星の最大（21）が出る。ほかの「あとで ふえる」はそのまま', () => {
    const sansu = SUBJECTS[1].themes;
    const kazu = sansu.find(t => t.name === 'かず')!;
    expect(kazu.id).toBe('kazu');
    expect(kazu.desc).toBe('かず・ぶんすう・しょうすう ・ 7たんげん');
    expect(sansu.filter(t => t.id === null).map(t => t.name)).toEqual(['はかる', 'かたちと グラフ', 'ぶんしょうだい']);
    expect(SUBJECTS[0].themes.filter(t => t.id === null).map(t => t.name)).toEqual(['ことば', 'よむ']);
    let c = newChild('a', { name: 'はなこ' }, 0);
    expect(themeStars(c, 'kazu')).toEqual({ stars: 0, max: 21 });
    c = recordUnitResult(c, 'kazu:n100', 3, true);
    c = recordUnitResult(c, 'kazu:shosu', 1, true);
    c = recordUnitResult(c, 'hira:a', 2, true); // ほかのテーマの星は入らない
    expect(themeStars(c, 'kazu')).toEqual({ stars: 4, max: 21 });
    expect(themeStars(c, 'hira')).toEqual({ stars: 2, max: 45 });
  });

  it('こくごに「かんじ」カテゴリがあり、中身は いま かきとり だけ', () => {
    const kanji = SUBJECTS[0].themes.find(t => t.name === 'かんじ')!;
    expect(kanji.id).toBe('kanji');
    expect(KANJI_TOPICS.map(t => [t.id, t.name])).toEqual([['kakitori', 'かきとり']]);
  });
});
