package dev.kowork.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * 核心领域实体：项目、会话、请求、运行、审批。
 */

/**
 * 项目。
 *
 * [rootPath] 始终是 **agent server 侧** 的绝对路径。这是 KAP 与旧协议最重要的语义差异之一：
 * 远程模式下工作目录在服务器上，客户端不得假定该路径在本机存在，也不得用本机的路径分隔符去
 * 解析它。需要让用户挑选目录时走 `fs.browse`。
 */
@Serializable
data class Project(
    val id: String,
    val name: String,
    val rootPath: String,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long?
) {
    init {
        requireNonBlank(id, "project.id")
        requireNonNegative(createdAt, "project.createdAt")
        requireNonNegative(updatedAt, "project.updatedAt")
    }
}

/**
 * 权限模式。三档语义（由 server 强制，客户端只做展示）：
 *
 * - [ASK]  项目内读自动；项目内写每次审批；Shell 每次审批；项目外文件/目录每个 run 审批
 * - [AUTO] 项目内读写自动；Shell 每次审批；项目外每个 run 审批
 * - [YOLO] 项目内读写自动；Shell 自动（含项目外 cwd）；项目外仍每个 run 审批
 *
 * 权限模式**不进入队列快照**：每次工具调用开始时读取会话当前值，因此用户在排队期间改模式会
 * 影响后续的工具调用。
 */
@Serializable
enum class PermissionMode {
    @SerialName("ask")
    ASK,

    @SerialName("auto")
    AUTO,

    @SerialName("yolo")
    YOLO
}

@Serializable
data class Thread(
    val id: String,
    val projectId: String,
    val title: String,
    val modelProfileId: String,
    val permissionMode: PermissionMode,
    /** 覆盖模型 Profile 的上下文窗口；`null` 表示沿用 Profile 的值。 */
    val contextWindowTokens: Long?,
    val queuePaused: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long?
) {
    init {
        requireNonBlank(id, "thread.id")
        requireNonBlank(projectId, "thread.projectId")
        requireNonBlank(modelProfileId, "thread.modelProfileId")
        contextWindowTokens?.let { requirePositive(it, "thread.contextWindowTokens") }
        requireNonNegative(createdAt, "thread.createdAt")
        requireNonNegative(updatedAt, "thread.updatedAt")
    }
}

/** 会话标题变更的来源，用于客户端决定是否播放标题切换动画。 */
@Serializable
enum class ThreadUpdateSource {
    @SerialName("first_message")
    FIRST_MESSAGE,

    @SerialName("user")
    USER,

    @SerialName("system")
    SYSTEM
}

/**
 * 会话上下文窗口的改动意图。
 *
 * `threads.update` 里如果直接用 `contextWindowTokens: Long?`，就出现了「缺省 = 不改 /
 * null = 跟随 Profile / 数字 = 覆盖」这样的三态，而 kotlinx.serialization 无法把「缺省」与
 * 「显式 null」区分开。改成显式判别联合后两侧都能自然表达：**整个字段缺省**表示不改，
 * 出现则由 `mode` 明确说明要什么。
 */
@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("mode")
sealed interface ContextWindowOverride {
    /** 跟随模型 Profile 的窗口大小。 */
    @Serializable
    @SerialName("inherit")
    data object Inherit : ContextWindowOverride

    /** 用指定值覆盖 Profile 的窗口大小。 */
    @Serializable
    @SerialName("override")
    data class Override(val tokens: Long) : ContextWindowOverride {
        init {
            requirePositive(tokens, "contextWindowOverride.tokens")
        }
    }
}

@Serializable
enum class QueuedRequestStatus {
    @SerialName("queued")
    QUEUED,

    @SerialName("running")
    RUNNING,

    @SerialName("completed")
    COMPLETED,

    @SerialName("failed")
    FAILED,

    @SerialName("cancelled")
    CANCELLED,

    @SerialName("interrupted")
    INTERRUPTED
}

/**
 * 排队请求。同一会话内 FIFO 并持久化，不同会话可并发。
 *
 * [modelProfileId] 与 [contextWindowTokens] 在**入队时冻结**：用户排队后改会话模型不会影响
 * 已入队的请求。权限模式相反，不冻结（见 [PermissionMode]）。
 */
