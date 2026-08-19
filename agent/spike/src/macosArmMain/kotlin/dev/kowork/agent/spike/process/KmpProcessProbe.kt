package dev.kowork.agent.spike.process

import io.matthewnelson.kmp.process.Process
import io.matthewnelson.kmp.process.Signal
import io.matthewnelson.kmp.process.Stdio

object KmpProcessProbe {
    private const val MARKER = "kowork-kmp-process-ok"

    fun verify() {
        val output = StringBuilder()
        val process = Process.Builder("/usr/bin/printf")
            .args(MARKER)
            .stdout(Stdio.Pipe)
            .destroySignal(Signal.SIGKILL)
            .spawn()
        try {
            process.stdoutFeed { chunk -> if (chunk != null) output.append(chunk) }
            val exitCode = process.waitFor()
            process.destroy()
            process.stdoutWaiter().awaitStop()
            check(exitCode == 0) { "kmp-process probe exited with $exitCode" }
            check(output.toString() == MARKER) {
                "kmp-process probe returned unexpected stdout '${output}'"
            }
        } finally {
            process.destroy()
        }
    }
}
