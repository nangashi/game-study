import { subjectGivesTicket } from '../../state/economy';
import { rollDaily, save, store, today } from '../../state/store';
import type { Profile, Subject } from '../../state/types';
import { chip, h, hero, ico, mount } from '../dom';
import { showGames } from './games';
import { showLab } from './lab';
import { showProfiles } from './profiles';
import { showQuest } from './quest';

const SUBJECTS: { id: Subject; name: string }[] = [{ id: 'kokugo', name: 'こくご' }, { id: 'sansu', name: 'さんすう' }];

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
  const reward = (subject: Subject) => small(...(subjectGivesTicket(p, s, subject) ? [ico('ticket'), ico('coin')] : [ico('coin')]), ' が もらえる');
  const ticketSubjects = SUBJECTS.filter(x => subjectGivesTicket(p, s, x.id));

  mount(h('div', { class: 'screen scenic' },
    topbar(p, showProfiles),
    h('div', { class: 'home-grid' },
      h('button', { class: 'big-btn kokugo', onclick: () => showQuest(p.id, 'kokugo') },
        ico('pencil', 72), 'こくご', reward('kokugo')),
      h('button', { class: 'big-btn sansu', onclick: () => showQuest(p.id, 'sansu') },
        ico('abacus', 72), 'さんすう', reward('sansu')),
      h('button', { class: 'big-btn battle wide', onclick: () => showGames(p.id) },
        ico('swords', 72), 'ゲーム', small(ico('ticket'), ' を 1まい つかう')),
      h('button', { class: 'big-btn lab', onclick: () => showLab(p.id) },
        ico('flame', 48), 'あそびラボ', small('ためしプレイ')),
    ),
    h('p', { class: 'note bubble' }, ...(ticketSubjects.length
      ? [`${ticketSubjects.map(x => x.name).join('・')}を やると `, ico('ticket'), ' が もらえるよ']
      : ['きょうの ', ico('ticket'), ' は ぜんぶ もらったよ。また あした！'])),
  ));
}
