# 第2回UI・得点整理（2026-08-30）

## 実装済みの変更

- 画面の「デッキ」は「イラスト」に統一。動物5枚／まちの人々5枚をサムネイル付きで選択。内部deckIdは互換性のため維持。
- 両シリーズとも連続して同じ画像を選ばない。まちの人々は承認済みの太い輪郭線のテイストで市場・公園・料理教室・図書館・お祭りを用意。
- ロビーのランダム説明を削除。「2人以上で開始できます」は開始ボタンから余白を確保。
- ペンの色コード文字列を削除。色と太さは丸いペン先プレビューで表示。スマホの描画／移動／スポイト／戻す／消すを同列に配置し、戻す／消すはアイコンとアクセシブル名を維持。
- 回答画面には強調表示のチェックボックスを置かない。正解の一時マークと描画は3秒後に消える。元の保存データは消さず、結果・共有画像では全描画を表示。
- ANSWER_REVEALを追加。最後の正解後は回答を停止し、3秒表示してROUND_RESULTへ進む。ホストもこの表示時間をスキップ不可。
- 自分が作成した間違いへの回答はOWN_DIFFERENCE通知のみで、加点・減点・発見処理なし。重複箇所に他人の未発見の間違いがある場合はそちらを判定する。
- roundScoresに発見・未発見・誤答（実際の減点）を記録し、ラウンドごとに保存。内訳の合計はそのラウンドの得点増減に一致する。
- 最終結果の総合点パネルでは最高点の全員を優勝表示。同点者は同順位。
- 結果の「間違いの箇所をマーク」は初期ON。「すべて」／参加者の切替は拡大率の下。選択中ラウンドの内訳を表示する。
- SNS画像はmock/app.jsの紺背景・白黄の見出し・左右画像・下部ブランド表示に合わせた1600×900 PNG。架空のクリア秒数やサンプル描画は流用しない。実描画と実個数を描く。不要なXリンク、共有説明、挑戦文の開閉見出しを削除し、画像プレビューという見出しにする。

## 現在の得点仕様

発見した本人だけが発見点を得る。作成者を含む他の人は正解時には増えない。未発見の作成者への点はラウンド終了時に加算。以下の面積別配点に更新した。旧保存データの確定済みの間違いは100点の互換処理を維持し、過去の得点は書き換えない。
誤回答は3秒回答不可・20点減点・最低0点を維持。

## 承認済みの面積別得点

ユーザーの「ごめんこれ承認します」で承認済み。今回の公開に含める。

| 視認できる変更面積 | 発見者 | 未発見の作成者 |
| --- | ---: | ---: |
| 小（画像の1%未満） | 150 | 50 |
| 中（1%以上3%未満） | 100 | 100 |
| 大（3%以上） | 50 | 150 |

元画像と各間違いの合成後画像の可視変更領域をサーバーで計算。外接矩形や軌跡面積は使わない。色差・最小面積・計算量上限を共通設定へ集約。具体的な実装と限界は [可視面積判定](visible-scoring.md) に記載。
「人間に見えるか」の完全な判定は保証できない。画像の複雑さ、色覚、画面サイズでも変わるため、保守的な閾値とプレイテストが必要。面積判定と無効描画の基準を実装せず、軌跡面積だけで得点を増やす対応はしない。

## 輪郭線を強めた再試作

- ユーザー要望: サイゼリヤの間違い探しのように、線をはっきりさせる。
- 組み込みimage_genで前の画像を参照して再生成。ファイル参照で環境エラーが出たため会話に表示した画像を参照した。CLI/APIフォールバック不使用。
- 保存先: output/imagegen/people-market-bold.png。ユーザー承認後、apps/web/public/assets/people-market.pngへ採用。他の4枚と生成プロンプトは [画像生成記録](people-illustrations.md) に記載。
- 太い輪郭線、漫画調の人物、平面的な色、小物の見分けやすさを確認。
- 最終プロンプト:

```text
Use case: style-transfer
Input image: edit target, the current human neighborhood-market illustration.
Primary request: redraw this source illustration with the crisp, bold outlined, playful flat cartoon readability of a Japanese family-restaurant children's spot-the-difference puzzle, the kind of feel found in Saizeriya's spot-the-difference illustrations. Make it an original illustration, not a copy of a particular puzzle or branded character.
Keep: the marketplace setting, human-centered subject, fruit stall, flower stall, people chatting, cafe table, bicycle and clock; landscape 4:3 composition and broadly similar arrangement.
Change: replace the soft painterly shading with clear continuous dark navy-black outlines around EVERY person, object and important detail. Bold confident uniform linework, rounded simplified shapes, expressive friendly cartoon faces, slightly larger heads and shorter proportions. Clean flat cheerful colors with high separation, almost no gradients, no painterly texture, minimal shadows. Reduce tiny flower/fruit clutter into a few clear outlined shapes. Every small prop should read cleanly at phone size. Aim for a simple, lively puzzle illustration rather than realistic editorial art.
No text, numbers, captions, logos, watermark, borders or UI. This is a single original source illustration, not a side-by-side puzzle; do not deliberately insert differences.
```

## イラスト生成（初稿）

- 組み込みimage_gen使用（API/CLIフォールバック不使用）。
- 保存先: apps/web/public/assets/people-market.png（1448×1086）。
- 人間が中心、動物絵より簡素な構成、文字やUIなしであることを確認。
- プロンプト:

```text
Use case: illustration-story
Asset type: source illustration for a mobile spot-the-difference party game
Primary request: one simple, human-centered illustration for a new series, showing a cheerful neighborhood weekend market with several ordinary people shopping, talking, carrying bags, and running small stalls
Scene/backdrop: compact outdoor plaza with a fruit stall, flower stall, cafe table, bicycle, clock, simple buildings, trees and a few distinct props that players could draw small changes onto
Subject: 8 to 10 diverse human characters as the main focus, with clear silhouettes and varied clothing
Style/medium: clean flat 2D editorial illustration, simple rounded shapes, crisp outlines, limited detail, substantially simpler and less busy than a richly painted children's book scene
Composition/framing: landscape 4:3, full scene, evenly distributed visual landmarks, no single oversized foreground subject, safe margins
Lighting/mood: bright friendly daytime
Color palette: warm but restrained, accessible contrast, large flat color areas
Constraints: no text, no letters, no numbers, no logos, no watermark, no UI, no frame, no photorealism; maintain enough distinct areas for drawing and finding differences; humans clearly dominate rather than animals
```
