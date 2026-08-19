package dev.kowork.agent.spike.persistence

import app.cash.sqldelight.db.AfterVersion
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import app.cash.sqldelight.driver.native.NativeSqliteDriver
import app.cash.sqldelight.driver.native.inMemoryDriver

class NativeSqliteEventStore : SpikeEventStore {
    private val driver: NativeSqliteDriver = inMemoryDriver(SpikeSchema)

    override fun append(type: String, kapJson: String, koaksJson: String): Long {
        driver.execute(
            identifier = null,
            sql = "INSERT INTO spike_events(type, kap_json, koaks_json) VALUES (?, ?, ?)",
            parameters = 3,
        ) {
            bindString(0, type)
            bindString(1, kapJson)
            bindString(2, koaksJson)
        }.value
        return driver.executeQuery(null, "SELECT last_insert_rowid()", { cursor ->
            check(cursor.next().value) { "last_insert_rowid returned no row" }
            QueryResult.Value(checkNotNull(cursor.getLong(0)))
        }, 0, null).value
    }

    override fun count(): Long = driver.executeQuery(null, "SELECT COUNT(*) FROM spike_events", { cursor ->
        check(cursor.next().value) { "COUNT returned no row" }
        QueryResult.Value(checkNotNull(cursor.getLong(0)))
    }, 0, null).value

    override fun read(sequence: Long): StoredSpikeEvent = driver.executeQuery(
        identifier = null,
        sql = "SELECT sequence, type, kap_json, koaks_json FROM spike_events WHERE sequence = ?",
        mapper = { cursor ->
            check(cursor.next().value) { "spike event $sequence was not persisted" }
            QueryResult.Value(
                StoredSpikeEvent(
                    sequence = checkNotNull(cursor.getLong(0)),
                    type = checkNotNull(cursor.getString(1)),
                    kapJson = checkNotNull(cursor.getString(2)),
                    koaksJson = checkNotNull(cursor.getString(3)),
                ),
            )
        },
        parameters = 1,
        binders = { bindLong(0, sequence) },
    ).value

    override fun close() = driver.close()

    private object SpikeSchema : SqlSchema<QueryResult.Value<Unit>> {
        override val version: Long = 1

        override fun create(driver: SqlDriver): QueryResult.Value<Unit> {
            driver.execute(
                null,
                """
                    CREATE TABLE spike_events (
                        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                        type TEXT NOT NULL,
                        kap_json TEXT NOT NULL,
                        koaks_json TEXT NOT NULL
                    )
                """.trimIndent(),
                0,
                null,
            ).value
            return QueryResult.Unit
        }

        override fun migrate(
            driver: SqlDriver,
            oldVersion: Long,
            newVersion: Long,
            vararg callbacks: AfterVersion,
        ): QueryResult.Value<Unit> = error("phase3-spike has no database migrations")
    }
}
