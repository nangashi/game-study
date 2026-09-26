import { newProfile, save, store } from '../../state/store';
import { GAMES } from '../../games/registry';
import type { Grade, Profile } from '../../state/types';
import type { Tolerance } from '../../learn/handwriting/judge';
import { h, hero, ico, mount, overlay } from '../dom';
import { HEROES, type HeroId } from '../../art';
import { showProfiles } from './profiles';

const GRADES: [Grade, string][] = [['k', '年長'], [1, '1年生'], [2, '2年生'], [3, '3年生']];
const TOLS: [Tolerance, string][] = [['easy', 'やさしい'], ['normal', 'ふつう'], ['strict', 'きびしい']];

// 子どもがうっかり入らないように、かけ算で確認する
export function showParentGate(): void {
  const a = 6 + Math.floor(Math.random() * 4), b = 6 + Math.floor(Math.random() * 4);
  const input = h('input', { type: 'number', inputMode: 'numeric', style: 'font-size:28px;width:140px;padding:8px' });
  const o = overlay(
    h('h2', { textContent: 'おうちのかたへ' }),
    h('p', { textContent: `${a} × ${b} = ?` , style: 'font-size:32px;font-weight:800;margin:0' }),
    input,
    h('div', { class: 'row' },
      h('button', { class: 'pill-btn', textContent: 'やめる', onclick: () => o.close() }),
      h('button', { class: 'pill-btn primary', textContent: 'OK', onclick: () => {
        if (Number(input.value) === a * b) { o.close(); showParent(); } else input.value = '';
      } }),
    ),
  );
  input.focus();
}

function select<T extends string | number>(options: [T, string][], value: T, onChange: (v: T) => void): HTMLSelectElement {
  const s = h('select', {}, ...options.map(([v, label]) => h('option', { value: String(v), textContent: label, selected: v === value })));
  s.addEventListener('change', () => onChange(options[s.selectedIndex][0]));
  return s;
}

function numberField(label: string, value: number, min: number, max: number, onChange: (v: number) => void) {
  const i = h('input', { type: 'number', value: String(value), min: String(min), max: String(max), style: 'width:90px' });
  i.addEventListener('change', () => { const v = Math.max(min, Math.min(max, Number(i.value) || min)); i.value = String(v); onChange(v); });
  return h('label', {}, label, i);
}

function heroPicker(value: HeroId, onChange: (v: HeroId) => void): HTMLElement {
  const buttons = HEROES.map(x => h('button', { class: x.id === value ? 'on' : '', title: x.name, onclick: () => {
    buttons.forEach(b => b.classList.toggle('on', b === buttons[HEROES.indexOf(x)]));
    onChange(x.id);
  } }, hero(x.id, 56)));
  return h('div', { class: 'avatars' }, ...buttons);
}

function profileSection(p: Profile): HTMLElement {
  const learned = (prefix: string) => Object.entries(p.cards).filter(([k, c]) => k.startsWith(prefix + ':') && c.box >= 2).length;
  const cards = Object.values(p.cards);
  return h('section', {},
    h('h2', {}, hero(p.avatar, 44), ` ${p.name}`),
    h('label', {}, '学年', select(GRADES, p.grade, v => { p.grade = v; save(); })),
    h('label', {}, 'キャラクター', heroPicker(p.avatar, v => { p.avatar = v; save(); showParent(); })),
    h('label', {}, '手書きの判定', select(TOLS, p.tolerance, v => { p.tolerance = v; save(); })),
    h('table', {},
      h('tr', {}, h('th', { textContent: 'クエスト' }), h('td', { textContent: `${p.stats.quests}回（正解 ${p.stats.correct}問）` })),
      ...GAMES.filter(g => p.games[g.id]).map(g => h('tr', {}, h('th', { textContent: g.name }),
        h('td', { textContent: `${p.games[g.id].plays}回（クリア ${p.games[g.id].clears}回、ステージ ${p.games[g.id].stage}）` }))),
      h('tr', {}, h('th', { textContent: '覚えた字（2回以上連続で正解）' }), h('td', { textContent: `ひらがな ${learned('hira')} / カタカナ ${learned('kata')} / 漢字 ${learned('kanji')}` })),
      h('tr', {}, h('th', { textContent: '問題' }), h('td', { textContent: `${cards.length}問に挑戦（定着 ${cards.filter(c => c.box >= 3).length}問）` })),
      h('tr', {}, h('th', { textContent: '連続日数' }), h('td', { textContent: `${p.streak.count}日` })),
    ),
    h('div', { class: 'row', style: 'justify-content:flex-start' },
      h('button', { class: 'pill-btn', onclick: () => { p.tickets++; save(); showParent(); } }, ico('ticket'), ' ゲーム券を1枚あげる'),
      h('button', { class: 'pill-btn', textContent: '削除', onclick: () => {
        if (confirm(`${p.name} のデータを削除しますか？（元に戻せません）`)) { store.removeProfile(p.id); showParent(); }
      } }),
    ),
  );
}

