export interface Migration {
  id: number
  name: string
  sql: string
  disableForeignKeys?: boolean
}

export const migrations: Migration[] = [
  {
    id: 1,
    name: 'initial',
    sql: `
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, root_path TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      );
      CREATE TABLE IF NOT EXISTS model_profiles (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, provider_type TEXT NOT NULL,
        model TEXT NOT NULL, base_url TEXT, api_key_env TEXT,
        context_window_tokens INTEGER NOT NULL
      );
      CREATE TABLE IF NOT EXISTS threads (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL REFERENCES projects(id),
        title TEXT NOT NULL, model_profile_id TEXT NOT NULL REFERENCES model_profiles(id),
        permission_mode TEXT NOT NULL, context_window_tokens INTEGER,
        queue_paused INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS threads_project_idx ON threads(project_id, deleted_at);
      CREATE TABLE IF NOT EXISTS turn_requests (
        id TEXT PRIMARY KEY, thread_id TEXT NOT NULL REFERENCES threads(id), input TEXT NOT NULL,
        status TEXT NOT NULL, model_profile_id TEXT NOT NULL, permission_mode TEXT NOT NULL,
        context_window_tokens INTEGER NOT NULL, position INTEGER NOT NULL,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS turn_requests_thread_idx ON turn_requests(thread_id, status, position);
      CREATE TABLE IF NOT EXISTS runs (
        id TEXT PRIMARY KEY, request_id TEXT NOT NULL REFERENCES turn_requests(id),
        thread_id TEXT NOT NULL REFERENCES threads(id), status TEXT NOT NULL,
        model_profile_id TEXT NOT NULL, started_at INTEGER NOT NULL, finished_at INTEGER,
        prompt_tokens INTEGER NOT NULL DEFAULT 0, completion_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0, error TEXT
      );
      CREATE INDEX IF NOT EXISTS runs_thread_idx ON runs(thread_id, started_at);
      CREATE TABLE IF NOT EXISTS run_events (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT NOT NULL UNIQUE,
        project_id TEXT, thread_id TEXT, run_id TEXT, type TEXT NOT NULL,
        payload_json TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS run_events_thread_idx ON run_events(thread_id, sequence);
      CREATE TABLE IF NOT EXISTS approvals (
        id TEXT PRIMARY KEY, project_id TEXT NOT NULL, thread_id TEXT NOT NULL,
        run_id TEXT NOT NULL, kind TEXT NOT NULL, title TEXT NOT NULL, detail TEXT NOT NULL,
        status TEXT NOT NULL, requested_path TEXT, created_at INTEGER NOT NULL, resolved_at INTEGER
      );
      CREATE INDEX IF NOT EXISTS approvals_pending_idx ON approvals(status, created_at);
      CREATE TABLE IF NOT EXISTS path_grants (
        id TEXT PRIMARY KEY, run_id TEXT NOT NULL, root_path TEXT NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS path_grants_run_idx ON path_grants(run_id);
      CREATE TABLE IF NOT EXISTS conversation_turns (
        id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, ordinal INTEGER NOT NULL,
        status_json TEXT NOT NULL, items_json TEXT NOT NULL, checkpoint_json TEXT,
        usage_json TEXT NOT NULL, created_at INTEGER NOT NULL,
        UNIQUE(thread_id, ordinal)
      );
      CREATE INDEX IF NOT EXISTS conversation_turns_thread_idx ON conversation_turns(thread_id, ordinal);
      CREATE TABLE IF NOT EXISTS compression_checkpoints (
        id TEXT PRIMARY KEY, thread_id TEXT NOT NULL, model_profile_id TEXT NOT NULL,
        summary TEXT NOT NULL, covered_through_ordinal INTEGER NOT NULL,
        estimated_tokens INTEGER NOT NULL, created_at INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS compression_thread_idx ON compression_checkpoints(thread_id, created_at);
      CREATE TABLE IF NOT EXISTS app_settings (
        key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL
      );
    `
  },
  {
    id: 2,
    name: 'provider_credentials_and_models',
    disableForeignKeys: true,
    sql: `
      CREATE TABLE providers (
        id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL, protocol TEXT NOT NULL,
        base_url TEXT NOT NULL, credential_id TEXT,
        default_context_window_tokens INTEGER NOT NULL,
        enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, deleted_at INTEGER
      );

      INSERT INTO providers (
        id, name, kind, protocol, base_url, credential_id,
        default_context_window_tokens, enabled, created_at, updated_at, deleted_at
      ) VALUES
        ('provider-deepseek', 'DeepSeek', 'deepseek', 'openai-chat', 'https://api.deepseek.com', NULL, 128000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
        ('provider-openai-chat', 'OpenAI Chat Completions', 'openai', 'openai-chat', 'https://api.openai.com', NULL, 1000000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
        ('provider-openai-responses', 'OpenAI Responses', 'openai', 'openai-responses', 'https://api.openai.com', NULL, 1000000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
        ('provider-anthropic', 'Anthropic', 'anthropic', 'anthropic', 'https://api.anthropic.com', NULL, 200000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
        ('provider-qwen', 'Qwen', 'qwen', 'qwen', 'https://dashscope.aliyuncs.com/compatible-mode', NULL, 131072, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
        ('provider-ollama', 'Ollama', 'ollama', 'ollama', 'http://127.0.0.1:11434', NULL, 32768, 1, unixepoch() * 1000, unixepoch() * 1000, NULL),
        ('provider-custom-openai', 'OpenAI Compatible', 'custom', 'openai-chat', 'http://127.0.0.1:8000', NULL, 128000, 1, unixepoch() * 1000, unixepoch() * 1000, NULL);

      CREATE TABLE model_profiles_v2 (
        id TEXT PRIMARY KEY, provider_id TEXT NOT NULL REFERENCES providers(id),
        name TEXT NOT NULL, model TEXT NOT NULL, context_window_tokens INTEGER NOT NULL,
        source TEXT NOT NULL, enabled INTEGER NOT NULL DEFAULT 1,
        created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL,
        UNIQUE(provider_id, model)
      );

      INSERT INTO model_profiles_v2 (
        id, provider_id, name, model, context_window_tokens, source, enabled, created_at, updated_at
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
        name, model, context_window_tokens, 'builtin', 1, unixepoch() * 1000, unixepoch() * 1000
      FROM model_profiles;

      INSERT OR IGNORE INTO model_profiles_v2 (
        id, provider_id, name, model, context_window_tokens, source, enabled, created_at, updated_at
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
    `
  },
  {
    id: 3,
    name: 'live_permissions_and_scoped_path_grants',
    sql: `
      ALTER TABLE turn_requests DROP COLUMN permission_mode;
      ALTER TABLE approvals ADD COLUMN requested_access TEXT;
      ALTER TABLE path_grants ADD COLUMN access_mode TEXT NOT NULL DEFAULT 'read';
      ALTER TABLE path_grants ADD COLUMN is_directory INTEGER NOT NULL DEFAULT 0;
      UPDATE path_grants SET is_directory = 1;
    `
  }
]
