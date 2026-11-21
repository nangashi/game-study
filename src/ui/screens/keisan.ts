import {
  FEEDBACK_MS, FEEDBACK_MS_REDUCED, STAGES, STAGE_COUNT, TEST_LADDER,
  answerTest, clampPlayableThrough, continueTarget, continueTest, isPlayable, isValidProgress, makeSet,
  nextStageOf, nextTestQuestion, resumeTest, saveProgress, stageByNum, startTest, totalStepsClimbed, typeDigit,
  type KeisanQuestion, type KeisanStage, type NextAfterSystem, type TestOutcome, type TestResult, type TestState,
} from '../../learn/keisan';
import { finishKeisanStage, finishTest, setTestProgress, startKeisanStage, updateSettings, type ChildRecord } from '../../records';
import { REDUCED, current, now, pushFamily, updateCurrent } from '../app';
import { banner } from '../banner';
import { h, mount, svgEl } from '../dom';
import {
  BATSU_SVG, LOCK_SVG, MARU_SVG, PLAY_SVG, SOUND_OFF_SVG, SOUND_ON_SVG, avatarOf, mascotSVG, starsHTML, type Mood,
} from '../mascot';
import { ensureAudio, sndClear, sndCorrect, sndTap, sndWrong, tap } from '../sound';
import { showChildren } from './children';
import { showThemes } from './themes';

// 算数「けいさん」の画面。算数練習アプリのホーム（レベルマップ）・プレイ・結果・ちからだめしと同じ動き・表示
// （元: src/learn/keisan/__original__/sansu-renshu.html。仕様は docs/03-keisan.md）

const colorOf = (c: ChildRecord) => avatarOf(c.settings.value.avatar).color;

function fmtTime(sec: number): string {
  sec = Math.round(sec);
  if (sec < 60) return `${sec}びょう`;
  return `${Math.floor(sec / 60)}ふん ${sec % 60}びょう`;
}

// ================= レベルマップ =================

export function showKeisanMap(): void {
  const c = current();
  if (!c) return showChildren();
  sess = null;
  const k = c.keisan;
  const pt = clampPlayableThrough(k.playableThrough);
  const color = colorOf(c);

  const soundBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': 'おとの オン・オフ' });
  const drawSound = () => { soundBtn.innerHTML = current()?.settings.value.sound === false ? SOUND_OFF_SVG : SOUND_ON_SVG; };
  soundBtn.addEventListener('click', () => {
    ensureAudio();
    updateCurrent(x => updateSettings(x, { sound: !x.settings.value.sound }, now()));
    drawSound();
    if (current()?.settings.value.sound) sndTap();
  });
  drawSound();

  const target = continueTarget(pt);
  const contBtn = h('button', {
    class: 'continue-btn', type: 'button',
    onclick: () => { tap(); if (target) startStage(target); },
  },
  h('span', { class: 'play-ic', html: PLAY_SVG, 'aria-hidden': 'true' }),
  h('span', {},
    h('span', { class: 'big', textContent: target ? 'つづきから' : 'ぜんぶ クリア！' }),
    h('span', { class: 'small', textContent: target ? `レベル${target.num}：${target.name}` : 'ぜんぶ クリア！ すごい！' })));

  const testBtn = h('button', { class: 'test-btn', type: 'button', onclick: () => { tap(); openTest(); } },
    h('span', { textContent: 'ちからだめし' }),
    h('span', { class: 'done-note', textContent: k.testDone ? '（もういちど うけられる）' : '（はじめての人は こちら）' }));

  const road = h('div', { class: 'road' }, ...STAGES.map(stage => {
    const sr = k.stages[stage.id];
    const cleared = !!sr?.cleared;
    const playable = isPlayable(stage, pt, cleared);
    let right: string, note: string;
    if (cleared) { right = `<span class="sstars">${starsHTML(sr.stars)}</span>`; note = 'クリア！'; }
    else if (playable) { right = `<span class="sstars">${starsHTML(0)}</span>`; note = stage.num === pt ? 'いま ここ！' : 'あそべるよ'; }
    else { right = `<span class="lock-ic">${LOCK_SVG}</span>`; note = 'タップで チャレンジ'; }
    const b = h('button', {
      class: `stage${playable ? '' : ' future'}${stage.matome ? ' matome' : ''}`, type: 'button',
      onclick: () => {
        tap();
        if (playable) startStage(stage);
        else skipWarning(color, stage);
      },
    },
    h('span', { class: 'num', style: `background:${playable || cleared ? stage.color : 'var(--lock)'}`, textContent: String(stage.num) }),
    // カードは2行（タイトル／例題＋状態）。theme は出さない
    h('span', { class: 'smeta' },
      h('span', { class: 'sname', textContent: stage.name }), h('br'),
      h('span', { class: 'ssample', textContent: stage.sample }),
      h('span', { class: 'state-note', textContent: note })),
    );
    b.insertAdjacentHTML('beforeend', right);
    return b;
  }));

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'home-top' },
      h('button', { class: 'btn btn-ghost', type: 'button', textContent: '← もどる', onclick: () => { tap(); showThemes(); } }),
      h('div', { class: 'spacer' }),
      soundBtn),
    h('h1', { class: 'screen-title', textContent: 'けいさん' }),
    contBtn,
    testBtn,
    h('div', { class: 'road-head' },
      h('h2', { textContent: 'レベルマップ' }),
      h('p', { textContent: 'じゅん番に すすむと レベルアップ！ まとめは ふくしゅうだよ' })),
    road,
  )));
}

