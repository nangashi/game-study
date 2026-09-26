import { h } from '../dom';

// ひらがなを入力する五十音キー。端末のキーボードだと漢字に変換できて答えが出てしまうので、自前で持つ
// たて書きの五十音表と同じく、右から あ・か・さ… の列

const COLS = ['あいうえお', 'かきくけこ', 'さしすせそ', 'たちつてと', 'なにぬねの', 'はひふへほ', 'まみむめも', 'や ゆ よ', 'らりるれろ', 'わ を ん'];
const DAKU = 'かきくけこさしすせそたちつてとはひふへほ';
const HA = 'はひふへほ';
const SMALL: Record<string, string> = { あ: 'ぁ', い: 'ぃ', う: 'ぅ', え: 'ぇ', お: 'ぉ', や: 'ゃ', ゆ: 'ゅ', よ: 'ょ', つ: 'っ' };
const code = (c: string, d: number) => String.fromCharCode(c.charCodeAt(0) + d);

// ゛: か→が→か、ぱ→ば
export function dakuten(c: string): string {
  if (DAKU.includes(c)) return code(c, 1);
  if (DAKU.includes(code(c, -1))) return code(c, -1);
  if (HA.includes(code(c, -2))) return code(c, -1);
  return c;
}
// ゜: は→ぱ→は、ば→ぱ
export function handakuten(c: string): string {
  if (HA.includes(c)) return code(c, 2);
  if (HA.includes(code(c, -1))) return code(c, 1);
  if (HA.includes(code(c, -2))) return code(c, -2);
  return c;
}
// 小: や→ゃ→や
export function smallKana(c: string): string {
  return SMALL[c] ?? Object.keys(SMALL).find(k => SMALL[k] === c) ?? c;
}

export function kanapad(onOk: (value: string) => void): { el: HTMLElement; box: HTMLElement } {
  let value = '', done = false;
  const box = h('div', { class: 'kana-box', textContent: ' ' });
  const edit = (f: (v: string) => string) => {
    if (done) return;
    value = f(value);
    box.textContent = value || ' ';
  };
  const last = (f: (c: string) => string) => (v: string) => (v ? v.slice(0, -1) + f(v.slice(-1)) : v);
  const key = (label: string, onclick: () => void, cls = '') => h('button', { class: `kkey ${cls}`, textContent: label, onclick });
  const grid = h('div', { class: 'kana-grid' }, ...COLS.flatMap(col => [...col].map(c =>
    c === ' ' ? h('span') : key(c, () => edit(v => (v.length < 12 ? v + c : v))))));
  const tools = h('div', { class: 'kana-tools' },
    key('゛', () => edit(last(dakuten))),
    key('゜', () => edit(last(handakuten))),
    key('小', () => edit(last(smallKana))),
    key('けす', () => edit(v => v.slice(0, -1)), 'del'),
    key('OK', () => { if (done || !value) return; done = true; onOk(value); }, 'ok'));
  return { el: h('div', { class: 'kanapad' }, box, grid, tools), box };
}
