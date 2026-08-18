import { z } from 'zod'
import { approvalSchema } from './domain/approval'
import { pluginGenerationSchema, pluginStatusSchema } from './domain/plugin'
import { toolCallSchema } from './domain/run'
import { threadSchema, threadUpdateSourceSchema } from './domain/thread'
import {
  annotationSchema,
  epochMillisSchema,
  idSchema,
  itemRefSchema,
  modelCallPhaseSchema,
  reasoningKindSchema,
  sequenceSchema,
  usageSchema
} from './primitives'

/**
 * KAP 事件。
 *
 * 旧协议的事件是 `{ type, payload: z.record(z.string(), z.unknown()) }` —— payload 完全不受
 * 约束。后果是 Koaks 的 `ModelEvent` 被原样塞进 `payload.event` 一路传到 renderer，
 * `timeline-model.ts` 因此不得不 `import type { Annotation, ModelEvent } from '@koaks/node'`，
 * 客户端与框架直接耦合。
 *
 * KAP 给每一种事件定义完整 payload schema，并把 Koaks 的 `model` 事件拆成三个语义明确的事件
 * （`run.refusal` / `run.annotation` / `run.toolCallDelta`）。客户端从此只认协议类型。
 *
 * 命名规范：`<域>.<驼峰动作>`。旧协议里 `run.tool-call` 用连字符、其余用点，不一致，这里统一。
 */

// ——————————————————————————————————————————————————————————————
// 队列
// ——————————————————————————————————————————————————————————————

export const requestQueuedPayloadSchema = z.object({
  requestId: idSchema,
  input: z.string(),
  position: z.number().int().nonnegative()
})

/** 队列被暂停的原因。失败、取消、中断、压缩失败都会暂停当前会话队列。 */
export const queuePauseReasonSchema = z.enum([
  'failed',
  'cancelled',
  'interrupted',
  'compression_failed'
])
export type QueuePauseReason = z.infer<typeof queuePauseReasonSchema>

export const queuePausedPayloadSchema = z.object({ reason: queuePauseReasonSchema })

export const queueResumedPayloadSchema = z.object({})

// ——————————————————————————————————————————————————————————————
// 运行生命周期
// ——————————————————————————————————————————————————————————————

export const runStartedPayloadSchema = z.object({
  requestId: idSchema,
  input: z.string(),
  modelProfileId: idSchema
})

export const runWaitingPayloadSchema = z.object({
  /** 例如等待审批、等待并发额度。仅用于展示。 */
  reason: z.string()
})

export const runCompletedPayloadSchema = z.object({
  usage: usageSchema,
  finalText: z.string(),
  /**
   * 最后一个模型步骤号。客户端用它区分「过程文本」与「最终答复」：`run.text` 里 `step` 等于
   * `finalStep` 的才是最终答复。为 0 表示无法判定，此时以最后一段文本为最终答复。
   */
  finalStep: z.number().int().nonnegative()
})

/**
 * run 失败的类别。
 *
 * 这是**领域概念**，与 RPC 层的 `KapErrorCode` 是两套东西：RPC 错误描述「这次请求为什么没被
 * 受理」，run 失败描述「这次 agent 运行为什么没跑完」。前者由客户端处理，后者要展示给用户。
 */
export const runFailureKindSchema = z.enum([
  'model_error',
  'tool_error',
  'parse_error',
  'tool_not_found',
  'skill_error',
  'preparation_error',
  'timeout',
  'incomplete',
  'terminated',
  'compression_failed',
  'unknown_error'
])
export type RunFailureKind = z.infer<typeof runFailureKindSchema>

export const runFailedPayloadSchema = z.object({
  kind: runFailureKindSchema,
  message: z.string(),
  /** 失败前已消耗的额度。 */
  usage: usageSchema,
  /** 该类别是否可重试，客户端据此决定是否显示「重试」。 */
  retriable: z.boolean()
})

export const runCancelledPayloadSchema = z.object({
  /** 取消不是错误，因此只带一段说明文本。 */
  reason: z.string(),
  usage: usageSchema
})

