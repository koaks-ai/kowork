package dev.kowork.agent.spike

import okio.Path
import okio.Path.Companion.toPath

/** 只属于 Native spike 的启动配置，不是正式 server CLI。 */
data class SpikeConfig(
    val projectRoot: Path,
    val readPath: String,
    val token: String,
    val port: Int,
) {
    init {
        require(projectRoot.isAbsolute) { "project root must be an absolute path" }
        require(readPath.isNotBlank()) { "read path must not be blank" }
        require(!readPath.toPath().isAbsolute) { "read path must be relative to the project root" }
        require(token.isNotBlank()) { "token must not be blank" }
        require(port in 1..65_535) { "port must be between 1 and 65535" }
    }
}

internal fun parseSpikeArgs(args: List<String>): SpikeCommand {
    require(args.isNotEmpty()) { "expected 'self-test' or 'serve'" }
    return when (args.first()) {
        "self-test" -> SpikeCommand.SelfTest
        "serve" -> {
            val pairs = args.drop(1).windowed(2, 2, partialWindows = true)
            val values = pairs.associate { pair ->
                require(pair.size == 2 && pair.first().startsWith("--")) {
                    "serve arguments must be --name value pairs"
                }
                pair.first().removePrefix("--") to pair[1]
            }
            require(values.size == pairs.size) { "serve arguments must not contain duplicate flags" }
            val unknown = values.keys - setOf("project-root", "read-path", "token", "port")
            require(unknown.isEmpty()) { "unknown serve arguments: $unknown" }
            SpikeCommand.Serve(
                SpikeConfig(
                    projectRoot = requireValue(values, "project-root").toPath().normalized(),
                    readPath = requireValue(values, "read-path"),
                    token = requireValue(values, "token"),
                    port = requireValue(values, "port").toIntOrNull()
                        ?: error("port must be an integer"),
                ),
            )
        }
        else -> error("unknown command '${args.first()}'")
    }
}

private fun requireValue(values: Map<String, String>, name: String): String =
    values[name] ?: error("missing --$name")

sealed interface SpikeCommand {
    data object SelfTest : SpikeCommand
    data class Serve(val config: SpikeConfig) : SpikeCommand
}
