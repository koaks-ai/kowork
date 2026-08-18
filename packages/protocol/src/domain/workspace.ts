import { z } from 'zod'
import { epochMillisSchema, idSchema } from '../primitives'

/**
 * 工作区读写。
 *
 * 所有 `relativePath` 都相对项目根，并且由 server 负责规范化：先 canonicalize，再校验 symlink
 * 解析后的真实路径仍在项目内。客户端传什么路径都不能突破这层校验。
 */

export const fileKindSchema = z.enum(['file', 'directory'])
export type FileKind = z.infer<typeof fileKindSchema>

export const fileEntrySchema = z.object({
  name: z.string(),
  relativePath: z.string(),
  kind: fileKindSchema,
  size: z.number().int().nonnegative(),
  modifiedAt: epochMillisSchema
})
export type FileEntryDto = z.infer<typeof fileEntrySchema>

export const fileContentSchema = z.object({
  relativePath: z.string(),
  content: z.string(),
  size: z.number().int().nonnegative(),
  modifiedAt: epochMillisSchema,
  /** 内容被截断时为 `true`，客户端应提示用户这不是完整文件。 */
  truncated: z.boolean()
})
export type FileContentDto = z.infer<typeof fileContentSchema>

// —— fs.browse（阶段 4 需要，阶段 0 先定义） ——

/**
 * 服务端目录浏览。
 *
 * 存在的唯一原因：远程模式下工作目录在服务器上，**不能**再用 Electron 的原生目录选择对话框
 * 来选项目根。客户端必须用这个 RPC 渲染一个自己的目录选择器。本地模式为了行为一致也走它。
 */
export const browseEntrySchema = z.object({
  name: z.string(),
  /** server 侧的绝对路径。 */
  path: z.string(),
  kind: fileKindSchema,
  /** 无权限读取时为 `true`，客户端应禁用该项而不是让用户点进去报错。 */
  inaccessible: z.boolean()
})
export type BrowseEntryDto = z.infer<typeof browseEntrySchema>

export const browseResultSchema = z.object({
  /** 当前所在目录的绝对路径。 */
  path: z.string(),
  /** 已在文件系统根时为 `null`。 */
  parentPath: z.string().nullable(),
  entries: z.array(browseEntrySchema),
  /** 可用的起始位置（用户主目录、Windows 盘符等），供客户端渲染快捷入口。 */
  roots: z.array(z.object({ label: z.string(), path: z.string() })),
  /** 该目录是否已是一个 git 仓库，用于在选择器里给出提示。 */
  isGitRepository: z.boolean()
})
export type BrowseResultDto = z.infer<typeof browseResultSchema>

// —— files.upload（阶段 4 需要，阶段 0 先定义） ——

/**
 * 单帧上传上限。超过此值应回 `payload_too_large`。
 *
 * KAP v1 只支持单帧上传，因为 JSON WebSocket 帧承载 base64 的效率有限。分片上传留到需要时
 * 再加新方法，不改这个方法的语义。
 */
export const UPLOAD_MAX_BYTES = 8 * 1024 * 1024

export const fileUploadResultSchema = z.object({
  relativePath: z.string(),
  size: z.number().int().nonnegative(),
  modifiedAt: epochMillisSchema
})
export type FileUploadResultDto = z.infer<typeof fileUploadResultSchema>

// —— git（只读） ——

export const gitChangeSchema = z.object({
  path: z.string(),
  /** git porcelain 的两位状态码，第一位为 index，第二位为 worktree。 */
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
  /** `null` 表示整个工作区的 diff。 */
  path: z.string().nullable(),
  diff: z.string(),
  truncated: z.boolean()
})
export type GitDiffDto = z.infer<typeof gitDiffSchema>

/** 项目标识 + 可选相对路径，多个工作区方法共用。 */
export const projectPathSchema = z.object({
  projectId: idSchema,
  relativePath: z.string().optional()
})
