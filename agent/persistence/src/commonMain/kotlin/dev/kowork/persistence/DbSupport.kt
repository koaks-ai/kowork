package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult
import app.cash.sqldelight.db.SqlDriver
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.longOrNull
import org.koaks.json.KoaksWireJson

internal fun SqlDriver.exec(sql: String, parameters: Int = 0, bind: (app.cash.sqldelight.db.SqlPreparedStatement.() -> Unit)? = null) {
    execute(null, sql, parameters, bind)
}

internal fun <T> SqlDriver.query(
    sql: String,
    parameters: Int = 0,
    bind: (app.cash.sqldelight.db.SqlPreparedStatement.() -> Unit)? = null,
    mapper: (app.cash.sqldelight.db.SqlCursor) -> QueryResult<T>,
): T = executeQuery(null, sql, mapper, parameters, bind).value

internal fun app.cash.sqldelight.db.SqlPreparedStatement.bindNullableString(index: Int, value: String?) {
    bindString(index, value)
}

internal fun app.cash.sqldelight.db.SqlPreparedStatement.bindNullableLong(index: Int, value: Long?) {
    bindLong(index, value)
}

internal fun app.cash.sqldelight.db.SqlCursor.nextOrFail(what: String): Boolean {
    check(next().value) { "$what returned no row" }
    return true
}

internal fun app.cash.sqldelight.db.SqlCursor.string(index: Int, what: String): String =
    getString(index) ?: error("$what was NULL")

internal fun app.cash.sqldelight.db.SqlCursor.long(index: Int, what: String): Long =
    getLong(index) ?: error("$what was NULL")

internal fun app.cash.sqldelight.db.SqlCursor.bool(index: Int, what: String): Boolean =
    long(index, what) != 0L

internal fun app.cash.sqldelight.db.SqlCursor.nullableString(index: Int): String? = getString(index)
internal fun app.cash.sqldelight.db.SqlCursor.nullableLong(index: Int): Long? = getLong(index)

internal fun requireNonBlank(value: String, field: String): String =
    value.also { require(it.isNotBlank()) { "$field must not be blank" } }

internal fun requirePositive(value: Long, field: String): Long =
    value.also { require(it > 0) { "$field must be positive" } }

internal fun parseObject(value: String, field: String): JsonObject =
    KoaksWireJson.json.parseToJsonElement(value).jsonObject.also { require(it.isNotEmpty() || value.trim() == "{}") { "$field must be a JSON object" } }

internal fun parseJson(value: String, field: String) =
    KoaksWireJson.json.parseToJsonElement(value).also { require(value.trim().isNotEmpty()) { "$field must contain JSON" } }

internal fun JsonObject.requiredString(name: String): String =
    this[name]?.jsonPrimitive?.contentOrNull?.also { require(it.isNotBlank()) { "$name must not be blank" } }
        ?: error("$name is required")

internal fun JsonObject.requiredLong(name: String): Long = this[name]?.jsonPrimitive?.longOrNull
    ?: error("$name is required")

internal fun JsonObject.optionalString(name: String): String? = this[name]?.jsonPrimitive?.contentOrNull

internal fun JsonObject.optionalObject(name: String): JsonObject? = this[name] as? JsonObject

internal fun JsonObject.optionalLong(name: String): Long? = this[name]?.jsonPrimitive?.longOrNull

internal fun JsonObject.requiredObject(name: String): JsonObject = this[name]?.jsonObject ?: error("$name is required")

internal fun JsonObject.requiredArray(name: String): JsonArray = this[name]?.jsonArray ?: error("$name is required")
