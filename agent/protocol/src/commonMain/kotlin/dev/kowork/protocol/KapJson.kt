package dev.kowork.protocol

import kotlinx.serialization.json.Json

/**
 * KAP 的唯一 JSON 配置。协议内所有编解码都必须走它，不要各处 `Json { }`。
 *
 * 几个配置项都是为了和 TS 侧 Zod 的行为对齐，不是随手选的默认值：
 *
 * - `ignoreUnknownKeys = true`
 *   Zod 的 object 默认**剥离**未知字段并放行。kotlinx 默认是遇到未知字段就抛错。若不打开这个
 *   开关，「新版 server 多回一个字段」会让旧客户端直接解析失败，而 TS 侧却能正常工作 ——
 *   两侧行为不一致，且丧失前向兼容。
 *
 * - `encodeDefaults = false`（kotlinx 默认值，这里显式写出来以免有人改动）
 *   这条是 optional 与 nullable 语义能对齐的关键。约定：
 *   - TS `.optional()`  → Kotlin `val x: T? = null`（**有**默认值）→ 值为 null 时不编码，
 *     线上表现为字段缺省，正是 Zod optional 所要求的
 *   - TS `.nullable()`  → Kotlin `val x: T?`（**无**默认值）→ 始终编码为显式 null，
 *     正是 Zod nullable 所要求的（键必须存在）
 *   写新类型时务必守住这个区分，否则会出现 Kotlin 编码出的 JSON 被 TS 拒绝的情况。
 *
 * - `classDiscriminator` 保持默认的 `"type"`，供事件与 annotation 使用；帧层用
 *   `@JsonClassDiscriminator("kind")` 单独覆盖。
 */
public val KapJson: Json = Json {
    ignoreUnknownKeys = true
    encodeDefaults = false
    isLenient = false
    allowStructuredMapKeys = false
}
