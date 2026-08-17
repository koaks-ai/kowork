-- Development-stage reset: drop extra seeded providers instead of converting them.
UPDATE threads
SET model_profile_id = 'openai-gpt-4.1-mini'
WHERE model_profile_id IN (
  SELECT id FROM model_profiles
  WHERE provider_id NOT IN ('provider-openai-chat', 'provider-anthropic', 'provider-qwen')
);
UPDATE turn_requests
SET model_profile_id = 'openai-gpt-4.1-mini'
WHERE model_profile_id IN (
  SELECT id FROM model_profiles
  WHERE provider_id NOT IN ('provider-openai-chat', 'provider-anthropic', 'provider-qwen')
);
UPDATE runs
SET model_profile_id = 'openai-gpt-4.1-mini'
WHERE model_profile_id IN (
  SELECT id FROM model_profiles
  WHERE provider_id NOT IN ('provider-openai-chat', 'provider-anthropic', 'provider-qwen')
);
UPDATE compression_checkpoints
SET model_profile_id = 'openai-gpt-4.1-mini'
WHERE model_profile_id IN (
  SELECT id FROM model_profiles
  WHERE provider_id NOT IN ('provider-openai-chat', 'provider-anthropic', 'provider-qwen')
);
UPDATE app_settings
SET value_json = '"openai-gpt-4.1-mini"', updated_at = unixepoch() * 1000
WHERE key = 'defaultModelProfileId'
  AND value_json NOT IN ('null', '"openai-gpt-4.1-mini"', '"anthropic-sonnet"', '"qwen-plus"');

DELETE FROM model_profiles
WHERE provider_id NOT IN ('provider-openai-chat', 'provider-anthropic', 'provider-qwen');
DELETE FROM providers
WHERE id NOT IN ('provider-openai-chat', 'provider-anthropic', 'provider-qwen');

UPDATE providers SET name = 'OpenAI', updated_at = unixepoch() * 1000
WHERE id = 'provider-openai-chat';
