# まなびサバイバー

年長〜小学校低学年向けの「勉強するとゲームが強くなる」学習アプリ（家族用）。
Android タブレットのブラウザで動く PWA で、Cloudflare の無料プランに置く。

- 調査と実現可能性の検証: [docs/01-research-and-feasibility.md](docs/01-research-and-feasibility.md)
- 手書き判定の検証用プロトタイプ: [prototypes/handwriting/](prototypes/handwriting/)
- ゲーム候補（あそびラボ）の引き継ぎ: [docs/03-game-candidates.md](docs/03-game-candidates.md)

## 遊びの流れ

1. **クエスト**（こくご / さんすう、1回5問）→ 🪙コイン と 🪶ことばの羽（こくご）/ ⭐ひかりの星（さんすう）、🎟️バトル券
2. **バトル**（ダダサバ風、1回3分）→ レベルアップのたびにクイズ。正解するとスキルが「スーパー」になる
3. **つよくする** → 🪙と🪶⭐で、たいりょく・こうげき・すばやさ・じしゃくを上げる（両方の教科をやらないと全部は上げられない）

ホームの「あそびラボ」では、バトルとは別のゲーム候補（モンスターまもり・ひっぱりアタック・ぱくぱくビッグ）をためしに遊べる。バトル券は使わず、ごほうびも出ない。

バトル券は1日にもらえる数に上限あり（初期値3枚、おうちのひと画面で変更できる）。上限に達したあともクエストはでき、コインと素材はもらえる。

## 学年ごとの内容

| | こくご | さんすう | バトル中のクイズ |
|---|---|---|---|
| 年長 | ひらがな（なぞり書き → お手本を見て書く）、同じ字さがし | 絵をかぞえる → 絵のたし算・ひき算 | かず・字さがし |
| 1年 | ひらがな、カタカナ、1年の漢字（書き・読み） | けいさん、とけい | けいさん・とけい・漢字の読み |
| 2〜3年 | 1〜2年の漢字（書き・読み）、カタカナ | くりあがり → 2けた → 九九 → 3けた、とけい | 同上 |

- さんすうは、3問続けて正解するとレベルが上がり、2問続けてまちがえると下がる
- 手書きは間隔反復（正解すると1→2→4→7→14→30日後にまた出る。お手本を見た・何度もまちがえたときは、次のクエストでまた出る）
- 漢字の書き取りは、はじめて出る字はお手本つき、2回目からはお手本なし（「👀 おてほん」で書き順アニメーションを見られる）
- 手書きの判定の厳しさは子どもごとに変えられる（初期値「やさしい」）

## 開発

```bash
npm install
npm run dev        # http://localhost:5173 （--host つきなので、同じLANのタブレットからも開ける）
npm test
npm run build
```

構成: TypeScript + Vite + Phaser 4（バトル画面だけ）+ vite-plugin-pwa。サーバーなし。データは端末の localStorage に保存（おうちのひと画面から JSON で書き出し・読み込みできる）。

```
src/
  learn/          問題の生成・難易度調整・間隔反復・手書き判定
  state/          保存データ・報酬と強化
  game/           バトル（Phaser）
  lab/            あそびラボのゲーム候補（Phaser）
  ui/             画面（DOM）
  data/           文字セット・漢字のことば
scripts/gen-strokes.mjs   KanjiVG から筆順データを作る
scripts/gen-art.sh        Codex で画像を生成（art/prompts/ → art/raw/）
scripts/build-art.mjs     生成画像を整えて public/sprites/ に出力
scripts/playtest.mjs      あそびラボのゲームを自動で遊ばせて確かめる（docs/03）
```

画像の作り方は [docs/02-asset-generation.md](docs/02-asset-generation.md)。

筆順データを作り直すとき（文字を増やしたとき）は、[KanjiVG](https://github.com/KanjiVG/kanjivg/releases) の zip を展開してから:

```bash
KANJIVG_DIR=/path/to/kanjivg/kanji npm run gen:strokes
```

## Cloudflare に置く

```bash
npx wrangler login
npm run deploy
```

`https://manabi-survivor.<アカウント>.workers.dev` で公開される。

### 家族だけが開けるようにする（Cloudflare Access、無料）

1. Cloudflare ダッシュボード → Workers & Pages → `manabi-survivor` → 設定 → ドメインとルート
2. `workers.dev` の「Cloudflare Access」を有効にする
3. Zero Trust → Access → アプリケーション で、作られたポリシーの「許可するメールアドレス」に家族のアドレスを入れる

タブレットで一度メールのワンタイムコードでログインすれば、しばらくはそのまま使える。
Chrome のメニュー →「ホーム画面に追加」で全画面のアプリとして使える。

## ライセンス

- 筆順データ（`src/learn/handwriting/strokes.json`）: [KanjiVG](https://kanjivg.tagaini.net/) © Ulrich Apel, CC BY-SA 3.0
