# Deployment Configuration

## Vercel Preview Deployments

Vercelのプレビューデプロイメント（ブランチデプロイメント）で認証を正しく動作させるための設定：

### 1. Supabase Dashboard設定

Supabaseダッシュボードで以下のURLパターンを**Redirect URLs**に追加してください：

```
https://nousync.vercel.app/
https://*.nousync.vercel.app/
https://nousync-*.vercel.app/
```

具体的な手順：
1. [Supabase Dashboard](https://supabase.com/dashboard)にログイン
2. プロジェクトを選択
3. Authentication → URL Configuration
4. 「Redirect URLs」に上記のパターンを追加
5. 「Save」をクリック

### 2. 環境変数の設定

Vercelのプロジェクト設定で以下の環境変数を設定：

#### Production & Preview & Development:
```
# Supabase
SUPABASE_URL=https://YOUR-PROJECT.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Database
DATABASE_URL=postgresql://...

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GEMINI_API_KEY=...

# Cloudflare Gateway (Optional)
CLOUDFLARE_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/YOUR_ACCOUNT_ID/YOUR_GATEWAY
CLOUDFLARE_GATEWAY_TOKEN=your-token

# Frontend (VITE_で始まる変数)
VITE_SUPABASE_URL=https://YOUR-PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
VITE_API_URL=/api
```

### 3. 動的リダイレクトの仕組み

アプリケーションは自動的に現在のURLを検出して、適切なリダイレクトURLを設定します：

- Production: `https://nousync.vercel.app/`
- Preview: `https://nousync-pr-123.vercel.app/`
- Branch: `https://nousync-feature-branch.vercel.app/`

これは`/apps/web/src/contexts/AuthContext.tsx`で実装されています。

### 4. トラブルシューティング

#### 認証後に本番環境にリダイレクトされる場合

1. Supabaseダッシュボードでワイルドカード設定を確認
2. ブラウザのキャッシュとCookieをクリア
3. プライベートブラウジングモードで試す

#### 「Redirect URL not allowed」エラーが表示される場合

1. SupabaseのRedirect URLsリストを確認
2. URLの末尾のスラッシュ（`/`）に注意
3. HTTPSプロトコルを使用していることを確認

## ローカル開発環境

ローカルでの開発時は、以下のURLをSupabaseに追加：

```
http://localhost:5173/
http://localhost:3000/
```

## セキュリティ上の注意

- ワイルドカード設定（`*.vercel.app`）は便利ですが、セキュリティリスクもあります
- 本番環境では具体的なURLのみを許可することを推奨
- 定期的に使用されていないURLを削除してください