package dev.kowork.workspace

import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import okio.Path

const val MAX_GIT_OUTPUT_CHARS = 512_000

enum class GitDiffMode {
    UNSTAGED,
    STAGED,
    HEAD,
}

data class GitChange(
    val path: String,
    val indexStatus: Char,
    val worktreeStatus: Char,
    val originalPath: String? = null,
)

data class GitSummary(
    val branch: String?,
    val additions: Int,
    val deletions: Int,
)

data class GitDiff(
    val path: String?,
    val diff: String,
    val mode: GitDiffMode,
    val truncated: Boolean,
    val originalChars: Int,
)

/** 只读 Git 端口；所有 Git 操作只能通过注入的 [ProcessPort]。 */
class GitPort(
    private val processPort: ProcessPort,
    private val root: Path,
) {
    suspend fun status(timeout: Duration = DEFAULT_TIMEOUT): List<GitChange> {
        val result = git(listOf("status", "--porcelain=v1", "-z"), timeout)
        if (result.exitCode != 0) return if (result.isNotGitRepository()) emptyList() else result.gitFailure("读取 Git 状态")
        if (result.truncated) {
            throw WorkspaceException(
                WorkspaceErrorCode.GIT_OUTPUT_TOO_LARGE,
                "Git status 输出超过 ${MAX_GIT_OUTPUT_CHARS} 字符",
            )
        }
        return parseStatus(result.stdout)
    }

    suspend fun summary(timeout: Duration = DEFAULT_TIMEOUT): GitSummary {
        val branchResult = git(listOf("branch", "--show-current"), timeout)
        if (branchResult.exitCode != 0) {
            return if (branchResult.isNotGitRepository()) {
                GitSummary(branch = null, additions = 0, deletions = 0)
            } else {
                branchResult.gitFailure("读取 Git 分支")
            }
        }

        val numstat = git(listOf("diff", "--numstat", "HEAD", "--"), timeout)
        val output = when {
            numstat.exitCode == 0 -> {
                requireGitOutputComplete(numstat)
                numstat.stdout
            }
            numstat.isNoHead() -> {
                val staged = git(listOf("diff", "--numstat", "--cached", "--"), timeout)
                val unstaged = git(listOf("diff", "--numstat", "--"), timeout)
                if (staged.exitCode != 0) staged.gitFailure("读取暂存 Git 摘要")
                if (unstaged.exitCode != 0) unstaged.gitFailure("读取未暂存 Git 摘要")
                requireGitOutputComplete(staged)
                requireGitOutputComplete(unstaged)
                compactGitOutput(joinGitOutput(staged.stdout, unstaged.stdout)).text
            }
            else -> numstat.gitFailure("读取 Git 摘要")
        }
        val summary = summarizeNumstat(output)
        return GitSummary(
            branch = branchResult.stdout.trim().ifEmpty { null },
            additions = summary.additions,
            deletions = summary.deletions,
        )
    }

    suspend fun diff(
        path: String? = null,
        mode: GitDiffMode = GitDiffMode.UNSTAGED,
        timeout: Duration = DEFAULT_TIMEOUT,
    ): GitDiff {
        val arguments = buildList {
            add("diff")
            add("--no-ext-diff")
            when (mode) {
                GitDiffMode.UNSTAGED -> Unit
                GitDiffMode.STAGED -> add("--cached")
                GitDiffMode.HEAD -> add("HEAD")
            }
            if (path != null) {
                add("--")
                add(path)
            }
        }
        val result = git(arguments, timeout)
        if (result.exitCode == 0) return result.toGitDiff(path, mode)
        if (result.isNotGitRepository()) return GitDiff(path, "", mode, truncated = false, originalChars = 0)
        if (mode == GitDiffMode.HEAD && result.isNoHead()) {
            val staged = diff(path, GitDiffMode.STAGED, timeout)
            val unstaged = diff(path, GitDiffMode.UNSTAGED, timeout)
            val combined = compactGitOutput(joinGitOutput(staged.diff, unstaged.diff))
            return GitDiff(
                path = path,
                diff = combined.text,
                mode = mode,
                truncated = staged.truncated || unstaged.truncated || combined.truncated,
                originalChars = staged.originalChars + unstaged.originalChars,
            )
        }
        return result.gitFailure("读取 Git diff")
    }

    private suspend fun git(arguments: List<String>, timeout: Duration): ProcessResult {
        return processPort.run(
            ProcessRequest(
                executable = "git",
                arguments = listOf("-C", root.toString()) + arguments,
                cwd = root,
                timeout = timeout,
                maxFinalOutputChars = MAX_GIT_OUTPUT_CHARS,
                maxProgressChars = MAX_GIT_OUTPUT_CHARS,
            ),
        )
    }

    private fun parseStatus(output: String): List<GitChange> {
        val records = output.split('\u0000').filter { it.isNotEmpty() }
        val changes = mutableListOf<GitChange>()
        var index = 0
        while (index < records.size) {
            val record = records[index]
            if (record.length < 3) {
                throw WorkspaceException(
                    WorkspaceErrorCode.GIT_OPERATION_FAILED,
                    "Git status 返回了无效记录：$record",
                )
            }
            val indexStatus = record[0]
            val worktreeStatus = record[1]
            val renamedOrCopied = indexStatus in RENAME_OR_COPY || worktreeStatus in RENAME_OR_COPY
            val originalPath = if (renamedOrCopied) records.getOrNull(index + 1) else null
            if (renamedOrCopied && originalPath == null) {
                throw WorkspaceException(
                    WorkspaceErrorCode.GIT_OPERATION_FAILED,
                    "Git status 的重命名或复制记录缺少原路径",
                )
            }
            changes += GitChange(
                path = record.drop(3),
                indexStatus = indexStatus,
                worktreeStatus = worktreeStatus,
                originalPath = originalPath,
            )
            index += if (renamedOrCopied) 2 else 1
        }
        return changes
    }

    private fun summarizeNumstat(output: String): NumstatSummary {
        var additions = 0
        var deletions = 0
        output.lineSequence().forEach { line ->
            val fields = line.split('\t', limit = 3)
            fields.getOrNull(0)?.toIntOrNull()?.let { additions += it }
            fields.getOrNull(1)?.toIntOrNull()?.let { deletions += it }
        }
        return NumstatSummary(additions, deletions)
    }

    private companion object {
        val DEFAULT_TIMEOUT: Duration = 30.seconds
        val RENAME_OR_COPY = setOf('R', 'C')
    }
}

