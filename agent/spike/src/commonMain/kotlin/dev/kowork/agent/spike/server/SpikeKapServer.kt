package dev.kowork.agent.spike.server

import dev.kowork.agent.spike.run.SpikeRunService
import dev.kowork.protocol.*
import io.ktor.server.application.*
import io.ktor.server.routing.*
import io.ktor.server.websocket.*
import io.ktor.websocket.*
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonNull
import kotlin.time.Duration.Companion.seconds

class SpikeKapServer(
    private val token: String,
    private val runService: SpikeRunService,
    private val startedAt: Long,
) {
    private var eventSession: DefaultWebSocketServerSession? = null
    private var runAccepted = false

    fun install(application: Application) {
        application.install(WebSockets) { pingPeriod = 15.seconds }
        application.routing {
            webSocket("/kap") { handleConnection() }
        }
    }

    private suspend fun DefaultWebSocketServerSession.handleConnection() {
        check(eventSession == null) { "phase3-spike supports one client at a time" }
        eventSession = this
        var handshaken = false
        try {
            for (frame in incoming) {
                if (frame !is Frame.Text) {
                    sendFatal(KapErrorCode.INVALID_PARAMS, "KAP spike accepts text frames only")
                    return
                }
                val raw = frame.readText()
                val decoded = runCatching { KapJson.decodeFromString(ClientFrame.serializer(), raw) }
                    .getOrElse {
                        sendFatal(KapErrorCode.INVALID_PARAMS, "invalid KAP frame: ${it.message}")
                        return
                    }
                when (decoded) {
                    is ClientFrame.Hello -> {
                        if (handshaken) {
                            sendError(
                                "hello",
                                KapErrorCode.HANDSHAKE_ALREADY_COMPLETED,
                                "hello already completed",
                            )
                            continue
                        }
                        if (decoded.token != token) {
                            sendFatal(KapErrorCode.INVALID_TOKEN, "invalid token")
                            return
                        }
                        val version = KapVersion.negotiate(decoded.minVersion, decoded.maxVersion)
                        if (version == null) {
                            sendFatal(
                                KapErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
                                "no protocol version intersection",
                            )
                            return
                        }
                        handshaken = true
                        sendFrame(
                            ServerFrame.Welcome(
                                ServerInfo(
                                    version,
                                    KapVersion.MIN,
                                    KapVersion.MAX,
                                    "phase3-spike",
                                    ServerRuntime.NATIVE,
                                    ServerOs.MACOS,
                                    "arm64",
                                    emptyList(),
                                    startedAt,
                                ),
                            ),
                        )
                    }
                    is ClientFrame.Request -> {
                        if (!handshaken) {
                            sendError(decoded.id, KapErrorCode.HANDSHAKE_REQUIRED, "hello is required first")
                            continue
                        }
                        handleRequest(decoded)
                    }
                    is ClientFrame.Cancel -> sendError(
                        decoded.id,
                        KapErrorCode.METHOD_NOT_IMPLEMENTED,
                        "cancel is not implemented in phase3-spike",
                    )
                }
            }
        } finally {
            eventSession = null
        }
    }

    suspend fun publishText(text: String) {
        val session = checkNotNull(eventSession) { "no connected spike client" }
        session.send(Frame.Text(text))
    }

    private suspend fun DefaultWebSocketServerSession.handleRequest(request: ClientFrame.Request) {
        val method = KapMethod.fromName(request.method)
        if (method == null) {
            sendError(request.id, KapErrorCode.UNKNOWN_METHOD, "unknown method '${request.method}'")
            return
        }
        if (method != KapMethod.RUNS_ENQUEUE) {
            sendError(
                request.id,
                KapErrorCode.METHOD_NOT_IMPLEMENTED,
                "${request.method} is not implemented in phase3-spike",
            )
            return
        }
        val params = runCatching {
            KapJson.decodeFromJsonElement(RunsEnqueueParams.serializer(), request.params ?: JsonNull)
        }.getOrElse {
            sendError(request.id, KapErrorCode.INVALID_PARAMS, "invalid runs.enqueue params: ${it.message}")
            return
        }
        if (params.threadId != SpikeRunService.THREAD_ID) {
            sendError(request.id, KapErrorCode.THREAD_NOT_FOUND, "only spike-thread is available")
            return
        }
        if (runAccepted) {
            sendError(request.id, KapErrorCode.UNAVAILABLE, "phase3-spike accepts exactly one run")
            return
        }
        runAccepted = true
        val queued = QueuedRequest(
            SpikeRunService.REQUEST_ID,
            params.threadId,
            params.input,
            QueuedRequestStatus.QUEUED,
            "spike-scripted",
            1,
            0,
            startedAt,
            startedAt,
        )
        sendResult(request.id, queued)
        launch { runService.run(params) }
    }

    private suspend fun DefaultWebSocketServerSession.sendResult(id: String, value: Any) {
        val json = when (value) {
            is QueuedRequest -> KapJson.encodeToJsonElement(QueuedRequest.serializer(), value)
            else -> error("unsupported spike result")
        }
        sendFrame(ServerFrame.Result(id, json))
    }

    private suspend fun DefaultWebSocketServerSession.sendError(id: String, code: KapErrorCode, message: String) =
        sendFrame(ServerFrame.Error(id, KapError(code, message)))

    private suspend fun DefaultWebSocketServerSession.sendFatal(code: KapErrorCode, message: String) {
        sendFrame(ServerFrame.Fatal(KapError(code, message)))
        close(CloseReason(CloseReason.Codes.PROTOCOL_ERROR, message))
    }

    private suspend fun DefaultWebSocketServerSession.sendFrame(frame: ServerFrame) {
        send(Frame.Text(KapJson.encodeToString(ServerFrame.serializer(), frame)))
    }
}
