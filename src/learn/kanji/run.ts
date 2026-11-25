import type { SelfGrade, SessionItem } from './srs';

// 書き取りの1回（画面の進め方）。buildSession の10問のあと、「できなかった」字を回の最後にもう1回出す（10問に数えない）。
// 記録（applyResult）は1字1回だけ。2回目のある字は2回目の結果、ほかは1回目の結果を入れる

export interface KanjiRun {
  items: readonly SessionItem[];  // 10問（buildSession の結果）
  retries: SessionItem[];         // もう1回出す字（1回目に「できなかった」順）
  pos: number;                    // いま出している位置（items のあとに retries が続く）
  first: SelfGrade[];             // items の1回目の結果（答えた順）
  final: Map<string, SelfGrade>;  // 字 → 記録する結果（記録してよいものだけ）
}

export const startRun = (items: readonly SessionItem[]): KanjiRun =>
  ({ items, retries: [], pos: 0, first: [], final: new Map() });

// いま出す字（終わっていれば null）。retry: もう1回の字か
export function currentItem(run: KanjiRun): { item: SessionItem; retry: boolean } | null {
  if (run.pos < run.items.length) return { item: run.items[run.pos], retry: false };
  const r = run.retries[run.pos - run.items.length];
  return r ? { item: r, retry: true } : null;
}

export const isDone = (run: KanjiRun): boolean => currentItem(run) === null;

// 答えた。すぐ記録してよい結果なら返す（1回目の「できなかった」は、もう1回のあとまで待つので null）
export function answer(run: KanjiRun, grade: SelfGrade): { kanji: string; grade: SelfGrade } | null {
  const cur = currentItem(run);
  if (!cur) return null;
  run.pos++;
  const { kanji } = cur.item;
  if (!cur.retry) {
    run.first.push(grade);
    if (grade === 'wrong') { run.retries.push(cur.item); return null; }
  }
  run.final.set(kanji, grade);
  return { kanji, grade };
}

// 途中でやめたとき、まだ記録していない字（もう1回を待っている字）を1回目の結果で返す
export function pendingOnQuit(run: KanjiRun): { kanji: string; grade: SelfGrade }[] {
  return run.retries.filter(it => !run.final.has(it.kanji)).map(it => ({ kanji: it.kanji, grade: 'wrong' as const }));
}

// 結果画面の内訳（最後の結果で分ける）
// fresh: あたらしく とけた字（ふくしゅう でない字で「できた」）、review: ふくしゅうの字、practice: まだ れんしゅうの字
export function runSummary(run: KanjiRun): { fresh: string[]; review: string[]; practice: string[] } {
  const fresh: string[] = [], review: string[] = [], practice: string[] = [];
  for (const it of run.items) {
    if (it.kind === 'review') review.push(it.kanji);
    else if (run.final.get(it.kanji) === 'correct') fresh.push(it.kanji);
    else practice.push(it.kanji);
  }
  return { fresh, review, practice };
}
