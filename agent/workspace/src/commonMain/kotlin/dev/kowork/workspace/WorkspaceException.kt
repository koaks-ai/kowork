package dev.kowork.workspace

/** workspace 层向上层暴露的明确失败类型。 */
class WorkspaceException(
    val code: WorkspaceErrorCode,
    message: String,
    cause: Throwable? = null,
) : IllegalStateException(message, cause)

enum class WorkspaceErrorCode {
    INVALID_PATH,
    PATH_OUTSIDE_SCOPE,
    PATH_NOT_FOUND,
    PATH_NOT_FILE,
    PATH_NOT_DIRECTORY,
    FILE_TOO_LARGE,
    BINARY_FILE,
    INVALID_UTF8,
    WRITE_PARENT_INVALID,
    PROCESS_LAUNCHER_UNAVAILABLE,
    PROCESS_TIMEOUT,
    PROCESS_GROUP_TERMINATION_FAILED,
    GIT_OUTPUT_TOO_LARGE,
    GIT_OPERATION_FAILED,
}
