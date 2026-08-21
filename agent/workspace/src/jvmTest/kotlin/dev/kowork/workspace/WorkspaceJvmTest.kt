package dev.kowork.workspace

import java.nio.file.Files
import java.nio.file.StandardCopyOption
import java.nio.file.attribute.PosixFilePermission
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.runBlocking
import okio.Path
import okio.Path.Companion.toPath
import kotlin.test.AfterTest
import kotlin.test.Test
import kotlin.test.assertContains
import kotlin.test.assertEquals
import kotlin.test.assertFalse
import kotlin.test.assertNotNull
import kotlin.test.assertTrue
import kotlin.test.assertFailsWith
import kotlin.time.Duration.Companion.milliseconds
import kotlin.time.Duration.Companion.seconds

class WorkspaceJvmTest {
    private val roots = mutableListOf<java.nio.file.Path>()

    @AfterTest
    fun tearDown() {
        roots.forEach { root -> root.toFile().deleteRecursively() }
    }

    @Test
    fun `词法路径校验拒绝越界读取并允许缺失写入尾段`() {
        val root = temporaryDirectory()
        val scope = WorkspaceScope(root.toString().toPath())

        val outsideFailure = assertFailsWith<WorkspaceException> {
            scope.resolveRead(root.resolve("../escape.txt").toString().toPath())
        }
        assertEquals(WorkspaceErrorCode.PATH_OUTSIDE_SCOPE, outsideFailure.code)

        val missing = scope.resolveWrite("nested/deeper/file.txt")
        assertEquals(root.resolve("nested/deeper/file.txt").toString(), missing.toString())
        val readFailure = assertFailsWith<WorkspaceException> { scope.resolveRead("missing.txt") }
        assertEquals(WorkspaceErrorCode.PATH_NOT_FOUND, readFailure.code)
    }

    @Test
    fun `文本文件读取严格校验并以原子写入保留已有权限`() {
        val root = temporaryDirectory()
        val target = root.resolve("nested/file.txt")
        Files.createDirectories(target.parent)
        Files.writeString(target, "before")
        val originalPermissions = setOf(PosixFilePermission.OWNER_READ, PosixFilePermission.OWNER_WRITE)
        Files.setPosixFilePermissions(target, originalPermissions)
        val port = FileSystemPort(WorkspaceScope(root.toString().toPath()))

        port.writeTextAtomically("nested/file.txt", "after")
        assertEquals("after", Files.readString(target))
        assertEquals(originalPermissions, Files.getPosixFilePermissions(target))
        assertEquals("after", port.readText("nested/file.txt").content)
        assertEquals("after", port.writeTextAtomically("created/path.txt", "after").let {
            Files.readString(root.resolve("created/path.txt"))
        })

        Files.write(root.resolve("nul.txt"), byteArrayOf('a'.code.toByte(), 0, 'b'.code.toByte()))
        assertEquals(
            WorkspaceErrorCode.BINARY_FILE,
            assertFailsWith<WorkspaceException> { port.readText("nul.txt") }.code,
        )
        Files.write(root.resolve("invalid.txt"), byteArrayOf(0xC3.toByte(), 0x28))
        assertEquals(
            WorkspaceErrorCode.INVALID_UTF8,
            assertFailsWith<WorkspaceException> { port.readText("invalid.txt") }.code,
        )
        Files.write(root.resolve("large.txt"), ByteArray((MAX_TEXT_FILE_BYTES + 1).toInt()))
        assertEquals(
            WorkspaceErrorCode.FILE_TOO_LARGE,
            assertFailsWith<WorkspaceException> { port.readText("large.txt") }.code,
        )
        assertEquals(
            WorkspaceErrorCode.BINARY_FILE,
            assertFailsWith<WorkspaceException> { port.writeTextAtomically("write-nul.txt", "a\u0000b") }.code,
        )
        assertEquals(
            WorkspaceErrorCode.FILE_TOO_LARGE,
            assertFailsWith<WorkspaceException> {
                port.writeTextAtomically("write-large.txt", "x".repeat((MAX_TEXT_FILE_BYTES + 1).toInt()))
            }.code,
        )
    }

    @Test
    fun `进程独立运行并剔除敏感环境变量`() = runBlocking {
        val root = temporaryDirectory()
        val nested = root.resolve("nested")
        Files.createDirectories(nested)
        val port = processPort(
            mapOf(
                "KOWORK_TEST_API_KEY" to "secret",
                "KOWORK_TEST_VISIBLE" to "visible",
            ),
        )

        val first = port.bash("cd nested; pwd", root.toString().toPath(), 5.seconds)
        val second = port.bash(
            "printf '%s:%s\\nnext' \"\${KOWORK_TEST_API_KEY:-missing}\" \"\${KOWORK_TEST_VISIBLE}\"; printf 'err\\nnext-error' >&2; exit 7",
            root.toString().toPath(),
            5.seconds,
        )
        assertEquals(0, first.exitCode)
        assertContains(first.stdout, nested.toString())
        assertEquals(7, second.exitCode)
        assertEquals("missing:visible\nnext", second.stdout)
        assertEquals("err\nnext-error", second.stderr)
    }

