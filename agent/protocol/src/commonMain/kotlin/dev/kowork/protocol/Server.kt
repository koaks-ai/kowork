package dev.kowork.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ServerOs {
    @SerialName("linux")
    LINUX,

    @SerialName("macos")
    MACOS,

    @SerialName("windows")
    WINDOWS
}

/** [NATIVE] 是分发用的 Kotlin/Native 二进制；[JVM] 只用于开发调试。 */
@Serializable
enum class ServerRuntime {
    @SerialName("native")
    NATIVE,

    @SerialName("jvm")
    JVM
}

/**
 * 能力位。客户端**必须**按能力位做功能降级，不得按 server 版本号推断。
 *
 * 这样做的直接好处：用户的远程 server 落后于客户端时，客户端能自己关掉不支持的入口，
 * 而不是让用户点了才报 `method_not_implemented`。
 */
@Serializable
enum class ServerCapability {
    @SerialName("fs.browse")
    FS_BROWSE,

    @SerialName("files.upload")
    FILES_UPLOAD,

    @SerialName("plugins")
    PLUGINS,

    @SerialName("plugins.agentHost")
    PLUGINS_AGENT_HOST,

    @SerialName("auth.rotateKey")
    AUTH_ROTATE_KEY
}

@Serializable
data class ServerInfo(
    /** 协商后实际生效的协议版本。 */
    val protocolVersion: Int,
    /** server 支持的协议区间，便于客户端提示用户该升级哪一侧。 */
    val minProtocolVersion: Int,
    val maxProtocolVersion: Int,
    val serverVersion: String,
    val runtime: ServerRuntime,
    val os: ServerOs,
    val arch: String,
    val capabilities: List<ServerCapability>,
    val startedAt: Long
) {
    init {
        requirePositive(protocolVersion, "serverInfo.protocolVersion")
        requirePositive(minProtocolVersion, "serverInfo.minProtocolVersion")
        requirePositive(maxProtocolVersion, "serverInfo.maxProtocolVersion")
        require(minProtocolVersion <= maxProtocolVersion) {
            "serverInfo 的协议区间非法：min=$minProtocolVersion > max=$maxProtocolVersion"
        }
        requireNonNegative(startedAt, "serverInfo.startedAt")
    }
}

/**
 * 客户端打开后的首帧快照。
 *
 * 相对旧的 `app.bootstrap` 增加了 [server]、[plugins] 与 [pluginGeneration]。
 * [lastEventSequence] 是断线补发的起点游标。
 */
@Serializable
data class Bootstrap(
    val server: ServerInfo,
    val projects: List<Project>,
    val providers: List<Provider>,
    val modelProfiles: List<ModelProfile>,
    val settings: ServerSettings,
    val activeRuns: List<Run>,
    val pendingApprovals: List<Approval>,
    val plugins: List<Plugin>,
    /**
     * 插件世代号。每次插件启用/禁用/重载都递增，进入 Koaks Agent 的缓存 key，但**不会**导致
     * 重建 Agent —— 转发用的 Hook 与 LazyToolSource 是稳定实例，只是查表结果变了。
     */
    val pluginGeneration: Long,
    val lastEventSequence: Long
) {
    init {
        requireNonNegative(pluginGeneration, "bootstrap.pluginGeneration")
        requireNonNegative(lastEventSequence, "bootstrap.lastEventSequence")
    }
}
