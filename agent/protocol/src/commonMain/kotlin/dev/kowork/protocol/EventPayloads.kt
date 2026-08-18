package dev.kowork.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * 事件 payload。
 *
 * 旧协议的事件是 `{ type, payload: Record<string, unknown> }` —— payload 完全不受约束。后果是
 * Koaks 的 `ModelEvent` 被原样塞进 `payload.event` 一路传到 Electron renderer，客户端因此
 * 不得不 `import type { Annotation, ModelEvent } from '@koaks/node'`，与框架直接耦合。
 *
 * KAP 给每一种事件定义完整 payload，并把 Koaks 的 `model` 事件拆成三个语义明确的事件
 * （`run.refusal` / `run.annotation` / `run.toolCallDelta`）。
 */

// —— 队列 ——

@Serializable
data class RequestQueuedPayload(
    val requestId: String,
    val input: String,
    val position: Long
) {
    init {
        requireNonBlank(requestId, "requestQueued.requestId")
        requireNonNegative(position, "requestQueued.position")
    }
}

/** 队列被暂停的原因。失败、取消、中断、压缩失败都会暂停当前会话队列。 */
@Serializable
enum class QueuePauseReason {
    @SerialName("failed")
    FAILED,

    @SerialName("cancelled")
    CANCELLED,

    @SerialName("interrupted")
    INTERRUPTED,

    @SerialName("compression_failed")
    COMPRESSION_FAILED
}

@Serializable
data class QueuePausedPayload(val reason: QueuePauseReason)

/** 无附加信息；线上表现为 `{}`。 */
@Serializable
data object QueueResumedPayload

// —— 运行生命周期 ——

@Serializable
data class RunStartedPayload(
    val requestId: String,
    val input: String,
    val modelProfileId: String
) {
    init {
        requireNonBlank(requestId, "runStarted.requestId")
        requireNonBlank(modelProfileId, "runStarted.modelProfileId")
    }
}

@Serializable
data class RunWaitingPayload(
    /** 例如等待审批、等待并发额度。仅用于展示。 */
    val reason: String
)

@Serializable
data class RunCompletedPayload(
    val usage: Usage,
    val finalText: String,
    /**
     * 最后一个模型步骤号。客户端用它区分「过程文本」与「最终答复」：`run.text` 里 `step` 等于
     * `finalStep` 的才是最终答复。为 0 表示无法判定，此时以最后一段文本为最终答复。
     */
    val finalStep: Long
) {
    init {
        requireNonNegative(finalStep, "runCompleted.finalStep")
    }
}

/**
 * run 失败的类别。
 *
 * 这是**领域概念**，与 RPC 层的 [KapErrorCode] 是两套东西：RPC 错误描述「这次请求为什么没被
 * 受理」，run 失败描述「这次 agent 运行为什么没跑完」。前者由客户端处理，后者要展示给用户。
 */
@Serializable
enum class RunFailureKind {
    @SerialName("model_error")
    MODEL_ERROR,

    @SerialName("tool_error")
    TOOL_ERROR,

    @SerialName("parse_error")
    PARSE_ERROR,

    @SerialName("tool_not_found")
    TOOL_NOT_FOUND,

    @SerialName("skill_error")
    SKILL_ERROR,

    @SerialName("preparation_error")
    PREPARATION_ERROR,

    @SerialName("timeout")
    TIMEOUT,

    @SerialName("incomplete")
    INCOMPLETE,

    @SerialName("terminated")
    TERMINATED,

    @SerialName("compression_failed")
    COMPRESSION_FAILED,

    @SerialName("unknown_error")
    UNKNOWN_ERROR
}

@Serializable
data class RunFailedPayload(
    val kind: RunFailureKind,
    val message: String,
    /** 失败前已消耗的额度。 */
    val usage: Usage,
    /** 该类别是否可重试，客户端据此决定是否显示「重试」。 */
    val retriable: Boolean
)

@Serializable
data class RunCancelledPayload(
    /** 取消不是错误，因此只带一段说明文本。 */
    val reason: String,
    val usage: Usage
)

/** 目前只有一种中断原因：server 在该 run 活动期间重启。 */
@Serializable
enum class RunInterruptReason {
    @SerialName("server_restarted")
    SERVER_RESTARTED
}

@Serializable
data class RunInterruptedPayload(val reason: RunInterruptReason)

// —— 运行内容增量 ——

@Serializable
data class RunTextPayload(
    val text: String,
    val step: Long,
    val itemRef: String? = null
) {
    init {
        requireNonNegative(step, "runText.step")
    }
}

