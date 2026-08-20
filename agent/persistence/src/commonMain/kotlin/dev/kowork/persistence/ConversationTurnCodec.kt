package dev.kowork.persistence

import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.koaks.framework.memory.ConversationTurn
import org.koaks.framework.memory.InterruptReason
import org.koaks.framework.memory.PendingWork
import org.koaks.framework.memory.TurnStatus
import org.koaks.framework.model.IncompleteReason
import org.koaks.framework.model.ItemRef
import org.koaks.json.KoaksWireJson

internal object ConversationTurnCodec {
    fun encode(turn: ConversationTurn): String =
        KoaksWireJson.json.encodeToString(KoaksWireJson.encodeConversationTurn(turn))

    fun decode(value: String): ConversationTurn {
        val root = parseObject(value, "conversation turn")
        val status = root.requiredObject("status")
        val items = root.requiredArray("items").map { element ->
            KoaksWireJson.decodeModelItem(element.jsonObject)
        }
        return ConversationTurn(
            id = root.requiredString("id"),
            status = decodeStatus(status),
            items = items,
            checkpoint = root["checkpoint"]?.let { KoaksWireJson.decodeProviderCheckpoint(it.jsonObject) },
            usage = KoaksWireJson.decodeUsage(root.requiredObject("usage")),
        )
    }

    private fun decodeStatus(value: JsonObject): TurnStatus = when (value.requiredString("type")) {
        "completed" -> TurnStatus.Completed
        "interrupted" -> TurnStatus.Interrupted(
            reason = decodeReason(value.requiredObject("reason")),
            pending = decodePending(value.requiredObject("pending")),
        )
        else -> error("Unknown conversation turn status")
    }

    private fun decodeReason(value: JsonObject): InterruptReason = when (value.requiredString("type")) {
        "cancelled" -> InterruptReason.Cancelled
        "failed" -> InterruptReason.Failed
        "policy" -> InterruptReason.Policy(value.requiredString("detail"))
        "incomplete" -> InterruptReason.Incomplete(decodeIncomplete(value.requiredObject("reason")))
        else -> error("Unknown conversation turn interrupt reason")
    }

    private fun decodeIncomplete(value: JsonObject): IncompleteReason = when (value.requiredString("type")) {
        "max_output_tokens" -> IncompleteReason.MaxOutputTokens
        "content_filter" -> IncompleteReason.ContentFilter
        "cancelled" -> IncompleteReason.Cancelled
        "other" -> IncompleteReason.Other(value.requiredString("code"))
        else -> error("Unknown incomplete reason")
    }

    private fun decodePending(value: JsonObject): PendingWork = PendingWork(
        unresolvedCalls = value.requiredArray("unresolved_calls").map { ItemRef(it.jsonPrimitive.content) },
        partialText = value.optionalString("partial_text"),
        partialItem = value.optionalString("partial_item")?.let(::ItemRef),
    )
}
