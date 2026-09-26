import type { Answer, Question } from '../learn/types';
import type { Profile } from '../state/types';
import { loadStrokes } from '../learn/handwriting/strokes';
import { h, ico, wait } from './dom';
import { writepad } from './widgets/writepad';

// 1問を表示して、答えが決まったら onAnswer を1回だけ呼ぶ
export function renderQuestion(q: Question, p: Profile, onAnswer: (a: Answer) => void): HTMLElement {
  const msg = h('div', { class: 'note' });
  const prompt = h('div', { class: 'prompt', html: q.prompt });
  const body = h('div', { class: 'quest-body' });
  let answered = false;
  const finish = async (a: Answer) => {
    if (answered) return;
    answered = true;
    flash(a.correct);
    await wait(a.correct ? 700 : 1600);
    onAnswer(a);
  };

  if (q.kind === 'choice') {
    const buttons = q.choices.map((c, i) => h('button', {
      class: 'choice', html: c,
      onclick: () => {
        if (answered) return;
        buttons[q.answer].classList.add('right');
        if (i !== q.answer) buttons[i].classList.add('wrong');
        void finish({ correct: i === q.answer });
      },
    }));
    body.append(h('div', { class: 'choices' }, ...buttons));
  } else if (q.kind === 'number') {
    let value = '';
    const box = h('div', { class: 'answer-box', textContent: ' ' });
    const press = (k: string) => {
      if (answered) return;
      if (k === 'del') value = value.slice(0, -1);
      else if (k === 'ok') {
        if (!value) return;
        const correct = Number(value) === q.answer;
        if (!correct) { box.textContent = `${q.answer}`; box.style.borderColor = 'var(--ng)'; msg.textContent = `こたえは ${q.answer}`; }
        void finish({ correct });
        return;
      } else if (value.length < 4) value += k;
      box.textContent = value || ' ';
    };
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'del', '0', 'ok'];
    body.append(h('div', { class: 'col', style: 'gap:14px' }, box,
      h('div', { class: 'numpad' }, ...keys.map(k => h('button', {
        class: k === 'ok' ? 'ok' : k === 'del' ? 'del' : '',
        textContent: k === 'ok' ? 'OK' : k === 'del' ? '⌫' : k,
        onclick: () => press(k),
      })))));
  } else {
    msg.textContent = q.guide === 'trace' ? 'うすい じを なぞろう' : q.guide === 'model' ? 'おてほんを みて かこう' : 'かんじで かこう';
    const holder = h('div', { class: 'note', textContent: '…' });
    body.append(holder);
    void loadStrokes().then(all => {
      holder.replaceWith(writepad({
        strokes: all[q.char], guide: q.guide, char: q.char, tolerance: p.tolerance,
        onMessage: t => { msg.textContent = t; },
        // 手書きは、さいごまで書ければ正解（まちがいが多ければ helped で復習に回る）
        onDone: r => void finish({ correct: true, helped: r.helped }),
      }));
    });
  }
  return h('div', { class: 'col', style: 'gap:16px;width:100%' }, prompt, msg, body);
}

function flash(correct: boolean) {
  const el = h('div', { class: 'feedback' }, ico(correct ? 'maru' : 'sweat', 220));
  document.body.append(el);
  setTimeout(() => el.remove(), 700);
}
