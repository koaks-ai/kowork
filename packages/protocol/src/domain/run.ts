import { z } from 'zod'
import { epochMillisSchema, idSchema, itemRefSchema } from '../primitives'

/**
 * 排队请求。同一会话内 FIFO 并持久化，不同会话可并发。
 *
 * `modelProfileId` 与 `contextWindowTokens` 在**入队时冻结**：用户排队后改会话模型不会影响
 * 已入队的请求。权限模式相反，不冻结（见 `thread.ts`）。
 */
export const queuedRequestStatusSchema = z.enum([
  'queued',
  'running',
  'completed',
  'failed',
  'cancelled',
  'interrupted'
])
export type QueuedRequestStatus = z.infer<typeof queuedRequestStatusSchema>

export const queuedRequestSchema = z.object({
  id: idSchema,
  threadId: idSchema,
  input: z.string(),
  status: queuedRequestStatusSchema,
  modelProfileId: idSchema,
  contextWindowTokens: z.number().int().positive(),
  position: z.number().int().nonnegative(),
  createdAt: epochMillisSchema,
  updatedAt: epochMillisSchema
})
export type QueuedRequestDto = z.infer<typeof queuedRequestSchema>

/**
 * `interrupted` 表示 server 在该 run 活动期间重启过。恢复时**不会**自动重放可能产生副作用的
 * 工具调用，需要用户重新发起。
 */
export const runStatusSchema = z.enum([
  'starting',
  'running',
  'waiting',
  'completed',
  'failed',
  'cancelled',
  'interrupted'
])
export type RunStatus = z.infer<typeof runStatusSchema>

export const runSchema = z.object({
  id: idSchema,
  requestId: idSchema,
  threadId: idSchema,
  status: runStatusSchema,
  modelProfileId: idSchema,
  startedAt: epochMillisSchema,
  finishedAt: epochMillisSchema.nullable(),
  promptTokens: z.number().int().nonnegative(),
  completionTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  error: z.string().nullable()
})
export type RunDto = z.infer<typeof runSchema>

/**
 * 一次工具调用请求。
 *
 * 旧协议把 Koaks 的 `ToolCall`（含 `nativeId` / `nativeItemId` 等供应商内部锚点）整个塞进
 * 事件 payload。KAP 只暴露客户端渲染真正需要的三个字段，供应商锚点留在 server 内部。
 */
export const toolCallSchema = z.object({
  callId: idSchema,
  name: z.string(),
  argumentsJson: z.string(),
  itemRef: itemRefSchema.optional()
})
export type ToolCallDto = z.infer<typeof toolCallSchema>

/**
 * 工具输出的通道。
 *
 * - `final`  工具执行结束的最终结果，可能带 `isError`
 * - `stdout` / `stderr` Shell 类工具的流式输出
 * - `status` 工具主动上报的状态文本
 * - `custom` 工具自定义的结构化进度，`dataJson` 是原始 JSON 字符串
 *
 * 最终结果上限 64,000 字符并在 `truncated` 中明确标注；单次调用的流式输出最多持久化
 * 256,000 字符。
 */
export const toolOutputChannelSchema = z.enum(['final', 'stdout', 'stderr', 'status', 'custom'])
export type ToolOutputChannel = z.infer<typeof toolOutputChannelSchema>

export const TOOL_RESULT_MAX_CHARS = 64_000
export const TOOL_STREAM_MAX_CHARS = 256_000
