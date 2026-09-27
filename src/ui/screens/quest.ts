import { applyAnswer, buildSet, setLength, type SetItem } from '../../learn/engine';
import { questReward } from '../../state/economy';
import { save, store, today } from '../../state/store';
import { studyDef } from '../../studies/registry';
import type { Selection } from '../../studies/types';
import { chip, h, ico, mount } from '../dom';
import { renderQuestion } from '../question';
import { showHome, topbar } from './home';
import { showStudy } from './study';

export const seconds = (ms: number) => `${(ms / 1000).toFixed(1)}びょう`;

type Mark = 'ok' | 'slow' | 'ng';

export function showQuest(id: string, sel: Selection): void {
  const p = store.profile(id)!;
  const study = studyDef(sel.study);
  if (!study) return showHome(id);
  const day = today();
  const drill = study.categories.find(c => c.id === sel.category)?.drill;
  const slowMs = drill ? store.settings.drillSlowSec * 1000 : undefined;
  const items: SetItem[] = buildSet(Math.random, study, p, sel, setLength(study, sel, store.settings.questLength), day, slowMs);
  if (!items.length) return showStudy(id, sel.study, sel.grade);
  const marks: Mark[] = [];
  const retried = new Set<string>();
  let answerCoins = 0;
  let time = 0;   // ドリル: はじめて答えた問題の時間の合計
  const back = () => showStudy(id, sel.study, sel.grade);

  const step = (i: number) => {
    if (i >= items.length) return finish();
    const { cat, q, retry } = items[i];
    const progress = h('div', { class: 'progress' }, ...items.map((x, k) =>
      h('span', { class: [k < i ? marks[k] : k === i ? 'now' : '', x.retry ? 'retry' : ''].join(' ') })));
    mount(h('div', { class: 'screen' },
      topbar(p, back),
      progress,
      drill ? h('p', { class: 'note' }, ico('clock'), ` ${seconds(time)}`) : null,
      retry ? h('p', { class: 'note' }, 'もう いちど！') : null,
      renderQuestion(q, p, a => {
        answerCoins += applyAnswer(p, q, a, day, { retry, slowMs });
        const good = a.correct && !a.helped;
        marks.push(!good ? 'ng' : slowMs != null && (a.ms ?? 0) > slowMs ? 'slow' : 'ok');
        if (!retry) time += a.ms ?? 0;
        // まちがえた問題は、さいごにもう一度（1回だけ。コインなし）
        if (!good && !retry && !retried.has(q.card)) {
          retried.add(q.card);
          // 計算のわくは、作りなおすと数が変わるので同じ問題を出す
          items.push({ cat, q: cat.varied ? q : cat.make(q.card, Math.random, p), retry: true });
        }
        save();
        step(i + 1);
      }, { fast: !!drill }),
    ));
  };

  const finish = () => {
    const perfect = marks.every((m, k) => items[k].retry || m !== 'ng');
    // ドリルのベスト記録は、ぜんぶ正解したときだけ
    const best = p.best?.[sel.category!];
    const newBest = !!drill && perfect && (best == null || time < best);
    if (newBest) (p.best ??= {})[sel.category!] = time;
    const r = questReward(p, store.settings, sel, answerCoins, day);
    save();
    mount(h('div', { class: 'screen scenic' },
      h('h1', { class: 'title' }, ico(perfect ? 'trophy' : 'star', 64), newBest ? ' ベスト こうしん！' : perfect ? ' パーフェクト！' : ' クエスト クリア！'),
      drill ? h('p', { class: 'note bubble' }, ico('clock'), ` タイム ${seconds(time)}`, best != null ? `（ベスト ${seconds(Math.min(best, time))}）` : '') : null,
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
