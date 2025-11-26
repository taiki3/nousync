-- Y.js の状態をサーバーサイドで永続化するためのカラム追加
-- bytea 型で Y.js の状態をバイナリとして保存

ALTER TABLE documents ADD COLUMN IF NOT EXISTS yjs_state BYTEA;

-- 更新時刻を自動更新するトリガー（yjs_state 更新時も updated_at を更新）
-- 既存の updated_at トリガーがあればそれを使用、なければ作成

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- トリガーが存在しない場合のみ作成
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'update_documents_updated_at'
  ) THEN
    CREATE TRIGGER update_documents_updated_at
      BEFORE UPDATE ON documents
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END;
$$;
