type Child = Node | string | null | undefined | false;
type Props = Record<string, unknown> & { class?: string; html?: string };

// 小さな DOM ヘルパー。html には自前の信頼できる文字列だけを渡す
export function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Props = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = String(v);
    else if (k === 'html') el.innerHTML = String(v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v as EventListener);
    else if (k in el) (el as unknown as Record<string, unknown>)[k] = v;
    else el.setAttribute(k, String(v));
  }
  for (const c of children) if (c != null && c !== false) el.append(c);
  return el;
}

const app = () => document.getElementById('app')!;

let mounts = 0;
// 画面を入れかえた回数（起動時の同期のあと、まだ最初の画面のままかを見る）
export const mountCount = () => mounts;

// 画面を入れかえる（重ねていたダイアログも消す）
export function mount(...nodes: Node[]): void {
  mounts++;
  document.querySelectorAll('.banner-overlay').forEach(el => el.remove());
  app().replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// 画面の上に重ねるカード（算数練習アプリのバナー）。close() で消す
export function overlay(...children: Child[]) {
  const el = h('div', { class: 'banner-overlay' }, h('div', { class: 'banner-card' }, ...children));
  document.body.append(el);
  return { el, close: () => el.remove() };
}

// 自前の SVG 文字列を要素にする
export function svgEl(html: string, cls = ''): HTMLElement {
  return h('span', { class: cls ? `svg-box ${cls}` : 'svg-box', html, 'aria-hidden': 'true' });
}
