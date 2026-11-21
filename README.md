# まなびランド

子ども2人（年長〜小学校低学年）が、短時間で国語と算数の基礎を練習できて、進み具合が見られる学習アプリ（家族用）。
Android タブレットのブラウザで動く PWA で、Cloudflare の無料プランに置く。

（保存データのキーと Cloudflare の Worker 名 `manabi-survivor` は、旧まなびランドの名残り）

## 作り替え中（2026-11-21〜）

旧まなびランド（勉強するとゲームが強くなるアプリ）から、ゲームとごほうびを外し、学習と記録だけのアプリに作り替えている。

- できているもの
  - 新しい画面（`src/ui/screens/`）: 子ども選択 → テーマ → 道 → 問題／書き取り → 結果、設定（子ども選択の歯車）
  - 算数「けいさん」の道（47ステージ）とちからだめし: 算数練習アプリから移植（`src/learn/keisan/`）。仕様は [docs/03-keisan.md](docs/03-keisan.md)
  - 国語「ひらがなを かく」（`src/learn/hiragana.ts`、判定は `src/learn/handwriting/`）
  - 記録（`src/records/`、キー `manabi:v2`）と、Worker + KV での家族共有（`worker/`）。仕様は [docs/04-records.md](docs/04-records.md)
- これから: Cloudflare への実際のデプロイ（KV の作成・Access の設定・GitHub Secrets）

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

家族共有の API（`/api/family`）も動かすときは、別のターミナルで Worker を手元で動かす。`npm run dev` の `/api` は :8787 へ回る:

```bash
npm run build && npx wrangler dev   # http://localhost:8787 （dist の配信 + /api、KV は手元の偽物）
```

Worker を動かしていないときは同期が失敗するだけで、記録は端末に残り、遊びは止まらない。
`ACCESS_TEAM_DOMAIN`・`ACCESS_AUD` が空のときは localhost への API だけ認証なしで通す（`worker/access.ts`）。

構成: TypeScript + Vite + vite-plugin-pwa。

```
worker/           Worker（/api/family と Cloudflare Access の検証）。それ以外は dist をそのまま配信
src/
  records/        記録（形・合わせ方 mergeFamily・端末への保存・Worker との同期）
  learn/
    keisan/       けいさんの道（ステージ・問題の作り方・10問セット・星とクリア・ちからだめし）
    handwriting/  手書きの判定と筆順データ（KanjiVG）
    math.ts kokugo.ts   旧まなびランドの問題（ほかのテーマを足すときの材料。いまは画面から使っていない）
  studies/        旧まなびランドの教科・カテゴリ
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

家族だけが開けるように、独自ドメインに置いて Cloudflare Access（メールのワンタイムコード）の内側にする。workers.dev とプレビュー URL は無効（`wrangler.jsonc`）。Worker の中でも Access の証明（`Cf-Access-Jwt-Assertion`）を確かめる。

はじめて置くとき:

1. KV を作る: `npx wrangler kv namespace create FAMILY` → 出てきた id を `wrangler.jsonc` の `kv_namespaces` に入れる
2. 独自ドメインを Worker につなぐ（`wrangler.jsonc` に `routes`（`custom_domain: true`）を足すか、ダッシュボードで）
3. Zero Trust → Access → Applications で、そのドメインの Self-hosted アプリを作る（ログイン方法: One-time PIN、ポリシー: 家族のメールアドレスだけ Allow、セッションは長め）
4. アプリの AUD タグとチームのドメインを `wrangler.jsonc` の `vars`（`ACCESS_AUD`・`ACCESS_TEAM_DOMAIN`）に入れる。空のまま置くと API は 500 で断る
5. `npx wrangler login`（CI からなら `CLOUDFLARE_API_TOKEN`・`CLOUDFLARE_ACCOUNT_ID`）→ `npm run deploy`

## ライセンス

- 筆順データ（`src/learn/handwriting/strokes.json`）: [KanjiVG](https://kanjivg.tagaini.net/) © Ulrich Apel, CC BY-SA 3.0