private fun requireGitOutputComplete(result: ProcessResult) {
    if (result.truncated) {
        throw WorkspaceException(
            WorkspaceErrorCode.GIT_OUTPUT_TOO_LARGE,
            "Git 摘要输出超过 ${MAX_GIT_OUTPUT_CHARS} 字符",
        )
    }
}

private data class NumstatSummary(
    val additions: Int,
    val deletions: Int,
)

private data class CompactedGitOutput(
    val text: String,
    val truncated: Boolean,
)

private fun compactGitOutput(output: String): CompactedGitOutput {
    if (output.length <= MAX_GIT_OUTPUT_CHARS) return CompactedGitOutput(output, truncated = false)
    val marker = "\n\n[... git 输出已截断 ...]\n\n"
    val headLength = 128_000
    val tailLength = MAX_GIT_OUTPUT_CHARS - marker.length - headLength
    return CompactedGitOutput(
        text = output.take(headLength) + marker + output.takeLast(tailLength),
        truncated = true,
    )
}

private fun joinGitOutput(first: String, second: String): String =
    if (first.isEmpty() || second.isEmpty()) first + second else "$first\n$second"

private fun ProcessResult.isNotGitRepository(): Boolean =
    (stdout + stderr).contains("not a git repository", ignoreCase = true)

private fun ProcessResult.isNoHead(): Boolean {
    val message = stdout + stderr
    return message.contains("ambiguous argument", ignoreCase = true) ||
        message.contains("bad revision", ignoreCase = true) ||
        message.contains("unknown revision", ignoreCase = true)
}

private fun ProcessResult.gitFailure(operation: String): Nothing {
    val details = listOf(stdout, stderr).filter { it.isNotBlank() }.joinToString("\n").trim()
    throw WorkspaceException(
        WorkspaceErrorCode.GIT_OPERATION_FAILED,
        if (details.isEmpty()) "${operation}失败，git 退出码：$exitCode" else "${operation}失败：$details",
    )
}

private fun ProcessResult.toGitDiff(path: String?, mode: GitDiffMode): GitDiff =
    GitDiff(
        path = path,
        diff = stdout,
        mode = mode,
        truncated = truncated,
        originalChars = originalChars,
    )
