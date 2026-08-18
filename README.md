# KoWork

KoWork 是一个本地优先的 Electron 桌面编码 Agent。界面运行在受限 Renderer 中，项目访问、运行队列、持久化、权限审批和 Koaks Runtime 运行在独立的 Core `utilityProcess` 中。

## 环境要求

- Node.js 22+
- pnpm 10+
- macOS 为首要支持平台
- 仓库内 Koaks 包：`vendor/koaks/koaks-node-0.0.1-beta5.tgz`

安装依赖：

```bash
pnpm install
```

## 模型配置

在应用的“设置 → 模型 → 接入”中管理模型连接。默认提供 OpenAI、Anthropic 和 Qwen；OpenAI 可选择 Chat Completions 或 Responses。底部可添加更多提供商（再加一条 OpenAI / Anthropic / Qwen，或 OpenAI / Anthropic 兼容端点），名称默认为提供商名，便于同一平台使用多把 API Key。

API Key 由 Electron Main 使用 `safeStorage` 加密后持久化。SQLite 只保存供应商、模型和凭据标识，Renderer 只能看到“已配置”状态，无法读回明文。Core 在创建 Agent 或刷新模型列表时按需向 Main 请求凭据。也可以手工添加未提供模型枚举接口的模型 ID。

## 模型事件流

会话运行使用 Koaks `eventDetail: "lossless"`，以便 Core 准确提取文本、summary/raw 推理、工具参数增量、拒绝和注解等语义事件。这些用户可见事件会写入 `run_events`，应用重启后可以恢复会话内容。

原始 provider 事件和模型生命周期事件仅用于流式解码，不进入 KoWork 数据库，也不会显示在 Timeline 中。

## 开发约定

涉及界面、样式、动画、交互原语、主题、Inspector 卡片或 UI 插件的功能，开始实现前必须先阅读
[`docs/design-system.md`](docs/design-system.md)。该文档规定设计系统的唯一来源、目录边界、token
和组件使用规则；新的通用视觉能力应先进入 `packages/design-system`，业务代码再消费对应的 token
和原语，不能在 renderer 中另起一套实现。

架构总览见 [`docs/architecture.md`](docs/architecture.md)，分阶段重构任务和迁移状态见
[`docs/refactor-plan.md`](docs/refactor-plan.md)。

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
