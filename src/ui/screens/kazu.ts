import { FEEDBACK_MS, FEEDBACK_MS_REDUCED } from '../../learn/keisan';
import {
  KAZU_UNITS, answerPieces, checkFields, judgeScore, makeKazuSet, typeKey,
  type ChoiceQuestion, type InputQuestion, type KazuQuestion, type KazuUnit, type Piece, type Slot,
} from '../../learn/kazu';
import { recordUnitResult, type ChildRecord } from '../../records';
import { REDUCED, current, pushFamily, updateCurrent } from '../app';
import { banner } from '../banner';
import { h, mount, svgEl } from '../dom';
import { figSVG } from '../kazu-figs';
import { BATSU_SVG, LOCK_SVG, MARU_SVG, avatarOf, mascotSVG, starsHTML, type Mood } from '../mascot';
import { ensureAudio, sndClear, sndCorrect, sndTap, sndWrong, tap } from '../sound';
import { burst } from '../widgets/burst';
import { showChildren } from './children';
import { showThemes } from './themes';

// 算数「かず」の道・問題・結果。問題の形式は「かず 問題形式モック」（Space）のまま。仕様は docs/05-kazu.md
// 正誤の出し方・待ち時間・星は けいさんと同じ。記録は星とクリアだけ（時間は残さない）

const KAZU_COLOR = '#0891b2'; // さんすうの色
const colorOf = (c: ChildRecord) => avatarOf(c.settings.value.avatar).color;

// 「いま ここ」: まだクリアしていない最初の単元。そこまでは警告なしで選べる
const nowUnit = (c: ChildRecord) => KAZU_UNITS.find(u => !c.units[u.id]?.cleared) ?? null;
const isOpen = (c: ChildRecord, u: KazuUnit) => {
  const n = nowUnit(c);
  return !n || u.num <= n.num || !!c.units[u.id]?.cleared;
};

// ================= 道 =================

export function showKazuMap(): void {
  const c = current();
  if (!c) return showChildren();
  sess = null;
  const target = nowUnit(c);

  const road = h('div', { class: 'road' }, ...KAZU_UNITS.map(u => {
    const p = c.units[u.id];
    const cleared = !!p?.cleared;
    const open = isOpen(c, u);
    const right = open ? `<span class="sstars">${starsHTML(p?.stars ?? 0)}</span>` : `<span class="lock-ic">${LOCK_SVG}</span>`;
    const note = cleared ? 'クリア！' : open ? (u === target ? 'いま ここ！' : 'あそべるよ') : 'タップで チャレンジ';
    const b = h('button', {
      class: `stage${open ? '' : ' future'}`, type: 'button',
      onclick: () => {
        tap();
        if (open) startKazu(u);
        else skipWarning(colorOf(c), u);
      },
    },
    h('span', { class: 'num', style: `background:${open ? KAZU_COLOR : 'var(--lock)'}`, textContent: String(u.num) }),
    h('span', { class: 'smeta' },
      h('span', { class: 'sname', textContent: u.name }), h('br'),
      h('span', { class: 'ssample', textContent: u.sample }), h('br'),
      h('span', { class: 'state-note', textContent: note })));
    b.insertAdjacentHTML('beforeend', right);
    return b;
  }));

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('button', { class: 'btn btn-ghost', type: 'button', textContent: '← テーマを えらぶ', onclick: () => { tap(); showThemes(); } }),
    h('div', { class: 'road-head' },
      h('h2', { textContent: 'かずの 道' }),
      h('p', { textContent: '1もん ずつ、かずの しくみを たしかめよう' })),
    road,
  )));
}

function skipWarning(color: string, u: KazuUnit) {
  banner({
    color, title: 'さきに すすむ？', text: 'まえの ところが まだ おわってないよ。とばして やってみる？',
    buttons: [
      { label: 'やってみる', kind: 'orange', onClick: () => startKazu(u) },
      { label: 'やめる', onClick: () => {} },
    ],
  });
}

// ================= 問題 =================

