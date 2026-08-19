package dev.kowork.agent.spike

import dev.kowork.agent.spike.persistence.NativeSqliteEventStore
import dev.kowork.agent.spike.process.KmpProcessProbe
import dev.kowork.agent.spike.verify.SpikeSelfTest
import kotlinx.coroutines.runBlocking

fun main(args: Array<String>) = runBlocking {
    when (val command = parseSpikeArgs(args.toList())) {
        SpikeCommand.SelfTest -> SpikeSelfTest.run(::NativeSqliteEventStore, KmpProcessProbe::verify)
        is SpikeCommand.Serve -> serve(command.config)
    }
}

private suspend fun serve(config: SpikeConfig) {
    KmpProcessProbe.verify()
    val application = SpikeApplication.create(
        projectRoot = config.projectRoot,
        readPath = config.readPath,
        token = config.token,
        port = config.port,
        store = NativeSqliteEventStore(),
    )
    try {
        val actualPort = application.start(wait = false)
        println("phase3-spike listening on ws://127.0.0.1:$actualPort/kap")
        kotlinx.coroutines.awaitCancellation()
    } finally {
        application.close()
    }
}
