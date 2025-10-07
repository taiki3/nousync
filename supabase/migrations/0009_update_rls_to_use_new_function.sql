-- Update RLS policies to use public.get_current_user_id() instead of auth.uid()

-- Projects policies
DROP POLICY IF EXISTS "projects_select" ON projects;
DROP POLICY IF EXISTS "projects_insert" ON projects;
DROP POLICY IF EXISTS "projects_update" ON projects;
DROP POLICY IF EXISTS "projects_delete" ON projects;

CREATE POLICY "projects_select" ON projects
  FOR SELECT USING (user_id = public.get_current_user_id());

CREATE POLICY "projects_insert" ON projects
  FOR INSERT WITH CHECK (user_id = public.get_current_user_id());

CREATE POLICY "projects_update" ON projects
  FOR UPDATE USING (user_id = public.get_current_user_id()) 
  WITH CHECK (user_id = public.get_current_user_id());

CREATE POLICY "projects_delete" ON projects
  FOR DELETE USING (user_id = public.get_current_user_id());

-- Documents policies
DROP POLICY IF EXISTS "documents_select" ON documents;
DROP POLICY IF EXISTS "documents_insert" ON documents;
DROP POLICY IF EXISTS "documents_update" ON documents;
DROP POLICY IF EXISTS "documents_delete" ON documents;

CREATE POLICY "documents_select" ON documents
  FOR SELECT USING (user_id = public.get_current_user_id());

CREATE POLICY "documents_insert" ON documents
  FOR INSERT WITH CHECK (
    user_id = public.get_current_user_id()
    AND (project_id IS NULL OR project_id IN (
      SELECT id FROM projects WHERE user_id = public.get_current_user_id()
    ))
  );

CREATE POLICY "documents_update" ON documents
  FOR UPDATE USING (user_id = public.get_current_user_id()) 
  WITH CHECK (
    user_id = public.get_current_user_id()
    AND (project_id IS NULL OR project_id IN (
      SELECT id FROM projects WHERE user_id = public.get_current_user_id()
    ))
  );

CREATE POLICY "documents_delete" ON documents
  FOR DELETE USING (user_id = public.get_current_user_id());

-- Embeddings policies
DROP POLICY IF EXISTS "embeddings_select" ON embeddings;
DROP POLICY IF EXISTS "embeddings_insert" ON embeddings;
DROP POLICY IF EXISTS "embeddings_delete" ON embeddings;

CREATE POLICY "embeddings_select" ON embeddings
  FOR SELECT USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = public.get_current_user_id()
    )
  );

CREATE POLICY "embeddings_insert" ON embeddings
  FOR INSERT WITH CHECK (
    document_id IN (
      SELECT id FROM documents WHERE user_id = public.get_current_user_id()
    )
  );

CREATE POLICY "embeddings_delete" ON embeddings
  FOR DELETE USING (
    document_id IN (
      SELECT id FROM documents WHERE user_id = public.get_current_user_id()
    )
  );

-- Conversations policies
DROP POLICY IF EXISTS "conversations_select" ON conversations;
DROP POLICY IF EXISTS "conversations_insert" ON conversations;
DROP POLICY IF EXISTS "conversations_update" ON conversations;
DROP POLICY IF EXISTS "conversations_delete" ON conversations;

CREATE POLICY "conversations_select" ON conversations
  FOR SELECT USING (user_id = public.get_current_user_id());

CREATE POLICY "conversations_insert" ON conversations
  FOR INSERT WITH CHECK (user_id = public.get_current_user_id());

CREATE POLICY "conversations_update" ON conversations
  FOR UPDATE USING (user_id = public.get_current_user_id()) 
  WITH CHECK (user_id = public.get_current_user_id());

CREATE POLICY "conversations_delete" ON conversations
  FOR DELETE USING (user_id = public.get_current_user_id());

-- Messages policies  
DROP POLICY IF EXISTS "messages_select" ON messages;
DROP POLICY IF EXISTS "messages_insert" ON messages;
DROP POLICY IF EXISTS "messages_delete" ON messages;

CREATE POLICY "messages_select" ON messages
  FOR SELECT USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = public.get_current_user_id()
    )
  );

CREATE POLICY "messages_insert" ON messages
  FOR INSERT WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = public.get_current_user_id()
    )
  );

CREATE POLICY "messages_delete" ON messages
  FOR DELETE USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = public.get_current_user_id()
    )
  );
