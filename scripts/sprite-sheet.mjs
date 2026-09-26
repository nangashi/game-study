// 画像生成AIが作ったスプライトシートを、ゲームで使える「きっちりしたグリッド」に整える。
//
// 生成AIは「NxMのグリッドで」と頼んでも、行の間隔がずれたり、絵がセル境界をまたいだりする。
// そこでグリッドは信用せず、透明でない塊（連結成分）で1つずつ切り出してから並べ直す。
//
// 使い方:
//   node scripts/sprite-sheet.mjs <入力.png> <出力.png> --grid 4x4 --cell 128 [--mode icons|anim] [--pad 6]
//     --mode icons : 1つずつ、セルいっぱいに収まるよう拡大縮小して中央に置く（アイコン集）
//     --mode anim  : 全コマ同じ倍率。横は重心、縦は足元（下端）をそろえる（アニメーション）
// 出力: <出力.png>（cols*cell x rows*cell）と <出力.json>（Phaser の spritesheet 用のサイズ情報）
import fs from 'node:fs';
import { PNG } from 'pngjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const [src, dst] = args;
if (!src || !dst || !opt('grid')) {
  console.error('usage: node scripts/sprite-sheet.mjs <in.png> <out.png> --grid 4x4 --cell 128 [--mode icons|anim] [--pad 6]');
  process.exit(1);
}
const [cols, rows] = opt('grid').split('x').map(Number);
const cell = Number(opt('cell', 128));
const pad = Number(opt('pad', Math.round(cell * 0.05)));
const mode = opt('mode', 'icons');

const img = PNG.sync.read(fs.readFileSync(src));
const { width: W, height: H, data } = img;

// 生成画像は本体の不透明度が 222〜254 くらいになるので 255 にそろえ、ほぼ透明なノイズは 0 にする
for (let i = 3; i < data.length; i += 4) {
  if (data[i] >= 220) data[i] = 255;
  else if (data[i] <= 12) data[i] = 0;
}

// ---- 連結成分（8近傍） ----
const SOLID = 32;
const label = new Int32Array(W * H).fill(-1);
const comps = [];
for (let s = 0; s < W * H; s++) {
  if (label[s] !== -1 || data[s * 4 + 3] <= SOLID) continue;
  const id = comps.length;
  const c = { id, n: 0, x0: W, y0: H, x1: -1, y1: -1, sx: 0, sy: 0 };
  const stack = [s];
  label[s] = id;
  while (stack.length) {
    const p = stack.pop(), x = p % W, y = (p / W) | 0;
    c.n++; c.sx += x; c.sy += y;
    if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const q = ny * W + nx;
      if (label[q] !== -1 || data[q * 4 + 3] <= SOLID) continue;
      label[q] = id; stack.push(q);
    }
  }
  comps.push(c);
}

// 大きい塊 = スプライト本体。小さいかけら（きらきら・飛び散り）は近い本体にくっつける
const expected = cols * rows;
const sorted = [...comps].sort((a, b) => b.n - a.n);
const bodies = sorted.slice(0, expected);
if (bodies.length < expected || bodies[expected - 1].n < sorted[0].n * 0.05) {
  console.error(`スプライトが ${expected} 個見つかりません（大きい塊: ${sorted.filter(c => c.n > sorted[0].n * 0.05).length} 個）`);
  process.exit(2);
}
const owner = new Map(bodies.map(b => [b.id, b]));
const boxDist = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
let dropped = 0;
for (const c of sorted.slice(expected)) {
  const near = bodies.reduce((best, b) => (boxDist(c, b) < boxDist(c, best) ? b : best));
  if (boxDist(c, near) > Math.min(W / cols, H / rows) * 0.2) { dropped++; continue; }
  owner.set(c.id, near);
}
const group = new Map(bodies.map(b => [b, { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, cx: b.sx / b.n, ids: new Set([b.id]) }]));
for (const [id, b] of owner) {
  const g = group.get(b), c = comps[id];
  g.ids.add(id);
  g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
}

// 読み順（上の行から、左から）に並べる
const byY = [...group.values()].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
const order = [];
for (let r = 0; r < rows; r++) order.push(...byY.slice(r * cols, (r + 1) * cols).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1)));

// ---- 並べ直し ----
const out = new PNG({ width: cols * cell, height: rows * cell });
const inner = cell - pad * 2;
const animScale = inner / Math.max(...order.map(g => Math.max(g.x1 - g.x0 + 1, g.y1 - g.y0 + 1)));

// 面積平均による縮小（アルファで重みづけして、ふちが黒ずまないようにする）
function blit(g, scale, ox, oy) {
  const inv = 1 / scale;
  const dw = Math.ceil((g.x1 - g.x0 + 1) * scale), dh = Math.ceil((g.y1 - g.y0 + 1) * scale);
  for (let dy = 0; dy < dh; dy++) for (let dx = 0; dx < dw; dx++) {
    const tx = ox + dx, ty = oy + dy;
    if (tx < 0 || ty < 0 || tx >= out.width || ty >= out.height) continue;
    const sx0 = g.x0 + dx * inv, sy0 = g.y0 + dy * inv, sx1 = sx0 + inv, sy1 = sy0 + inv;
    let r = 0, gg = 0, b = 0, a = 0, area = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
      if (sx < g.x0 || sy < g.y0 || sx > g.x1 || sy > g.y1) continue;
      const w = (Math.min(sx + 1, sx1) - Math.max(sx, sx0)) * (Math.min(sy + 1, sy1) - Math.max(sy, sy0));
      area += w;
      const p = sy * W + sx;
      // ほかのスプライトの一部は写さない（半透明のふちはラベルなしなので写す）
      if (label[p] !== -1 && !g.ids.has(label[p])) continue;
      const al = data[p * 4 + 3] / 255 * w;
      r += data[p * 4] * al; gg += data[p * 4 + 1] * al; b += data[p * 4 + 2] * al; a += al;
    }
    if (!area || !a) continue;
    const o = (ty * out.width + tx) * 4;
    out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(gg / a); out.data[o + 2] = Math.round(b / a);
    out.data[o + 3] = Math.round(a / area * 255);
  }
}

order.forEach((g, i) => {
  const col = i % cols, row = (i / cols) | 0;
  const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
  if (mode === 'anim') {
    const s = animScale;
    // 横は重心をセルの中央に、縦は下端をそろえる
    const ox = col * cell + Math.round(cell / 2 - (g.cx - g.x0) * s);
    const oy = row * cell + cell - pad - Math.round(h * s);
    blit(g, s, ox, oy);
  } else {
    const s = inner / Math.max(w, h);
    blit(g, s, col * cell + Math.round((cell - w * s) / 2), row * cell + Math.round((cell - h * s) / 2));
  }
});

fs.writeFileSync(dst, PNG.sync.write(out));
fs.writeFileSync(dst.replace(/\.png$/, '.json'), JSON.stringify({ frameWidth: cell, frameHeight: cell, cols, rows }, null, 2) + '\n');
console.log(`${src} → ${dst}  ${cols}x${rows} × ${cell}px  (mode=${mode}, かけら結合 ${owner.size - bodies.length}個, 捨てたかけら ${dropped}個)`);
