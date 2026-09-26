# 画像の作り方（Codex の画像生成 → 切り出し → 並べ直し）

作成日: 2026-09-26 / 更新: 2026-09-26（ゲームごとに画像を分けた。どのゲームでも同じ手順で作れるようにした）

どのゲームでもこの手順で作る。ゲームごとの画像の一覧は、各ゲームの設計書（`docs/games/<id>.md`）に書く。

## 全体の流れ

```
① プロンプトを書く        art/<スコープ>/prompts/<名前>.txt
② Codex で生成            scripts/art/gen.sh <スコープ> <名前>...   → art/<スコープ>/raw/<名前>.png（git に入れない）
③ 使い方を書く            art/<スコープ>/art.json（切り方・名前・どのシートに入れるか）
④ 切り出して並べ直す      node scripts/art/build.mjs [<スコープ>]    → public/assets/<スコープ>/*.webp
                                                                      + 対応表 *.gen.ts（フレーム名 → 番号）
⑤ コードで使う            DOM: spriteEl(SHEETS.icons, 'heart') / Phaser: loadSheet(scene, 'icons', SHEETS.icons)
```

## スコープ（画像の持ち主）

| スコープ | 中身 | 出力 | 対応表 |
|---|---|---|---|
| `common` | 土台の画像: コイン・券などのアイコン、勉強で使う絵（かぞえる絵）、子どものアバター（`hero_*`）、ホームの背景 | `public/assets/common/` | `src/assets/common.gen.ts`（`src/art.ts` から使う） |
| `games/<id>` | そのゲームだけの画像: キャラ・敵・アイコン・背景 | `public/assets/games/<id>/` | `src/games/<id>/assets.gen.ts` |
| `lab` | あそびラボの試作用（ほかのスコープの生成画像を並べ直しただけ） | `public/assets/lab/` | `src/lab/assets.gen.ts`（`src/lab/assets.ts` から使う） |

- **ゲームの画像はゲームのスコープに置く。** ゲームのコードは自分の `assets.gen.ts` を使う（型で、ほかのゲームのアイコン名は使えないようになっている）。
- 土台のアイコン（コイン・券・もどる など）は、土台の通貨や操作を表すときだけゲームの中でも使ってよい（`src/games/kit/ui.ts`）。
- 子どものアバターをゲームの主人公に使ってもよいし（サバイバー）、ゲームだけのキャラを作ってもよい（ひっぱりアタック）。
- ほかのスコープの **生成画像** から絵を取り出して、自分のシートに入れてよい（`"common/icons1:bolt"`。1枚絵は `"images": { "ground": { "width": 512, "from": "games/survivor/ground" } }`）。出力は自分のスコープに置くので、ゲームどうしは独立したまま。

## ① プロンプト

`art/<スコープ>/prompts/<名前>.txt`。出力ファイル名（`./<名前>.png`）をプロンプトの中にも書く。

共通で入れること:

```
Art style: same as the attached reference image (flat cel-shaded chibi cartoon, thick dark outlines, bright friendly colors) for a kids game (ages 5-8), cute and not scary. Use the reference ONLY for art style; the content is different. No text, no letters, no numbers, no grid lines.
Background: fully transparent (real PNG alpha).
Do NOT post-process, crop, or edit the generated image; save it exactly as generated. Report the path and pixel size.
```

絵の集まり（アイコン・キャラ・敵）:

```
Layout: a strict 4x4 grid on a square canvas, 16 equal cells. One icon per cell, centered, similar visual size, with clear transparent margin so no icon touches or crosses a cell boundary.
Icons in reading order (row by row, left to right):
row1: ..., row2: ...
```

- 6つなら「3 columns x 2 rows ... on a landscape canvas」（1536×1024 で出る）。
- 1枚のシートは多くても 4x4 = 16 個まで。

アニメーション（同じキャラの連続したコマ）:

```
A 4-frame walk cycle of the SAME character, facing right, with clearly visible leg movement (legs swing wide apart in frames 1 and 3, pass each other in frames 2 and 4).
Layout: a strict 2x2 grid on a square canvas, frames in reading order.
In every frame the character is the same size, horizontally centered in its cell, feet on the same baseline near the bottom of the cell, never crossing into another cell.
```

背景・床（1枚絵）: 「Opaque image (no transparency).」。ボタンを上に置く背景は「Keep the center area calm and low-detail」、キャラを上に置く床は「LOW CONTRAST so characters on top stand out」。縦長なら「PORTRAIT canvas (2:3)」。

## ② 生成

```bash
scripts/art/gen.sh games/hippari chars enemies icons
```

- 中身は `codex exec --skip-git-repo-check -s workspace-write -C art/<スコープ>/raw "<プロンプト>" -i art/style-ref.png < /dev/null`
- 絵柄は `art/style-ref.png`（最初に作った主人公）にそろえる。これを `-i` で渡して「same art style」と書くと統一できる。
- `-i` は引数を複数とるので、**プロンプトより後ろ**に書く（前に書くとプロンプトが画像パスとして扱われる）。
- 標準入力を閉じる（`< /dev/null`）。閉じないと「Reading additional input from stdin...」で止まる。
- 1枚 2〜5分。Codex（ChatGPT アカウント）の使用量を使う。
- 生成画像（1枚 約1〜2MB）は git に入れない（`art/**/raw/`）。別の端末で作り直すときは生成からやり直すか、`raw/` を写す。

