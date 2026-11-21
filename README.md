# まなびランド

子ども2人（年長〜小学校低学年）が、短時間で国語と算数の基礎を練習できて、進み具合が見られる学習アプリ（家族用）。
Android タブレットのブラウザで動く PWA で、Cloudflare の無料プランに置く。

（保存データのキーと Cloudflare の Worker 名 `manabi-survivor` は、旧まなびランドの名残り）

## 作り替え中（2026-11-21〜）

旧まなびランド（勉強するとゲームが強くなるアプリ）から、ゲームとごほうびを外し、学習と記録だけのアプリに作り替えている。

- できているもの
  - 算数「けいさん」の道（47ステージ）・10問セット・星とクリアの判定・ちからだめし: 算数練習アプリから TypeScript に移植（`src/learn/keisan/`、画面はまだ）。仕様は [docs/03-keisan.md](docs/03-keisan.md)
  - 手書きの判定（`src/learn/handwriting/`）と書き取りの画面部品（`src/ui/widgets/writepad.ts`）
- まだ旧まなびランドのままのもの: 画面（`src/ui/screens/`）、学年・カテゴリえらびと間隔反復（`src/learn/engine.ts`・`srs.ts`）、端末だけの保存（`src/state/`）
- これから: 新しい画面（子ども選択 → テーマ → 道 → 問題／書き取り → 結果）、新しい記録（星・クリア・ベストタイム）、Worker + KV での家族共有と Cloudflare Access

### MVP でやること

- 教科 → テーマ → 一本道の単元。中身は算数「けいさん」と国語「ひらがなを かく」の2つ。ほかのテーマは「あとで ふえる」
- 何をやるかは子どもが自分で選ぶ。道の単元はどれでも選べる（先の単元は警告つき）
- 結果は星（0〜3）とクリア。けいさんはベストタイムも残す

## 開発

```bash
npm install
npm run dev        # http://localhost:5173 （--host つきなので、同じLANのタブレットからも開ける）
npm test
npm run build      # 型検査 + ビルド
```

構成: TypeScript + Vite + vite-plugin-pwa。

```
src/
  learn/
    keisan/       けいさんの道（ステージ・問題の作り方・10問セット・星とクリア・ちからだめし）
    handwriting/  手書きの判定と筆順データ（KanjiVG）
    math.ts kokugo.ts engine.ts srs.ts   旧まなびランドの問題と間隔反復（作り替えで整理する）
  studies/        旧まなびランドの教科・カテゴリ
  state/          保存データ（旧形式）
  assets/ art.ts  画像（スプライト）の扱いと、生成画像の対応表
  ui/             画面（DOM）と部品（writepad・kanapad）
  data/           文字セット・漢字のことば・問題バンク
scripts/gen-strokes.mjs   KanjiVG から筆順データを作る
scripts/art/              画像の生成と切り出し（docs/02-asset-generation.md）
prototypes/handwriting/   手書き判定の検証用プロトタイプ（docs/01-handwriting-feasibility.md）
```

筆順データを作り直すとき（文字を増やしたとき）は、[KanjiVG](https://github.com/KanjiVG/kanjivg/releases) の zip を展開してから:

```bash
KANJIVG_DIR=/path/to/kanjivg/kanji npm run gen:strokes
```

## Cloudflare に置く

```bash
npx wrangler login
npm run deploy
```

家族だけが開けるように Cloudflare Access（メールのワンタイムコード）の内側に置く。Access の設定と、Worker + KV での記録の共有は、作り替えの中で整える。

## ライセンス

- 筆順データ（`src/learn/handwriting/strokes.json`）: [KanjiVG](https://kanjivg.tagaini.net/) © Ulrich Apel, CC BY-SA 3.0
