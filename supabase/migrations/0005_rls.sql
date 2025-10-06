-- RLS有効化とポリシー

-- projects
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS projects_select_own ON projects;
CREATE POLICY projects_select_own ON projects
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS projects_insert_own ON projects;
CREATE POLICY projects_insert_own ON projects
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS projects_update_own ON projects;
CREATE POLICY projects_update_own ON projects
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS projects_delete_own ON projects;
CREATE POLICY projects_delete_own ON projects
  FOR DELETE USING (user_id = auth.uid());

-- documents
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_select_own ON documents;
CREATE POLICY documents_select_own ON documents
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS documents_insert_own ON documents;
CREATE POLICY documents_insert_own ON documents
  FOR INSERT WITH CHECK (
    user_id = auth.uid()
    AND (project_id IS NULL OR project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS documents_update_own ON documents;
CREATE POLICY documents_update_own ON documents
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (
    user_id = auth.uid()
    AND (project_id IS NULL OR project_id IN (SELECT id FROM projects WHERE user_id = auth.uid()))
  );

DROP POLICY IF EXISTS documents_delete_own ON documents;
CREATE POLICY documents_delete_own ON documents
  FOR DELETE USING (user_id = auth.uid());

-- conversations
ALTER TABLE conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS conversations_select_own ON conversations;
CREATE POLICY conversations_select_own ON conversations
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS conversations_insert_own ON conversations;
CREATE POLICY conversations_insert_own ON conversations
  FOR INSERT WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS conversations_update_own ON conversations;
CREATE POLICY conversations_update_own ON conversations
  FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS conversations_delete_own ON conversations;
CREATE POLICY conversations_delete_own ON conversations
  FOR DELETE USING (user_id = auth.uid());

-- messages（会話に紐付け。会話が自分のものであれば許可）
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS messages_select_own ON messages;
CREATE POLICY messages_select_own ON messages
  FOR SELECT USING (
    conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS messages_insert_own ON messages;
CREATE POLICY messages_insert_own ON messages
  FOR INSERT WITH CHECK (
    conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS messages_update_own ON messages;
CREATE POLICY messages_update_own ON messages
  FOR UPDATE USING (
    conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
  ) WITH CHECK (
    conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
  );

DROP POLICY IF EXISTS messages_delete_own ON messages;
CREATE POLICY messages_delete_own ON messages
  FOR DELETE USING (
    conversation_id IN (SELECT id FROM conversations WHERE user_id = auth.uid())
  );
