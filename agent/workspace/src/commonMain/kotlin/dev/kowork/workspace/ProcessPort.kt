package dev.kowork.workspace

import io.matthewnelson.kmp.file.File
import io.matthewnelson.kmp.process.OutputFeed
import io.matthewnelson.kmp.process.Process
import io.matthewnelson.kmp.process.Stdio
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.async
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import kotlin.time.Duration
import kotlin.time.Duration.Companion.seconds
import okio.FileSystem
import okio.Path

const val MAX_PROCESS_OUTPUT_CHARS = 64_000
const val MAX_PROCESS_PROGRESS_CHARS = 256_000
val PROCESS_TERMINATION_GRACE: Duration = 2.seconds

enum class ProcessStream {
    STDOUT,
    STDERR,
}

data class ProcessStreamOutput(
    val stream: ProcessStream,
    val text: String,
)

data class ProcessRequest(
    val executable: String,
    val arguments: List<String> = emptyList(),
    val cwd: Path,
    val timeout: Duration,
    val environment: Map<String, String>? = null,
    val maxFinalOutputChars: Int = MAX_PROCESS_OUTPUT_CHARS,
    val maxProgressChars: Int = MAX_PROCESS_PROGRESS_CHARS,
    val onOutput: suspend (ProcessStreamOutput) -> Unit = {},
) {
    init {
        require(executable.isNotBlank()) { "进程可执行文件不能为空" }
        require(timeout.isPositive()) { "进程超时必须大于零" }
        require(maxFinalOutputChars > 0) { "最终输出上限必须大于零" }
        require(maxProgressChars > 0) { "流式输出上限必须大于零" }
    }
}

data class ProcessResult(
    val stdout: String,
    val stderr: String,
    val exitCode: Int,
    val truncated: Boolean,
    val originalChars: Int,
    val progressTruncated: Boolean,
)

/**
 * 子进程执行端口。每个请求都会经由内置启动器创建独立进程组，取消和超时对整个组生效。
 */
class ProcessPort(
    private val processGroupLauncher: Path,
    private val fileSystem: FileSystem = FileSystem.SYSTEM,
    private val environmentProvider: () -> Map<String, String> = { Process.Current.environment() },
) {
    suspend fun run(request: ProcessRequest): ProcessResult = coroutineScope {
        validateRequest(request)
        val environment = sanitizeEnvironment(request.environment ?: environmentProvider())
        val process = spawn(request, environment)
        val chunks = Channel<ProcessStreamOutput>(Channel.UNLIMITED)
        val collector = async {
            collectOutput(chunks, request.maxFinalOutputChars, request.maxProgressChars, request.onOutput)
        }
        var processFinished = false

        try {
            process.stdoutFeed(OutputFeed { line ->
                if (line != null) chunks.trySend(ProcessStreamOutput(ProcessStream.STDOUT, line))
            })
            process.stderrFeed(OutputFeed { line ->
                if (line != null) chunks.trySend(ProcessStreamOutput(ProcessStream.STDERR, line))
            })

            val exitCode = withTimeoutOrNull(request.timeout) { process.waitForAsync() }
            if (exitCode == null) {
                withContext(NonCancellable) { terminateProcessGroup(process) }
                throw WorkspaceException(
                    WorkspaceErrorCode.PROCESS_TIMEOUT,
                    "进程在 ${request.timeout.inWholeMilliseconds} ms 后超时：${request.executable}",
                )
            }
            processFinished = true
            closeProcessAndAwaitOutput(process, chunks)
            val output = collector.await()
            ProcessResult(
                stdout = output.stdout,
                stderr = output.stderr,
                exitCode = exitCode,
                truncated = output.truncated,
                originalChars = output.originalChars,
                progressTruncated = output.progressTruncated,
            )
        } catch (cause: CancellationException) {
            withContext(NonCancellable) { terminateProcessGroup(process) }
            throw cause
        } finally {
            withContext(NonCancellable) {
                if (!processFinished && !process.isAlive) {
                    closeProcessAndAwaitOutput(process, chunks)
                }
                chunks.close()
                if (processFinished || !process.isAlive) collector.await()
            }
        }
    }

    suspend fun bash(
        command: String,
        cwd: Path,
        timeout: Duration,
        environment: Map<String, String>? = null,
        onOutput: suspend (ProcessStreamOutput) -> Unit = {},
    ): ProcessResult {
        return run(
            ProcessRequest(
                executable = BASH_PATH,
                arguments = listOf("-c", command),
                cwd = cwd,
                timeout = timeout,
                environment = environment,
                onOutput = onOutput,
            ),
        )
    }

    private fun validateRequest(request: ProcessRequest) {
        if (!processGroupLauncher.isAbsolute || !fileSystem.exists(processGroupLauncher)) {
            throw WorkspaceException(
                WorkspaceErrorCode.PROCESS_LAUNCHER_UNAVAILABLE,
                "内置进程组启动器不可用：$processGroupLauncher",
            )
        }
        if (!fileSystem.metadata(processGroupLauncher).isRegularFile) {
            throw WorkspaceException(
                WorkspaceErrorCode.PROCESS_LAUNCHER_UNAVAILABLE,
                "内置进程组启动器不是普通文件：$processGroupLauncher",
            )
        }
        if (!request.cwd.isAbsolute || !fileSystem.exists(request.cwd)) {
            throw WorkspaceException(WorkspaceErrorCode.PATH_NOT_FOUND, "进程工作目录不存在：${request.cwd}")
        }
        if (!fileSystem.metadata(request.cwd).isDirectory) {
            throw WorkspaceException(WorkspaceErrorCode.PATH_NOT_DIRECTORY, "进程工作目录不是目录：${request.cwd}")
        }
    }

    @Suppress("DEPRECATION")
    private fun spawn(request: ProcessRequest, environment: Map<String, String>): Process {
        return try {
            Process.Builder(processGroupLauncher.toString())
                .args(request.executable)
                .args(request.arguments)
                .chdir(File(request.cwd.toString()))
                .environment {
                    clear()
                    putAll(environment)
                }
                .stdin(Stdio.Null)
                .stdout(Stdio.Pipe)
                .stderr(Stdio.Pipe)
                .spawn()
        } catch (cause: Throwable) {
            throw WorkspaceException(
                WorkspaceErrorCode.PROCESS_LAUNCHER_UNAVAILABLE,
                "无法启动进程：${request.executable}",
                cause,
            )
        }
    }

    private suspend fun terminateProcessGroup(process: Process) {
        if (!process.isAlive) return
        val processId = process.pid()
        if (processId <= 0) {
            throw WorkspaceException(
                WorkspaceErrorCode.PROCESS_GROUP_TERMINATION_FAILED,
                "无法取得进程组 leader PID：$processId",
            )
        }

        signalProcessGroup(processId, ProcessGroupSignal.TERM)
        delay(PROCESS_TERMINATION_GRACE)
        if (processGroupExists(processId)) {
            signalProcessGroup(processId, ProcessGroupSignal.KILL)
        }
        process.waitForAsync()
    }

    private suspend fun closeProcessAndAwaitOutput(
        process: Process,
        chunks: Channel<ProcessStreamOutput>,
    ) {
        if (process.isAlive) return
        process.destroy()
        process.stdoutWaiter().awaitStopAsync()
        process.stderrWaiter().awaitStopAsync()
        chunks.close()
    }

    private companion object {
        const val BASH_PATH = "/bin/bash"
    }
}