export const runInterruptedPayloadSchema = z.object({
  /** 目前只有一种：server 在该 run 活动期间重启。 */
  reason: z.enum(['server_restarted'])
})

// ——————————————————————————————————————————————————————————————
// 运行内容增量
// ——————————————————————————————————————————————————————————————

export const runTextPayloadSchema = z.object({
  text: z.string(),
  step: z.number().int().nonnegative(),
  itemRef: itemRefSchema.optional()
})

export const runReasoningPayloadSchema = z.object({
  text: z.string(),
  kind: reasoningKindSchema,
  itemRef: itemRefSchema.optional()
})

/** 由 Koaks `ModelEvent.refusal_delta` 映射而来，不再透传框架结构。 */
export const runRefusalPayloadSchema = z.object({
  text: z.string(),
  itemRef: itemRefSchema.optional(),
  step: z.number().int().nonnegative(),
  phase: modelCallPhaseSchema
})

/** 由 Koaks `ModelEvent.annotation_added` 映射而来。 */
export const runAnnotationPayloadSchema = z.object({
  annotation: annotationSchema,
  itemRef: itemRefSchema.optional(),
  step: z.number().int().nonnegative(),
  phase: modelCallPhaseSchema
})

/** 由 Koaks `ModelEvent.tool_call_delta` 映射而来，用于在参数流式到达时就渲染工具卡片。 */
export const runToolCallDeltaPayloadSchema = z.object({
  callId: idSchema,
  index: z.number().int().nonnegative().optional(),
  nameDelta: z.string().optional(),
  argumentsDelta: z.string().optional(),
  itemRef: itemRefSchema.optional(),
  step: z.number().int().nonnegative(),
  phase: modelCallPhaseSchema
})

/** 工具调用参数已完整，即将进入授权与执行。 */
export const runToolCallPayloadSchema = toolCallSchema

/**
 * 工具输出。按 `channel` 判别：
 *
 * - `final` 只出现一次，是工具的最终结果
 * - `stdout` / `stderr` / `status` 是执行期间的流式增量，可出现多次
 * - `custom` 是工具自定义的结构化进度
 *
 * 客户端归并规则：流式通道**追加**，`final` **替换**（若此前有流式输出且 `final` 以已有内容
 * 为前缀，则替换为 `final` 的完整内容）。
 */
export const runToolOutputPayloadSchema = z.discriminatedUnion('channel', [
  z.object({
    channel: z.literal('final'),
    callId: idSchema,
    text: z.string(),
    isError: z.boolean(),
    truncated: z.boolean()
  }),
  z.object({
    channel: z.literal('stdout'),
    callId: idSchema,
    text: z.string()
  }),
  z.object({
    channel: z.literal('stderr'),
    callId: idSchema,
    text: z.string()
  }),
  z.object({
    channel: z.literal('status'),
    callId: idSchema,
    text: z.string()
  }),
  z.object({
    channel: z.literal('custom'),
    callId: idSchema,
    kind: z.string(),
    /** 原始 JSON 字符串，避免在协议里放任意结构。 */
    dataJson: z.string(),
    /** 供无法理解 `kind` 的客户端回退展示。 */
    text: z.string()
  })
])

// ——————————————————————————————————————————————————————————————
// 审批、会话、记忆
// ——————————————————————————————————————————————————————————————

export const approvalRequestedPayloadSchema = z.object({ approval: approvalSchema })
export const approvalResolvedPayloadSchema = z.object({ approval: approvalSchema })

export const threadUpdatedPayloadSchema = z.object({
  thread: threadSchema,
  source: threadUpdateSourceSchema
})

export const memoryCompressedPayloadSchema = z.object({
  summary: z.string(),
  /** 摘要覆盖到第几个 turn（含）。 */
  coveredThroughOrdinal: z.number().int().nonnegative(),
  estimatedTokens: z.number().int().nonnegative()
})

// ——————————————————————————————————————————————————————————————
// 插件（阶段 5 预留）
// ——————————————————————————————————————————————————————————————

export const pluginStateChangedPayloadSchema = z.object({
  pluginId: z.string(),
  status: pluginStatusSchema,
  generation: pluginGenerationSchema
})

