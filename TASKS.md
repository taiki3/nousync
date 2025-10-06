# TASKS — Nousync Backlog

- Infra
  - [ ] Vercel本番での404再検証（SPA fallbackとRoot Directory設定確認）
  - [ ] 環境変数の全セット（API/Web）とSecretsチェック
- Web
  - [ ] Projects一覧/作成/編集/削除のUI
  - [ ] Documents一覧/作成/編集/削除、ダウンロード
  - [ ] Embeddings作成ボタン（ドキュメント詳細から）
  - [ ] RAG検索フォームと結果表示
  - [ ] 認証状態（OTPログイン/ログアウト）のヘッダ表示整備
- API
  - [ ] Storage直アップロード用の署名URL発行（必要なら）
  - [ ] Storageファイルからのテキスト抽出とメタ登録
  - [ ] チャットAPI（RAGコンテキスト生成＋モデル呼び出し）
  - [ ] @types/pg導入、Response型整備
- Migrations/DB
  - [ ] PGroongaクエリの最適化（クエリ語句の前処理/クエリ構文の調整）
  - [ ] ベクトル次元やモデル名の環境変数化・自動整合チェック

## メモ
- ESM/NodeNextで相対インポートは`.js`必須。
- RLS想定のため、直SQLのSELECTでもwithRls()経由で実行。
