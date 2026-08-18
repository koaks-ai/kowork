import { z } from 'zod'
import { epochMillisSchema, idSchema } from '../primitives'

/**
 * 审批。
 *
 * `kind` 故意保持开放式枚举之外的扩展能力受限：阶段 5 的插件工具复用 `file_write` / `shell` /
 * `external_path` 三种既有语义，不新增 kind，以免客户端要为每个插件写分支。插件工具的差异
 * 通过 `title` / `detail` 表达。
 */
export const approvalKindSchema = z.enum(['file_write', 'shell', 'external_path'])
export type ApprovalKind = z.infer<typeof approvalKindSchema>

export const approvalStatusSchema = z.enum(['pending', 'allowed', 'denied'])
export type ApprovalStatus = z.infer<typeof approvalStatusSchema>

/**
 * 路径授权的访问级别。`write` 隐含 `read`；`read` 不能用于写入。
 * 单文件授权只覆盖该文件；目录授权覆盖其子路径。授权**仅在当前 run 内有效**。
 */
export const pathAccessSchema = z.enum(['read', 'write'])
export type PathAccess = z.infer<typeof pathAccessSchema>

export const approvalDecisionSchema = z.enum(['allow', 'deny'])
export type ApprovalDecision = z.infer<typeof approvalDecisionSchema>

export const approvalSchema = z.object({
  id: idSchema,
  projectId: idSchema,
  threadId: idSchema,
  runId: idSchema,
  kind: approvalKindSchema,
  title: z.string(),
  detail: z.string(),
  status: approvalStatusSchema,
  /** server 侧的绝对路径，仅在 `kind` 为 `file_write` / `external_path` 时有值。 */
  requestedPath: z.string().nullable(),
  requestedAccess: pathAccessSchema.nullable(),
  createdAt: epochMillisSchema,
  resolvedAt: epochMillisSchema.nullable()
})
export type ApprovalDto = z.infer<typeof approvalSchema>
