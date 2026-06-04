CREATE TABLE IF NOT EXISTS ai_article_threads (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  article_key TEXT NOT NULL UNIQUE,
  post_slug TEXT,
  title TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_ai_article_threads_post_slug
  ON ai_article_threads(post_slug);

CREATE TABLE IF NOT EXISTS ai_article_messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  thread_id INTEGER NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('user', 'assistant', 'tool')),
  content TEXT NOT NULL,
  tool_name TEXT,
  tool_payload TEXT,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  FOREIGN KEY (thread_id) REFERENCES ai_article_threads(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_ai_article_messages_thread_id
  ON ai_article_messages(thread_id, created_at ASC);
