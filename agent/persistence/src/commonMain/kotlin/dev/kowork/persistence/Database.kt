package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import dev.kowork.persistence.db.AgentDatabase

/** SQLDelight runtime 的装配层。schema 唯一真源是 commonMain/sqldelight 下的 `.sq` 与 `.sqm`。 */
public class PersistenceDatabase private constructor(
    public val driver: SqlDriver,
    private val closeDriver: Boolean,
) : AutoCloseable {
    public companion object {
        public val schema: SqlSchema<QueryResult.Value<Unit>>
            get() = AgentDatabase.Schema

        /** 为全新数据库创建 schema 后打开。旧 TS SQLite 数据不属于该入口。 */
        public fun create(driver: SqlDriver, closeDriver: Boolean = true): PersistenceDatabase {
            configure(driver)
            schema.create(driver).value
            setSchemaVersion(driver)
            return PersistenceDatabase(driver, closeDriver)
        }

        /** 打开数据库；空库建立基线，旧的 Kotlin schema 按 SQLDelight migration 前进。 */
        public fun open(driver: SqlDriver, closeDriver: Boolean = true): PersistenceDatabase {
            configure(driver)
            val currentVersion = readSchemaVersion(driver)
            when {
                currentVersion == 0L && hasUserTables(driver) -> {
                    error("Database has tables but no KoWork schema version; refusing implicit compatibility conversion")
                }
                currentVersion == 0L -> {
                    schema.create(driver).value
                    setSchemaVersion(driver)
                }
                currentVersion < schema.version -> {
                    schema.migrate(driver, currentVersion, schema.version).value
                    setSchemaVersion(driver)
                }
                currentVersion > schema.version -> {
                    error("Database schema version $currentVersion is newer than supported ${schema.version}")
                }
            }
            return PersistenceDatabase(driver, closeDriver)
        }

        private fun configure(driver: SqlDriver) {
            driver.execute(null, "PRAGMA foreign_keys = ON", 0)
            executePragma(driver, "PRAGMA journal_mode = WAL")
        }

        private fun readSchemaVersion(driver: SqlDriver): Long = driver.executeQuery(
            null,
            "PRAGMA user_version",
            { cursor ->
                check(cursor.next().value) { "PRAGMA user_version returned no row" }
                QueryResult.Value(cursor.getLong(0) ?: error("PRAGMA user_version was NULL"))
            },
            0,
        ).value

        private fun setSchemaVersion(driver: SqlDriver) {
            driver.execute(null, "PRAGMA user_version = ${schema.version}", 0)
        }

        private fun executePragma(driver: SqlDriver, sql: String) {
            driver.executeQuery(
                null,
                sql,
                { cursor ->
                    while (cursor.next().value) Unit
                    QueryResult.Unit
                },
                0,
            ).value
        }

        private fun hasUserTables(driver: SqlDriver): Boolean = driver.executeQuery(
            null,
            "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
            { cursor ->
                check(cursor.next().value) { "sqlite_master returned no row" }
                QueryResult.Value((cursor.getLong(0) ?: error("sqlite_master count was NULL")) > 0L)
            },
            0,
        ).value
    }

    public val projects: ProjectRepository by lazy { ProjectRepository(this) }
    public val threads: ThreadRepository by lazy { ThreadRepository(this) }
    public val branches: BranchRepository by lazy { BranchRepository(this) }
    public val queue: QueueRepository by lazy { QueueRepository(this) }
    public val runs: RunRepository by lazy { RunRepository(this) }
    public val events: EventRepository by lazy { EventRepository(this) }
    public val approvals: ApprovalRepository by lazy { ApprovalRepository(this) }
    public val pathGrants: PathGrantRepository by lazy { PathGrantRepository(this) }
    public val conversations: ConversationRepository by lazy { ConversationRepository(this) }
    public val providers: ProviderRepository by lazy { ProviderRepository(this) }
    public val settings: SettingsRepository by lazy { SettingsRepository(this) }
    public val plugins: PluginRepository by lazy { PluginRepository(this) }

    public fun <T> transaction(block: () -> T): T {
        driver.exec("BEGIN IMMEDIATE")
        return try {
            val result = block()
            driver.exec("COMMIT")
            result
        } catch (error: Throwable) {
            driver.exec("ROLLBACK")
            throw error
        }
    }

    override fun close() {
        if (closeDriver) driver.close()
    }
}
