package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class BranchRepository(private val database: PersistenceDatabase) {
    public fun createMain(branch: BranchRecord) {
        require(branch.kind == BranchKind.MAIN) { "Main branch kind must be MAIN" }
        require(branch.parentBranchId == null && branch.forkTurnId == null) { "Main branch cannot have a fork parent" }
        create(branch)
    }

    public fun create(branch: BranchRecord) {
        requireNonBlank(branch.id, "branch.id")
        require(branch.updatedAt >= branch.createdAt) { "Branch updatedAt must not precede createdAt" }
        val thread = database.threads.get(branch.threadId)
        require(thread.deletedAt == null) { "Cannot add a branch to an archived thread" }
        if (branch.kind == BranchKind.MAIN) {
            require(branch.parentBranchId == null && branch.forkTurnId == null) { "Main branch cannot have a fork parent" }
            require(branch.headTurnId == null) { "A new main branch cannot start with a head turn" }
            require(list(branch.threadId, includeArchived = true).none { it.kind == BranchKind.MAIN }) {
                "Thread '${branch.threadId}' already has a main branch"
            }
        } else {
            require(branch.parentBranchId != null && branch.forkTurnId != null) {
                "Fork and side chat branches require a parent branch and fork turn"
            }
            require(branch.headTurnId == null) { "A new fork branch cannot start with a copied head turn" }
            val source = get(branch.parentBranchId)
            require(source.threadId == branch.threadId) { "Fork parent belongs to another thread" }
            require(source.archivedAt == null) { "Cannot fork an archived source branch" }
            val forkTurn = database.conversations.getTurn(branch.forkTurnId)
            require(forkTurn.threadId == branch.threadId) { "Fork turn belongs to another thread" }
            require(branch.createdAt >= forkTurn.createdAt) { "Branch cannot be created before its fork turn" }
            require(database.conversations.isInLineage(source.id, forkTurn.id)) {
                "Fork turn is not in source branch lineage"
            }
        }
        database.driver.exec(
            "INSERT INTO conversation_branches(id, thread_id, parent_branch_id, fork_turn_id, head_turn_id, kind, queue_paused, archived_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            10,
        ) {
            bindString(0, branch.id); bindString(1, branch.threadId); bindNullableString(2, branch.parentBranchId)
            bindNullableString(3, branch.forkTurnId); bindNullableString(4, branch.headTurnId)
            bindString(5, branch.kind.sqlName); bindLong(6, if (branch.queuePaused) 1 else 0)
            bindNullableLong(7, branch.archivedAt); bindLong(8, branch.createdAt); bindLong(9, branch.updatedAt)
        }
    }

    public fun forkBranch(
        threadId: String,
        sourceBranchId: String,
        forkTurnId: String,
        id: String,
        kind: BranchKind = BranchKind.FORK,
        now: Long,
    ): BranchRecord = database.transaction {
        require(kind == BranchKind.FORK || kind == BranchKind.SIDE_CHAT) { "Only fork or side chat branches can be forked" }
        val source = get(sourceBranchId)
        require(source.threadId == threadId) { "Source branch belongs to another thread" }
        val turn = database.conversations.getTurn(forkTurnId)
        require(turn.threadId == threadId) { "Fork turn belongs to another thread" }
        require(database.conversations.isInLineage(sourceBranchId, forkTurnId)) { "Fork turn is not in source lineage" }
        require(source.archivedAt == null) { "Cannot fork an archived source branch" }
        val branch = BranchRecord(id, threadId, sourceBranchId, forkTurnId, null, kind, false, null, now, now)
        create(branch)
        branch
    }

    public fun get(id: String): BranchRecord = database.driver.query(
        "SELECT id, thread_id, parent_branch_id, fork_turn_id, head_turn_id, kind, queue_paused, archived_at, created_at, updated_at FROM conversation_branches WHERE id = ?",
        1,
        { bindString(0, id) },
        { cursor -> cursor.nextOrFail("branch $id"); QueryResult.Value(cursor.toBranch()) },
    )

    public fun list(threadId: String, includeArchived: Boolean = false): List<BranchRecord> = database.driver.query(
        "SELECT id, thread_id, parent_branch_id, fork_turn_id, head_turn_id, kind, queue_paused, archived_at, created_at, updated_at FROM conversation_branches WHERE thread_id = ? AND (? = 1 OR archived_at IS NULL) ORDER BY created_at ASC",
        2,
        { bindString(0, threadId); bindLong(1, if (includeArchived) 1 else 0) },
        { cursor -> QueryResult.Value(cursor.collect { it.toBranch() }) },
    )

    public fun archive(id: String, now: Long) {
        val branch = get(id)
        require(branch.kind != BranchKind.MAIN) { "The main branch cannot be archived" }
        val activeWork = database.driver.query(
            """
            SELECT
              (SELECT COUNT(*) FROM turn_requests WHERE branch_id = ? AND status IN ('queued', 'running')) +
              (SELECT COUNT(*) FROM runs WHERE branch_id = ? AND status IN ('starting', 'running', 'waiting'))
            """.trimIndent(),
            2,
            { bindString(0, id); bindString(1, id) },
            { cursor -> cursor.nextOrFail("branch active work"); QueryResult.Value(cursor.long(0, "branch.activeWork")) },
        )
        require(activeWork == 0L) { "Cannot archive a branch with queued or running work" }
        database.driver.exec("UPDATE conversation_branches SET archived_at = ?, updated_at = ? WHERE id = ?", 3) {
            bindLong(0, now); bindLong(1, now); bindString(2, id)
        }
    }

    public fun restore(id: String, now: Long) {
        get(id)
        database.driver.exec("UPDATE conversation_branches SET archived_at = NULL, updated_at = ? WHERE id = ?", 2) {
            bindLong(0, now); bindString(1, id)
        }
    }

    public fun setQueuePaused(id: String, paused: Boolean, now: Long) {
        get(id)
        database.driver.exec("UPDATE conversation_branches SET queue_paused = ?, updated_at = ? WHERE id = ?", 3) {
            bindLong(0, if (paused) 1 else 0); bindLong(1, now); bindString(2, id)
        }
    }

    internal fun updateHead(branchId: String, turnId: String, now: Long) {
        database.driver.exec("UPDATE conversation_branches SET head_turn_id = ?, updated_at = ? WHERE id = ?", 3) {
            bindString(0, turnId); bindLong(1, now); bindString(2, branchId)
        }
    }
}

private val BranchKind.sqlName: String
    get() = when (this) {
        BranchKind.MAIN -> "main"
        BranchKind.FORK -> "fork"
        BranchKind.SIDE_CHAT -> "side_chat"
    }

private fun branchKind(value: String): BranchKind = when (value) {
    "main" -> BranchKind.MAIN
    "fork" -> BranchKind.FORK
    "side_chat" -> BranchKind.SIDE_CHAT
    else -> error("Unknown branch kind '$value'")
}

internal fun app.cash.sqldelight.db.SqlCursor.toBranch(): BranchRecord = BranchRecord(
    id = string(0, "branch.id"), threadId = string(1, "branch.threadId"), parentBranchId = nullableString(2),
    forkTurnId = nullableString(3), headTurnId = nullableString(4), kind = branchKind(string(5, "branch.kind")),
    queuePaused = bool(6, "branch.queuePaused"), archivedAt = nullableLong(7),
    createdAt = long(8, "branch.createdAt"), updatedAt = long(9, "branch.updatedAt"),
)
