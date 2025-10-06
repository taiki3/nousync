-- PGroonga 用（Supabase Cloudでは権限/提供状況により不可の可能性があります）
-- 実行前に環境の対応可否を確認してください

-- CREATE EXTENSION IF NOT EXISTS pgroonga;
-- CREATE INDEX documents_content_pgroonga
--   ON documents USING pgroonga (content);
-- CREATE INDEX documents_title_pgroonga
--   ON documents USING pgroonga (title);

-- 例: 検索クエリ（アプリ側からの参照用・要環境調整）
-- SELECT id, title, left(content, 200) AS snippet, created_at
-- FROM documents
-- WHERE user_id = $1
--   AND content @@ '検索語';
-- -- ↑ PGroongaの演算子/クエリ構文は導入バージョンに合わせて調整してください
