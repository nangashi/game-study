import type { CardState, Profile } from '../state/types';
import { addDays } from '../state/store';

// box ごとの「次に出すまでの日数」
const INTERVAL = [0, 1, 2, 4, 7, 14, 30];
export const MAX_BOX = INTERVAL.length - 1;

// good: 正解 → 次の段へ / slow: 正解だが遅い（ドリル） → 段はそのままで、次の日にまた出す / bad: まちがい → はじめから
export type Result = 'good' | 'slow' | 'bad';

// jumpTo: はじめてで正解したときに飛ばす先の段（firstBox()）
export function updateCard(p: Profile, key: string, result: Result, today: string, ms?: number, jumpTo?: number): void {
  const cur = p.cards[key] ?? { box: 0, due: today };
  const box = result === 'good' ? jumpTo ?? Math.min(cur.box + 1, MAX_BOX) : result === 'slow' ? cur.box : 0;
  const next: CardState = { box, due: addDays(today, result === 'slow' ? 1 : INTERVAL[box]) };
  const time = ms ?? cur.ms;
  if (time != null) next.ms = time;
  p.cards[key] = next;
}
