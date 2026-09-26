// 筆順データは約170KBあるので、手書き問題を開いたときに初めて読み込む
// データ: KanjiVG (CC BY-SA 3.0, Ulrich Apel) — scripts/gen-strokes.mjs で生成
type StrokeMap = Record<string, string[]>;

let cache: Promise<StrokeMap> | null = null;

export function loadStrokes(): Promise<StrokeMap> {
  cache ??= import('./strokes.json').then(m => m.default as StrokeMap);
  return cache;
}
