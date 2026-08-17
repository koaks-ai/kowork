import { z } from 'zod'

export const permissionModeSchema = z.enum(['ask', 'auto', 'yolo'])
export type PermissionMode = z.infer<typeof permissionModeSchema>

export const providerKindSchema = z.enum(['openai', 'anthropic', 'qwen', 'custom'])
export type ProviderKind = z.infer<typeof providerKindSchema>

export const providerProtocolSchema = z.enum([
  'openai-chat',
  'openai-responses',
  'anthropic',
  'qwen'
])
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>

export const providerCatalogOptionSchema = z.enum([
  'openai',
  'anthropic',
  'qwen',
  'openai-compatible',
  'anthropic-compatible'
])
export type ProviderCatalogOption = z.infer<typeof providerCatalogOptionSchema>

export const PROVIDER_CATALOG_OPTIONS = [
  'openai',
  'anthropic',
  'qwen',
  'openai-compatible',
  'anthropic-compatible'
] as const satisfies readonly ProviderCatalogOption[]

export const BUILTIN_PROVIDER_IDS = [
  'provider-openai-chat',
  'provider-anthropic',
  'provider-qwen'
] as const
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number]

export const DEFAULT_MODEL_PROFILE_ID = 'openai-gpt-4.1-mini'

export const protocolsByKind: Record<ProviderKind, readonly ProviderProtocol[]> = {
  openai: ['openai-chat', 'openai-responses'],
  anthropic: ['anthropic'],
  qwen: ['qwen'],
  custom: ['openai-chat', 'anthropic']
}

export const builtinProviders = [
  {
    id: 'provider-openai-chat',
    kind: 'openai',
    name: 'OpenAI',
    protocol: 'openai-chat',
    baseUrl: 'https://api.openai.com',
    defaultContextWindowTokens: 1_000_000
  },
  {
    id: 'provider-anthropic',
    kind: 'anthropic',
    name: 'Anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultContextWindowTokens: 200_000
  },
  {
    id: 'provider-qwen',
    kind: 'qwen',
    name: 'Qwen',
    protocol: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultContextWindowTokens: 131_072
  }
] as const satisfies readonly {
  id: BuiltinProviderId
  kind: ProviderKind
  name: string
  protocol: ProviderProtocol
  baseUrl: string
  defaultContextWindowTokens: number
}[]

export const providerCatalogDefaults: Record<
  ProviderCatalogOption,
  {
    kind: ProviderKind
    protocol: ProviderProtocol
    baseUrl: string
    defaultContextWindowTokens: number
  }
> = {
  openai: {
    kind: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.openai.com',
    defaultContextWindowTokens: 1_000_000
  },
  anthropic: {
    kind: 'anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultContextWindowTokens: 200_000
  },
  qwen: {
    kind: 'qwen',
    protocol: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultContextWindowTokens: 131_072
  },
  'openai-compatible': {
    kind: 'custom',
    protocol: 'openai-chat',
    baseUrl: 'http://127.0.0.1:8000',
    defaultContextWindowTokens: 128_000
  },
  'anthropic-compatible': {
    kind: 'custom',
    protocol: 'anthropic',
    baseUrl: 'http://127.0.0.1:8000',
    defaultContextWindowTokens: 200_000
  }
}

export function isBuiltinProviderId(id: string): id is BuiltinProviderId {
  return (BUILTIN_PROVIDER_IDS as readonly string[]).includes(id)
}

export function builtinProviderName(id: string): string | undefined {
  return builtinProviders.find((provider) => provider.id === id)?.name
}

export function catalogOptionFromProvider(
  kind: ProviderKind,
  protocol: ProviderProtocol
): ProviderCatalogOption {
  if (kind === 'custom') {
    return protocol === 'anthropic' ? 'anthropic-compatible' : 'openai-compatible'
  }
  return kind
}

export function compareProviders<T extends { id: string; name: string }>(left: T, right: T): number {
  const leftBuiltin = BUILTIN_PROVIDER_IDS.indexOf(left.id as BuiltinProviderId)
  const rightBuiltin = BUILTIN_PROVIDER_IDS.indexOf(right.id as BuiltinProviderId)
  if (leftBuiltin !== -1 && rightBuiltin !== -1) return leftBuiltin - rightBuiltin
  if (leftBuiltin !== -1) return -1
  if (rightBuiltin !== -1) return 1
  return left.name.localeCompare(right.name)
}

export const modelSourceSchema = z.enum(['builtin', 'remote', 'manual'])
export type ModelSource = z.infer<typeof modelSourceSchema>

