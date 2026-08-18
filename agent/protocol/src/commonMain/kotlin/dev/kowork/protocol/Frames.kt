package dev.kowork.protocol

import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonClassDiscriminator
import kotlinx.serialization.json.JsonElement

/**
 * KAP 帧层。
 *
 * 传输是**单条 WebSocket 连接**，JSON 文本帧。所有帧在顶层用 `kind` 判别 —— 这样 Kotlin 的
 * `@JsonClassDiscriminator("kind")` 与 TS 的 `z.discriminatedUnion('kind', …)` 能一一对应，
 * 两侧都不需要写手工分发。
 *
 * 响应刻意拆成 [ServerFrame.Result] 与 [ServerFrame.Error] 两种 kind，而不是
 * `{ kind: "response", ok: Boolean }`：顶层单一判别键让两侧的反序列化都是纯声明式的。
 *
 * 帧层只负责路由，**不校验** `params` / `value` 的内容 —— 那是 [KapMethod] 与各 Params 类型的职责，
 * 因此这两个字段的类型是 [JsonElement]。
 */

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface ClientFrame {
    /**
     * 握手。必须是连接建立后的第一帧；在收到 [ServerFrame.Welcome] 之前发送任何
     * [Request] 都会得到 `handshake_required`。
     *
     * [token] 是 server 的接入密钥：本地模式是客户端拉起 sidecar 时生成的一次性 token，
     * 远程模式是用户在设置里录入的服务器密钥。
     */
    @Serializable
    @SerialName("hello")
    data class Hello(
        val minVersion: Int,
        val maxVersion: Int,
        val token: String,
        val client: ClientIdentity
    ) : ClientFrame {
        init {
            requirePositive(minVersion, "hello.minVersion")
            requirePositive(maxVersion, "hello.maxVersion")
            require(minVersion <= maxVersion) {
                "hello 的版本区间非法：min=$minVersion > max=$maxVersion"
            }
        }
    }

    @Serializable
    @SerialName("request")
    data class Request(
        /** 客户端生成，需在连接内唯一。响应会带回同一个 id。 */
        val id: String,
        val method: String,
        val params: JsonElement? = null
    ) : ClientFrame {
        init {
            requireNonBlank(id, "request.id")
            requireNonBlank(method, "request.method")
        }
    }

    /**
     * 请求取消。
     *
     * 尽力而为：server 可能已经完成处理。被成功取消的请求会收到带 `request_cancelled` 的
     * [ServerFrame.Error]，因此每个 [Request] 最终**恰好**收到一个 Result 或 Error，
     * 客户端的 pending 表不会泄漏。
     */
    @Serializable
    @SerialName("cancel")
    data class Cancel(val id: String) : ClientFrame {
        init {
            requireNonBlank(id, "cancel.id")
        }
    }
}

@Serializable
data class ClientIdentity(
    val name: String,
    val version: String,
    val os: String
)

@OptIn(ExperimentalSerializationApi::class)
@Serializable
@JsonClassDiscriminator("kind")
sealed interface ServerFrame {
    /** 握手成功。[server] 里带能力位，客户端据此做功能降级。 */
    @Serializable
    @SerialName("welcome")
    data class Welcome(val server: ServerInfo) : ServerFrame

    @Serializable
    @SerialName("result")
    data class Result(val id: String, val value: JsonElement? = null) : ServerFrame {
        init {
            requireNonBlank(id, "result.id")
        }
    }

    @Serializable
    @SerialName("error")
    data class Error(val id: String, val error: KapError) : ServerFrame {
        init {
            requireNonBlank(id, "error.id")
        }
    }

    /**
     * 事件推送。
     *
     * server 向**所有已握手的连接**广播事件，客户端自行按 projectId / threadId 过滤。
     * 断线重连后用 `events.list` 带上最后收到的 `sequence` 补齐空档。
     *
     * 慢客户端不得阻塞 run 循环：server 侧的广播必须是有界队列 + 溢出后让客户端走补发路径，
     * 而不是同步等待写入完成（旧实现的 `CoreEventBus` 是同步广播，这是被修复的问题之一）。
     */
    @Serializable
    @SerialName("event")
    data class Event(val event: KapEvent) : ServerFrame

    /** 连接级致命错误。server 发出后会主动关闭连接。 */
    @Serializable
    @SerialName("fatal")
    data class Fatal(val error: KapError) : ServerFrame
}
