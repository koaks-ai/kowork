# KoWork 设计系统开发规范

本文是阶段 1 之后 renderer 和 UI 插件共同遵守的视觉实现规范。它回答两个问题：新的设计应该放在哪里，以及业务代码应该如何消费设计系统。

目标架构总览见 [`architecture.md`](architecture.md)，阶段迁移记录见 [`refactor-plan.md`](refactor-plan.md)。如果本文与代码 API 不一致，以 `packages/design-system/src/index.ts` 和 `packages/design-system/src/styles/index.css` 的实际公开接口为准，并在同一个变更中修正文档。

## 一、唯一来源与目录边界

视觉契约只有一个来源：`packages/design-system/`。renderer 和未来的 UI 插件都从这里消费 token、样式和通用交互原语。

| 位置 | 负责什么 | 不负责什么 |
| --- | --- | --- |
| `packages/design-system/src/styles/tokens.css` | 语义颜色、圆角、focus、阴影、动画时长/缓动、surface token | 业务组件样式、业务数据 |
| `packages/design-system/src/styles/motion.css` | `Reveal`、`Disclosure`、`SwapText`、`OrbitSquares` 的 keyframes 及 reduced-motion | 业务组件自定义动画 |
| `packages/design-system/src/styles/primitives.css` | selectable、surface、button、focus 等基础视觉行为 | 页面布局和业务状态 |
| `packages/design-system/src/styles/content.css` | Markdown、代码高亮等内容展示的语义颜色 | Markdown 解析和数据获取 |
| `packages/design-system/src/components/` | 可跨功能复用的 React 原语 | KoWork 业务流程、React Query、Electron API |
| `packages/design-system/src/plugin-ui-kit.ts` | 版本化、冻结的插件 UI 公开组件集合 | Inspector 注册表、宿主专属能力 |
| `src/renderer/src/assets/main.css` | 窗口尺寸、三栏布局、拖拽区、面板 resizing、业务间距、滚动条几何 | 新的颜色、圆角、动画契约 |
| `src/renderer/src/features/` | 按业务域组织页面和业务组件 | 通用视觉原语、协议定义 |
| `src/renderer/src/widgets/` | 跨功能域的复合业务组件 | 第二套基础组件实现 |
| `src/renderer/src/shared/ui/` | 仍需要业务行为的展示组件，如 Markdown、重命名输入、可调整面板 | 与 design-system 重复的通用原语 |
| `src/renderer/src/features/inspector/registry.ts` | Inspector 卡片注册、排序、订阅 | 卡片视觉基础和插件发现 |

### 放置规则

1. 新能力如果是“任何页面都可能需要”的视觉或交互原语，先放入 `packages/design-system`。
2. 新能力如果只描述 KoWork 的业务概念，例如审批、供应商、会话指标，放入对应的 `features/<domain>/`。
3. 只影响窗口布局或 Electron 容器几何的 CSS，放在 renderer 的 `main.css`；仍必须使用 `kw-*` token。
4. 不在 `shared/ui` 新建 `Blur*`、`Animated*`、`Selection*`、自绘菜单或按钮的平行实现。发现缺口时，先扩展 design-system，再迁移业务调用点。
5. Inspector 新卡片必须通过 `features/inspector/registry.ts` 注册，不能回到 `InspectorPanel.tsx` 里追加固定 `<section>`。

## 二、Token 使用规则

### 颜色

- 颜色字面量（hex、rgb、rgba）只允许出现在 `packages/design-system/src/styles/tokens.css`。
- renderer 不直接使用 `neutral-*`、`blue-*`、`red-*` 等 Tailwind 调色板类作为视觉契约。
- 优先使用语义类，例如 `bg-kw-surface`、`bg-kw-surface-subtle`、`text-kw-text-primary`、`text-kw-text-muted`、`border-kw-border-default`、`bg-kw-selection-hover`、`text-kw-danger`。
- 业务状态使用 `kw-success`、`kw-warning`、`kw-info`、`kw-danger` 族；不要在业务组件中重新挑选一组颜色。
- `data-frosted` 只覆盖语义 surface 和 selection token。不要重新维护 `--kowork-select-*` 或其他组件私有颜色变量。

### 圆角

四级表面 scale 是唯一标准：

