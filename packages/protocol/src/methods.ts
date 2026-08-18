import { z } from 'zod'
import { approvalDecisionSchema, approvalSchema } from './domain/approval'
import {
  browseResultSchema,
  fileContentSchema,
  fileEntrySchema,
  fileUploadResultSchema,
  gitChangeSchema,
  gitDiffSchema,
  gitSummarySchema
} from './domain/workspace'
import { pluginSchema } from './domain/plugin'
import { projectSchema } from './domain/project'
import {
  modelProfileSchema,
  modelRefreshResultSchema,
  providerCreateSchema,
  providerSchema,
  providerSetCredentialSchema,
  providerUpdateSchema
} from './domain/provider'
import { queuedRequestSchema, runSchema } from './domain/run'
import { bootstrapSchema, serverInfoSchema, type ServerCapability } from './domain/server'
import { serverSettingsReplaceSchema, serverSettingsSchema } from './domain/settings'
import { contextWindowOverrideSchema, permissionModeSchema, threadSchema } from './domain/thread'
import { eventSchema } from './events'
import { idSchema, sequenceSchema } from './primitives'

const empty = z.object({})

/** `events.list` 单页上限。server 必须把超出的 `limit` 截到这个值。 */
export const EVENTS_PAGE_MAX = 2_000

export interface MethodSpec {
  input: z.ZodTypeAny
  output: z.ZodTypeAny
  /**
   * `undefined` 表示这是核心方法，任何 KAP v1 server 都必须实现。
   * 有值表示该方法由能力位门控，客户端必须先检查 `serverInfo.capabilities` 再暴露入口，
   * server 未实现时应回 `method_not_implemented`。
   */
  capability?: ServerCapability
  /** 是否改变 server 状态。用于客户端的乐观更新策略与后续的审计日志。 */
  mutating: boolean
}

/**
 * KAP v1 方法表。
 *
 * 相对旧 `rpcSchemas` 的变化：
 * - 新增 `server.info`（核心）、`fs.browse` / `files.upload` / `plugins.*` / `auth.rotateKey`（能力位门控）
 * - `providers.create` / `providers.update` 现在承载 `apiKey`。旧架构刻意让密钥绕开 Core RPC
 *   走独立 Electron 通道；现在 Agent 在 server 上跑，密钥必须上行到 server。
 * - `projects.add` 的 `rootPath` 是 server 侧路径，配合 `fs.browse` 使用
 * - `settings.*` 只承载 ServerSettings，主题等设备级偏好不进协议
 */
