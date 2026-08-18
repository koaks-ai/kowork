package dev.kowork.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator

/**
 * 协议共用的标量与小结构。
 *
 * 这里的 [Usage] / [KapAnnotation] / [ReasoningKind] 都是**协议自己的**类型，不是 Koaks 框架
 * 类型的别名。旧实现把 Koaks 的 `Usage` / `Annotation` / `ModelEvent` 一路透传到 Electron
 * renderer，客户端因此直接 import 了框架类型。KAP 明确切断这条链路：Koaks 只是 server 内部的
 * 实现细节，server 负责把框架事件映射成协议事件。
 */

@Serializable
data class Usage(
    val promptTokens: Long,
    val completionTokens: Long,
    val totalTokens: Long,
    val cachedInputTokens: Long,
    val reasoningOutputTokens: Long
) {
    init {
        requireNonNegative(promptTokens, "usage.promptTokens")
        requireNonNegative(completionTokens, "usage.completionTokens")
        requireNonNegative(totalTokens, "usage.totalTokens")
        requireNonNegative(cachedInputTokens, "usage.cachedInputTokens")
        requireNonNegative(reasoningOutputTokens, "usage.reasoningOutputTokens")
    }

    companion object {
        val ZERO = Usage(0, 0, 0, 0, 0)
    }
}

/**
 * 推理内容的种类。
 *
 * [LEGACY] 表示供应商没有区分推理种类 —— 部分供应商只回一段未标注的推理文本，客户端需要
 * 能把它和 [SUMMARY] / [RAW] 区分开来展示。
 */
@Serializable
enum class ReasoningKind {
    @SerialName("summary")
    SUMMARY,

    @SerialName("raw")
    RAW,

    @SerialName("legacy")
    LEGACY
}

/** 结构化输出的收尾步骤与普通步骤要区分，插件的 before-model hook 通常应跳过收尾步骤。 */
@Serializable
enum class ModelCallPhase {
    @SerialName("normal")
    NORMAL,

    @SerialName("structured_finalization")
    STRUCTURED_FINALIZATION
}

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("type")
sealed interface KapAnnotation {
    @Serializable
    @SerialName("url_citation")
    data class UrlCitation(
        val url: String,
        val title: String? = null,
        val startIndex: Long? = null,
        val endIndex: Long? = null
    ) : KapAnnotation {
        init {
            startIndex?.let { requireNonNegative(it, "annotation.startIndex") }
            endIndex?.let { requireNonNegative(it, "annotation.endIndex") }
        }
    }

    @Serializable
    @SerialName("file_citation")
    data class FileCitation(
        val fileId: String,
        val filename: String? = null,
        val startIndex: Long? = null,
        val endIndex: Long? = null
    ) : KapAnnotation {
        init {
            startIndex?.let { requireNonNegative(it, "annotation.startIndex") }
            endIndex?.let { requireNonNegative(it, "annotation.endIndex") }
        }
    }

    @Serializable
    @SerialName("generic")
    data class Generic(
        val kind: String,
        val payload: String
    ) : KapAnnotation
}
