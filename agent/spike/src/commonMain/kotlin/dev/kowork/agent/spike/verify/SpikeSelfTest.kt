package dev.kowork.agent.spike.verify

import dev.kowork.agent.spike.SpikeApplication
import dev.kowork.agent.spike.persistence.SpikeEventStore
import dev.kowork.agent.spike.run.SpikeRunService
import dev.kowork.protocol.*
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import okio.FileSystem
import okio.Path

object SpikeSelfTest {
    const val SUCCESS_MARKER = "PHASE3_SPIKE_SELF_TEST_OK"
    private const val TOKEN = "phase3-spike-self-test-token"
    private const val FIXTURE_MARKER = "phase3-spike-fixture-marker-7f5a"

    suspend fun run(storeFactory: () -> SpikeEventStore, processProbe: () -> Unit) {
        processProbe()
        val fileSystem = FileSystem.SYSTEM
        val projectRoot = createProject(fileSystem)
        try {
            val store = storeFactory()
            val application = SpikeApplication.create(projectRoot, "fixture.txt", TOKEN, 0, store)
            try {
                val port = application.start()
                val frames = executeClient(port)
                verifyFrames(frames)
                check(store.count() == 6L) { "expected 6 persisted events, got ${store.count()}" }
            } finally {
                application.close()
            }
        } finally {
            fileSystem.deleteRecursively(projectRoot, mustExist = false)
        }
        println(SUCCESS_MARKER)
    }

    private fun createProject(fileSystem: FileSystem): Path {
        val root = FileSystem.SYSTEM_TEMPORARY_DIRECTORY /
            "kowork-phase3-spike-${kotlin.random.Random.nextLong().toString().replace('-', '0')}"
        fileSystem.createDirectories(root)
        try {
            fileSystem.write(root / "fixture.txt") {
                writeUtf8("first line\n$FIXTURE_MARKER\nlast line\n")
            }
            return root
        } catch (cause: Throwable) {
            try {
                fileSystem.deleteRecursively(root, mustExist = false)
            } catch (closeCause: Throwable) {
                cause.addSuppressed(closeCause)
            }
            throw cause
        }
    }

    private suspend fun executeClient(port: Int): List<ServerFrame> {
        val frames = mutableListOf<ServerFrame>()
        HttpClient(io.ktor.client.engine.cio.CIO) {
            install(WebSockets)
        }.use { client ->
            client.webSocket(host = "127.0.0.1", port = port, path = "/kap") {
                send(Frame.Text(KapJson.encodeToString(ClientFrame.serializer(), hello())))
                frames += receiveFrame()
                check(frames.last() is ServerFrame.Welcome) { "expected welcome, got ${frames.last()}" }

                val params = RunsEnqueueParams(SpikeRunService.THREAD_ID, "read the configured fixture")
                val request = ClientFrame.Request(
                    id = "spike-enqueue-request",
                    method = KapMethod.RUNS_ENQUEUE.methodName,
                    params = KapJson.encodeToJsonElement(RunsEnqueueParams.serializer(), params),
                )
                send(Frame.Text(KapJson.encodeToString(ClientFrame.serializer(), request)))
                while (frames.none { it is ServerFrame.Event && it.event is RunCompletedEvent }) {
                    frames += receiveFrame()
                }
            }
        }
        return frames
    }

    private suspend fun io.ktor.client.plugins.websocket.DefaultClientWebSocketSession.receiveFrame(): ServerFrame {
        val frame = incoming.receive()
        check(frame is Frame.Text) { "expected KAP text frame" }
        return KapJson.decodeFromString(ServerFrame.serializer(), frame.readText())
    }

    private fun verifyFrames(frames: List<ServerFrame>) {
        val welcome = frames.first() as ServerFrame.Welcome
        check(welcome.server.serverVersion == "phase3-spike")
        check(welcome.server.runtime == ServerRuntime.NATIVE)
        check(welcome.server.arch == "arm64")

        val result = frames.filterIsInstance<ServerFrame.Result>().single()
        check(result.id == "spike-enqueue-request")
        val queued = KapJson.decodeFromJsonElement(QueuedRequest.serializer(), checkNotNull(result.value))
        check(queued.threadId == SpikeRunService.THREAD_ID)

        val events = frames.filterIsInstance<ServerFrame.Event>().map { it.event }
        check(events.map { it::class } == listOf(
            RequestQueuedEvent::class,
            RunStartedEvent::class,
            RunToolCallEvent::class,
            RunToolOutputEvent::class,
            RunTextEvent::class,
            RunCompletedEvent::class,
        )) { "unexpected event order: ${events.map { it::class.simpleName }}" }
        check(events.map { it.sequence } == (1L..6L).toList()) { "event sequence is not monotonic" }
        val toolCall = events.filterIsInstance<RunToolCallEvent>().single()
        check(toolCall.payload.name == "read_file")
        val toolOutput = events.filterIsInstance<RunToolOutputEvent>().single().payload as RunToolOutputPayload.Final
        check(FIXTURE_MARKER in toolOutput.text)
        check(FIXTURE_MARKER in events.filterIsInstance<RunTextEvent>().single().payload.text)
        check(FIXTURE_MARKER in events.filterIsInstance<RunCompletedEvent>().single().payload.finalText)
    }

    private fun hello() = ClientFrame.Hello(
        minVersion = KapVersion.MIN,
        maxVersion = KapVersion.MAX,
        token = TOKEN,
        client = ClientIdentity("phase3-spike-self-test", "1", "macos"),
    )
}
