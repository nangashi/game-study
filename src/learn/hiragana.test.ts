import { describe, expect, it } from 'vitest';
import { CHAR_SETS } from '../data/char-sets.js';
import { HIRA_UNITS, hiraItems, hiraUnitById, judgeHira } from './hiragana';
import strokes from './handwriting/strokes.json';

describe('ひらがなを かく', () => {
  it('単元をつなぐと、ひらがな46字がちょうど1回ずつ', () => {
    expect(HIRA_UNITS.map(u => u.chars).join('')).toBe(CHAR_SETS.hira);
    expect(new Set(HIRA_UNITS.map(u => u.id)).size).toBe(HIRA_UNITS.length);
    expect(HIRA_UNITS.map(u => u.num)).toEqual(HIRA_UNITS.map((_, i) => i + 1));
    expect(hiraUnitById('hira:ka')?.chars).toBe('かきくけこ');
  });

  it('どの字にも筆順データがある', () => {
    const all = strokes as Record<string, string[]>;
    for (const c of CHAR_SETS.hira) expect(all[c]?.length, c).toBeGreaterThan(0);
  });

  it('1字ずつ なぞる → みて かく の順', () => {
    expect(hiraItems(HIRA_UNITS[0]).slice(0, 4)).toEqual([
      { char: 'あ', guide: 'trace' }, { char: 'あ', guide: 'model' },
      { char: 'い', guide: 'trace' }, { char: 'い', guide: 'model' },
    ]);
    expect(hiraItems(HIRA_UNITS[0])).toHaveLength(10);
    expect(hiraItems(hiraUnitById('hira:ya')!)).toHaveLength(6);
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