export const methodSpecs = {
  // —— 服务器自述 ——
  'server.info': { input: empty, output: serverInfoSchema, mutating: false },

  'auth.rotateKey': {
    input: empty,
    output: z.object({ token: z.string().min(1) }),
    capability: 'auth.rotateKey',
    mutating: true
  },

  // —— 启动快照 ——
  'app.bootstrap': { input: empty, output: bootstrapSchema, mutating: false },

  // —— 项目 ——
  'projects.list': {
    input: z.object({ includeDeleted: z.boolean().optional() }),
    output: z.array(projectSchema),
    mutating: false
  },
  'projects.add': {
    input: z.object({ rootPath: z.string().min(1) }),
    output: projectSchema,
    mutating: true
  },
  'projects.archive': {
    input: z.object({ projectId: idSchema }),
    output: projectSchema,
    mutating: true
  },
  'projects.restore': {
    input: z.object({ projectId: idSchema }),
    output: projectSchema,
    mutating: true
  },

  // —— 会话 ——
  'threads.list': {
    input: z.object({ projectId: idSchema, includeDeleted: z.boolean().optional() }),
    output: z.array(threadSchema),
    mutating: false
  },
  'threads.create': {
    input: z.object({ projectId: idSchema, title: z.string().optional() }),
    output: threadSchema,
    mutating: true
  },
  'threads.update': {
    input: z.object({
      threadId: idSchema,
      title: z.string().min(1).optional(),
      modelProfileId: idSchema.optional(),
      permissionMode: permissionModeSchema.optional(),
      contextWindowOverride: contextWindowOverrideSchema.optional()
    }),
    output: threadSchema,
    mutating: true
  },
  'threads.archive': {
    input: z.object({ threadId: idSchema }),
    output: threadSchema,
    mutating: true
  },
  'threads.restore': {
    input: z.object({ threadId: idSchema }),
    output: threadSchema,
    mutating: true
  },

  // —— 运行与队列 ——
  'runs.enqueue': {
    input: z.object({ threadId: idSchema, input: z.string().trim().min(1) }),
    output: queuedRequestSchema,
    mutating: true
  },
  'runs.cancel': { input: z.object({ runId: idSchema }), output: runSchema, mutating: true },
  'runs.resumeQueue': {
    input: z.object({ threadId: idSchema }),
    output: threadSchema,
    mutating: true
  },
  'runs.removeQueued': {
    input: z.object({ requestId: idSchema }),
    output: queuedRequestSchema,
    mutating: true
  },
  'runs.list': {
    input: z.object({ threadId: idSchema }),
    output: z.array(runSchema),
    mutating: false
  },
  'runs.queue': {
    input: z.object({ threadId: idSchema }),
    output: z.array(queuedRequestSchema),
    mutating: false
  },

  // —— 事件历史 ——
  'events.list': {
    input: z.object({
      threadId: idSchema.optional(),
      afterSequence: sequenceSchema.optional(),
      limit: z.number().int().positive().max(EVENTS_PAGE_MAX).optional()
    }),
    output: z.object({
      events: z.array(eventSchema),
      /** 还有更多历史时为 `true`，客户端应带上最后一条的 `sequence` 继续拉取。 */
      hasMore: z.boolean()
    }),
    mutating: false
  },

  // —— 审批 ——
  'approvals.list': {
    input: z.object({ threadId: idSchema.optional(), pendingOnly: z.boolean().optional() }),
    output: z.array(approvalSchema),
    mutating: false
  },
  'approvals.respond': {
    input: z.object({ approvalId: idSchema, decision: approvalDecisionSchema }),
    output: approvalSchema,
    mutating: true
  },

  // —— 供应商与模型 ——
  'providers.list': { input: empty, output: z.array(providerSchema), mutating: false },
  'providers.create': { input: providerCreateSchema, output: providerSchema, mutating: true },
  'providers.update': { input: providerUpdateSchema, output: providerSchema, mutating: true },
  'providers.setCredential': {
    input: providerSetCredentialSchema,
    output: providerSchema,
    mutating: true
  },
  'providers.archive': {
    input: z.object({ providerId: idSchema }),
    output: providerSchema,
    mutating: true
  },
  'providers.refreshModels': {
    input: z.object({ providerId: idSchema }),
    output: modelRefreshResultSchema,
    mutating: true
  },
  'models.add': {
    input: z.object({
      providerId: idSchema,
      model: z.string().trim().min(1),
      name: z.string().trim().min(1).optional(),
      contextWindowTokens: z.number().int().positive()
    }),
    output: modelProfileSchema,
    mutating: true
  },
  'models.archive': {
    input: z.object({ modelProfileId: idSchema }),
    output: modelProfileSchema,
    mutating: true
  },

  // —— 设置（仅 ServerSettings，整体替换语义） ——
  'settings.get': { input: empty, output: serverSettingsSchema, mutating: false },
  'settings.replace': {
    input: serverSettingsReplaceSchema,
    output: serverSettingsSchema,
    mutating: true
  },

  // —— 工作区 ——
  'files.list': {
    input: z.object({ projectId: idSchema, relativePath: z.string().optional() }),
    output: z.array(fileEntrySchema),
    mutating: false
  },
  'files.read': {
    input: z.object({ projectId: idSchema, relativePath: z.string() }),
    output: fileContentSchema,
    mutating: false
  },
  'files.upload': {
    input: z.object({
      projectId: idSchema,
      relativePath: z.string().min(1),
      contentBase64: z.string(),
      overwrite: z.boolean().optional()
    }),
    output: fileUploadResultSchema,
    capability: 'files.upload',
    mutating: true
  },
  'fs.browse': {
    input: z.object({
      /** 不传表示从默认起点开始（用户主目录 / 盘符列表）。 */
      path: z.string().optional(),
      includeFiles: z.boolean().optional()
    }),
    output: browseResultSchema,
    capability: 'fs.browse',
    mutating: false
  },

  // —— Git（只读） ——
  'git.status': {
    input: z.object({ projectId: idSchema }),
    output: z.array(gitChangeSchema),
    mutating: false
  },
  'git.summary': {
    input: z.object({ projectId: idSchema }),
    output: gitSummarySchema,
    mutating: false
  },
  'git.diff': {
    input: z.object({ projectId: idSchema, relativePath: z.string().optional() }),
    output: gitDiffSchema,
    mutating: false
  },

  // —— 插件（阶段 5） ——
  'plugins.list': {
    input: empty,
    output: z.array(pluginSchema),
    capability: 'plugins',
    mutating: false
  },
  'plugins.install': {
    input: z.object({ sourcePath: z.string().min(1) }),
    output: pluginSchema,
    capability: 'plugins',
    mutating: true
  },
  'plugins.uninstall': {
    input: z.object({ pluginId: z.string() }),
    output: empty,
    capability: 'plugins',
    mutating: true
  },
  'plugins.setEnabled': {
    input: z.object({ pluginId: z.string(), enabled: z.boolean() }),
    output: pluginSchema,
    capability: 'plugins',
    mutating: true
  },
  'plugins.reload': {
    input: z.object({ pluginId: z.string().optional() }),
    output: z.array(pluginSchema),
    capability: 'plugins',
    mutating: true
  }
} as const satisfies Record<string, MethodSpec>

export type MethodName = keyof typeof methodSpecs
export type MethodInput<M extends MethodName> = z.infer<(typeof methodSpecs)[M]['input']>
export type MethodOutput<M extends MethodName> = z.infer<(typeof methodSpecs)[M]['output']>

export const METHOD_NAMES = Object.keys(methodSpecs) as MethodName[]

export function isMethodName(value: string): value is MethodName {
  return Object.prototype.hasOwnProperty.call(methodSpecs, value)
}

/**
 * `methodSpecs` 用 `as const` 保留了字面量类型，核心方法的条目里根本没有 `capability` 这个键，
 * 所以不能直接在联合类型上读它。这个访问器把条目收敛回 `MethodSpec` 再读。
 */
export function methodSpec(method: MethodName): MethodSpec {
  return methodSpecs[method]
}

/** 该方法所需的能力位；核心方法返回 `undefined`。 */
export function methodCapability(method: MethodName): ServerCapability | undefined {
  return methodSpec(method).capability
}

/** 客户端在暴露入口前的功能探测。 */
export function isMethodAvailable(
  method: MethodName,
  capabilities: readonly ServerCapability[]
): boolean {
  const required = methodCapability(method)
  return required === undefined || capabilities.includes(required)
}

export function parseMethodInput<M extends MethodName>(method: M, value: unknown): MethodInput<M> {
  return methodSpecs[method].input.parse(value) as MethodInput<M>
}

export function parseMethodOutput<M extends MethodName>(
  method: M,
  value: unknown
): MethodOutput<M> {
  return methodSpecs[method].output.parse(value) as MethodOutput<M>
}
