package dev.kowork.workspace

import kotlin.random.Random
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath
import okio.buffer
import okio.use

const val MAX_TEXT_FILE_BYTES: Long = 2L * 1024L * 1024L

data class TextFile(
    val path: Path,
    val content: String,
    val byteCount: Long,
)

data class WriteFileResult(
    val path: Path,
    val byteCount: Long,
)

/** 仅提供工具层 read_file/write_file 所需的直接文本文件读写。 */
class FileSystemPort(
    private val scope: WorkspaceScope,
    private val fileSystem: FileSystem = FileSystem.SYSTEM,
) {
    fun readText(path: Path): TextFile {
        val resolved = scope.resolveRead(path)
        val metadata = fileSystem.metadata(resolved)
        if (!metadata.isRegularFile) {
            throw WorkspaceException(WorkspaceErrorCode.PATH_NOT_FILE, "读取路径不是普通文件：$resolved")
        }
        if ((metadata.size ?: Long.MAX_VALUE) > MAX_TEXT_FILE_BYTES) {
            throw WorkspaceException(
                WorkspaceErrorCode.FILE_TOO_LARGE,
                "读取文件超过 2 MiB：$resolved",
            )
        }

        val bytes = fileSystem.read(resolved) { readByteString() }.toByteArray()
        if (bytes.size.toLong() > MAX_TEXT_FILE_BYTES) {
            throw WorkspaceException(
                WorkspaceErrorCode.FILE_TOO_LARGE,
                "读取文件超过 2 MiB：$resolved",
            )
        }
        if (bytes.any { it == 0.toByte() }) {
            throw WorkspaceException(WorkspaceErrorCode.BINARY_FILE, "读取文件包含 NUL 字节：$resolved")
        }

        val decoded = bytes.decodeToString()
        if (!decoded.encodeToByteArray().contentEquals(bytes)) {
            throw WorkspaceException(WorkspaceErrorCode.INVALID_UTF8, "读取文件不是有效 UTF-8：$resolved")
        }
        val content = decoded.removePrefix(UTF8_BOM)
        return TextFile(resolved, content, bytes.size.toLong())
    }

    fun readText(path: String): TextFile = readText(path.toPath())

    fun writeTextAtomically(path: Path, content: String): WriteFileResult {
        val resolved = scope.resolveWrite(path)
        val encodedContent = content.encodeToByteArray()
        if (encodedContent.size.toLong() > MAX_TEXT_FILE_BYTES) {
            throw WorkspaceException(
                WorkspaceErrorCode.FILE_TOO_LARGE,
                "写入内容超过 2 MiB：$resolved",
            )
        }
        if (content.contains('\u0000')) {
            throw WorkspaceException(WorkspaceErrorCode.BINARY_FILE, "写入内容包含 NUL 字节：$resolved")
        }
        val parent = resolved.parent ?: throw WorkspaceException(
            WorkspaceErrorCode.WRITE_PARENT_INVALID,
            "写入路径没有父目录：$resolved",
        )
        fileSystem.createDirectories(parent)

        val existingPermissions = if (fileSystem.exists(resolved)) {
            val metadata = fileSystem.metadata(resolved)
            if (!metadata.isRegularFile) {
                throw WorkspaceException(WorkspaceErrorCode.PATH_NOT_FILE, "写入目标不是普通文件：$resolved")
            }
            readFilePermissions(resolved)
        } else {
            null
        }

        val temporary = temporaryPath(parent, resolved.name)
        try {
            fileSystem.sink(temporary, mustCreate = true).buffer().use { sink -> sink.writeUtf8(content) }
            existingPermissions?.let { writeFilePermissions(temporary, it) }
            fileSystem.atomicMove(temporary, resolved)
        } catch (cause: Throwable) {
            try {
                fileSystem.delete(temporary, mustExist = false)
            } catch (cleanupCause: Throwable) {
                cause.addSuppressed(cleanupCause)
            }
            throw WorkspaceException(
                WorkspaceErrorCode.WRITE_PARENT_INVALID,
                "原子写入失败：$resolved",
                cause,
            )
        }
        return WriteFileResult(resolved, encodedContent.size.toLong())
    }

    fun writeTextAtomically(path: String, content: String): WriteFileResult =
        writeTextAtomically(path.toPath(), content)

    private fun temporaryPath(parent: Path, targetName: String): Path {
        repeat(MAX_TEMPORARY_PATH_ATTEMPTS) {
            val suffix = Random.nextLong().toString(16).removePrefix("-")
            val candidate = parent / ".${targetName}.kowork-$suffix.tmp"
            if (!fileSystem.exists(candidate)) return candidate
        }
        throw WorkspaceException(
            WorkspaceErrorCode.WRITE_PARENT_INVALID,
            "无法为原子写入分配临时文件：$parent",
        )
    }

    private companion object {
        const val UTF8_BOM = "\uFEFF"
        const val MAX_TEMPORARY_PATH_ATTEMPTS = 16
    }
}
