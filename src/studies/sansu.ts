import type { StudyDef } from './types';
import * as M from '../learn/math';

export const SANSU: StudyDef = {
  id: 'sansu',
  name: 'さんすう',
  icon: 'abacus',
  color: 'var(--sansu)',
  categories: [
    M.kazuCount, M.kazuAdd, M.kazuSub,
    M.add10, M.addCarry, M.sub10, M.subBorrow, M.tokei1,
    M.add2, M.sub2, M.kuku1, M.kuku2, M.tokei2,
    M.add3, M.sub3, M.tokei3,
  ],
};
