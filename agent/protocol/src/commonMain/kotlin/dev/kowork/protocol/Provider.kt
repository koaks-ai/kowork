package dev.kowork.protocol

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
enum class ProviderKind {
    @SerialName("openai")
    OPENAI,

    @SerialName("anthropic")
    ANTHROPIC,

    @SerialName("qwen")
    QWEN,

    @SerialName("custom")
    CUSTOM
}

@Serializable
enum class ProviderProtocol {
    @SerialName("openai-chat")
    OPENAI_CHAT,

    @SerialName("openai-responses")
    OPENAI_RESPONSES,

    @SerialName("anthropic")
    ANTHROPIC,

    @SerialName("qwen")
    QWEN
}

@Serializable
enum class ModelSource {
    @SerialName("builtin")
    BUILTIN,

    @SerialName("remote")
    REMOTE,

    @SerialName("manual")
    MANUAL
}

/**
 * 供应商。
 *
 * [credentialConfigured] 只表示「server 上存了密钥」，密钥本身**永远不会回传**给客户端：
 * 只能覆盖或清除。
 */
@Serializable
data class Provider(
    val id: String,
    val name: String,
    val kind: ProviderKind,
    val protocol: ProviderProtocol,
    val baseUrl: String,
    val credentialConfigured: Boolean,
    val enabled: Boolean,
    /** `enabled && credentialConfigured`，由 server 计算，客户端不要自己推导。 */
    val available: Boolean,
    val builtin: Boolean,
    val defaultContextWindowTokens: Long,
    val createdAt: Long,
    val updatedAt: Long
) {
    init {
        requireNonBlank(id, "provider.id")
        requireHttpUrl(baseUrl, "provider.baseUrl")
        requirePositive(defaultContextWindowTokens, "provider.defaultContextWindowTokens")
        requireNonNegative(createdAt, "provider.createdAt")
        requireNonNegative(updatedAt, "provider.updatedAt")
    }
}

@Serializable
data class ModelProfile(
    val id: String,
    val providerId: String,
    val name: String,
    val model: String,
    val contextWindowTokens: Long,
    val source: ModelSource,
    val enabled: Boolean,
    /** `enabled && provider.available`，由 server 计算。 */
    val available: Boolean,
    val createdAt: Long,
    val updatedAt: Long
) {
    init {
        requireNonBlank(id, "modelProfile.id")
        requireNonBlank(providerId, "modelProfile.providerId")
        requirePositive(contextWindowTokens, "modelProfile.contextWindowTokens")
        requireNonNegative(createdAt, "modelProfile.createdAt")
        requireNonNegative(updatedAt, "modelProfile.updatedAt")
    }
}

@Serializable
data class ModelRefreshResult(
    val providerId: String,
    val discovered: Long,
    val models: List<ModelProfile>
) {
    init {
        requireNonNegative(discovered, "modelRefreshResult.discovered")
    }
}

public object ProviderLimits {
    public const val NAME_MAX_LENGTH: Int = 80
    public const val CONTEXT_WINDOW_MAX: Long = 10_000_000
}

public object BuiltinProviderIds {
    public const val OPENAI_CHAT: String = "provider-openai-chat"
    public const val ANTHROPIC: String = "provider-anthropic"
    public const val QWEN: String = "provider-qwen"

    /** 顺序即客户端列表里的展示顺序。 */
    public val ALL: List<String> = listOf(OPENAI_CHAT, ANTHROPIC, QWEN)
}
