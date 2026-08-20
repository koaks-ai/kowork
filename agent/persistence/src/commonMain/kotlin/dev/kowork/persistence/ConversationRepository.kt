package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult
import kotlinx.datetime.Clock
import org.koaks.framework.model.ModelItem

public class ConversationRepository(private val database: PersistenceDatabase) {
    public fun appendTurn(branchId: String, turn: org.koaks.framework.memory.ConversationTurn, now: Long = Clock.System.now().toEpochMilliseconds()): StoredTurn =
        database.transaction {
            val branch = database.branches.get(branchId)
            require(branch.archivedAt == null) { "Cannot append a turn to an archived branch" }
            requireNonBlank(turn.id, "conversationTurn.id")
            require(getTurnOrNull(turn.id) == null) { "Conversation turn '${turn.id}' already exists" }
            val parentTurnId = branch.headTurnId ?: branch.forkTurnId
            parentTurnId?.let { require(isInLineage(branchId, it)) { "Branch head is outside branch lineage" } }
            val ordinal = database.driver.query(
                "SELECT COALESCE(MAX(ordinal), 0) FROM conversation_turns WHERE branch_id = ?", 1,
                { bindString(0, branchId) },
                { cursor -> cursor.nextOrFail("turn ordinal"); QueryResult.Value(cursor.long(0, "turn.ordinal") + 1) },
            )
            val stored = StoredTurn(turn.id, branch.threadId, branchId, parentTurnId, ordinal, turn, now)
            database.driver.exec(
                "INSERT INTO conversation_turns(id, thread_id, branch_id, parent_turn_id, ordinal, status_json, items_json, checkpoint_json, usage_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                10,
            ) {
                bindString(0, stored.id); bindString(1, stored.threadId); bindString(2, stored.branchId)
                bindNullableString(3, stored.parentTurnId); bindLong(4, stored.ordinal)
                val encoded = ConversationTurnCodec.encode(turn)
                val root = parseObject(encoded, "conversation turn")
                bindString(5, root.requiredObject("status").toString())
                bindString(6, root.requiredArray("items").toString())
                bindNullableString(7, root.optionalObject("checkpoint")?.toString())
                bindString(8, root.requiredObject("usage").toString()); bindLong(9, now)
            }
            database.branches.updateHead(branchId, turn.id, now)
            stored
        }

    public fun getTurn(id: String): StoredTurn = getTurnOrNull(id) ?: error("Conversation turn '$id' was not found")

    internal fun getTurnOrNull(id: String): StoredTurn? = database.driver.query(
        "SELECT id, thread_id, branch_id, parent_turn_id, ordinal, status_json, items_json, checkpoint_json, usage_json, created_at FROM conversation_turns WHERE id = ?",
        1, { bindString(0, id) },
    ) { cursor ->
        if (!cursor.next().value) return@query QueryResult.Value(null)
        QueryResult.Value(cursor.toStoredTurn())
    }

    public fun turns(branchId: String): List<StoredTurn> = database.driver.query(
        "SELECT id, thread_id, branch_id, parent_turn_id, ordinal, status_json, items_json, checkpoint_json, usage_json, created_at FROM conversation_turns WHERE branch_id = ? ORDER BY ordinal ASC",
        1, { bindString(0, branchId) },
        { cursor -> QueryResult.Value(cursor.collect { it.toStoredTurn() }) },
    )

    /** 返回从 root 到当前 branch head 的真实 lineage，包含父 branch fork anchor。 */
    public fun lineage(branchId: String): List<StoredTurn> {
        val branch = database.branches.get(branchId)
        val reversed = mutableListOf<StoredTurn>()
        val visited = mutableSetOf<String>()
        var currentId = branch.headTurnId ?: branch.forkTurnId
        while (currentId != null) {
            require(visited.add(currentId)) { "Turn lineage contains a cycle at '$currentId'" }
            val turn = getTurn(currentId)
            require(turn.threadId == branch.threadId) { "Turn '$currentId' belongs to another thread" }
            reversed += turn
            currentId = turn.parentTurnId
        }
        return reversed.asReversed()
    }

    public fun isInLineage(branchId: String, turnId: String): Boolean = lineage(branchId).any { it.id == turnId }

    public fun addCompressionCheckpoint(checkpoint: CompressionCheckpointRecord) {
        requireNonBlank(checkpoint.id, "checkpoint.id")
        requireNonBlank(checkpoint.summary, "checkpoint.summary")
        require(checkpoint.estimatedTokens >= 0) { "checkpoint.estimatedTokens must not be negative" }
        val branch = database.branches.get(checkpoint.branchId)
        require(branch.threadId == checkpoint.threadId) { "Checkpoint belongs to another thread" }
        require(database.providers.getModelProfile(checkpoint.modelProfileId).enabled) {
            "Compression checkpoint requires an enabled model profile"
        }
        val anchor = getTurn(checkpoint.coveredThroughTurnId)
        require(anchor.threadId == checkpoint.threadId && isInLineage(checkpoint.branchId, anchor.id)) {
            "Compression checkpoint anchor is outside branch lineage"
        }
        database.driver.exec(
            "INSERT INTO compression_checkpoints(id, thread_id, branch_id, model_profile_id, summary, covered_through_turn_id, estimated_tokens, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            8,
        ) {
            bindString(0, checkpoint.id); bindString(1, checkpoint.threadId); bindString(2, checkpoint.branchId)
            bindString(3, checkpoint.modelProfileId); bindString(4, checkpoint.summary)
            bindString(5, checkpoint.coveredThroughTurnId); bindLong(6, checkpoint.estimatedTokens); bindLong(7, checkpoint.createdAt)
        }
    }

