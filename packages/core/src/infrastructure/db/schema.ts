import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

export const projects = sqliteTable('projects', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  rootPath: text('root_path').notNull().unique(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at')
})

export const providers = sqliteTable('providers', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  kind: text('kind').notNull(),
  protocol: text('protocol').notNull(),
  baseUrl: text('base_url').notNull(),
  credentialId: text('credential_id'),
  defaultContextWindowTokens: integer('default_context_window_tokens').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at')
})

export const modelProfiles = sqliteTable('model_profiles', {
  id: text('id').primaryKey(),
  providerId: text('provider_id').notNull(),
  name: text('name').notNull(),
  model: text('model').notNull(),
  contextWindowTokens: integer('context_window_tokens').notNull(),
  source: text('source').notNull(),
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const threads = sqliteTable('threads', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  title: text('title').notNull(),
  modelProfileId: text('model_profile_id').notNull(),
  permissionMode: text('permission_mode').notNull(),
  contextWindowTokens: integer('context_window_tokens'),
  queuePaused: integer('queue_paused', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at')
})

export const turnRequests = sqliteTable('turn_requests', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  input: text('input').notNull(),
  status: text('status').notNull(),
  modelProfileId: text('model_profile_id').notNull(),
  contextWindowTokens: integer('context_window_tokens').notNull(),
  position: integer('position').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull()
})

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey(),
  requestId: text('request_id').notNull(),
  threadId: text('thread_id').notNull(),
  status: text('status').notNull(),
  modelProfileId: text('model_profile_id').notNull(),
  startedAt: integer('started_at').notNull(),
  finishedAt: integer('finished_at'),
  promptTokens: integer('prompt_tokens').notNull().default(0),
  completionTokens: integer('completion_tokens').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  error: text('error')
})

export const runEvents = sqliteTable('run_events', {
  sequence: integer('sequence').primaryKey({ autoIncrement: true }),
  id: text('id').notNull().unique(),
  projectId: text('project_id'),
  threadId: text('thread_id'),
  runId: text('run_id'),
  type: text('type').notNull(),
  payloadJson: text('payload_json').notNull(),
  createdAt: integer('created_at').notNull()
})

export const approvals = sqliteTable('approvals', {
  id: text('id').primaryKey(),
  projectId: text('project_id').notNull(),
  threadId: text('thread_id').notNull(),
  runId: text('run_id').notNull(),
  kind: text('kind').notNull(),
  title: text('title').notNull(),
  detail: text('detail').notNull(),
  status: text('status').notNull(),
  requestedPath: text('requested_path'),
  requestedAccess: text('requested_access'),
  createdAt: integer('created_at').notNull(),
  resolvedAt: integer('resolved_at')
})

export const pathGrants = sqliteTable('path_grants', {
  id: text('id').primaryKey(),
  runId: text('run_id').notNull(),
  rootPath: text('root_path').notNull(),
  accessMode: text('access_mode').notNull().default('read'),
  isDirectory: integer('is_directory', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at').notNull()
})

export const conversationTurns = sqliteTable('conversation_turns', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  ordinal: integer('ordinal').notNull(),
  statusJson: text('status_json').notNull(),
  itemsJson: text('items_json').notNull(),
  checkpointJson: text('checkpoint_json'),
  usageJson: text('usage_json').notNull(),
  createdAt: integer('created_at').notNull()
})

export const compressionCheckpoints = sqliteTable('compression_checkpoints', {
  id: text('id').primaryKey(),
  threadId: text('thread_id').notNull(),
  modelProfileId: text('model_profile_id').notNull(),
  summary: text('summary').notNull(),
  coveredThroughOrdinal: integer('covered_through_ordinal').notNull(),
  estimatedTokens: integer('estimated_tokens').notNull(),
  createdAt: integer('created_at').notNull()
})

export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  valueJson: text('value_json').notNull(),
  updatedAt: integer('updated_at').notNull()
})
