package dev.kowork.agent.spike

import dev.kowork.agent.spike.persistence.NativeSqliteEventStore
import dev.kowork.protocol.*
import io.ktor.client.HttpClient
import io.ktor.client.plugins.websocket.WebSockets
import io.ktor.client.plugins.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import kotlinx.coroutines.runBlocking
import kotlinx.serialization.json.JsonPrimitive
import okio.FileSystem
import kotlin.random.Random
import kotlin.test.Test
import kotlin.test.assertEquals
import kotlin.test.assertIs

class SpikeKapServerTest {
    @Test
    fun 握手鉴权版本和请求错误均显式返回() = runBlocking {
        val root = FileSystem.SYSTEM_TEMPORARY_DIRECTORY / "kowork-kap-test-${Random.nextLong().toString().replace('-', '0')}"
        FileSystem.SYSTEM.createDirectories(root)
        FileSystem.SYSTEM.write(root / "fixture.txt") { writeUtf8("fixture") }
        val application = SpikeApplication.create(root, "fixture.txt", TOKEN, 0, NativeSqliteEventStore())
        try {
            val port = application.start()
            HttpClient(io.ktor.client.engine.cio.CIO) { install(WebSockets) }.use { client ->
                val beforeHello = exchange(client, port, ClientFrame.Request("pre", "runs.enqueue"))
                assertError(beforeHello, KapErrorCode.HANDSHAKE_REQUIRED)

                val badToken = exchange(client, port, hello("wrong"))
                assertEquals(KapErrorCode.INVALID_TOKEN, assertIs<ServerFrame.Fatal>(badToken).error.code)

                val badVersion = exchange(client, port, hello(TOKEN, min = 2, max = 2))
                assertEquals(KapErrorCode.UNSUPPORTED_PROTOCOL_VERSION,
                    assertIs<ServerFrame.Fatal>(badVersion).error.code)

                val malformed = exchangeRaw(client, port, "not-json")
                assertEquals(KapErrorCode.INVALID_PARAMS, assertIs<ServerFrame.Fatal>(malformed).error.code)

                val invalidParams = exchangeAfterHello(
                    client,
                    port,
                    ClientFrame.Request("invalid", KapMethod.RUNS_ENQUEUE.methodName, JsonPrimitive("bad")),
                )
                assertError(invalidParams, KapErrorCode.INVALID_PARAMS)

                val unknown = exchangeAfterHello(client, port, ClientFrame.Request("unknown", "no.suchMethod"))
                assertError(unknown, KapErrorCode.UNKNOWN_METHOD)

                val unimplemented = exchangeAfterHello(client, port, ClientFrame.Request("known", KapMethod.SERVER_INFO.methodName))
                assertError(unimplemented, KapErrorCode.METHOD_NOT_IMPLEMENTED)
            }
        } finally {
            application.close()
            FileSystem.SYSTEM.deleteRecursively(root, mustExist = false)
        }
    }

    private suspend fun exchange(client: HttpClient, port: Int, frame: ClientFrame): ServerFrame =
        exchangeRaw(client, port, KapJson.encodeToString(ClientFrame.serializer(), frame))

    private suspend fun exchangeRaw(client: HttpClient, port: Int, raw: String): ServerFrame {
        lateinit var result: ServerFrame
        client.webSocket(host = "127.0.0.1", port = port, path = "/kap") {
            send(Frame.Text(raw))
            result = receive()
        }
        return result
    }

    private suspend fun exchangeAfterHello(client: HttpClient, port: Int, request: ClientFrame.Request): ServerFrame {
        lateinit var result: ServerFrame
        client.webSocket(host = "127.0.0.1", port = port, path = "/kap") {
            send(Frame.Text(KapJson.encodeToString(ClientFrame.serializer(), hello(TOKEN))))
            assertIs<ServerFrame.Welcome>(receive())
            send(Frame.Text(KapJson.encodeToString(ClientFrame.serializer(), request)))
            result = receive()
        }
        return result
    }

    private suspend fun io.ktor.client.plugins.websocket.DefaultClientWebSocketSession.receive(): ServerFrame {
        val frame = incoming.receive()
        return KapJson.decodeFromString(ServerFrame.serializer(), assertIs<Frame.Text>(frame).readText())
    }

    private fun assertError(frame: ServerFrame, code: KapErrorCode) {
        assertEquals(code, assertIs<ServerFrame.Error>(frame).error.code)
    }

    private fun hello(token: String, min: Int = 1, max: Int = 1) = ClientFrame.Hello(
        min, max, token, ClientIdentity("test", "1", "macos"),
    )

    private companion object { const val TOKEN = "test-token" }
}
