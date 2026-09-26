import type { StudyDef } from './types';
import * as M from '../learn/math';

// カテゴリは学年ごと。ならびは画面の順（学年の中で、習う順）
export const SANSU: StudyDef = {
  id: 'sansu',
  name: 'さんすう',
  icon: 'abacus',
  color: 'var(--sansu)',
  categories: [
    M.kazuCount, M.kazuAdd, M.kazuSub, M.kurabe,
    M.drill1, M.ikutsu, M.narabi, M.add10, M.sub10, M.addCarry, M.subBorrow, M.mittsu, M.nanjuu, M.tokei1, M.tokei2, M.nagasa, M.bun1,
    M.drill2, M.kazu2, M.add2, M.sub2, M.kuku1, M.kuku2, M.monosashi, M.nagasaTani, M.kasa, M.tokei3, M.jikoku, M.bunsu2, M.katachi, M.graph, M.bun2,
    M.drill3, M.add3, M.sub3, M.kake1, M.kake2, M.waru, M.amari, M.ookii, M.shosu, M.bunsu3, M.tani3, M.jikan, M.en, M.shiki, M.bouGraph, M.bun3,
  ],
};
