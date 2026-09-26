// art/<scope>/art.json にしたがって、生成画像（art/<scope>/raw/）から
//   - スプライトシート・1枚絵（WebP）を public/assets/<scope>/ に
//   - フレーム名の対応表（TypeScript）を art.json の "ts" に
// 出力する。くわしくは docs/02-asset-generation.md
//
// 使い方: node scripts/art/build.mjs                 # すべてのスコープ
//         node scripts/art/build.mjs games/hippari   # 1つだけ
import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import { cut, pack, readPng } from './sheet-lib.mjs';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ART = path.join(ROOT, 'art');

// art.json のあるフォルダ = スコープ（common, games/survivor, ...）
function scopes() {
  const found = [];
  const walk = dir => {
    if (fs.existsSync(path.join(dir, 'art.json'))) found.push(path.relative(ART, dir));
    for (const d of fs.readdirSync(dir, { withFileTypes: true })) if (d.isDirectory() && d.name !== 'raw' && d.name !== 'prompts') walk(path.join(dir, d.name));
  };
  walk(ART);
  return found;
}
const config = scope => JSON.parse(fs.readFileSync(path.join(ART, scope, 'art.json'), 'utf8'));

// 生成画像から切り出した絵（名前 → 絵）。同じ画像は1回だけ切る
const cache = new Map();
function source(scope, name) {
  const key = `${scope}/${name}`;
  if (cache.has(key)) return cache.get(key);
  const def = config(scope).sources?.[name];
  if (!def) throw new Error(`${scope}/art.json に sources.${name} がありません`);
  const file = path.join(ART, scope, 'raw', `${name}.png`);
  if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} がありません（scripts/art/gen.sh ${scope} ${name} で生成）`);
  const [cols, rows] = def.grid.split('x').map(Number);
  if (def.names.length !== cols * rows) throw new Error(`${key}: names の数がグリッド ${def.grid} と合いません`);
  const pieces = cut(readPng(file), cols, rows, def.group);
  const map = new Map(def.names.map((n, i) => [n, pieces[i]]));
  cache.set(key, map);
  return map;
}

// "icons:heart"（同じスコープ）/ "common/icons1:coin"（ほかのスコープ）/ "icons:*"（全部）
function frames(scope, refs) {
  return refs.flatMap(ref => {
    const [src, name] = ref.split(':');
    const i = src.lastIndexOf('/');
    const [s, n] = i >= 0 ? [src.slice(0, i), src.slice(i + 1)] : [scope, src];
    const map = source(s, n);
    if (name === '*') return [...map].map(([k, p]) => ({ name: k, piece: p }));
    if (!map.has(name)) throw new Error(`${ref}: ${s}/${n} に ${name} がありません`);
    return [{ name, piece: map.get(name) }];
  });
}

async function build(scope) {
  const cfg = config(scope);
  const out = path.join(ROOT, 'public/assets', scope);
  fs.mkdirSync(out, { recursive: true });
  const url = f => `assets/${scope}/${f}`;
  const sheets = {}, images = {};

  for (const [name, def] of Object.entries(cfg.sheets ?? {})) {
    const list = frames(scope, def.frames);
    const cols = def.cols ?? Math.ceil(Math.sqrt(list.length));
    const { png, rows } = pack(list.map(f => f.piece), { cols, cell: def.cell, mode: def.mode });
    await sharp(png.data, { raw: { width: png.width, height: png.height, channels: 4 } })
      .webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(path.join(out, `${name}.webp`));
    sheets[name] = { url: url(`${name}.webp`), cell: def.cell, cols, rows, frames: Object.fromEntries(list.map((f, i) => [f.name, i])) };
  }
  for (const [name, def] of Object.entries(cfg.images ?? {})) {
    // from: ほかのスコープの生成画像を使う（"games/survivor/ground"）
    const [s, n] = def.from ? [def.from.slice(0, def.from.lastIndexOf('/')), def.from.slice(def.from.lastIndexOf('/') + 1)] : [scope, name];
    const file = path.join(ART, s, 'raw', `${n}.png`);
    if (!fs.existsSync(file)) throw new Error(`${path.relative(ROOT, file)} がありません（scripts/art/gen.sh ${s} ${n} で生成）`);
    await sharp(file).resize({ width: def.width }).webp({ quality: 85, effort: 6 }).toFile(path.join(out, `${name}.webp`));
    images[name] = url(`${name}.webp`);
  }

  if (cfg.ts) {
    const ts = `// 自動生成（node scripts/art/build.mjs ${scope}）。手で直さない。元: art/${scope}/art.json\n` +
      `export const SHEETS = ${JSON.stringify(sheets, null, 2)} as const;\n\n` +
      `export const IMAGES = ${JSON.stringify(images, null, 2)} as const;\n`;
    fs.writeFileSync(path.join(ROOT, cfg.ts), ts);
  }
  for (const f of fs.readdirSync(out)) console.log(`public/assets/${scope}/${f}  ${(fs.statSync(path.join(out, f)).size / 1024).toFixed(0)}KB`);
}

const targets = process.argv.slice(2);
for (const scope of targets.length ? targets : scopes()) await build(scope);
