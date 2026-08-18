package dev.kowork.protocol

import kotlinx.serialization.Serializable

/**
 * RPC 的入参与出参类型。
 *
 * 命名约定：入参一律以 `Params` 结尾。多个方法共用的窄入参（只带一个 id）复用同一个类型，
 * 避免出现十几个只有一个字段的近义类。
 *
 * 关于「缺省」与「null」：本文件里所有**带默认值**的可空字段都表示「缺省即不改 / 未指定」，
 * 对应 TS 的 `.optional()`；**不带默认值**的可空字段表示「必须显式给出，可以是 null」，
 * 对应 TS 的 `.nullable()`。参见 [KapJson] 里关于 `encodeDefaults` 的说明。
 */

/** 无入参方法的占位类型；线上表现为 `{}`。server 必须把缺省与 `null` 都当作 `{}` 处理。 */
@Serializable
data object EmptyParams

// —— 鉴权 ——

@Serializable
data class RotateKeyResult(val token: String) {
    init {
        requireNonBlank(token, "rotateKeyResult.token")
    }
}

// —— 项目 ——

@Serializable
data class ProjectsListParams(val includeDeleted: Boolean? = null)

@Serializable
data class ProjectsAddParams(val rootPath: String) {
    init {
        requireNonBlank(rootPath, "projectsAdd.rootPath")
    }
}

@Serializable
data class ProjectIdParams(val projectId: String) {
    init {
        requireNonBlank(projectId, "params.projectId")
    }
}

// —— 会话 ——

@Serializable
data class ThreadsListParams(
    val projectId: String,
    val includeDeleted: Boolean? = null
) {
    init {
        requireNonBlank(projectId, "threadsList.projectId")
    }
}

@Serializable
data class ThreadsCreateParams(
    val projectId: String,
    val title: String? = null
) {
    init {
        requireNonBlank(projectId, "threadsCreate.projectId")
    }
}

@Serializable
data class ThreadsUpdateParams(
    val threadId: String,
    val title: String? = null,
    val modelProfileId: String? = null,
    val permissionMode: PermissionMode? = null,
    /** 整个字段缺省表示不改动上下文窗口，见 [ContextWindowOverride]。 */
    val contextWindowOverride: ContextWindowOverride? = null
) {
    init {
        requireNonBlank(threadId, "threadsUpdate.threadId")
        title?.let { requireNonBlank(it, "threadsUpdate.title") }
        modelProfileId?.let { requireNonBlank(it, "threadsUpdate.modelProfileId") }
    }
}

@Serializable
data class ThreadIdParams(val threadId: String) {
    init {
        requireNonBlank(threadId, "params.threadId")
    }
}

// —— 运行与队列 ——

@Serializable
data class RunsEnqueueParams(
    val threadId: String,
    val input: String
) {
    init {
        requireNonBlank(threadId, "runsEnqueue.threadId")
        require(input.trim().isNotEmpty()) { "runsEnqueue.input 不能是空白内容" }
    }
}

@Serializable
data class RunIdParams(val runId: String) {
    init {
        requireNonBlank(runId, "params.runId")
    }
}

@Serializable
data class RequestIdParams(val requestId: String) {
    init {
        requireNonBlank(requestId, "params.requestId")
    }
}

// —— 事件历史 ——

@Serializable
data class EventsListParams(
    val threadId: String? = null,
    val afterSequence: Long? = null,
    val limit: Long? = null
) {
    init {
        afterSequence?.let { requireNonNegative(it, "eventsList.afterSequence") }
        limit?.let {
            requirePositive(it, "eventsList.limit")
            require(it <= EventsPage.PAGE_MAX) {
                "eventsList.limit 不能超过 ${EventsPage.PAGE_MAX}，实际为 $it"
            }
        }
    }
}

@Serializable
data class EventsPage(
    val events: List<KapEvent>,
    /** 还有更多历史时为 `true`，客户端应带上最后一条的 `sequence` 继续拉取。 */
    val hasMore: Boolean
) {
    companion object {
        /** 单页上限。server 必须把超出的 `limit` 截到这个值。 */
        const val PAGE_MAX: Long = 2_000
    }
}

// —— 审批 ——

@Serializable
data class ApprovalsListParams(
    val threadId: String? = null,
    val pendingOnly: Boolean? = null
)

@Serializable
data class ApprovalsRespondParams(
    val approvalId: String,
    val decision: ApprovalDecision
) {
    init {
        requireNonBlank(approvalId, "approvalsRespond.approvalId")
    }
}

// —— 供应商与模型 ——

/**
 * 创建供应商。
 *
 * **安全语义变更（相对旧实现）**：旧架构里 Agent 跑在 Electron 的 core 进程内，API Key 通过一条
 * 独立的 Electron IPC 通道直送 Main 并用 `safeStorage` 加密，刻意绕开 Core RPC。现在 Agent 跑在
 * server 上，必须由 server 调用 LLM，因此密钥只能随 KAP 上行、由 server 加密落盘。
 *
 * 这条链路必须加密：客户端对非 loopback 地址默认强制 `wss://`。
 */