    public fun loadModelContext(branchId: String): ModelContext {
        val lineage = lineage(branchId)
        val positions = lineage.withIndex().associate { it.value.id to it.index }
        val checkpoint = checkpoints(branchId)
            .filter { positions.containsKey(it.coveredThroughTurnId) }
            .maxWithOrNull(compareBy<CompressionCheckpointRecord> { positions.getValue(it.coveredThroughTurnId) }
                .thenBy { it.createdAt })
        val start = checkpoint?.let { checkpointValue -> lineage.indexOfFirst { it.id == checkpointValue.coveredThroughTurnId } + 1 } ?: 0
        val visibleTurns = lineage.drop(start)
        val items = buildList {
            checkpoint?.let { add(ModelItem.user("Conversation summary:\n${it.summary}")) }
            visibleTurns.forEach { addAll(it.turn.items) }
        }
        val providerCheckpoint = lineage.asReversed().asSequence().mapNotNull { it.turn.checkpoint }
            .firstOrNull { it.matches(items) }
        return ModelContext(items, providerCheckpoint, checkpoint)
    }

    public fun loadDisplayConversation(branchId: String): List<DisplayConversationEntry> {
        val lineage = lineage(branchId)
        val checkpoints = checkpoints(branchId).groupBy { it.coveredThroughTurnId }
        return buildList {
            lineage.forEach { turn ->
                add(DisplayConversationEntry.Turn(turn))
                checkpoints[turn.id].orEmpty().sortedBy { it.createdAt }.forEach {
                    add(DisplayConversationEntry.SummaryNotification(it))
                }
            }
        }
    }

    private fun checkpoints(branchId: String): List<CompressionCheckpointRecord> =
        checkpoints(branchId, inheritedBefore = null, visitedBranches = mutableSetOf())

    private fun checkpoints(
        branchId: String,
        inheritedBefore: Long?,
        visitedBranches: MutableSet<String>,
    ): List<CompressionCheckpointRecord> {
        require(visitedBranches.add(branchId)) { "Branch checkpoint lineage contains a cycle at '$branchId'" }
        val branch = database.branches.get(branchId)
        val own = database.driver.query(
            "SELECT id, thread_id, branch_id, model_profile_id, summary, covered_through_turn_id, estimated_tokens, created_at FROM compression_checkpoints WHERE branch_id = ? ORDER BY created_at ASC",
            1, { bindString(0, branchId) },
            { cursor -> QueryResult.Value(cursor.collect { it.toCheckpoint() }) },
        ).filter { inheritedBefore == null || it.createdAt <= inheritedBefore }
        val parentCutoff = inheritedBefore?.let { minOf(it, branch.createdAt) } ?: branch.createdAt
        return own + (branch.parentBranchId?.let {
            checkpoints(it, inheritedBefore = parentCutoff, visitedBranches = visitedBranches)
        }.orEmpty()).filter {
            isInLineage(branchId, it.coveredThroughTurnId)
        }
    }
}

internal fun app.cash.sqldelight.db.SqlCursor.toStoredTurn(): StoredTurn {
    val status = string(5, "turn.statusJson")
    val items = string(6, "turn.itemsJson")
    val checkpoint = nullableString(7)
    val usage = string(8, "turn.usageJson")
    val turnJson = "{" +
        "\"id\":${quoteJson(string(0, "turn.id"))}," +
        "\"status\":$status," +
        "\"items\":$items," +
        (checkpoint?.let { "\"checkpoint\":$it," } ?: "") +
        "\"usage\":$usage}"
    return StoredTurn(
        id = string(0, "turn.id"), threadId = string(1, "turn.threadId"), branchId = string(2, "turn.branchId"),
        parentTurnId = nullableString(3), ordinal = long(4, "turn.ordinal"),
        turn = ConversationTurnCodec.decode(turnJson), createdAt = long(9, "turn.createdAt"),
    )
}

internal fun app.cash.sqldelight.db.SqlCursor.toCheckpoint(): CompressionCheckpointRecord = CompressionCheckpointRecord(
    id = string(0, "checkpoint.id"), threadId = string(1, "checkpoint.threadId"), branchId = string(2, "checkpoint.branchId"),
    modelProfileId = string(3, "checkpoint.modelProfileId"), summary = string(4, "checkpoint.summary"),
    coveredThroughTurnId = string(5, "checkpoint.coveredThroughTurnId"), estimatedTokens = long(6, "checkpoint.estimatedTokens"),
    createdAt = long(7, "checkpoint.createdAt"),
)

private fun quoteJson(value: String): String =
    kotlinx.serialization.json.JsonPrimitive(value).toString()
