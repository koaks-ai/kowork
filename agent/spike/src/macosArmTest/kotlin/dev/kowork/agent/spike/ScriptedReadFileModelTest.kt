package dev.kowork.agent.spike

import dev.kowork.agent.spike.koaks.ScriptedReadFileModel
import dev.kowork.agent.spike.tools.ReadFileInput
import kotlinx.coroutines.flow.toList
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import org.koaks.framework.model.ItemRef
import org.koaks.framework.model.ModelItem
import org.koaks.framework.model.ModelRequest
import org.koaks.framework.tool.ToolSchema
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFails

class ScriptedReadFileModelTest {
    @Test
    fun 只允许两次模型调用并要求工具schema与结果() = runBlocking {
        val model = ScriptedReadFileModel(ReadFileInput("fixture.txt"))
        val schema = readFileSchema()
        model.stream(request(listOf(ModelItem.user("read")), listOf(schema))).toList()
        model.stream(
            request(
                listOf(
                    ModelItem.user("read"),
                    ModelItem.ToolResult(
                        callRef = ItemRef("spike-read-file-call"),
                        output = "result",
                    ),
                ),
                listOf(schema),
            ),
        ).toList()
        assertEquals(2, model.calls)
        assertFails { model.stream(request(listOf(ModelItem.user("again")), listOf(schema))).toList() }
        Unit
    }

    @Test
    fun 拒绝错误schema不匹配结果和失败结果() = runBlocking {
        val malformedSchema = ToolSchema("read_file", "read", buildJsonObject {})
        assertFails {
            ScriptedReadFileModel(ReadFileInput("fixture.txt"))
                .stream(request(listOf(ModelItem.user("read")), listOf(malformedSchema)))
                .toList()
        }

        listOf(
            ModelItem.ToolResult(
                ref = ItemRef("result"),
                callRef = ItemRef("wrong-call"),
                output = "result",
            ),
            ModelItem.ToolResult(
                ref = ItemRef("result"),
                callRef = ItemRef("spike-read-file-call"),
                output = "failed",
                isError = true,
            ),
        ).forEach { result ->
            val model = ScriptedReadFileModel(ReadFileInput("fixture.txt"))
            val schema = readFileSchema()
            model.stream(request(listOf(ModelItem.user("read")), listOf(schema))).toList()
            assertFails {
                model.stream(request(listOf(ModelItem.user("read"), result), listOf(schema))).toList()
            }
        }
        Unit
    }

    private fun readFileSchema() = ToolSchema(
        "read_file",
        "read",
        buildJsonObject {
            put("type", "object")
            put("properties", buildJsonObject {
                put("path", buildJsonObject { put("type", "string") })
                put("offset", buildJsonObject { put("type", "integer") })
                put("limit", buildJsonObject { put("type", "integer") })
            })
            put("required", buildJsonArray { add(JsonPrimitive("path")) })
        },
    )

    private fun request(items: List<ModelItem>, tools: List<ToolSchema>) = ModelRequest(
        instructions = null,
        items = items,
        tools = tools,
        idempotencyKey = "test",
    )
}
