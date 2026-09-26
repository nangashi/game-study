import type { HeroId, IconName } from '../art';

// ゲームに共通する決まりは docs/03-rewards-and-games.md

// 強化。費用は base + step × いまのレベル（コイン）。ふつうは step: 0 で一定にする
export interface UpgradeDef {
  id: string;
  name: string;
  icon: IconName;
  max: number;
  cost: { base: number; step: number };
}

export interface GameDef {
  id: string;         // 保存データのキーになるので後から変えない
  name: string;
  icon: IconName;
  desc: string;       // ひとこと説明（ひらがな）
  upgrades: UpgradeDef[];
  // 遊ぶ画面を開く。ゲーム券はもう使った状態で呼ばれる。終わったら finishGame() を呼ぶ
  open(profileId: string): void;
}

// ゲームを始めるときに渡す情報
export interface GameContext {
  avatar: HeroId;
  easy: boolean;                      // 年長さん向けのやさしい設定
  stage: number;                      // 遊ぶステージ（クリアした一番先 + 1）
  upgrades: Record<string, number>;   // 強化の id → レベル
}

// 1回遊んだ結果
export interface GameResult {
  cleared: boolean;
  stage: number;
  score: number;      // ベスト記録に使う（大きいほどよい）
}
