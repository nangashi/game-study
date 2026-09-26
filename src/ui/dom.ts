import { heroHtml, iconHtml, type HeroId, type IconName } from '../art';
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

export function mount(...nodes: Node[]): void {
  app().replaceChildren(...nodes);
  window.scrollTo(0, 0);
}

export const wait = (ms: number) => new Promise(r => setTimeout(r, ms));

// 画面の上に重ねるダイアログ。close() で消す
export function overlay(...children: Child[]) {
  const el = h('div', { class: 'overlay' }, h('div', { class: 'overlay-card' }, ...children));
  document.body.append(el);
  return { el, close: () => el.remove() };
}

export function fromHtml(html: string): HTMLElement {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild as HTMLElement;
}

export const ico = (name: IconName, size?: number | string) => fromHtml(iconHtml(name, size));
export const hero = (id: HeroId, size: number | string, walk = false) => fromHtml(heroHtml(id, size, walk));

// アイコン + 文字のチップ
export const chip = (name: IconName, text: string | number) => h('span', { class: 'chip' }, ico(name), ` ${text}`);
