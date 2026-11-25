// 漢字の単語データ（game-study-design/kanji-data/grade1〜6.json）から src/learn/kanji/words-data.ts を作る
// 使い方: node scripts/gen-kanji-words.mjs <kanji-data のディレクトリ>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2];
if (!dir) { console.error('usage: node scripts/gen-kanji-words.mjs <kanji-data dir>'); process.exit(1); }

const lines = [
  '// 自動生成（scripts/gen-kanji-words.mjs）。手で直さない。元データは game-study-design/kanji-data/grade1〜6.json',
  "import type { KanjiEntry } from './words';",
  '',
  '// 学年ごと（1〜6年）。学年内は配当表の順',
  'export const KANJI_GRADES: readonly (readonly KanjiEntry[])[] = [',
];
for (let g = 1; g <= 6; g++) {
  const entries = JSON.parse(readFileSync(join(dir, `grade${g}.json`), 'utf8'));
  lines.push(`  // ${g}年（${entries.length}字）`, '  [');
  for (const e of entries) lines.push(`    { kanji: ${JSON.stringify(e.kanji)}, words: ${JSON.stringify(e.words)} },`);
  lines.push('  ],');
}
lines.push('];', '');
writeFileSync(new URL('../src/learn/kanji/words-data.ts', import.meta.url), lines.join('\n'));
