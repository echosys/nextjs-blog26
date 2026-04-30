DROP TABLE IF EXISTS post_chunks;
DROP TABLE IF EXISTS posts;

CREATE TABLE posts (
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  content TEXT NOT NULL,
  -- JSON: { "file": "name.pdf", "inline_images": [{"id":"...", "name":"...", "chunkIndex":-1}, ...] }
  -- Legacy plain string (old attachment name) is also accepted by parseAttachmentMetadata()
  attachment_name TEXT,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP
);

CREATE TABLE post_chunks (
  id SERIAL PRIMARY KEY,
  post_id INTEGER REFERENCES posts(id) ON DELETE CASCADE,
  chunk_index INTEGER NOT NULL,
  data TEXT NOT NULL,
  -- Chunk index convention:
  --   chunk_index >= 0 : file attachment chunks (assembled in order 0, 1, 2, …)
  --   chunk_index < 0  : inline image chunks (-1 = first image, -2 = second, …)
  UNIQUE (post_id, chunk_index)
);

CREATE INDEX idx_post_chunks_post_id ON post_chunks(post_id);
-- Partial index for fast attachment-only queries
CREATE INDEX idx_post_chunks_attachment ON post_chunks(post_id) WHERE chunk_index >= 0;
-- Partial index for fast inline-image queries
CREATE INDEX idx_post_chunks_inline ON post_chunks(post_id) WHERE chunk_index < 0;
