package dev.kowork.persistence

import org.koaks.framework.memory.ConversationTurn
import org.koaks.framework.model.ModelItem
import org.koaks.framework.model.ProviderCheckpoint

public enum class BranchKind {
    MAIN,
    FORK,
    SIDE_CHAT,
}

public enum class QueueStatus {
    QUEUED,
    RUNNING,
    COMPLETED,
    FAILED,
    CANCELLED,
    INTERRUPTED,
}

public enum class RunStatus {
    STARTING,
    RUNNING,
    WAITING,
    COMPLETED,
    FAILED,
    CANCELLED,
    INTERRUPTED,
}

public data class ProjectRecord(
    val id: String,
    val name: String,
    val rootPath: String,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long?,
)

public data class ProviderRecord(
    val id: String,
    val name: String,
    val kind: String,
    val protocol: String,
    val baseUrl: String,
    /** 只允许保存服务端加密引用或密文，不提供明文凭据字段。 */
    val credentialCiphertext: String?,
    val defaultContextWindowTokens: Long,
    val enabled: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long?,
)

public data class ModelProfileRecord(
    val id: String,
    val providerId: String,
    val name: String,
    val model: String,
    val contextWindowTokens: Long,
    val source: String,
    val enabled: Boolean,
    val createdAt: Long,
    val updatedAt: Long,
)

public data class ThreadRecord(
    val id: String,
    val projectId: String,
    val title: String,
    val modelProfileId: String,
    val permissionMode: String,
    val contextWindowTokens: Long?,
    val createdAt: Long,
    val updatedAt: Long,
    val deletedAt: Long?,
)

public data class BranchRecord(
    val id: String,
    val threadId: String,
    val parentBranchId: String?,
    val forkTurnId: String?,
    val headTurnId: String?,
    val kind: BranchKind,
    val queuePaused: Boolean,
    val archivedAt: Long?,
    val createdAt: Long,
    val updatedAt: Long,
)

/** 原始 turn 的数据库投影。items/status/checkpoint 仍由 Koaks wire codec 负责编码。 */
public data class StoredTurn(
    val id: String,
    val threadId: String,
    val branchId: String,
    val parentTurnId: String?,
    val ordinal: Long,
    val turn: ConversationTurn,
    val createdAt: Long,
)

public data class QueueRecord(
    val id: String,
    val threadId: String,
    val branchId: String,
    val input: String,
    val status: QueueStatus,
    val modelProfileId: String,
    val contextWindowTokens: Long,
    val position: Long,
    val createdAt: Long,
    val updatedAt: Long,
)

public data class RunRecord(
    val id: String,
    val requestId: String,
    val threadId: String,
    val branchId: String,
    val status: RunStatus,
    val modelProfileId: String,
    val startedAt: Long,
    val finishedAt: Long?,
    val promptTokens: Long,
    val completionTokens: Long,
    val totalTokens: Long,
    val error: String?,
)

public data class EventRecord(
    val sequence: Long,
    val id: String,
    val projectId: String?,
    val threadId: String?,
    val branchId: String?,
    val runId: String?,
    val type: String,
    val payloadJson: String,
    val createdAt: Long,
)

public data class CompressionCheckpointRecord(
    val id: String,
    val threadId: String,
    val branchId: String,
    val modelProfileId: String,
    val summary: String,
    val coveredThroughTurnId: String,
    val estimatedTokens: Long,
    val createdAt: Long,
)

public sealed interface DisplayConversationEntry {
    public data class Turn(val value: StoredTurn) : DisplayConversationEntry

    /** 仅用于展示；永远不会作为 Koaks ModelItem 送入模型。 */
    public data class SummaryNotification(
        val checkpoint: CompressionCheckpointRecord,
    ) : DisplayConversationEntry
}

public data class ModelContext(
    val items: List<ModelItem>,
    val checkpoint: ProviderCheckpoint?,
    val summaryCheckpoint: CompressionCheckpointRecord?,
)

public data class PluginRecord(
    val id: String,
    val manifestJson: String,
    val status: String,
    val installPath: String,
    val loadError: String?,
    val agentLoaded: Boolean,
    val installedAt: Long,
    val updatedAt: Long,
)
