package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class RunRepository(private val database: PersistenceDatabase) {
    public fun create(branchId: String, requestId: String, id: String, now: Long): RunRecord = database.transaction {
        requireNonBlank(id, "run.id")
        val request = database.queue.get(requestId)
        require(request.branchId == branchId) { "Request belongs to another branch" }
        require(request.status == QueueStatus.QUEUED) { "Only queued requests can start a run" }
        val branch = database.branches.get(branchId)
        require(branch.archivedAt == null) { "Cannot create a run in an archived branch" }
        require(!branch.queuePaused) { "Cannot create a run while branch queue is paused" }
        require(database.driver.query(
            "SELECT COUNT(*) FROM runs WHERE branch_id = ? AND status IN ('starting', 'running', 'waiting')",
            1,
            { bindString(0, branchId) },
            { cursor -> cursor.nextOrFail("active run count"); QueryResult.Value(cursor.long(0, "activeRun.count") == 0L) },
        )) { "Branch already has an active run" }
        val run = RunRecord(id, request.id, request.threadId, request.branchId, RunStatus.STARTING, request.modelProfileId, now, null, 0, 0, 0, null)
        database.driver.exec(
            "INSERT INTO runs(id, request_id, thread_id, branch_id, status, model_profile_id, started_at, finished_at, prompt_tokens, completion_tokens, total_tokens, error) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            12,
        ) {
            bindString(0, run.id); bindString(1, run.requestId); bindString(2, run.threadId); bindString(3, run.branchId)
            bindString(4, run.status.sqlName); bindString(5, run.modelProfileId); bindLong(6, run.startedAt)
            bindNullableLong(7, null); bindLong(8, 0); bindLong(9, 0); bindLong(10, 0); bindNullableString(11, null)
        }
        database.queue.updateStatus(request.id, QueueStatus.RUNNING, now)
        run
    }

    public fun get(id: String): RunRecord = database.driver.query(
        "SELECT id, request_id, thread_id, branch_id, status, model_profile_id, started_at, finished_at, prompt_tokens, completion_tokens, total_tokens, error FROM runs WHERE id = ?",
        1, { bindString(0, id) },
        { cursor -> cursor.nextOrFail("run $id"); QueryResult.Value(cursor.toRun()) },
    )

    public fun list(branchId: String): List<RunRecord> = database.driver.query(
        "SELECT id, request_id, thread_id, branch_id, status, model_profile_id, started_at, finished_at, prompt_tokens, completion_tokens, total_tokens, error FROM runs WHERE branch_id = ? ORDER BY started_at ASC",
        1, { bindString(0, branchId) },
        { cursor -> QueryResult.Value(cursor.collect { it.toRun() }) },
    )

    public fun update(run: RunRecord, now: Long): RunRecord = database.transaction {
        updateInTransaction(run, now)
    }

    private fun updateInTransaction(run: RunRecord, now: Long): RunRecord {
        val stored = get(run.id)
        require(run.requestId == stored.requestId && run.threadId == stored.threadId && run.branchId == stored.branchId) {
            "Run identity and ownership fields are immutable"
        }
        require(run.modelProfileId == stored.modelProfileId && run.startedAt == stored.startedAt) {
            "Run model profile and start time are immutable"
        }
        require(run.promptTokens >= 0 && run.completionTokens >= 0 && run.totalTokens >= 0) {
            "Run usage must not be negative"
        }
        database.driver.exec(
            "UPDATE runs SET status = ?, finished_at = ?, prompt_tokens = ?, completion_tokens = ?, total_tokens = ?, error = ? WHERE id = ?",
            7,
        ) {
            bindString(0, run.status.sqlName); bindNullableLong(1, run.finishedAt); bindLong(2, run.promptTokens)
            bindLong(3, run.completionTokens); bindLong(4, run.totalTokens); bindNullableString(5, run.error); bindString(6, run.id)
        }
        database.queue.updateStatus(run.requestId, run.status.queueStatus, now)
        return get(run.id)
    }

    public fun recoverInterrupted(now: Long): List<RunRecord> = database.transaction {
        val active = database.driver.query(
            "SELECT id, request_id, thread_id, branch_id, status, model_profile_id, started_at, finished_at, prompt_tokens, completion_tokens, total_tokens, error FROM runs WHERE status IN ('starting', 'running', 'waiting')",
            mapper = { cursor -> QueryResult.Value(cursor.collect { it.toRun() }) },
        )
        active.forEach { run ->
            updateInTransaction(run.copy(status = RunStatus.INTERRUPTED, finishedAt = now, error = "Agent server restarted"), now)
            database.branches.setQueuePaused(run.branchId, true, now)
        }
        active.map { it.copy(status = RunStatus.INTERRUPTED, finishedAt = now, error = "Agent server restarted") }
    }
}

private val RunStatus.sqlName: String get() = name.lowercase()
private val RunStatus.queueStatus: QueueStatus
    get() = when (this) {
        RunStatus.STARTING, RunStatus.RUNNING, RunStatus.WAITING -> QueueStatus.RUNNING
        RunStatus.COMPLETED -> QueueStatus.COMPLETED
        RunStatus.FAILED -> QueueStatus.FAILED
        RunStatus.CANCELLED -> QueueStatus.CANCELLED
        RunStatus.INTERRUPTED -> QueueStatus.INTERRUPTED
    }

private fun runStatus(value: String): RunStatus = runCatching { RunStatus.valueOf(value.uppercase()) }
    .getOrElse { error("Unknown run status '$value'") }

internal fun app.cash.sqldelight.db.SqlCursor.toRun(): RunRecord = RunRecord(
    id = string(0, "run.id"), requestId = string(1, "run.requestId"), threadId = string(2, "run.threadId"), branchId = string(3, "run.branchId"),
    status = runStatus(string(4, "run.status")), modelProfileId = string(5, "run.modelProfileId"), startedAt = long(6, "run.startedAt"),
    finishedAt = nullableLong(7), promptTokens = long(8, "run.promptTokens"), completionTokens = long(9, "run.completionTokens"),
    totalTokens = long(10, "run.totalTokens"), error = nullableString(11),
)
