package dev.kowork.agent.spike.koaks

import dev.kowork.agent.spike.tools.ReadFileInput
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import org.koaks.framework.model.ItemRef
import org.koaks.framework.model.LanguageModel
import org.koaks.framework.model.ModelCapabilities
import org.koaks.framework.model.ModelEvent
import org.koaks.framework.model.ModelItem
import org.koaks.framework.model.ModelRequest
import org.koaks.framework.model.ModelResponse
import org.koaks.framework.model.Role
import org.koaks.framework.model.ToolCall
import org.koaks.framework.model.Usage

/** 无网络、无凭据的确定性模型，只用于验证 Koaks Agent loop。 */
class ScriptedReadFileModel(private val fileInput: ReadFileInput) : LanguageModel {
    override val capabilities: ModelCapabilities = ModelCapabilities.DEFAULT
    var calls: Int = 0
        private set

    override fun stream(request: ModelRequest): Flow<ModelEvent> = flow {
        calls += 1
        when (calls) {
            1 -> {
                require(request.items.none { it is ModelItem.ToolResult }) {
                    "the first scripted model call must not contain a tool result"
                }
                require(request.items.any { it is ModelItem.Message && it.role == Role.USER }) {
                    "the first scripted model call must contain user input"
                }
                validateToolSchema(request)
                val call = ToolCall(
                    id = "spike-read-file-call",
                    name = "read_file",
                    arguments = Json.encodeToString(fileInput),
                )
                emit(ModelEvent.Started("spike-response-1"))
                emit(ModelEvent.ToolCallCompleted(call))
                emit(ModelEvent.Finished(ModelResponse.Completed(output = listOf(call.toItem()))))
            }
            2 -> {
                val result = request.items.filterIsInstance<ModelItem.ToolResult>().singleOrNull()
                    ?: error("the second scripted model call must contain exactly one read_file result")
                require(result.callRef.value == "spike-read-file-call") {
                    "the tool result does not match the scripted read_file call"
                }
                require(!result.isError) { "the scripted read_file call failed: ${result.output}" }
                val text = "read_file completed: ${result.output}"
                val ref = ItemRef("spike-final-message")
                emit(ModelEvent.Started("spike-response-2"))
                emit(ModelEvent.TextDelta(text, ref))
                emit(
                    ModelEvent.Finished(
                        ModelResponse.Completed(
                            output = listOf(ModelItem.assistant(text, ref = ref)),
                            usage = Usage(promptTokens = 1, completionTokens = 1, totalTokens = 2),
                        ),
                    ),
                )
            }
            else -> error("scripted model received an unexpected call #$calls")
        }
    }

    private fun validateToolSchema(request: ModelRequest) {
        val schema = request.tools.singleOrNull()
            ?: error("the scripted model requires exactly one tool schema")
        require(schema.name == "read_file") { "expected read_file tool schema, got '${schema.name}'" }
        require((schema.parameters["type"] as? JsonPrimitive)?.content == "object") {
            "read_file tool schema must be an object"
        }
        val properties = schema.parameters["properties"] as? JsonObject
            ?: error("read_file tool schema has no properties object")
        val expectedTypes = mapOf("path" to "string", "offset" to "integer", "limit" to "integer")
        require(properties.keys == expectedTypes.keys) {
            "read_file tool schema must contain exactly path/offset/limit"
        }
        expectedTypes.forEach { (name, expectedType) ->
            val property = properties[name] as? JsonObject
                ?: error("read_file.$name schema must be an object")
            require((property["type"] as? JsonPrimitive)?.content == expectedType) {
                "read_file.$name schema must have type $expectedType"
            }
        }
        val required = schema.parameters["required"] as? JsonArray
            ?: error("read_file tool schema has no required array")
        require(required.map { (it as? JsonPrimitive)?.content }.toSet() == setOf("path")) {
            "only read_file.path may be required"
        }
    }
}
