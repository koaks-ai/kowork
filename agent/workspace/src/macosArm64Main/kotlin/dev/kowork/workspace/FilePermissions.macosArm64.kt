package dev.kowork.workspace

import kotlinx.cinterop.ExperimentalForeignApi
import kotlinx.cinterop.alloc
import kotlinx.cinterop.memScoped
import kotlinx.cinterop.ptr
import okio.Path
import platform.posix.chmod
import platform.posix.stat

@OptIn(ExperimentalForeignApi::class)
internal actual fun readFilePermissions(path: Path): Int? = memScoped {
    val metadata = alloc<stat>()
    if (platform.posix.stat(path.toString(), metadata.ptr) != 0) return@memScoped null
    metadata.st_mode.toInt() and 0b111_111_111
}

@OptIn(ExperimentalForeignApi::class)
internal actual fun writeFilePermissions(path: Path, permissions: Int) {
    if (chmod(path.toString(), permissions.toUShort()) != 0) {
        throw WorkspaceException(
            WorkspaceErrorCode.WRITE_PARENT_INVALID,
            "无法保留文件权限：$path",
        )
    }
}
