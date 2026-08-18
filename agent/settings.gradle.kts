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

rootProject.name = "kowork-agent"

// 阶段 0 只有 protocol。后续阶段按 docs/refactor 的模块划分依次加入：
//   domain / persistence / workspace / tools / application / plugins / server / app
include("protocol")
