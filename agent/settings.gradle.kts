/**
 * KoWork Agent Server —— 独立的 Gradle 构建，位于 kowork 产品仓库内。
 *
 * 为什么在这里而不是在 koaks 仓库里：这里的代码是 KoWork 的**产品逻辑**（项目、会话、审批、
 * 权限模式、工作区策略），不是通用 Agent 框架能力。混进框架仓库会破坏 koaks 的通用性。
 * koaks 通过 `includeBuild` 或已发布制品被依赖，保持纯框架。
 *
 * 之所以是独立 Gradle 构建（而不是让 kowork 根目录变成 Gradle 项目）：npm/electron 工具链与
 * Gradle 各自管理自己的目录，互不干扰；Electron 打包时只需调用 `agent/gradlew` 产出 sidecar
 * 二进制。
 */
pluginManagement {
    repositories {
        mavenCentral()
        gradlePluginPortal()
    }
    includeBuild("build-logic")
}

plugins {
    id("org.gradle.toolchains.foojay-resolver-convention") version "1.0.0"
}

dependencyResolutionManagement {
    repositories {
        mavenCentral()
    }
}

// Koaks 在开发期优先通过 composite build 接入，避免为了验证 Native 纵切先发布制品。
// 属性优先于环境变量，未配置时保留 protocol 模块的独立可构建性；spike 模块会在依赖解析
// 阶段给出清晰的缺失依赖提示。
val koaksDirValue = providers.gradleProperty("koaksDir")
    .orElse(providers.environmentVariable("KOAKS_DIR"))
    .orNull
if (koaksDirValue != null) {
    val koaksDir = file(koaksDirValue)
    require(koaksDir.isDirectory && koaksDir.resolve("settings.gradle.kts").isFile) {
        "koaksDir/KOAKS_DIR 必须指向包含 settings.gradle.kts 的 Koaks Gradle 构建：$koaksDir"
    }
    includeBuild(koaksDir) {
        dependencySubstitution {
            substitute(module("org.koaks:koaks-core")).using(project(":core"))
            substitute(module("org.koaks:koaks-json")).using(project(":interop:json"))
            substitute(module("org.koaks:provider-chat-completions")).using(project(":model-provider:chat-completions"))
            substitute(module("org.koaks:provider-openai")).using(project(":model-provider:openai"))
            substitute(module("org.koaks:provider-anthropic")).using(project(":model-provider:anthropic"))
            substitute(module("org.koaks:provider-ollama")).using(project(":model-provider:ollama"))
            substitute(module("org.koaks:provider-qwen")).using(project(":model-provider:qwen"))
        }
    }
}

rootProject.name = "kowork-agent"

// 阶段 0 只有 protocol。后续阶段按 docs/refactor 的模块划分依次加入：
//   domain / persistence / workspace / tools / application / plugins / server / app
include("protocol")
include("persistence")
include("spike")
include("workspace")
