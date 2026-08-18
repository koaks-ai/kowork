import { z } from 'zod'
import { epochMillisSchema, idSchema } from '../primitives'

/**
 * 权限模式。三档语义（由 server 强制，客户端只做展示）：
 *
 * - `ask`  项目内读自动；项目内写每次审批；Shell 每次审批；项目外文件/目录每个 run 审批
 * - `auto` 项目内读写自动；Shell 每次审批；项目外每个 run 审批
 * - `yolo` 项目内读写自动；Shell 自动（含项目外 cwd）；项目外仍每个 run 审批
 *
 * 权限模式**不进入队列快照**：每次工具调用开始时读取会话当前值，因此用户在排队期间改模式
 * 会影响后续的工具调用。
 */
export const permissionModeSchema = z.enum(['ask', 'auto', 'yolo'])
export type PermissionMode = z.infer<typeof permissionModeSchema>

export const threadSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  title: z.string(),
  modelProfileId: idSchema,
  permissionMode: permissionModeSchema,
  /** 覆盖模型 Profile 的上下文窗口；`null` 表示沿用 Profile 的值。 */
  contextWindowTokens: z.number().int().positive().nullable(),
  queuePaused: z.boolean(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema,
  deletedAt: epochMillisSchema.nullable()
})
export type ThreadDto = z.infer<typeof threadSchema>

/** 会话标题变更的来源，用于客户端决定是否播放标题切换动画。 */
export const threadUpdateSourceSchema = z.enum(['first_message', 'user', 'system'])
export type ThreadUpdateSource = z.infer<typeof threadUpdateSourceSchema>

/**
 * 会话上下文窗口的改动意图。
 *
 * `threads.update` 里如果直接用 `contextWindowTokens: number | null | undefined`，就出现了
 * 「缺省 = 不改 / null = 跟随 Profile / 数字 = 覆盖」这样的三态，而 Kotlin 侧无法把「缺省」和
 * 「显式 null」区分开。改成显式的判别联合后，两侧都能自然表达：**整个字段缺省**表示不改，
 * 出现则由 `mode` 明确说明要什么。
 */
export const contextWindowOverrideSchema = z.discriminatedUnion('mode', [
  /** 跟随模型 Profile 的窗口大小。 */
  z.object({ mode: z.literal('inherit') }),
  /** 用指定值覆盖 Profile 的窗口大小。 */
  z.object({ mode: z.literal('override'), tokens: z.number().int().positive() })
])
export type ContextWindowOverride = z.infer<typeof contextWindowOverrideSchema>
