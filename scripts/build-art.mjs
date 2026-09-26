// art/raw/ の生成画像を整えて public/sprites/ に WebP で出力する。
// 使い方: node scripts/build-art.mjs
// 詳しい流れ: docs/02-asset-generation.md
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

const RAW = 'art/raw';
const OUT = 'public/sprites';
const HEROES = ['wizard', 'witch', 'knight', 'ninja', 'cat', 'dino'];

// スプライトシート: [生成画像, グリッド, セルの大きさ, モード]
const SHEETS = [
  ...HEROES.map(h => [`hero_${h}`, '2x2', 160, 'anim']),
  ['enemies', '3x2', 160, 'icons'],
  ['icons1', '4x4', 128, 'icons'],
  ['icons2', '4x4', 128, 'icons'],
];
// 1枚絵: [生成画像, 幅]
const IMAGES = [['ground', 512], ['home_bg', 1600]];

fs.mkdirSync(OUT, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'art-'));
const webp = (src, dst) => sharp(src).webp({ quality: 88, alphaQuality: 90, effort: 6 }).toFile(dst);

for (const [name, grid, cell, mode] of SHEETS) {
  const src = `${RAW}/${name}.png`;
  if (!fs.existsSync(src)) { console.warn(`skip ${name}: ${src} がありません`); continue; }
  const png = `${tmp}/${name}.png`;
  execFileSync('node', ['scripts/sprite-sheet.mjs', src, png, '--grid', grid, '--cell', String(cell), '--mode', mode], { stdio: 'inherit' });
  await webp(png, `${OUT}/${name}.webp`);
}
for (const [name, width] of IMAGES) {
  const src = `${RAW}/${name}.png`;
  if (!fs.existsSync(src)) { console.warn(`skip ${name}: ${src} がありません`); continue; }
  await sharp(src).resize({ width }).webp({ quality: 85, effort: 6 }).toFile(`${OUT}/${name}.webp`);
}
fs.rmSync(tmp, { recursive: true });
for (const f of fs.readdirSync(OUT)) console.log(`${OUT}/${f}  ${(fs.statSync(`${OUT}/${f}`).size / 1024).toFixed(0)}KB`);
