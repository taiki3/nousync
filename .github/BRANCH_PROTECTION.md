# Branch Protection設定ガイド

このドキュメントでは、`main`ブランチの保護設定について説明します。

## 🔒 GitHub Branch Protection設定手順

### 1. Settings → Branches にアクセス

1. GitHubリポジトリページで「Settings」タブをクリック
2. 左サイドバーの「Branches」をクリック
3. 「Add branch protection rule」をクリック

### 2. Branch name pattern

```
main
```

### 3. 推奨設定

#### ✅ 必須設定

- **[x] Require a pull request before merging**
  - [x] Require approvals: `1`（最低1人のレビュー）
  - [x] Dismiss stale pull request approvals when new commits are pushed
  - [x] Require review from CODEOWNERS（CODEOWNERS設定時）

- **[x] Require status checks to pass before merging**
  - [x] Require branches to be up to date before merging
  - 必須ステータスチェック:
    - `build`（ビルドチェック）
    - `typecheck`（型チェック）

- **[x] Require conversation resolution before merging**
  （全てのコメントが解決されるまでマージ不可）

- **[x] Require linear history**
  （マージコミットを禁止、リベース必須）

#### ⚙️ オプション設定

- **[ ] Require signed commits**
  （署名付きコミットを要求）

- **[x] Include administrators**
  （管理者にも制限を適用）

- **[ ] Allow force pushes**
  - [ ] Everyone
  - [ ] Specify who can force push

- **[x] Allow deletions**
  （ブランチの削除を許可 - 通常は無効）

### 4. GitHub Actions設定

`.github/workflows/ci.yml`を作成：

```yaml
name: CI

on:
  pull_request:
    branches: [ main ]
  push:
    branches: [ main ]

jobs:
  build:
    runs-on: ubuntu-latest

    steps:
    - uses: actions/checkout@v4

    - uses: pnpm/action-setup@v2
      with:
        version: 8

    - uses: actions/setup-node@v4
      with:
        node-version: '20'
        cache: 'pnpm'

    - name: Install dependencies
      run: pnpm install --frozen-lockfile

    - name: Type check
      run: pnpm type-check

    - name: Build
      run: pnpm build

    - name: Test
      run: pnpm test
      if: ${{ always() }}
```

## 🚀 開発者向けワークフロー

### 保護されたmainブランチでの作業

```bash
# ❌ これはできません
git checkout main
git commit -m "fix: something"
git push origin main
# エラー: protected branch

# ✅ 正しい方法
git checkout main
git pull origin main
git checkout -b fix/something
git commit -m "fix: something"
git push -u origin fix/something
# GitHubでPRを作成
```

### 緊急時の対応

管理者権限があっても、直接pushは避けてください。
緊急の修正が必要な場合：

1. **Hotfixブランチを作成**
   ```bash
   git checkout -b hotfix/critical-fix
   git commit -m "fix: critical security issue"
   git push -u origin hotfix/critical-fix
   ```

2. **緊急PRを作成**
   ```bash
   gh pr create --title "🚨 HOTFIX: Critical security issue" \
     --body "Emergency fix" \
     --label "hotfix,priority:high"
   ```

3. **迅速なレビューとマージ**

## 📊 Branch Protection Status Badge

READMEに追加できるバッジ：

```markdown
![Branch Protection](https://img.shields.io/badge/branch%20protection-enabled-brightgreen)
```

## 🔍 トラブルシューティング

### PR がマージできない場合

1. **Status checks failing**
   - CIが通るまで修正
   - `pnpm build`と`pnpm type-check`をローカルで実行

2. **Merge conflicts**
   ```bash
   git checkout feature/your-branch
   git fetch origin
   git rebase origin/main
   # コンフリクトを解決
   git push --force-with-lease
   ```

3. **Review required**
   - レビュアーに連絡
   - PRの説明を改善

### 設定の確認

```bash
# GitHub CLIで確認
gh api repos/:owner/:repo/branches/main/protection
```

## 📝 CODEOWNERS設定（オプション）

`.github/CODEOWNERS`ファイル：

```
# デフォルトのオーナー
* @taiki3

# 特定のファイルやディレクトリ
/api/ @taiki3
/apps/web/ @taiki3
/packages/ @taiki3

# ドキュメント
*.md @taiki3
/docs/ @taiki3
```

これにより、特定のファイルの変更には指定されたオーナーのレビューが必須になります。