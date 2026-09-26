import './style.css';
import type { GameModule, Platform } from '../types';
import { assetUrl, spriteEl } from '../../assets/sprite';
import { h, overlay } from '../../ui/dom';
import { backButton, playButton, quitButton, resultPanel, spriteChip, upgradePanel, walletBar } from '../kit/ui';
import { HSKILLS, hSkillChoices, type HSkillId } from './skills';
import { startHippari, type CharaId, type HippariScene } from './HippariScene';
import { HIPPARI_STAGES, isBossStage } from './stages';
import { IMAGES, SHEETS } from './assets.gen';
import { HIPPARI } from './index';

// ゲームだけの保存データ（強さには関係しない）
interface HippariData { chara?: CharaId }
const CHARAS = Object.keys(SHEETS.chars.frames) as CharaId[];

export const open: GameModule['open'] = (root, platform) => showTitle(root, platform, platform.maxStage());

// タイトル画面: キャラ・ステージをえらんで あそぶ
function showTitle(root: HTMLElement, platform: Platform, stage: number) {
  const chara = platform.data<HippariData>()?.chara ?? 'panda';
  const max = platform.maxStage();
  const cleared = platform.progress().stage;
  root.style.setProperty('--game-bg', `url(${assetUrl(IMAGES.title_bg)})`);
  const again = (s = stage) => showTitle(root, platform, s);

  root.replaceChildren(h('div', { class: 'lobby' },
    h('div', { class: 'lobby-top' }, backButton(platform.exit), h('div', { class: 'spacer' }), walletBar(platform)),
    h('h1', { class: 'lobby-title', textContent: 'ひっぱりアタック' }),
    // キャラをえらぶ（見た目だけ。どのキャラでも強さは同じ）
    h('div', { class: 'hp-charas' }, ...CHARAS.map(c => h('button', {
      class: c === chara ? 'on' : '', 'aria-label': c,
      onclick: () => { platform.saveData<HippariData>({ chara: c }); again(); },
    }, spriteEl(SHEETS.chars, c, c === chara ? 96 : 64)))),
    // ステージをえらぶ
    h('div', { class: 'hp-stages' }, ...Array.from({ length: HIPPARI_STAGES }, (_, i) => {
      const n = i + 1, locked = n > max;
      return h('button', {
        class: ['hp-stage', n === stage ? 'on' : '', n <= cleared ? 'clear' : '', isBossStage(n) ? 'boss' : ''].join(' '),
        disabled: locked, onclick: () => again(n),
      },
      locked ? spriteEl(SHEETS.icons, 'lock', 30) : String(n),
      isBossStage(n) ? spriteEl(SHEETS.icons, 'crown', 26, 'hp-badge') : n <= cleared ? spriteEl(SHEETS.icons, 'flag', 24, 'hp-badge') : null);
    })),
    h('div', { class: 'lobby-row' },
      playButton(platform, () => play(root, platform, stage, chara), `ステージ ${stage}`),
      h('button', { class: 'pill-btn', onclick: () => upgradePanel(platform, HIPPARI, SHEETS.icons, () => again()) },
        spriteEl(SHEETS.icons, 'glove', 28), ' つよくする')),
  ));
}

function play(root: HTMLElement, platform: Platform, stage: number, chara: CharaId) {
  const ctx = platform.startRun(stage);
  if (!ctx) return;
  const holder = h('div', { class: 'stage' });
  root.replaceChildren(holder);
  const quit = quitButton(() => (game.scene.getScene('hippari') as HippariScene | null)?.quit());
  const game = startHippari(holder, {
    chara,
    easy: ctx.easy,
    stage,
    upgrades: ctx.upgrades as { hp: number; atk: number; speed: number; heal: number },
    onWaveClear: levels => chooseSkill(levels),
    onEnd: r => {
      quit.remove();
      const { coins, firstClear } = platform.endRun({ cleared: r.cleared, stage, score: r.bestCombo });
      const next = firstClear && stage < HIPPARI_STAGES;
      resultPanel({
        cleared: r.cleared, coins,
        title: r.cleared ? `ステージ ${stage} クリア！` : 'おしい！',
        note: next ? 'つぎの ステージに すすめるよ' : undefined,
        stats: [h('span', { class: 'chip', textContent: `なみ ${r.wave}/${r.waves}` }), spriteChip(SHEETS.icons, 'spark', `${r.bestCombo}ヒット`)],
        onClose: () => { game.destroy(true); showTitle(root, platform, next ? stage + 1 : stage); },
      });
    },
  });
}

// 波をたおしたら、スキルを1つえらぶ（クイズは出さない。docs 8.）
function chooseSkill(levels: Record<HSkillId, number>): Promise<HSkillId | null> {
  const ids = hSkillChoices(levels);
  if (!ids.length) return Promise.resolve(null);
  return new Promise(resolve => {
    const o = overlay(
      h('h1', { class: 'title', textContent: 'なみを たおした！ スキルを えらぼう' }),
      h('div', { class: 'skill-choices' }, ...ids.map(id => {
        const s = HSKILLS[id];
        return h('button', { class: 'skill', onclick: () => { o.close(); resolve(id); } },
          spriteEl(SHEETS.icons, s.icon, 72),
          s.name,
          s.max > 1 ? h('small', { textContent: `Lv${levels[id]} → ${levels[id] + 1}` }) : null,
          h('small', { class: 'muted', textContent: s.desc }),
        );
      })),
    );
    o.el.classList.add('game-hippari');
  });
}