| token | 值 | 典型用途 |
| --- | --- | --- |
| `rounded-sm` | 6px | badge、tag、tooltip、progress、segmented cell |
| `rounded-md` | 8px | 按钮、输入、列表行、菜单项 |
| `rounded-lg` | 12px | 卡片、面板、菜单容器、下拉 |
| `rounded-xl` | 16px | 对话框、composer 外壳、消息气泡 |
| `rounded-full` | 9999px | 仅圆形控件，如发送/取消按钮 |

不要使用 `rounded-[...]` 或引入新的半径值。`rounded-md` 从旧的 6px 变为 8px 是已接受的阶段 1 视觉变化。

### Focus、边框与 surface

使用 `Button`、`IconButton`、`Surface` 和 design-system 的 focus class 获取统一 focus 环、边框和背景。原生 `input`、`textarea`、`select` 如需手写样式，也必须组合 `kw-*` token 和统一 focus token，不能写新的 `ring-blue-*` 或局部 focus 颜色。

## 三、动画与交互原语

业务组件只选择原语，不定义动画细节：

| 需求 | 使用 | 说明 |
| --- | --- | --- |
| 页面、pane、卡片、菜单、下拉、对话框、审批条、流式内容进出 | `Reveal` | 通过 `variant` 选择 `default`、`from-bottom`、`dialog`、`overlay`、`stream`；退出完成使用 `onExitComplete` |
| 展开和收起 | `Disclosure.Root` + `Disclosure.Trigger` + `Disclosure.Content` | 高度由组件测量，chevron 用 `Disclosure.Chevron` |
| 文本内容替换 | `SwapText` | 不要在业务组件里重新实现 blur swap |
| 运行中状态指示 | `OrbitSquares` | 仅用于状态指示，不把它当作页面过渡 |

禁止在业务文件中新增 `@keyframes`、`cubic-bezier`、自定义 motion duration，或用 timer 猜测退出动画时长。`Reveal` 的 `animationend` 生命周期是退出完成的唯一通知机制；`prefers-reduced-motion` 由设计系统集中处理。

## 四、选中、悬停与按钮

选中和悬停统一使用 `SelectableList` / `SelectableItem`：

- 纵向列表（会话、设置导航、provider）使用 `orientation="vertical"`。
- 横向 tab 或 segmented control 使用 `orientation="horizontal"`。
- 默认 `selectionStyle="sliding"`；没有稳定滑轨或需要整项填充时明确使用 `selectionStyle="fill"`。
- 不要用 `hover:bg-neutral-*` 等直接调色板类、伪元素或蓝色下划线另起一套选中视觉；统一交给 selectable 原语和 `kw-selection-*` token。单个独立项目行也应使用 `SelectableItem`，并让 `data-selected` 反映当前状态。

按钮使用 `Button` 的 `primary`、`secondary`、`ghost`、`danger` 变体；图标操作使用 `IconButton` 并提供可访问的 `label`。不要用带文字的圆角矩形替代已有的图标按钮，也不要在业务处复制 hover/focus 规则。

## 五、插件 UI 约定

插件只依赖 `@kowork/design-system` 的 `PluginUiKit` 和 CSS custom properties。插件不得：

- 依赖宿主 Tailwind class 名作为 API；
- 直接写颜色、圆角、动画时长或缓动；
- 访问 `MarkdownContent`、`ResizablePanel`、Inspector registry、React Query 或 Electron API；
- 绕过 registry 直接修改 Inspector DOM。

`PluginUiKit` 当前 API 版本为 1，组件集合是 `Reveal`、`Disclosure`、`SelectableList`、`SelectableItem`、`Surface`、`Button`、`IconButton`、`SwapText`、`OrbitSquares`。修改集合或组件契约时，必须更新 `version.ts`、插件文档和对应 boundary/unit 测试。

## 六、新视觉需求的提交流程

1. 先搜索现有 token 和原语，确认是否可以直接复用。
2. 如果不能复用，在 `packages/design-system` 增加语义 token 或原语，并补组件测试。
3. 将 renderer 业务组件迁移到新 API；布局专属 CSS 仍留在 renderer。
4. 补充 `design-system-boundary` 检查，确保没有 raw color、非 token 圆角、旧动画或第二套 selectable 实现。
5. 对用户可见交互补 unit/e2e 断言，并运行 `pnpm typecheck`、`pnpm test`、`pnpm build`。全仓 lint 需与既有基线比较，不得新增错误。

这套流程的核心约束是：设计先进入设计系统，再进入业务页面；业务页面不能成为新的视觉真源。
