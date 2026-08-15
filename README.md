# KoWork

KoWork 是一个本地优先的 Electron 桌面编码 Agent。界面运行在受限 Renderer 中，项目访问、运行队列、持久化、权限审批和 Koaks Runtime 运行在独立的 Core `utilityProcess` 中。

## 环境要求

- Node.js 22+
- pnpm 10+
- macOS 为首要支持平台
- 仓库内 Koaks 包：`vendor/koaks/koaks-node-0.0.1-beta3.tgz`

安装依赖：

```bash
pnpm install
```

## 模型配置

在应用的“设置 -> 模型供应商”中管理模型连接。首版支持 OpenAI、Anthropic、DeepSeek、Qwen、Ollama 和自定义供应商；DeepSeek 可选择 Chat Completions、Responses 或 Anthropic 协议，自定义供应商也支持这三类协议。

API Key 由 Electron Main 使用 `safeStorage` 加密后持久化。SQLite 只保存供应商、模型和凭据标识，Renderer 只能看到“已配置”状态，无法读回明文。Core 在创建 Agent 或刷新模型列表时按需向 Main 请求凭据。Ollama 不需要 API Key，也可以手工添加未提供模型枚举接口的模型 ID。

## 开发与验证

```bash
pnpm dev
KOWORK_FAKE_AGENT=1 pnpm dev
pnpm typecheck
pnpm lint
pnpm test
pnpm test:e2e
pnpm build
pnpm build:unpack
```

`KOWORK_FAKE_AGENT=1` 使用内置流式假 Agent。`pnpm test:e2e` 会先构建，再运行 Playwright Electron 全链路测试。平台构建命令为 `pnpm build:mac`、`pnpm build:win` 和 `pnpm build:linux`。

签名、notarization 和自动更新发布地址仍需在正式发布前配置。
