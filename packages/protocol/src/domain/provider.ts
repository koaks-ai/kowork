import { z } from 'zod'
import { epochMillisSchema, httpUrlSchema, idSchema } from '../primitives'

export const providerKindSchema = z.enum(['openai', 'anthropic', 'qwen', 'custom'])
export type ProviderKind = z.infer<typeof providerKindSchema>

export const providerProtocolSchema = z.enum([
  'openai-chat',
  'openai-responses',
  'anthropic',
  'qwen'
])
export type ProviderProtocol = z.infer<typeof providerProtocolSchema>

export const modelSourceSchema = z.enum(['builtin', 'remote', 'manual'])
export type ModelSource = z.infer<typeof modelSourceSchema>

/**
 * 供应商。
 *
 * `credentialConfigured` 只表示「server 上存了密钥」，密钥本身**永远不会回传**给客户端：
 * 只能覆盖或清除。这与旧实现的语义一致，但存储位置变了 —— 见 `providerWriteSchema`。
 */
export const providerSchema = z.object({
  id: idSchema,
  name: z.string(),
  kind: providerKindSchema,
  protocol: providerProtocolSchema,
  baseUrl: z.string(),
  credentialConfigured: z.boolean(),
  enabled: z.boolean(),
  /** `enabled && credentialConfigured`，由 server 计算，客户端不要自己推导。 */
  available: z.boolean(),
  builtin: z.boolean(),
  defaultContextWindowTokens: z.number().int().positive(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema
})
export type ProviderDto = z.infer<typeof providerSchema>

const providerWritableFields = {
  name: z.string().trim().min(1).max(80),
  kind: providerKindSchema,
  protocol: providerProtocolSchema,
  baseUrl: httpUrlSchema,
  defaultContextWindowTokens: z.number().int().positive().max(10_000_000)
} as const

/**
 * 创建供应商。
 *
 * **安全语义变更（相对旧实现）**：旧架构里 Agent 跑在 Electron 的 core 进程内，API Key 通过
 * 一条独立的 Electron IPC 通道直送 Main 并用 `safeStorage` 加密，刻意绕开 Core RPC。现在
 * Agent 跑在 server 上，必须由 server 调用 LLM，因此密钥只能随 KAP 上行、由 server 加密落盘。
 *
 * 这条链路必须加密：客户端对非 loopback 地址默认强制 `wss://`。参见 docs/deployment。
 */
export const providerCreateSchema = z.object({
  ...providerWritableFields,
  apiKey: z.string().trim().min(1).optional()
})
export type ProviderCreateInput = z.infer<typeof providerCreateSchema>

/**
 * 更新供应商的**非凭据**字段。所有字段都是「缺省即不改」，且都不可为 null，因此没有歧义。
 *
 * 凭据被刻意排除在外，改动走 [providerSetCredentialSchema]。这么切分有两个好处：
 * 一是避免「缺省 / null / 有值」的三态（Kotlin 侧无法把缺省与显式 null 区分开）；
 * 二是凭据改动成为独立可审计的操作，日志里能清楚看到密钥何时被覆盖或清除。
 */
export const providerUpdateSchema = z.object({
  providerId: idSchema,
  name: providerWritableFields.name.optional(),
  kind: providerKindSchema.optional(),
  protocol: providerProtocolSchema.optional(),
  baseUrl: providerWritableFields.baseUrl.optional(),
  defaultContextWindowTokens: providerWritableFields.defaultContextWindowTokens.optional(),
  enabled: z.boolean().optional()
})
export type ProviderUpdateInput = z.infer<typeof providerUpdateSchema>

/** `apiKey` 为 `null` 表示清除 server 上已保存的密钥；给出字符串则整体覆盖。 */
export const providerSetCredentialSchema = z.object({
  providerId: idSchema,
  apiKey: z.string().trim().min(1).nullable()
})
export type ProviderSetCredentialInput = z.infer<typeof providerSetCredentialSchema>

export const modelProfileSchema = z.object({
  id: idSchema,
  providerId: idSchema,
  name: z.string(),
  model: z.string(),
  contextWindowTokens: z.number().int().positive(),
  source: modelSourceSchema,
  enabled: z.boolean(),
  /** `enabled && provider.available`，由 server 计算。 */
  available: z.boolean(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema
})
export type ModelProfileDto = z.infer<typeof modelProfileSchema>

export const modelRefreshResultSchema = z.object({
  providerId: idSchema,
  discovered: z.number().int().nonnegative(),
  models: z.array(modelProfileSchema)
})
export type ModelRefreshResultDto = z.infer<typeof modelRefreshResultSchema>

// ——————————————————————————————————————————————————————————————————————
// 以下是共享常量，不是线协议结构。客户端用它渲染「新增供应商」表单的预置项，
// server 用它初始化内置供应商。放在协议包里是为了避免两侧各写一份而漂移。
// ——————————————————————————————————————————————————————————————————————

export const BUILTIN_PROVIDER_IDS = [
  'provider-openai-chat',
  'provider-anthropic',
  'provider-qwen'
] as const
export type BuiltinProviderId = (typeof BUILTIN_PROVIDER_IDS)[number]

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

export const protocolsByKind: Record<ProviderKind, readonly ProviderProtocol[]> = {
  openai: ['openai-chat', 'openai-responses'],
  anthropic: ['anthropic'],
  qwen: ['qwen'],
  custom: ['openai-chat', 'anthropic']
}

export interface ProviderPreset {
  kind: ProviderKind
  protocol: ProviderProtocol
  baseUrl: string
  defaultContextWindowTokens: number
}

export const builtinProviders = [
  {
    id: 'provider-openai-chat',
    name: 'OpenAI',
    kind: 'openai',
    protocol: 'openai-chat',
    baseUrl: 'https://api.openai.com',
    defaultContextWindowTokens: 1_000_000
  },
  {
    id: 'provider-anthropic',
    name: 'Anthropic',
    kind: 'anthropic',
    protocol: 'anthropic',
    baseUrl: 'https://api.anthropic.com',
    defaultContextWindowTokens: 200_000
  },
  {
    id: 'provider-qwen',
    name: 'Qwen',
    kind: 'qwen',
    protocol: 'qwen',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode',
    defaultContextWindowTokens: 131_072
  }
] as const satisfies readonly (ProviderPreset & { id: BuiltinProviderId; name: string })[]

export const providerCatalogDefaults: Record<ProviderCatalogOption, ProviderPreset> = {
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

/** 内置供应商固定排在前面并保持声明顺序，其余按名称排序。 */
export function compareProviders<T extends { id: string; name: string }>(
  left: T,
  right: T
): number {
  const leftBuiltin = BUILTIN_PROVIDER_IDS.indexOf(left.id as BuiltinProviderId)
  const rightBuiltin = BUILTIN_PROVIDER_IDS.indexOf(right.id as BuiltinProviderId)
  if (leftBuiltin !== -1 && rightBuiltin !== -1) return leftBuiltin - rightBuiltin
  if (leftBuiltin !== -1) return -1
  if (rightBuiltin !== -1) return 1
  return left.name.localeCompare(right.name)
}
