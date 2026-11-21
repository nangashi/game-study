import { HIRA_UNITS, hiraItems, judgeHira, type HiraUnit, type HiraWriteResult } from '../../learn/hiragana';
import { loadStrokes } from '../../learn/handwriting/strokes';
import { recordUnitResult, type ChildRecord } from '../../records';
import { REDUCED, current, pushFamily, updateCurrent } from '../app';
import { banner } from '../banner';
import { h, mount, svgEl, wait } from '../dom';
import { LOCK_SVG, MARU_SVG, avatarOf, mascotSVG, starsHTML } from '../mascot';
import { sndClear, sndCorrect, tap } from '../sound';
import { writepad } from '../widgets/writepad';
import { showChildren } from './children';
import { showThemes } from './themes';

// 国語「ひらがなを かく」の道・書き取り・結果。結果は星とクリアだけ（時間は競わない）

const HIRA_COLOR = '#e11d48'; // こくごの色（style.css の --kokugo）
const colorOf = (c: ChildRecord) => avatarOf(c.settings.value.avatar).color;

// 「いま ここ」: まだクリアしていない最初の単元（ぜんぶクリアなら null）。そこまでは警告なしで書ける
const nowUnit = (c: ChildRecord) => HIRA_UNITS.find(u => !c.units[u.id]?.cleared) ?? null;
const isOpen = (c: ChildRecord, u: HiraUnit) => {
  const n = nowUnit(c);
  return !n || u.num <= n.num || !!c.units[u.id]?.cleared;
};

// ================= 道 =================

export function showHiraMap(): void {
  const c = current();
  if (!c) return showChildren();
  const target = nowUnit(c);

  const road = h('div', { class: 'road' }, ...HIRA_UNITS.map(u => {
    const p = c.units[u.id];
    const cleared = !!p?.cleared;
    const open = isOpen(c, u);
    const right = cleared || open ? `<span class="sstars">${starsHTML(p?.stars ?? 0)}</span>` : `<span class="lock-ic">${LOCK_SVG}</span>`;
    const note = cleared ? 'クリア！' : open ? (u === target ? 'いま ここ！' : 'あそべるよ') : 'タップで チャレンジ';
    const b = h('button', {
      class: `stage${open ? '' : ' future'}`, type: 'button',
      onclick: () => {
        tap();
        if (open) startHira(u);
        else skipWarning(colorOf(c), u);
      },
    },
    h('span', { class: 'num', style: `background:${open ? HIRA_COLOR : 'var(--lock)'}`, textContent: String(u.num) }),
    h('span', { class: 'smeta' },
      h('span', { class: 'sname', textContent: u.name }), h('br'),
      h('span', { class: 'ssample', textContent: [...u.chars].join(' ') }), h('br'),
      h('span', { class: 'state-note', textContent: note })));
    b.insertAdjacentHTML('beforeend', right);
    return b;
  }));

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('button', { class: 'btn btn-ghost', type: 'button', textContent: '← テーマを えらぶ', onclick: () => { tap(); showThemes(); } }),
    h('div', { class: 'road-head' },
      h('h2', { textContent: 'ひらがな・カタカナの 道' }),
      h('p', { textContent: 'おてほんを みて、ゆびで かいてみよう' })),
    road,
  )));
}

function skipWarning(color: string, u: HiraUnit) {
  banner({
    color, title: 'さきに すすむ？', text: 'まえの ところが まだ おわってないよ。とばして やってみる？',
    buttons: [
      { label: 'やってみる', kind: 'orange', onClick: () => startHira(u) },
      { label: 'やめる', onClick: () => {} },
    ],
  });
}

// ================= 書き取り =================

let token = 0; // やめたあとに、待っていた処理が動かないように

