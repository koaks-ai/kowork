package dev.kowork.agent.spike

import dev.kowork.agent.spike.persistence.NativeSqliteEventStore
import dev.kowork.agent.spike.persistence.StoredSpikeEvent
import kotlin.test.Test
import kotlin.test.assertEquals

class NativeSqliteEventStoreTest {
    @Test
    fun 创建写入读回计数和关闭() {
        val store = NativeSqliteEventStore()
        try {
            val sequence = store.append("run.text", "kap", "koaks")
            assertEquals(1L, sequence)
            assertEquals(StoredSpikeEvent(1, "run.text", "kap", "koaks"), store.read(sequence))
            assertEquals(1L, store.count())
        } finally {
            store.close()
        }
    }
}