fun sanitizeEnvironment(environment: Map<String, String>): Map<String, String> =
    environment.filterKeys { key -> !SENSITIVE_ENVIRONMENT_KEY.containsMatchIn(key) }

private val SENSITIVE_ENVIRONMENT_KEY =
    Regex(
        "(?:^|_)(?:API_?KEY|ACCESS_?KEY|ACCESS_?TOKEN|TOKEN|SECRET|PASSWORD|PRIVATE_?KEY|CREDENTIALS?)(?:_|$)",
        RegexOption.IGNORE_CASE,
    )

private data class CollectedOutput(
    val stdout: String,
    val stderr: String,
    val originalChars: Int,
    val truncated: Boolean,
    val progressTruncated: Boolean,
)

private suspend fun collectOutput(
    chunks: Channel<ProcessStreamOutput>,
    maxFinalOutputChars: Int,
    maxProgressChars: Int,
    onOutput: suspend (ProcessStreamOutput) -> Unit,
): CollectedOutput {
    val stdout = StringBuilder()
    val stderr = StringBuilder()
    var hasStdoutOutput = false
    var hasStderrOutput = false
    var originalChars = 0
    var finalChars = 0
    var progressChars = 0
    var progressTruncated = false

    for (chunk in chunks) {
        val hasPreviousOutput = when (chunk.stream) {
            ProcessStream.STDOUT -> hasStdoutOutput
            ProcessStream.STDERR -> hasStderrOutput
        }
        val text = if (hasPreviousOutput) "\n${chunk.text}" else chunk.text
        when (chunk.stream) {
            ProcessStream.STDOUT -> hasStdoutOutput = true
            ProcessStream.STDERR -> hasStderrOutput = true
        }

        originalChars += text.length
        val finalVisible = text.take((maxFinalOutputChars - finalChars).coerceAtLeast(0))
        finalChars += finalVisible.length
        when (chunk.stream) {
            ProcessStream.STDOUT -> stdout.append(finalVisible)
            ProcessStream.STDERR -> stderr.append(finalVisible)
        }

        val progressVisible = text.take((maxProgressChars - progressChars).coerceAtLeast(0))
        progressChars += progressVisible.length
        if (progressVisible.isNotEmpty()) onOutput(chunk.copy(text = progressVisible))
        if (progressVisible.length != text.length) progressTruncated = true
    }

    return CollectedOutput(
        stdout = stdout.toString(),
        stderr = stderr.toString(),
        originalChars = originalChars,
        truncated = originalChars > finalChars,
        progressTruncated = progressTruncated,
    )
}
