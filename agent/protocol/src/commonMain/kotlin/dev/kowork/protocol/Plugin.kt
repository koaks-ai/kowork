package dev.kowork.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 插件（阶段 5 实现，阶段 0 先把协议面钉死）。
 *
 * 现在就定义的原因有两个：
 * 1. 阶段 3b 的数据库 schema 需要 `plugins` / `plugin_state` 两张表，表结构要和这里对齐；
 * 2. 阶段 1 的设计系统需要知道 UI 插件会消费哪些 surface，才能把对应的注册表提前建好。
 *
 * 插件是**双侧**的：`ui` 半跑在 renderer（React + 设计系统原语），`agent` 半跑在紧邻 agent
 * server 的独立插件宿主进程（Node）。两半都可选，一个插件可以只有其中一半。
 */

public object PluginApi {
    /** 插件 API 的大版本。宿主只加载 `apiVersion` 匹配的插件。 */
    public const val VERSION: Int = 1

    /** 插件 id：小写反向域名风格。 */
    public val ID_PATTERN: Regex = Regex("^[a-z0-9]+(?:[.-][a-z0-9]+)*$")

    /** 插件注册的工具名，与内置工具同一套命名规则。 */
    public val TOOL_NAME_PATTERN: Regex = Regex("^[a-z][a-z0-9_]*$")
}

/**
 * UI 扩展点。
 *
 * [INSPECTOR_CARD] 是阶段 5 唯一必须实现的：右侧栏的每一张卡片都是插件。其余是预留，
 * 定义在这里以便插件作者提前知道路线；宿主遇到未实现的 surface 应忽略并记录告警。
 */
@Serializable
enum class PluginSurfaceType {
    @SerialName("inspector.card")
    INSPECTOR_CARD,

    @SerialName("sidebar.section")
    SIDEBAR_SECTION,

    @SerialName("settings.pane")
    SETTINGS_PANE,

    @SerialName("composer.action")
    COMPOSER_ACTION,

    @SerialName("statusbar.item")
    STATUSBAR_ITEM
}

@Serializable
data class PluginSurface(
    val type: PluginSurfaceType,
    /** 插件内唯一；宿主用 `${'$'}{pluginId}:${'$'}{id}` 作为全局键。 */
    val id: String,
    val title: String,
    /** 越小越靠前，同值按插件安装顺序。 */
    val order: Int? = null
) {
    init {
        requireNonBlank(id, "pluginSurface.id")
    }
}

/**
 * Koaks 的四个 hook 点，语义与框架侧一一对应：
 *
 * - [BEFORE_MODEL_REQUEST] 可改写请求（items / instructions / tools / format），**不能短路**
 * - [AFTER_MODEL_REQUEST]  包装模型事件流，可变换/丢弃/改写；**禁止 collect**，只能用惰性算子
 * - [BEFORE_TOOL_CALL]     可改写调用参数，也**可以 deny 短路**，工具将不被执行
 * - [AFTER_TOOL_CALL]      可改写工具结果（如截断输出），不能撤销已执行的工具
 */
@Serializable
enum class PluginHookPoint {
    @SerialName("beforeModelRequest")
    BEFORE_MODEL_REQUEST,

    @SerialName("afterModelRequest")
    AFTER_MODEL_REQUEST,

    @SerialName("beforeToolCall")
    BEFORE_TOOL_CALL,

    @SerialName("afterToolCall")
    AFTER_TOOL_CALL
}

/**
 * 插件权限。安装时向用户展示并需显式确认。
 *
 * UI 插件在 renderer 同 realm 执行（不做 iframe/worker 强隔离），因此权限对它是**告知性**的
 * 而非强制沙箱边界 —— 这是一个明确记录过的取舍，见 docs/decisions/0003。
 * Agent 插件跑在独立进程，权限对它是可强制的。
 */
@Serializable
enum class PluginPermission {
    @SerialName("read:projects")
    READ_PROJECTS,

    @SerialName("read:threads")
    READ_THREADS,

    @SerialName("read:runs")
    READ_RUNS,

    @SerialName("read:events")
    READ_EVENTS,

    @SerialName("read:approvals")
    READ_APPROVALS,

    @SerialName("read:git")
    READ_GIT,

    @SerialName("read:files")
    READ_FILES,

    @SerialName("write:files")
    WRITE_FILES,

    @SerialName("net:fetch")
    NET_FETCH,

    @SerialName("hook:model")
    HOOK_MODEL,

    @SerialName("hook:tool")
    HOOK_TOOL,

    @SerialName("tool:register")
    TOOL_REGISTER
}

@Serializable
data class PluginUiEntry(
    /** 相对插件根目录的 ESM 入口。 */
    val entry: String,
    val surfaces: List<PluginSurface>
) {
    init {
        requireNonBlank(entry, "pluginUi.entry")
    }
}

@Serializable
data class PluginAgentEntry(
    val entry: String,
    val hooks: List<PluginHookPoint>,
    /** 插件注册的工具名，不得与内置工具冲突。 */
    val tools: List<String>
) {
    init {
        requireNonBlank(entry, "pluginAgent.entry")
        tools.forEach { requireMatches(it, PluginApi.TOOL_NAME_PATTERN, "pluginAgent.tools[]") }
    }
}

@Serializable
data class PluginManifest(
    /** 反向域名风格，例如 `com.example.token-usage`。 */
    val id: String,
    val name: String,
    val version: String,
    val apiVersion: Int,
    val description: String? = null,
    val author: String? = null,
    val homepage: String? = null,
    val ui: PluginUiEntry? = null,
    val agent: PluginAgentEntry? = null,
    val permissions: List<PluginPermission>,
    /** BCP-47 语言标签到文案字典的映射。 */
    val locales: Map<String, Map<String, String>>? = null
) {
    init {
        requireMatches(id, PluginApi.ID_PATTERN, "pluginManifest.id")
        requireNonBlank(name, "pluginManifest.name")
        require(name.length <= 80) { "pluginManifest.name 不能超过 80 个字符" }
        requireNonBlank(version, "pluginManifest.version")
        requirePositive(apiVersion, "pluginManifest.apiVersion")
    }
}

@Serializable
enum class PluginStatus {
    @SerialName("enabled")
    ENABLED,

    @SerialName("disabled")
    DISABLED,

    @SerialName("error")
    ERROR
}

@Serializable
data class Plugin(
    val manifest: PluginManifest,
    val status: PluginStatus,
    /** 插件在 server 上的安装目录，便于用户排查。 */
    val installPath: String,
    /** [status] 为 [PluginStatus.ERROR] 时的原因。 */
    val loadError: String?,
    /** Agent 半是否已在插件宿主里成功加载。没有 `agent` 半时恒为 `false`。 */
    val agentLoaded: Boolean,
    val installedAt: Long,
    val updatedAt: Long
) {
    init {
        requireNonNegative(installedAt, "plugin.installedAt")
        requireNonNegative(updatedAt, "plugin.updatedAt")
    }
}
