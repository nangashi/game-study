# 手書き判定プロトタイプ（検証用）

書くべき字（お手本）を決めておき、1画書くたびに KanjiVG の筆順データと照らし合わせて判定します。
対象：ひらがな、カタカナ、1〜2年の漢字（332字）。ビルド不要の静的ページです。

- `judge.js`：判定ロジック（形・書き順・向き）
- `strokes-data.js`：KanjiVG から抜き出した筆順データ（CC BY-SA 3.0, © Ulrich Apel / KanjiVG）
- `index.html`：タブレットで試すための画面

## ローカルで動かす

```bash
python3 -m http.server 8000 -d prototypes/handwriting
```

## タブレットで試す（Cloudflare に配信）

```bash
npx wrangler pages deploy prototypes/handwriting --project-name=tegaki-proto
```

初回はブラウザで Cloudflare へのログインを求められます。発行された `*.pages.dev` の URL をタブレットの Chrome で開いてください。

画面下の小さい文字（デバッグ表示）に、判定結果・距離・入力の種類（touch / pen）が出ます。
うまく合格しない字があれば、その表示とあわせて教えてください。
