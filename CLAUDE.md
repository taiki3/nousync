# Nousync 開発ガイド

## 開発フロー

### ブランチ戦略
```
main     → 本番環境（Production）
dev      → 開発環境（Preview）
feature/* → 機能開発ブランチ
```

### 通常の開発フロー
```bash
# 1. devブランチから作業ブランチを作成
git checkout dev
git pull origin dev
git checkout -b feature/my-feature

# 2. 開発・コミット
git add .
git commit -m "feat: add new feature"

# 3. devブランチにマージ
git checkout dev
git merge feature/my-feature
git push origin dev

# 4. Vercel Previewで確認（自動デプロイ）
# URL: https://nousync-git-dev-agc-di-17ee7fbb.vercel.app

# 5. E2Eテスト実行
pnpm e2e

# 6. 問題なければmainにマージ → 本番デプロイ
git checkout main
git merge dev
git push origin main
```

### DBマイグレーション
```bash
# 新しいマイグレーションファイルを作成
# supabase/migrations/XXXX_description.sql

# devにpushすると自動的にGitHub Actionsで開発DBに適用される
git add supabase/migrations/
git commit -m "feat: add new migration"
git push origin dev

# 本番DBへの適用は手動でworkflow_dispatchから実行
# GitHub Actions → Supabase Migration → Run workflow → environment: prod
```

## 環境情報

| 環境 | Vercel URL | Supabase Project |
|------|------------|------------------|
| 本番 | https://nousync.vercel.app | `cgmltvkghwfwfligmscb` (nousync-prod) |
| 開発 | https://nousync-git-dev-agc-di-17ee7fbb.vercel.app | `jtammzjhhsusvvpoyazv` (nousync-dev) |

## テスト

### E2Eテスト
```bash
pnpm e2e              # 全テスト
pnpm e2e:headed       # ブラウザ表示付き
pnpm e2e:ui           # インタラクティブUI
```

### ユニットテスト
```bash
pnpm test             # 全テスト
pnpm --filter @nousync/api test  # APIのみ
```

## プロジェクト構成

```
nousync/
├── apps/
│   ├── api/          # Vercel Serverless Functions
│   └── web/          # React フロントエンド
├── api/              # API エントリーポイント（Vercel用）
├── supabase/
│   └── migrations/   # DBマイグレーション
├── e2e/              # E2Eテスト（Playwright）
└── .github/
    └── workflows/    # GitHub Actions
```

## よく使うコマンド

```bash
# 開発サーバー起動
pnpm dev

# ビルド
pnpm build

# Lint
pnpm lint

# 型チェック
pnpm typecheck
```
