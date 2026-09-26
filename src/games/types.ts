import type { HeroId } from '../art';
import type { Sheet } from '../assets/sprite';
import type { GameProgress } from '../state/types';

// ゲームに共通する決まりは docs/03-rewards-and-games.md
// 土台（プラットフォーム）がやるのは「ゲームをえらぶ」まで。そこから先（タイトル・つよくする・ステージ選び・
// 遊ぶ画面・結果）はゲームが自分で作る。ただしゲーム券・コイン・強化の費用は、かならず Platform を通す

// 強化。費用は base + step × いまのレベル（コイン）。ふつうは step: 0 で一定にする
// kind: 数値の強化（stat）か、解放（unlock: スキル・さいしょの武器・装備など）か。どちらも1段階 = 推奨強化レベル1つ（docs/03 4. 7.）
export interface UpgradeDef {
  id: string;
  name: string;
  icon: string;       // ゲームのシートのフレーム名
  max: number;
  cost: { base: number; step: number };
  kind?: 'stat' | 'unlock';   // 省略すると stat
  desc?: string;              // 解放で なにができるようになるか（ひらがな）
}

export interface GameDef {
  id: string;         // 保存データのキーになるので後から変えない
  name: string;
  desc: string;       // ひとこと説明（ひらがな）
  cover: { sheet: Sheet; frame: string };   // ゲームをえらぶ画面の絵（ゲームの画像から）
  stages: number;     // ステージの数（ステージのないゲームは 1）
  upgrades: UpgradeDef[];
  // ゲームを読みこむ。Phaser などの重いものは、ここで import() して遊ぶときだけ読む
  load(): Promise<GameModule>;
}

export interface GameModule {
  // ゲームのタイトル画面から始める。もどるときは platform.exit()
  open(root: HTMLElement, platform: Platform): void;
}

// 土台がゲームに渡すもの。保存も Platform の中でやる
export interface Platform {
  readonly player: { name: string; avatar: HeroId; easy: boolean };
  wallet(): { coins: number; tickets: number };
  progress(): Readonly<GameProgress>;
  // 強化（費用は共通の決まり。コインが足りない・MAX なら false）
  upgradeLevel(id: string): number;
  upgradeCost(id: string): number;
  canUpgrade(id: string): boolean;
  buyUpgrade(id: string): boolean;
  // 遊べるステージの一番先（クリアした一番先 + 1。stages をこえない）
  maxStage(): number;
  // ゲーム券を1まい使って、1回のプレイを始める。券がない・ステージが遊べないなら null
  startRun(stage: number): GameContext | null;
  // 1回のプレイの結果をわたす。コインと進みぐあいは土台が計算する（ゲームでコインを配らない）
  endRun(result: GameResult): GameReward;
  // クイズそのものが遊びになっているゲームだけが使う（docs 8.）。正解なら true。コインは出ない
  quiz(title: string, note: string): Promise<boolean>;
  // ゲームだけが使う小さな保存データ（えらんだキャラなど）。数値の強さには使わない
  data<T>(): T | undefined;
  saveData<T>(value: T): void;
  exit(): void;
}

// 1回のプレイを始めるときの情報
export interface GameContext {
  avatar: HeroId;
  easy: boolean;                      // 年長さん向けのやさしい設定
  stage: number;
  upgrades: Record<string, number>;   // 強化の id → レベル
}

// 1回遊んだ結果
export interface GameResult {
  cleared: boolean;
  stage: number;
  score: number;      // ベスト記録に使う（大きいほどよい）
}

export interface GameReward { coins: number; firstClear: boolean }
