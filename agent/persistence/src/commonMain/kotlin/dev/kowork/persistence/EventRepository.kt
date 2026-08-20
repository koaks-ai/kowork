package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class EventRepository(private val database: PersistenceDatabase) {
    public fun append(event: EventRecord): EventRecord {
        requireNonBlank(event.id, "event.id")
        requireNonBlank(event.type, "event.type")
        parseJson(event.payloadJson, "event.payloadJson")
        val thread = event.threadId?.let(database.threads::get)
        require(event.projectId == null || thread == null || thread.projectId == event.projectId) {
            "Event project and thread do not match"
        }
        val branch = event.branchId?.let(database.branches::get)
        require(branch == null || branch.threadId == event.threadId) { "Event branch and thread do not match" }
        val run = event.runId?.let(database.runs::get)
        require(run == null || run.branchId == event.branchId) { "Run events must include the run branch" }
        require(run == null || run.threadId == event.threadId) { "Event run and thread do not match" }
        database.driver.exec(
            "INSERT INTO run_events(id, project_id, thread_id, branch_id, run_id, type, payload_json, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            8,
        ) {
            bindString(0, event.id); bindNullableString(1, event.projectId); bindNullableString(2, event.threadId)
            bindNullableString(3, event.branchId); bindNullableString(4, event.runId); bindString(5, event.type)
            bindString(6, event.payloadJson); bindLong(7, event.createdAt)
        }
        return database.driver.query(
            "SELECT sequence, id, project_id, thread_id, branch_id, run_id, type, payload_json, created_at FROM run_events WHERE id = ?",
            1, { bindString(0, event.id) },
            { cursor -> cursor.nextOrFail("event ${event.id}"); QueryResult.Value(cursor.toEvent()) },
        )
    }

    public fun list(afterSequence: Long = 0, branchId: String? = null, limit: Long = 2_000): List<EventRecord> {
        require(afterSequence >= 0) { "afterSequence must not be negative" }
        require(limit in 1..2_000) { "limit must be between 1 and 2000" }
        return database.driver.query(
            "SELECT sequence, id, project_id, thread_id, branch_id, run_id, type, payload_json, created_at FROM run_events WHERE sequence > ? AND (? IS NULL OR branch_id = ?) ORDER BY sequence ASC LIMIT ?",
            4,
            { bindLong(0, afterSequence); bindNullableString(1, branchId); bindNullableString(2, branchId); bindLong(3, limit) },
            { cursor -> QueryResult.Value(cursor.collect { it.toEvent() }) },
        )
    }

    public fun lastSequence(): Long = database.driver.query(
        "SELECT COALESCE(MAX(sequence), 0) FROM run_events",
        mapper = { cursor -> cursor.nextOrFail("event sequence"); QueryResult.Value(cursor.long(0, "event.sequence")) },
    )
}

internal fun app.cash.sqldelight.db.SqlCursor.toEvent(): EventRecord = EventRecord(
    sequence = long(0, "event.sequence"), id = string(1, "event.id"), projectId = nullableString(2),
    threadId = nullableString(3), branchId = nullableString(4), runId = nullableString(5), type = string(6, "event.type"),
    payloadJson = string(7, "event.payloadJson").also { parseJson(it, "event.payloadJson") },
    createdAt = long(8, "event.createdAt"),
)
