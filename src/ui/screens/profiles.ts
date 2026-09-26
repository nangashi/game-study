import { store } from '../../state/store';
import { h, hero, ico, mount } from '../dom';
import { showHome } from './home';
import { showParentGate } from './parent';

export function showProfiles(): void {
  const profiles = store.data.profiles;
  mount(h('div', { class: 'screen scenic' },
    h('h1', { class: 'title logo' }, ico('swords', 56), ' まなびサバイバー'),
    profiles.length
      ? h('div', { class: 'profiles' }, ...profiles.map(p => h('button', { class: 'profile-card', onclick: () => showHome(p.id) },
          hero(p.avatar, 150, true), p.name)))
      : h('p', { class: 'note bubble', textContent: 'おうちのひとに、なまえを とうろく してもらってね' }),
    h('div', { class: 'spacer' }),
    h('button', { class: 'pill-btn', onclick: showParentGate }, ico('family', 26), ' おうちのひと'),
  ));
}
