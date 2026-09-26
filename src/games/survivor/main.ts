import './style.css';
import type { GameModule, Platform } from '../types';
import { heroHtml } from '../../art';
import { assetUrl, spriteEl } from '../../assets/sprite';
import { h, fromHtml, ico, overlay } from '../../ui/dom';
import { backButton, playButton, quitButton, resultPanel, spriteChip, upgradePanel, walletBar } from '../kit/ui';
import { SKILLS, skillChoices, type SkillId, type SkillPick } from './skills';
import { startBattle, type BattleScene, type RunResult } from './BattleScene';
import { IMAGES, SHEETS } from './assets.gen';
import { SURVIVOR } from './index';

const RUN_SECONDS = 180; // 1回の長さ（3分生きのこればクリア）

export const open: GameModule['open'] = (root, platform) => showTitle(root, platform);

// タイトル画面
function showTitle(root: HTMLElement, platform: Platform) {
  const prog = platform.progress();
  root.style.setProperty('--game-bg', `url(${assetUrl(IMAGES.title_bg)})`);
  root.replaceChildren(h('div', { class: 'lobby' },
    h('div', { class: 'lobby-top' }, backButton(platform.exit), h('div', { class: 'spacer' }), walletBar(platform)),
    h('h1', { class: 'lobby-title', textContent: 'サバイバー' }),
    fromHtml(heroHtml(platform.player.avatar, 150, true)),
    h('div', { class: 'lobby-row' },
      prog.clears ? spriteChip(SHEETS.icons, 'swords', `さいこう ${prog.best}`) : null,
      prog.clears ? h('span', { class: 'chip' }, ico('trophy'), ` ${prog.clears}`) : null),
    h('p', { class: 'note bubble', textContent: `${RUN_SECONDS / 60}ぷん いきのこれば クリア！` }),
    h('div', { class: 'lobby-row' },
      playButton(platform, () => play(root, platform)),
      h('button', { class: 'pill-btn', onclick: () => upgradePanel(platform, SURVIVOR, SHEETS.icons, () => showTitle(root, platform)) },
        spriteEl(SHEETS.icons, 'hammer', 28), ' つよくする')),
  ));
}

function play(root: HTMLElement, platform: Platform) {
  const ctx = platform.startRun(1);
  if (!ctx) return;
  const stage = h('div', { class: 'stage' });
  root.replaceChildren(stage);
  const quit = quitButton(() => (game.scene.getScene('battle') as BattleScene | null)?.quit());
  const game = startBattle(stage, {
    avatar: ctx.avatar,
    easy: ctx.easy,
    seconds: RUN_SECONDS,
    upgrades: ctx.upgrades as { hp: number; atk: number; speed: number; magnet: number },
    onLevelUp: (level, levels) => levelUp(platform, level, levels),
    onEnd: r => end(r),
  });

  function end(r: RunResult) {
    quit.remove();
    game.scene.pause('battle');
    const { coins } = platform.endRun({ cleared: r.cleared, stage: ctx!.stage, score: r.kills });
    resultPanel({
      cleared: r.cleared, title: r.cleared ? 'クリア！' : 'おつかれさま！', coins,
      stats: [h('span', { class: 'chip' }, ico('clock'), ` ${r.seconds}びょう`), spriteChip(SHEETS.icons, 'swords', r.kills), h('span', { class: 'chip', textContent: `Lv ${r.level}` })],
      onClose: () => { game.destroy(true); showTitle(root, platform); },
    });
  }
}

// レベルアップ: まずクイズ → 正解ならスキルが「スーパー」（2レベル上がる）
// ※ この決まりより前に作ったクイズ（docs 8.）。残すかはサバイバーの改善のときに決める
async function levelUp(platform: Platform, level: number, levels: Record<SkillId, number>): Promise<SkillPick | null> {
  const ids = skillChoices(levels);
  if (!ids.length) return null;
  const ok = await platform.quiz(`レベル ${level}！`, 'クイズに せいかいすると スーパーに なるよ');
  return chooseSkill(ids, levels, ok ? 2 : 1);
}

function chooseSkill(ids: SkillId[], levels: Record<SkillId, number>, power: 1 | 2): Promise<SkillPick> {
  return new Promise(resolve => {
    const o = overlay(
      h('h1', { class: 'title', textContent: power === 2 ? 'スーパー スキル！' : 'スキルを えらぼう' }),
      h('div', { class: 'skill-choices' }, ...ids.map(id => {
        const s = SKILLS[id];
        return h('button', { class: `skill ${power === 2 ? 'super' : ''}`, onclick: () => { o.close(); resolve({ id, power }); } },
          spriteEl(SHEETS.icons, s.icon, 72),
          s.name,
          h('small', { textContent: `Lv${levels[id]} → ${Math.min(s.max, levels[id] + power)}` }),
          h('small', { class: 'muted', textContent: s.desc }),
        );
      })),
    );
  });
}
