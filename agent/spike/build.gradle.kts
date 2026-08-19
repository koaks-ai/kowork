import org.gradle.api.DefaultTask
import org.gradle.api.file.RegularFileProperty
import org.gradle.api.tasks.InputFile
import org.gradle.api.tasks.TaskAction
import org.gradle.process.ExecOperations
import javax.inject.Inject

plugins { id("kowork.kmp.native-spike") }

group = "dev.kowork.agent"
version = "1.0.0-SNAPSHOT"

kotlin {
    // Koaks 为了与既有 Gradle task 命名保持一致使用 macosArm，Native 属性仍是 macos_arm64。
    macosArm64("macosArm") {
        binaries {
            all {
                linkerOpts("-lsqlite3")
            }
            executable {
                baseName = "kowork-agent-spike"
                entryPoint = "dev.kowork.agent.spike.main"
            }
        }
    }

    sourceSets {
        commonMain.dependencies {
            implementation(project(":protocol"))
            implementation(libs.serialization.json)
            implementation(libs.coroutines.core)
            implementation(libs.okio)
            implementation(libs.datetime)
            implementation(libs.ktor.server.core)
            implementation(libs.ktor.server.websockets)
            implementation(libs.ktor.server.cio)
            implementation(libs.ktor.client.core)
            implementation(libs.ktor.client.websockets)
            implementation(libs.ktor.client.cio)
            implementation(libs.kmp.process)
            implementation(libs.koaks.core)
            implementation(libs.koaks.json)
        }
        getByName("macosArmMain").dependencies {
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.nativeDriver)
        }
        getByName("macosArmTest").dependencies {
            implementation(libs.sqldelight.runtime)
            implementation(libs.sqldelight.nativeDriver)
        }
    }
}

abstract class VerifyMacosArmSpikeTask @Inject constructor(
    private val execOperations: ExecOperations,
) : DefaultTask() {
    @get:InputFile
    abstract val executable: RegularFileProperty

    @TaskAction
    fun verify() {
        val binary = executable.get().asFile
        check(binary.isFile) { "release spike executable was not produced: $binary" }
        execOperations.exec { commandLine(binary.absolutePath, "self-test") }
        logger.lifecycle("macOS Arm spike self-test passed: ${binary.absolutePath}")
    }
}

tasks.register<VerifyMacosArmSpikeTask>("verifyMacosArmSpike") {
    group = "verification"
    description = "链接并执行 macOS Arm Native spike executable 的 self-test。"
    dependsOn("linkReleaseExecutableMacosArm")
    executable.set(layout.buildDirectory.file("bin/macosArm/releaseExecutable/kowork-agent-spike.kexe"))
}
