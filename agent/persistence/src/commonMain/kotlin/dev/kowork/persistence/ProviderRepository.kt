package dev.kowork.persistence

import app.cash.sqldelight.db.QueryResult

public class ProviderRepository(private val database: PersistenceDatabase) {
    public fun create(provider: ProviderRecord) {
        requireNonBlank(provider.id, "provider.id")
        requireNonBlank(provider.name, "provider.name")
        requireNonBlank(provider.kind, "provider.kind")
        requireNonBlank(provider.protocol, "provider.protocol")
        requireNonBlank(provider.baseUrl, "provider.baseUrl")
        requirePositive(provider.defaultContextWindowTokens, "provider.defaultContextWindowTokens")
        database.driver.exec(
            "INSERT INTO providers(id, name, kind, protocol, base_url, credential_ciphertext, default_context_window_tokens, enabled, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
            11,
        ) {
            bindString(0, provider.id); bindString(1, provider.name); bindString(2, provider.kind); bindString(3, provider.protocol)
            bindString(4, provider.baseUrl); bindNullableString(5, provider.credentialCiphertext); bindLong(6, provider.defaultContextWindowTokens)
            bindLong(7, if (provider.enabled) 1 else 0); bindLong(8, provider.createdAt); bindLong(9, provider.updatedAt)
            bindNullableLong(10, provider.deletedAt)
        }
    }

    public fun get(id: String): ProviderRecord = database.driver.query(
        "SELECT id, name, kind, protocol, base_url, credential_ciphertext, default_context_window_tokens, enabled, created_at, updated_at, deleted_at FROM providers WHERE id = ?",
        1, { bindString(0, id) },
        { cursor -> cursor.nextOrFail("provider $id"); QueryResult.Value(cursor.toProvider()) },
    )

    public fun list(includeDeleted: Boolean = false): List<ProviderRecord> = database.driver.query(
        "SELECT id, name, kind, protocol, base_url, credential_ciphertext, default_context_window_tokens, enabled, created_at, updated_at, deleted_at FROM providers WHERE (? = 1 OR deleted_at IS NULL) ORDER BY name ASC",
        1, { bindLong(0, if (includeDeleted) 1 else 0) },
        { cursor -> QueryResult.Value(cursor.collect { it.toProvider() }) },
    )

    public fun createModelProfile(profile: ModelProfileRecord) {
        requireNonBlank(profile.id, "modelProfile.id")
        requireNonBlank(profile.name, "modelProfile.name")
        requireNonBlank(profile.model, "modelProfile.model")
        requireNonBlank(profile.source, "modelProfile.source")
        requirePositive(profile.contextWindowTokens, "modelProfile.contextWindowTokens")
        get(profile.providerId)
        database.driver.exec(
            "INSERT INTO model_profiles(id, provider_id, name, model, context_window_tokens, source, enabled, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
            9,
        ) {
            bindString(0, profile.id); bindString(1, profile.providerId); bindString(2, profile.name); bindString(3, profile.model)
            bindLong(4, profile.contextWindowTokens); bindString(5, profile.source); bindLong(6, if (profile.enabled) 1 else 0)
            bindLong(7, profile.createdAt); bindLong(8, profile.updatedAt)
        }
    }

    public fun getModelProfile(id: String): ModelProfileRecord = database.driver.query(
        "SELECT id, provider_id, name, model, context_window_tokens, source, enabled, created_at, updated_at FROM model_profiles WHERE id = ?",
        1, { bindString(0, id) },
        { cursor -> cursor.nextOrFail("model profile $id"); QueryResult.Value(cursor.toModelProfile()) },
    )

    public fun listModelProfiles(providerId: String? = null): List<ModelProfileRecord> = database.driver.query(
        "SELECT id, provider_id, name, model, context_window_tokens, source, enabled, created_at, updated_at FROM model_profiles WHERE (? IS NULL OR provider_id = ?) ORDER BY name ASC",
        2, { bindNullableString(0, providerId); bindNullableString(1, providerId) },
        { cursor -> QueryResult.Value(cursor.collect { it.toModelProfile() }) },
    )
}

internal fun app.cash.sqldelight.db.SqlCursor.toProvider(): ProviderRecord = ProviderRecord(
    id = string(0, "provider.id"), name = string(1, "provider.name"), kind = string(2, "provider.kind"), protocol = string(3, "provider.protocol"),
    baseUrl = string(4, "provider.baseUrl"), credentialCiphertext = nullableString(5), defaultContextWindowTokens = long(6, "provider.contextWindowTokens"),
    enabled = bool(7, "provider.enabled"), createdAt = long(8, "provider.createdAt"), updatedAt = long(9, "provider.updatedAt"), deletedAt = nullableLong(10),
)

internal fun app.cash.sqldelight.db.SqlCursor.toModelProfile(): ModelProfileRecord = ModelProfileRecord(
    id = string(0, "modelProfile.id"), providerId = string(1, "modelProfile.providerId"), name = string(2, "modelProfile.name"),
    model = string(3, "modelProfile.model"), contextWindowTokens = long(4, "modelProfile.contextWindowTokens"), source = string(5, "modelProfile.source"),
    enabled = bool(6, "modelProfile.enabled"), createdAt = long(7, "modelProfile.createdAt"), updatedAt = long(8, "modelProfile.updatedAt"),
)
