package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class ProjectRepository(private val database: PersistenceDatabase) {
    public fun create(project: ProjectRecord) {
        requireNonBlank(project.id, "project.id")
        requireNonBlank(project.name, "project.name")
        requireNonBlank(project.rootPath, "project.rootPath")
        database.driver.exec(
            "INSERT INTO projects(id, name, root_path, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?)",
            6,
        ) {
            bindString(0, project.id); bindString(1, project.name); bindString(2, project.rootPath)
            bindLong(3, project.createdAt); bindLong(4, project.updatedAt); bindNullableLong(5, project.deletedAt)
        }
    }

    public fun get(id: String): ProjectRecord = database.driver.query(
        "SELECT id, name, root_path, created_at, updated_at, deleted_at FROM projects WHERE id = ?", 1,
        { bindString(0, id) },
    ) { cursor ->
        cursor.nextOrFail("project $id")
        QueryResult.Value(cursor.toProject())
    }

    public fun list(includeDeleted: Boolean = false): List<ProjectRecord> = database.driver.query(
        "SELECT id, name, root_path, created_at, updated_at, deleted_at FROM projects WHERE (? = 1 OR deleted_at IS NULL) ORDER BY updated_at DESC",
        1, { bindLong(0, if (includeDeleted) 1 else 0) },
    ) { cursor -> QueryResult.Value(cursor.collect { it.toProject() }) }

    public fun archive(id: String, at: Long) {
        get(id)
        database.driver.exec("UPDATE projects SET deleted_at = ?, updated_at = ? WHERE id = ?", 3) {
            bindLong(0, at); bindLong(1, at); bindString(2, id)
        }
    }

    public fun restore(id: String, at: Long) {
        get(id)
        database.driver.exec("UPDATE projects SET deleted_at = NULL, updated_at = ? WHERE id = ?", 2) {
            bindLong(0, at); bindString(1, id)
        }
    }
}

internal fun app.cash.sqldelight.db.SqlCursor.toProject(): ProjectRecord = ProjectRecord(
    id = string(0, "project.id"), name = string(1, "project.name"), rootPath = string(2, "project.rootPath"),
    createdAt = long(3, "project.createdAt"), updatedAt = long(4, "project.updatedAt"), deletedAt = nullableLong(5),
)

internal inline fun <T> app.cash.sqldelight.db.SqlCursor.collect(mapper: (app.cash.sqldelight.db.SqlCursor) -> T): List<T> {
    val result = mutableListOf<T>()
    while (next().value) result += mapper(this)
    return result
}
