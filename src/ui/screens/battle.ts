import { battleQuiz, applyAnswer } from '../../learn/engine';
import { runReward, type RunResult } from '../../state/economy';
import { save, store, today } from '../../state/store';
import type { Profile } from '../../state/types';
import { SKILLS, skillChoices, type SkillId, type SkillPick } from '../../game/skills';
import { chip, h, ico, mount, overlay } from '../dom';
import type { BattleScene } from '../../game/BattleScene';
import { renderQuestion } from '../question';
import { showHome } from './home';

export async function showBattle(id: string): Promise<void> {
  const p = store.profile(id)!;
  if (p.tickets <= 0) return showHome(id);
  p.tickets--;
  save();

  const root = h('div', { class: 'battle-root' });
  mount(root, h('div', { class: 'note', textContent: 'じゅんびちゅう…' }));
  const { startBattle } = await import('../../game/BattleScene'); // Phaser はバトルのときだけ読む
  mount(root);

  let ended = false;
  const game = startBattle(root, {
    avatar: p.avatar,
    easy: p.grade === 'k',
    seconds: store.settings.runSeconds,
    upgrades: p.upgrades,
    onLevelUp: (level, levels) => levelUpDialog(p, level, levels),
    onEnd: r => end(r),
  });
  const quit = h('button', {
    class: 'pill-btn battle-quit', textContent: 'やめる',
    onclick: () => { if (confirm('バトルを やめる？')) (game.scene.getScene('battle') as BattleScene | null)?.quit(); },
  });
  document.body.append(quit);

  function end(r: RunResult) {
    if (ended) return;
    ended = true;
    quit.remove();
    game.scene.pause('battle');
    const coins = runReward(p, r);
    save();
    const o = overlay(
      h('h1', { class: 'title' }, ico(r.cleared ? 'trophy' : 'star', 64), r.cleared ? ' クリア！' : ' おつかれさま！'),
      h('div', { class: 'reward' },
        chip('clock', `${r.seconds}びょう`),
        chip('swords', r.kills),
        h('span', { class: 'chip', textContent: `Lv ${r.level}` }),
        chip('coin', `+${coins}`),
      ),
      h('button', { class: 'pill-btn primary', onclick: () => { o.close(); game.destroy(true); showHome(id); } }, ico('home', 26), ' もどる'),
    );
  }
}

// レベルアップ: まずクイズ → 正解ならスキルが「スーパー」（2レベル上がる）
function levelUpDialog(p: Profile, level: number, levels: Record<SkillId, number>): Promise<SkillPick | null> {
  const ids = skillChoices(levels);
  if (!ids.length) return Promise.resolve(null);
  return new Promise(resolve => {
    const day = today();
    const q = battleQuiz(Math.random, p, day);
    const o = overlay(
      h('h1', { class: 'title', textContent: `レベル ${level}！` }),
      h('p', { class: 'note', textContent: 'クイズに せいかいすると スーパーに なるよ' }),
      renderQuestion(q, p, a => {
        applyAnswer(p, q, a, day);
        save();
        o.close();
        chooseSkill(ids, levels, a.correct ? 2 : 1, resolve);
      }),
    );
  });
}

function chooseSkill(ids: SkillId[], levels: Record<SkillId, number>, power: 1 | 2, resolve: (s: SkillPick) => void) {
  const o = overlay(
    h('h1', { class: 'title', textContent: power === 2 ? 'スーパー スキル！' : 'スキルを えらぼう' }),
    h('div', { class: 'skill-choices' }, ...ids.map(id => {
      const s = SKILLS[id];
      return h('button', { class: `skill ${power === 2 ? 'super' : ''}`, onclick: () => { o.close(); resolve({ id, power }); } },
        ico(s.icon, 72),
        s.name,
        h('small', { textContent: `Lv${levels[id]} → ${Math.min(s.max, levels[id] + power)}` }),
        h('small', { class: 'muted', textContent: s.desc }),
      );
    })),
  );
}
