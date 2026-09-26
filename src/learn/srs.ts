import type { CardState, Profile } from '../state/types';
import { addDays } from '../state/store';

// box ごとの「次に出すまでの日数」
const INTERVAL = [0, 1, 2, 4, 7, 14, 30];
export const MAX_BOX = INTERVAL.length - 1;

// 出す文字を選ぶ: 復習の期限が来たもの → まだ出していない新しい文字 → いちばん苦手なもの
export function pickCard(p: Profile, prefix: string, pool: string, today: string, exclude: Set<string>): string {
  const chars = [...pool].filter(c => !exclude.has(c));
  const card = (c: string): CardState | undefined => p.cards[`${prefix}:${c}`];
  const due = chars.filter(c => { const s = card(c); return s && s.due <= today; })
    .sort((a, b) => card(a)!.due.localeCompare(card(b)!.due) || card(a)!.box - card(b)!.box);
  if (due.length) return due[0];
  const fresh = chars.find(c => !card(c));
  if (fresh) return fresh;
  return chars.sort((a, b) => card(a)!.box - card(b)!.box || card(a)!.due.localeCompare(card(b)!.due))[0] ?? [...pool][0];
}

export function updateCard(p: Profile, key: string, good: boolean, today: string): void {
  const cur = p.cards[key] ?? { box: 0, due: today };
  const box = good ? Math.min(cur.box + 1, MAX_BOX) : 0;
  p.cards[key] = { box, due: addDays(today, INTERVAL[box]) };
}
