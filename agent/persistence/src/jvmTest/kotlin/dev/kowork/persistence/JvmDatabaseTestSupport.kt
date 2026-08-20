package dev.kowork.persistence

import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver

internal actual fun freshPersistenceDatabase(): PersistenceDatabase =
    PersistenceDatabase.create(JdbcSqliteDriver(JdbcSqliteDriver.IN_MEMORY))
