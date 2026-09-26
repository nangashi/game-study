import { store } from '../../state/store';
import { GAMES } from '../../games/registry';
import { spriteEl } from '../../assets/sprite';
import { h, ico, mount } from '../dom';
import { showHome, topbar } from './home';
import { openGame } from './game-host';

// ゲームをえらぶ（土台がやるのはここまで。えらんだら、そのゲームのタイトル画面に入る）
export function showGames(id: string): void {
  const p = store.profile(id)!;
  const cards = GAMES.map(g => h('button', { class: 'game-card', onclick: () => void openGame(id, g) },
    spriteEl(g.cover.sheet, g.cover.frame, 96),
    h('div', {},
      h('div', { class: 'name', textContent: g.name }),
      h('div', { class: 'muted', textContent: g.desc })),
  ));
  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showHome(id)),
    h('h1', { class: 'title' }, ico('swords', 44), ' ゲームを えらぼう'),
    h('div', { class: 'game-list' }, ...cards),
    p.tickets <= 0 ? h('p', { class: 'note bubble' }, 'べんきょうすると ', ico('ticket'), ' が もらえるよ') : null,
  ));
}
