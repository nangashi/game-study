import {
  ALL_KANJI, answer, buildSession, currentItem, localDate, pendingOnQuit, runSummary, splitWord, startRun,
  type KanjiRun, type SelfGrade, type SessionItem,
} from '../../learn/kanji';
import {
  finishKanjiRun, kanjiCards, kanjiProgress, kanjiRunCount, recordKanjiResult, type ChildRecord,
} from '../../records';
import { KANJI_TOPICS, type KanjiTopicDef, type KanjiTopicId } from '../../themes';
import { REDUCED, current, device, now, pushFamily, updateCurrent } from '../app';
import { h, mount, svgEl } from '../dom';
import { avatarOf, mascotSVG, starSVG } from '../mascot';
import { sndClear, tap } from '../sound';
import { showChildren } from './children';
import { showThemes } from './themes';

// 国語「かんじ」: 中身の一覧（いまは かきとり だけ）と、かきとり（読みを見て紙に書き、答えを見て自己採点）。
// 設計は game-study-design/07-kanji-srs.md。自己採点なので、アプリの正誤の音・○×は出さない

const KANJI_COLOR = '#e11d48'; // こくごの色
const colorOf = (c: ChildRecord) => avatarOf(c.settings.value.avatar).color;
const today = () => localDate(new Date(now()));

// ================= かんじ（中身の一覧） =================

const OPEN: Record<KanjiTopicId, () => void> = { kakitori: startKakitori };

export function showKanjiMenu(): void {
  const c = current();
  if (!c) return showChildren();
  const av = avatarOf(c.settings.value.avatar);

  const card = (t: KanjiTopicDef) => {
    if (!t.id) {
      return h('button', { class: 'theme-btn is-soon', type: 'button', disabled: true },
        h('span', { class: 'dot', textContent: t.mark }),
        h('span', {}, h('span', { class: 'tname', textContent: t.name }), h('br'), h('span', { class: 'tdesc', textContent: t.desc })),
        h('span', { class: 'soon', textContent: 'あとで ふえる' }));
    }
    const id = t.id;
    const { solved, graduated } = kanjiProgress(c);
    const runs = kanjiRunCount(c);
    return h('button', { class: 'theme-btn', type: 'button', onclick: () => { tap(); OPEN[id](); } },
      h('span', { class: 'dot', style: `background:${KANJI_COLOR}`, textContent: t.mark }),
      h('span', {},
        h('span', { class: 'tname', textContent: t.name }), h('br'),
        h('span', { class: 'tdesc', textContent: t.desc }), h('br'),
        h('span', { class: 'tprog', textContent: `とけた字 ${solved}字 ／ そつぎょう ${graduated}字` }), h('br'),
        h('span', { class: 'tprog', textContent: `やりきった かいすう ${runs}かい` })));
  };

  mount(h('section', { class: 'screen', id: 'screen-kanji' }, h('div', { class: 'wrap' },
    h('div', { class: 'theme-shead' },
      h('button', { class: 'theme-back-btn', type: 'button', 'aria-label': 'もどる', textContent: '‹', onclick: () => { tap(); showThemes(); } }),
      h('span', { class: 'theme-stitle', textContent: 'かんじ' }),
      h('span', { class: 'theme-child-chip' },
        h('i', { class: 'cdot', style: `background:${av.color}` }),
        h('span', { class: 'child-name', textContent: c.settings.value.name }))),
    h('div', { class: 'theme-list' }, ...KANJI_TOPICS.map(card)),
  )));
}

// ================= かきとり =================

let active: KanjiRun | null = null; // やめたあとに、ボタンが前の回を進めないように

function startKakitori(): void {
  const c = current();
  if (!c) return showChildren();
  const items = buildSession(kanjiCards(c), today(), ALL_KANJI);
  if (!items.length) return showRest(colorOf(c));
  const run = startRun(items);
  active = run;
  playView(run, colorOf(c));
}

// 1字の結果を記録する（端末に保存。送るのは結果画面で）
const record = (kanji: string, grade: SelfGrade) =>
  updateCurrent(x => recordKanjiResult(x, kanji, grade, today(), now()));

