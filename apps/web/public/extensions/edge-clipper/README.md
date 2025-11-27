# Nousync Web Clipper for Microsoft Edge

Nousyncのドキュメントへ社内Webページ/PDFを保存するための開発中拡張です。Chrome/Edge DevモードでZIPを展開し、`options.html` からSupabase認証とAPIエンドポイントを設定してください。

## 主な仕組み

- Docling API (`/v1/convert/source`) にブラウザーから直接POSTし、Markdownを取得
- Doclingから取得できない場合はページの選択範囲または本文テキストをフォールバック
- Supabase Auth（GitHub OAuth）でアクセストークンを取得し、Nousync API `/documents` にBearerで送信
- ZIPはVercel上の静的ファイル（`apps/web/public/extensions/edge-clipper/*`）をそのまま圧縮

## 手動インストール手順

1. Nousync UIの「Web Clipper」モーダルからZIPをダウンロード
2. 解凍後、Edgeの `edge://extensions/` で「展開して読み込み」を実行
3. オプションページで以下を設定
   - Nousync APIベースURL（例: `https://{your-app}.vercel.app/api`）
   - Docling APIベースURL（社内ネットワーク内）
   - 「ログイン」ボタンからSupabase (GitHub) 認証
   - 任意のタグ/プロジェクトID/出典追記設定

## リダイレクト設定

- SupabaseのRedirect URLsに `https://*.chromiumapp.org/*` を追加してください（`chrome.identity.launchWebAuthFlow` のリダイレクト先）。

## ライセンス

- `jszip.min.js` は [JSZip](https://stuk.github.io/jszip/) 3.10.1 のビルド済みファイル（MITライセンス）を同梱しています。
- `supabase.js` は `@supabase/supabase-js` のUMDビルドです（MITライセンス）。
