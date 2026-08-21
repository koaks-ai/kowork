package dev.kowork.workspace

import io.matthewnelson.kmp.process.Process
import io.matthewnelson.kmp.process.Stdio

internal actual suspend fun processGroupExists(processId: Int): Boolean =
    runKill(listOf("-0", "--", "-$processId")) == 0

internal actual suspend fun signalProcessGroup(processId: Int, signal: ProcessGroupSignal) {
    val exitCode = runKill(listOf("-${signal.name}", "--", "-$processId"))
    if (exitCode != 0 && processGroupExists(processId)) {
        throw WorkspaceException(
            WorkspaceErrorCode.PROCESS_GROUP_TERMINATION_FAILED,
            "无法向进程组发送 ${signal.name}：-$processId",
        )
    }
}

private suspend fun runKill(arguments: List<String>): Int {
    val process = Process.Builder("/bin/kill")
        .args(arguments)
        .stdin(Stdio.Null)
        .stdout(Stdio.Null)
        .stderr(Stdio.Null)
        .spawn()
    return try {
        process.waitForAsync()
    } finally {
        if (!process.isAlive) process.destroy()
    }
}
