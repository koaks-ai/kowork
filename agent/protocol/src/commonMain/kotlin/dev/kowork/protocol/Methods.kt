package dev.kowork.protocol

import kotlinx.serialization.KSerializer
import kotlinx.serialization.builtins.ListSerializer
import kotlinx.serialization.serializer

/**
 * KAP v1 方法表 —— 协议的真源。
 *
 * 相对旧 `rpcSchemas` 的变化：
 * - 新增 [SERVER_INFO]（核心）以及一批由能力位门控的方法（`fs.browse` / `files.upload` /
 *   `plugins.*` / `auth.rotateKey`）
 * - [PROVIDERS_CREATE] 现在承载 `apiKey`。旧架构刻意让密钥绕开 Core RPC 走独立 Electron 通道；
 *   现在 Agent 在 server 上跑，密钥必须上行到 server
 * - [PROJECTS_ADD] 的 `rootPath` 是 server 侧路径，配合 [FS_BROWSE] 使用
 * - `settings` 只承载 ServerSettings，主题等设备级偏好不进协议
 * - 移除了 `settings.update` 的 partial patch 语义，改为 [SETTINGS_REPLACE] 整体替换
 */
public enum class KapMethod(
    /** 线上方法名。 */
    public val methodName: String,
    /**
     * `null` 表示这是核心方法，任何 KAP v1 server 都必须实现。
     * 有值表示由能力位门控：客户端必须先检查 `ServerInfo.capabilities` 再暴露入口，
     * server 未实现时应回 `method_not_implemented`。
     */
    public val capability: ServerCapability?,
    /** 是否改变 server 状态。用于客户端的乐观更新策略与后续的审计日志。 */
    public val mutating: Boolean
) {
    // —— 服务器自述 ——
    SERVER_INFO("server.info", null, false),
    AUTH_ROTATE_KEY("auth.rotateKey", ServerCapability.AUTH_ROTATE_KEY, true),

    // —— 启动快照 ——
    APP_BOOTSTRAP("app.bootstrap", null, false),

    // —— 项目 ——
    PROJECTS_LIST("projects.list", null, false),
    PROJECTS_ADD("projects.add", null, true),
    PROJECTS_ARCHIVE("projects.archive", null, true),
    PROJECTS_RESTORE("projects.restore", null, true),

    // —— 会话 ——
    THREADS_LIST("threads.list", null, false),
    THREADS_CREATE("threads.create", null, true),
    THREADS_UPDATE("threads.update", null, true),
    THREADS_ARCHIVE("threads.archive", null, true),
    THREADS_RESTORE("threads.restore", null, true),

    // —— 运行与队列 ——
    RUNS_ENQUEUE("runs.enqueue", null, true),
    RUNS_CANCEL("runs.cancel", null, true),
    RUNS_RESUME_QUEUE("runs.resumeQueue", null, true),
    RUNS_REMOVE_QUEUED("runs.removeQueued", null, true),
    RUNS_LIST("runs.list", null, false),
    RUNS_QUEUE("runs.queue", null, false),

    // —— 事件历史 ——
    EVENTS_LIST("events.list", null, false),

    // —— 审批 ——
    APPROVALS_LIST("approvals.list", null, false),
    APPROVALS_RESPOND("approvals.respond", null, true),

    // —— 供应商与模型 ——
    PROVIDERS_LIST("providers.list", null, false),
    PROVIDERS_CREATE("providers.create", null, true),
    PROVIDERS_UPDATE("providers.update", null, true),
    PROVIDERS_SET_CREDENTIAL("providers.setCredential", null, true),
    PROVIDERS_ARCHIVE("providers.archive", null, true),
    PROVIDERS_REFRESH_MODELS("providers.refreshModels", null, true),
    MODELS_ADD("models.add", null, true),
    MODELS_ARCHIVE("models.archive", null, true),

    // —— 设置（仅 ServerSettings，整体替换语义） ——
    SETTINGS_GET("settings.get", null, false),
    SETTINGS_REPLACE("settings.replace", null, true),

    // —— 工作区 ——
    FILES_LIST("files.list", null, false),
    FILES_READ("files.read", null, false),
    FILES_UPLOAD("files.upload", ServerCapability.FILES_UPLOAD, true),
    FS_BROWSE("fs.browse", ServerCapability.FS_BROWSE, false),

    // —— Git（只读） ——
    GIT_STATUS("git.status", null, false),
    GIT_SUMMARY("git.summary", null, false),
    GIT_DIFF("git.diff", null, false),

    // —— 插件（阶段 5） ——
    PLUGINS_LIST("plugins.list", ServerCapability.PLUGINS, false),
    PLUGINS_INSTALL("plugins.install", ServerCapability.PLUGINS, true),
    PLUGINS_UNINSTALL("plugins.uninstall", ServerCapability.PLUGINS, true),
    PLUGINS_SET_ENABLED("plugins.setEnabled", ServerCapability.PLUGINS, true),
    PLUGINS_RELOAD("plugins.reload", ServerCapability.PLUGINS, true);

    /** 客户端在暴露入口前的功能探测。 */
    public fun isAvailable(capabilities: Collection<ServerCapability>): Boolean =
        capability == null || capability in capabilities

    public companion object {
        private val byName: Map<String, KapMethod> = entries.associateBy { it.methodName }

        public fun fromName(name: String): KapMethod? = byName[name]
    }
}

