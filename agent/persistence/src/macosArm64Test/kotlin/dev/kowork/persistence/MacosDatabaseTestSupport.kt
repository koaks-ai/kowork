package dev.kowork.persistence

import app.cash.sqldelight.db.AfterVersion
import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import app.cash.sqldelight.db.SqlSchema
import app.cash.sqldelight.driver.native.inMemoryDriver

internal actual fun freshPersistenceDatabase(): PersistenceDatabase =
    PersistenceDatabase.create(inMemoryDriver(EmptySchema))

/** inMemoryDriver 已负责打开一个可写的 Native SQLite 连接；正式 schema 由 PersistenceDatabase 创建。 */
private object EmptySchema : SqlSchema<QueryResult.Value<Unit>> {
    override val version: Long = 0

    override fun create(driver: SqlDriver): QueryResult.Value<Unit> = QueryResult.Unit

    override fun migrate(
        driver: SqlDriver,
        oldVersion: Long,
        newVersion: Long,
        vararg callbacks: AfterVersion,
    ): QueryResult.Value<Unit> = QueryResult.Unit
}
