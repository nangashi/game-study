import { h, overlay, svgEl } from './dom';
import { mascotSVG, type Mood } from './mascot';
import { tap } from './sound';

// 算数練習アプリのバナー（マスコット・見出し・ひとこと・ボタン）。ボタンを押すと閉じてから onClick
export interface BannerButton { label: string; kind?: 'orange' | 'teal' | 'plain' | 'danger'; onClick: () => void }

export function banner(o: { color: string; mood?: Mood; title: string; text: string; buttons: BannerButton[] }): () => void {
  let ov: ReturnType<typeof overlay> | null = null;
  const buttons = o.buttons.map(b => h('button', {
    class: `btn${b.kind === 'orange' ? ' btn-orange' : b.kind === 'teal' ? ' btn-teal' : ''}${b.kind === 'danger' ? ' btn-danger' : ''}`,
    type: 'button', textContent: b.label,
    onclick: () => { tap(); ov?.close(); b.onClick(); },
  }));
  ov = overlay(
    svgEl(mascotSVG(o.color, o.mood ?? 'normal'), 'banner-mascot'),
    h('h2', { textContent: o.title }),
    h('p', { textContent: o.text }),
    h('div', { class: 'warn-btns' }, ...buttons),
  );
  return ov.close;
}
