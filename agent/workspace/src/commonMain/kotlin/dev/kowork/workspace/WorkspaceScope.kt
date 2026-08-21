package dev.kowork.workspace

import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath

/**
 * 工作区的词法路径策略。
 *
 * 路径只进行绝对化与规范化；不解析符号链接，也不把 cwd 当作隔离边界。
 */
class WorkspaceScope(
    projectRoot: Path,
    externalReadRoots: Set<Path> = emptySet(),
    externalWriteRoots: Set<Path> = emptySet(),
    private val fileSystem: FileSystem = FileSystem.SYSTEM,
) {
    val projectRoot: Path = normalizeAbsolute(projectRoot, "项目根目录")
    private val readRoots: Set<Path> =
        setOf(this.projectRoot) + externalReadRoots.map { normalizeAbsolute(it, "外部读取目录") } +
            externalWriteRoots.map { normalizeAbsolute(it, "外部写入目录") }
    private val writeRoots: Set<Path> =
        setOf(this.projectRoot) + externalWriteRoots.map { normalizeAbsolute(it, "外部写入目录") }

    init {
        val metadata = try {
            fileSystem.metadata(this.projectRoot)
        } catch (cause: Throwable) {
            throw WorkspaceException(
                WorkspaceErrorCode.PATH_NOT_FOUND,
                "项目根目录不存在或无法读取：${this.projectRoot}",
                cause,
            )
        }
        if (!metadata.isDirectory) {
            throw WorkspaceException(
                WorkspaceErrorCode.PATH_NOT_DIRECTORY,
                "项目根目录不是目录：${this.projectRoot}",
            )
        }
    }

    fun resolveRead(requested: Path): Path {
        val resolved = resolve(requested)
        requireContained(resolved, readRoots, "读取")
        if (!fileSystem.exists(resolved)) {
            throw WorkspaceException(WorkspaceErrorCode.PATH_NOT_FOUND, "读取路径不存在：$resolved")
        }
        return resolved
    }

    fun resolveWrite(requested: Path): Path {
        val resolved = resolve(requested)
        requireContained(resolved, writeRoots, "写入")

        if (fileSystem.exists(resolved)) return resolved

        var ancestor: Path? = resolved
        while (ancestor != null && !fileSystem.exists(ancestor)) {
            ancestor = ancestor.parent
        }
        val existingAncestor = ancestor ?: throw WorkspaceException(
            WorkspaceErrorCode.WRITE_PARENT_INVALID,
            "写入路径没有可用的现有祖先：$resolved",
        )
        if (!fileSystem.metadata(existingAncestor).isDirectory) {
            throw WorkspaceException(
                WorkspaceErrorCode.WRITE_PARENT_INVALID,
                "写入路径的最近现有祖先不是目录：$existingAncestor",
            )
        }
        return resolved
    }

    fun resolveRead(requested: String): Path = resolveRead(requested.toPath())

    fun resolveWrite(requested: String): Path = resolveWrite(requested.toPath())

    private fun resolve(requested: Path): Path {
        return if (requested.isAbsolute) requested.normalized() else (projectRoot / requested).normalized()
    }

    private fun normalizeAbsolute(path: Path, description: String): Path {
        if (!path.isAbsolute) {
            throw WorkspaceException(WorkspaceErrorCode.INVALID_PATH, "${description}必须是绝对路径：$path")
        }
        return path.normalized()
    }

    private fun requireContained(path: Path, roots: Set<Path>, operation: String) {
        if (roots.none { root -> path.isWithin(root) }) {
            throw WorkspaceException(
                WorkspaceErrorCode.PATH_OUTSIDE_SCOPE,
                "${operation}路径超出项目与授权根目录：$path",
            )
        }
    }
}

private fun Path.isWithin(root: Path): Boolean {
    if (root.root != this.root || this.segments.size < root.segments.size) return false
    return this.segments.take(root.segments.size) == root.segments
}
