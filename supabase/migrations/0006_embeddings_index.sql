-- ベクトル検索用のivfflatインデックス
CREATE INDEX IF NOT EXISTS embeddings_embedding_idx
  ON embeddings USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
