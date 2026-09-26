// KanjiVG から、アプリで使う文字の筆順パス(SVG path)を抜き出して JSON にする。
// 使い方: KANJIVG_DIR=/path/to/kanjivg/kanji node scripts/gen-strokes.mjs
// KanjiVG: https://kanjivg.tagaini.net/ (CC BY-SA 3.0, Ulrich Apel)
import fs from 'node:fs';
import { CHAR_SETS } from '../src/data/char-sets.js';

const dir = process.env.KANJIVG_DIR;
if (!dir) throw new Error('KANJIVG_DIR を指定してください (kanjivg の kanji/ ディレクトリ)');

const out = {};
for (const ch of new Set(Object.values(CHAR_SETS).join(''))) {
  const file = `${dir}/${ch.codePointAt(0).toString(16).padStart(5, '0')}.svg`;
  const svg = fs.readFileSync(file, 'utf8');
  out[ch] = [...svg.matchAll(/id="kvg:[0-9a-f]+-s\d+"[^>]*\sd="([^"]+)"/g)].map(m => m[1]);
  if (!out[ch].length) throw new Error(`no strokes for ${ch}`);
}
fs.writeFileSync('src/learn/handwriting/strokes.json', JSON.stringify(out));
console.log(`${Object.keys(out).length} chars`);
