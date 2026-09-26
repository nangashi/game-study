import type { IconName } from '../art';
import type { Question } from '../learn/types';
import type { Rng } from '../learn/random';
import type { Profile } from '../state/types';

// 勉強（教科）。ホームのボタンと、ゲーム券の「きょうはじめての教科」の単位になる
// 足しかたは docs/03-rewards-and-games.md の「新しい勉強を足すときの手順」
export interface StudyDef {
  id: string;        // 保存データのキーになるので後から変えない
  name: string;      // ひらがな
  icon: IconName;
  color: string;     // ボタンの色
  // 1クエストぶんの問題を作る。答えは applyAnswer で記録される（コインもそこで決まる）
  build(rng: Rng, p: Profile, length: number, today: string): Question[];
}
