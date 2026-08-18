# KoWork Agent Protocol (KAP) v1

KoWork 客户端与 KoWork Agent Server 之间的唯一通信协议。

**真源是 `agent/protocol`（Kotlin `@Serializable`）**。`packages/protocol`（TypeScript + Zod）是它的
镜像。两侧靠 `conformance/kap-v1-cases.json` 里的共享用例保持一致，任何一侧改了不同步另一侧，
两边的测试都会失败。

修改协议的顺序：本文 → Kotlin 真源 → TS 镜像 → conformance 用例。

---

## 1. 这份协议为什么存在

旧架构里 Agent 跑在 Electron 的 `utilityProcess` 里，"协议"是一组 Electron 专有的
`MessagePort` 消息（`packages/contracts`）。它有三个无法在原地修好的问题：

1. **绑死 Electron**。传输层假定了 `parentPort`、同步凭据请求、本机 `dataPath`。Agent 不可能
   搬到远程服务器。
2. **框架类型外泄**。事件 payload 是 `Record<string, unknown>`，Koaks 的 `ModelEvent` 被原样
   透传到 renderer，`timeline-model.ts` 因此直接 `import type { ModelEvent } from '@koaks/node'`。
   换掉或升级 Koaks 会波及界面代码。
3. **版本无法协商**。`z.literal(PROTOCOL_VERSION)` 让任何版本差异都变成解析失败。客户端与
   用户自建 server 各自升级的现实下，这必然导致"连不上且不知道该升哪边"。

KAP 针对性地解决这三点：传输中立（WebSocket + JSON）、payload 全部强类型、版本区间协商。

---

## 2. 传输与连接

单条 **WebSocket** 连接，JSON **文本**帧，UTF-8。

| 部署形态 | 地址 | 说明 |
| --- | --- | --- |
| 本地 | `ws://127.0.0.1:<随机端口>` | Electron 主进程拉起 sidecar 并生成一次性 token |
| 远程 | `wss://<host>:<port>` | 用户自部署，密钥由 server CLI 生成 |

客户端对**非 loopback** 地址默认强制 `wss://`。原因很直接：`providers.create` 与
`providers.setCredential` 会把用户的 LLM API Key 上行到 server，明文 `ws://` 等于在网络上
广播密钥。允许降级需要用户显式确认。

心跳、分片、重连退避都由 WebSocket 层与客户端实现负责，协议本身不定义。

---

## 3. 帧

所有帧在**顶层**用 `kind` 判别。这样 Kotlin 的 `@JsonClassDiscriminator("kind")` 与 TS 的
`z.discriminatedUnion('kind', …)` 能一一对应，两侧都不需要手写分发逻辑。

### 客户端 → 服务端

```jsonc
// 必须是第一帧
{ "kind": "hello", "minVersion": 1, "maxVersion": 1, "token": "…",
  "client": { "name": "KoWork", "version": "1.0.0", "os": "darwin" } }

{ "kind": "request", "id": "rq_1", "method": "projects.list", "params": { } }

{ "kind": "cancel", "id": "rq_1" }
```

### 服务端 → 客户端

```jsonc
{ "kind": "welcome", "server": { /* ServerInfo */ } }

{ "kind": "result", "id": "rq_1", "value": [ /* … */ ] }

{ "kind": "error",  "id": "rq_1", "error": { "code": "thread_archived", "message": "…" } }

{ "kind": "event",  "event": { /* KapEvent */ } }

// 连接级致命错误，server 发出后主动关闭连接
{ "kind": "fatal",  "error": { "code": "unsupported_protocol_version", "message": "…" } }
```

响应刻意拆成 `result` 与 `error` 两种 kind，而不是 `{ kind: "response", ok: boolean }`：
顶层单一判别键让两侧的反序列化都是纯声明式的。

帧层**不校验** `params` / `value` 的内容，它们在两侧都是 `JsonElement` / `unknown`。
内容校验是方法表的职责（§6）。

### 请求-响应不变量

每个 `request` 最终**恰好**收到一个 `result` 或 `error`。`cancel` 是尽力而为的：若 server 已
处理完则照常返回结果，若成功取消则返回带 `request_cancelled` 的 `error`。这条不变量保证客户端
的 pending 表不会泄漏。

