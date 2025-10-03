# セットアップ手順（Supabase + Vercel）

本ドキュメントは、`nousync/` モノレポを Supabase（Auth/DB/Storage）と Vercel（API/フロント）で動かすための最小手順です。

## 前提
- Supabase アカウント（Project作成権限）
- Vercel アカウント（Project作成権限）
- OpenAI API Key（埋め込み/RAGを使う場合）

## 1. Supabase 設定
1) プロジェクト作成
- Supabase ダッシュボード → New Project → プロジェクトを作成
- `Project URL` と `Anon key`/`Service role key` を控える

2) 拡張の有効化
- Database → Extensions → 以下を有効化
  - `pgcrypto`, `pgvector`, `pgroonga`（PGroonga検索を使う場合）
  - フォールバック用に `pg_trgm` も有効化推奨

3) スキーマ・RLSの適用（SQL Editor）
- SQL Editor を開き、以下のファイルの内容を順に貼り付けて実行
  - `supabase/migrations/0001_extensions.sql`
  - `supabase/migrations/0002_schema.sql`
  - `supabase/migrations/0003_search_pg_trgm.sql`（フォールバック用）
  - `supabase/migrations/0004_pgroonga.sql`（PGroonga利用時）
  - `supabase/migrations/0005_rls.sql`
  - `supabase/migrations/0006_embeddings_index.sql`
- 実行後、`projects/documents/conversations/messages/embeddings` が作成され、RLSが有効になります

4) Connection Pooler のURI取得（DATABASE_URL）
- Settings → Database → Connection pooling → `Pooled connection string (URI)` をコピー
  - 例: `postgres://<user>:<password>@<host>:6543/postgres?sslmode=require`
  - Serverless向けに Pooler(6543) の利用を推奨

## 2. Vercel 設定
1) プロジェクトのインポート
- Vercel → Add New… → Project → 対象のリポジトリを選択
- Root Directory を `nousync/` に設定
- 既定の `vercel.json` により、`/api/*` は Functions、その他は `apps/web/dist` へルーティング

2) ビルド設定
- Build Command（例）: `pnpm -w install && pnpm -w build`
  - `package.json` の `"packageManager": "pnpm@…"` を利用（Corepack環境）
- Output: そのままでOK（`vercel.json`が配信先を指定）

3) 環境変数の設定（Environment Variables）
- 共通（Production/Preview/Development へ同様に設定）
  - API 用
    - `DATABASE_URL` = Supabaseの Pooled URI
    - `SUPABASE_URL` = Supabase Project URL
    - `SUPABASE_ANON_KEY` = Supabase Anon Key
    - `SUPABASE_SERVICE_ROLE_KEY` = Supabase Service Role Key
    - `USE_PGROONGA` = `true`（PGroonga検索を有効化）
    - `OPENAI_API_KEY` = OpenAIのAPIキー（RAG/埋め込み用）
    - （任意）`EMBEDDING_MODEL` = 既定 `text-embedding-3-small`
  - Web 用
    - `VITE_SUPABASE_URL` = Supabase Project URL
    - `VITE_SUPABASE_ANON_KEY` = Supabase Anon Key
    - `VITE_API_URL` = `/api`（同一プロジェクト内APIを使う場合）

4) デプロイ
- Vercel の Deploy を実行
- 初回デプロイ後、`/api/health` が 200 を返すことを確認

## 3. 動作確認
- フロントにアクセス → 「メールでログイン」（OTP）
- 画面の `/api/health` ボタンで疎通確認
- 検索：PGroongaを有効にしていれば `USE_PGROONGA=true` にて `/api/search?q=キーワード`
- ドキュメント:
  - `POST /api/documents`（title, content）で作成
  - `POST /api/embeddings`（documentId）で埋め込み作成
  - `GET /api/rag-search?q=...` でベクトル検索

## 4. ローカル開発（任意）
- Vercel CLI を利用
  - `cd nousync`
  - `.env.local` に上記の環境変数を設定（API/WEBとも同一プロジェクトで読み込まれます）
  - `vercel dev` で起動

## 5. よくある注意点
- PGroongaが見つからない/権限エラー
  - Extensions で `pgroonga` を有効化してから `0004_pgroonga.sql` を適用してください
- 500/Unauthorized が出る
  - API側で `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が未設定だと、ユーザー検証に失敗します
- 接続数エラー
  - `DATABASE_URL` は Pooler(6543) を使用してください
- トークンが必要なAPI
  - `/api/search` / `/api/documents` / `/api/embeddings` / `/api/rag-search` は認証必須です（フロントから呼ぶ場合は自動付与）

以上です。設定が完了していれば、OTPログイン → ドキュメント作成 → 埋め込み作成 → PGroonga検索/RAG検索の一連が動作します。
