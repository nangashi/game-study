import { describe, expect, it } from 'vitest';
import { CHAR_SETS } from '../data/char-sets.js';
import { HIRA_UNITS, blankWord, hiraItems, hiraUnitById, judgeHira } from './hiragana';
import strokes from './handwriting/strokes.json';

describe('ひらがなを かく', () => {
  const ROW_UNITS = HIRA_UNITS.filter(u => !u.pictures);
  const PIC_UNITS = HIRA_UNITS.filter(u => u.pictures);

  it('道の並び: 行の10単元 → 絵の5単元。id は重ならず、num は 1〜15', () => {
    expect(HIRA_UNITS.map(u => u.id)).toEqual([
      'hira:a', 'hira:ka', 'hira:sa', 'hira:ta', 'hira:na', 'hira:ha', 'hira:ma', 'hira:ya', 'hira:ra', 'hira:wa',
      'hira:e1', 'hira:e2', 'hira:e3', 'hira:e4', 'hira:e5',
    ]);
    expect(new Set(HIRA_UNITS.map(u => u.id)).size).toBe(HIRA_UNITS.length);
    expect(HIRA_UNITS.map(u => u.num)).toEqual(HIRA_UNITS.map((_, i) => i + 1));
    expect(hiraUnitById('hira:ka')?.chars).toBe('かきくけこ');
    expect(hiraUnitById('hira:e1')).toMatchObject({ num: 11, name: 'えを みて かく（あ行・か行）' });
    expect(PIC_UNITS.map(u => u.name)).toEqual(['あ行・か行', 'さ行・た行', 'な行・は行', 'ま行・や行', 'ら行・わ行'].map(r => `えを みて かく（${r}）`));
  });

  it('行の単元をつなぐと、ひらがな46字がちょうど1回ずつ', () => {
    expect(ROW_UNITS.map(u => u.chars).join('')).toBe(CHAR_SETS.hira);
  });

  it('絵の単元をつなぐと、「を」を除く45字がちょうど1回ずつ', () => {
    const chars = PIC_UNITS.flatMap(u => u.pictures!.map(p => p.char)).join('');
    expect(chars).toBe(CHAR_SETS.hira.replace('を', ''));
    expect(chars).toHaveLength(45);
    for (const u of PIC_UNITS) expect(u.chars).toBe(u.pictures!.map(p => p.char).join(''));
  });

  it('絵の言葉: 空欄は最初の字（ん だけ最後の字）で、その字が対象の字', () => {
    for (const p of PIC_UNITS.flatMap(u => u.pictures!)) {
      expect(p.word[p.blankAt], p.word).toBe(p.char);
      expect(p.blankAt, p.word).toBe(p.char === 'ん' ? p.word.length - 1 : 0);
      expect(p.emoji.length, p.word).toBeGreaterThan(0);
    }
    const by = (c: string) => PIC_UNITS.flatMap(u => u.pictures!).find(p => p.char === c)!;
    expect(blankWord(by('あ'))).toBe('？め');
    expect(blankWord(by('え'))).toBe('？んぴつ');
    expect(by('ん')).toMatchObject({ word: 'ほん', emoji: '📕' });
    expect(blankWord(by('ん'))).toBe('ほ？');
  });

  it('どの字にも筆順データがある', () => {
    const all = strokes as Record<string, string[]>;
    for (const c of CHAR_SETS.hira) expect(all[c]?.length, c).toBeGreaterThan(0);
  });

  it('全字を なぞる → 全字を みて かく の順', () => {
    const a = hiraItems(HIRA_UNITS[0]);
    expect(a.map(it => it.char).join('')).toBe('あいうえおあいうえお');
    expect(a.map(it => it.guide)).toEqual([...Array(5).fill('trace'), ...Array(5).fill('model')]);
    expect(hiraItems(hiraUnitById('hira:ya')!)).toEqual([
      { char: 'や', guide: 'trace' }, { char: 'ゆ', guide: 'trace' }, { char: 'よ', guide: 'trace' },
      { char: 'や', guide: 'model' }, { char: 'ゆ', guide: 'model' }, { char: 'よ', guide: 'model' },
    ]);
  });

  it('絵の単元は 絵ごとに1回ずつ、見本なし（recall）で かく', () => {
    const items = hiraItems(hiraUnitById('hira:e5')!);
    expect(items.map(it => it.char).join('')).toBe('らりるれろわん');
    expect(items.every(it => it.guide === 'recall' && it.picture?.char === it.char)).toBe(true);
    expect(hiraItems(hiraUnitById('hira:e1')!)).toHaveLength(10);
    expect(hiraItems(HIRA_UNITS[0]).every(it => !it.picture)).toBe(true);
  });

  it('星: おてつだいなしの数で決まる（2つ足りないまでクリア）', () => {
    const r = (helpedCount: number, n = 10) => Array.from({ length: n }, (_, i) => ({ helped: i < helpedCount }));
    expect(judgeHira(r(0))).toEqual({ good: 10, total: 10, stars: 3, cleared: true });
    expect(judgeHira(r(1))).toMatchObject({ stars: 2, cleared: true });
    expect(judgeHira(r(2))).toMatchObject({ stars: 1, cleared: true });
    expect(judgeHira(r(3))).toMatchObject({ stars: 0, cleared: false });
    expect(judgeHira(r(2, 6))).toMatchObject({ good: 4, total: 6, stars: 1, cleared: true });
    expect(judgeHira([])).toMatchObject({ stars: 0, cleared: false });
  });
});
