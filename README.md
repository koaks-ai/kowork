# KoWork

KoWork 是一个 Electron 桌面编码 Agent。当前运行架构仍是 Electron 内嵌 TypeScript Core，项目正在
重构为 Electron 纯客户端与 Kotlin/Native Agent Server 分离、支持本地与远程同构部署的架构。

## 环境要求

- Node.js 22+
- pnpm 10+
- macOS 为首要开发平台
- 仓库内 Koaks 包：`vendor/koaks/koaks-node-0.0.1-beta5.tgz`

## 快速开始

```bash
pnpm install
pnpm dev
```

使用内置流式假 Agent：

```bash
KOWORK_FAKE_AGENT=1 pnpm dev
```

模型连接在应用的“设置 → 模型 → 接入”中配置。

## 常用验证

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm build
pnpm test:e2e
```

`pnpm test:e2e` 会先构建，再运行 Playwright Electron 全链路测试。其他开发、打包和平台构建命令以
`package.json` 为准。

## 项目文档

- [`AGENTS.md`](AGENTS.md) —— 重构导航、开发规范与验证要求
- [`docs/architecture.md`](docs/architecture.md) —— 目标架构、进程边界和最新迁移状态
- [`docs/refactor-plan.md`](docs/refactor-plan.md) —— 分阶段重构范围、顺序与验收条件
- [`docs/design-system.md`](docs/design-system.md) —— UI、样式、动画、主题和插件界面规范
- [`docs/protocol/kap-v1.md`](docs/protocol/kap-v1.md) —— KoWork Agent Protocol v1 规范
- [`docs/decisions/`](docs/decisions/) —— 架构决策及其背景、取舍和推翻条件