interface Session {
  unit: KazuUnit;
  qs: KazuQuestion[];
  idx: number;
  correct: number;
  combo: number;
  results: boolean[];
  locked: boolean;
  color: string;
  inputs: string[];               // 欄ごとの入力
  fields: HTMLButtonElement[];    // 欄（番号順）
  choices: HTMLButtonElement[];
  active: number;                 // キーパッドで入力中の欄（-1 は とじている）
  v: View;
}
let sess: Session | null = null;

interface View {
  root: HTMLElement; dots: HTMLElement; num: HTMLElement; mascot: HTMLElement; combo: HTMLElement;
  body: HTMLElement; note: HTMLElement; noteAns: HTMLElement; mark: HTMLElement; burst: HTMLElement;
  pad: HTMLElement; dotKey: HTMLButtonElement; area: HTMLElement;
}

function view(unit: KazuUnit): View {
  const v = {
    dots: h('div', { class: 'prog-dots' }),
    num: h('div', { class: 'prog-num' }),
    mascot: h('div', { class: 'mascot-box' }),
    combo: h('div', { class: 'combo-badge' }),
    body: h('div', { class: 'kz-body' }),
    noteAns: h('span', { class: 'kz-note-ans' }),
    mark: h('div', { class: 'mark-overlay' }),
    burst: h('div', { class: 'burst' }),
  };
  const note = h('div', { class: 'correct-note' }, 'こたえは ', v.noteAns);
  const key = (k: string, label: string, cls = 'key') => {
    const b = h('button', { class: cls, type: 'button', textContent: label });
    b.addEventListener('pointerdown', e => { e.preventDefault(); pressKey(k); });
    return b;
  };
  const dotKey = key('.', '.', 'key kz-dot');
  // キーパッドは 欄をタップしたときだけ出す（モックのまま）
  const pad = h('div', { class: 'kz-pad', hidden: true },
    h('div', { class: 'kz-pad-head' },
      h('span', { class: 'kz-pad-title', textContent: 'すうじ' }),
      h('button', { class: 'kz-pad-close', type: 'button', textContent: 'とじる ×', onclick: () => closePad() })),
    h('div', { class: 'keypad' },
      ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => key(d, d)),
      dotKey, key('0', '0'), key('del', 'けす', 'key fn'),
      key('ok', 'けってい', 'key-ok')));
  const area = h('div', { class: 'stage-area kz-area' },
    h('div', { class: 'problem-card kz-card' },
      h('div', { class: 'mascot-row' }, v.mascot, v.combo),
      v.body, note, v.mark, v.burst));
  const root = h('section', { class: 'play-screen kz-screen' },
    h('div', { class: 'play-top' },
      h('button', { class: 'quit-btn', type: 'button', textContent: 'やめる', onclick: () => { sess = null; showKazuMap(); } }),
      h('div', { class: 'play-theme', textContent: unit.name }),
      h('div', { style: 'width:64px;flex:none' })),
    h('div', { class: 'prog' }, v.dots, v.num),
    area, pad);
  return { ...v, note, pad, dotKey, area, root };
}

const setMascot = (s: Session, mood: Mood) => { s.v.mascot.innerHTML = mascotSVG(s.color, mood); };

function startKazu(unit: KazuUnit) {
  const c = current();
  if (!c) return showChildren();
  const s: Session = {
    unit, qs: makeKazuSet(unit, Math.random), idx: 0, correct: 0, combo: 0, results: [], locked: false,
    color: colorOf(c), inputs: [], fields: [], choices: [], active: -1, v: view(unit),
  };
  sess = s;
  mount(s.v.root);
  renderQuestion(s);
}

// 部品を要素にする
function pieceEl(s: Session, p: Piece): Node {
  switch (p.t) {
    case 'text': return h('span', { class: 'kz-t', textContent: p.s });
    case 'field': return fieldEl(s, p.i);
    case 'frac': {
      const slot = (x: Slot) => (typeof x === 'number' ? h('span', { textContent: String(x) }) : fieldEl(s, x.field));
      return h('span', { class: 'kz-frac' }, h('span', { class: 'kz-fnum' }, slot(p.num)), h('span', { class: 'kz-fden' }, slot(p.den)));
    }
    case 'fig': return svgEl(figSVG(p.fig, false), 'kz-ofig');
  }
}

