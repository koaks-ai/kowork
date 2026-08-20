package dev.kowork.persistence

public data class PathGrantRecord(
    val id: String,
    val runId: String,
    val branchId: String,
    val rootPath: String,
    val accessMode: String,
    val isDirectory: Boolean,
    val createdAt: Long,
)

public class PathGrantRepository(private val database: PersistenceDatabase) {
    public fun create(grant: PathGrantRecord) {
        requireNonBlank(grant.id, "pathGrant.id")
        requireNonBlank(grant.accessMode, "pathGrant.accessMode")
        val branch = database.branches.get(grant.branchId)
        val run = database.runs.get(grant.runId)
        require(run.branchId == branch.id) { "Path grant run belongs to another branch" }
        requireNonBlank(grant.rootPath, "pathGrant.rootPath")
        database.driver.exec(
            "INSERT INTO path_grants(id, run_id, branch_id, root_path, access_mode, is_directory, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
            7,
        ) {
            bindString(0, grant.id); bindString(1, grant.runId); bindString(2, grant.branchId); bindString(3, grant.rootPath)
            bindString(4, grant.accessMode); bindLong(5, if (grant.isDirectory) 1 else 0); bindLong(6, grant.createdAt)
        }
    }

    public fun list(runId: String): List<PathGrantRecord> = database.driver.query(
        "SELECT id, run_id, branch_id, root_path, access_mode, is_directory, created_at FROM path_grants WHERE run_id = ? ORDER BY created_at ASC",
        1, { bindString(0, runId) },
        { cursor -> app.cash.sqldelight.db.QueryResult.Value(cursor.collect { it.toPathGrant() }) },
    )
}

internal fun app.cash.sqldelight.db.SqlCursor.toPathGrant(): PathGrantRecord = PathGrantRecord(
    id = string(0, "grant.id"), runId = string(1, "grant.runId"), branchId = string(2, "grant.branchId"), rootPath = string(3, "grant.rootPath"),
    accessMode = string(4, "grant.accessMode"), isDirectory = bool(5, "grant.isDirectory"), createdAt = long(6, "grant.createdAt"),
)
