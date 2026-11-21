import type { StudyDef } from './types';
import { KOKUGO } from './kokugo';
import { SANSU } from './sansu';

// 勉強を足すときはここに追加する
export const STUDIES: StudyDef[] = [KOKUGO, SANSU];

export const studyDef = (id: string): StudyDef | undefined => STUDIES.find(s => s.id === id);
