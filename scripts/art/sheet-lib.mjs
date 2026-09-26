// 生成画像から絵を1つずつ切り出し（cut）、きっちりしたグリッドに並べ直す（pack）。
//
// 生成AIは「NxMのグリッドで」と頼んでも、行の間隔がずれたり、絵がセル境界をまたいだりする。
// そこでグリッドは信用せず、透明でない塊（連結成分）で1つずつ切り出してから並べ直す。
// くわしくは docs/02-asset-generation.md
import fs from 'node:fs';
import { PNG } from 'pngjs';

export const readPng = file => PNG.sync.read(fs.readFileSync(file));
export const writePng = (file, png) => fs.writeFileSync(file, PNG.sync.write(png));

// 絵を cols×rows 個、読み順（上の行から、左から）で切り出す。
// もどり値の1つ1つは { w, h, cx, data }（data は w×h の RGBA。ほかの絵の部分は透明）
//   group 'blob' : 大きい塊 cols×rows 個を本体とし、小さいかけらを近い本体にくっつける（行がずれていても切れる）
//   group 'cell' : 塊を、中心がある「グリッドのマス」ごとにまとめる（3つのたま・紙ふぶきなど、ばらばらの部品でできた絵）
export function cut(img, cols, rows, group = 'blob') {
  const { width: W, height: H } = img;
  const data = Buffer.from(img.data);

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
    const c = { id, n: 0, x0: W, y0: H, x1: -1, y1: -1, sx: 0 };
    const stack = [s];
    label[s] = id;
    while (stack.length) {
      const p = stack.pop(), x = p % W, y = (p / W) | 0;
      c.n++; c.sx += x;
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

  if (group === 'cell') return byCell(comps, label, data, W, H, cols, rows);

  // 大きい塊 = 絵の本体。小さいかけら（きらきら・飛び散り）は近い本体にくっつける
  const expected = cols * rows;
  const sorted = [...comps].sort((a, b) => b.n - a.n);
  const bodies = sorted.slice(0, expected);
  if (bodies.length < expected || bodies[expected - 1].n < sorted[0].n * 0.05) {
    throw new Error(`絵が ${expected} 個見つかりません（大きい塊: ${sorted.filter(c => c.n > sorted[0].n * 0.05).length} 個）`);
  }
  const owner = new Map(bodies.map(b => [b.id, b]));
  const boxDist = (a, b) => Math.hypot(Math.max(0, a.x0 - b.x1, b.x0 - a.x1), Math.max(0, a.y0 - b.y1, b.y0 - a.y1));
  for (const c of sorted.slice(expected)) {
    const near = bodies.reduce((best, b) => (boxDist(c, b) < boxDist(c, best) ? b : best));
    if (boxDist(c, near) > Math.min(W / cols, H / rows) * 0.2) continue; // 遠いかけらは捨てる
    owner.set(c.id, near);
  }
  const groups = new Map(bodies.map(b => [b, { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, cx: b.sx / b.n, ids: new Set([b.id]) }]));
  for (const [id, b] of owner) {
    const g = groups.get(b), c = comps[id];
    g.ids.add(id);
    g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
  }

  // 読み順に並べる
  const byY = [...groups.values()].sort((a, b) => (a.y0 + a.y1) - (b.y0 + b.y1));
  const order = [];
  for (let r = 0; r < rows; r++) order.push(...byY.slice(r * cols, (r + 1) * cols).sort((a, b) => (a.x0 + a.x1) - (b.x0 + b.x1)));

  return order.map(g => extract(g, label, data, W));
}

// 塊を、中心があるマスごとにまとめる。マスは絵のある範囲を cols×rows に等分したもの
function byCell(comps, label, data, W, H, cols, rows) {
  const big = comps.filter(c => c.n >= 30); // ごく小さいノイズは捨てる
  const X0 = Math.min(...big.map(c => c.x0)), X1 = Math.max(...big.map(c => c.x1));
  const Y0 = Math.min(...big.map(c => c.y0)), Y1 = Math.max(...big.map(c => c.y1));
  const cw = (X1 - X0 + 1) / cols, ch = (Y1 - Y0 + 1) / rows;
  const cells = Array.from({ length: cols * rows }, () => null);
  for (const c of big) {
    const col = Math.min(cols - 1, Math.floor(((c.x0 + c.x1) / 2 - X0) / cw));
    const row = Math.min(rows - 1, Math.floor(((c.y0 + c.y1) / 2 - Y0) / ch));
    const i = row * cols + col;
    const g = (cells[i] ??= { x0: c.x0, y0: c.y0, x1: c.x1, y1: c.y1, n: 0, sx: 0, ids: new Set() });
    g.ids.add(c.id); g.n += c.n; g.sx += c.sx;
    g.x0 = Math.min(g.x0, c.x0); g.y0 = Math.min(g.y0, c.y0); g.x1 = Math.max(g.x1, c.x1); g.y1 = Math.max(g.y1, c.y1);
  }
  const empty = cells.findIndex(g => !g);
  if (empty >= 0) throw new Error(`マス ${empty + 1} に絵がありません（グリッドがずれているかもしれません。group: 'blob' をためす）`);
  return cells.map(g => extract({ ...g, cx: g.sx / g.n }, label, data, W));
}

// 1つずつ切り出す（ほかの絵の一部は写さない。半透明のふちはラベルなしなので写す）
function extract(g, label, data, W) {
  {
    const w = g.x1 - g.x0 + 1, h = g.y1 - g.y0 + 1;
    const out = Buffer.alloc(w * h * 4);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = (g.y0 + y) * W + g.x0 + x;
      if (label[p] !== -1 && !g.ids.has(label[p])) continue;
      data.copy(out, (y * w + x) * 4, p * 4, p * 4 + 4);
    }
    return { w, h, cx: g.cx - g.x0, data: out };
  }
}

