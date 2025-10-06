# Nousync (Supabase + Vercel)

新規構成のモノレポです。Supabase（Auth/DB/Storage）とVercel（API/フロント）で動作する最小足場を用意しています。

## 主な方針
- 認証: Supabase Auth（ユーザーIDはUUID）
- DB: Supabase Postgres（`uuid`、`pgvector`、全文検索はPGroonga前提／代替で`pg_trgm`+部分一致）
- API: Vercel Serverless Functions（Node.js 20）
- フロント: Vite + React（`@supabase/supabase-js`）

注記: SupabaseはPGroonga拡張に対応しています。PGroongaが利用可能な環境ではPGroongaを第一選択とし、万一使えない環境向けに`pg_trgm`フォールバックも同梱しています。

## ディレクトリ構成

```
nousync/
  apps/
    api/        # Vercel Functions（/api/*）
      api/
        health.ts
        search.ts
    web/        # Vite React（Supabase Auth UI雛形）
      index.html
      src/
        App.tsx
        main.tsx
        lib/supabase.ts
  packages/
    shared/     # 共有型（最小）
  supabase/
    migrations/
      0001_extensions.sql
      0002_schema.sql
      0003_search_pg_trgm.sql
      0004_pgroonga.sql       # PGroongaを有効化（環境で利用可能な場合）
  package.json
  pnpm-workspace.yaml
  vercel.json
```

## 環境変数（例）

Vercel（API）
- `DATABASE_URL`（Supabase Pooler推奨、例: `postgres://user:pass@host:6543/postgres?sslmode=require`）
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`（サーバー側トークン検証用）
- `USE_PGROONGA`（`true`でPGroongaクエリを使用／非対応環境では使用不可）

Vercel（Web）
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`
- `VITE_API_URL`（`/api` または API のフルURL）

## セットアップ（概要）
1) Supabaseプロジェクト作成
   - Extensions: `pgvector` 有効化
   - （可能なら）PGroongaを有効化。不可の場合は`pg_trgm`を利用
2) Migrationsを適用
   - `0001_extensions.sql` → `0002_schema.sql` → `0003_search_pg_trgm.sql`（フォールバック）
   - PGroongaが利用可能なら `0004_pgroonga.sql` を追加適用（PGroongaインデックス作成）
3) Vercelに`nousync`をプロジェクトとしてインポート
   - ルートを`nousync/`に設定
   - API/WEBの環境変数を設定

## 検索について
- PGroonga: 日本語に強い全文検索。Supabaseで利用可能（拡張を有効化）
- 代替: `pg_trgm` + `ILIKE`/`similarity` を用いたN-gram近似検索
- RAG/意味検索は `pgvector` を併用予定（本雛形ではスキーマのみ定義）

## 次の実装タスク（提案）
- API: 認証ミドルウェア（SupabaseのJWT検証）強化、ドキュメントCRUD/RAG実装
- Web: 認証UI、ドキュメント管理UI、チャット画面の実装
- Embeddingバッチ: ドキュメント登録時の分割・埋め込み作成（キュー/ワーカー or 即時）
