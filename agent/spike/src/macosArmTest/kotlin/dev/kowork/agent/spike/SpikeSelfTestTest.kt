package dev.kowork.agent.spike

import dev.kowork.agent.spike.persistence.NativeSqliteEventStore
import dev.kowork.agent.spike.process.KmpProcessProbe
import dev.kowork.agent.spike.verify.SpikeSelfTest
import kotlinx.coroutines.runBlocking
import kotlin.test.Test

class SpikeSelfTestTest {
    @Test
    fun 同进程完成四组件纵切() = runBlocking {
        SpikeSelfTest.run(::NativeSqliteEventStore, KmpProcessProbe::verify)
    }
}
