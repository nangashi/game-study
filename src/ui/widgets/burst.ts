import { REDUCED } from '../app';
import { h } from '../dom';

// 正解のときの紙吹雪（算数練習アプリの演出。見た目だけなので Math.random のまま）
export function burst(box: HTMLElement, combo: number): void {
  if (REDUCED) return;
  box.replaceChildren();
  const colors = ['#2a9d8f', '#ffb703', '#ef476f', '#4a90d9', '#9b5de5', '#fb8500'];
  const n = combo >= 5 ? 26 : combo >= 3 ? 18 : 12;
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