export const providerSchema = z.object({
  id: z.string(),
  name: z.string(),
  kind: providerKindSchema,
  protocol: providerProtocolSchema,
  baseUrl: z.string(),
  credentialConfigured: z.boolean(),
  enabled: z.boolean(),
  available: z.boolean(),
  builtin: z.boolean(),
  defaultContextWindowTokens: z.number().int().positive(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type ProviderDto = z.infer<typeof providerSchema>

const providerConfigurationFields = {
  name: z.string().trim().min(1).max(80),
  kind: providerKindSchema,
  protocol: providerProtocolSchema,
  baseUrl: z.string().trim().url(),
  defaultContextWindowTokens: z.number().int().positive().max(10_000_000)
} as const

export const providerCreateRequestSchema = z.object({
  ...providerConfigurationFields,
  apiKey: z.string().trim().min(1).optional()
})
export type ProviderCreateRequest = z.infer<typeof providerCreateRequestSchema>

export const providerUpdateRequestSchema = z.object({
  providerId: z.string(),
  name: providerConfigurationFields.name.optional(),
  kind: providerKindSchema.optional(),
  protocol: providerProtocolSchema.optional(),
  baseUrl: providerConfigurationFields.baseUrl.optional(),
  defaultContextWindowTokens: providerConfigurationFields.defaultContextWindowTokens.optional(),
  enabled: z.boolean().optional(),
  apiKey: z.string().trim().min(1).nullable().optional()
})
export type ProviderUpdateRequest = z.infer<typeof providerUpdateRequestSchema>

export const projectSchema = z.object({
  id: z.string(),
  name: z.string(),
  rootPath: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable()
})
export type ProjectDto = z.infer<typeof projectSchema>

export const threadSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  title: z.string(),
  modelProfileId: z.string(),
  permissionMode: permissionModeSchema,
  contextWindowTokens: z.number().int().positive().nullable(),
  queuePaused: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  deletedAt: z.number().nullable()
})
export type ThreadDto = z.infer<typeof threadSchema>

export const modelProfileSchema = z.object({
  id: z.string(),
  providerId: z.string(),
  name: z.string(),
  model: z.string(),
  contextWindowTokens: z.number().int().positive(),
  source: modelSourceSchema,
  enabled: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
  available: z.boolean()
})
export type ModelProfileDto = z.infer<typeof modelProfileSchema>

export const modelRefreshResultSchema = z.object({
  providerId: z.string(),
  discovered: z.number().int().nonnegative(),
  models: z.array(modelProfileSchema)
})
export type ModelRefreshResultDto = z.infer<typeof modelRefreshResultSchema>

export const appSettingsSchema = z.object({
  defaultModelProfileId: z.string().nullable(),
  defaultPermissionMode: permissionModeSchema
})
export type AppSettingsDto = z.infer<typeof appSettingsSchema>

export const queuedRequestSchema = z.object({
  id: z.string(),
  threadId: z.string(),
  input: z.string(),
  status: z.enum(['queued', 'running', 'completed', 'failed', 'cancelled', 'interrupted']),
  modelProfileId: z.string(),
  contextWindowTokens: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  createdAt: z.number(),
  updatedAt: z.number()
})
export type QueuedRequestDto = z.infer<typeof queuedRequestSchema>

export const runSchema = z.object({
  id: z.string(),
  requestId: z.string(),
  threadId: z.string(),
  status: z.enum([
    'starting',
    'running',
    'waiting',
    'completed',
    'failed',
    'cancelled',
    'interrupted'
  ]),
  modelProfileId: z.string(),
  startedAt: z.number(),
  finishedAt: z.number().nullable(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  error: z.string().nullable()
})
export type RunDto = z.infer<typeof runSchema>

export const runEventTypeSchema = z.enum([
  'request.queued',
  'run.started',
  'run.waiting',
  'run.text',
  'run.reasoning',
  'run.tool-call',
  'run.tool-output',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'run.interrupted',
  'queue.paused',
  'queue.resumed',
  'approval.requested',
  'approval.resolved',
  'thread.updated',
  'memory.compressed',
  'core.recovered'
])
export type RunEventType = z.infer<typeof runEventTypeSchema>

export const runEventSchema = z.object({
  sequence: z.number().int().nonnegative(),
  id: z.string(),
  projectId: z.string().nullable(),
  threadId: z.string().nullable(),
  runId: z.string().nullable(),
  type: runEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  createdAt: z.number()
})
export type RunEventDto = z.infer<typeof runEventSchema>

export const approvalSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  threadId: z.string(),
  runId: z.string(),
  kind: z.enum(['file_write', 'shell', 'external_path']),
  title: z.string(),
  detail: z.string(),
  status: z.enum(['pending', 'allowed', 'denied']),
  requestedPath: z.string().nullable(),
  requestedAccess: z.enum(['read', 'write']).nullable(),
  createdAt: z.number(),
  resolvedAt: z.number().nullable()
})
export type ApprovalDto = z.infer<typeof approvalSchema>

export const fileEntrySchema = z.object({
  name: z.string(),
  relativePath: z.string(),
  kind: z.enum(['file', 'directory']),
  size: z.number().int().nonnegative(),
  modifiedAt: z.number()
})
export type FileEntryDto = z.infer<typeof fileEntrySchema>

export const fileContentSchema = z.object({
  relativePath: z.string(),
  content: z.string(),
  size: z.number().int().nonnegative(),
  modifiedAt: z.number()
})
export type FileContentDto = z.infer<typeof fileContentSchema>

export const gitChangeSchema = z.object({
  path: z.string(),
  indexStatus: z.string(),
  worktreeStatus: z.string()
})
export type GitChangeDto = z.infer<typeof gitChangeSchema>

export const gitSummarySchema = z.object({
  branch: z.string().nullable(),
  additions: z.number().int().nonnegative(),
  deletions: z.number().int().nonnegative()
})
export type GitSummaryDto = z.infer<typeof gitSummarySchema>

export const gitDiffSchema = z.object({
  path: z.string().nullable(),
  diff: z.string()
})
export type GitDiffDto = z.infer<typeof gitDiffSchema>

export const appBootstrapSchema = z.object({
  projects: z.array(projectSchema),
  providers: z.array(providerSchema),
  modelProfiles: z.array(modelProfileSchema),
  settings: appSettingsSchema,
  activeRuns: z.array(runSchema),
  pendingApprovals: z.array(approvalSchema),
  lastEventSequence: z.number().int().nonnegative()
})
export type AppBootstrapDto = z.infer<typeof appBootstrapSchema>
