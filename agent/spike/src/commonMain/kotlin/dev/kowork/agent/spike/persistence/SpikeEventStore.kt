package dev.kowork.agent.spike.persistence

/** Spike 只验证先持久化后广播，不引入阶段 3b 的正式 repository。 */
interface SpikeEventStore : AutoCloseable {
    fun append(type: String, kapJson: String, koaksJson: String): Long
    fun count(): Long
    fun read(sequence: Long): StoredSpikeEvent
}

data class StoredSpikeEvent(
    val sequence: Long,
    val type: String,
    val kapJson: String,
    val koaksJson: String,
)
