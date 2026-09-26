import { describe, expect, it } from 'vitest';
import { GAMES } from './registry';
import { STUDIES } from '../studies/registry';
import { gameContext, recommendedLevel } from '../state/economy';
import { newProfile } from '../state/store';

// 土台に乗るものが、共通の決まり（docs/03-rewards-and-games.md）を守っているか
describe('登録簿', () => {
  it('id がかぶらない', () => {
    expect(new Set(GAMES.map(g => g.id)).size).toBe(GAMES.length);
    expect(new Set(STUDIES.map(s => s.id)).size).toBe(STUDIES.length);
  });

  it('強化は1段階25コインで一定、4つまで。最大レベルの合計は最後のステージの推奨強化レベル以上', () => {
    for (const g of GAMES) {
      expect(g.upgrades.length, g.id).toBeLessThanOrEqual(4);
      for (const u of g.upgrades) expect(u.cost, `${g.id}.${u.id}`).toEqual({ base: 25, step: 0 });
      expect(g.upgrades.reduce((a, u) => a + u.max, 0), g.id).toBeGreaterThanOrEqual(recommendedLevel(g.stages));
    }
  });

  it('遊ぶステージは「クリアした一番先 + 1」で、ステージの数をこえない', () => {
    const p = newProfile('t', 'wizard', 1);
    for (const g of GAMES) {
      expect(gameContext(p, g).stage).toBe(1);
      p.games[g.id].stage = g.stages;
      expect(gameContext(p, g).stage).toBe(g.stages);
    }
  });
});