function skipWarning(color: string, stage: KeisanStage) {
  banner({
    color, title: 'レベルを とばす？', text: 'まえの レベルが まだ おわってないよ。とばして やってみる？',
    buttons: [
      { label: 'やってみる', kind: 'orange', onClick: () => startStage(stage) },
      { label: 'やめる', onClick: () => {} },
    ],
  });
}

// ================= プレイ画面 =================

interface Session {
  kind: 'stage' | 'test';
  stage: KeisanStage | null;
  questions: KeisanQuestion[];  // ステージ: 10問。ちからだめし: 出した問題
  idx: number;
  correct: number;
  combo: number;
  input: string;
  locked: boolean;
  startTime: number;
  results: boolean[];
  test: TestState | null;
  color: string;
  v: PlayView;
}
let sess: Session | null = null;

interface PlayView {
  root: HTMLElement; theme: HTMLElement; dots: HTMLElement; num: HTMLElement; ladder: HTMLElement;
  mascot: HTMLElement; combo: HTMLElement; paper: HTMLElement; problem: HTMLElement; answer: HTMLElement;
  note: HTMLElement; noteAns: HTMLElement; mark: HTMLElement; burst: HTMLElement;
}

function playView(): PlayView {
  const v = {
    theme: h('div', { class: 'play-theme' }),
    dots: h('div', { class: 'prog-dots' }),
    num: h('div', { class: 'prog-num' }),
    ladder: h('div', { class: 'test-ladder', style: 'display:none' }),
    mascot: h('div', { class: 'mascot-box' }),
    combo: h('div', { class: 'combo-badge' }),
    paper: h('div', { class: 'paper-note', textContent: 'かみ に かいても いいよ', style: 'display:none' }),
    problem: h('div', { class: 'problem-text' }),
    answer: h('div', { class: 'answer-box' }),
    noteAns: h('b'),
    mark: h('div', { class: 'mark-overlay' }),
    burst: h('div', { class: 'burst' }),
  };
  const note = h('div', { class: 'correct-note' }, 'こたえは ', v.noteAns);
  const key = (k: string, label: string, cls = 'key') => {
    const b = h('button', { class: cls, type: 'button', textContent: label });
    b.addEventListener('pointerdown', e => { e.preventDefault(); pressKey(k); });
    return b;
  };
  const keypad = h('div', { class: 'keypad' },
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map(d => key(d, d)),
    key('del', 'けす', 'key fn'), key('0', '0'), key('clear', '全部けす', 'key fn'),
    key('ok', 'けってい', 'key-ok'));
  const root = h('section', { class: 'play-screen' },
    h('div', { class: 'play-top' },
      h('button', { class: 'quit-btn', type: 'button', textContent: 'やめる', onclick: () => { sess = null; showKeisanMap(); } }),
      v.theme,
      h('div', { style: 'width:64px;flex:none' })),
    h('div', { class: 'prog' }, v.dots, v.num),
    v.ladder,
    h('div', { class: 'stage-area' },
      h('div', { class: 'problem-card' },
        h('div', { class: 'mascot-row' }, v.mascot, v.combo),
        v.paper, v.problem,
        h('div', { class: 'answer-row' }, h('span', { class: 'eq', textContent: '＝' }), v.answer),
        note, v.mark, v.burst)),
    keypad);
  return { ...v, note, root };
}

const setMascot = (s: Session, mood: Mood) => { s.v.mascot.innerHTML = mascotSVG(s.color, mood); };
const currentQ = (s: Session) => s.questions[s.idx];
const PLACEHOLDER = '<span class="placeholder">？</span>';

