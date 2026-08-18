import { z } from 'zod'
import { epochMillisSchema, sequenceSchema } from '../primitives'
import { approvalSchema } from './approval'
import { pluginGenerationSchema, pluginSchema } from './plugin'
import { modelProfileSchema, providerSchema } from './provider'
import { projectSchema } from './project'
import { runSchema } from './run'
import { serverSettingsSchema } from './settings'

export const serverOsSchema = z.enum(['linux', 'macos', 'windows'])
export type ServerOs = z.infer<typeof serverOsSchema>

/** `native` 是分发用的 Kotlin/Native 二进制；`jvm` 只用于开发调试。 */
export const serverRuntimeSchema = z.enum(['native', 'jvm'])
export type ServerRuntime = z.infer<typeof serverRuntimeSchema>

/**
 * 能力位。客户端**必须**按能力位做功能降级，不得按 server 版本号推断。
 *
 * 这样做的直接好处：用户的远程 server 落后于客户端时，客户端能自己关掉不支持的入口，
 * 而不是让用户点了才报 `method_not_implemented`。
 */
export const serverCapabilitySchema = z.enum([
  'fs.browse',
  'files.upload',
  'plugins',
  'plugins.agentHost',
  'auth.rotateKey'
])
export type ServerCapability = z.infer<typeof serverCapabilitySchema>

export const serverInfoSchema = z.object({
  /** 协商后实际生效的协议版本。 */
  protocolVersion: z.number().int().positive(),
  /** server 支持的协议区间，便于客户端提示用户该升级哪一侧。 */
  minProtocolVersion: z.number().int().positive(),
  maxProtocolVersion: z.number().int().positive(),
  serverVersion: z.string(),
  runtime: serverRuntimeSchema,
  os: serverOsSchema,
  arch: z.string(),
  capabilities: z.array(serverCapabilitySchema),
  startedAt: epochMillisSchema
})
export type ServerInfoDto = z.infer<typeof serverInfoSchema>

/**
 * 客户端打开后的首帧快照。
 *
 * 相对旧的 `app.bootstrap` 增加了 `server`、`plugins` 与 `pluginGeneration`。`lastEventSequence`
 * 是断线补发的起点游标。
 */
export const bootstrapSchema = z.object({
  server: serverInfoSchema,
  projects: z.array(projectSchema),
  providers: z.array(providerSchema),
  modelProfiles: z.array(modelProfileSchema),
  settings: serverSettingsSchema,
  activeRuns: z.array(runSchema),
  pendingApprovals: z.array(approvalSchema),
  plugins: z.array(pluginSchema),
  pluginGeneration: pluginGenerationSchema,
  lastEventSequence: sequenceSchema
})
export type BootstrapDto = z.infer<typeof bootstrapSchema>
