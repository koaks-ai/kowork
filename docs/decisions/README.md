# 架构决策记录

记录 KoWork 重构中"为什么这样做"的取舍。代码能说明**怎么做**，这些文档负责说明**为什么**，
以及**什么情况下应该推翻它**。

每条决策都是重构过程中反复回到的分歧点。改动这些决策会波及多个阶段，动手前请先读完对应文档。

| 编号 | 决策 | 影响阶段 |
| --- | --- | --- |
| [0001](0001-agent-server-owns-execution.md) | Agent Server 拥有全部执行，客户端是纯展示层 | 3, 4 |
| [0002](0002-server-owns-state.md) | Server 拥有 Agent 状态，客户端只留设备级偏好 | 0, 2, 3, 4 |
| [0003](0003-dual-host-plugin-runtime.md) | 插件双宿主：UI 半在 renderer，Agent 半在独立进程 | 1, 5 |
| [0004](0004-kotlin-native-hard-cutover.md) | Kotlin/Native 单二进制分发，硬切换不留兼容层 | 3, 4 |

## 相关文档

- [`../architecture.md`](../architecture.md) —— 目标架构总览
- [`../design-system.md`](../design-system.md) —— renderer 与 UI 插件的视觉实现规范
- [`../protocol/kap-v1.md`](../protocol/kap-v1.md) —— 协议规范
