import { describe, expect, it } from 'vitest';
import { RUN_TOL, StrokeJudge, pathToPoints, resample, worstRunAvg, TOLERANCE, type Pt } from './judge';
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
  // 1画目を途中で止めて（甘めに）合格したあと、手本どおりに書いても通らなくなっていた。
  // 止める位置は worstRun（4連続点の平均 ≤ 18）で合格する範囲にしてある（川・右は 0.8 以下だと形ちがい）
  it('1画目を途中で止めても、あとの画は手本どおりに書けば合格', () => {
    for (const [ch, f] of [['川', 0.85], ['右', 0.85], ['口', 0.6], ['二', 0.6], ['十', 0.7]] as const) {
      const j = new StrokeJudge(S[ch], TOLERANCE.normal);
      const p0 = pathToPoints(S[ch][0]);
      expect(j.judge(p0.slice(0, Math.round(p0.length * f))).ok, ch).toBe(true);
      for (const d of S[ch].slice(1)) expect(j.judge(pathToPoints(d)).ok, ch).toBe(true);
      expect(j.finished).toBe(true);
    }
  });
  // 短く書く割合は worstRun で合格する範囲（上・石は 0.8 以下だと形ちがい）
  it('それまでの画から推定した補正が外れていても、手本どおりの画は合格', () => {
    for (const [ch, f] of [['上', 0.85], ['工', 0.8], ['石', 0.85]] as const) {
      const j = new StrokeJudge(S[ch], TOLERANCE.normal);
      // 最初の2画は短く書いて合格（大きさの推定がずれる）
      for (const d of S[ch].slice(0, 2)) {
        const p = pathToPoints(d);
        expect(j.judge(p.slice(0, Math.round(p.length * f))).ok, ch).toBe(true);
      }
      for (const d of S[ch].slice(2)) expect(j.judge(pathToPoints(d)).ok, ch).toBe(true);
    }
  });

  // ---- worstRun（4連続点の平均 ≤ 18、許容度によらず固定。検証元: ひらがな手書き判定 Space） ----
  const SU = S['す'].map(d => pathToPoints(d));
  // 「す」の2画目を、書きはじめからまっすぐ下へ縦棒だけで書く（むすびを省く）
  const suBar: Pt[] = [SU[1][0], [SU[1][0][0], SU[1][SU[1].length - 1][1]]];

  it('「す」の2画目を縦棒だけで書くと、平均は許容内でも形ちがいで不合格（どの許容度でも）', () => {
    for (const tol of Object.values(TOLERANCE)) {
      const j = new StrokeJudge(S['す'], tol);
      expect(j.judge(SU[0]).ok).toBe(true);
      const r = j.judge(suBar);
      expect(r.dist).toBeLessThan(TOLERANCE.strict); // 平均だけなら「きびしい」でも通ってしまう
      expect(r).toMatchObject({ ok: false, reason: 'shape' });
      expect(j.index).toBe(1);
    }
    expect(worstRunAvg(resample(suBar), resample(SU[1]))).toBeGreaterThan(RUN_TOL);
  });

  it('「す」をお手本どおりに書くと合格のまま（そのまま・少しずらして小さめ、どの許容度でも）', () => {
    for (const tol of Object.values(TOLERANCE)) {
      for (const tf of [(p: Pt[]) => p, (p: Pt[]) => shift(p, 6, -4, 0.85)]) {
        const j = new StrokeJudge(S['す'], tol);
        for (const p of SU) expect(j.judge(tf(p)).ok).toBe(true);
        expect(j.finished).toBe(true);
      }
    }
  });

  it('画を途中で止めすぎると、平均は許容内でも形ちがい', () => {
    const p0 = pathToPoints(S['川'][0]);
    const r = new StrokeJudge(S['川'], TOLERANCE.normal).judge(p0.slice(0, Math.round(p0.length * 0.8)));
    expect(r.dist).toBeLessThan(TOLERANCE.normal * 1.4);
    expect(r).toMatchObject({ ok: false, reason: 'shape' });
  });

  it('worstRunAvg: 4点ずつの平均の最大', () => {
    const a: Pt[] = Array.from({ length: 8 }, (_, i) => [i, 0]);
    const b: Pt[] = a.map(([x], i): Pt => [x, i >= 4 ? 20 : 0]);
    expect(worstRunAvg(a, b)).toBe(20);
    expect(worstRunAvg(a.slice(0, 3), b.slice(0, 3))).toBe(0); // 4点ないときは見ない
  });
});
