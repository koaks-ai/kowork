# KoWork 架构

> **本文描述目标架构，不是当前代码状态。** 重构分 7 个阶段进行，各阶段的落地情况见
> [§9 迁移状态](#9-迁移状态)。已完成的部分以本文为准；未完成的部分，当前代码仍是旧架构
> （Electron 内嵌 Core），请以 git 历史里的旧版本理解现状。
>
> 相关文档：[协议规范](protocol/kap-v1.md) · [架构决策记录](decisions/README.md) · [设计系统开发规范](design-system.md)

## 1. 核心思想

KoWork 被切成两个**可独立部署**的部分：

```text
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  KoWork 客户端 (Electron)    │   KAP   │  KoWork Agent Server         │
│                             │◄───────►│  (Kotlin/Native 单二进制)      │
│  展示 · 审批 · 上传 · 预览    │  WS/JSON│  执行 · 状态 · 工具 · 模型调用  │
└─────────────────────────────┘         └──────────────────────────────┘
```

分界线只有一条：**凡是需要触碰工作目录、执行命令、调用模型或持久化的事，都在 server 上。**
客户端不碰工作目录，不执行工具，不调用 LLM，没有数据库。

两种部署形态共用**完全相同**的代码路径：

| 形态 | server 位置 | 谁启动它 |
| --- | --- | --- |
| 本地 | `127.0.0.1` 上的 sidecar 进程 | Electron 主进程，附带一次性 token |
| 远程 | 用户自己的服务器 | 用户，通过 server CLI |

本地模式是远程模式的一个特例。这带来一个关键收益：**日常使用本地模式就在测试远程模式的代码
路径**，两种形态不会各自长出专属 bug。详见 [决策 0001](decisions/0001-agent-server-owns-execution.md)。

## 2. 进程边界

```text
Renderer ──► Preload ──► Electron Main ──┐
  React        window.       窗口/托盘/    │  KAP over WebSocket
  UI           kowork        sidecar 监管  │
                                          ▼
                           ┌──────────────────────────────┐
                           │  Agent Server                │
                           │   Ktor CIO WS 服务端          │
                           │   run 协调 · 审批 · 权限       │
                           │   Koaks Agent                │
                           │   工具 · 工作区 · SQLite       │
                           └───────────┬──────────────────┘
                                       │ 本地 IPC
                                       ▼
                           ┌──────────────────────────────┐
                           │  插件宿主 (Node)              │
                           │   Agent 侧插件 · 四个 hook     │
                           └──────────────────────────────┘
```

- **Renderer** 只有 React UI，只依赖 `@kowork/protocol` 与 `@kowork/design-system`。
  所有协议访问集中在 `renderer/data` 一层，组件不直接发 RPC。
- **Preload** 把类型化 API 映射为版本化 Electron IPC，不暴露通用 `ipcRenderer`。
- **Main** 管窗口、导航、系统通知、连接配置、以及本地模式下 sidecar 的启动与监管。
  Main **不再**持有业务逻辑与数据库。
- **Agent Server** 拥有一切执行与状态。
- **插件宿主**是独立 Node 进程，跑插件的 Agent 半（[决策 0003](decisions/0003-dual-host-plugin-runtime.md)）。

Renderer 保持 `contextIsolation: true`、`sandbox: true`、`nodeIntegration: false`。
Main 阻止非当前页面导航，只把经协议校验的 HTTP/HTTPS 链接交给系统浏览器。

## 3. 仓库结构

```text
agent/                        Agent Server —— 独立的 Gradle 构建
  build-logic/                  KMP 约定插件（目标集、编译选项、fixture codegen）
  gradle/libs.versions.toml      版本单一真源，与 koaks 对齐
  protocol/                     ★ KAP 真源（@Serializable），零业务依赖
  domain/                       实体与领域规则，无 IO
  persistence/                  SQLDelight schema 与按聚合划分的 repositories
  workspace/                    FileSystemPort / ProcessPort / GitPort
  tools/                        9 个工具的实现与 ToolRegistry
  application/                  run 协调、队列、审批、记忆、供应商
  plugins/                      插件宿主的 server 侧对接
  server/                       Ktor CIO WS 服务端、鉴权、订阅广播
  app/                          可执行入口与 CLI

packages/
  protocol/                     ★ KAP 的 TS 镜像（Zod）
  design-system/                设计令牌、动画原语、Surface、SelectableList、PluginUiKit
  agent-client/                 KAP 客户端：连接、重连、请求映射、事件流
  plugin-sdk/                   插件作者面向的类型与工具

src/
  main/                         Electron 生命周期、窗口、sidecar 监管、连接配置
  preload/                      window.kowork
  renderer/src/
    data/                       唯一的协议访问层（agent-client 的 React 绑定）
    features/                   按功能域组织的界面
    widgets/                    跨功能域的复合组件
    shared/                     纯展示与工具

conformance/kap-v1-cases.json   ★ 两侧共用的协议一致性用例
docs/                           架构、设计系统、协议、决策记录
tests/                          unit / integration / e2e
```

★ 标记的三个位置是协议的三角：Kotlin 真源、TS 镜像、共享用例。改协议必须同时动这三处。

## 4. 协议

完整规范见 [`protocol/kap-v1.md`](protocol/kap-v1.md)。要点：

- **单条 WebSocket 连接，JSON 文本帧。** 帧在顶层用 `kind` 判别：客户端发
  `hello` / `request` / `cancel`，服务端回 `welcome` / `result` / `error` / `event` / `fatal`。
- **版本区间协商。** 双方声明支持区间，取交集上界。旧协议用 `z.literal` 让任何版本差异都变成
  解析失败，用户不知道该升哪边。
- **能力位驱动的功能降级。** 客户端按 `ServerInfo.capabilities` 决定暴露哪些入口，不按版本号推断。
- **事件 payload 全部强类型。** 旧协议的 payload 是 `Record<string, unknown>`，Koaks 的
  `ModelEvent` 因此一路透传到 renderer。KAP 在 server 侧完成映射，客户端只认协议类型。
- **路径都是 server 侧路径。** 让用户选目录必须走 `fs.browse`，不能用 Electron 原生对话框。

## 5. 运行与恢复

- 不同会话可并发；同一会话是持久化的 FIFO 队列。
- **入队时冻结**模型与上下文窗口配置。**权限模式不冻结** —— 每次工具调用开始时读取会话当前值，
  因此用户在排队期间改模式会影响后续调用。
- 失败、取消、中断或压缩失败会暂停当前会话队列，需用户显式恢复。
- server 始终**先持久化事件再广播**。客户端打开会话时先拉历史，再订阅增量；关闭窗口只解除订阅，
  不取消后台运行。
- server 重启后，活动 run 标记为 `interrupted`，**不会**自动重放可能有副作用的工具调用。
- 事件广播对慢客户端是**有界队列 + 溢出丢弃**，让该客户端走 `events.list` 补发路径。
  旧实现的同步广播会让慢订阅者阻塞 run 循环。

## 6. 数据与记忆

server 侧 SQLite（SQLDelight），启用 WAL、外键与事务迁移。覆盖：项目、会话、排队请求、运行、
事件、审批、run 级路径授权、Koaks 的完整 turns/items/checkpoints、压缩检查点、供应商、
模型 Profile、服务端设置，以及 `plugins` / `plugin_state`。

记忆用 Koaks 的 custom `ThreadMemory` 持久化完整历史与 provider checkpoint。预计上下文达到
Profile 限制的 **90%** 时，先用当前会话模型生成持久化 system summary 再继续原请求。压缩最多保留
最近 8 个完整 turn，按预算动态减到至少 1 个。原始历史与运行日志不自动删除。

**状态归属**见 [决策 0002](decisions/0002-server-owns-state.md)。判据是"换一台电脑接同一个
server 时这个状态该不该跟着走"：Agent 状态归 server，主题/布局/连接配置等设备级偏好留在客户端的
`client-settings.json`，不进协议。

## 7. 权限与工具

| 模式 | 项目内读 | 项目内写 | Shell | 项目外文件/目录 |
| --- | --- | --- | --- | --- |
| Ask | 自动 | 每次审批 | 每次审批 | 每个 run 审批 |
| Auto | 自动 | 自动 | 每次审批 | 每个 run 审批 |
| Yolo | 自动 | 自动 | 自动，含项目外 `cwd` | 每个 run 审批 |

路径先 canonicalize，再校验 symlink 解析后的**真实**路径仍在项目内。项目外授权区分
`read` / `write`：`write` 隐含 `read`，`read` 不能用于写。单文件授权只覆盖该文件，目录授权覆盖
子路径。授权**仅在当前 run 内有效**。

Shell 以 server 进程的系统用户权限运行，**不是 OS 级沙箱** —— `cwd` 只设置工作目录，不限制命令
能访问的范围。命令通过非登录 shell 的 `-c` 执行；启动 server 与 shell 子进程前会剔除名称匹配
密钥/令牌/secret/密码模式的环境变量。模型凭据不通过环境变量传递。

`ToolRegistry` 是工具 schema、授权与执行的唯一入口。每个工具必须声明文件/Shell 能力、副作用、
项目读写锁、deadline 与输出上限；**未声明的访问默认拒绝**，未知工具或无法关联到应用 run 的调用
也拒绝。项目读工具持共享锁，Edit/Write/Shell 持独占锁。最终结果上限 64,000 字符并明确标注截断，
单次调用流式输出持久化上限 256,000 字符。Shell 超时或取消时先终止进程组，短暂等待后强制终止。

工具范围：`list_files`、`glob_files`、`read_file`、`search_files`、`edit_file`、`write_file`、
`run_command`、`git_status`、`git_diff`。

## 8. 设计系统与插件

**设计系统**（`packages/design-system`）是视觉一致性的唯一来源，日常使用规则见
[`design-system.md`](design-system.md)：

- 圆角收敛为 4 级令牌，取代散落各处的 `rounded-*`
- 只有两个动画原语：`Reveal`（模糊进出，用于页面切换与卡片弹出）与
  `Disclosure`（展开收起，用于侧边栏与时间线）
- 选中/悬停只有一个 `SelectableList`，基准是左侧栏会话列表的样式
- `Surface` 原语统一卡片/面板的背景与边框
- 导出**版本化**的 `PluginUiKit`，是插件能用的原语子集

**主题**覆盖强调色、悬停色、背景图片及其模糊度/透明度。内置默认灰主题必须与设计系统基准逐像素
一致。主题存客户端本地，不进协议。

**插件**分 UI 半（renderer）与 Agent 半（独立 Node 进程），两半可选。Agent 半消费 Koaks 的四个
hook 点并可注册工具。热加载**不重建 Koaks Agent** —— 转发 Hook 与 `LazyToolSource` 是稳定实例，
重载只换背后的查找表。右侧栏三张内置卡片将改写为插件，用来验证 API 是否够用。

UI 插件的信任模型（同 realm 执行，权限是告知性而非强制沙箱）是一个明确记录过的取舍，
见 [决策 0003](decisions/0003-dual-host-plugin-runtime.md)。

## 9. 迁移状态

| 阶段 | 内容 | 状态 |
| --- | --- | --- |
| 0 | KAP v1 协议：Kotlin 真源 + TS 镜像 + 一致性用例 + 文档 | 已完成 |
| 1 | 设计系统：令牌、两个动画原语、SelectableList、Inspector 注册表 | 已完成 |
| 2 | 主题体系 | 进行中 |
| 3a | koaks 仓库增加 Linux 目标与事件序列化 | 未开始 |
| 3 spike | 单个 linux native 二进制里验证 Ktor WS + 子进程 + SQLDelight + koaks 共存 | 未开始 |
| 3b–3f | Agent Server 实现（持久化 → 工作区 → 工具 → 应用层 → 服务端） | 未开始 |
| 4 | 硬切换：agent-client、sidecar 监管、删除旧实现 | 未开始 |
| 5 | 插件系统 | 未开始 |
| 6 | 收尾：拆分过大文件、测试矩阵、多平台构建签名 | 未开始 |

阶段 2 的主题体系主体已落地，当前仍需修复并重新执行完整 Electron e2e 后才能标记为完成；实施结果与
剩余验收项见 [`refactor-plan.md`](refactor-plan.md#阶段-2--主题体系)。

阶段 3 之前必须先完成 spike。它要证伪的是四个 native 目标上相对少走的路径能否共存 —— 任何一个
不通都会让阶段 3 的方案作废，必须在投入大量实现之前先验证。

阶段 3f 结束时必须完成**对等性检查清单**：逐项确认新 server 覆盖旧 Core 的每个 RPC、每个事件、
每条权限规则。清单未过不得进入阶段 4。

## 10. 扩展原则

- 新增客户端能力：先在 `agent/protocol` 定义类型，再镜像到 `packages/protocol`，补 conformance
  用例，最后实现 server 与客户端。**不允许**绕过协议直连。
- 新增 Provider：通过供应商品牌、调用协议、模型 Profile 与 Koaks adapter 接入。协议约束与模型
  枚举在 server，UI 组件里不实现网络调用。
- 新增工具：必须经 `ToolRegistry` 注册，并声明路径授权、项目锁、deadline、输出预算与取消行为。
- 数据库变更：同时更新 SQLDelight schema 与可审阅的迁移脚本。
- 新增视觉元素：必须用设计系统的令牌与原语。出现新的圆角值、新的悬停样式或第三个动画原语，
  都应视为设计系统有缺口，先补原语再用。
- 设计系统的目录边界、插件 UI 约束和新增视觉需求流程见
  [`docs/design-system.md`](design-system.md)。
- Skills、MCP、多 Agent、签名与自动更新保留独立扩展点，不侵入运行主链路。
