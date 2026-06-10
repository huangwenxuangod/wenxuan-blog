CREATE TABLE IF NOT EXISTS aihot_daily_cache (
  date TEXT PRIMARY KEY,
  generated_at TEXT NOT NULL,
  window_start TEXT,
  window_end TEXT,
  lead_title TEXT,
  lead_paragraph TEXT,
  sections_json TEXT NOT NULL,
  raw_json TEXT NOT NULL,
  source_url TEXT NOT NULL DEFAULT 'https://aihot.virxact.com/api/public/daily',
  fetched_at TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'ready'
);

CREATE INDEX IF NOT EXISTS idx_aihot_daily_cache_generated_at
ON aihot_daily_cache(generated_at DESC);
