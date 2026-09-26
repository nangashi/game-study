import { describe, expect, it } from 'vitest';
import { createPlatform } from '../ui/screens/game-host';
import { newProfile } from '../state/store';
import { HIPPARI } from './hippari';

// ゲームは Platform を通してだけ、券・コイン・強化・保存をさわる（docs/03-rewards-and-games.md）
describe('Platform', () => {
  it('startRun で券を1まい使い、遊べるのは「クリアした一番先 + 1」まで', () => {
    const p = newProfile('t', 'wizard', 1);
    p.tickets = 2;
    const pf = createPlatform(p, HIPPARI, () => {});
    expect(pf.maxStage()).toBe(1);
    expect(pf.startRun(2)).toBeNull();
    expect(p.tickets).toBe(2);
    const ctx = pf.startRun(1)!;
    expect(ctx).toMatchObject({ stage: 1, easy: false, upgrades: { hp: 0, atk: 0, speed: 0, heal: 0 } });
    expect(p.tickets).toBe(1);
    expect(pf.endRun({ cleared: true, stage: 1, score: 5 })).toEqual({ coins: 28, firstClear: true });
    expect(pf.maxStage()).toBe(2);
  });

  it('startRun していない結果は受けつけない（1回のプレイでコインは1回だけ）', () => {
    const p = newProfile('t', 'wizard', 1);
    const pf = createPlatform(p, HIPPARI, () => {});
    expect(() => pf.endRun({ cleared: true, stage: 1, score: 0 })).toThrow();
    pf.startRun(1);
    pf.endRun({ cleared: false, stage: 1, score: 0 });
    expect(() => pf.endRun({ cleared: true, stage: 1, score: 0 })).toThrow();
    expect(p.coins).toBe(3);
  });

  it('券がなければ遊べない。強化はコインで買い、ゲームだけのデータを保存できる', () => {
    const p = newProfile('t', 'wizard', 'k');
    p.tickets = 0;
    p.coins = 50;   // ひっぱりアタックの強化は 1段階 40
    const pf = createPlatform(p, HIPPARI, () => {});
    expect(pf.player.easy).toBe(true);
    expect(pf.startRun(1)).toBeNull();
    expect(pf.buyUpgrade('atk')).toBe(true);
    expect(pf.buyUpgrade('atk')).toBe(false);
    expect(pf.upgradeLevel('atk')).toBe(1);
    expect(p.coins).toBe(10);
    pf.saveData({ chara: 'bear' });
    expect(pf.data()).toEqual({ chara: 'bear' });
    expect(p.games.hippari.data).toEqual({ chara: 'bear' });
  });
});
