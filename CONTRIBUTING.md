# Contributing to Nousync

このドキュメントでは、Nousyncプロジェクトへの貢献方法について説明します。

## 🌟 貢献の方法

- バグの報告
- 新機能の提案
- コードの改善
- ドキュメントの更新
- テストの追加

## 🔄 GitHub Flow

このプロジェクトでは**GitHub Flow**を採用しています。

### 基本ルール

1. **mainブランチは常にデプロイ可能な状態を保つ**
2. **全ての変更はPull Request経由で行う**
3. **コードレビューを必須とする**
4. **CIが通ることを確認する**

## 🚀 開発の始め方

### 1. リポジトリのフォーク（外部コントリビューターの場合）

```bash
# GitHubでフォークした後
git clone https://github.com/YOUR_USERNAME/nousync.git
cd nousync
git remote add upstream https://github.com/taiki3/nousync.git
```

### 2. 開発環境のセットアップ

```bash
# 依存関係のインストール
pnpm install

# 環境変数の設定
cp .env.example .env
# .envファイルを編集して必要な値を設定

# 開発サーバーの起動
pnpm dev
```

### 3. ブランチの作成

```bash
# 最新のmainを取得
git checkout main
git pull upstream main  # フォークの場合
# or
git pull origin main    # 直接作業の場合

# featureブランチを作成
git checkout -b feature/amazing-feature
```

### 4. 変更の実装

```bash
# コードを変更

# ビルドとテストの実行
pnpm build
pnpm test  # テストがある場合

# 型チェック
pnpm type-check
```

### 5. コミット

```bash
# 変更をステージング
git add .

# Conventional Commitsに従ってコミット
git commit -m "feat: add amazing feature"
```

#### コミットメッセージの形式

```
<type>(<scope>): <subject>

<body>

<footer>
```

**Type:**
- `feat`: 新機能
- `fix`: バグ修正
- `docs`: ドキュメントのみの変更
- `style`: フォーマットの変更（コードの動作に影響しない）
- `refactor`: リファクタリング
- `perf`: パフォーマンス改善
- `test`: テストの追加・修正
- `chore`: ビルドプロセスやツールの変更

**例:**
```bash
git commit -m "feat(chat): add markdown rendering support

- Install react-markdown with syntax highlighting
- Create MarkdownMessage component
- Support tables, code blocks, and lists

Closes #123"
```

### 6. プッシュとPull Request

```bash
# リモートにプッシュ
git push -u origin feature/amazing-feature
```

#### GitHub CLIを使用する場合

```bash
# PRを作成
gh pr create \
  --title "feat: add amazing feature" \
  --body "## Description

  Add amazing feature that does X, Y, and Z.

  ## Changes
  - Added new component
  - Updated API endpoint
  - Fixed related bug

  ## Testing
  1. Run the app
  2. Click on the new button
  3. Verify the feature works

  ## Screenshots
  [If applicable]"
```

#### GitHub Web UIを使用する場合

1. GitHubでリポジトリを開く
2. "Compare & pull request"ボタンをクリック
3. PRテンプレートに従って情報を記入

## 📋 Pull Requestのチェックリスト

PRを作成する前に確認：

- [ ] コードがビルドされる（`pnpm build`）
- [ ] TypeScriptの型エラーがない（`pnpm type-check`）
- [ ] Lintエラーがない（実装されている場合）
- [ ] 新機能にはドキュメントを追加
- [ ] 重要な変更にはテストを追加
- [ ] コミットメッセージがConventional Commitsに従っている
- [ ] PRの説明が明確で完全

## 🔍 コードレビューのポイント

### レビュアーが確認すること

1. **機能性**: 意図通りに動作するか
2. **コード品質**: 読みやすく保守しやすいか
3. **パフォーマンス**: 効率的な実装か
4. **セキュリティ**: セキュリティ上の問題はないか
5. **スタイル**: プロジェクトの規約に従っているか

### 作者が心がけること

1. **小さなPR**: レビューしやすい適切なサイズ
2. **明確な説明**: 何を、なぜ変更したか
3. **セルフレビュー**: PRを作る前に自分でレビュー
4. **レスポンス**: フィードバックに迅速に対応

## 🎯 ブランチ命名規則

```
feature/   - 新機能の追加
fix/       - バグ修正
docs/      - ドキュメントの更新
style/     - コードスタイルの変更
refactor/  - リファクタリング
perf/      - パフォーマンス改善
test/      - テストの追加・修正
chore/     - その他の変更
```

例:
- `feature/add-export-function`
- `fix/chat-streaming-error`
- `docs/update-readme`
- `chore/update-dependencies`

## 🚫 避けるべきこと

1. **mainブランチへの直接push**
2. **大きすぎるPR**（理想は400行以下）
3. **複数の機能を1つのPRに含める**
4. **テストなしの重要な変更**
5. **ドキュメントなしの公開API変更**

## 🆘 ヘルプ

質問がある場合：

1. [Issues](https://github.com/taiki3/nousync/issues)で質問
2. [Discussions](https://github.com/taiki3/nousync/discussions)で議論
3. PRのコメントで相談

## 📜 ライセンス

貢献することで、あなたのコードがプロジェクトのライセンス下で配布されることに同意したものとみなされます。