/**
 * 入参的反序列化器。
 *
 * 用穷举 `when` 而不是注册表：新增方法时编译器会强制补上这里的分支，不会出现「加了方法忘了
 * 接线」的情况。
 */
public fun KapMethod.paramsSerializer(): KSerializer<*> = when (this) {
    KapMethod.SERVER_INFO,
    KapMethod.AUTH_ROTATE_KEY,
    KapMethod.APP_BOOTSTRAP,
    KapMethod.PROVIDERS_LIST,
    KapMethod.SETTINGS_GET,
    KapMethod.PLUGINS_LIST -> serializer<EmptyParams>()

    KapMethod.PROJECTS_LIST -> serializer<ProjectsListParams>()
    KapMethod.PROJECTS_ADD -> serializer<ProjectsAddParams>()
    KapMethod.PROJECTS_ARCHIVE,
    KapMethod.PROJECTS_RESTORE,
    KapMethod.GIT_STATUS,
    KapMethod.GIT_SUMMARY -> serializer<ProjectIdParams>()

    KapMethod.THREADS_LIST -> serializer<ThreadsListParams>()
    KapMethod.THREADS_CREATE -> serializer<ThreadsCreateParams>()
    KapMethod.THREADS_UPDATE -> serializer<ThreadsUpdateParams>()
    KapMethod.THREADS_ARCHIVE,
    KapMethod.THREADS_RESTORE,
    KapMethod.RUNS_RESUME_QUEUE,
    KapMethod.RUNS_LIST,
    KapMethod.RUNS_QUEUE -> serializer<ThreadIdParams>()

    KapMethod.RUNS_ENQUEUE -> serializer<RunsEnqueueParams>()
    KapMethod.RUNS_CANCEL -> serializer<RunIdParams>()
    KapMethod.RUNS_REMOVE_QUEUED -> serializer<RequestIdParams>()

    KapMethod.EVENTS_LIST -> serializer<EventsListParams>()

    KapMethod.APPROVALS_LIST -> serializer<ApprovalsListParams>()
    KapMethod.APPROVALS_RESPOND -> serializer<ApprovalsRespondParams>()

    KapMethod.PROVIDERS_CREATE -> serializer<ProviderCreateParams>()
    KapMethod.PROVIDERS_UPDATE -> serializer<ProviderUpdateParams>()
    KapMethod.PROVIDERS_SET_CREDENTIAL -> serializer<ProviderSetCredentialParams>()
    KapMethod.PROVIDERS_ARCHIVE,
    KapMethod.PROVIDERS_REFRESH_MODELS -> serializer<ProviderIdParams>()
    KapMethod.MODELS_ADD -> serializer<ModelsAddParams>()
    KapMethod.MODELS_ARCHIVE -> serializer<ModelProfileIdParams>()

    KapMethod.SETTINGS_REPLACE -> serializer<ServerSettings>()

    KapMethod.FILES_LIST -> serializer<FilesListParams>()
    KapMethod.FILES_READ -> serializer<FilesReadParams>()
    KapMethod.FILES_UPLOAD -> serializer<FilesUploadParams>()
    KapMethod.FS_BROWSE -> serializer<FsBrowseParams>()
    KapMethod.GIT_DIFF -> serializer<GitDiffParams>()

    KapMethod.PLUGINS_INSTALL -> serializer<PluginsInstallParams>()
    KapMethod.PLUGINS_UNINSTALL -> serializer<PluginIdParams>()
    KapMethod.PLUGINS_SET_ENABLED -> serializer<PluginsSetEnabledParams>()
    KapMethod.PLUGINS_RELOAD -> serializer<PluginsReloadParams>()
}