    @Test
    fun `超时与取消终止整个进程组`() = runBlocking {
        val root = temporaryDirectory()
        val port = processPort()
        val timeout = assertFailsSuspend<WorkspaceException> {
            port.bash("sleep 10", root.toString().toPath(), 50.milliseconds)
        }
        assertEquals(WorkspaceErrorCode.PROCESS_TIMEOUT, timeout.code)

        val marker = root.resolve("child-survived.txt")
        val command = "(sleep 1; printf leaked > ${bashQuote(marker.toString())}) & wait"
        val execution = async { port.bash(command, root.toString().toPath(), 10.seconds) }
        delay(150.milliseconds)
        execution.cancel()
        assertFailsSuspend<kotlinx.coroutines.CancellationException> { execution.await() }
        assertFalse(Files.exists(marker), "取消后子进程不应继续写入")
    }

    @Test
    fun `GitPort 覆盖状态摘要初始仓库与截断`() = runBlocking {
        val root = temporaryDirectory()
        git(root, "init")
        git(root, "config", "user.email", "test@example.invalid")
        git(root, "config", "user.name", "KoWork Test")
        Files.writeString(root.resolve("old.txt"), "one\n")
        git(root, "add", "old.txt")
        git(root, "commit", "-m", "initial")
        Files.move(root.resolve("old.txt"), root.resolve("new.txt"), StandardCopyOption.ATOMIC_MOVE)
        Files.writeString(root.resolve("tracked.txt"), "before\n")
        git(root, "add", "-A")

        val port = GitPort(processPort(), root.toString().toPath())
        val changes = port.status()
        assertTrue(changes.any { it.indexStatus == 'R' && it.path == "new.txt" && it.originalPath == "old.txt" })

        Files.writeString(root.resolve("tracked.txt"), "after\n")
        val summary = port.summary()
        assertNotNull(summary.branch)
        assertTrue(summary.additions >= 1, "Git 摘要应包含新增行：$summary")
        assertContains(port.diff("tracked.txt").diff, "after")

        val noHead = temporaryDirectory()
        git(noHead, "init")
        Files.writeString(noHead.resolve("first.txt"), "first\n")
        git(noHead, "add", "first.txt")
        val noHeadPort = GitPort(processPort(), noHead.toString().toPath())
        assertEquals(1, noHeadPort.summary().additions)
        assertContains(noHeadPort.diff(mode = GitDiffMode.HEAD).diff, "first.txt")

        Files.writeString(root.resolve("tracked.txt"), "x".repeat(MAX_GIT_OUTPUT_CHARS + 1))
        val largeDiff = port.diff("tracked.txt")
        assertTrue(largeDiff.truncated)

        val nonRepository = GitPort(processPort(), temporaryDirectory().toString().toPath())
        assertTrue(nonRepository.status().isEmpty())
    }

    private fun processPort(environment: Map<String, String> = emptyMap()): ProcessPort =
        ProcessPort(
            processGroupLauncher = launcherPath(),
            environmentProvider = { environment },
        )

    private fun launcherPath(): Path {
        val value = System.getenv("KOWORK_PROCESS_LAUNCHER")
        assertNotNull(value, "测试任务必须提供 KOWORK_PROCESS_LAUNCHER")
        return value.toPath()
    }

    private fun temporaryDirectory(): java.nio.file.Path =
        Files.createTempDirectory("kowork-workspace-test-").also(roots::add)

    private fun git(root: java.nio.file.Path, vararg arguments: String) {
        val exitCode = ProcessBuilder(listOf("git", "-C", root.toString()) + arguments)
            .inheritIO()
            .start()
            .waitFor()
        assertEquals(0, exitCode, "git ${arguments.joinToString(" ")} 应成功")
    }
}

private fun bashQuote(value: String): String = "'${value.replace("'", "'\\\"'\\\"'")}'"

private suspend inline fun <reified T : Throwable> assertFailsSuspend(
    block: suspend () -> Unit,
): T {
    try {
        block()
    } catch (cause: Throwable) {
        if (cause is T) return cause
        throw AssertionError("预期 ${T::class.simpleName}，实际为 ${cause::class.simpleName}", cause)
    }
    throw AssertionError("预期 ${T::class.simpleName}，但调用成功")
}
