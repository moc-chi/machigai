# API・リアルタイムイベント設計

2026-08-30: 現行の設定patch、command.ack、answer.result、roundsは [操作・通信更新](interaction-update.md) に定義する。以下の旧イベント案と競合する場合は同更新とsharedスキーマを参照する。

## 1. 共通仕様

- 通信形式はJSON、文字コードはUTF-8。
- 日時はUTCのISO 8601文字列。
- IDはサーバー生成。操作の`commandId`だけ画面側でUUIDを生成する。
- HTTPエラーは`code`、`message`、`requestId`を返す。
- APIは`/api/v1`、WebSocketは`/api/v1/rooms/:roomId/socket`とする。

## 2. HTTP API

| 方法 | パス | 用途 |
| --- | --- | --- |
| `POST` | `/api/v1/rooms` | 部屋作成 |
| `POST` | `/api/v1/rooms/join` | ルームコードで参加 |
| `GET` | `/api/v1/images` | 利用可能な元画像一覧 |
| `GET` | `/api/v1/health` | 公開後の稼働確認 |

部屋作成と参加の応答には、内部roomId、participantId、再接続用の秘密情報、WebSocket URLを含める。秘密情報はURLへ含めず、画面側のセッション用保存領域へ保存する。

## 3. WebSocketメッセージ

すべてのメッセージは次の外枠を持つ。

```ts
type Message<T> = {
  type: string;
  commandId?: string;
  roomId: string;
  gameNo: number;
  stageNo: number;
  revision?: number;
  sentAt: string;
  payload: T;
};
```

### 画面からサーバー

| type | 用途 |
| --- | --- |
| `session.resume` | 初回接続・再接続 |
| `member.ready` | 準備状態変更 |
| `member.kick` | ホストによる退出 |
| `settings.update` | ホストによる設定変更 |
| `game.start` | ゲーム開始 |
| `drawing.ready` | 描画完了を通知。描画データは含めない |
| `drawing.submit` | `DRAWING_FINALIZING`で番号別の最新描画を1回だけ一括送信 |
| `answer.submit` | 回答座標を送信 |
| `round.continue` | 次ステージへ進む |
| `game.rematch` | 同じ部屋で再試合 |
| `game.terminate` | ホストによる強制終了 |

### サーバーから画面

| type | 用途 |
| --- | --- |
| `state.snapshot` | 復帰可能な完全状態 |
| `member.joined` / `member.left` | 参加・切断 |
| `host.changed` | ホスト移譲 |
| `settings.changed` | 設定更新 |
| `phase.changed` | 画面遷移と終了予定時刻 |
| `command.ack` / `error` | 完了通知・一括送信を含むコマンド結果 |
| `answer.result` | 回答者本人だけの結果 |
| `difference.found` | 全員向けの正解者・位置 |
| `score.changed` | 得点更新 |
| `round.result` | ステージ結果 |
| `game.result` | 最終結果 |
| `error` | 操作拒否 |

## 4. 回答例

```json
{
  "type": "answer.submit",
  "commandId": "0af9d13c-...",
  "roomId": "room_...",
  "gameNo": 1,
  "stageNo": 2,
  "sentAt": "2026-08-29T12:00:00.000Z",
  "payload": { "x": 0.413, "y": 0.682 }
}
```

## 5. エラーコード

`ROOM_NOT_FOUND`、`ROOM_FULL`、`GAME_ALREADY_STARTED`、`NOT_HOST`、`INVALID_PHASE`、`INVALID_PAYLOAD`、`RATE_LIMITED`、`SESSION_REVOKED`、`STALE_COMMAND`を初期定義とする。画面には技術的なコードではなく、次の行動が分かる日本語を表示する。

## 6. 互換性

- 破壊的変更時だけ`/v2`を作る。
- メッセージへ項目を追加する場合、古い画面が無視できる任意項目にする。
- 画面とサーバーの共有型および入力検証スキーマを同じパッケージに置く。

## 7. オリジナル画像API

/api/v1/rooms/:roomCode/original-image のPOSTでアップロード、DELETEで削除、GET（versionクエリ必須）で取得する。認証、画素形式、制限、重複防止、保存と削除は[オリジナル画像](original-images.md)を参照。member.leaveは参加資格を無効化し、最後の退出で画像を含む部屋を削除する。
