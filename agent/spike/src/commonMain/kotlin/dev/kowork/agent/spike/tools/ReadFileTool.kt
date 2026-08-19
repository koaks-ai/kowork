package dev.kowork.agent.spike.tools

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.serializer
import okio.FileSystem
import okio.Path
import okio.Path.Companion.toPath
import org.koaks.framework.tool.Tool

@Serializable
data class ReadFileInput(
    val path: String,
    val offset: Int = 1,
    val limit: Int = 400,
) {
    init {
        require(path.isNotBlank()) { "read_file.path must not be blank" }
        require(!path.toPath().isAbsolute) { "read_file.path must be relative" }
        require(offset >= 1) { "read_file.offset must be at least 1" }
        require(limit in 1..2_000) { "read_file.limit must be between 1 and 2000" }
    }
}

@Serializable
private data class ReadFileOutput(
    val path: String,
    val content: String,
    val startLine: Int?,
    val endLine: Int?,
    val totalLines: Int,
    val truncated: Boolean,
)

class ReadFileTool(
    private val projectRoot: Path,
    private val fileSystem: FileSystem = FileSystem.SYSTEM,
) : Tool<ReadFileInput> {
    override val name: String = "read_file"
    override val description: String =
        "Read a UTF-8 text file with one-based line numbers. Binary files and files over 2 MiB are rejected."
    override val inputSerializer = serializer<ReadFileInput>()

    private val canonicalRoot: Path = fileSystem.canonicalize(projectRoot)

    override suspend fun execute(input: ReadFileInput): String {
        val path = resolveInsideProject(input.path)
        val metadata = fileSystem.metadata(path)
        require(metadata.isRegularFile) { "'$path' is not a file" }
        require(metadata.size?.let { it <= MAX_FILE_BYTES } == true) { "'$path' is larger than 2 MiB" }

        val bytes = fileSystem.read(path) { readByteString() }
        require(bytes.indexOf(byteArrayOf(0)) < 0) { "'$path' is a binary file" }
        val text = bytes.utf8()
        require(text.encodeToByteArray().contentEquals(bytes.toByteArray())) { "'$path' is not valid UTF-8 text" }
        val lines = if (text.isEmpty()) {
            mutableListOf()
        } else {
            text.split(Regex("\\r?\\n")).toMutableList().also {
                if (text.endsWith('\n')) it.removeLastOrNull()
            }
        }
        val startIndex = minOf(input.offset - 1, lines.size)
        val selected = lines.drop(startIndex).take(input.limit)
        val result = ReadFileOutput(
            path = input.path,
            content = selected.mapIndexed { index, line -> "${startIndex + index + 1}\t$line" }.joinToString("\n"),
            startLine = selected.indices.firstOrNull()?.let { startIndex + it + 1 },
            endLine = selected.indices.lastOrNull()?.let { startIndex + it + 1 },
            totalLines = lines.size,
            truncated = startIndex + selected.size < lines.size,
        )
        return Json.encodeToString(ReadFileOutput.serializer(), result)
    }

    private fun resolveInsideProject(requested: String): Path {
        val requestedPath = requested.toPath()
        require(!requestedPath.isAbsolute) { "read_file.path must be relative" }
        val candidate = (canonicalRoot / requestedPath).normalized()
        val canonical = fileSystem.canonicalize(candidate)
        val relative = canonical.relativeTo(canonicalRoot)
        require(relative.segments.firstOrNull() != "..") {
            "'$requested' resolves outside the project"
        }
        return canonical
    }

    private companion object {
        const val MAX_FILE_BYTES: Long = 2L * 1024L * 1024L
    }
}
