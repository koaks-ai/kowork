package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class SettingsRepository(private val database: PersistenceDatabase) {
    public fun put(key: String, valueJson: String, now: Long) {
        requireNonBlank(key, "settings.key")
        require(valueJson.trim().isNotEmpty()) { "settings.$key must contain JSON" }
        dev.kowork.persistence.parseJson(valueJson, "settings.$key")
        database.driver.exec(
            "INSERT INTO app_settings(key, value_json, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            3,
        ) { bindString(0, key); bindString(1, valueJson); bindLong(2, now) }
    }

    public fun get(key: String): String? = database.driver.query(
        "SELECT value_json FROM app_settings WHERE key = ?", 1, { bindString(0, key) },
        { cursor ->
            val value = if (cursor.next().value) cursor.string(0, "settings.$key") else null
            value?.let { parseJson(it, "settings.$key") }
            QueryResult.Value(value)
        },
    )
}
