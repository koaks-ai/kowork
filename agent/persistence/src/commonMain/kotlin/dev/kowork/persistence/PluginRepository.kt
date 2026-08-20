package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class PluginRepository(private val database: PersistenceDatabase) {
    public fun get(id: String): PluginRecord = database.driver.query(
        "SELECT id, manifest_json, status, install_path, load_error, agent_loaded, installed_at, updated_at FROM plugins WHERE id = ?",
        1, { bindString(0, id) },
        { cursor -> cursor.nextOrFail("plugin $id"); QueryResult.Value(cursor.toPlugin()) },
    )

    public fun upsert(plugin: PluginRecord) {
        requireNonBlank(plugin.id, "plugin.id")
        requireNonBlank(plugin.installPath, "plugin.installPath")
        parseObject(plugin.manifestJson, "plugin.manifestJson")
        database.driver.exec(
            "INSERT INTO plugins(id, manifest_json, status, install_path, load_error, agent_loaded, installed_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET manifest_json = excluded.manifest_json, status = excluded.status, install_path = excluded.install_path, load_error = excluded.load_error, agent_loaded = excluded.agent_loaded, updated_at = excluded.updated_at",
            8,
        ) {
            bindString(0, plugin.id); bindString(1, plugin.manifestJson); bindString(2, plugin.status); bindString(3, plugin.installPath)
            bindNullableString(4, plugin.loadError); bindLong(5, if (plugin.agentLoaded) 1 else 0)
            bindLong(6, plugin.installedAt); bindLong(7, plugin.updatedAt)
        }
    }

    public fun list(): List<PluginRecord> = database.driver.query(
        "SELECT id, manifest_json, status, install_path, load_error, agent_loaded, installed_at, updated_at FROM plugins ORDER BY id",
        mapper = { cursor -> QueryResult.Value(cursor.collect { it.toPlugin() }) },
    )

    public fun putState(pluginId: String, key: String, valueJson: String, now: Long) {
        get(pluginId)
        requireNonBlank(key, "pluginState.key")
        parseJson(valueJson, "pluginState.valueJson")
        database.driver.exec(
            "INSERT INTO plugin_state(plugin_id, key, value_json, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT(plugin_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at",
            4,
        ) { bindString(0, pluginId); bindString(1, key); bindString(2, valueJson); bindLong(3, now) }
    }

    public fun getState(pluginId: String, key: String): String? = database.driver.query(
        "SELECT value_json FROM plugin_state WHERE plugin_id = ? AND key = ?", 2,
        { bindString(0, pluginId); bindString(1, key) },
        { cursor ->
            val value = if (cursor.next().value) cursor.string(0, "pluginState.valueJson") else null
            value?.let { parseJson(it, "pluginState.valueJson") }
            QueryResult.Value(value)
        },
    )
}

internal fun app.cash.sqldelight.db.SqlCursor.toPlugin(): PluginRecord = PluginRecord(
    id = string(0, "plugin.id"), manifestJson = string(1, "plugin.manifestJson").also { parseObject(it, "plugin.manifestJson") },
    status = string(2, "plugin.status"),
    installPath = string(3, "plugin.installPath"), loadError = nullableString(4), agentLoaded = bool(5, "plugin.agentLoaded"),
    installedAt = long(6, "plugin.installedAt"), updatedAt = long(7, "plugin.updatedAt"),
)