---

## 4. 握手与鉴权

1. 客户端连接后立即发 `hello`，带自己支持的版本区间与 token。
2. server 校验 token。失败 → `fatal` + `invalid_token`，关闭连接。
3. server 协商版本：取 `[max(客户端min, 服务端min), min(客户端max, 服务端max)]` 的上界。
   无交集 → `fatal` + `unsupported_protocol_version`，且 `ServerInfo` 里带上 server 自己的区间，
   便于客户端提示用户该升级哪一侧。
4. 成功 → `welcome`，带 `ServerInfo`（含能力位）。

在收到 `welcome` 之前发送任何 `request` 都会得到 `handshake_required`。重复发 `hello` 得到
`handshake_already_completed`。

token 走 `hello` 帧而不是 HTTP header，是为了让本地与远程两种形态的鉴权路径完全一致，
不必区分"谁能设置 header"。

---

## 5. 能力位

`ServerInfo.capabilities` 列出该 server 实现了哪些可选方法：

| 能力位 | 门控的方法 | 引入阶段 |
| --- | --- | --- |
| `fs.browse` | `fs.browse` | 3f |
| `files.upload` | `files.upload` | 3f |
| `plugins` | `plugins.*` | 5 |
| `plugins.agentHost` | 插件的 agent 半是否可用 | 5 |
| `auth.rotateKey` | `auth.rotateKey` | 待定 |

客户端**必须**按能力位做功能降级，**不得**按 server 版本号推断。这样用户的远程 server 落后于
客户端时，客户端能自己关掉不支持的入口，而不是让用户点了才报 `method_not_implemented`。

没有能力位的方法是**核心方法**，任何 KAP v1 server 都必须实现。

---

## 6. 方法

完整方法表见 `agent/protocol/.../Methods.kt`（`KapMethod` 枚举）与
`packages/protocol/src/methods.ts`（`methodSpecs`）。命名规范 `<域>.<驼峰动作>`。

无入参的方法在线上是 `{}`；server 必须把缺省与 `null` 都当作 `{}`。

### 6.1 三处刻意偏离直觉的设计

`update` 类方法通常写成 `字段?: T | null`，用"缺省 / null / 有值"表达"不改 / 清空 / 设值"。
**KAP 不这么做**，因为 kotlinx.serialization 无法把"字段缺省"和"显式 `null`"区分开
（`val x: T? = null` 两种情况都得到 `null`）。硬套会让两侧对同一份 JSON 得出不同语义。

因此：

| 场景 | KAP 的做法 |
| --- | --- |
| ServerSettings | `settings.replace` **整体替换**。只有两个字段，替换的代价可忽略 |
| 供应商凭据 | 独立的 `providers.setCredential`，`apiKey` **必填可空**（`null` = 清除）。附带好处是凭据改动成为独立可审计操作 |
| 会话上下文窗口 | `contextWindowOverride?: { mode: "inherit" } \| { mode: "override", tokens: N }`。整个字段缺省 = 不改 |

`providers.update` 因此只处理非凭据字段，且所有字段都是"缺省即不改"的非空可选，没有歧义。

### 6.2 optional 与 nullable 的编码约定

两侧必须严格遵守，否则会出现"Kotlin 编码出的 JSON 被 TS 拒绝"：

| 语义 | TypeScript | Kotlin |
| --- | --- | --- |
| 可缺省 | `.optional()` | `val x: T? = null`（**有**默认值 → `encodeDefaults=false` 时省略） |
| 必填可空 | `.nullable()` | `val x: T?`（**无**默认值 → 始终编码为显式 `null`） |

Kotlin 侧 `KapJson` 配置了 `ignoreUnknownKeys = true`，与 Zod 默认剥离未知字段的行为对齐。
这也是前向兼容的基础：新版 server 多回字段不会让旧客户端解析失败。

### 6.3 路径语义

`Project.rootPath`、`Approval.requestedPath`、`BrowseResult.path` 都是 **server 侧绝对路径**。
客户端不得假定它在本机存在，也不得用本机路径分隔符解析。让用户选目录**必须**走 `fs.browse`，
不能用 Electron 原生目录对话框 —— 那是本地专属能力，远程模式下会选到错误的机器。