function newSession(kind: Session['kind'], c: ChildRecord): Session {
  return {
    kind, stage: null, questions: [], idx: 0, correct: 0, combo: 0, input: '', locked: false,
    startTime: 0, results: [], test: null, color: colorOf(c), v: playView(),
  };
}

function renderQuestion(s: Session) {
  s.input = ''; s.locked = false;
  s.v.mark.classList.remove('show');
  s.v.note.classList.remove('show');
  s.v.answer.classList.remove('shake', 'good');
  s.v.answer.innerHTML = PLACEHOLDER;
  s.v.problem.textContent = currentQ(s).text;
  const pst = s.kind === 'stage' ? s.stage : stageByNum(s.test?.stageNum || 1);
  s.v.paper.style.display = pst?.paper ? 'block' : 'none';
  setMascot(s, 'normal');
  updateCombo(s);
  updateProgress(s);
  updateLadder(s);
}

function updateProgress(s: Session) {
  if (s.kind === 'test') {
    s.v.num.textContent = `ちからだめし ${(s.test?.asked ?? 0) + 1}問目`;
    s.v.dots.replaceChildren(h('i', { class: 'now', style: 'flex:1' }));
    return;
  }
  const total = s.questions.length;
  s.v.num.textContent = `${Math.min(s.idx + 1, total)}/${total}`;
  s.v.dots.replaceChildren(...s.questions.map((_, i) =>
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

function updateLadder(s: Session) {
  const t = s.test;
  if (s.kind !== 'test' || !t) { s.v.ladder.style.display = 'none'; return; }
  s.v.ladder.style.display = 'flex';
  const g = TEST_LADDER[t.ladderSys];
  const dots = g.steps.map((_, i) =>
    `<i class="${i <= t.lastPassedIdx ? 'done' : i === t.stepIdx && t.phase === 'measure' ? 'now' : ''}"></i>`).join('');
  s.v.ladder.innerHTML = `<span class="tl-name">${g.name}</span><span class="tl-dots">${dots}</span>` +
    `<span class="tl-count">${totalStepsClimbed(t.able)}だん のぼった</span>`;
}

function pressKey(k: string) {
  const s = sess;
  if (!s || s.locked) return;
  ensureAudio();
  if (k === 'del') { s.input = s.input.slice(0, -1); sndTap(); }
  else if (k === 'clear') { s.input = ''; sndTap(); }
  else if (k === 'ok') { submitAnswer(s); return; }
  else {
    const next = typeDigit(s.input, k);
    if (next === s.input) return; // 4けたをこえる
    s.input = next; sndTap();
  }
  s.v.answer.innerHTML = s.input === '' ? PLACEHOLDER : s.input;
}

function showMark(s: Session, ok: boolean) {
  s.v.mark.innerHTML = ok ? MARU_SVG : BATSU_SVG;
  s.v.mark.classList.add('show');
}

// 紙吹雪（見た目だけなので Math.random のまま）
function burst(s: Session) {
  if (REDUCED) return;
  const box = s.v.burst;
  box.replaceChildren();
  const colors = ['#2a9d8f', '#ffb703', '#ef476f', '#4a90d9', '#9b5de5', '#fb8500'];
  const n = s.combo >= 5 ? 26 : s.combo >= 3 ? 18 : 12;
  for (let i = 0; i < n; i++) {
    const el = h('i', { style: `background:${colors[Math.floor(Math.random() * colors.length)]}` });
    if (Math.random() < 0.4) el.style.borderRadius = '50%';
    box.append(el);
    const ang = Math.random() * Math.PI * 2, dist = 60 + Math.random() * 110;
    const dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 30;
    el.animate?.([
      { transform: 'translate(0,0) rotate(0deg)', opacity: 1 },
      { transform: `translate(${dx}px,${dy + 70}px) rotate(${Math.random() * 360 - 180}deg)`, opacity: 0 },
    ], { duration: 480 + Math.random() * 220, easing: 'cubic-bezier(.17,.67,.35,1)' });
  }
  setTimeout(() => box.replaceChildren(), 800);
}

function submitAnswer(s: Session) {
  if (s.input === '') return;
  s.locked = true;
  const q = currentQ(s);
  const ok = parseInt(s.input, 10) === q.answer;
  const wait = REDUCED ? FEEDBACK_MS_REDUCED : FEEDBACK_MS;
  if (ok) {
    s.correct++; s.combo++;
    s.results.push(true);
    s.v.answer.classList.add('good');
    showMark(s, true);
    setMascot(s, 'happy');
    burst(s);
    sndCorrect(s.combo);
  } else {
    s.combo = 0;
    s.results.push(false);
    if (s.kind === 'test') {
      // ちからだめし中はシェイク・大きな×・失敗の演出を出さない（答えの表示だけ残す）
      setMascot(s, 'normal');
    } else {
      s.v.answer.classList.add('shake');
      showMark(s, false);
      setMascot(s, 'sad');
    }
    s.v.noteAns.textContent = String(q.answer);
    s.v.note.classList.add('show');
    sndWrong();
  }
  updateCombo(s); updateProgress(s);
  setTimeout(() => { if (sess === s) nextQuestion(s, ok); }, ok ? wait.correct : wait.wrong);
}

function nextQuestion(s: Session, ok: boolean) {
  if (s.kind === 'test') return testAfterAnswer(s, ok);
  s.idx++;
  if (s.idx >= s.questions.length) return finishStage(s);
  renderQuestion(s);
}

// ---------- ステージ ----------

function startStage(stage: KeisanStage) {
  const c = current();
  if (!c) return showChildren();
  const s = newSession('stage', c);
  s.stage = stage;
  s.questions = makeSet(stage.gen, Math.random);
  s.startTime = Date.now();
  updateCurrent(x => startKeisanStage(x, stage, now()));
  s.v.theme.textContent = `レベル${stage.num}：${stage.name}`;
  sess = s;
  mount(s.v.root);
  renderQuestion(s);
}

function finishStage(s: Session) {
  const stage = s.stage!;
  const c = current();
  if (!c) return showChildren();
  const elapsed = (Date.now() - s.startTime) / 1000;
  const correct = s.correct;
  const r = finishKeisanStage(c, stage, correct, elapsed, now());
  updateCurrent(() => r.child);
  pushFamily();
  sess = null;
  const { cleared, stars, faster } = r;

  const msgs: Record<number, string> = { 10: '全問 せいかい！ すごい！', 9: 'あと 1問！ よく がんばった！', 8: 'クリア！ 次へ すすめるよ' };
  const starBox = h('div', { class: 'result-stars', html: starsHTML(stars) });
  const nx = nextStageOf(stage);
  const k = r.child.keisan;
  const showNext = cleared && nx && isPlayable(nx, k.playableThrough, !!k.stages[nx.id]?.cleared);

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'card result-card' },
      svgEl(mascotSVG(s.color, cleared ? 'proud' : 'normal'), 'result-mascot'),
      h('h2', { textContent: cleared ? 'クリア！' : 'おしい！' }),
      starBox,
      h('div', { class: 'result-msg', textContent: cleared ? (msgs[correct] ?? '') : '' }),
      h('div', { class: 'fail-note', textContent: cleared ? '' : '8問 せいかいで クリア。もういちど チャレンジしよう！' }),
      h('div', { class: 'result-info' },
        h('div', { class: 'info-chip' }, h('small', { textContent: 'せいかい' }), h('span', { textContent: `${correct} / 10 問` })),
        h('div', { class: 'info-chip' }, h('small', { textContent: 'かかった じかん' }), h('span', { textContent: fmtTime(elapsed) }),
          h('span', { class: 'faster', textContent: faster ? '　まえより はやい！' : '' }))),
      h('div', { class: 'result-btns' },
        showNext && nx ? h('button', { class: 'btn btn-orange', type: 'button', textContent: `つぎの ステージへ：${nx.name}`, onclick: () => { tap(); startStage(nx); } }) : null,
        h('button', { class: 'btn btn-teal', type: 'button', textContent: 'もういちど', onclick: () => { tap(); startStage(stage); } }),
        h('button', { class: 'btn', type: 'button', textContent: 'マップへ もどる', onclick: () => { tap(); showKeisanMap(); } }))),
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

// ---------- ちからだめし ----------

function openTest() {
  const c = current();
  if (!c) return showChildren();
  let tp = c.keisan.testProgress.value;
  if (tp && !isValidProgress(tp)) { updateCurrent(x => setTestProgress(x, null, now())); tp = null; }
  if (tp) {
    const saved = tp;
    banner({
      color: colorOf(c), title: 'ちからだめしの つづき', text: 'まえの つづきが あるよ。どうする？',
      buttons: [
        { label: 'つづきから', kind: 'orange', onClick: () => beginTest(resumeTest(saved), false) },
        { label: 'はじめから', onClick: freshTest },
      ],
    });
    return;
  }
  freshTest();
}

function freshTest() {
  if (current()?.keisan.testProgress.value) updateCurrent(x => setTestProgress(x, null, now()));
  beginTest(startTest(), true);
}

function beginTest(state: TestState, isFirst: boolean) {
  const c = current();
  if (!c) return showChildren();
  const s = newSession('test', c);
  s.test = state;
  sess = s;
  systemBanner(s, isFirst, () => { mount(s.v.root); testAsk(s); });
}

// 系統のはじめのバナー
function systemBanner(s: Session, isFirst: boolean, onOk: () => void) {
  const g = TEST_LADDER[s.test!.ladderSys];
  banner({
    color: s.color,
    title: isFirst ? 'ちからだめし' : `つぎは ${g.name}`,
    text: isFirst ? `さいしょは ${g.name}。やさしいのから いくよ。まちがえても だいじょうぶ！` : `${g.name}だよ。やさしいのから いくよ。`,
    buttons: [{ label: 'すすむ', kind: 'orange', onClick: () => { if (sess === s) onOk(); } }],
  });
}

function testAsk(s: Session) {
  const r = nextTestQuestion(s.test!, Math.random);
  s.test = r.state;
  s.questions.push(r.question);
  s.idx = s.questions.length - 1;
  s.v.theme.textContent = `ちからだめし：${stageByNum(s.test.stageNum || 1).name}`;
  renderQuestion(s);
}

function testAfterAnswer(s: Session, ok: boolean) {
  const r = answerTest(s.test!, ok);
  s.test = r.state;
  handleOutcome(s, r.outcome);
}

function handleOutcome(s: Session, o: TestOutcome) {
  if (o.type === 'question') {
    testAsk(s);
    return;
  }
  if (o.type === 'end') return endTest(s, o.result);
  const name = TEST_LADDER[o.sys].name;
  const next = o.next;
  banner({
    color: s.color,
    title: o.climbed > 0 ? 'ここまで登れた！' : 'ここは これから',
    text: o.climbed > 0 ? `${name}は ${o.climbed}だん のぼれたよ！` : `${name}は これから れんしゅうしよう。`,
    buttons: [{ label: 'すすむ', kind: 'orange', onClick: () => { if (sess === s) afterSystem(s, next); } }],
  });
}

// 系統の切れ目: ひと休み（つづける／ここまでにする）か、おわり
function afterSystem(s: Session, next: NextAfterSystem) {
  if (next.type === 'end') return endTest(s, next.result);
  banner({
    color: s.color, mood: 'happy', title: 'ひと休み', text: `つぎは ${TEST_LADDER[next.nextSys].name}だよ。ひと休み しよう。`,
    buttons: [
      {
        label: 'つづける', kind: 'orange',
        onClick: () => { s.test = continueTest(s.test!, next.nextSys); systemBanner(s, false, () => testAsk(s)); },
      },
      {
        label: 'ここまでにする',
        onClick: () => {
          const tp = saveProgress(s.test!, next.nextSys);
          updateCurrent(x => setTestProgress(x, tp, now()));
          sess = null;
          showKeisanMap();
        },
      },
    ],
  });
}

function endTest(s: Session, result: TestResult) {
  updateCurrent(x => finishTest(x, result, now()));
  pushFamily();
  sess = null;
  banner({
    color: s.color, title: 'すごい！', text: `ぜんぶで ${result.total}だん のぼれたね！`,
    buttons: [{ label: 'すすむ', kind: 'orange', onClick: () => { showTestResult(s.color, result); sndClear(); } }],
  });
}

function showTestResult(color: string, result: TestResult) {
  const S = Math.max(1, Math.min(STAGE_COUNT + 1, result.start));
  const item = S > STAGE_COUNT
    ? h('div', { class: 'card test-result-item' },
      h('span', { class: 'tdot', style: 'background:#2a9d8f' }),
      h('span', { class: 'tname', textContent: 'ぜんぶ できそう！' }),
      h('span', { class: 'tstart', textContent: 'レベル47から あそべるよ' }))
    : h('div', { class: 'card test-result-item' },
      h('span', { class: 'tdot', style: `background:${stageByNum(S).color}` }),
      h('span', { class: 'tname', textContent: `レベル${S}` }),
      h('span', { class: 'tstart', textContent: stageByNum(S).name }));
  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'card result-card' },
      svgEl(mascotSVG(color, 'proud'), 'result-mascot'),
      h('h2', { textContent: 'ここから スタート！' }),
      h('div', { class: 'result-msg', style: 'color:var(--orange-dark)', textContent: `ぜんぶで ${result.total}だん のぼれたね！` }),
      h('div', { class: 'result-msg', textContent: 'じぶんに あった ステージから はじめよう' }),
      h('div', { class: 'test-result-list', style: 'text-align:left' }, item),
      h('div', { class: 'result-btns' },
        h('button', { class: 'btn btn-orange', type: 'button', textContent: 'マップへ いく', onclick: () => { tap(); showKeisanMap(); } }))),
  )));
}
