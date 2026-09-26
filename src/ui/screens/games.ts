import { buyUpgrade, canUpgrade, upgradeCost, upgradeLevel } from '../../state/economy';
import { gameProgress, save, store } from '../../state/store';
import { GAMES, gameDef } from '../../games/registry';
import { chip, h, ico, mount } from '../dom';
import { showHome, topbar } from './home';

// ゲームをえらぶ
export function showGames(id: string): void {
  const p = store.profile(id)!;
  const cards = GAMES.map(g => {
    const prog = gameProgress(p, g.id);
    return h('div', { class: 'game-card' },
      ico(g.icon, 72),
      h('div', {},
        h('div', { class: 'name', textContent: g.name }),
        h('div', { class: 'muted', textContent: g.desc }),
        h('div', { class: 'row', style: 'justify-content:flex-start;gap:6px' },
          prog.clears ? chip('trophy', prog.clears) : null,
          prog.best ? chip('star', prog.best) : null)),
      h('div', { class: 'game-actions' },
        h('button', {
          class: 'pill-btn primary', disabled: p.tickets <= 0,
          onclick: () => { if (p.tickets <= 0) return; p.tickets--; save(); g.open(id); },
        }, 'あそぶ ', ico('ticket'), '1'),
        h('button', { class: 'pill-btn', onclick: () => showUpgrade(id, g.id) }, ico('hammer'), ' つよくする'),
      ),
    );
  });
  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showHome(id)),
    h('h1', { class: 'title' }, ico('swords', 44), ' ゲーム'),
    h('div', { class: 'game-list' }, ...cards),
    p.tickets <= 0 ? h('p', { class: 'note bubble' }, 'べんきょうすると ', ico('ticket'), ' が もらえるよ') : null,
  ));
}

// ゲームごとの強化
export function showUpgrade(id: string, gameId: string): void {
  const p = store.profile(id)!;
  const g = gameDef(gameId)!;
  const cards = g.upgrades.map(u => {
    const lv = upgradeLevel(p, g, u);
    return h('div', { class: 'upgrade' },
      ico(u.icon, 60),
      h('div', {},
        h('div', { class: 'name', textContent: u.name }),
        h('div', { class: 'pips' }, ...Array.from({ length: u.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' })))),
      h('button', {
        disabled: !canUpgrade(p, g, u),
        onclick: () => { if (buyUpgrade(p, g, u)) { save(); showUpgrade(id, gameId); } },
      }, ...(lv >= u.max ? ['MAX'] : [ico('coin'), `${upgradeCost(u, lv)}`])),
    );
  });
  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showGames(id)),
    h('h1', { class: 'title' }, ico(g.icon, 44), ` ${g.name}を つよくする`),
    h('div', { class: 'upgrades' }, ...cards),
    h('p', { class: 'note bubble' }, ico('coin'), ' は べんきょうで たくさん もらえるよ'),
  ));
}