`files.*` 的 `relativePath` 相对项目根。server 负责 canonicalize 并校验 symlink 解析后的真实
路径仍在项目内。

---

## 7. 事件

线上形状：

```jsonc
{
  "type": "run.text",          // 判别键在顶层
  "sequence": 42,              // 全局单调递增，持久化
  "id": "evt_42",
  "projectId": "prj_01",       // 必填可空
  "threadId": "thr_01",
  "runId": "run_01",
  "createdAt": 1755400000000,
  "pluginId": "com.example.x", // 可缺省，仅插件产生的事件带
  "payload": { "text": "…", "step": 1 }
}
```

判别键与基础字段都在顶层，是为了让接收端**不必反序列化 payload 就能路由** —— 读一下 `type` 与
`threadId` 就能决定丢弃还是分发，这是客户端最频繁的操作。代价是 Kotlin 侧每个事件类要重复声明
6 个基础字段；这份重复是刻意接受的，换成 `meta` 嵌套虽能省样板代码，但会把成本转移到更高频的
客户端一侧。

### 7.1 全部 22 种事件

| 类型 | payload 要点 |
| --- | --- |
| `request.queued` | `requestId`, `input`, `position` |
| `queue.paused` | `reason`: `failed` / `cancelled` / `interrupted` / `compression_failed` |
| `queue.resumed` | `{}` |
| `run.started` | `requestId`, `input`, `modelProfileId` |
| `run.waiting` | `reason`（展示用文本） |
| `run.text` | `text`, `step`, `itemRef?` |
| `run.reasoning` | `text`, `kind`: `summary` / `raw` / `legacy`, `itemRef?` |
| `run.refusal` | `text`, `step`, `phase`, `itemRef?` |
| `run.annotation` | `annotation`（url/file/generic 三态）, `step`, `phase`, `itemRef?` |
| `run.toolCall` | `callId`, `name`, `argumentsJson`, `itemRef?` |
| `run.toolCallDelta` | `callId`, `step`, `phase`, `nameDelta?`, `argumentsDelta?`, `index?` |
| `run.toolOutput` | 按 `channel` 判别，见 §7.3 |
| `run.completed` | `usage`, `finalText`, `finalStep` |
| `run.failed` | `kind`（领域枚举）, `message`, `usage`, `retriable` |
| `run.cancelled` | `reason`, `usage` |
| `run.interrupted` | `reason`: `server_restarted` |
| `approval.requested` | `approval` |
| `approval.resolved` | `approval` |
| `thread.updated` | `thread`, `source`: `first_message` / `user` / `system` |
| `memory.compressed` | `summary`, `coveredThroughOrdinal`, `estimatedTokens` |
| `plugin.stateChanged` | `pluginId`, `status`, `generation`（阶段 5） |
| `plugin.log` | `pluginId`, `level`, `message`（阶段 5） |

旧协议的 `core.recovered` **已移除** —— 它在枚举里存在但代码里从未 publish 过，是死定义。

### 7.2 Koaks `model` 事件的拆分

旧协议把 Koaks 的 `AgentEvent.model` 整个塞进 `payload.event`，客户端得自己 narrow
`ModelEvent` 的 11 种变体。KAP 在 server 侧完成映射，只暴露客户端真正会渲染的三种：

| Koaks `ModelEvent` | KAP 事件 |
| --- | --- |
| `refusal_delta` | `run.refusal` |
| `annotation_added` | `run.annotation` |
| `tool_call_delta` | `run.toolCallDelta` |
| 其余（`started` / `checkpoint_updated` / `provider_event` / …） | 不上行 |

同理，Koaks 的 `ToolCall` 含 `nativeId` / `nativeItemId` 等供应商内部锚点，KAP 的 `ToolCall`
只有 `callId` / `name` / `argumentsJson` / `itemRef`。

### 7.3 `run.toolOutput` 的归并规则

按 `channel` 判别：