function fieldEl(s: Session, i: number): HTMLButtonElement {
  const b = h('button', {
    class: 'kz-field', type: 'button', 'aria-label': 'こたえを いれる ところ',
    onclick: () => { if (sess === s && !s.locked) { ensureAudio(); sndTap(); activate(s, i); } },
  });
  s.fields[i] = b;
  return b;
}

function renderQuestion(s: Session) {
  const q = s.qs[s.idx];
  s.locked = false;
  s.fields = []; s.choices = [];
  s.inputs = q.mode === 'input' ? q.answers.map(() => '') : [];
  closePad();
  s.v.mark.classList.remove('show');
  s.v.note.classList.remove('show');
  s.v.dotKey.style.visibility = q.mode === 'input' && q.decimal ? 'visible' : 'hidden';
  setMascot(s, 'normal');

  const parts: Node[] = [];
  if (q.fig) parts.push(svgEl(figSVG(q.fig, true), `kz-fig kz-fig-${q.fig.kind}`));
  parts.push(h('div', { class: 'kz-line' }, ...q.text.map(p => pieceEl(s, p))));
  if (q.note) parts.push(h('div', { class: 'kz-small', textContent: q.note }));
  if (q.mode === 'choice') {
    s.choices = q.options.map((o, i) => h('button', {
      class: `kz-choice${q.words ? ' words' : ''}${o.t === 'fig' ? ' figure' : ''}`, type: 'button',
      onclick: () => choose(s, q, i),
    }, pieceEl(s, o)));
    parts.push(h('div', { class: 'kz-choices' }, ...s.choices));
  }
  s.v.body.replaceChildren(...parts);
  drawFields(s);
  updateCombo(s);
  updateProgress(s);
  s.v.area.scrollTop = 0;
}

function drawFields(s: Session) {
  s.fields.forEach((f, i) => {
    f.textContent = s.inputs[i] ?? '';
    f.classList.toggle('active', i === s.active);
  });
}

function updateProgress(s: Session) {
  const total = s.qs.length;
  s.v.num.textContent = `${Math.min(s.idx + 1, total)}/${total}`;
  s.v.dots.replaceChildren(...s.qs.map((_, i) =>
    h('i', { class: i < s.results.length ? (s.results[i] ? 'done-ok' : 'done-ng') : i === s.idx ? 'now' : '' })));
}

function updateCombo(s: Session) {
  const b = s.v.combo;
  if (s.combo >= 2) {
    b.textContent = `コンボ ×${s.combo}`;
    b.classList.add('show');
    b.classList.toggle('hot', s.combo >= 5);
  } else b.classList.remove('show', 'hot');
}

// ---------- キーパッド ----------

function activate(s: Session, i: number) {
  s.active = i;
  s.v.pad.hidden = false;
  drawFields(s);
  // 欄がキーパッドの下にかくれないように
  s.fields[i]?.scrollIntoView?.({ block: 'nearest' });
}

function closePad() {
  const s = sess;
  if (!s) return;
  s.active = -1;
  s.v.pad.hidden = true;
  drawFields(s);
}

function pressKey(k: string) {
  const s = sess;
  if (!s || s.locked || s.active < 0) return;
  const q = s.qs[s.idx];
  if (q.mode !== 'input') return;
  ensureAudio();
  const i = s.active;
  if (k === 'ok') return decide(s, q);
  if (k === 'del') s.inputs[i] = s.inputs[i].slice(0, -1);
  else {
    const next = typeKey(s.inputs[i], k, q.decimal);
    if (next === s.inputs[i]) return;
    s.inputs[i] = next;
  }
  sndTap();
  drawFields(s);
}

