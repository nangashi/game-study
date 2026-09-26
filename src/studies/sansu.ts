import type { StudyDef } from './types';
import { buildQuest } from '../learn/engine';

export const SANSU: StudyDef = {
  id: 'sansu',
  name: 'さんすう',
  icon: 'abacus',
  color: 'var(--sansu)',
  build: (rng, p, length, today) => buildQuest(rng, p, p.grade === 'k' ? ['kazu'] : ['keisan', 'tokei', 'keisan'], length, today),
};
