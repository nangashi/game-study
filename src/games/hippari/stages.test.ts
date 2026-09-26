import { describe, expect, it } from 'vitest';
import { HIPPARI_STAGES, enemyPower, stageSpec } from './stages';
import { recommendedLevel } from '../../state/economy';

describe('ひっぱりアタックのステージ', () => {
  it('いつも同じ並びになり、敵どうしが重ならない', () => {
    for (let n = 1; n <= HIPPARI_STAGES; n++) {
      const spec = stageSpec(n, false);
      expect(stageSpec(n, false)).toEqual(spec);
      expect(spec.waves.length).toBeGreaterThanOrEqual(2);
      for (const wave of spec.waves) {
        expect(wave.length).toBeGreaterThan(0);
        for (let i = 0; i < wave.length; i++) for (let j = i + 1; j < wave.length; j++) {
          const a = wave[i], b = wave[j];
          // 720 × 1080 の画面で、半径（size × 0.4）の合計より はなれている
          expect(Math.hypot((a.x - b.x) * 720, (a.y - b.y) * 1080), `stage ${n}`).toBeGreaterThan((a.size + b.size) * 0.4);
        }
      }
    }
  });

  it('敵の強さは推奨強化レベルにそろえて足し算で上がる（1〜3は同じ）', () => {
    expect([1, 2, 3].map(enemyPower)).toEqual([1, 1, 1]);
    for (let n = 4; n <= HIPPARI_STAGES; n++) {
      expect(enemyPower(n) - enemyPower(n - 1)).toBeCloseTo(0.25);
      // こうげき強化を推奨レベルの半分ふったときと同じ倍率
      expect(enemyPower(n)).toBeCloseTo(1 + 0.25 * recommendedLevel(n) / 2);
    }
  });

  it('5ステージごとにボスが出る。やさしい設定では敵のこうげきがおそい', () => {
    expect(stageSpec(5, false).waves.at(-1)!.some(e => e.kind === 'king')).toBe(true);
    expect(stageSpec(4, false).waves.flat().some(e => e.kind === 'king')).toBe(false);
    const normal = stageSpec(3, false).waves.flat(), easy = stageSpec(3, true).waves.flat();
    easy.forEach((e, i) => expect(e.turns).toBe(normal[i].turns + 1));
  });
});