function addProfileSection(): HTMLElement {
  let avatar: HeroId = HEROES[store.data.profiles.length % HEROES.length].id, grade: Grade = 'k';
  const name = h('input', { placeholder: 'なまえ（ひらがな）', style: 'width:220px' });
  return h('section', {},
    h('h2', { textContent: '＋ 子どもを追加' }),
    h('label', {}, 'なまえ', name),
    h('label', {}, '学年', select(GRADES, grade, v => { grade = v; })),
    heroPicker(avatar, v => { avatar = v; }),
    h('button', { class: 'pill-btn primary', textContent: '追加する', onclick: () => {
      if (!name.value.trim()) return name.focus();
      store.addProfile(newProfile(name.value.trim(), avatar, grade));
      showParent();
    } }),
  );
}

function backupSection(): HTMLElement {
  const file = h('input', { type: 'file', accept: 'application/json' });
  file.addEventListener('change', async () => {
    const f = file.files?.[0];
    if (!f) return;
    try { store.importJson(await f.text()); alert('読み込みました'); showParent(); } catch (e) { alert(`読み込めませんでした: ${(e as Error).message}`); }
  });
  return h('section', {},
    h('h2', { textContent: 'バックアップ' }),
    h('p', { class: 'muted', style: 'margin:0', textContent: 'データはこの端末のブラウザの中だけに保存されています。' }),
    h('div', { class: 'row', style: 'justify-content:flex-start' },
      h('button', { class: 'pill-btn', textContent: '書き出す', onclick: () => {
        const a = h('a', { href: URL.createObjectURL(new Blob([store.exportJson()], { type: 'application/json' })), download: `manabi-backup-${Date.now()}.json` });
        a.click();
      } }),
      h('label', {}, '読み込む', file),
    ),
  );
}

export function showParent(): void {
  const s = store.settings;
  mount(h('div', { class: 'screen parent' },
    h('div', { class: 'row', style: 'justify-content:space-between' },
      h('h1', { class: 'title', style: 'margin:0' }, ico('family', 40), ' おうちのひと'),
      h('button', { class: 'pill-btn primary', textContent: 'とじる', onclick: showProfiles }),
    ),
    ...store.data.profiles.map(profileSection),
    addProfileSection(),
    h('section', {},
      h('h2', { textContent: 'ルール（全員共通）' }),
      numberField('毎日むりょうでもらえるゲーム券', s.freePlaysPerDay, 0, 10, v => { s.freePlaysPerDay = v; save(); }),
      numberField('その日はじめての教科でもらえるゲーム券', s.playsPerSubject, 0, 5, v => { s.playsPerSubject = v; save(); }),
      numberField('勉強でもらえるゲーム券の1日の上限', s.ticketsPerDay, 0, 20, v => { s.ticketsPerDay = v; save(); }),
      numberField('1クエストの問題数', s.questLength, 3, 10, v => { s.questLength = v; save(); }),
    ),
    backupSection(),
    h('p', { class: 'muted', html: '筆順データ: <a href="https://kanjivg.tagaini.net/" target="_blank" rel="noopener">KanjiVG</a> (CC BY-SA 3.0, Ulrich Apel)' }),
  ));
}
