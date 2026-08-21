package dev.kowork.workspace

import platform.posix.SIGKILL
import platform.posix.SIGTERM
import platform.posix.kill

internal actual suspend fun processGroupExists(processId: Int): Boolean =
    kill(-processId, 0) == 0

internal actual suspend fun signalProcessGroup(processId: Int, signal: ProcessGroupSignal) {
    val nativeSignal = when (signal) {
        ProcessGroupSignal.TERM -> SIGTERM
        ProcessGroupSignal.KILL -> SIGKILL
    }
    if (kill(-processId, nativeSignal) != 0 && processGroupExists(processId)) {
        throw WorkspaceException(
            WorkspaceErrorCode.PROCESS_GROUP_TERMINATION_FAILED,
            "无法向进程组发送 ${signal.name}：-$processId",
        )
    }
}
