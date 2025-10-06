# AGENTS.md — Nousync (Supabase + Vercel)

このリポジトリで作業を再開するエージェント向けの実務ガイドです。ルート直下のスコープに適用されます。

## 目的
- Supabase（Auth/DB/Storage）とVercel（Functions/Static）上でNotebookLM的なドキュメント管理＋チャット（RAG）を提供します。

## 構成
- apps/
  - api/ … Vercel Functions（TypeScript/ESM、NodeNext）
    - api/*.ts … ルート（/api/*）
    - lib/*.ts … DB/RLSやAuthの共通処理
    - tsconfig.json … moduleResolution: NodeNext、types: node
  - web/ … Vite + React（Supabase Auth）
    - src/*, vite.config.ts
- packages/shared/ … 共有型
- supabase/migrations/ … SQL（拡張/スキーマ/RLS/索引）
- vercel.json … デプロイ設定（static-build + SPA fallback, @vercel/node）
- SETUP.md … Supabase/Vercel手順
- README.md … 方針と構成

## ローカル実行
- 前提: Node 20+, pnpm（Corepack推奨）, Vercel CLI
- インストール: `pnpm -w install`
- Web開発: `pnpm --filter @nousync/web dev`
- Functionsローカル: `vercel dev`（ルートで）
- ルートを monorepo 直下（このリポジトリのルート）で実行すること

## 主要環境変数
- API（Vercel）: `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `USE_PGROONGA`, `OPENAI_API_KEY`, `EMBEDDING_MODEL`
- Web（Vercel）: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_API_URL=/api`
- ローカル: `.env.local` 等で同名を設定

## 開発ルール
- 変更は小さく、スコープは明確に。不要な破壊的変更は避ける。
- Supabase RLSを前提とし、SQL実行時は `SET LOCAL "request.jwt.claims"` を付与（`lib/db.ts` の `withRls` を使う）。
- ESM/NodeNextのため、相対インポートは拡張子`.js`を明示。
- 大容量アップロードはサーバ経由にせず、Supabase Storageへ直アップロード。

## デプロイ（Vercel）
- vercel.json は以下を前提:
  - Web: `@vercel/static-build`（distDir: dist）
  - Functions: `@vercel/node`（apps/api/api/**/*.ts）
  - SPAフォールバック: `/(.*) -> apps/web/dist/index.html`
- Project Settings の Root Directory は未指定（リポ直下）。

## 現在の未完了タスク（概要）
- [Web] Projects/Docs/Embeddings/RAGのUI連携
- [Storage] Supabase Storage直アップロード＋抽出処理
- [API] チャットAPI（モデル呼び出し＋RAGコンテキスト）
- [Types] @types/pg等の型整備、ログノイズ削減
- [Infra] Vercel 404の完全解消の確認（本番プロジェクト設定含む）

## 参考
- SETUP.md にSupabase拡張とRLS、Vercel設定の手順あり。
- ルート `reference/` に参考用のソースを格納（.gitignore 対象）。