// けってい: 空の欄があれば そこへ動く。全部うまったら判定して、キーパッドを とじる
function decide(s: Session, q: InputQuestion) {
  if (s.inputs[s.active] === '') return;
  const empty = s.inputs.findIndex(v => v === '');
  if (empty >= 0) { sndTap(); activate(s, empty); return; }
  closePad();
  const each = checkFields(q, s.inputs);
  const ok = each.every(Boolean);
  s.fields.forEach((f, i) => f.classList.add(each[i] ? 'good' : 'bad'));
  if (!ok) {
    s.v.noteAns.replaceChildren(...answerPieces(q).map(p => pieceEl(s, p)));
    s.v.note.classList.add('show');
  }
  afterAnswer(s, ok);
}

// ---------- タップ選択 ----------

function choose(s: Session, q: ChoiceQuestion, i: number) {
  if (sess !== s || s.locked) return;
  ensureAudio();
  const ok = i === q.answer;
  s.choices.forEach((b, j) => {
    if (j === q.answer) b.classList.add('good');
    else if (j === i) b.classList.add('bad');
    else b.classList.add('dim');
  });
  afterAnswer(s, ok);
}

// ---------- 正誤（けいさんと同じ出し方・待ち時間） ----------

function afterAnswer(s: Session, ok: boolean) {
  s.locked = true;
  const wait = REDUCED ? FEEDBACK_MS_REDUCED : FEEDBACK_MS;
  s.results.push(ok);
  s.v.mark.innerHTML = ok ? MARU_SVG : BATSU_SVG;
  s.v.mark.classList.add('show');
  if (ok) {
    s.correct++; s.combo++;
    setMascot(s, 'happy');
    burst(s.v.burst, s.combo);
    sndCorrect(s.combo);
  } else {
    s.combo = 0;
    setMascot(s, 'sad');
    sndWrong();
  }
  updateCombo(s); updateProgress(s);
  setTimeout(() => {
    if (sess !== s) return;
    s.idx++;
    if (s.idx >= s.qs.length) finishKazu(s);
    else renderQuestion(s);
  }, ok ? wait.correct : wait.wrong);
}

// ================= 結果 =================

function finishKazu(s: Session) {
  const u = s.unit;
  const correct = s.correct;
  const { cleared, stars } = judgeScore(correct);
  updateCurrent(c => recordUnitResult(c, u.id, stars, cleared));
  pushFamily();
  sess = null;
  const next = KAZU_UNITS[u.num] ?? null; // num は 1〜。つぎの単元
  const msgs: Record<number, string> = { 10: '全問 せいかい！ すごい！', 9: 'あと 1問！ よく がんばった！', 8: 'クリア！ 次へ すすめるよ' };
  const starBox = h('div', { class: 'result-stars', html: starsHTML(stars) });

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'card result-card' },
      svgEl(mascotSVG(s.color, cleared ? 'proud' : 'normal'), 'result-mascot'),
      h('h2', { textContent: cleared ? 'クリア！' : 'おしい！' }),
      starBox,
      h('div', { class: 'result-msg', textContent: cleared ? (msgs[correct] ?? '') : '' }),
      h('div', { class: 'fail-note', textContent: cleared ? '' : '8問 せいかいで クリア。もういちど チャレンジしよう！' }),
      h('div', { class: 'result-info' },
        h('div', { class: 'info-chip' }, h('small', { textContent: 'せいかい' }), h('span', { textContent: `${correct} / 10 問` }))),
      h('div', { class: 'result-btns' },
        cleared && next ? h('button', { class: 'btn btn-orange', type: 'button', textContent: `つぎへ：${next.name}`, onclick: () => { tap(); startKazu(next); } }) : null,
        h('button', { class: 'btn btn-teal', type: 'button', textContent: 'もういちど', onclick: () => { tap(); startKazu(u); } }),
        h('button', { class: 'btn', type: 'button', textContent: 'みちへ もどる', onclick: () => { tap(); showKazuMap(); } }))),
  )));
  if (cleared) {
    sndClear();
    if (!REDUCED) {
      starBox.querySelectorAll<SVGElement>('.star-ic').forEach((el, i) => {
        if (i < stars) { el.classList.add('earn'); el.style.animationDelay = `${i * 0.18}s`; }
      });
    }
  }
}
