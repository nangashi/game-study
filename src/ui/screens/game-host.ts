import { applyAnswer } from '../../learn/engine';
import { battleQuiz } from '../../studies/quiz';
import { buyUpgrade, canUpgrade, finishGame, gameContext, upgradeCost, upgradeLevel } from '../../state/economy';
import { gameProgress, save, store, today } from '../../state/store';
import type { Profile } from '../../state/types';
import type { GameDef, Platform } from '../../games/types';
import { h, mount, overlay } from '../dom';
import { renderQuestion } from '../question';
import { showGames } from './games';

// ゲームを開く。ここから先の画面はゲームが作る。ゲーム券・コイン・強化・保存は Platform を通して土台がやる
export async function openGame(id: string, game: GameDef): Promise<void> {
  const p = store.profile(id)!;
  const root = h('div', { class: `game-root game-${game.id}` }, h('div', { class: 'note', textContent: 'じゅんびちゅう…' }));
  mount(root);
  try {
    const mod = await game.load();
    root.replaceChildren();
    mod.open(root, createPlatform(p, game));
  } catch (e) {
    console.error(e);
    alert('ゲームを よみこめなかったよ');
    showGames(id);
  }
}

export function createPlatform(p: Profile, game: GameDef, onExit = () => showGames(p.id)): Platform {
  const upgrade = (uid: string) => {
    const u = game.upgrades.find(x => x.id === uid);
    if (!u) throw new Error(`${game.id}: 強化 ${uid} がありません`);
    return u;
  };
  let running: number | null = null; // いま遊んでいるステージ
  return {
    player: { name: p.name, avatar: p.avatar, easy: p.grade === 'k' },
    wallet: () => ({ coins: p.coins, tickets: p.tickets }),
    progress: () => structuredClone(gameProgress(p, game.id)),
    upgradeLevel: uid => upgradeLevel(p, game, upgrade(uid)),
    upgradeCost: uid => upgradeCost(upgrade(uid), upgradeLevel(p, game, upgrade(uid))),
    canUpgrade: uid => canUpgrade(p, game, upgrade(uid)),
    buyUpgrade: uid => {
      const ok = buyUpgrade(p, game, upgrade(uid));
      if (ok) save();
      return ok;
    },
    maxStage: () => gameContext(p, game).stage,
    startRun: stage => {
      const ctx = gameContext(p, game);
      if (p.tickets <= 0 || !Number.isInteger(stage) || stage < 1 || stage > ctx.stage) return null;
      p.tickets--;
      save();
      running = stage;
      return { ...ctx, stage };
    },
    endRun: r => {
      if (running == null || r.stage !== running) throw new Error(`${game.id}: startRun していないステージの結果です`);
      running = null;
      const reward = finishGame(p, game.id, r);
      save();
      return reward;
    },
    quiz: (title, note) => quiz(p, title, note),
    data: <T>() => gameProgress(p, game.id).data as T | undefined,
    saveData: v => { gameProgress(p, game.id).data = v; save(); },
    exit: onExit,
  };
}

// ゲームの中のクイズ（docs 8.）。答えは記録するが、コインは出さない
function quiz(p: Profile, title: string, note: string): Promise<boolean> {
  return new Promise(resolve => {
    const day = today();
    const q = battleQuiz(Math.random, p, day);
    const o = overlay(
      h('h1', { class: 'title', textContent: title }),
      h('p', { class: 'note', textContent: note }),
      renderQuestion(q, p, a => {
        applyAnswer(p, q, a, day);
        save();
        o.close();
        resolve(a.correct);
      }),
    );
  });
}
