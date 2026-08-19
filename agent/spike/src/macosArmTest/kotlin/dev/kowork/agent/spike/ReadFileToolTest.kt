package dev.kowork.agent.spike

import dev.kowork.agent.spike.tools.ReadFileInput
import dev.kowork.agent.spike.tools.ReadFileTool
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import okio.FileSystem
import okio.Path
import platform.posix.symlink
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith

class ReadFileToolTest {
    @Test
    fun 正常读取并支持行偏移截断和空文件() = withProject { root ->
        val fs = FileSystem.SYSTEM
        fs.write(root / "lines.txt") { writeUtf8("one\ntwo\nthree\n") }
        fs.write(root / "empty.txt") {}
        val tool = ReadFileTool(root)

        val page = Json.parseToJsonElement(runBlocking { tool.execute(ReadFileInput("lines.txt", 2, 1)) }).jsonObject
        assertEquals("2\ttwo", page.getValue("content").jsonPrimitive.content)
        assertEquals("true", page.getValue("truncated").jsonPrimitive.content)
        assertEquals("3", page.getValue("totalLines").jsonPrimitive.content)

        val empty = Json.parseToJsonElement(runBlocking { tool.execute(ReadFileInput("empty.txt")) }).jsonObject
        assertEquals("", empty.getValue("content").jsonPrimitive.content)
        assertEquals("0", empty.getValue("totalLines").jsonPrimitive.content)
    }

    @Test
    fun 拒绝二进制目录和超限文件() = withProject { root ->
        val fs = FileSystem.SYSTEM
        fs.write(root / "binary.bin") { write(byteArrayOf(1, 0, 2)) }
        fs.write(root / "invalid-utf8.bin") { write(byteArrayOf(0xc3.toByte(), 0x28)) }
        fs.createDirectories(root / "directory")
        fs.write(root / "large.txt") { write(ByteArray(2 * 1024 * 1024 + 1) { 'x'.code.toByte() }) }
        val tool = ReadFileTool(root)

        assertFailsWith<IllegalArgumentException> { runBlocking { tool.execute(ReadFileInput("binary.bin")) } }
        assertFailsWith<IllegalArgumentException> { runBlocking { tool.execute(ReadFileInput("invalid-utf8.bin")) } }
        assertFailsWith<IllegalArgumentException> { runBlocking { tool.execute(ReadFileInput("directory")) } }
        assertFailsWith<IllegalArgumentException> { runBlocking { tool.execute(ReadFileInput("large.txt")) } }
    }

    @Test
    fun 拒绝父目录越界和symlink逃逸() = withProject { root ->
        val fs = FileSystem.SYSTEM
        val outside = root.parent!! / "${root.name}-outside.txt"
        fs.write(outside) { writeUtf8("outside") }
        try {
            assertEquals(0, symlink(outside.toString(), (root / "escape.txt").toString()))
            val tool = ReadFileTool(root)
            assertFailsWith<IllegalArgumentException> { runBlocking { tool.execute(ReadFileInput("../${outside.name}")) } }
            assertFailsWith<IllegalArgumentException> { runBlocking { tool.execute(ReadFileInput("escape.txt")) } }
        } finally {
            fs.delete(outside, mustExist = false)
        }
    }

    private fun withProject(block: (Path) -> Unit) {
        val fs = FileSystem.SYSTEM
        val root = FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "kowork-read-file-${Random.nextLong().toString().replace('-', '0')}"
        fs.createDirectories(root)
        try {
            block(root)
        } finally {
            fs.deleteRecursively(root, mustExist = false)
        }
    }
}
