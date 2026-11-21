import type { StudyDef } from './types';
import * as K from '../learn/kokugo';

// カテゴリは学年ごと（学年の中で、習う順）。けいさん以外のテーマを足すときの材料
export const KOKUGO: StudyDef = {
  id: 'kokugo',
  name: 'こくご',
  categories: [
    K.hiraWrite('k'), K.hiraMatch,
    K.hiraWrite(1), K.kataWrite, K.kanjiWrite(1), K.kanjiRead(1), K.tokushu, K.joshi, K.katago, K.nakama, K.bun,
    K.kanjiWrite(2), K.kanjiRead(2), K.okuri, K.kanazukai, K.hantai, K.yousu, K.hanashi,
    K.romaji, K.jisho, K.bushu, K.kosoado, K.tsunagi, K.kotowaza,
  ],
};
