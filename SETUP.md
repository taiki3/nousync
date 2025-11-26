# セットアップ手順（Supabase + Vercel）

本ドキュメントは、`nousync/` モノレポを Supabase（Auth/DB/Storage）と Vercel（API/フロント）で動かすための手順です。

## 前提
- Supabase アカウント（Project作成権限）
- Vercel アカウント（Project作成権限）
- OpenAI API Key（埋め込み/RAGを使う場合）
- Supabase CLI（インストール: https://supabase.com/docs/guides/cli）

## 1. Supabase CLIのセットアップ

```bash
# CLIをインストール（macOS）
brew install supabase/tap/supabase

# Linux (arm64)
curl -sL https://github.com/supabase/cli/releases/latest/download/supabase_linux_arm64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/

# Linux (amd64)
curl -sL https://github.com/supabase/cli/releases/latest/download/supabase_linux_amd64.tar.gz | tar -xz
sudo mv supabase /usr/local/bin/

# Supabaseにログイン
supabase login
```

## 2. Supabase プロジェクト作成

### 組織IDの確認
```bash
supabase orgs list
```

### 本番環境のプロジェクト作成
```bash
# DBパスワードを生成（安全な場所に保存してください）
openssl rand -base64 24 | tr -d '/+=' | head -c 24

# プロジェクト作成
supabase projects create nousync-prod \
  --org-id <組織ID> \
  --region ap-northeast-1 \
  --db-password "<生成したパスワード>"
```

### 開発環境のプロジェクト作成
```bash
# DBパスワードを生成
openssl rand -base64 24 | tr -d '/+=' | head -c 24

# プロジェクト作成
supabase projects create nousync-dev \
  --org-id <組織ID> \
  --region ap-northeast-1 \
  --db-password "<生成したパスワード>"
```

### プロジェクト一覧の確認
```bash
supabase projects list
```

## 3. マイグレーションの適用

### プロジェクトにリンク
```bash
# 開発環境にリンク
supabase link --project-ref <dev-project-ref> --password "<DBパスワード>"

# マイグレーションを適用
supabase db push
```

### 本番環境にマイグレーションを適用
```bash
# 本番環境にリンクし直す
supabase link --project-ref <prod-project-ref> --password "<DBパスワード>"

# マイグレーションを適用
supabase db push
```

**注意**: `supabase link` でDB接続できない場合（プロキシ環境など）は、Supabase ダッシュボードの SQL Editor から以下のファイルを順に実行してください：

1. `supabase/migrations/0001_extensions.sql`
2. `supabase/migrations/0002_schema.sql`
3. `supabase/migrations/0003_search_pg_trgm.sql`
4. `supabase/migrations/0004_pgroonga.sql`（PGroonga利用時）
5. `supabase/migrations/0005_rls.sql`
6. `supabase/migrations/0006_embeddings_index.sql`
7. `supabase/migrations/0007_embeddings_rls.sql`
8. `supabase/migrations/0008_create_user_id_function.sql`
9. `supabase/migrations/0009_update_rls_to_use_new_function.sql`
10. `supabase/migrations/0010_conversation_documents.sql`
11. `supabase/migrations/0011_storage_buckets.sql`

### API Keysの取得
```bash
# 開発環境
supabase projects api-keys --project-ref <dev-project-ref>

# 本番環境
supabase projects api-keys --project-ref <prod-project-ref>
```

## 4. Vercel 設定

### プロジェクトのインポート
- Vercel → Add New… → Project → 対象のリポジトリを選択
- Root Directory を `nousync/` に設定

### ビルド設定
- Build Command: `pnpm -w install && pnpm -w build`
- Output: そのまま（`vercel.json`が配信先を指定）

### 環境変数の設定

**API 用**
| 変数名 | 説明 |
|--------|------|
| `DATABASE_URL` | Supabaseの Pooled URI（Settings → Database → Connection pooling） |
| `SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `SUPABASE_ANON_KEY` | Supabase Anon Key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase Service Role Key |
| `USE_PGROONGA` | `true`（PGroonga検索を有効化） |
| `OPENAI_API_KEY` | OpenAIのAPIキー（RAG/埋め込み用） |
| `EMBEDDING_MODEL` | （任意）既定 `text-embedding-3-small` |
| `CLOUDFLARE_GATEWAY_URL` | （任意）Cloudflare AI GatewayのURL |
| `CLOUDFLARE_GATEWAY_TOKEN` | （任意）Cloudflare Gateway Token |
| `GEMINI_API_KEY` | （任意）Google Gemini APIキー |

**Web 用**
| 変数名 | 説明 |
|--------|------|
| `VITE_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `VITE_SUPABASE_ANON_KEY` | Supabase Anon Key |
| `VITE_API_URL` | `/api` |

### 環境の分離（Production/Preview）
- Production: 本番用Supabaseプロジェクトの認証情報を設定
- Preview: 開発用Supabaseプロジェクトの認証情報を設定

## 5. E2Eテスト

### セットアップ
```bash
# Playwrightのインストール
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

### 環境変数（.env.local）
```bash
E2E_BASE_URL=https://nousync-<branch>.vercel.app
VERCEL_AUTOMATION_BYPASS_SECRET=<Vercelプロジェクト設定から取得>
```

### テスト実行
```bash
pnpm e2e              # テスト実行
pnpm e2e:ui           # UI付きで実行
pnpm e2e:headed       # ブラウザ表示付きで実行
```

## 6. ローカル開発

### Vercel CLIを利用
```bash
cd nousync

# .env.localに環境変数を設定
# （本番/開発どちらかのSupabase認証情報）

vercel dev
```

### Supabase Localを利用（推奨）
```bash
# Dockerが必要
supabase start

# ローカルDBにマイグレーションを適用
supabase db push --local

# ローカルSupabaseの情報を確認
supabase status
```

## 7. トラブルシューティング

### PGroongaが見つからない/権限エラー
- Supabase Dashboard → Database → Extensions で `pgroonga` を有効化
- その後 `0004_pgroonga.sql` を適用

### 500/Unauthorized エラー
- `SUPABASE_URL` と `SUPABASE_SERVICE_ROLE_KEY` が正しく設定されているか確認

### 接続数エラー
- `DATABASE_URL` は Pooler(6543) を使用してください
- 形式: `postgres://<user>:<password>@<host>:6543/postgres`

### Cloudflare Gateway経由でGeminiが動かない
- Provider名: `google-ai-studio`
- APIバージョン: `v1beta`（Gemini 3 Pro用）
- ヘッダー: `x-goog-api-key`

### supabase link がタイムアウトする
- プロキシ環境ではPostgres直接接続がブロックされる場合があります
- SQL Editorからマイグレーションを手動実行してください

## 8. プロジェクト情報

### 現在のプロジェクト
| 環境 | Project Ref | URL |
|------|-------------|-----|
| 本番 | `cgmltvkghwfwfligmscb` | https://cgmltvkghwfwfligmscb.supabase.co |
| 開発 | `jtammzjhhsusvvpoyazv` | https://jtammzjhhsusvvpoyazv.supabase.co |

以上です。設定が完了していれば、OTPログイン → ドキュメント作成 → 埋め込み作成 → PGroonga検索/RAG検索の一連が動作します。
