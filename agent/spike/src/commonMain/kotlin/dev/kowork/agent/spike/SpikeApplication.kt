package dev.kowork.agent.spike

import dev.kowork.agent.spike.events.SpikeEventPublisher
import dev.kowork.agent.spike.persistence.SpikeEventStore
import dev.kowork.agent.spike.run.SpikeRunService
import dev.kowork.agent.spike.server.SpikeKapServer
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import kotlinx.datetime.Clock
import okio.FileSystem
import okio.Path

/** Native spike 的唯一 composition root。 */
class SpikeApplication private constructor(
    private val store: SpikeEventStore,
    private val runService: SpikeRunService,
    private val engine: EmbeddedServer<*, *>,
) : AutoCloseable {
    suspend fun start(wait: Boolean = false): Int {
        engine.start(wait = wait)
        return engine.engine.resolvedConnectors().single().port
    }

    override fun close() {
        try {
            engine.stop(1_000, 2_000)
        } finally {
            try {
                runService.close()
            } finally {
                store.close()
            }
        }
    }

    companion object {
        fun create(
            projectRoot: Path,
            readPath: String,
            token: String,
            port: Int,
            store: SpikeEventStore,
        ): SpikeApplication {
            var runService: SpikeRunService? = null
            try {
                require(token.isNotBlank()) { "token must not be blank" }
                require(port in 0..65_535) { "port must be between 0 and 65535" }
                val canonicalRoot = FileSystem.SYSTEM.canonicalize(projectRoot)
                require(FileSystem.SYSTEM.metadata(canonicalRoot).isDirectory) {
                    "project root is not a directory: $canonicalRoot"
                }

                lateinit var kapServer: SpikeKapServer
                val publisher = SpikeEventPublisher(store) { text -> kapServer.publishText(text) }
                val service = SpikeRunService(canonicalRoot, readPath, publisher)
                runService = service
                kapServer = SpikeKapServer(token, service, Clock.System.now().toEpochMilliseconds())
                val engine = embeddedServer(CIO, host = "127.0.0.1", port = port) {
                    kapServer.install(this)
                }
                return SpikeApplication(store, service, engine)
            } catch (cause: Throwable) {
                try {
                    runService?.close()
                } catch (closeCause: Throwable) {
                    cause.addSuppressed(closeCause)
                } finally {
                    try {
                        store.close()
                    } catch (closeCause: Throwable) {
                        cause.addSuppressed(closeCause)
                    }
                }
                throw cause
            }
        }
    }
}
