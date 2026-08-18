import org.jetbrains.kotlin.gradle.dsl.JvmTarget

/**
 * KoWork Agent 各模块共用的 KMP 约定。
 *
 * 目标集的来由（决策 4：Agent 以 Kotlin/Native 单二进制分发）：
 *
 * - `linuxX64` / `linuxArm64` —— 用户自部署的远程 server，主战场。arm64 覆盖各家云的 ARM 机型
 * - `macosArm64` / `macosX64` —— 本地模式下由 Electron 拉起的 sidecar
 * - `mingwX64`                —— 同上，Windows
 * - `jvm`                     —— **仅供开发与测试**，不分发。native 的编译很慢，日常跑单测走
 *                                JVM 能把反馈循环从分钟级压到秒级
 *
 * 刻意没有 `js` 目标：Agent 不再需要跑在 Electron 进程里，这正是本次重构要消除的耦合。
 */
plugins {
    id("org.jetbrains.kotlin.multiplatform")
    // 在约定插件里应用，而不是在各模块的 build.gradle.kts 里。模块脚本没有插件版本来源
    // （版本只在 build-logic 的依赖里），直接 `id(...)` 会报 "must include a version number"。
    // agent 的每个模块都要做序列化，放在这里也省得各处重复。
    id("org.jetbrains.kotlin.plugin.serialization")
}

kotlin {
    jvmToolchain(21)

    jvm {
        compilerOptions {
            jvmTarget.set(JvmTarget.JVM_21)
        }
    }

    linuxX64()
    linuxArm64()
    macosArm64()
    macosX64()
    mingwX64()

    sourceSets {
        commonTest {
            dependencies {
                implementation(kotlin("test"))
            }
        }
    }

    compilerOptions {
        // 协议层的容错要靠显式校验，不靠编译器警告，因此把警告当错误处理。
        allWarningsAsErrors.set(true)
        freeCompilerArgs.add("-Xexpect-actual-classes")
    }
}
