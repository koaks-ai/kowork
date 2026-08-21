package dev.kowork.workspace

import okio.Path

internal expect fun readFilePermissions(path: Path): Int?

internal expect fun writeFilePermissions(path: Path, permissions: Int)
