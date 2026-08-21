package dev.kowork.workspace

import java.nio.file.Files
import java.nio.file.attribute.PosixFilePermission
import okio.Path
import kotlin.io.path.Path

internal actual fun readFilePermissions(path: Path): Int? {
    return try {
        Files.getPosixFilePermissions(Path(path.toString())).fold(0) { mode, permission ->
            mode or permission.modeBit
        }
    } catch (_: UnsupportedOperationException) {
        null
    }
}

internal actual fun writeFilePermissions(path: Path, permissions: Int) {
    try {
        Files.setPosixFilePermissions(
            Path(path.toString()),
            PosixFilePermission.entries.filterTo(linkedSetOf()) { permissions and it.modeBit != 0 },
        )
    } catch (_: UnsupportedOperationException) {
        // 不支持 POSIX 权限的文件系统没有可保留的权限位。
    }
}

private val PosixFilePermission.modeBit: Int
    get() = when (this) {
        PosixFilePermission.OWNER_READ -> 0b100_000_000
        PosixFilePermission.OWNER_WRITE -> 0b010_000_000
        PosixFilePermission.OWNER_EXECUTE -> 0b001_000_000
        PosixFilePermission.GROUP_READ -> 0b000_100_000
        PosixFilePermission.GROUP_WRITE -> 0b000_010_000
        PosixFilePermission.GROUP_EXECUTE -> 0b000_001_000
        PosixFilePermission.OTHERS_READ -> 0b000_000_100
        PosixFilePermission.OTHERS_WRITE -> 0b000_000_010
        PosixFilePermission.OTHERS_EXECUTE -> 0b000_000_001
    }
