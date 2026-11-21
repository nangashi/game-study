# 新しい記録（家族で1つのデータ）

作成日: 2026-11-21

学習と記録だけのアプリ用の記録。設計の決定は game-study-design の 02（データ設計）・05（ブリーフ）・06（実装上の決定）。端末には `manabi:v2` に置き、家族で1つのデータを Worker（`/api/family`）の KV に置いて合わせる。

## ファイル

| ファイル | 中身 |
|---|---|
| `src/records/types.ts` | 記録の型 |
| `src/records/model.ts` | 作る・更新する関数（どれも新しい記録を返す）、読み込んだデータをそろえる `normalizeFamily` |
| `src/records/merge.ts` | 端末どうしの記録を合わせる `mergeFamily` |
| `src/records/storage.ts` | localStorage への保存・読み込み（キー `manabi:v2`） |
| `src/records/sync.ts` | Worker との同期 `createSync`（起動時の pull、結果画面の push） |
| `worker/api.ts` | `/api/family` の GET・PUT（PUT はサーバーでも mergeFamily） |
| `worker/access.ts` | Cloudflare Access の証明（`Cf-Access-Jwt-Assertion`）の検証 |

## 形

```
FamilyRecords { version: 2, resetAt, children: { [子どもの id]: ChildRecord } }  // resetAt: 全消しの印（ms、0 は一度も消していない）
ChildRecord {
  id, createdAt,                       // createdAt はならび順
  settings: { value: { name, avatar, tolerance, sound, removed }, at },
  units: { [単元 id]: { stars, cleared } },          // けいさん以外
  keisan: {
    stages: { [ステージ id]: { cleared, stars, bestScore, bestTime } },  // 算数練習アプリと同じ
    playableThrough, testDone,
    testProgress: { value: TestProgress | null, at },
    lastStage: { value: ステージ id | null, at },
  },
}
```

- `at` は更新時刻（ms）。後勝ちの判定に使う。
- `bestTime` の 0 は「記録なし」（算数練習アプリでは null）。
- 子どもを消すときは `removed: true` にして残す（合わせたときに戻ってこないように）。
- けいさんの更新は `src/learn/keisan/` の `mergeStageResult`・`playableAfterClear`・`applyTestResult` をそのまま使う（`startKeisanStage`・`finishKeisanStage`・`setTestProgress`・`finishTest`）。

## 合わせ方（mergeFamily）

全体の上書きはしない。古い控えから保存しても新しい記録が消えないようにする。

| 項目 | 合わせ方 |
|---|---|
| 子ども | 両方の和。片方にしかいない子どもも残す |
| 単元・ステージの星、bestScore | 大きい方 |
| クリア、testDone | どちらかでしていれば残す |
| bestTime | 速い方（0 は記録なしとして無視） |
| playableThrough | 大きい方 |
| createdAt | 小さい方 |
| 設定（名前・アバター・許容度・音・消した印） | まとめて後勝ち |
| testProgress、lastStage | それぞれ後勝ち |

後勝ちで時刻が同じときは、中身を文字列にして大きい方にする（どちらから合わせても同じ結果にするため）。

テスト（`merge.test.ts`）で、ばらばらな記録 500 組（全消しの印がちがう組もまぜる）について 交換法則・冪等・結合法則・単調（同じ印なら、どちらの記録よりも進み具合が減らない）を確かめている。

### 全消し（リセット印 resetAt）

- 全消し（設定画面）は `resetFamily`: 子どもと進み具合を空にし、`resetAt` を今にする（前の印より必ず新しく）。すぐ Worker へ送る。
- 合わせるとき、`resetAt` がちがえば **新しい印の方だけを使い、古い印の控えはまるごと捨てる**。同じ印どうしは上の表のとおり合わせる。
  - 単元・ステージに時刻を持たないので、古い控えの中の「全消しより前の進み具合」と「全消しを知らずに後から進めた分」は分けられない。後者も捨てる（全消しを知らない端末で、全消しのあと同期する前に遊んだ分・登録した子どもは消える）。
- `resetAt` がない古いデータは 0 として読む。
- 記録の読み込み（設定画面）は、読み込むデータの印をいまの印にそろえてから合わせる（全消しの前に書き出した記録も、読み込めば戻せる）。

## Worker との同期

- `GET /api/family`: KV（キー `family:v2`）のデータ。なければ空。
- `PUT /api/family`: 送られたデータ（`version: 2` でなければ 400、512KB まで）を KV のデータと `mergeFamily` で合わせて保存し、合わせた結果を返す。合わせても変わらなければ KV に書かない。
  - KV には「読んで・合わせて・書く」の排他がないので、同時に2台が送ると片方の分がサーバーに残らないことがある。端末は自分の記録を持ったまま次の結果画面でまた全部を送るので、そのときに戻る。
- 端末: 起動時に GET して合わせる（最初の画面のままなら描きなおす）。送るのは **結果画面（けいさんのステージ・ちからだめし・ひらがな）と全消しのときだけ**（KV の書き込み上限のため）。名前の変更・子どもの登録・ちからだめしの休けいは、端末に保存して次の結果画面で一緒に送る。サーバーと同じなら送らない。送っている間に次の結果が来たら、終わってから1回だけ送る。自動の再送はしない。
- 失敗（オフライン・ログイン切れ・サーバーのエラー）しても遊びは止めず、画面の下のすみに小さく出す（`src/ui/sync-note.ts`）。ログイン切れ（401・403・ログイン画面への転送・HTML が返る）はタップで読み込みなおし（Access のログインへ）。
- テスト: `worker/api.test.ts`（偽の KV で GET・PUT・サーバーでの合わせ方・全消し）、`worker/access.test.ts`（自前で署名した JWT）、`src/records/sync.test.ts`（端末2台とサーバーをつないで）。
- PWA: `/api` は Service Worker のキャッシュにも、画面遷移のフォールバック（index.html）にも入れない。

### 認証（worker/access.ts）

- 入口は Cloudflare Access のアプリをかけた workers.dev の URL だけ（`workers_dev: true`・`preview_urls: false`）。Worker の中でも `Cf-Access-Jwt-Assertion` を確かめる: RS256 の署名（公開鍵は `<チームのドメイン>/cdn-cgi/access/certs`、1時間控える）、`exp`・`nbf`（60秒の許し）、`iss` = `ACCESS_TEAM_DOMAIN`、`aud` に `ACCESS_AUD`。
- ヘッダーがなければ 401、証明がおかしければ 403。
- **`ACCESS_TEAM_DOMAIN` と `ACCESS_AUD` が2つとも空で、しかもリクエスト先が `localhost`・`127.0.0.1`・`[::1]` のときだけ**、確かめずに通す（wrangler dev 用）。片方だけ空・本番のドメインで空のときは 500 で断る（設定ミスで API が開いたままにならないように）。

## 決めていないこと

- 02 の「前回タイム」（リザルトの時間ランキング表示用）は持っていない。時間ランキングの改善を保留しているため。
