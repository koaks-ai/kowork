package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.driver.jdbc.sqlite.JdbcSqliteDriver
import java.nio.file.Files
import kotlin.test.Test
import kotlin.test.assertEquals

class JvmDatabaseConfigurationTest {
    @Test
    fun fileDatabaseUsesWalAndReopensAtCurrentSchema() {
        val path = Files.createTempFile("kowork-persistence-", ".db")
        try {
            PersistenceDatabase.open(JdbcSqliteDriver("jdbc:sqlite:$path")).use { database ->
                val journalMode = database.driver.query(
                    "PRAGMA journal_mode",
                    mapper = { cursor ->
                        cursor.nextOrFail("journal_mode")
                        QueryResult.Value(cursor.string(0, "journal_mode"))
                    },
                )
                assertEquals("wal", journalMode.lowercase())
            }
            PersistenceDatabase.open(JdbcSqliteDriver("jdbc:sqlite:$path")).use { database ->
                val version = database.driver.query(
                    "PRAGMA user_version",
                    mapper = { cursor ->
                        cursor.nextOrFail("user_version")
                        QueryResult.Value(cursor.long(0, "user_version"))
                    },
                )
                assertEquals(PersistenceDatabase.schema.version, version)
            }
        } finally {
            Files.deleteIfExists(path.resolveSibling("${path.fileName}-shm"))
            Files.deleteIfExists(path.resolveSibling("${path.fileName}-wal"))
            Files.deleteIfExists(path)
        }
    }

    @Test
    fun baselineMigrationBuildsCurrentSchemaFromVersionOne() {
        val path = Files.createTempFile("kowork-persistence-migration-", ".db")
        try {
            val driver = JdbcSqliteDriver("jdbc:sqlite:$path")
            driver.execute(null, "PRAGMA user_version = 1", 0)
            PersistenceDatabase.open(driver).use { database ->
                val tableCount = database.driver.query(
                    "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'",
                    mapper = { cursor ->
                        cursor.nextOrFail("table count")
                        QueryResult.Value(cursor.long(0, "table count"))
                    },
                )
                assertEquals(15, tableCount)
                val version = database.driver.query(
                    "PRAGMA user_version",
                    mapper = { cursor ->
                        cursor.nextOrFail("user_version")
                        QueryResult.Value(cursor.long(0, "user_version"))
                    },
                )
                assertEquals(PersistenceDatabase.schema.version, version)
            }
        } finally {
            Files.deleteIfExists(path.resolveSibling("${path.fileName}-shm"))
            Files.deleteIfExists(path.resolveSibling("${path.fileName}-wal"))
            Files.deleteIfExists(path)
        }
    }
}
