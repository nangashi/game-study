# ゲーム画像の作り方（Codex の画像生成 + スプライトシート）

作成日: 2026-09-26 / 検証で作った画像は、主人公・スライム・地面・歩きアニメ（2x2）・アイコン（4x4）の5枚

## いまの画像一覧（2026-09-26 に作成）

| ファイル | 中身 | プロンプト |
|---|---|---|
| hero_wizard / witch / knight / ninja / cat / dino | 主人公6人の歩きアニメ（2x2、160px） | art/prompts/hero_*.txt |
| enemies | スライム・おばけ・コウモリ・キノコ・ゴーレム・ドラゴン（3x2、160px） | art/prompts/enemies.txt |
| icons1 | コイン・羽・星・券・まほうだま・まわるほし・ジェム・爆発・ハート・くつ・じしゃく・剣・えんぴつ・そろばん・双剣・ハンマー（4x4、128px） | 検証時のプロンプト（本文参照） |
| icons2 | かぞえる絵8種・ほのお・時計・トロフィー・家・もどる・家族・まる・あせ（4x4、128px） | art/prompts/icons2.txt |
| ground / home_bg | バトルの地面（512px）、ホーム画面の背景（1600px） | art/prompts/home_bg.txt |

フレーム番号と名前の対応は `src/art.ts`。全部で約470KB（WebP）。

```bash
scripts/gen-art.sh hero_witch enemies   # art/raw/ に生成（Codex）
node scripts/build-art.mjs              # 整えて public/sprites/ に WebP で出力
```

`art/raw/`（生成したままの画像、1枚約1MB）は git に入れない。作り直すときは生成からやり直す。

## 流れ

```
① Codex で生成（1枚 1〜2分）
     ↓ そのまま保存（Codex に加工させない）
② scripts/sprite-sheet.mjs で整える
     ↓ 塊を1つずつ切り出す → きっちりしたグリッドに並べ直す → 縮小
③ public/ に置いて Phaser の spritesheet として読む
```

## ① 生成

```bash
codex exec --skip-git-repo-check -s workspace-write -C <出力先> "<プロンプト>" -i <絵柄の参考画像.png>
```

- `-i` は引数を複数とるので、**プロンプトより後ろ**に書く（前に書くとプロンプトが画像パスとして扱われる）
- Codex 内蔵の `image_gen` ツールを使う。モデル名は表示されない
- 出力は 1254×1254 の PNG（アルファつき）。背景透過の指示は守られる
- **絵柄をそろえる**：既存の画像（`player.png` など）を `-i` で渡して「same art style」と書く。これで統一できた

### プロンプトの型

共通で入れること：

```
Art style: same as the attached reference (flat cel-shaded cartoon, thick dark outlines, bright friendly colors) for a kids' game (ages 5-8), not scary.
No text, no letters, no numbers, no grid lines.
Background: fully transparent (real PNG alpha).
Do NOT post-process, crop, or edit the generated image; save it as generated.
```

アニメーション（同じキャラの連続したコマ）：

```
A 4-frame walk cycle of the SAME character as the reference, facing right.
Layout: a strict 2x2 grid on a square canvas, frames in reading order.
In every frame the character is the same size, horizontally centered in its cell,
feet on the same baseline near the bottom of the cell, never crossing into another cell.
```

アイコン集（別々のもの）：

```
Layout: a strict 4x4 grid on a square canvas, 16 equal cells. One icon per cell, centered,
similar visual size, with clear transparent margin so no icon touches a cell boundary.
Icons in reading order: row1: ..., row2: ...
```

地面など敷きつめる画像：「top-down seamless tileable ..., low contrast so sprites stand out, no objects crossing edges, opaque」

### 検証で分かったこと

| | 結果 |
|---|---|
| 1枚の絵 | きれい。背景は本当に透明 |
| 2x2 のアニメ | 4コマとも同じキャラで、グリッドも守られていた。足元の高さが ±13px ずれる。コマの動きは小さめ |
| 4x4 のアイコン | 16個とも指示どおりの順番と内容。ただし**行の間隔がずれ、セル境界をまたぐものがあった** → グリッドで機械的に切ると壊れる |
| 地面の敷きつめ | 左右・上下のつなぎ目の差は平均 1/255 程度。見た目では分からない |
| 不透明度 | 本体の不透明度が 222〜254（255 ではない）。整形のときに 255 にそろえる |
| 3x2 の敵 | 横長（1536x1024）で出てきた。6体とも指示どおり。塊の検出で問題なく切り出せた |
| 歩きの動き | 「legs swing wide apart in frames 1 and 3, pass each other in frames 2 and 4」と書くと、足の動きがはっきりした |

→ **グリッドは信用せず、塊（連結成分）で切り出してから並べ直す**。
1枚のシートは多くても 4x4 = 16 個まで。アニメは 2x2（4コマ）を基本にする。

## ② 整える

```bash
# アイコン集: 1つずつセルいっぱいに収めて中央に置く
node scripts/sprite-sheet.mjs raw/icons.png public/sprites/icons.png --grid 4x4 --cell 128 --mode icons
# アニメ: 全コマ同じ倍率。横は重心、縦は足元をそろえる
node scripts/sprite-sheet.mjs raw/walk.png public/sprites/walk.png --grid 2x2 --cell 128 --mode anim
```

- 小さなかけら（きらきら、飛び散り）は近い本体にくっつける
- 塊の数がグリッドの数と合わないときはエラーで止まる → 作り直す
- 検証の結果：整形後はセル境界をまたぐものがなく、アニメの足元と中心のずれは ±0〜1px

## ③ ゲームで読む

```ts
this.load.spritesheet('icons', 'sprites/icons.png', { frameWidth: 128, frameHeight: 128 });
this.anims.create({ key: 'walk', frames: this.anims.generateFrameNumbers('walk', { start: 0, end: 3 }), frameRate: 8, repeat: -1 });
```

Phaser 4 で読み込んでアニメーションが再生されることを確認済み。

## 注意

- 生成は Codex（ChatGPT アカウント）の使用量を使う
- 元の生成画像（1枚 約1MB）はリポジトリに入れず、整形後のもの（128px のセルで 1シート 100〜300KB）を入れる