function startHira(u: HiraUnit) {
  const c = current();
  if (!c) return showChildren();
  const my = ++token;
  const items = hiraItems(u);
  const results: HiraWriteResult[] = [];
  const color = colorOf(c);
  const tolerance = c.settings.value.tolerance;

  const dots = h('div', { class: 'prog-dots' });
  const num = h('div', { class: 'prog-num' });
  const mascot = h('div', { class: 'mascot-box' });
  const guideNote = h('div', { class: 'write-guide' });
  const msg = h('div', { class: 'write-msg' });
  const mark = h('div', { class: 'mark-overlay' });
  const padBox = h('div', { class: 'pad-box' });
  const sideBox = h('div', { class: 'model-box' });

  mount(h('section', { class: 'play-screen write-screen' },
    h('div', { class: 'play-top' },
      h('button', { class: 'quit-btn', type: 'button', textContent: 'やめる', onclick: () => { token++; showHiraMap(); } }),
      h('div', { class: 'play-theme', textContent: u.name }),
      h('div', { style: 'width:64px;flex:none' })),
    h('div', { class: 'prog' }, dots, num),
    h('div', { class: 'stage-area' },
      h('div', { class: 'problem-card write-card' },
        h('div', { class: 'mascot-row' }, mascot, guideNote, sideBox),
        msg, padBox, mark)),
  ));

  const progress = (i: number) => {
    num.textContent = `${Math.min(i + 1, items.length)}/${items.length}`;
    dots.replaceChildren(...items.map((_, j) =>
      h('i', { class: j < results.length ? (results[j].helped ? 'done-help' : 'done-ok') : j === i ? 'now' : '' })));
  };

  const show = async (i: number) => {
    if (my !== token) return;
    if (i >= items.length) return finishHira(u, results, color);
    const it = items[i];
    progress(i);
    mark.classList.remove('show');
    mascot.innerHTML = mascotSVG(color, 'normal');
    guideNote.textContent = it.guide === 'trace' ? 'うすい じを なぞろう' : 'おてほんを みて かこう';
    msg.textContent = '';
    padBox.replaceChildren(h('div', { class: 'write-msg', textContent: '…' }));
    sideBox.replaceChildren();
    const all = await loadStrokes();
    if (my !== token) return;
    const wp = writepad({
      strokes: all[it.char], guide: it.guide, char: it.char, tolerance,
      onMessage: t => { msg.textContent = t; },
      onDone: async r => {
        results.push({ helped: r.helped });
        progress(i);
        mascot.innerHTML = mascotSVG(color, 'happy');
        mark.innerHTML = MARU_SVG;
        mark.classList.add('show');
        sndCorrect(0);
        await wait(REDUCED ? 400 : 900);
        void show(i + 1);
      },
    });
    padBox.replaceChildren(wp.pad);
    sideBox.replaceChildren(wp.side);
  };
  void show(0);
}

function finishHira(u: HiraUnit, results: HiraWriteResult[], color: string) {
  const r = judgeHira(results);
  updateCurrent(c => recordUnitResult(c, u.id, r.stars, r.cleared));
  pushFamily();
  const next = HIRA_UNITS[u.num] ?? null; // num は 1〜。つぎの単元
  const starBox = h('div', { class: 'result-stars', html: starsHTML(r.stars) });
  const msgs: Record<number, string> = { 3: 'ぜんぶ じぶんで かけた！ すごい！', 2: 'あと すこし！ よく がんばった！', 1: 'クリア！ つぎへ すすめるよ' };

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'card result-card' },
      svgEl(mascotSVG(color, r.cleared ? 'proud' : 'normal'), 'result-mascot'),
      h('h2', { textContent: r.cleared ? 'クリア！' : 'おしい！' }),
      starBox,
      h('div', { class: 'result-msg', textContent: r.cleared ? (msgs[r.stars] ?? '') : '' }),
      h('div', { class: 'fail-note', textContent: r.cleared ? '' : 'じぶんで かける もじが ふえると クリア。もういちど チャレンジしよう！' }),
      h('div', { class: 'result-info' },
        h('div', { class: 'info-chip' }, h('small', { textContent: 'じぶんで かけた' }), h('span', { textContent: `${r.good} / ${r.total}` }))),
      h('div', { class: 'result-btns' },
        r.cleared && next ? h('button', { class: 'btn btn-orange', type: 'button', textContent: `つぎへ：${next.name}`, onclick: () => { tap(); startHira(next); } }) : null,
        h('button', { class: 'btn btn-teal', type: 'button', textContent: 'もういちど', onclick: () => { tap(); startHira(u); } }),
        h('button', { class: 'btn', type: 'button', textContent: 'みちへ もどる', onclick: () => { tap(); showHiraMap(); } }))),
  )));
  if (r.cleared) {
    sndClear();
    if (!REDUCED) {
      starBox.querySelectorAll<SVGElement>('.star-ic').forEach((el, i) => {
        if (i < r.stars) { el.classList.add('earn'); el.style.animationDelay = `${i * 0.18}s`; }
      });
    }
  }
}