// 面積平均による縮小（アルファで重みづけして、ふちが黒ずまないようにする）
function blit(out, piece, scale, ox, oy) {
  const inv = 1 / scale;
  const dw = Math.ceil(piece.w * scale), dh = Math.ceil(piece.h * scale);
  for (let dy = 0; dy < dh; dy++) for (let dx = 0; dx < dw; dx++) {
    const tx = ox + dx, ty = oy + dy;
    if (tx < 0 || ty < 0 || tx >= out.width || ty >= out.height) continue;
    const sx0 = dx * inv, sy0 = dy * inv, sx1 = sx0 + inv, sy1 = sy0 + inv;
    let r = 0, g = 0, b = 0, a = 0, area = 0;
    for (let sy = Math.floor(sy0); sy < Math.ceil(sy1); sy++) for (let sx = Math.floor(sx0); sx < Math.ceil(sx1); sx++) {
      if (sx >= piece.w || sy >= piece.h) continue;
      const wgt = (Math.min(sx + 1, sx1) - Math.max(sx, sx0)) * (Math.min(sy + 1, sy1) - Math.max(sy, sy0));
      area += wgt;
      const p = (sy * piece.w + sx) * 4;
      const al = piece.data[p + 3] / 255 * wgt;
      r += piece.data[p] * al; g += piece.data[p + 1] * al; b += piece.data[p + 2] * al; a += al;
    }
    if (!area || !a) continue;
    const o = (ty * out.width + tx) * 4;
    out.data[o] = Math.round(r / a); out.data[o + 1] = Math.round(g / a); out.data[o + 2] = Math.round(b / a);
    out.data[o + 3] = Math.round(a / area * 255);
  }
}

// 切り出した絵を cols 列のグリッドに並べる
//   mode icons : 1つずつ、セルいっぱいに収まるよう拡大縮小して中央に置く（アイコン・キャラ・敵）
//   mode anim  : 全コマ同じ倍率。横は重心、縦は足元（下端）をそろえる（アニメーション）
export function pack(pieces, { cols, cell, mode = 'icons', pad = Math.round(cell * 0.05) }) {
  const rows = Math.ceil(pieces.length / cols);
  const out = new PNG({ width: cols * cell, height: rows * cell });
  const inner = cell - pad * 2;
  const animScale = inner / Math.max(...pieces.map(p => Math.max(p.w, p.h)));
  pieces.forEach((p, i) => {
    const col = i % cols, row = (i / cols) | 0;
    if (mode === 'anim') {
      const s = animScale;
      blit(out, p, s, col * cell + Math.round(cell / 2 - p.cx * s), row * cell + cell - pad - Math.round(p.h * s));
    } else {
      const s = inner / Math.max(p.w, p.h);
      blit(out, p, s, col * cell + Math.round((cell - p.w * s) / 2), row * cell + Math.round((cell - p.h * s) / 2));
    }
  });
  return { png: out, cols, rows };
}
