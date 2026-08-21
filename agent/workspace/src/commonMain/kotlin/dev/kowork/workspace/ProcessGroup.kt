package dev.kowork.workspace

internal enum class ProcessGroupSignal {
    TERM,
    KILL,
}

internal expect suspend fun processGroupExists(processId: Int): Boolean

internal expect suspend fun signalProcessGroup(processId: Int, signal: ProcessGroupSignal)
