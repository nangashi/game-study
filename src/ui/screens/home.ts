import { rollDaily, save, store, today } from '../../state/store';
import type { Profile } from '../../state/types';
import { STUDIES } from '../../studies/registry';
import { chip, h, hero, ico, mount } from '../dom';
import { showProfiles } from './profiles';
import { showStudy } from './study';

export function topbar(p: Profile, back?: () => void): HTMLElement {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'pill-btn icon-btn', 'aria-label': 'もどる', onclick: back }, ico('back', 28)) : null,
    h('div', { class: 'me' }, hero(p.avatar, 52), p.name),
    p.streak.count > 1 ? chip('flame', `${p.streak.count}にち`) : null,
    h('div', { class: 'spacer' }),
  );
}

export function showHome(id: string): void {
  const p = store.profile(id);
  if (!p) return showProfiles();
  rollDaily(p, today());
  save();

  mount(h('div', { class: 'screen scenic' },
    topbar(p, showProfiles),
    h('div', { class: 'home-grid' },
      // べんきょう（src/studies/registry.ts）
      ...STUDIES.map(st => h('button', { class: 'big-btn', style: `background:${st.color}`, onclick: () => showStudy(p.id, st.id) },
        ico(st.icon, 72), st.name)),
    ),
  ));
}