## ③ art.json

```jsonc
{
  "ts": "src/games/hippari/assets.gen.ts",          // 対応表の出力先
  "sources": {                                        // 生成画像の切り方と、絵の名前（読み順）
    "chars": { "grid": "3x2", "names": ["panda", "chick", "penguin", "hamster", "piglet", "bear"] },
    "icons": { "grid": "4x4", "group": "cell", "names": ["glove", "arm", /* ... */] }
  },
  "sheets": {                                         // 出力するスプライトシート
    "chars": { "cell": 192, "cols": 3, "frames": ["chars:*"] },          // "*" は全部
    "icons": { "cell": 128, "frames": ["icons:heart", "common/icons1:coin"] }, // ほかのスコープからも取れる
    "hero":  { "cell": 160, "cols": 2, "mode": "anim", "frames": ["hero:*"] }
  },
  "images": { "field": { "width": 720 } }            // 1枚絵（幅をそろえて WebP にするだけ）
}
```

- `cols` を書かないと、なるべく正方形になるように決める。
- `mode`: `icons`（1つずつセルいっぱいに収めて中央に置く）/ `anim`（全コマ同じ倍率。横は重心、縦は足元をそろえる）。
- `group`（切り方）:
  - `blob`（ふつう）: 大きい塊を絵の本体とし、小さいかけら（きらきら）を近い本体にくっつける。**行の間隔がずれていても切れる**。
  - `cell`: 塊を、中心がある「グリッドのマス」ごとにまとめる。**3つのたま・紙ふぶきのように、ばらばらの部品でできた絵**があるときに使う。

## ④ 切り出して並べ直す

```bash
node scripts/art/build.mjs                 # すべて
node scripts/art/build.mjs games/hippari   # 1つだけ
node scripts/art/sprite-sheet.mjs raw/x.png out.png --grid 4x4 --cell 128 [--group cell]   # ためしに1枚だけ
```

中でやっていること（`scripts/art/sheet-lib.mjs`）:

1. 不透明度をそろえる（生成画像の本体は 222〜254 なので 255 に、ほぼ透明なノイズは 0 に）
2. 透明でない塊（連結成分）を見つけ、絵ごとにまとめる（`group`）
3. 1つずつ切り出す（となりの絵がはみ出していても写さない）
4. きっちりしたグリッドに並べ、面積平均で縮小する（ふちが黒ずまないようにアルファで重みづけ）
5. WebP で `public/assets/<スコープ>/` に出し、フレーム名の対応表 `*.gen.ts` を書く

絵の数が合わない・空のマスがあるときはエラーで止まる → プロンプトを直して作り直す。

`raw/` の生成画像がない（別の端末で作った）シート・1枚絵は、前に出力した `public/assets/` と対応表をそのまま使う（ログに「raw がないので前の出力を使う」と出る）。こうすると、新しく作った画像だけを足せる。

## ⑤ コードで使う

```ts
import { SHEETS, IMAGES } from './assets.gen';
import { spriteEl, assetUrl } from '../../assets/sprite';
import { loadSheet } from '../kit/phaser';

spriteEl(SHEETS.icons, 'heart', 48);                       // DOM（CSS スプライト）。名前は型でしらべられる
loadSheet(this, 'icons', SHEETS.icons);                    // Phaser の preload
this.add.image(x, y, 'icons', SHEETS.icons.frames.heart);  // Phaser
this.load.image('field', assetUrl(IMAGES.field));          // 1枚絵
```

## スプライトシートにするか

| 画像 | シートにする? | 理由 |
|---|---|---|
| アイコン・キャラ・敵（小さい絵がたくさん） | する | 生成は16個まとめての方が速く、絵柄もそろう。読みこみが1回ですみ、Phaser では同じテクスチャなのでまとめて描ける |
| アニメーション | する（2x2） | コマの大きさと足元をそろえられる |
| 背景・床（大きい1枚絵） | しない（`images`） | 1枚で大きいので、まとめる得がない |

ゲームのスコープごとに「アイコン1枚・キャラ1枚・敵1枚 + 背景」くらいが目安（1ゲーム 300〜600KB）。

## 検証で分かったこと

| | 結果 |
|---|---|
| 1枚の絵 | きれい。背景は本当に透明（半透明は ふちの数ピクセルだけ） |
| 2x2 のアニメ | 4コマとも同じキャラで、グリッドも守られていた。足元の高さが ±13px ずれる → `anim` でそろう |
| 4x4 のアイコン | 16個とも指示どおりの順番と内容。ただし行の間隔がずれ、セル境界をまたぐものがあった → グリッドで機械的に切ると壊れるので、塊で切る |
| ばらばらの部品の絵（3つのたま・紙ふぶき） | `blob` だと部品を別の絵とまちがえる → `group: "cell"` で切れた |
| 3x2 | 横長（1536x1024）で出る。塊で問題なく切れた |
| 地面の敷きつめ | 左右・上下のつなぎ目の差は平均 1/255 程度。見た目では分からない |
| 縦長の床（2:3） | 1024x1536 で出た。ふちつきのマットになった |
| 歩きの動き | 「legs swing wide apart in frames 1 and 3, pass each other in frames 2 and 4」と書くと、足の動きがはっきりした |
| 整形後 | セル境界をまたぐものはなく、アニメの足元と中心のずれは ±0〜1px |
