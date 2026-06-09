CREATE TABLE IF NOT EXISTS skills (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  description TEXT NOT NULL,
  version TEXT NOT NULL DEFAULT '1.0.0',
  source TEXT NOT NULL DEFAULT 'upload',
  archive_key TEXT NOT NULL,
  skill_md_key TEXT NOT NULL,
  content_hash TEXT NOT NULL,
  instructions_text TEXT NOT NULL,
  file_manifest_json TEXT NOT NULL DEFAULT '[]',
  is_enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
  updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now'))
);

CREATE INDEX IF NOT EXISTS idx_skills_enabled
  ON skills(is_enabled, name);