- `final` —— 最终结果，每次调用只出现一次，带 `isError` 与 `truncated`
- `stdout` / `stderr` / `status` —— 执行期间的流式增量，可多次
- `custom` —— 工具自定义结构化进度，`kind` + `dataJson` + 回退用 `text`

客户端归并：**流式通道追加，`final` 替换**。若此前有流式输出且 `final` 以已有内容为前缀，
则替换为 `final` 的完整内容。

上限：最终结果 64,000 字符（超出时 `truncated: true`），单次调用流式输出持久化 256,000 字符。

### 7.4 订阅与断线补发

server 向**所有已握手的连接**广播 `event` 帧，客户端自行按 `projectId` / `threadId` 过滤。
不做服务端订阅过滤是刻意的：单用户场景下连接数很少，客户端过滤的成本远低于维护订阅状态机。

断线重连后，客户端用 `events.list` 带上最后收到的 `sequence` 补齐空档。单页上限 2,000
（`hasMore` 指示是否要继续拉）。

**慢客户端不得阻塞 run 循环**：server 侧广播必须是有界队列，溢出就丢弃并让该客户端走补发路径。
旧实现的 `CoreEventBus` 是同步广播，这是被本次重构修复的问题之一。

---

## 8. 错误

```jsonc
{ "code": "thread_archived", "message": "会话已归档", "details": { "threadId": "thr_01" } }
```

`code` 是封闭枚举（完整清单见 `Errors.kt` / `errors.ts`），客户端**只允许**对它做行为分支。
`message` 仅用于展示，**不得**参与逻辑判断。新增错误码是向后兼容变更，客户端遇到未知码必须按
`internal_error` 兜底。

### run 失败 ≠ RPC 错误

两套枚举刻意分开：

- **`KapErrorCode`** —— 这次**请求**为什么没被受理（`invalid_params`、`thread_archived`…）。
  由客户端代码处理。
- **`RunFailureKind`** —— 这次**agent 运行**为什么没跑完（`model_error`、`tool_error`、
  `timeout`、`incomplete`…）。要展示给用户，并决定是否显示"重试"。

`runs.enqueue` 成功返回后，运行期的失败只通过 `run.failed` 事件上报，不会变成 RPC 错误。

---

## 9. 版本协商

```
生效版本 = min(客户端max, 服务端max)，且需 ≥ max(客户端min, 服务端min)
```

无交集时 server 回 `fatal` + `unsupported_protocol_version`。

**兼容性规则**：

- 新增方法、新增能力位、新增错误码、新增事件类型、给已有结构新增**可缺省**字段
  → 不升版本号
- 删除/重命名方法或字段、修改字段类型、把可缺省字段变必填、修改枚举已有值
  → 升大版本

客户端遇到未知事件类型时，两侧的解析器都会**拒绝**该帧（判别联合是封闭的）。这是刻意的：
静默忽略未知事件会让"客户端显示不全但不报错"这种问题极难排查。因此新增事件类型必须先发布
客户端支持，再由 server 通过能力位开启。

---

## 10. 一致性用例

`conformance/kap-v1-cases.json` 是两侧共用的**同一份**文件：

- TS：`tests/unit/protocol-conformance.test.ts`（`pnpm vitest`）
- Kotlin：`agent/protocol/.../ConformanceTest.kt`（`agent/gradlew :protocol:jvmTest`）

每条用例声明 `schema`（`clientFrame` / `serverFrame` / `event` / `methodInput` / `methodOutput`）、
`expect`（`accept` / `reject`）与 `value`。两侧必须得出相同结论。

用例文件通过 Gradle 任务 `generateConformanceFixtures` 编译进 Kotlin 源码 —— Kotlin/Native 的
测试进程没有可移植的文件读取入口，codegen 是让 JVM 与 5 个 native target 共用同一份用例的唯一办法。

reject 用例覆盖的不只是结构错误，还有语义不变量（`sequence` 非负、id 非空、插件 id 格式、
`baseUrl` 只能是 http/https）。**因此 Kotlin 侧每个 `@Serializable` 类型都在 `init` 块里
`require` 自己的不变量** —— kotlinx.serialization 只保证结构正确，不做语义校验，不补上这层
两侧就会对同一份 JSON 得出不同结论，那份用例也就失去了意义。
