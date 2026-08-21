import org.gradle.api.tasks.Exec
import org.gradle.api.tasks.testing.Test
import org.jetbrains.kotlin.gradle.targets.native.tasks.KotlinNativeTest

plugins {
    id("kowork.kmp.macos.library")
}

group = "dev.kowork.agent"
version = "1.0.0-SNAPSHOT"

val processGroupLauncher = layout.buildDirectory.file("process-launcher/kowork-process-launcher")

val buildProcessGroupLauncher by tasks.registering(Exec::class) {
    val source = layout.projectDirectory.file("src/nativeMain/c/process-group-launcher.c")
    inputs.file(source)
    outputs.file(processGroupLauncher)

    doFirst {
        processGroupLauncher.get().asFile.parentFile.mkdirs()
    }
    commandLine(
        "cc",
        "-std=c11",
        "-O2",
        "-Wall",
        "-Werror",
        "-o",
        processGroupLauncher.get().asFile.absolutePath,
        source.asFile.absolutePath,
    )
}

tasks.withType<Test>().configureEach {
    dependsOn(buildProcessGroupLauncher)
    environment("KOWORK_PROCESS_LAUNCHER", processGroupLauncher.get().asFile.absolutePath)
}

tasks.withType<KotlinNativeTest>().configureEach {
    dependsOn(buildProcessGroupLauncher)
    environment("KOWORK_PROCESS_LAUNCHER", processGroupLauncher.get().asFile.absolutePath)
}

kotlin {
    sourceSets {
        commonMain.dependencies {
            implementation(libs.coroutines.core)
            implementation(libs.okio)
            implementation(libs.kmp.process)
        }
        commonTest.dependencies {
            implementation(libs.coroutines.test)
        }
    }
}
