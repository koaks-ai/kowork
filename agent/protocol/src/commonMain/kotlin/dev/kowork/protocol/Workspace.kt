package dev.kowork.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * 工作区读写。
 *
 * 所有 `relativePath` 都相对项目根，并且由 server 负责规范化：先 canonicalize，再校验 symlink
 * 解析后的真实路径仍在项目内。客户端传什么路径都不能突破这层校验。
 */

@Serializable
enum class FileKind {
    @SerialName("file")
    FILE,

    @SerialName("directory")
    DIRECTORY
}

@Serializable
data class FileEntry(
    val name: String,
    val relativePath: String,
    val kind: FileKind,
    val size: Long,
    val modifiedAt: Long
) {
    init {
        requireNonNegative(size, "fileEntry.size")
        requireNonNegative(modifiedAt, "fileEntry.modifiedAt")
    }
}

@Serializable
data class FileContent(
    val relativePath: String,
    val content: String,
    val size: Long,
    val modifiedAt: Long,
    /** 内容被截断时为 `true`，客户端应提示用户这不是完整文件。 */
    val truncated: Boolean
) {
    init {
        requireNonNegative(size, "fileContent.size")
        requireNonNegative(modifiedAt, "fileContent.modifiedAt")
    }
}

/**
 * 服务端目录浏览的一个条目。
 *
 * `fs.browse` 存在的唯一原因：远程模式下工作目录在服务器上，**不能**再用 Electron 的原生目录
 * 选择对话框来选项目根。客户端必须用这个 RPC 渲染自己的目录选择器。本地模式为了行为一致也走它。
 */
@Serializable
data class BrowseEntry(
    val name: String,
    /** server 侧的绝对路径。 */
    val path: String,
    val kind: FileKind,
    /** 无权限读取时为 `true`，客户端应禁用该项而不是让用户点进去报错。 */
    val inaccessible: Boolean
)

@Serializable
data class BrowseRoot(
    val label: String,
    val path: String
)

@Serializable
data class BrowseResult(
    /** 当前所在目录的绝对路径。 */
    val path: String,
    /** 已在文件系统根时为 `null`。 */
    val parentPath: String?,
    val entries: List<BrowseEntry>,
    /** 可用的起始位置（用户主目录、Windows 盘符等），供客户端渲染快捷入口。 */
    val roots: List<BrowseRoot>,
    /** 该目录是否已是一个 git 仓库，用于在选择器里给出提示。 */
    val isGitRepository: Boolean
)

@Serializable
data class FileUploadResult(
    val relativePath: String,
    val size: Long,
    val modifiedAt: Long
) {
    init {
        requireNonNegative(size, "fileUploadResult.size")
        requireNonNegative(modifiedAt, "fileUploadResult.modifiedAt")
    }
}

@Serializable
data class GitChange(
    val path: String,
    /** git porcelain 的两位状态码，第一位为 index，第二位为 worktree。 */
    val indexStatus: String,
    val worktreeStatus: String
)

@Serializable
data class GitSummary(
    val branch: String?,
    val additions: Long,
    val deletions: Long
) {
    init {
        requireNonNegative(additions, "gitSummary.additions")
        requireNonNegative(deletions, "gitSummary.deletions")
    }
}

@Serializable
data class GitDiff(
    /** `null` 表示整个工作区的 diff。 */
    val path: String?,
    val diff: String,
    val truncated: Boolean
)

public object WorkspaceLimits {
    /**
     * 单帧上传上限。超过此值 server 应回 `payload_too_large`。
     *
     * KAP v1 只支持单帧上传，因为 JSON WebSocket 帧承载 base64 的效率有限。分片上传留到需要时
     * 再加新方法，不改这个方法的语义。
     */
    public const val UPLOAD_MAX_BYTES: Long = 8L * 1024 * 1024
}
