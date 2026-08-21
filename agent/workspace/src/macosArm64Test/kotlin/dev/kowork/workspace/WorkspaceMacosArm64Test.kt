package dev.kowork.workspace

import io.matthewnelson.kmp.process.Process
import kotlinx.coroutines.runBlocking
import okio.FileSystem
import okio.Path.Companion.toPath
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertNotNull
import kotlin.time.Duration.Companion.seconds

class WorkspaceMacosArm64Test {
    @Test
    fun `macOS Arm64 上可读写文本并执行独立 Bash`() = runBlocking {
        val root = "/tmp/kowork-workspace-native-${Random.nextLong().toString(16)}".toPath()
        val fileSystem = FileSystem.SYSTEM
        fileSystem.createDirectories(root)
        try {
            val scope = WorkspaceScope(root, fileSystem = fileSystem)
            val files = FileSystemPort(scope, fileSystem)
            files.writeTextAtomically("nested/file.txt", "native")
            assertEquals("native", files.readText("nested/file.txt").content)

            val launcher = Process.Current.environment()["KOWORK_PROCESS_LAUNCHER"]
            assertNotNull(launcher, "测试任务必须提供 KOWORK_PROCESS_LAUNCHER")
            val result = ProcessPort(launcher.toPath(), fileSystem).bash("printf native", root, 5.seconds)
            assertEquals(0, result.exitCode)
            assertEquals("native", result.stdout)
        } finally {
            fileSystem.deleteRecursively(root, mustExist = false)
        }
    }
}
