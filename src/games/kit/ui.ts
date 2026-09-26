// ゲームのタイトル画面・結果画面を作るための部品（使うかどうかはゲームが決める）
// 色や背景は、ゲームの CSS で --game-accent などを上書きして変える（kit.css）
import './kit.css';
import type { GameDef, Platform, UpgradeDef } from '../types';
import type { Sheet } from '../../assets/sprite';
import { spriteEl } from '../../assets/sprite';
import { chip, h, ico, overlay } from '../../ui/dom';

// コインとゲーム券（土台の通貨なので、アイコンは共通のもの）
export function walletBar(platform: Platform): HTMLElement {
  const w = platform.wallet();
  return h('div', { class: 'wallet' }, chip('coin', w.coins), chip('ticket', w.tickets));
}

export const backButton = (onClick: () => void) =>
  h('button', { class: 'pill-btn icon-btn', 'aria-label': 'もどる', onclick: onClick }, ico('back', 28));

// 「あそぶ 🎟1」。券がなければ押せない
export function playButton(platform: Platform, onClick: () => void, label = 'あそぶ'): HTMLButtonElement {
  return h('button', { class: 'lobby-play', disabled: platform.wallet().tickets <= 0, onclick: onClick }, label, ' ', ico('ticket'), '1');
}

// つよくする（ずっと残る強化）。onChange は買ったあとに呼ばれる
// sheet は アイコンのシート。いくつか渡すと、フレーム名が見つかったシートを使う
// 数値の強化（stat）と 解放（unlock）を分けて出す
export function upgradePanel(platform: Platform, game: GameDef, sheet: Sheet | Sheet[], onChange: () => void): void {
  const o = overlay();
  const card = o.el.firstElementChild as HTMLElement;
  card.classList.add('upgrade-panel');
  const sheets = Array.isArray(sheet) ? sheet : [sheet];
  const icon = (name: string) => spriteEl(sheets.find(x => name in x.frames) ?? sheets[0], name, 60);
  const row = (u: UpgradeDef) => {
    const lv = platform.upgradeLevel(u.id);
    const unlock = u.kind === 'unlock';
    return h('div', { class: `upgrade ${unlock ? 'unlock' : ''} ${unlock && lv >= u.max ? 'owned' : ''}` },
      icon(u.icon),
      h('div', {},
        h('div', { class: 'name', textContent: u.name }),
        u.desc ? h('div', { class: 'desc', textContent: u.desc }) : null,
        u.max > 1 ? h('div', { class: 'pips' }, ...Array.from({ length: u.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' }))) : null),
      h('button', {
        disabled: !platform.canUpgrade(u.id),
        onclick: () => { if (platform.buyUpgrade(u.id)) { render(); onChange(); } },
      }, ...(lv >= u.max ? [unlock ? 'もってる' : 'MAX'] : [ico('coin'), `${platform.upgradeCost(u.id)}`])),
    );
  };
  const stats = game.upgrades.filter(u => u.kind !== 'unlock'), unlocks = game.upgrades.filter(u => u.kind === 'unlock');
  const render = () => card.replaceChildren(
    h('h1', { class: 'title' }, ico('hammer', 44), ' つよくする'),
    walletBar(platform),
    h('div', { class: 'upgrades' }, ...stats.map(row)),
    ...(unlocks.length ? [h('h2', { class: 'upgrade-head', textContent: 'かいほう（できることが ふえる）' }), h('div', { class: 'upgrades' }, ...unlocks.map(row))] : []),
    h('p', { class: 'note', style: 'margin:0' }, ico('coin'), ' は べんきょうで たくさん もらえるよ'),
    h('button', { class: 'pill-btn primary', textContent: 'とじる', onclick: () => o.close() }),
  );
  render();
}

// 遊んでいる間の「やめる」ボタン
export function quitButton(onQuit: () => void): { el: HTMLElement; remove(): void } {
  const el = h('button', { class: 'pill-btn game-quit', textContent: 'やめる', onclick: () => { if (confirm('ゲームを やめる？')) onQuit(); } });
  document.body.append(el);
  return { el, remove: () => el.remove() };
}

// 結果（コインは platform.endRun のもどり値を出す）
export function resultPanel(opts: { cleared: boolean; title: string; note?: string; stats: (Node | string)[]; coins: number; onClose: () => void }): void {
  const o = overlay(
    h('h1', { class: 'title' }, ico(opts.cleared ? 'trophy' : 'star', 64), ` ${opts.title}`),
    opts.note ? h('p', { class: 'note', textContent: opts.note }) : null,
    h('div', { class: 'reward' }, ...opts.stats, chip('coin', `+${opts.coins}`)),
    h('button', { class: 'pill-btn primary', onclick: () => { o.close(); opts.onClose(); } }, 'OK'),
  );
}

// ゲームのシートの絵つきチップ
export const spriteChip = (sheet: Sheet, frame: string, text: string | number) =>
  h('span', { class: 'chip' }, spriteEl(sheet, frame, '1.2em'), ` ${text}`);
