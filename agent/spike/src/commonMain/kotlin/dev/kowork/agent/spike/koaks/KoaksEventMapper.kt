package dev.kowork.agent.spike.koaks

import dev.kowork.protocol.KapEvent
import dev.kowork.protocol.RunCompletedEvent
import dev.kowork.protocol.RunCompletedPayload
import dev.kowork.protocol.RunTextEvent
import dev.kowork.protocol.RunTextPayload
import dev.kowork.protocol.RunToolCallEvent
import dev.kowork.protocol.RunToolOutputEvent
import dev.kowork.protocol.RunToolOutputPayload
import dev.kowork.protocol.ToolCall
import dev.kowork.protocol.Usage
import org.koaks.framework.loop.AgentEvent
import org.koaks.framework.model.AgentFrameworkException
import org.koaks.json.KoaksWireJson

data class MappedKoaksEvent(val kap: KapEvent, val koaksJson: String)

class KoaksEventMapper(
    private val projectId: String,
    private val threadId: String,
    private val runId: String,
    private val nextSequence: () -> Long,
    private val now: () -> Long,
) {
    private var currentStep: Long = 1

    fun map(event: AgentEvent): MappedKoaksEvent? {
        // 这是 spike 对公共 interop:json Native 可用性的显式探针；KAP 仍由下方 typed mapper 生成。
        val koaksJson = KoaksWireJson.encodeAgentEvent(event).toString()
        val kap = when (event) {
            is AgentEvent.ToolCallRequested -> eventBase("spike-tool-call").let { base ->
                RunToolCallEvent(
                    base.sequence,
                    base.id,
                    base.projectId,
                    base.threadId,
                    base.runId,
                    base.createdAt,
                    ToolCall(event.call.id, event.call.name, event.call.arguments),
                )
            }
            is AgentEvent.ToolResult -> eventBase("spike-tool-output").let { base ->
                RunToolOutputEvent(
                    base.sequence,
                    base.id,
                    base.projectId,
                    base.threadId,
                    base.runId,
                    base.createdAt,
                    RunToolOutputPayload.Final(event.callId, event.output, event.isError, false),
                )
            }
            is AgentEvent.TextDelta -> eventBase("spike-text").let { base ->
                RunTextEvent(
                    base.sequence,
                    base.id,
                    base.projectId,
                    base.threadId,
                    base.runId,
                    base.createdAt,
                    RunTextPayload(event.text, currentStep, event.itemRef?.value),
                )
            }
            is AgentEvent.Completed -> eventBase("spike-completed").let { base ->
                RunCompletedEvent(
                    base.sequence,
                    base.id,
                    base.projectId,
                    base.threadId,
                    base.runId,
                    base.createdAt,
                    RunCompletedPayload(
                        Usage(
                            event.usage.promptTokens.toLong(),
                            event.usage.completionTokens.toLong(),
                            event.usage.totalTokens.toLong(),
                            event.usage.cachedInputTokens.toLong(),
                            event.usage.reasoningOutputTokens.toLong(),
                        ),
                        event.message.text,
                        currentStep,
                    ),
                )
            }
            is AgentEvent.StepCompleted -> {
                currentStep = event.step.toLong() + 1
                null
            }
            is AgentEvent.Incomplete -> error("Koaks Agent returned incomplete: ${event.reason}")
            is AgentEvent.Terminated -> error("Koaks Agent terminated unexpectedly: ${event.reason}")
            is AgentEvent.Failed -> throw AgentFrameworkException(event.error)
            is AgentEvent.ReasoningDelta,
            is AgentEvent.Model,
            is AgentEvent.ToolProgress -> null
        }
        return kap?.let { MappedKoaksEvent(it, koaksJson) }
    }

    private fun eventBase(id: String) = EventBase(nextSequence(), id, projectId, threadId, runId, now())

    private data class EventBase(
        val sequence: Long,
        val id: String,
        val projectId: String,
        val threadId: String,
        val runId: String,
        val createdAt: Long,
    )
}
