package dev.kowork.protocol

/**
 * 协议不变量的显式校验。
 *
 * kotlinx.serialization 只保证结构与类型正确，不会检查「序号非负」「id 非空」这类语义约束。
 * TS 侧的 Zod 会检查（`.nonnegative()` / `.min(1)` / `.regex()`），如果 Kotlin 侧不做同样的
 * 校验，`conformance/kap-v1-cases.json` 里的 reject 用例就会在两侧得出不同结论 —— 那份用例
 * 也就失去了意义。
 *
 * 因此约定：**每个 `@Serializable` 类型都在 `init` 块里校验自己的不变量**。
 * 校验失败抛 [IllegalArgumentException]，由 server 的帧解码层统一翻译成 `invalid_params`。
 */

internal fun requireNonBlank(value: String, field: String) {
    require(value.isNotBlank()) { "$field 不能为空字符串" }
}

internal fun requireNonNegative(value: Long, field: String) {
    require(value >= 0) { "$field 必须非负，实际为 $value" }
}

internal fun requirePositive(value: Long, field: String) {
    require(value > 0) { "$field 必须为正数，实际为 $value" }
}

internal fun requirePositive(value: Int, field: String) {
    require(value > 0) { "$field 必须为正数，实际为 $value" }
}

/**
 * 只接受 http/https。
 *
 * 比 TS 侧一个裸的 `z.string().url()` 更严 —— 后者会放过 `ftp://` 之类。两侧都限定 scheme，
 * conformance 用例才能得出一致结论（TS 侧对应 `httpUrlSchema`）。
 */
internal fun requireHttpUrl(value: String, field: String) {
    val normalized = value.trim()
    require(normalized.startsWith("http://", ignoreCase = true) ||
        normalized.startsWith("https://", ignoreCase = true)) {
        "$field 必须以 http:// 或 https:// 开头，实际为 '$value'"
    }
}

internal fun requireMatches(value: String, pattern: Regex, field: String) {
    require(pattern.matches(value)) { "$field 不符合格式要求 ${pattern.pattern}，实际为 '$value'" }
}
