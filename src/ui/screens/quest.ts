import { applyAnswer, buildQuest } from '../../learn/engine';
import { questReward } from '../../state/economy';
import { save, store, today } from '../../state/store';
import type { Subject } from '../../state/types';
import { chip, h, ico, mount } from '../dom';
import { renderQuestion } from '../question';
import { showHome, topbar } from './home';

export function showQuest(id: string, subject: Subject): void {
  const p = store.profile(id)!;
  const day = today();
  const questions = buildQuest(Math.random, p, subject, store.settings.questLength, day);
  const results: boolean[] = [];

  const step = (i: number) => {
    if (i >= questions.length) return finish();
    const progress = h('div', { class: 'progress' }, ...questions.map((_, k) =>
      h('span', { class: k < i ? (results[k] ? 'ok' : 'ng') : k === i ? 'now' : '' })));
    mount(h('div', { class: 'screen' },
      topbar(p, () => showHome(id)),
      progress,
      renderQuestion(questions[i], p, a => {
        applyAnswer(p, questions[i], a, day);
        results.push(a.correct && !a.helped);
        save();
        step(i + 1);
      }),
    ));
  };

  const finish = () => {
    const correct = results.filter(Boolean).length;
    const r = questReward(p, store.settings, subject, correct, day);
    save();
    mount(h('div', { class: 'screen scenic' },
      h('h1', { class: 'title' }, ico(correct === results.length ? 'trophy' : 'star', 64),
        correct === results.length ? ' パーフェクト！' : ' クエスト クリア！'),
      h('div', { class: 'reward' },
        chip('coin', `+${r.coins}`),
        r.feathers ? chip('feather', `+${r.feathers}`) : null,
        r.stars ? chip('star', `+${r.stars}`) : null,
        r.ticket ? chip('ticket', '+1') : null,
      ),
      r.ticket ? null : h('p', { class: 'note bubble' }, 'きょうの ', ico('ticket'), ' は もう もらったよ'),
      h('div', { class: 'row' },
        h('button', { class: 'pill-btn', onclick: () => showHome(id) }, ico('home', 26), ' もどる'),
        h('button', { class: 'pill-btn primary', textContent: 'もういっかい', onclick: () => showQuest(id, subject) }),
      ),
    ));
  };

  step(0);
}
