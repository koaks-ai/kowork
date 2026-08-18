import { z } from 'zod'
import { epochMillisSchema, idSchema } from '../primitives'

/**
 * 插件（阶段 5 实现，阶段 0 先把协议面钉死）。
 *
 * 现在就定义的原因有两个：
 * 1. 阶段 3b 的数据库 schema 需要 `plugins` / `plugin_state` 两张表，表结构要和这里对齐；
 * 2. 阶段 1 的设计系统需要知道 UI 插件会消费哪些 surface，才能把对应的注册表提前建好。
 *
 * 插件是**双侧**的：`ui` 半跑在 renderer（React + 设计系统原语），`agent` 半跑在紧邻
 * agent server 的独立插件宿主进程（Node）。两半都可选，一个插件可以只有其中一半。
 */

/** 插件 API 的大版本。宿主只加载 `apiVersion` 匹配的插件。 */
export const PLUGIN_API_VERSION = 1 as const

/**
 * UI 扩展点。
 *
 * `inspector.card` 是阶段 5 唯一必须实现的：右侧栏的每一张卡片都是插件。其余是预留，
 * 定义在这里以便插件作者提前知道路线，宿主遇到未实现的 surface 应忽略并记录告警。
 */
export const pluginSurfaceTypeSchema = z.enum([
  'inspector.card',
  'sidebar.section',
  'settings.pane',
  'composer.action',
  'statusbar.item'
])
export type PluginSurfaceType = z.infer<typeof pluginSurfaceTypeSchema>

export const pluginSurfaceSchema = z.object({
  type: pluginSurfaceTypeSchema,
  /** 插件内唯一；宿主用 `${pluginId}:${id}` 作为全局键。 */
  id: idSchema,
  title: z.string(),
  /** 越小越靠前，同值按插件安装顺序。 */
  order: z.number().int().optional()
})
export type PluginSurfaceDto = z.infer<typeof pluginSurfaceSchema>

/**
 * Koaks 的四个 hook 点，语义与框架侧一一对应：
 *
 * - `beforeModelRequest` 可改写请求（items / instructions / tools / format），**不能短路**
 * - `afterModelRequest`  包装模型事件流，可变换/丢弃/改写；**禁止 collect**，只能用惰性算子
 * - `beforeToolCall`     可改写调用参数，也**可以 deny 短路**，工具将不被执行
 * - `afterToolCall`      可改写工具结果（如截断输出），不能撤销已执行的工具
 */
export const pluginHookPointSchema = z.enum([
  'beforeModelRequest',
  'afterModelRequest',
  'beforeToolCall',
  'afterToolCall'
])
export type PluginHookPoint = z.infer<typeof pluginHookPointSchema>

/**
 * 插件权限。安装时向用户展示并需显式确认。
 *
 * UI 插件在 renderer 同 realm 执行（不做 iframe/worker 强隔离），因此权限是**告知性**的而非
 * 强制沙箱边界 —— 这是一个明确记录过的取舍，见 docs/decisions/0003。Agent 插件跑在独立进程，
 * 权限对它是可强制的。
 */
export const pluginPermissionSchema = z.enum([
  'read:projects',
  'read:threads',
  'read:runs',
  'read:events',
  'read:approvals',
  'read:git',
  'read:files',
  'write:files',
  'net:fetch',
  'hook:model',
  'hook:tool',
  'tool:register'
])
export type PluginPermission = z.infer<typeof pluginPermissionSchema>

export const pluginManifestSchema = z.object({
  /** 反向域名风格，例如 `com.example.token-usage`。 */
  id: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/),
  name: z.string().trim().min(1).max(80),
  version: z.string().trim().min(1),
  apiVersion: z.number().int().positive(),
  description: z.string().optional(),
  author: z.string().optional(),
  homepage: z.string().optional(),
  ui: z
    .object({
      /** 相对插件根目录的 ESM 入口。 */
      entry: z.string().min(1),
      surfaces: z.array(pluginSurfaceSchema)
    })
    .optional(),
  agent: z
    .object({
      entry: z.string().min(1),
      hooks: z.array(pluginHookPointSchema),
      /** 插件注册的工具名，需满足 `^[a-z][a-z0-9_]*$`，且不得与内置工具冲突。 */
      tools: z.array(z.string().regex(/^[a-z][a-z0-9_]*$/))
    })
    .optional(),
  permissions: z.array(pluginPermissionSchema),
  /** BCP-47 语言标签到文案字典的映射。 */
  locales: z.record(z.string(), z.record(z.string(), z.string())).optional()
})
export type PluginManifestDto = z.infer<typeof pluginManifestSchema>

export const pluginStatusSchema = z.enum(['enabled', 'disabled', 'error'])
export type PluginStatus = z.infer<typeof pluginStatusSchema>

export const pluginSchema = z.object({
  manifest: pluginManifestSchema,
  status: pluginStatusSchema,
  /** 插件在 server 上的安装目录，便于用户排查。 */
  installPath: z.string(),
  /** `status` 为 `error` 时的原因。 */
  loadError: z.string().nullable(),
  /** Agent 半是否已在插件宿主里成功加载。没有 `agent` 半时恒为 `false`。 */
  agentLoaded: z.boolean(),
  installedAt: epochMillisSchema,
  updatedAt: epochMillisSchema
})
export type PluginDto = z.infer<typeof pluginSchema>

/**
 * Agent 缓存失效用的插件世代号。
 *
 * 每次插件启用/禁用/重载都递增。它会进入 Koaks Agent 的缓存 key，但**不会**导致重建 Agent：
 * 转发用的 Hook 与 LazyToolSource 是稳定实例，只是查表结果变了。世代号的作用是让客户端能
 * 判断自己看到的插件视图是否过期。
 */
export const pluginGenerationSchema = z.number().int().nonnegative()
