package dev.kowork.agent.spike

import dev.kowork.agent.spike.koaks.KoaksEventMapper
import dev.kowork.protocol.*
import org.koaks.framework.loop.AgentEvent
import org.koaks.framework.model.AgentError
import org.koaks.framework.model.AgentFrameworkException
import org.koaks.framework.model.ItemRef
import org.koaks.framework.model.ModelItem
import org.koaks.framework.model.ToolCall
import org.koaks.framework.model.Usage
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertFailsWith
import kotlin.test.assertIs
import kotlin.test.assertNotNull

class KoaksEventMapperTest {
    @Test
    fun 映射工具文本与完成事件并验证公共wireCodec() {
        var sequence = 1L
        val mapper = KoaksEventMapper("project", "thread", "run", { sequence++ }, { 123L })
        val events = listOf(
            AgentEvent.ToolCallRequested(ToolCall("call", "read_file", "{}")),
            AgentEvent.ToolResult("call", "output", false),
            AgentEvent.TextDelta("done", ItemRef("message")),
            AgentEvent.Completed(ModelItem.assistant("done"), Usage(1, 2, 3)),
        ).map { assertNotNull(mapper.map(it)) }

        assertIs<RunToolCallEvent>(events[0].kap)
        assertIs<RunToolOutputEvent>(events[1].kap)
        assertIs<RunTextEvent>(events[2].kap)
        assertIs<RunCompletedEvent>(events[3].kap)
        assertEquals(listOf(1L, 2L, 3L, 4L), events.map { it.kap.sequence })
        assertEquals(listOf(123L, 123L, 123L, 123L), events.map { it.kap.createdAt })
        events.forEach { assertNotNull(it.koaksJson.takeIf(String::isNotBlank)) }
    }

    @Test
    fun Koaks失败事件保持显式失败() {
        val mapper = KoaksEventMapper("project", "thread", "run", { 1L }, { 123L })
        assertFailsWith<AgentFrameworkException> {
            mapper.map(AgentEvent.Failed(AgentError.ModelError("scripted failure", retriable = false)))
        }
    }
}