@Serializable
data class QueuedRequest(
    val id: String,
    val threadId: String,
    val input: String,
    val status: QueuedRequestStatus,
    val modelProfileId: String,
    val contextWindowTokens: Long,
    val position: Long,
    val createdAt: Long,
    val updatedAt: Long
) {
    init {
        requireNonBlank(id, "queuedRequest.id")
        requireNonBlank(threadId, "queuedRequest.threadId")
        requirePositive(contextWindowTokens, "queuedRequest.contextWindowTokens")
        requireNonNegative(position, "queuedRequest.position")
        requireNonNegative(createdAt, "queuedRequest.createdAt")
        requireNonNegative(updatedAt, "queuedRequest.updatedAt")
    }
}

/**
 * `INTERRUPTED` 表示 server 在该 run 活动期间重启过。恢复时**不会**自动重放可能产生副作用的
 * 工具调用，需要用户重新发起。
 */
@Serializable
enum class RunStatus {
    @SerialName("starting")
    STARTING,

    @SerialName("running")
    RUNNING,

    @SerialName("waiting")
    WAITING,

    @SerialName("completed")
    COMPLETED,

    @SerialName("failed")
    FAILED,

    @SerialName("cancelled")
    CANCELLED,

    @SerialName("interrupted")
    INTERRUPTED
}

@Serializable
data class Run(
    val id: String,
    val requestId: String,
    val threadId: String,
    val status: RunStatus,
    val modelProfileId: String,
    val startedAt: Long,
    val finishedAt: Long?,
    val promptTokens: Long,
    val completionTokens: Long,
    val totalTokens: Long,
    val error: String?
) {
    init {
        requireNonBlank(id, "run.id")
        requireNonBlank(requestId, "run.requestId")
        requireNonBlank(threadId, "run.threadId")
        requireNonNegative(startedAt, "run.startedAt")
        requireNonNegative(promptTokens, "run.promptTokens")
        requireNonNegative(completionTokens, "run.completionTokens")
        requireNonNegative(totalTokens, "run.totalTokens")
    }
}

/**
 * 一次工具调用请求。
 *
 * 旧协议把 Koaks 的 `ToolCall`（含 `nativeId` / `nativeItemId` 等供应商内部锚点）整个塞进
 * 事件 payload。KAP 只暴露客户端渲染真正需要的三个字段，供应商锚点留在 server 内部。
 */
@Serializable
data class ToolCall(
    val callId: String,
    val name: String,
    val argumentsJson: String,
    val itemRef: String? = null
) {
    init {
        requireNonBlank(callId, "toolCall.callId")
    }
}

@Serializable
enum class ApprovalKind {
    @SerialName("file_write")
    FILE_WRITE,

    @SerialName("shell")
    SHELL,

    @SerialName("external_path")
    EXTERNAL_PATH
}

@Serializable
enum class ApprovalStatus {
    @SerialName("pending")
    PENDING,

    @SerialName("allowed")
    ALLOWED,

    @SerialName("denied")
    DENIED
}

/**
 * 路径授权的访问级别。[WRITE] 隐含 [READ]；[READ] 不能用于写入。
 * 单文件授权只覆盖该文件；目录授权覆盖其子路径。授权**仅在当前 run 内有效**。
 */
@Serializable
enum class PathAccess {
    @SerialName("read")
    READ,

    @SerialName("write")
    WRITE
}

@Serializable
enum class ApprovalDecision {
    @SerialName("allow")
    ALLOW,

    @SerialName("deny")
    DENY
}

@Serializable
data class Approval(
    val id: String,
    val projectId: String,
    val threadId: String,
    val runId: String,
    val kind: ApprovalKind,
    val title: String,
    val detail: String,
    val status: ApprovalStatus,
    /** server 侧的绝对路径，仅在 [kind] 为 `file_write` / `external_path` 时有值。 */
    val requestedPath: String?,
    val requestedAccess: PathAccess?,
    val createdAt: Long,
    val resolvedAt: Long?
) {
    init {
        requireNonBlank(id, "approval.id")
        requireNonBlank(projectId, "approval.projectId")
        requireNonBlank(threadId, "approval.threadId")
        requireNonBlank(runId, "approval.runId")
        requireNonNegative(createdAt, "approval.createdAt")
    }
}

public object ToolLimits {
    /** 工具最终结果的字符上限，超出时在 `run.toolOutput` 的 `truncated` 里标注。 */
    public const val RESULT_MAX_CHARS: Int = 64_000

    /** 单次调用流式输出的持久化字符上限。 */
    public const val STREAM_MAX_CHARS: Int = 256_000
}
