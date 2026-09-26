# まなびサバイバー

年長〜小学校低学年向けの「勉強するとゲームが強くなる」家族用の学習アプリ。Android タブレット（横長）のブラウザで動く PWA。全体像は README.md。

## ゲーム候補（あそびラボ）の開発

「◯◯の本格実装をしたい」「◯◯を作りこみたい」と頼まれたら、**まず [docs/03-game-candidates.md](docs/03-game-candidates.md) を読む**。候補ごとのルール、パラメータ、わかっている問題、本格実装でやること、最初にユーザーに確認することが書いてある。

| 呼び方 | id | ファイル |
|---|---|---|
| モンスターまもり（モンスターサバイバル風） | `defense` | `src/lab/DefenseScene.ts` |
| ひっぱりアタック（モンスト風） | `sling` | `src/lab/SlingScene.ts` |
| ぱくぱくビッグ（Hole.io 風） | `grow` | `src/lab/GrowScene.ts` |

- 共通部分は `src/lab/common.ts`（`LabScene` / `HudScene` / `sfx`）、画面は `src/ui/screens/lab.ts`
- バランスを変えたら `scripts/playtest.mjs` の自動プレイで、うまい遊び方とへたな遊び方を比べる（使い方は docs/03）
- 作業の結果（調整の記録、わかった問題）は docs/03 の該当する節に書き足す

## 決まりごと

- 画面の文字は子ども向け: ひらがな中心で、単語ごとに半角スペースで区切る（例: 「ひっぱって はなすと とんでいく」）。年長さんは字が読めない前提で、絵と動きで伝える
- コードのコメントも、今のコードに合わせて日本語でやさしく書く
- 画像は `public/sprites/` にあるものを使い回す。新しく作るときは docs/02-asset-generation.md

## コマンド

```bash
npm run dev     # http://localhost:5173
npm test
npm run build   # 型チェック（tsc --noEmit）+ ビルド
```
