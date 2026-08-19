# 0004 — Kotlin/Native 单二进制分发，硬切换不留兼容层

**状态**：已采纳
**影响阶段**：3（服务端实现）、4（硬切换）

## 背景

Koaks 是 Kotlin Multiplatform 框架，当前给 KoWork 提供的是 **Kotlin/JS** 制品
（`@koaks/node`，通过 `vendor/koaks/` 固定版本），在 Electron 的 `utilityProcess` 里动态导入。

要让 Agent 能部署到用户自己的 Linux 服务器上，需要决定两件事：

1. 用什么形态分发 server
2. 迁移期间是否保留旧的 Electron 内嵌 Core

## 决策

**Kotlin/Native 编译为单个自包含二进制。迁移采取硬切换：阶段 4 一次性删除旧实现，不保留双跑
兼容层。**

目标集：

| 目标 | 用途 |
| --- | --- |
| `linuxX64` / `linuxArm64` | 用户自部署的远程 server（主战场，arm64 覆盖云上 ARM 机型） |
| `macosArm64` / `macosX64` | 本地模式由 Electron 拉起的 sidecar |
| `mingwX64` | 同上，Windows |
| `jvm` | **仅供开发与测试**，不分发 |

刻意**没有** `js` 目标 —— Agent 不再需要跑在 Electron 进程里，这正是本次重构要消除的耦合。

## 理由

### 为什么是 Native 而不是 JVM

自部署的用户要在自己的服务器上装这个东西。"下载一个二进制、`chmod +x`、跑起来"与"先装 JDK 21、
再配 `JAVA_HOME`、再跑 jar"在部署摩擦上差距很大。单二进制还顺带解决了 Electron 打包 sidecar 的
问题：不需要把整个 JRE 塞进安装包。

保留 `jvm` 目标是因为 Kotlin/Native 的编译很慢。日常单元测试走 JVM 能把反馈循环从分钟级压到
秒级；native 编译只在 CI 与发布时全量跑。

### 为什么硬切换

考虑过保留旧 Core 作为"本地模式"实现，新 server 只用于远程模式。否决理由：

**那等于永久维护两套 Agent 实现。** 每个新功能、每条权限规则、每次 Koaks 升级都要做两遍并保证
行为一致。这正是决策 0001 里否决"工具双实现"的同一个理由，在更大的尺度上重演。

**兼容层会长期存在而不是临时存在。** 只要旧路径还能用，就总有理由不去修新路径的最后 10%。

**这是一个尚未发布的产品。** 没有存量用户的数据需要平滑迁移，硬切换的成本是一次性的开发风险，
而不是用户影响。

代价是阶段 4 会有一个"两边都不完整"的窗口期。对策是阶段 3f 结束时必须完成**对等性检查清单** ——
逐项确认新 server 覆盖了旧 Core 的每个 RPC、每个事件、每条权限规则，清单未过不进入阶段 4。

## 后果

- 需要先改 koaks 仓库（阶段 3a）：把事件的 wire 映射从 JS 专属的 `NodeJson` 提升到独立的
  `interop:json` commonMain 模块，使用 serializable wire DTO 与显式 mapper；不把 Node/KAP wire
  格式直接耦合到 `AgentEvent` 等领域对象。Linux 目标、Linux 的 HTTP engine 与 FileSystem actual
  已明确延后，不影响最终 Linux server 的目标。
- 阶段 3 之前需要一个**前置 spike**，在单个 macOS Arm native 二进制里验证四件东西能共存：
  Ktor CIO WebSocket server、`kmp-process` 子进程、SQLDelight native driver、koaks agent。
  这四者都是 native target 上相对少走的路径，任何一个不通都会让阶段 3 的方案作废 —— 必须在投入
  大量实现之前先证伪。
- `vendor/koaks/`、`packages/core`、`src/core`、`packages/contracts` 在阶段 4 全部删除。
- 打包流程要为三个平台构建并签名 sidecar（阶段 6）。

## 已验证的假设

阶段 0 已确认：`agent/protocol` 的五个 native 目标（含 `linuxX64` / `linuxArm64`）能在 macOS
宿主上交叉编译通过。这说明开发机上能直接产出 Linux server 二进制，不需要 Linux 构建机。

## 什么情况下应该推翻

如果前置 spike 证明 Ktor CIO 的 WebSocket server 或 SQLDelight 在 `linuxArm64` 上不可用，
退路是先只支持 `linuxX64`，而不是退回 JVM。若连 `linuxX64` 都不通，则需要重新评估 JVM 分发 +
jlink 裁剪运行时的方案。
