import { UPGRADES, buyUpgrade, canUpgrade, upgradeCost } from '../../state/economy';
import { save, store } from '../../state/store';
import type { UpgradeId } from '../../state/types';
import { h, ico, mount } from '../dom';
import { showHome, topbar } from './home';

const MAT_ICON = { feathers: 'feather', stars: 'star' } as const;

export function showUpgrade(id: string): void {
  const p = store.profile(id)!;
  const cards = (Object.keys(UPGRADES) as UpgradeId[]).map(u => {
    const def = UPGRADES[u], lv = p.upgrades[u], c = upgradeCost(p, u);
    const maxed = lv >= def.max;
    return h('div', { class: 'upgrade' },
      ico(def.icon, 60),
      h('div', {},
        h('div', { class: 'name', textContent: def.name }),
        h('div', { class: 'pips' }, ...Array.from({ length: def.max }, (_, i) => h('i', { class: i < lv ? 'on' : '' })))),
      h('button', {
        disabled: !canUpgrade(p, u),
        onclick: () => { if (buyUpgrade(p, u)) { save(); showUpgrade(id); } },
      }, ...(maxed ? ['MAX'] : [ico('coin'), `${c.coins} `, ico(MAT_ICON[c.material]), `${c.amount}`])),
    );
  });
  mount(h('div', { class: 'screen scenic' },
    topbar(p, () => showHome(id)),
    h('h1', { class: 'title' }, ico('hammer', 44), ' つよくする'),
    h('div', { class: 'upgrades' }, ...cards),
    h('p', { class: 'note bubble' }, ico('feather'), ' は こくご、', ico('star'), ' は さんすうで もらえるよ'),
  ));
}
