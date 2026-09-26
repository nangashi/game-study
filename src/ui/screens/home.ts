import { rollDaily, save, store, today } from '../../state/store';
import type { Profile } from '../../state/types';
import { chip, h, hero, ico, mount } from '../dom';
import { showBattle } from './battle';
import { showLab } from './lab';
import { showProfiles } from './profiles';
import { showQuest } from './quest';
import { showUpgrade } from './upgrade';

export function wallet(p: Profile): HTMLElement {
  return h('div', { class: 'wallet' },
    chip('coin', p.coins), chip('feather', p.feathers), chip('star', p.stars), chip('ticket', p.tickets));
}

export function topbar(p: Profile, back?: () => void): HTMLElement {
  return h('div', { class: 'topbar' },
    back ? h('button', { class: 'pill-btn icon-btn', 'aria-label': 'もどる', onclick: back }, ico('back', 28)) : null,
    h('div', { class: 'me' }, hero(p.avatar, 52), p.name),
    p.streak.count > 1 ? chip('flame', `${p.streak.count}にち`) : null,
    h('div', { class: 'spacer' }),
    wallet(p),
  );
}

export function showHome(id: string): void {
  const p = store.profile(id);
  if (!p) return showProfiles();
  rollDaily(p, today());
  save();
  const s = store.settings;
  const left = s.ticketsPerDay - p.daily.ticketsEarned;
  const small = (...c: (Node | string)[]) => h('small', {}, ...c);

  mount(h('div', { class: 'screen scenic' },
    topbar(p, showProfiles),
    h('div', { class: 'home-grid' },
      h('button', { class: 'big-btn kokugo', onclick: () => showQuest(p.id, 'kokugo') },
        ico('pencil', 72), 'こくご', small(ico('feather'), ' が もらえる')),
      h('button', { class: 'big-btn sansu', onclick: () => showQuest(p.id, 'sansu') },
        ico('abacus', 72), 'さんすう', small(ico('star'), ' が もらえる')),
      h('button', { class: 'big-btn battle', disabled: p.tickets <= 0, onclick: () => showBattle(p.id) },
        ico('swords', 72), 'バトル', small(ico('ticket'), ' を 1まい つかう')),
      h('button', { class: 'big-btn shop', onclick: () => showUpgrade(p.id) },
        ico('hammer', 72), 'つよくする', small(ico('coin'), ico('feather'), ico('star'), ' を つかう')),
      h('button', { class: 'big-btn lab', onclick: () => showLab(p.id) },
        ico('flame', 48), 'あそびラボ', small('ためしプレイ')),
    ),
    h('p', { class: 'note bubble' }, ...(left > 0
      ? [`きょう あと ${left}かい、べんきょうすると `, ico('ticket'), ' が もらえるよ']
      : ['きょうの ', ico('ticket'), ' は ぜんぶ もらったよ。また あした！'])),
  ));
}
