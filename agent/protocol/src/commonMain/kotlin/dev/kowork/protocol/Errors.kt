package dev.kowork.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/**
 * KAP 错误码。
 *
 * 客户端只允许对这张表里的码做行为分支；`message` 仅用于展示，不得参与逻辑判断。
 * 新增错误码属于向后兼容变更，客户端遇到未知码必须按 [INTERNAL_ERROR] 兜底处理。
 */
@Serializable
enum class KapErrorCode {
    // —— 握手与鉴权 ——
    @SerialName("unsupported_protocol_version")
    UNSUPPORTED_PROTOCOL_VERSION,

    @SerialName("handshake_required")
    HANDSHAKE_REQUIRED,

    @SerialName("handshake_already_completed")
    HANDSHAKE_ALREADY_COMPLETED,

    @SerialName("unauthenticated")
    UNAUTHENTICATED,

    @SerialName("invalid_token")
    INVALID_TOKEN,

    // —— 请求层 ——
    @SerialName("unknown_method")
    UNKNOWN_METHOD,

    @SerialName("method_not_implemented")
    METHOD_NOT_IMPLEMENTED,

    @SerialName("invalid_params")
    INVALID_PARAMS,

    @SerialName("invalid_response")
    INVALID_RESPONSE,

    @SerialName("request_cancelled")
    REQUEST_CANCELLED,

    @SerialName("payload_too_large")
    PAYLOAD_TOO_LARGE,

    @SerialName("rate_limited")
    RATE_LIMITED,

    // —— 领域：项目与会话 ——
    @SerialName("project_not_found")
    PROJECT_NOT_FOUND,

    @SerialName("project_archived")
    PROJECT_ARCHIVED,

    @SerialName("thread_not_found")
    THREAD_NOT_FOUND,

    @SerialName("thread_archived")
    THREAD_ARCHIVED,

    // —— 领域：运行与队列 ——
    @SerialName("run_not_found")
    RUN_NOT_FOUND,

    @SerialName("run_not_active")
    RUN_NOT_ACTIVE,

    @SerialName("request_not_found")
    REQUEST_NOT_FOUND,

    @SerialName("request_not_queued")
    REQUEST_NOT_QUEUED,

    // —— 领域：审批 ——
    @SerialName("approval_not_found")
    APPROVAL_NOT_FOUND,

    @SerialName("approval_not_pending")
    APPROVAL_NOT_PENDING,

    // —— 领域：供应商与模型 ——
    @SerialName("provider_not_found")
    PROVIDER_NOT_FOUND,

    @SerialName("provider_builtin_immutable")
    PROVIDER_BUILTIN_IMMUTABLE,

    @SerialName("model_profile_not_found")
    MODEL_PROFILE_NOT_FOUND,

    @SerialName("no_model_available")
    NO_MODEL_AVAILABLE,

    @SerialName("credential_missing")
    CREDENTIAL_MISSING,

    @SerialName("model_discovery_failed")
    MODEL_DISCOVERY_FAILED,

    // —— 工作区与路径 ——
    @SerialName("path_outside_project")
    PATH_OUTSIDE_PROJECT,

    @SerialName("path_not_found")
    PATH_NOT_FOUND,

    @SerialName("path_forbidden")
    PATH_FORBIDDEN,

    @SerialName("not_a_directory")
    NOT_A_DIRECTORY,

    @SerialName("not_a_file")
    NOT_A_FILE,

    @SerialName("file_too_large")
    FILE_TOO_LARGE,

    @SerialName("binary_file")
    BINARY_FILE,

    @SerialName("not_a_git_repository")
    NOT_A_GIT_REPOSITORY,

    // —— 权限与工具 ——
    @SerialName("permission_denied")
    PERMISSION_DENIED,

    @SerialName("approval_denied")
    APPROVAL_DENIED,

    @SerialName("tool_timeout")
    TOOL_TIMEOUT,

    @SerialName("tool_not_found")
    TOOL_NOT_FOUND,

    // —— 插件（阶段 5 预留） ——
    @SerialName("plugin_not_found")
    PLUGIN_NOT_FOUND,

    @SerialName("plugin_disabled")
    PLUGIN_DISABLED,

    @SerialName("plugin_load_failed")
    PLUGIN_LOAD_FAILED,

    @SerialName("plugin_host_unavailable")
    PLUGIN_HOST_UNAVAILABLE,

    // —— 服务端 ——
    @SerialName("server_shutting_down")
    SERVER_SHUTTING_DOWN,

    @SerialName("unavailable")
    UNAVAILABLE,

    @SerialName("internal_error")
    INTERNAL_ERROR
}

@Serializable
data class KapError(
    val code: KapErrorCode,
    val message: String,
    /** 结构化补充信息，仅用于日志与诊断展示。 */
    val details: Map<String, JsonElement>? = null
)
