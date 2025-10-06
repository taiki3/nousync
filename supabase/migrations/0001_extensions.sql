-- 必要な拡張
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "vector";
-- 代替全文検索（PGroonga不可の場合）
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
