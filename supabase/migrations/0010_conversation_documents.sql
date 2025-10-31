-- Create conversation_documents junction table for linking conversations to documents
CREATE TABLE IF NOT EXISTS conversation_documents (
  conversation_id UUID NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (conversation_id, document_id)
);

-- Create indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_conversation_documents_conversation ON conversation_documents(conversation_id);
CREATE INDEX IF NOT EXISTS idx_conversation_documents_document ON conversation_documents(document_id);

-- Enable RLS
ALTER TABLE conversation_documents ENABLE ROW LEVEL SECURITY;

-- RLS policies for conversation_documents
CREATE POLICY "Users can view their own conversation documents"
  ON conversation_documents
  FOR SELECT
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "Users can insert their own conversation documents"
  ON conversation_documents
  FOR INSERT
  WITH CHECK (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = get_current_user_id()
    )
  );

CREATE POLICY "Users can delete their own conversation documents"
  ON conversation_documents
  FOR DELETE
  USING (
    conversation_id IN (
      SELECT id FROM conversations WHERE user_id = get_current_user_id()
    )
  );