@Serializable
data class ProviderCreateParams(
    val name: String,
    val kind: ProviderKind,
    val protocol: ProviderProtocol,
    val baseUrl: String,
    val defaultContextWindowTokens: Long,
    val apiKey: String? = null
) {
    init {
        requireNonBlank(name.trim(), "providerCreate.name")
        require(name.trim().length <= ProviderLimits.NAME_MAX_LENGTH) {
            "providerCreate.name 不能超过 ${ProviderLimits.NAME_MAX_LENGTH} 个字符"
        }
        requireHttpUrl(baseUrl, "providerCreate.baseUrl")
        requirePositive(defaultContextWindowTokens, "providerCreate.defaultContextWindowTokens")
        require(defaultContextWindowTokens <= ProviderLimits.CONTEXT_WINDOW_MAX) {
            "providerCreate.defaultContextWindowTokens 超出上限 ${ProviderLimits.CONTEXT_WINDOW_MAX}"
        }
        apiKey?.let { requireNonBlank(it.trim(), "providerCreate.apiKey") }
    }
}

/**
 * 更新供应商的**非凭据**字段。所有字段都是「缺省即不改」，且都不可为 null，因此没有歧义。
 *
 * 凭据被刻意排除在外，改动走 [ProviderSetCredentialParams]。这么切分有两个好处：一是避免
 * 「缺省 / null / 有值」的三态；二是凭据改动成为独立可审计的操作。
 */
@Serializable
data class ProviderUpdateParams(
    val providerId: String,
    val name: String? = null,
    val kind: ProviderKind? = null,
    val protocol: ProviderProtocol? = null,
    val baseUrl: String? = null,
    val defaultContextWindowTokens: Long? = null,
    val enabled: Boolean? = null
) {
    init {
        requireNonBlank(providerId, "providerUpdate.providerId")
        name?.let {
            requireNonBlank(it.trim(), "providerUpdate.name")
            require(it.trim().length <= ProviderLimits.NAME_MAX_LENGTH) {
                "providerUpdate.name 不能超过 ${ProviderLimits.NAME_MAX_LENGTH} 个字符"
            }
        }
        baseUrl?.let { requireHttpUrl(it, "providerUpdate.baseUrl") }
        defaultContextWindowTokens?.let {
            requirePositive(it, "providerUpdate.defaultContextWindowTokens")
            require(it <= ProviderLimits.CONTEXT_WINDOW_MAX) {
                "providerUpdate.defaultContextWindowTokens 超出上限 ${ProviderLimits.CONTEXT_WINDOW_MAX}"
            }
        }
    }
}

/**
 * 设置或清除供应商凭据。
 *
 * [apiKey] **没有默认值**，因此必须显式给出：字符串表示覆盖，`null` 表示清除。这正是为了避免
 * 「字段缺省」这第三种状态出现 —— 一旦出现，Kotlin 就无法把它和显式 `null` 区分开。
 */
@Serializable
data class ProviderSetCredentialParams(
    val providerId: String,
    val apiKey: String?
) {
    init {
        requireNonBlank(providerId, "providerSetCredential.providerId")
        apiKey?.let { requireNonBlank(it.trim(), "providerSetCredential.apiKey") }
    }
}

@Serializable
data class ProviderIdParams(val providerId: String) {
    init {
        requireNonBlank(providerId, "params.providerId")
    }
}

@Serializable
data class ModelsAddParams(
    val providerId: String,
    val model: String,
    val contextWindowTokens: Long,
    val name: String? = null
) {
    init {
        requireNonBlank(providerId, "modelsAdd.providerId")
        requireNonBlank(model.trim(), "modelsAdd.model")
        requirePositive(contextWindowTokens, "modelsAdd.contextWindowTokens")
        name?.let { requireNonBlank(it.trim(), "modelsAdd.name") }
    }
}

@Serializable
data class ModelProfileIdParams(val modelProfileId: String) {
    init {
        requireNonBlank(modelProfileId, "params.modelProfileId")
    }
}

// —— 工作区 ——

@Serializable
data class FilesListParams(
    val projectId: String,
    val relativePath: String? = null
) {
    init {
        requireNonBlank(projectId, "filesList.projectId")
    }
}

@Serializable
data class FilesReadParams(
    val projectId: String,
    val relativePath: String
) {
    init {
        requireNonBlank(projectId, "filesRead.projectId")
    }
}

@Serializable
data class FilesUploadParams(
    val projectId: String,
    val relativePath: String,
    val contentBase64: String,
    val overwrite: Boolean? = null
) {
    init {
        requireNonBlank(projectId, "filesUpload.projectId")
        requireNonBlank(relativePath, "filesUpload.relativePath")
    }
}

@Serializable
data class FsBrowseParams(
    /** 不传表示从默认起点开始（用户主目录 / 盘符列表）。 */
    val path: String? = null,
    val includeFiles: Boolean? = null
)

@Serializable
data class GitDiffParams(
    val projectId: String,
    val relativePath: String? = null
) {
    init {
        requireNonBlank(projectId, "gitDiff.projectId")
    }
}

// —— 插件 ——

@Serializable
data class PluginsInstallParams(val sourcePath: String) {
    init {
        requireNonBlank(sourcePath, "pluginsInstall.sourcePath")
    }
}

@Serializable
data class PluginIdParams(val pluginId: String) {
    init {
        requireNonBlank(pluginId, "params.pluginId")
    }
}

@Serializable
data class PluginsSetEnabledParams(
    val pluginId: String,
    val enabled: Boolean
) {
    init {
        requireNonBlank(pluginId, "pluginsSetEnabled.pluginId")
    }
}

/** [pluginId] 缺省表示重载全部插件。 */
@Serializable
data class PluginsReloadParams(val pluginId: String? = null)