function playView(run: KanjiRun, color: string): void {
  const total = run.items.length;
  const dots = h('div', { class: 'prog-dots' });
  const num = h('div', { class: 'prog-num' });
  const mascot = h('div', { class: 'mascot-box' });
  const badge = h('div', { class: 'kj-badge' });
  const body = h('div', { class: 'kj-body' });
  const foot = h('div', { class: 'kj-foot' });

  const quit = () => {
    // 答えた字は記録ずみ。もう1回を待っている字は1回目の結果（できなかった）で記録する
    if (active === run) for (const p of pendingOnQuit(run)) record(p.kanji, p.grade);
    active = null;
    showKanjiMenu();
  };

  mount(h('section', { class: 'play-screen kj-screen' },
    h('div', { class: 'play-top' },
      h('button', { class: 'quit-btn', type: 'button', textContent: 'やめる', onclick: () => { tap(); quit(); } }),
      h('div', { class: 'play-theme', textContent: 'かんじ かきとり' }),
      h('div', { style: 'width:64px;flex:none' })),
    h('div', { class: 'prog' }, dots, num),
    h('div', { class: 'stage-area' },
      h('div', { class: 'problem-card kj-card' },
        h('div', { class: 'mascot-row' }, mascot, badge),
        body)),
    foot,
  ));

  const progress = (retry: boolean) => {
    const answered = run.first.length;
    num.textContent = retry ? `もういちど ${run.pos - total + 1}/${run.retries.length}` : `${Math.min(answered + 1, total)}/${total}`;
    const cls: Record<SelfGrade, string> = { correct: 'done-ok', close: 'done-close', wrong: 'done-ng' };
    dots.replaceChildren(...run.items.map((_, i) =>
      h('i', { class: i < answered ? cls[run.first[i]] : i === run.pos ? 'now' : '' })));
  };

  // 出題: かなの単語（答える読みに傍線）→「こたえを みる」
  const ask = () => {
    if (active !== run) return;
    const cur = currentItem(run);
    if (!cur) return finishKakitori(run, color);
    const { item, retry } = cur;
    progress(retry);
    mascot.innerHTML = mascotSVG(color, 'normal');
    setBadge(badge, item);
    body.replaceChildren(
      wordEl(item, 'kj-word'),
      h('div', { class: 'kj-note', textContent: 'かみに かいてね' }));
    foot.replaceChildren(h('button', {
      class: 'kj-show', type: 'button', textContent: 'こたえを みる',
      onclick: () => { tap(); reveal(item); },
    }));
  };

  // 答え合わせ: 答えの字を大きく、単語は字を入れた形で。自分で ○ をつける
  const reveal = (item: SessionItem) => {
    if (active !== run) return;
    mascot.innerHTML = mascotSVG(color, 'happy');
    body.replaceChildren(
      h('div', { class: 'kj-answer', textContent: item.kanji }),
      wordEl(item, 'kj-word-small', item.kanji),
      h('div', { class: 'kj-check', textContent: 'とめ・はね・はらいも あってた？' }));
    const grade = (g: SelfGrade, label: string, cls: string) => h('button', {
      class: `kj-grade ${cls}`, type: 'button', textContent: label,
      onclick: () => {
        if (active !== run) return;
        tap();
        const r = answer(run, g);
        if (r) record(r.kanji, r.grade);
        ask();
      },
    });
    foot.replaceChildren(h('div', { class: 'kj-grades' },
      grade('correct', 'できた', 'g-ok'),
      grade('close', 'おしい', 'g-close'),
      grade('wrong', 'できなかった', 'g-ng')));
  };

  ask();
}

// もう1回の字も、もとの種類で出す（もう1回であることは 進み具合の数字に出る）
function setBadge(el: HTMLElement, item: SessionItem) {
  const review = item.kind === 'review';
  el.className = `kj-badge ${review ? 'review' : 'new'}`;
  el.textContent = review ? 'ふくしゅう' : 'あたらしい';
}

// 単語。答える読みの部分に傍線。kanji を渡すと、その部分を字にする（答え合わせ用）
function wordEl(item: SessionItem, cls: string, kanji?: string): HTMLElement {
  const p = splitWord(item.word);
  if (!p) return h('div', { class: cls, textContent: item.word.replace(/[[\]]/g, '') });
  return h('div', { class: cls }, p.before, h('u', { textContent: kanji ?? p.reading }), p.after);
}

// ================= 結果 =================

function finishKakitori(run: KanjiRun, color: string): void {
  active = null;
  updateCurrent(c => finishKanjiRun(c, device()));
  pushFamily();
  const { fresh, review, practice } = runSummary(run);
  const c = current();
  const runs = c ? kanjiRunCount(c) : 0;
  const starBox = h('div', { class: 'result-stars', html: starSVG(true) });

  const group = (label: string, chars: string[], cls: string) => chars.length
    ? h('div', { class: `kj-sum ${cls}` },
      h('small', { textContent: `${label}（${chars.length}）` }),
      h('div', { class: 'kj-sum-chars', textContent: chars.join(' ') }))
    : null;

  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'card result-card' },
      svgEl(mascotSVG(color, 'proud'), 'result-mascot'),
      h('h2', { textContent: 'やりきった！' }),
      starBox,
      h('div', { class: 'result-msg', textContent: `${run.items.length}もん さいごまで かいたね！` }),
      h('div', { class: 'result-info' },
        h('div', { class: 'info-chip' }, h('small', { textContent: 'やりきった かいすう' }), h('span', { textContent: `${runs}かい` }))),
      h('div', { class: 'kj-sums' },
        group('あたらしく とけた字', fresh, 'fresh'),
        group('ふくしゅうの字', review, 'review'),
        group('つぎも れんしゅう', practice, 'practice')),
      h('div', { class: 'result-btns' },
        h('button', { class: 'btn btn-orange', type: 'button', textContent: 'もういちど', onclick: () => { tap(); startKakitori(); } }),
        h('button', { class: 'btn', type: 'button', textContent: 'かんじへ もどる', onclick: () => { tap(); showKanjiMenu(); } }))),
  )));
  sndClear();
  if (!REDUCED) starBox.querySelector('.star-ic')?.classList.add('earn');
}

// 出す字が1つもない日（ぜんぶ卒業して、期限の来た字もない など）
function showRest(color: string): void {
  mount(h('section', { class: 'screen' }, h('div', { class: 'wrap' },
    h('div', { class: 'card result-card' },
      svgEl(mascotSVG(color, 'happy'), 'result-mascot'),
      h('h2', { textContent: 'きょうは おやすみ' }),
      h('div', { class: 'result-msg', textContent: 'いまは ふくしゅうする 字が ないよ。また こんど やろうね！' }),
      h('div', { class: 'result-btns' },
        h('button', { class: 'btn', type: 'button', textContent: 'かんじへ もどる', onclick: () => { tap(); showKanjiMenu(); } }))),
  )));
}
