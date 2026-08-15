-- Runtime migrations are mirrored in src/infrastructure/db/migrations.ts so the
-- packaged utility process does not depend on filesystem-relative SQL assets.
-- This file is the reviewable source for the initial schema.
CREATE TABLE IF NOT EXISTS projects (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  root_path TEXT NOT NULL UNIQUE,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

CREATE TABLE IF NOT EXISTS model_profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  provider_type TEXT NOT NULL,
  model TEXT NOT NULL,
  base_url TEXT,
  api_key_env TEXT,
  context_window_tokens INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS threads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id),
  title TEXT NOT NULL,
  model_profile_id TEXT NOT NULL REFERENCES model_profiles(id),
  permission_mode TEXT NOT NULL,
  context_window_tokens INTEGER,
  queue_paused INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);
CREATE INDEX IF NOT EXISTS threads_project_idx ON threads(project_id, deleted_at);

CREATE TABLE IF NOT EXISTS turn_requests (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL REFERENCES threads(id),
  input TEXT NOT NULL,
  status TEXT NOT NULL,
  model_profile_id TEXT NOT NULL,
  permission_mode TEXT NOT NULL,
  context_window_tokens INTEGER NOT NULL,
  position INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS turn_requests_thread_idx
  ON turn_requests(thread_id, status, position);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL REFERENCES turn_requests(id),
  thread_id TEXT NOT NULL REFERENCES threads(id),
  status TEXT NOT NULL,
  model_profile_id TEXT NOT NULL,
  started_at INTEGER NOT NULL,
  finished_at INTEGER,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  error TEXT
);
CREATE INDEX IF NOT EXISTS runs_thread_idx ON runs(thread_id, started_at);

CREATE TABLE IF NOT EXISTS run_events (
  sequence INTEGER PRIMARY KEY AUTOINCREMENT,
  id TEXT NOT NULL UNIQUE,
  project_id TEXT,
  thread_id TEXT,
  run_id TEXT,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS run_events_thread_idx ON run_events(thread_id, sequence);

CREATE TABLE IF NOT EXISTS approvals (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  thread_id TEXT NOT NULL,
  run_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  title TEXT NOT NULL,
  detail TEXT NOT NULL,
  status TEXT NOT NULL,
  requested_path TEXT,
  created_at INTEGER NOT NULL,
  resolved_at INTEGER
);
CREATE INDEX IF NOT EXISTS approvals_pending_idx ON approvals(status, created_at);

CREATE TABLE IF NOT EXISTS path_grants (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL,
  root_path TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS path_grants_run_idx ON path_grants(run_id);

CREATE TABLE IF NOT EXISTS conversation_turns (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  ordinal INTEGER NOT NULL,
  status_json TEXT NOT NULL,
  items_json TEXT NOT NULL,
  checkpoint_json TEXT,
  usage_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  UNIQUE(thread_id, ordinal)
);
CREATE INDEX IF NOT EXISTS conversation_turns_thread_idx
  ON conversation_turns(thread_id, ordinal);

CREATE TABLE IF NOT EXISTS compression_checkpoints (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  model_profile_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  covered_through_ordinal INTEGER NOT NULL,
  estimated_tokens INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS compression_thread_idx
  ON compression_checkpoints(thread_id, created_at);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
