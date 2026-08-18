import dev.kowork.build.GenerateConformanceFixturesTask

plugins {
    id("kowork.kmp.library")
}

/**
 * `agent/protocol` —— KAP v1 的**真源**。
 *
 * 这个模块刻意零业务依赖：只有 kotlinx-serialization。它既被 server 使用，也被将来可能出现的
 * Kotlin 客户端使用，不能反向依赖 domain / persistence 中的任何东西。
 */

val generateConformanceFixtures =
    tasks.register<GenerateConformanceFixturesTask>("generateConformanceFixtures") {
        description = "把共享的 KAP 一致性用例编译进 commonTest 源码"
        group = "build"
        // agent/protocol -> agent -> 仓库根
        casesFile.set(layout.projectDirectory.file("../../conformance/kap-v1-cases.json"))
        outputDirectory.set(layout.buildDirectory.dir("generated/conformance/kotlin"))
    }

kotlin {
    sourceSets {
        commonMain {
            dependencies {
                api(libs.serialization.json)
            }
        }
        commonTest {
            kotlin.srcDir(generateConformanceFixtures)
        }
    }
}
