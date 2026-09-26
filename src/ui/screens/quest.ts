import { applyAnswer, buildSet, type SetItem } from '../../learn/engine';
import { questReward } from '../../state/economy';
import { save, store, today } from '../../state/store';
import { studyDef } from '../../studies/registry';
import type { Selection } from '../../studies/types';
import { chip, h, ico, mount } from '../dom';
import { renderQuestion } from '../question';
import { showHome, topbar } from './home';
import { showStudy } from './study';

export function showQuest(id: string, sel: Selection): void {
  const p = store.profile(id)!;
  const study = studyDef(sel.study);
  if (!study) return showHome(id);
  const day = today();
  const items: SetItem[] = buildSet(Math.random, study, p, sel, store.settings.questLength, day);
  if (!items.length) return showStudy(id, sel.study, sel.grade);
  const results: boolean[] = [];
  const retried = new Set<string>();
  let answerCoins = 0;
  const back = () => showStudy(id, sel.study, sel.grade);

  const step = (i: number) => {
    if (i >= items.length) return finish();
    const { cat, q, retry } = items[i];
    const progress = h('div', { class: 'progress' }, ...items.map((x, k) =>
      h('span', { class: [k < i ? (results[k] ? 'ok' : 'ng') : k === i ? 'now' : '', x.retry ? 'retry' : ''].join(' ') })));
    mount(h('div', { class: 'screen' },
      topbar(p, back),
      progress,
      retry ? h('p', { class: 'note' }, 'もう いちど！') : null,
      renderQuestion(q, p, a => {
        answerCoins += applyAnswer(p, q, a, day, retry);
        const good = a.correct && !a.helped;
        results.push(good);
        // まちがえた問題は、さいごにもう一度（1回だけ。コインなし）
        if (!good && !retry && !retried.has(q.card)) {
          retried.add(q.card);
          items.push({ cat, q: cat.make(q.card, Math.random, p), retry: true });
        }
        save();
        step(i + 1);
      }),
    ));
  };

  const finish = () => {
    const firsts = results.filter((_, k) => !items[k].retry);
    const perfect = firsts.every(Boolean);
    const r = questReward(p, store.settings, sel, answerCoins, day);
    save();
    mount(h('div', { class: 'screen scenic' },
      h('h1', { class: 'title' }, ico(perfect ? 'trophy' : 'star', 64), perfect ? ' パーフェクト！' : ' クエスト クリア！'),
      h('div', { class: 'reward' },
        chip('coin', `+${r.coins}`),
        r.tickets ? chip('ticket', `+${r.tickets}`) : null,
      ),
      r.tickets ? null : h('p', { class: 'note bubble' }, ...(p.daily.subjects.includes(sel.study)
        ? ['きょうの ', ico('ticket'), ' は もう もらったよ。ほかの きょうかも やってみよう']
        : ['したの がくねんでは ', ico('ticket'), ' は もらえないよ'])),
      h('div', { class: 'row' },
        h('button', { class: 'pill-btn', onclick: back }, ico('back', 26), ' もどる'),
        h('button', { class: 'pill-btn primary', textContent: 'もういっかい', onclick: () => showQuest(id, sel) }),
      ),
    ));
  };

  step(0);
}
