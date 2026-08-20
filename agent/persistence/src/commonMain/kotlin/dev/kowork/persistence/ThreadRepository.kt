package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class ThreadRepository(private val database: PersistenceDatabase) {
    public fun create(thread: ThreadRecord) {
        requireNonBlank(thread.id, "thread.id")
        requireNonBlank(thread.title, "thread.title")
        val project = database.projects.get(thread.projectId)
        require(project.deletedAt == null) { "Cannot add a thread to an archived project" }
        require(database.providers.getModelProfile(thread.modelProfileId).enabled) {
            "Cannot create a thread with a disabled model profile"
        }
        thread.contextWindowTokens?.let { requirePositive(it, "thread.contextWindowTokens") }
        database.driver.exec(
            "INSERT INTO threads(id, project_id, title, model_profile_id, permission_mode, context_window_tokens, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            9,
        ) {
            bindString(0, thread.id); bindString(1, thread.projectId); bindString(2, thread.title)
            bindString(3, thread.modelProfileId); bindString(4, thread.permissionMode)
            bindNullableLong(5, thread.contextWindowTokens); bindLong(6, thread.createdAt)
            bindLong(7, thread.updatedAt); bindNullableLong(8, thread.deletedAt)
        }
    }

    public fun createWithMainBranch(thread: ThreadRecord, branch: BranchRecord) {
        require(branch.kind == BranchKind.MAIN) { "A thread must be created with a main branch" }
        require(branch.threadId == thread.id) { "Main branch belongs to another thread" }
        database.transaction { create(thread); database.branches.createMain(branch) }
    }

    public fun get(id: String): ThreadRecord = database.driver.query(
        "SELECT id, project_id, title, model_profile_id, permission_mode, context_window_tokens, created_at, updated_at, deleted_at FROM threads WHERE id = ?",
        1, { bindString(0, id) },
    ) { cursor -> cursor.nextOrFail("thread $id"); QueryResult.Value(cursor.toThread()) }

    public fun list(projectId: String, includeDeleted: Boolean = false): List<ThreadRecord> = database.driver.query(
        "SELECT id, project_id, title, model_profile_id, permission_mode, context_window_tokens, created_at, updated_at, deleted_at FROM threads WHERE project_id = ? AND (? = 1 OR deleted_at IS NULL) ORDER BY updated_at DESC",
        parameters = 2,
        bind = { bindString(0, projectId); bindLong(1, if (includeDeleted) 1 else 0) },
        mapper = { cursor -> QueryResult.Value(cursor.collect { it.toThread() }) },
    )

    public fun archive(id: String, at: Long) {
        get(id)
        database.driver.exec("UPDATE threads SET deleted_at = ?, updated_at = ? WHERE id = ?", 3) {
            bindLong(0, at); bindLong(1, at); bindString(2, id)
        }
    }

    public fun restore(id: String, at: Long) {
        get(id)
        database.driver.exec("UPDATE threads SET deleted_at = NULL, updated_at = ? WHERE id = ?", 2) {
            bindLong(0, at); bindString(1, id)
        }
    }
}

internal fun app.cash.sqldelight.db.SqlCursor.toThread(): ThreadRecord = ThreadRecord(
    id = string(0, "thread.id"), projectId = string(1, "thread.projectId"), title = string(2, "thread.title"),
    modelProfileId = string(3, "thread.modelProfileId"), permissionMode = string(4, "thread.permissionMode"),
    contextWindowTokens = nullableLong(5), createdAt = long(6, "thread.createdAt"),
    updatedAt = long(7, "thread.updatedAt"), deletedAt = nullableLong(8),
)
