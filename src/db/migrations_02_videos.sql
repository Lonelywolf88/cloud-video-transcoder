PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS videos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_id INTEGER NOT NULL,
  title TEXT NOT NULL,
  source_type TEXT NOT NULL CHECK(source_type IN ('upload','youtube')),
  source_url TEXT,
  original_path TEXT NOT NULL,
  duration_s INTEGER,
  status TEXT NOT NULL DEFAULT 'queued', -- queued | processing | completed | failed
  error_msg TEXT,
  thumb_path TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(owner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS renditions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  video_id INTEGER NOT NULL,
  resolution TEXT NOT NULL, -- '1080' | '720' | '480'
  path TEXT NOT NULL,
  size_bytes INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_videos_owner ON videos(owner_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_status ON videos(status);
