import { describe, expect, it } from 'vitest';
import { GAMES } from './registry';
import { STUDIES } from '../studies/registry';
import { gameContext, recommendedCoins, upgradeCost } from '../state/economy';
import { newProfile } from '../state/store';

// 土台に乗るものが、共通の決まり（docs/03-rewards-and-games.md）を守っているか
describe('登録簿', () => {
  it('id がかぶらない', () => {
    expect(new Set(GAMES.map(g => g.id)).size).toBe(GAMES.length);
    expect(new Set(STUDIES.map(s => s.id)).size).toBe(STUDIES.length);
  });

  it('数値の強化は4つまで。数値の強化を ぜんぶ買うコインは、最後のステージの推奨コイン以上', () => {
    for (const g of GAMES) {
      const stats = g.upgrades.filter(u => (u.kind ?? 'stat') === 'stat');
      expect(stats.length, g.id).toBeLessThanOrEqual(4);
      expect(g.upgrades.length, g.id).toBeLessThanOrEqual(12);
      for (const u of g.upgrades) expect(u.cost.base, `${g.id}.${u.id}`).toBeGreaterThanOrEqual(25);
      const all = stats.reduce((a, u) => a + Array.from({ length: u.max }, (_, lv) => upgradeCost(u, lv)).reduce((x, y) => x + y, 0), 0);
      expect(all, g.id).toBeGreaterThanOrEqual(recommendedCoins(g.stages));
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

// ゲームごとの設計書（docs/05-game-design.md）。設計 → 実装 の順で作るので、設計書とデザインの4つの節が要る
describe('設計書', () => {
  it('登録したゲームには docs/games/<id>.md があり、デザインの節がそろっている', () => {
    const docs = import.meta.glob<string>('../../docs/games/*.md', { query: '?raw', import: 'default', eager: true });
    for (const g of GAMES) {
      const doc = docs[`../../docs/games/${g.id}.md`];
      expect(doc, `docs/games/${g.id}.md`).toBeTypeOf('string');
      for (const h of ['# デザイン', '## ねらい', '## 好まれると考えているポイント', '## 仕組みと意図', '## バランス', '# 仕様']) {
        expect(doc.split('\n').some(line => line.trim() === h), `${g.id}: ${h}`).toBe(true);
      }
    }
  });
});