@Serializable
data class RunReasoningPayload(
    val text: String,
    val kind: ReasoningKind,
    val itemRef: String? = null
)

/** 由 Koaks `ModelEvent.refusal_delta` 映射而来，不再透传框架结构。 */
@Serializable
data class RunRefusalPayload(
    val text: String,
    val step: Long,
    val phase: ModelCallPhase,
    val itemRef: String? = null
) {
    init {
        requireNonNegative(step, "runRefusal.step")
    }
}

/** 由 Koaks `ModelEvent.annotation_added` 映射而来。 */
@Serializable
data class RunAnnotationPayload(
    val annotation: KapAnnotation,
    val step: Long,
    val phase: ModelCallPhase,
    val itemRef: String? = null
) {
    init {
        requireNonNegative(step, "runAnnotation.step")
    }
}

/** 由 Koaks `ModelEvent.tool_call_delta` 映射而来，用于在参数流式到达时就渲染工具卡片。 */
@Serializable
data class RunToolCallDeltaPayload(
    val callId: String,
    val step: Long,
    val phase: ModelCallPhase,
    val index: Long? = null,
    val nameDelta: String? = null,
    val argumentsDelta: String? = null,
    val itemRef: String? = null
) {
    init {
        requireNonBlank(callId, "runToolCallDelta.callId")
        requireNonNegative(step, "runToolCallDelta.step")
        index?.let { requireNonNegative(it, "runToolCallDelta.index") }
    }
}

/**
 * 工具输出。按 `channel` 判别：
 *
 * - [Final] 只出现一次，是工具的最终结果
 * - [Stdout] / [Stderr] / [Status] 是执行期间的流式增量，可出现多次
 * - [Custom] 是工具自定义的结构化进度
 *
 * 客户端归并规则：流式通道**追加**，[Final] **替换**（若此前有流式输出且 [Final] 以已有内容
 * 为前缀，则替换为 [Final] 的完整内容）。
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("channel")
sealed interface RunToolOutputPayload {
    val callId: String

    @Serializable
    @SerialName("final")
    data class Final(
        override val callId: String,
        val text: String,
        val isError: Boolean,
        val truncated: Boolean
    ) : RunToolOutputPayload

    @Serializable
    @SerialName("stdout")
    data class Stdout(override val callId: String, val text: String) : RunToolOutputPayload

    @Serializable
    @SerialName("stderr")
    data class Stderr(override val callId: String, val text: String) : RunToolOutputPayload

    @Serializable
    @SerialName("status")
    data class Status(override val callId: String, val text: String) : RunToolOutputPayload

    @Serializable
    @SerialName("custom")
    data class Custom(
        override val callId: String,
        val kind: String,
        /** 原始 JSON 字符串，避免在协议里放任意结构。 */
        val dataJson: String,
        /** 供无法理解 [kind] 的客户端回退展示。 */
        val text: String
    ) : RunToolOutputPayload
}

// —— 审批、会话、记忆 ——

@Serializable
data class ApprovalRequestedPayload(val approval: Approval)

@Serializable
data class ApprovalResolvedPayload(val approval: Approval)

@Serializable
data class ThreadUpdatedPayload(
    val thread: Thread,
    val source: ThreadUpdateSource
)

@Serializable
data class MemoryCompressedPayload(
    val summary: String,
    /** 摘要覆盖到第几个 turn（含）。 */
    val coveredThroughOrdinal: Long,
    val estimatedTokens: Long
) {
    init {
        requireNonNegative(coveredThroughOrdinal, "memoryCompressed.coveredThroughOrdinal")
        requireNonNegative(estimatedTokens, "memoryCompressed.estimatedTokens")
    }
}

// —— 插件（阶段 5 预留） ——

@Serializable
data class PluginStateChangedPayload(
    val pluginId: String,
    val status: PluginStatus,
    val generation: Long
) {
    init {
        requireNonBlank(pluginId, "pluginStateChanged.pluginId")
        requireNonNegative(generation, "pluginStateChanged.generation")
    }
}

@Serializable
enum class PluginLogLevel {
    @SerialName("debug")
    DEBUG,

    @SerialName("info")
    INFO,

    @SerialName("warn")
    WARN,

    @SerialName("error")
    ERROR
}

@Serializable
data class PluginLogPayload(
    val pluginId: String,
    val level: PluginLogLevel,
    val message: String
) {
    init {
        requireNonBlank(pluginId, "pluginLog.pluginId")
    }
}
