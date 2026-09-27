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
  // 1画目を途中で止めて（甘めに）合格したあと、手本どおりに書いても通らなくなっていた
  it('1画目を途中で止めても、あとの画は手本どおりに書けば合格', () => {
    for (const [ch, f] of [['川', 0.8], ['右', 0.7], ['口', 0.6], ['二', 0.6], ['十', 0.6]] as const) {
      const j = new StrokeJudge(S[ch], TOLERANCE.normal);
      const p0 = pathToPoints(S[ch][0]);
      expect(j.judge(p0.slice(0, Math.round(p0.length * f))).ok, ch).toBe(true);
      for (const d of S[ch].slice(1)) expect(j.judge(pathToPoints(d)).ok, ch).toBe(true);
      expect(j.finished).toBe(true);
    }
  });
  it('それまでの画から推定した補正が外れていても、手本どおりの画は合格', () => {
    for (const [ch, f] of [['上', 0.8], ['工', 0.7], ['石', 0.7]] as const) {
      const j = new StrokeJudge(S[ch], TOLERANCE.normal);
      // 最初の2画は短く書いて合格（大きさの推定がずれる）
      for (const d of S[ch].slice(0, 2)) {
        const p = pathToPoints(d);
        expect(j.judge(p.slice(0, Math.round(p.length * f))).ok, ch).toBe(true);
      }
      for (const d of S[ch].slice(2)) expect(j.judge(pathToPoints(d)).ok, ch).toBe(true);
    }
  });
});