export const pluginLogPayloadSchema = z.object({
  pluginId: z.string(),
  level: z.enum(['debug', 'info', 'warn', 'error']),
  message: z.string()
})

// ——————————————————————————————————————————————————————————————
// 事件信封
// ——————————————————————————————————————————————————————————————

const eventBaseFields = {
  /** 全局单调递增，持久化。断线重连后用它作为补发游标。 */
  sequence: sequenceSchema,
  id: idSchema,
  projectId: idSchema.nullable(),
  threadId: idSchema.nullable(),
  runId: idSchema.nullable(),
  createdAt: epochMillisSchema,
  /** 由插件产生的事件会带上来源插件 id。 */
  pluginId: z.string().optional()
} as const

type EventBaseShape = typeof eventBaseFields

function defineEvent<Type extends string, Payload extends z.ZodTypeAny>(
  type: Type,
  payload: Payload
): z.ZodObject<EventBaseShape & { type: z.ZodLiteral<Type>; payload: Payload }> {
  return z.object({ ...eventBaseFields, type: z.literal(type), payload })
}

export const eventSchema = z.discriminatedUnion('type', [
  defineEvent('request.queued', requestQueuedPayloadSchema),
  defineEvent('queue.paused', queuePausedPayloadSchema),
  defineEvent('queue.resumed', queueResumedPayloadSchema),
  defineEvent('run.started', runStartedPayloadSchema),
  defineEvent('run.waiting', runWaitingPayloadSchema),
  defineEvent('run.text', runTextPayloadSchema),
  defineEvent('run.reasoning', runReasoningPayloadSchema),
  defineEvent('run.refusal', runRefusalPayloadSchema),
  defineEvent('run.annotation', runAnnotationPayloadSchema),
  defineEvent('run.toolCall', runToolCallPayloadSchema),
  defineEvent('run.toolCallDelta', runToolCallDeltaPayloadSchema),
  defineEvent('run.toolOutput', runToolOutputPayloadSchema),
  defineEvent('run.completed', runCompletedPayloadSchema),
  defineEvent('run.failed', runFailedPayloadSchema),
  defineEvent('run.cancelled', runCancelledPayloadSchema),
  defineEvent('run.interrupted', runInterruptedPayloadSchema),
  defineEvent('approval.requested', approvalRequestedPayloadSchema),
  defineEvent('approval.resolved', approvalResolvedPayloadSchema),
  defineEvent('thread.updated', threadUpdatedPayloadSchema),
  defineEvent('memory.compressed', memoryCompressedPayloadSchema),
  defineEvent('plugin.stateChanged', pluginStateChangedPayloadSchema),
  defineEvent('plugin.log', pluginLogPayloadSchema)
])

export type EventDto = z.infer<typeof eventSchema>
export type EventType = EventDto['type']

/** 按事件类型取出对应的强类型事件。 */
export type EventOf<T extends EventType> = Extract<EventDto, { type: T }>

export const EVENT_TYPES = [
  'request.queued',
  'queue.paused',
  'queue.resumed',
  'run.started',
  'run.waiting',
  'run.text',
  'run.reasoning',
  'run.refusal',
  'run.annotation',
  'run.toolCall',
  'run.toolCallDelta',
  'run.toolOutput',
  'run.completed',
  'run.failed',
  'run.cancelled',
  'run.interrupted',
  'approval.requested',
  'approval.resolved',
  'thread.updated',
  'memory.compressed',
  'plugin.stateChanged',
  'plugin.log'
] as const satisfies readonly EventType[]

export const eventTypeSchema = z.enum(EVENT_TYPES)

/** 会终结一个 run 的事件类型。 */
export const TERMINAL_RUN_EVENT_TYPES = [
  'run.completed',
  'run.failed',
  'run.cancelled',
  'run.interrupted'
] as const satisfies readonly EventType[]

export function isTerminalRunEvent(event: EventDto): boolean {
  return (TERMINAL_RUN_EVENT_TYPES as readonly string[]).includes(event.type)
}

export function parseEvent(value: unknown): EventDto {
  return eventSchema.parse(value)
}
