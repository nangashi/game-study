import type { StudyDef } from './types';
import type { Grade, TrackId } from '../state/types';
import { buildQuest } from '../learn/engine';

// 学年ごとの1クエストの中身
const PLAN: Record<Grade, TrackId[]> = {
  k: ['hira-write', 'hira-match', 'hira-write', 'hira-match', 'hira-write'],
  1: ['hira-write', 'kanji-read', 'kata-write', 'kanji-write', 'hira-write'],
  2: ['kanji-write', 'kanji-read', 'kata-write', 'kanji-write', 'kanji-read'],
  3: ['kanji-write', 'kanji-read', 'kata-write', 'kanji-write', 'kanji-read'],
};

export const KOKUGO: StudyDef = {
  id: 'kokugo',
  name: 'こくご',
  icon: 'pencil',
  color: 'var(--kokugo)',
  build: (rng, p, length, today) => buildQuest(rng, p, PLAN[p.grade], length, today),
};
