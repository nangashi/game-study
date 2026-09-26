import type { Profile } from '../state/types';
import { gradeRank } from '../state/types';
import type { Question } from '../learn/types';
import { pickOne } from '../learn/engine';
import { numberToChoice } from '../learn/math';
import { pick, type Rng } from '../learn/random';
import { STUDIES } from './registry';

// ゲームの中のクイズ（すぐ答えられる3択だけ）。自分の学年のカテゴリから出す（なければ下の学年）
export function battleQuiz(rng: Rng, p: Profile, today: string): Question {
  const cats = STUDIES.flatMap(s => s.categories).filter(c => c.quiz && gradeRank(c.grade) <= gradeRank(p.grade));
  const top = Math.max(...cats.map(c => gradeRank(c.grade)));
  const cat = pick(rng, cats.filter(c => gradeRank(c.grade) === top));
  const q = cat.make(pickOne(p, cat, today), rng, p);
  return q.kind === 'number' ? numberToChoice(rng, q) : q;
}
