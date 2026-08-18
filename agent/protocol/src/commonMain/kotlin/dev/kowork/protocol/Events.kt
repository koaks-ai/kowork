package dev.kowork.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * KAP 事件。
 *
 * 线上形状是 `{ "type": "<域>.<驼峰动作>", <基础字段…>, "payload": { … } }` —— 判别键与基础
 * 字段都在顶层。这么设计是为了让接收端**不必反序列化 payload 就能路由**：读一下 `type` 与
 * `threadId` 就能决定丢弃还是分发，这是客户端最频繁的操作。
 *
 * 代价是每个事件类都要重复声明 6 个基础字段。这份重复是刻意接受的：换成 `meta` 嵌套虽然能省掉
 * 样板代码，但会让客户端每次过滤都写 `event.meta.threadId`，把成本转移到了更高频的一侧。
 *
 * 命名规范：`<域>.<驼峰动作>`。旧协议里 `run.tool-call` 用连字符、其余用点，不一致，这里统一。
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface KapEvent {
    /** 全局单调递增，持久化。断线重连后用它作为补发游标。 */
    val sequence: Long
    val id: String
    val projectId: String?
    val threadId: String?
    val runId: String?
    val createdAt: Long

    /** 由插件产生的事件会带上来源插件 id。 */
    val pluginId: String?
}

/**
 * 基础字段的统一校验。
 *
 * 每个事件类都在 `init` 里调用它。TS 侧的 Zod 会检查 `sequence` 非负与 `id` 非空，Kotlin 侧
 * 若不做同样的检查，`conformance/kap-v1-cases.json` 里的 `event/negative-sequence` 与
 * `event/blank-id` 两条 reject 用例就会在两侧得出不同结论。
 */
private fun requireEventBase(sequence: Long, id: String, createdAt: Long) {
    requireNonNegative(sequence, "event.sequence")
    requireNonBlank(id, "event.id")
    requireNonNegative(createdAt, "event.createdAt")
}

@Serializable
@SerialName("request.queued")
data class RequestQueuedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RequestQueuedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("queue.paused")
data class QueuePausedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: QueuePausedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("queue.resumed")
data class QueueResumedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: QueueResumedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.started")
data class RunStartedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunStartedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.waiting")
data class RunWaitingEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunWaitingPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.text")
data class RunTextEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunTextPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.reasoning")
data class RunReasoningEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunReasoningPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.refusal")
data class RunRefusalEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunRefusalPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.annotation")
data class RunAnnotationEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunAnnotationPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.toolCall")
data class RunToolCallEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: ToolCall,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.toolCallDelta")
data class RunToolCallDeltaEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunToolCallDeltaPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.toolOutput")
data class RunToolOutputEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunToolOutputPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.completed")
data class RunCompletedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunCompletedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.failed")
data class RunFailedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunFailedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.cancelled")
data class RunCancelledEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunCancelledPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("run.interrupted")
data class RunInterruptedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: RunInterruptedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("approval.requested")
data class ApprovalRequestedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: ApprovalRequestedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("approval.resolved")
data class ApprovalResolvedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: ApprovalResolvedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("thread.updated")
data class ThreadUpdatedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: ThreadUpdatedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("memory.compressed")
data class MemoryCompressedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: MemoryCompressedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("plugin.stateChanged")
data class PluginStateChangedEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: PluginStateChangedPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

@Serializable
@SerialName("plugin.log")
data class PluginLogEvent(
    override val sequence: Long,
    override val id: String,
    override val projectId: String?,
    override val threadId: String?,
    override val runId: String?,
    override val createdAt: Long,
    val payload: PluginLogPayload,
    override val pluginId: String? = null
) : KapEvent {
    init { requireEventBase(sequence, id, createdAt) }
}

/**
 * 事件类型的线上名字。
 *
 * 与 [KapEvent] 各实现上的 `@SerialName` 一一对应。单独维护这份清单是为了让 server 能在不实例化
 * 事件的前提下做订阅过滤与统计；一致性由 `KapEventTypesTest` 守住。
 */
public object KapEventTypes {
    public const val REQUEST_QUEUED: String = "request.queued"
    public const val QUEUE_PAUSED: String = "queue.paused"
    public const val QUEUE_RESUMED: String = "queue.resumed"
    public const val RUN_STARTED: String = "run.started"
    public const val RUN_WAITING: String = "run.waiting"
    public const val RUN_TEXT: String = "run.text"
    public const val RUN_REASONING: String = "run.reasoning"
    public const val RUN_REFUSAL: String = "run.refusal"
    public const val RUN_ANNOTATION: String = "run.annotation"
    public const val RUN_TOOL_CALL: String = "run.toolCall"
    public const val RUN_TOOL_CALL_DELTA: String = "run.toolCallDelta"
    public const val RUN_TOOL_OUTPUT: String = "run.toolOutput"
    public const val RUN_COMPLETED: String = "run.completed"
    public const val RUN_FAILED: String = "run.failed"
    public const val RUN_CANCELLED: String = "run.cancelled"
    public const val RUN_INTERRUPTED: String = "run.interrupted"
    public const val APPROVAL_REQUESTED: String = "approval.requested"
    public const val APPROVAL_RESOLVED: String = "approval.resolved"
    public const val THREAD_UPDATED: String = "thread.updated"
    public const val MEMORY_COMPRESSED: String = "memory.compressed"
    public const val PLUGIN_STATE_CHANGED: String = "plugin.stateChanged"
    public const val PLUGIN_LOG: String = "plugin.log"

    public val ALL: List<String> = listOf(
        REQUEST_QUEUED,
        QUEUE_PAUSED,
        QUEUE_RESUMED,
        RUN_STARTED,
        RUN_WAITING,
        RUN_TEXT,
        RUN_REASONING,
        RUN_REFUSAL,
        RUN_ANNOTATION,
        RUN_TOOL_CALL,
        RUN_TOOL_CALL_DELTA,
        RUN_TOOL_OUTPUT,
        RUN_COMPLETED,
        RUN_FAILED,
        RUN_CANCELLED,
        RUN_INTERRUPTED,
        APPROVAL_REQUESTED,
        APPROVAL_RESOLVED,
        THREAD_UPDATED,
        MEMORY_COMPRESSED,
        PLUGIN_STATE_CHANGED,
        PLUGIN_LOG
    )

    /** 会终结一个 run 的事件类型。 */
    public val TERMINAL_RUN: List<String> = listOf(
        RUN_COMPLETED,
        RUN_FAILED,
        RUN_CANCELLED,
        RUN_INTERRUPTED
    )
}
