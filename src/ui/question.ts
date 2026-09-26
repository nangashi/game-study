import type { Answer, Question } from '../learn/types';
import type { Profile } from '../state/types';
import { loadStrokes } from '../learn/handwriting/strokes';
import { h, ico, wait } from './dom';
import { writepad } from './widgets/writepad';
import { kanapad } from './widgets/kanapad';
import { shuffle } from '../learn/random';

// 1問を表示して、答えが決まったら onAnswer を1回だけ呼ぶ（答えるまでの時間 ms もわたす）
// fast: ドリル用。正解の合図を短くして、テンポよく次へ進む
export function renderQuestion(q: Question, p: Profile, onAnswer: (a: Answer) => void, opts: { fast?: boolean } = {}): HTMLElement {
  const start = performance.now();
  const msg = h('div', { class: 'note' });
  const prompt = h('div', { class: 'prompt', html: q.prompt });
  const body = h('div', { class: 'quest-body' });
  let answered = false;
  const finish = async (a: Answer) => {
    if (answered) return;
    answered = true;
    a.ms = Math.round(performance.now() - start);
    flash(a.correct);
    // ひとこと（ことわざの意味など）があれば、読めるように長めに待つ
    const note = q.kind === 'choice' && q.note;
    if (note) msg.textContent = note;
    await wait((a.correct ? (opts.fast ? 250 : 700) : 1600) + (note ? 1800 : 0));
    onAnswer(a);
  };

  if (q.kind === 'choice') {
    // 長い選択肢（文）は小さい字でたてにならべる
    const long = q.choices.some(c => c.replace(/<[^>]+>/g, '').length > 4);
    const buttons = q.choices.map((c, i) => h('button', {
      class: long ? 'choice long' : 'choice', html: c,
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
      } else if (value.length < 5) value += k;
      box.textContent = value || ' ';
    };
    const keys = ['7', '8', '9', '4', '5', '6', '1', '2', '3', 'del', '0', 'ok'];
    body.append(h('div', { class: 'col', style: 'gap:14px' }, box,
      h('div', { class: 'numpad' }, ...keys.map(k => h('button', {
        class: k === 'ok' ? 'ok' : k === 'del' ? 'del' : '',
        textContent: k === 'ok' ? 'OK' : k === 'del' ? '⌫' : k,
        onclick: () => press(k),
      })))));
  } else if (q.kind === 'kana') {
    const pad = kanapad(value => {
      const correct = q.answers.includes(value);
      pad.box.classList.add(correct ? 'right' : 'wrong');
      if (!correct) msg.textContent = `こたえは 「${q.answers[0]}」`;
      void finish({ correct });
    });
    body.append(pad.el);
  } else if (q.kind === 'order') {
    const picked: string[] = [];
    const slots = h('div', { class: 'order-slots' });
    const draw = () => slots.replaceChildren(...q.items.map((_, i) =>
      h('div', { class: picked[i] ? 'slot filled' : 'slot', textContent: picked[i] ?? String(i + 1) })));
    draw();
    const buttons = q.items.map(w => h('button', {
      class: 'choice long', textContent: w,
      onclick: (e: Event) => {
        if (answered) return;
        (e.currentTarget as HTMLButtonElement).disabled = true;
        picked.push(w);
        draw();
        if (picked.length < q.items.length) return;
        const correct = picked.every((x, i) => x === q.items[i]);
        [...slots.children].forEach((el, i) => el.classList.add(picked[i] === q.items[i] ? 'right' : 'wrong'));
        if (!correct) msg.textContent = `こたえは ${q.items.join(' → ')}`;
        void finish({ correct });
      },
    }));
    body.append(h('div', { class: 'col', style: 'gap:18px' }, slots, h('div', { class: 'choices' }, ...shuffleOrder(q.items, buttons))));
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

// ならべる問題のボタンは、正しい順のままにしない
function shuffleOrder<T>(items: string[], buttons: T[]): T[] {
  let idx: number[];
  do idx = shuffle(Math.random, items.map((_, i) => i)); while (idx.every((x, i) => x === i));
  return idx.map(i => buttons[i]);
}

function flash(correct: boolean) {
  const el = h('div', { class: 'feedback' }, ico(correct ? 'maru' : 'sweat', 220));
  document.body.append(el);
  setTimeout(() => el.remove(), 700);
}
