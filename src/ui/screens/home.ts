import { studyGivesTicket } from '../../state/economy';
import { rollDaily, save, store, today } from '../../state/store';
import type { Profile } from '../../state/types';
import { STUDIES } from '../../studies/registry';
import { chip, h, hero, ico, mount } from '../dom';
import { showGames } from './games';
import { showLab } from './lab';
import { showProfiles } from './profiles';
import { showStudy } from './study';

export function wallet(p: Profile): HTMLElement {
  return h('div', { class: 'wallet' },
    chip('coin', p.coins), chip('ticket', p.tickets));
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
  const s = store.settings;
  rollDaily(p, s, today());
  save();
  const small = (...c: (Node | string)[]) => h('small', {}, ...c);
  // その日はじめての教科なら券とコイン、2回目からはコインだけ
  const reward = (studyId: string) => small(...(studyGivesTicket(p, s, studyId) ? [ico('ticket'), ico('coin')] : [ico('coin')]), ' が もらえる');
  const ticketStudies = STUDIES.filter(x => studyGivesTicket(p, s, x.id));

  mount(h('div', { class: 'screen scenic' },
    topbar(p, showProfiles),
    h('div', { class: 'home-grid' },
      // べんきょう（src/studies/registry.ts）
      ...STUDIES.map(st => h('button', { class: 'big-btn', style: `background:${st.color}`, onclick: () => showStudy(p.id, st.id) },
        ico(st.icon, 72), st.name, reward(st.id))),
      // ゲーム（src/games/registry.ts）
      h('button', { class: 'big-btn battle wide', onclick: () => showGames(p.id) },
        ico('swords', 72), 'ゲーム', small(ico('ticket'), ' を 1まい つかう')),
      h('button', { class: 'big-btn lab', onclick: () => showLab(p.id) },
        ico('flame', 48), 'あそびラボ', small('ためしプレイ')),
    ),
    h('p', { class: 'note bubble' }, ...(ticketStudies.length
      ? [`${ticketStudies.map(x => x.name).join('・')}を やると `, ico('ticket'), ' が もらえるよ']
      : ['きょうの ', ico('ticket'), ' は ぜんぶ もらったよ。また あした！'])),
  ));
}
