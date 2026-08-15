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
  ('provider-deepseek', 'DeepSeek', 'deepseek', 'openai-chat', 'https://api.deepseek.com', NULL, 128000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-openai-chat', 'OpenAI Chat Completions', 'openai', 'openai-chat', 'https://api.openai.com', NULL, 1000000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-openai-responses', 'OpenAI Responses', 'openai', 'openai-responses', 'https://api.openai.com', NULL, 1000000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-anthropic', 'Anthropic', 'anthropic', 'anthropic', 'https://api.anthropic.com', NULL, 200000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-qwen', 'Qwen', 'qwen', 'qwen', 'https://dashscope.aliyuncs.com/compatible-mode', NULL, 131072, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-ollama', 'Ollama', 'ollama', 'ollama', 'http://127.0.0.1:11434', NULL, 32768, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
  ('provider-custom-openai', 'OpenAI Compatible', 'custom', 'openai-chat', 'http://127.0.0.1:8000', NULL, 128000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL);

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
    WHEN 'deepseek' THEN 'provider-deepseek'
    WHEN 'openai' THEN 'provider-openai-chat'
    WHEN 'openai-responses' THEN 'provider-openai-responses'
    WHEN 'anthropic' THEN 'provider-anthropic'
    WHEN 'qwen' THEN 'provider-qwen'
    WHEN 'ollama' THEN 'provider-ollama'
    ELSE 'provider-custom-openai'
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
  ('deepseek-chat', 'provider-deepseek', 'DeepSeek Chat', 'deepseek-chat', 128000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('openai-gpt-4.1-mini', 'provider-openai-chat', 'GPT-4.1 mini', 'gpt-4.1-mini', 1000000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('openai-responses-gpt-4.1', 'provider-openai-responses', 'GPT-4.1 Responses', 'gpt-4.1', 1000000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('anthropic-sonnet', 'provider-anthropic', 'Claude Sonnet 4.5', 'claude-sonnet-4-5', 200000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('qwen-plus', 'provider-qwen', 'Qwen Plus', 'qwen-plus', 131072, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('ollama-qwen3', 'provider-ollama', 'Ollama Qwen3', 'qwen3:8b', 32768, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000),
  ('openai-compatible', 'provider-custom-openai', 'OpenAI Compatible', 'default', 128000, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000);

DROP TABLE model_profiles;
ALTER TABLE model_profiles_v2 RENAME TO model_profiles;
CREATE INDEX model_profiles_provider_idx ON model_profiles(provider_id, enabled);
CREATE INDEX providers_active_idx ON providers(deleted_at, enabled);
