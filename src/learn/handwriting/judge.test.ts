import { describe, expect, it } from 'vitest';
import { StrokeJudge, pathToPoints, TOLERANCE, type Pt } from './judge';
import strokes from './strokes.json';

const S = strokes as Record<string, string[]>;
const shift = (pts: Pt[], dx: number, dy: number, s = 1): Pt[] => pts.map(([x, y]) => [(x - 54) * s + 54 + dx, (y - 54) * s + 54 + dy]);

describe('StrokeJudge', () => {
  it('お手本どおり（少しずらして小さめ）に書くと合格', () => {
    for (const ch of ['あ', 'ぬ', 'ア', '右', '曜']) {
      const j = new StrokeJudge(S[ch], TOLERANCE.normal);
      for (const d of S[ch]) expect(j.judge(shift(pathToPoints(d), 6, -4, 0.85)).ok, ch).toBe(true);
      expect(j.finished).toBe(true);
    }
  });
  it('書き順ちがい・逆向き・別の形を見分ける', () => {
    const p = S['右'].map(d => pathToPoints(d));
    // 右: 1画目はノ、2画目は横棒
    expect(new StrokeJudge(S['右']).judge(p[1]).reason).toBe('order');
    expect(new StrokeJudge(S['右']).judge(p[0].slice().reverse()).reason).toBe('direction');
    expect(new StrokeJudge(S['右']).judge([[10, 100], [100, 10]]).reason).toBe('shape');
  });
});
