-- embeddings テーブルのRLS有効化とポリシー

ALTER TABLE embeddings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS embeddings_select_own ON embeddings;
CREATE POLICY embeddings_select_own ON embeddings
  FOR SELECT USING (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS embeddings_insert_own ON embeddings;
CREATE POLICY embeddings_insert_own ON embeddings
  FOR INSERT WITH CHECK (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS embeddings_update_own ON embeddings;
CREATE POLICY embeddings_update_own ON embeddings
  FOR UPDATE USING (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  ) WITH CHECK (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS embeddings_delete_own ON embeddings;
CREATE POLICY embeddings_delete_own ON embeddings
  FOR DELETE USING (
    document_id IN (SELECT id FROM documents WHERE user_id = auth.uid())
  );
