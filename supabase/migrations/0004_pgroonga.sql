-- PGroonga を有効化し、documents(title, content) にインデックスを作成
CREATE EXTENSION IF NOT EXISTS pgroonga;

-- 単一列に対するPGroongaインデックス（両方作成）
CREATE INDEX IF NOT EXISTS documents_content_pgroonga
  ON documents USING pgroonga (content);

CREATE INDEX IF NOT EXISTS documents_title_pgroonga
  ON documents USING pgroonga (title);

-- 参考：スコアで並べたい場合は pgroonga_score(tableoid, ctid) を使う
-- 例）ORDER BY pgroonga_score(tableoid, ctid) DESC
