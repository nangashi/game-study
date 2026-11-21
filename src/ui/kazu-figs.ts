import type { Fig } from '../learn/kazu';

// かずの図（SVG の文字列）。形は「かず 問題形式モック」のまま。数直線だけ、目盛りのまん中に短い目盛りを足した

const FILL = '#0891b2';   // さんすうの色
const LINE = '#4a6a76';
const INK = '#17323e';

function pie(parts: number, filled: number, offset: number, size: number): string {
  const c = 60, r = 54;
  let s = '';
  if (parts === 1) {
    s = `<circle cx="${c}" cy="${c}" r="${r}" fill="${filled ? FILL : '#fff'}" stroke="${LINE}" stroke-width="3"/>`;
  } else {
    for (let i = 0; i < parts; i++) {
      const a1 = (Math.PI * 2 * i) / parts - Math.PI / 2;
      const a2 = (Math.PI * 2 * (i + 1)) / parts - Math.PI / 2;
      const on = (i - offset + parts) % parts < filled;
      s += `<path d="M${c} ${c} L${(c + r * Math.cos(a1)).toFixed(1)} ${(c + r * Math.sin(a1)).toFixed(1)}` +
        ` A${r} ${r} 0 0 1 ${(c + r * Math.cos(a2)).toFixed(1)} ${(c + r * Math.sin(a2)).toFixed(1)} Z"` +
        ` fill="${on ? FILL : '#fff'}" stroke="${LINE}" stroke-width="3" stroke-linejoin="round"/>`;
    }
  }
  return `<svg viewBox="0 0 120 120" width="${size}" height="${size}">${s}</svg>`;
}

function bar(parts: number, filled: number, offset: number, w: number): string {
  const pw = 300 / parts;
  let s = '';
  for (let i = 0; i < parts; i++) {
    const on = (i - offset + parts) % parts < filled;
    s += `<rect x="${(i * pw + 1.5).toFixed(1)}" y="1.5" width="${(pw - 0).toFixed(1)}" height="87" fill="${on ? FILL : '#fff'}" stroke="${LINE}" stroke-width="3"/>`;
  }
  return `<svg viewBox="0 0 303 90" width="${w}" height="${Math.round((w * 90) / 303)}">${s}</svg>`;
}

function numberLine(max: number, step: number, value: number): string {
  const x0 = 40, x1 = 560, y = 62; // 両はしの数が はみ出さないよう、目盛りの字は まん中ぞろえ
  const X = (v: number) => x0 + ((x1 - x0) * v) / max;
  let s = `<line x1="${x0}" y1="${y}" x2="${x1}" y2="${y}" stroke="${INK}" stroke-width="4" stroke-linecap="round"/>`;
  for (let v = 0; v <= max; v += step) {
    const x = X(v);
    s += `<line x1="${x}" y1="${y - 9}" x2="${x}" y2="${y + 9}" stroke="${INK}" stroke-width="3"/>`;
    if (v < max) s += `<line x1="${X(v + step / 2)}" y1="${y - 5}" x2="${X(v + step / 2)}" y2="${y + 5}" stroke="${LINE}" stroke-width="2"/>`;
    s += `<text x="${x}" y="${y + 34}" font-size="${max >= 10000 ? 15 : 17}" font-weight="700" fill="${LINE}" text-anchor="middle">${v}</text>`;
  }
  const ax = X(value);
  s += `<circle cx="${ax}" cy="16" r="14" fill="${FILL}"/>`;
  s += `<text x="${ax}" y="23" font-size="17" font-weight="900" fill="#fff" text-anchor="middle">？</text>`;
  s += `<path d="M${ax - 10} 32 L${ax + 10} 32 L${ax} 52 Z" fill="${FILL}"/>`;
  return `<svg viewBox="0 0 600 104" width="560">${s}</svg>`;
}

function dots(total: number, on: number): string {
  const d = 46;
  let s = '';
  for (let i = 0; i < total; i++) {
    s += `<circle cx="${i * d + d / 2}" cy="${d / 2}" r="17" fill="${i < on ? FILL : '#fff'}" stroke="${i < on ? FILL : '#c9bfa5'}" stroke-width="3"/>`;
  }
  return `<svg viewBox="0 0 ${total * d} ${d}" width="${total * d}" height="${d}">${s}</svg>`;
}

function tenFrame(on: number): string {
  const c = 52;
  let s = '';
  for (let i = 0; i < 10; i++) {
    const x = (i % 5) * c + 2, y = Math.floor(i / 5) * c + 2;
    s += `<rect x="${x}" y="${y}" width="${c}" height="${c}" fill="#fff" stroke="${LINE}" stroke-width="2"/>`;
    if (i < on) s += `<circle cx="${x + c / 2}" cy="${y + c / 2}" r="17" fill="${FILL}"/>`;
  }
  return `<svg viewBox="0 0 ${5 * c + 4} ${2 * c + 4}" width="${5 * c + 4}" height="${2 * c + 4}">${s}</svg>`;
}

// big: 問題文の上の図（大きめ）。false は選択肢の中の図
export function figSVG(f: Fig, big: boolean): string {
  switch (f.kind) {
    case 'numberLine': return numberLine(f.max, f.step, f.value);
    case 'dots': return dots(f.total, f.on);
    case 'tenFrame': return tenFrame(f.on);
    case 'pie': return pie(f.parts, f.filled, f.offset, big ? 160 : 110);
    case 'bar': return bar(f.parts, f.filled, f.offset, big ? 260 : 180);
  }
}
