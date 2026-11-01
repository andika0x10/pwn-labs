PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  github_id INTEGER UNIQUE NOT NULL,
  username TEXT UNIQUE NOT NULL,
  avatar_url TEXT,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS progress (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL,
  solved_at INTEGER NOT NULL,
  points INTEGER NOT NULL CHECK(points >= 0),
  hints_used INTEGER NOT NULL DEFAULT 0 CHECK(hints_used >= 0),
  attempts INTEGER NOT NULL DEFAULT 0 CHECK(attempts >= 0),
  PRIMARY KEY (user_id, level_id)
);

CREATE TABLE IF NOT EXISTS submissions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  level_id TEXT NOT NULL,
  correct INTEGER NOT NULL CHECK(correct = 1),
  created_at INTEGER NOT NULL,
  UNIQUE(user_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires_at);
CREATE INDEX IF NOT EXISTS idx_progress_user ON progress(user_id);
CREATE INDEX IF NOT EXISTS idx_progress_ranking ON progress(points DESC, solved_at ASC);
CREATE INDEX IF NOT EXISTS idx_submissions_level ON submissions(level_id, created_at);
