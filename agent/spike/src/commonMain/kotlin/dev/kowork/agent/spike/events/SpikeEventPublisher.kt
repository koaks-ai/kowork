package dev.kowork.agent.spike.events

import dev.kowork.agent.spike.persistence.SpikeEventStore
import dev.kowork.agent.spike.persistence.StoredSpikeEvent
import dev.kowork.protocol.KapEvent
import dev.kowork.protocol.KapJson
import dev.kowork.protocol.RequestQueuedEvent
import dev.kowork.protocol.RunCompletedEvent
import dev.kowork.protocol.RunStartedEvent
import dev.kowork.protocol.RunTextEvent
import dev.kowork.protocol.RunToolCallEvent
import dev.kowork.protocol.RunToolOutputEvent
import dev.kowork.protocol.ServerFrame
import kotlinx.serialization.encodeToString

class SpikeEventPublisher(
    private val store: SpikeEventStore,
    private val send: suspend (String) -> Unit,
) {
    private var nextSequence = 1L

    fun allocateSequence(): Long = nextSequence++

    suspend fun publish(event: KapEvent, koaksJson: String) {
        val kapJson = KapJson.encodeToString(ServerFrame.serializer(), ServerFrame.Event(event))
        val sequence = store.append(event.typeName(), kapJson, koaksJson)
        check(sequence == event.sequence) {
            "database sequence $sequence did not match KAP sequence ${event.sequence}"
        }
        check(store.read(sequence) == StoredSpikeEvent(sequence, event.typeName(), kapJson, koaksJson)) {
            "persisted spike event $sequence did not round-trip"
        }
        send(kapJson)
    }

    private fun KapEvent.typeName(): String = when (this) {
        is RequestQueuedEvent -> "request.queued"
        is RunStartedEvent -> "run.started"
        is RunToolCallEvent -> "run.toolCall"
        is RunToolOutputEvent -> "run.toolOutput"
        is RunTextEvent -> "run.text"
        is RunCompletedEvent -> "run.completed"
        else -> error("unsupported spike event ${this::class.simpleName}")
    }
}
