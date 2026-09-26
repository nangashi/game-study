// 生成画像1枚を、きっちりしたグリッドに整える（ためしに1枚だけ整えるとき用）。
// ふだんは art/<scope>/art.json に書いて scripts/art/build.mjs を使う。
// 使い方: node scripts/art/sprite-sheet.mjs <入力.png> <出力.png> --grid 4x4 --cell 128 [--mode icons|anim] [--group blob|cell]
import { cut, pack, readPng, writePng } from './sheet-lib.mjs';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(`--${name}`); return i >= 0 ? args[i + 1] : def; };
const [src, dst] = args;
if (!src || !dst || !opt('grid')) {
  console.error('usage: node scripts/art/sprite-sheet.mjs <in.png> <out.png> --grid 4x4 --cell 128 [--mode icons|anim] [--group blob|cell]');
  process.exit(1);
}
const [cols, rows] = opt('grid').split('x').map(Number);
const { png } = pack(cut(readPng(src), cols, rows, opt('group', 'blob')), { cols, cell: Number(opt('cell', 128)), mode: opt('mode', 'icons') });
writePng(dst, png);
console.log(`${src} → ${dst}  ${cols}x${rows}`);
