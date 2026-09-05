# データ設計

## 1. 保存方針

部屋ごとのSQLite-backed Durable Objectへ、復帰と競合防止に必要なデータだけを保存する。期限切れ後に部屋データを削除し、長期的なプレイ履歴は保持しない。

## 2. 主なデータ

### Room

| 項目 | 内容 |
| --- | --- |
| `roomId` | 推測困難な内部ID |
| `roomCode` | 参加者が入力する短いコード |
| `status` | ゲーム状態 |
| `hostParticipantId` | 現在のホスト |
| `revision` | 状態変更ごとに増える番号 |
| `gameNo` / `stageNo` | 再試合とステージを識別 |
| `settings` | 人数、時間、得点など |
| `imageId` | 使用中の元画像 |
| `phaseEndsAt` | 現在フェーズの終了予定時刻 |
| `expiresAt` | 部屋削除予定時刻 |

### Participant

| 項目 | 内容 |
| --- | --- |
| `participantId` | 部屋内の参加者ID |
| `clientIdHash` | 端末の匿名IDのハッシュ |
| `nickname` | 表示名 |
| `joinOrder` | ホスト移譲に使う参加順 |
| `connected` / `kicked` | 接続・退出状態 |
| `score` | 合計得点 |
| `reconnectSecretHash` | 復帰確認用情報のハッシュ |
| `joinedAt` / `lastSeenAt` | 日時 |

### Difference

| 項目 | 内容 |
| --- | --- |
| `differenceId` | 間違いID |
| `stageNo` | 対象ステージ |
| `creatorId` | 描いた参加者 |
| `strokes` | 線データ |
| `hitRegion` | 外接矩形と線分カプセル |
| `status` | `ACTIVE` / `FOUND` / `INVALID` |
| `foundBy` / `foundAt` | 発見者と日時 |

### Answer

| 項目 | 内容 |
| --- | --- |
| `commandId` | 重複処理防止ID |
| `participantId` | 回答者 |
| `stageNo` | 対象ステージ |
| `x` / `y` | 正規化座標 |
| `result` | `CORRECT` / `MISS` / `ALREADY_FOUND` |
| `differenceId` | 正解時の間違いID |
| `answeredAt` | サーバー受付日時 |

## 3. ゲーム設定

```ts
type GameSettings = {
  minPlayers: number;              // 1
  maxPlayers: number;              // 10
  stageCount: number;              // 初期値2
  differencesPerPlayer: number;    // 初期値1、ホストが1〜5で設定
  drawingSeconds: number;          // 初期値90、ロビーで変更可能
  answeringSeconds: number;        // 初期値60、ロビーで変更可能
  pointsForFinder: number;         // 初期値100
  pointsForUnfoundCreator: number; // 初期値100
  missPenalty: number;             // 20点、得点の下限0
  missCooldownSeconds: number;     // 3秒、サーバーが再回答を制限
  zoomMin: number;                 // 1
  zoomMax: number;                 // 3
};
```

設定は共有スキーマで検証し、画面とサーバーが同じ定義を参照する。

## 4. 元画像一覧

リポジトリ内に画像と目録JSONを置く。ファイル名をゲーム状態へ直接保存せず`imageId`を使い、将来R2へ移せるようにする。

```json
{
  "id": "bakery-001",
  "src": "/images/bakery-001.webp",
  "width": 1536,
  "height": 1024,
  "category": "town",
  "difficulty": null,
  "enabled": true
}
```

## 5. 個人情報と保持

- メールアドレス、氏名、住所は取得しない。
- ニックネームと匿名IDは部屋内だけで使う。
- IPアドレスをゲームデータとして保存しない。
- 部屋削除時に参加者、描画、回答、得点をまとめて削除する。
- 将来集計値を残す場合も個人や部屋を復元できない形にする。

## 6. オリジナル画像の将来データ（未実装）

オリジナル画像対応時はRoomへ一時参照を追加し、画像本体をSQLiteへ格納しない。

| 項目 | 内容 |
| --- | --- |
| `originalImageKey` | R2上の推測困難な一時オブジェクトキー |
| `originalImageMime` | 検証・再エンコード後のMIME |
| `originalImageWidth` / `originalImageHeight` | 検証後の画像寸法 |
| `originalImageBytes` | 上限確認用の保存サイズ |
| `originalImageExpiresAt` | 部屋の削除期限と連動する削除予定時刻 |

オリジナル画像は色情報に依存する可視面積・面積別得点を持たず、通常の線データと`hitRegion`だけを判定に使う。固定配点は共有設定から参照する。
