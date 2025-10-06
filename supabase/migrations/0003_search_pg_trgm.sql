-- 日本語向け代替: pg_trgm で部分一致/類似度検索
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- タイトル/本文に対するtrgmインデックス
CREATE INDEX IF NOT EXISTS documents_title_trgm_idx
  ON documents USING GIN (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS documents_content_trgm_idx
  ON documents USING GIN (content gin_trgm_ops);

-- 類似度しきい値（必要に応じ調整）
-- SELECT set_limit(0.1);