/** 出参的序列化器。同样用穷举 `when`。 */
public fun KapMethod.resultSerializer(): KSerializer<*> = when (this) {
    KapMethod.SERVER_INFO -> serializer<ServerInfo>()
    KapMethod.AUTH_ROTATE_KEY -> serializer<RotateKeyResult>()
    KapMethod.APP_BOOTSTRAP -> serializer<Bootstrap>()

    KapMethod.PROJECTS_LIST -> ListSerializer(serializer<Project>())
    KapMethod.PROJECTS_ADD,
    KapMethod.PROJECTS_ARCHIVE,
    KapMethod.PROJECTS_RESTORE -> serializer<Project>()

    KapMethod.THREADS_LIST -> ListSerializer(serializer<Thread>())
    KapMethod.THREADS_CREATE,
    KapMethod.THREADS_UPDATE,
    KapMethod.THREADS_ARCHIVE,
    KapMethod.THREADS_RESTORE,
    KapMethod.RUNS_RESUME_QUEUE -> serializer<Thread>()

    KapMethod.RUNS_ENQUEUE,
    KapMethod.RUNS_REMOVE_QUEUED -> serializer<QueuedRequest>()
    KapMethod.RUNS_CANCEL -> serializer<Run>()
    KapMethod.RUNS_LIST -> ListSerializer(serializer<Run>())
    KapMethod.RUNS_QUEUE -> ListSerializer(serializer<QueuedRequest>())

    KapMethod.EVENTS_LIST -> serializer<EventsPage>()

    KapMethod.APPROVALS_LIST -> ListSerializer(serializer<Approval>())
    KapMethod.APPROVALS_RESPOND -> serializer<Approval>()

    KapMethod.PROVIDERS_LIST -> ListSerializer(serializer<Provider>())
    KapMethod.PROVIDERS_CREATE,
    KapMethod.PROVIDERS_UPDATE,
    KapMethod.PROVIDERS_SET_CREDENTIAL,
    KapMethod.PROVIDERS_ARCHIVE -> serializer<Provider>()
    KapMethod.PROVIDERS_REFRESH_MODELS -> serializer<ModelRefreshResult>()
    KapMethod.MODELS_ADD,
    KapMethod.MODELS_ARCHIVE -> serializer<ModelProfile>()

    KapMethod.SETTINGS_GET,
    KapMethod.SETTINGS_REPLACE -> serializer<ServerSettings>()

    KapMethod.FILES_LIST -> ListSerializer(serializer<FileEntry>())
    KapMethod.FILES_READ -> serializer<FileContent>()
    KapMethod.FILES_UPLOAD -> serializer<FileUploadResult>()
    KapMethod.FS_BROWSE -> serializer<BrowseResult>()

    KapMethod.GIT_STATUS -> ListSerializer(serializer<GitChange>())
    KapMethod.GIT_SUMMARY -> serializer<GitSummary>()
    KapMethod.GIT_DIFF -> serializer<GitDiff>()

    KapMethod.PLUGINS_LIST,
    KapMethod.PLUGINS_RELOAD -> ListSerializer(serializer<Plugin>())
    KapMethod.PLUGINS_INSTALL,
    KapMethod.PLUGINS_SET_ENABLED -> serializer<Plugin>()
    KapMethod.PLUGINS_UNINSTALL -> serializer<EmptyParams>()
}
