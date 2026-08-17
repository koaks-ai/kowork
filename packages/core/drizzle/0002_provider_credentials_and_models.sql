-- API keys are stored by Electron Main with safeStorage. Core stores only the
-- credential identifier and provider/model metadata.
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  kind TEXT NOT NULL,
  protocol TEXT NOT NULL,
  base_url TEXT NOT NULL,
  credential_id TEXT,
  default_context_window_tokens INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  deleted_at INTEGER
);

INSERT INTO providers (
  id,
  name,
  kind,
  protocol,
  base_url,
  credential_id,
  default_context_window_tokens,
  enabled,
  created_at,
  updated_at,
  deleted_at
) VALUES
  ('provider-openai-chat', 'OpenAI', 'openai', 'openai-chat', 'https://api.openai.com', NULL, 1000000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-anthropic', 'Anthropic', 'anthropic', 'anthropic', 'https://api.anthropic.com', NULL, 200000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-qwen', 'Qwen', 'qwen', 'qwen', 'https://dashscope.aliyuncs.com/compatible-mode', NULL, 131072, 1, unixepoch() * 1000, unixepoch() * 1000, NULL);

CREATE TABLE model_profiles_v2 (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id),
  name TEXT NOT NULL,
  model TEXT NOT NULL,
  context_window_tokens INTEGER NOT NULL,
  source TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE(provider_id, model)
);

INSERT INTO model_profiles_v2 (
  id,
  provider_id,
  name,
  model,
  context_window_tokens,
  source,
  enabled,
  created_at,
  updated_at
)
SELECT
  id,
  CASE provider_type
    WHEN 'anthropic' THEN 'provider-anthropic'
    WHEN 'qwen' THEN 'provider-qwen'
    ELSE 'provider-openai-chat'
  END,
  name,
  model,
  context_window_tokens,
  'builtin',
  1,
  unixepoch() * 1000,
  unixepoch() * 1000
FROM model_profiles;

INSERT OR IGNORE INTO model_profiles_v2 (
  id,
  provider_id,
  name,
  model,
  context_window_tokens,
  source,
  enabled,
  created_at,
  updated_at
) VALUES
  ('openai-gpt-4.1-mini', 'provider-openai-chat', 'GPT-4.1 mini', 'gpt-4.1-mini', 1000000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('anthropic-sonnet', 'provider-anthropic', 'Claude Sonnet 4.5', 'claude-sonnet-4-5', 200000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('qwen-plus', 'provider-qwen', 'Qwen Plus', 'qwen-plus', 131072, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000);

DROP TABLE model_profiles;
ALTER TABLE model_profiles_v2 RENAME TO model_profiles;
CREATE INDEX model_profiles_provider_idx ON model_profiles(provider_id, enabled);
CREATE INDEX providers_active_idx ON providers(deleted_at, enabled);
