# TASKS — Nousync Backlog

## 🚀 現在進行中
- Web - Projects機能
  - [ ] ProjectsのAPI Clientを作成（`apps/web/src/services/api/projects.ts`）
  - [ ] Projectsコンポーネントを作成（一覧/作成/編集/削除UI）
  - [ ] FileExplorerにプロジェクトフィルタを追加
  - [ ] ドキュメント作成時のプロジェクト選択機能

## ✅ 完了済み
- Infra
  - [x] Vercel本番での404解決（SPA fallback設定完了）
- API
  - [x] Projects CRUD API（`api/projects.ts`）
  - [x] チャットAPI（ストリーミング対応、Markdown表示）
- Web
  - [x] 認証状態のヘッダ表示（UserMenu実装済み）
  - [x] Documents CRUD（一覧/作成/編集/削除）
- DB
  - [x] Projects/Documents/Conversations/Messages/Embeddings テーブル作成

## 📋 今後の予定
- Web
  - [ ] Embeddings作成ボタン（ドキュメント詳細から）
  - [ ] RAG検索フォームと結果表示
  - [ ] ドキュメントダウンロード機能
- API
  - [ ] Storage直アップロード用の署名URL発行（必要なら）
  - [ ] Storageファイルからのテキスト抽出とメタ登録
  - [ ] @types/pg導入、Response型整備
- Migrations/DB
  - [ ] PGroongaクエリの最適化（クエリ語句の前処理/クエリ構文の調整）
  - [ ] ベクトル次元やモデル名の環境変数化・自動整合チェック
- Infra
  - [ ] 環境変数の全セット（API/Web）とSecretsチェック

## メモ
- ESM/NodeNextで相対インポートは`.js`必須。
- RLS想定のため、直SQLのSELECTでもwithRls()経由で実行。
