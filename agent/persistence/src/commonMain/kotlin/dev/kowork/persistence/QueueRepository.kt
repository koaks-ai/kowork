package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class QueueRepository(private val database: PersistenceDatabase) {
    public fun enqueue(
        branchId: String,
        input: String,
        modelProfileId: String,
        contextWindowTokens: Long,
        id: String,
        now: Long,
    ): QueueRecord = database.transaction {
        val branch = database.branches.get(branchId)
        require(branch.archivedAt == null) { "Cannot enqueue work in an archived branch" }
        require(!branch.queuePaused) { "Cannot enqueue work while branch queue is paused" }
        require(input.trim().isNotEmpty()) { "Queue input must not be blank" }
        requireNonBlank(id, "request.id")
        requirePositive(contextWindowTokens, "contextWindowTokens")
        val profile = database.providers.getModelProfile(modelProfileId)
        require(profile.enabled) { "Cannot enqueue with a disabled model profile" }
        val position = database.driver.query(
            "SELECT COALESCE(MAX(position), -1) FROM turn_requests WHERE branch_id = ?", 1,
            { bindString(0, branchId) },
            { cursor -> cursor.nextOrFail("queue position"); QueryResult.Value(cursor.long(0, "queue.position") + 1) },
        )
        val thread = database.threads.get(branch.threadId)
        val record = QueueRecord(id, thread.id, branchId, input, QueueStatus.QUEUED, modelProfileId, contextWindowTokens, position, now, now)
        database.driver.exec(
            "INSERT INTO turn_requests(id, thread_id, branch_id, input, status, model_profile_id, context_window_tokens, position, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            10,
        ) {
            bindString(0, record.id); bindString(1, record.threadId); bindString(2, record.branchId); bindString(3, record.input)
            bindString(4, record.status.sqlName); bindString(5, record.modelProfileId); bindLong(6, record.contextWindowTokens)
            bindLong(7, record.position); bindLong(8, record.createdAt); bindLong(9, record.updatedAt)
        }
        record
    }

    public fun get(id: String): QueueRecord = database.driver.query(
        "SELECT id, thread_id, branch_id, input, status, model_profile_id, context_window_tokens, position, created_at, updated_at FROM turn_requests WHERE id = ?",
        1, { bindString(0, id) },
        { cursor -> cursor.nextOrFail("request $id"); QueryResult.Value(cursor.toQueue()) },
    )

    public fun list(branchId: String): List<QueueRecord> = database.driver.query(
        "SELECT id, thread_id, branch_id, input, status, model_profile_id, context_window_tokens, position, created_at, updated_at FROM turn_requests WHERE branch_id = ? AND status IN ('queued', 'running') ORDER BY position ASC",
        1, { bindString(0, branchId) },
        { cursor -> QueryResult.Value(cursor.collect { it.toQueue() }) },
    )

    public fun next(branchId: String): QueueRecord? = database.driver.query(
        "SELECT id, thread_id, branch_id, input, status, model_profile_id, context_window_tokens, position, created_at, updated_at FROM turn_requests WHERE branch_id = ? AND status = 'queued' ORDER BY position ASC LIMIT 1",
        1, { bindString(0, branchId) },
        { cursor -> QueryResult.Value(if (cursor.next().value) cursor.toQueue() else null) },
    )

    public fun updateStatus(id: String, status: QueueStatus, now: Long): QueueRecord {
        get(id)
        database.driver.exec("UPDATE turn_requests SET status = ?, updated_at = ? WHERE id = ?", 3) {
            bindString(0, status.sqlName); bindLong(1, now); bindString(2, id)
        }
        return get(id)
    }
}

private val QueueStatus.sqlName: String
    get() = name.lowercase()

private fun queueStatus(value: String): QueueStatus = runCatching { QueueStatus.valueOf(value.uppercase()) }
    .getOrElse { error("Unknown queue status '$value'") }

internal fun app.cash.sqldelight.db.SqlCursor.toQueue(): QueueRecord = QueueRecord(
    id = string(0, "request.id"), threadId = string(1, "request.threadId"), branchId = string(2, "request.branchId"),
    input = string(3, "request.input"), status = queueStatus(string(4, "request.status")),
    modelProfileId = string(5, "request.modelProfileId"), contextWindowTokens = long(6, "request.contextWindowTokens"),
    position = long(7, "request.position"), createdAt = long(8, "request.createdAt"), updatedAt = long(9, "request.updatedAt"),
)
