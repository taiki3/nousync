# Claude Development Guidelines

## 🚀 Development Workflow - GitHub Flow

このプロジェクトでは**GitHub Flow**を採用しています。`main`ブランチへの直接pushは禁止されています。

### ブランチ戦略

1. **main branch**:
   - プロダクション環境にデプロイ可能な安定したコード
   - 直接のpushは禁止（Branch Protectionで保護）
   - PRのマージのみ許可

2. **feature branches**:
   - 命名規則: `feature/機能名` or `fix/バグ名` or `chore/タスク名`
   - 例:
     - `feature/add-export-function`
     - `fix/streaming-duplicate-messages`
     - `chore/update-dependencies`

### 開発フロー

```bash
# 1. 最新のmainブランチを取得
git checkout main
git pull origin main

# 2. 新しいfeatureブランチを作成
git checkout -b feature/your-feature-name

# 3. 変更を実装・コミット
git add .
git commit -m "feat: add new feature"

# 4. リモートにプッシュ
git push -u origin feature/your-feature-name

# 5. GitHub上でPull Requestを作成
gh pr create --title "feat: add new feature" --body "Description of changes"

# 6. レビュー後、マージ（GitHub上で実行）
```

### コミットメッセージ規約

[Conventional Commits](https://www.conventionalcommits.org/)に従います：

- `feat:` 新機能
- `fix:` バグ修正
- `docs:` ドキュメントのみの変更
- `style:` コードの意味に影響しない変更（空白、フォーマット等）
- `refactor:` バグ修正や機能追加を含まないコード変更
- `perf:` パフォーマンス改善
- `test:` テストの追加・修正
- `chore:` ビルドプロセスやツールの変更

### Pull Requestのルール

1. **必須項目**:
   - 明確なタイトル（コミット規約に従う）
   - 変更内容の説明
   - テスト手順
   - スクリーンショット（UI変更の場合）

2. **自動チェック**:
   - ビルドの成功
   - TypeScriptの型チェック
   - Lintエラーなし

## 🛠 技術スタック

### Frontend (apps/web)
- **React** + **TypeScript**
- **Vite** (ビルドツール)
- **Tailwind CSS** + **shadcn/ui**
- **Supabase** (認証)
- **React Markdown** (Markdownレンダリング)

### Backend (api/)
- **Vercel Functions** (サーバーレス)
- **PostgreSQL** (Supabase)
- **Row Level Security (RLS)**
- **AI Providers**: OpenAI, Anthropic, Google Gemini
- **Cloudflare AI Gateway** (オプション)

### 共通 (packages/shared)
- 型定義の共有
- 共通ユーティリティ

## 📁 プロジェクト構造

```
nousync/
├── api/                    # Vercel Functions (Backend)
│   ├── lib/               # 共通ライブラリ
│   │   ├── db.ts         # データベース接続とRLS
│   │   ├── auth.ts       # 認証ヘルパー
│   │   └── ai-providers.ts # AI プロバイダー統合
│   ├── documents.ts       # ドキュメントAPI
│   └── chat/             # チャットAPI
├── apps/
│   └── web/              # Reactアプリ
│       ├── src/
│       │   ├── components/
│       │   ├── services/
│       │   └── utils/
│       └── package.json
├── packages/
│   └── shared/           # 共有パッケージ
└── supabase/
    └── migrations/       # DBマイグレーション
```

## 🔑 環境変数

### 必須
```env
# Database
DATABASE_URL=postgresql://...

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# AI Providers (少なくとも1つ)
OPENAI_API_KEY=sk-xxx
ANTHROPIC_API_KEY=sk-ant-xxx
GEMINI_API_KEY=xxx
```

### オプション
```env
# Cloudflare AI Gateway
CLOUDFLARE_GATEWAY_URL=https://gateway.ai.cloudflare.com/v1/...
CLOUDFLARE_GATEWAY_TOKEN=xxx
```

## 🎨 コーディング規約

### TypeScript
- 明示的な型定義を使用
- `any`型は避ける
- インターフェース名は`I`プレフィックスなし

### React
- 関数コンポーネントを使用
- カスタムフックは`use`プレフィックス
- メモ化は必要な箇所のみ

### スタイリング
- Tailwind CSSを優先
- カスタムCSSは最小限に
- ダークモード対応必須

## 🚦 デバッグとトラブルシューティング

### ローカル開発
```bash
# Frontend開発サーバー
pnpm dev

# ビルドチェック
pnpm build

# 型チェック
pnpm type-check
```

### よくある問題

1. **認証エラー**: SupabaseのリダイレクトURLを確認
2. **API 404**: Vercelのファンクション数制限を確認（Hobbyプランは12個まで）
3. **ストリーミングエラー**: Vercel Edge Runtimeの制限を確認

## 📝 メモ

- ストリーミングレスポンスはSSE (Server-Sent Events)を使用
- Markdownレンダリングはアシスタントメッセージのみ
- ドキュメントコンテキストは全文読み込み（RAGではない）
- Vercelプレビューデプロイメントは自動的にリダイレクトURLを検出