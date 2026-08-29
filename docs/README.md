# 設計ドキュメント

対戦型間違い探し Web アプリ「まちがいパーティー」の設計資料。人とAIが同じ前提で実装・レビューできることを目的とする。

## 読む順番

1. [要件定義](product/requirements.md)
2. [全体設計](architecture/overview.md)
3. [リアルタイム対戦](architecture/realtime.md)
4. [描画と正解判定](architecture/drawing.md)
5. [データ設計](architecture/data-model.md)
6. [通信仕様](architecture/api.md)
7. [安全性と不正対策](architecture/security.md)
8. [公開・運用](architecture/deployment.md)
9. [AI駆動開発](development/ai-workflow.md)
10. [テスト方針](development/testing.md)

内容が矛盾する場合は、要件定義、各設計書、実装コードの順に優先する。設計変更を伴う実装では、コードと同じ変更内で該当文書も更新する。
