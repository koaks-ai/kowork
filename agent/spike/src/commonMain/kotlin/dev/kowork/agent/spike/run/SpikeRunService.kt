package dev.kowork.agent.spike.run

import dev.kowork.agent.spike.events.SpikeEventPublisher
import dev.kowork.agent.spike.koaks.KoaksEventMapper
import dev.kowork.agent.spike.koaks.ScriptedReadFileModel
import dev.kowork.agent.spike.tools.ReadFileInput
import dev.kowork.agent.spike.tools.ReadFileTool
import dev.kowork.protocol.RequestQueuedEvent
import dev.kowork.protocol.RequestQueuedPayload
import dev.kowork.protocol.RunStartedEvent
import dev.kowork.protocol.RunStartedPayload
import dev.kowork.protocol.RunsEnqueueParams
import kotlinx.coroutines.flow.collect
import kotlinx.datetime.Clock
import okio.Path
import org.koaks.framework.loop.agent
import org.koaks.framework.loop.tool
import org.koaks.runtime.AgentRuntime

class SpikeRunService(
    projectRoot: Path,
    readPath: String,
    private val publisher: SpikeEventPublisher,
) {
    private val runtime = AgentRuntime { maxConcurrency = 1 }
    private val model = ScriptedReadFileModel(ReadFileInput(readPath))
    private val tool = ReadFileTool(projectRoot)
    private val agent = agent {
        id = "spike-agent"
        model { custom(model) }
        tools { tool(tool) }
        terminateAfter(maxSteps = 3)
    }

    suspend fun run(request: RunsEnqueueParams) {
        require(request.threadId == THREAD_ID) { "spike only supports thread '$THREAD_ID'" }
        val mapper = KoaksEventMapper(PROJECT_ID, THREAD_ID, RUN_ID, publisher::allocateSequence, ::now)
        publisher.publish(
            RequestQueuedEvent(
                publisher.allocateSequence(),
                "spike-request-queued",
                PROJECT_ID,
                THREAD_ID,
                RUN_ID,
                now(),
                RequestQueuedPayload(REQUEST_ID, request.input, 0),
            ),
            "{}",
        )
        publisher.publish(
            RunStartedEvent(
                publisher.allocateSequence(),
                "spike-run-started",
                PROJECT_ID,
                THREAD_ID,
                RUN_ID,
                now(),
                RunStartedPayload(REQUEST_ID, request.input, "spike-scripted"),
            ),
            "{}",
        )
        runtime.stream(agent, request.input, thread = THREAD_ID).collect { event ->
            mapper.map(event)?.let { publisher.publish(it.kap, it.koaksJson) }
        }
    }

    fun close() {
        try {
            agent.close()
        } finally {
            runtime.close()
        }
    }

    companion object {
        const val PROJECT_ID = "spike-project"
        const val THREAD_ID = "spike-thread"
        const val REQUEST_ID = "spike-request"
        const val RUN_ID = "spike-run"
        private fun now(): Long = Clock.System.now().toEpochMilliseconds().coerceAtLeast(0)
    }
}
