# 新しい記録（家族で1つのデータ）

作成日: 2026-11-21

学習と記録だけのアプリ用の記録。設計の決定は game-study-design の 02（データ設計）・06（実装上の決定）。いまは `src/records/` に層だけあり、画面にはまだつないでいない（画面は旧記録 `src/state/`、キー `manabi-survivor:v1` を使ったまま）。

## ファイル

| ファイル | 中身 |
|---|---|
| `src/records/types.ts` | 記録の型 |
| `src/records/model.ts` | 作る・更新する関数（どれも新しい記録を返す）、読み込んだデータをそろえる `normalizeFamily` |
| `src/records/merge.ts` | 端末どうしの記録を合わせる `mergeFamily` |
| `src/records/storage.ts` | localStorage への保存・読み込み（キー `manabi:v2`） |

## 形

```
FamilyRecords { version: 2, children: { [子どもの id]: ChildRecord } }
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

テスト（`merge.test.ts`）で、ばらばらな記録 500 組について 交換法則・冪等・結合法則・単調（どちらの記録よりも進み具合が減らない）を確かめている。

## 決めていないこと

- 「全消し」（設定画面）は合わせる方式だと他の端末の控えから戻ってくる。家族のデータごと消す手順は Worker の弾で決める。
- 02 の「前回タイム」（リザルトの時間ランキング表示用）は持っていない。時間ランキングの改善を保留しているため。
