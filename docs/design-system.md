# KoWork 设计系统开发规范

本文是阶段 1 之后 renderer 和 UI 插件共同遵守的视觉实现规范。它回答两个问题：新的设计应该放在哪里，以及业务代码应该如何消费设计系统。

目标架构总览见 [`architecture.md`](architecture.md)，阶段迁移记录见 [`refactor-plan.md`](refactor-plan.md)。如果本文与代码 API 不一致，以 `packages/design-system/src/index.ts` 和 `packages/design-system/src/styles/index.css` 的实际公开接口为准，并在同一个变更中修正文档。

## 一、唯一来源与目录边界

视觉契约只有一个来源：`packages/design-system/`。renderer 和未来的 UI 插件都从这里消费 token、样式和通用交互原语。

| 位置                                                 | 负责什么                                                                          | 不负责什么                                 |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------------ |
| `packages/design-system/src/styles/tokens.css`       | 默认浅色冻结基线、圆角、focus、阴影、动画时长/缓动                                | 业务组件样式、业务数据                     |
| `packages/design-system/src/styles/palettes.css`     | 暗色语义 token                                                                    | 运行时计算、自定义强调色                   |
| `packages/design-system/src/styles/accents.css`      | 浅/暗预置强调色和色板预览                                                         | 自定义强调色算法                           |
| `packages/design-system/src/styles/theme-layers.css` | 壁纸、chrome、raised 和主题切换图层                                               | Electron 系统材质配置                      |
| `packages/design-system/src/styles/motion.css`       | `Reveal`、`Disclosure`、`SwapText`、`OrbitSquares` 的 keyframes 及 reduced-motion | 业务组件自定义动画                         |
| `packages/design-system/src/styles/primitives.css`   | selectable、surface、button、focus 等基础视觉行为                                 | 页面布局和业务状态                         |
| `packages/design-system/src/styles/content.css`      | Markdown、代码高亮等内容展示的语义颜色                                            | Markdown 解析和数据获取                    |
| `packages/design-system/src/components/`             | 可跨功能复用的 React 原语                                                         | KoWork 业务流程、React Query、Electron API |
| `packages/design-system/src/plugin-ui-kit.ts`        | 版本化、冻结的插件 UI 公开组件集合                                                | Inspector 注册表、宿主专属能力             |
| `packages/design-system/src/theme/`                  | 外观输入解析、自定义强调色推导、dataset/CSS 变量应用                              | React 状态、Electron IO                    |
| `src/renderer/src/assets/main.css`                   | 窗口尺寸、三栏布局、拖拽区、面板 resizing、业务间距、滚动条几何                   | 新的颜色、圆角、动画契约                   |
| `src/renderer/src/features/`                         | 按业务域组织页面和业务组件                                                        | 通用视觉原语、协议定义                     |
| `src/renderer/src/widgets/`                          | 跨功能域的复合业务组件                                                            | 第二套基础组件实现                         |
| `src/renderer/src/shared/ui/`                        | 仍需要业务行为的展示组件，如 Markdown、重命名输入、可调整面板                     | 与 design-system 重复的通用原语            |
| `src/renderer/src/features/inspector/registry.ts`    | Inspector 卡片注册、排序、订阅                                                    | 卡片视觉基础和插件发现                     |

### 放置规则

1. 新能力如果是“任何页面都可能需要”的视觉或交互原语，先放入 `packages/design-system`。
2. 新能力如果只描述 KoWork 的业务概念，例如审批、供应商、会话指标，放入对应的 `features/<domain>/`。
3. 只影响窗口布局或 Electron 容器几何的 CSS，放在 renderer 的 `main.css`；仍必须使用 `kw-*` token。
4. 不在 `shared/ui` 新建 `Blur*`、`Animated*`、`Selection*`、自绘菜单或按钮的平行实现。发现缺口时，先扩展 design-system，再迁移业务调用点。
5. Inspector 新卡片必须通过 `features/inspector/registry.ts` 注册，不能回到 `InspectorPanel.tsx` 里追加固定 `<section>`。

## 二、Token 使用规则

### 颜色

- 主题颜色字面量（hex、rgb、rgba）只允许出现在 `packages/design-system/src/styles/**/*.css`。`src/theme/derive-accent.ts` 只对用户输入的 `#rrggbb` 做通道运算并生成 CSS 值，不维护预置主题色。
- renderer 不直接使用 `neutral-*`、`blue-*`、`red-*` 等 Tailwind 调色板类作为视觉契约。
- 优先使用语义类，例如 `bg-kw-surface`、`bg-kw-surface-subtle`、`text-kw-text-primary`、`text-kw-text-muted`、`border-kw-border-default`、`bg-kw-selection-hover`、`text-kw-danger`。
- 业务状态使用 `kw-success`、`kw-warning`、`kw-info`、`kw-danger` 族；不要在业务组件中重新挑选一组颜色。
- `data-frosted` 只覆盖语义 surface 和 selection token。不要重新维护 `--kowork-select-*` 或其他组件私有颜色变量。

### 主题与图层

默认 light + default 使用阶段 1 冻结的 surface/selection 基线，并将强调色设为灰色。`blue` 在 light/dark 下都使用蓝色选中态。默认路径不得用 JavaScript 覆盖 surface、selection 或 accent 变量；其他预置强调色由 CSS 表维护，自定义强调色才由确定性算法生成 overlay 变量。

`html` 使用以下主题 dataset：

- `data-color-scheme="light|dark"` 是解析后的实际配色；用户选择 `system` 时仍只写解析后的 light/dark。
- `data-accent="default|blue|teal|violet|rose|amber|emerald|custom"` 选择预置 CSS 表或自定义 overlay。
- `data-wallpaper="on|off"` 控制壁纸和 chrome 透明叠加。
- `data-system-backdrop`、`data-platform` 由宿主提供；组件不得据此自行计算颜色。
- `data-frosted` 表示当前 chrome 需要透出下层。无壁纸时只用于有系统材质的侧栏；有壁纸时用于侧栏、主栏、Inspector 和状态栏。

窗口视觉分为四层：

1. OS 层：vibrancy、mica 或 canvas，由 Electron Main 管理。
2. Wallpaper 层：全窗固定图片，只在 `background != null` 时存在；图片本身不透明，模糊使用 `--kw-wallpaper-blur`。图片需按 blur 半径向四周 overscan，并显式解除全局 `img` 最大宽度限制，避免窗口右侧或边缘露出空隙。
3. Chrome 层：应用三栏与状态栏使用 `.kw-chrome`。左侧栏额外带 `data-sidebar`，浅/暗模式分别使用更亮且更通透的侧栏 token；有壁纸时 `surfaceOpacity` 只改变这一层的 alpha，不改变图片或 raised 元素。
4. Raised 层：dialog、popover、context menu、tooltip 与 Composer 使用不透明 `--kw-color-surface-raised`，不继承壁纸透明度。

会话顶栏与 Inspector 顶栏统一使用 `.kw-titlebar-blur`，共享侧栏 chrome 背景与同一 `backdrop-filter`。包含顶栏的展开态容器不得长期保留 `transform`、`filter` 或相应 `will-change` 来创建新的 backdrop root；折叠动画只在折叠状态应用这些属性，否则会截断顶栏对 Wallpaper/OS 层的模糊采样。

业务组件不得根据主题分支写第二套类名或颜色。主题运行时只调用 `resolveAppearance()` 和 `applyAppearance()` 写 dataset、壁纸参数与自定义强调色变量；切换主题用 `Reveal` 遮罩，不 remount App，也不把 CSS 值放进 React Context。

### 圆角

四级表面 scale 是唯一标准：

| token          | 值     | 典型用途                                      |
| -------------- | ------ | --------------------------------------------- |
| `rounded-sm`   | 6px    | badge、tag、tooltip、progress、segmented cell |
| `rounded-md`   | 8px    | 按钮、输入、列表行、菜单项                    |
| `rounded-lg`   | 12px   | 卡片、面板、菜单容器、下拉                    |
| `rounded-xl`   | 16px   | 对话框、composer 外壳、消息气泡               |
| `rounded-full` | 9999px | 仅圆形控件，如发送/取消按钮                   |

不要使用 `rounded-[...]` 或引入新的半径值。`rounded-md` 从旧的 6px 变为 8px 是已接受的阶段 1 视觉变化。

### Focus、边框与 surface

使用 `Button`、`IconButton`、`Surface` 和 design-system 的 focus class 获取统一 focus 环、边框和背景。原生 `input`、`textarea`、`select` 如需手写样式，也必须组合 `kw-*` token 和统一 focus token，不能写新的 `ring-blue-*` 或局部 focus 颜色。

## 三、动画与交互原语

业务组件只选择原语，不定义动画细节：

| 需求                                                       | 使用                                                            | 说明                                                                                                       |
| ---------------------------------------------------------- | --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| 页面、pane、卡片、菜单、下拉、对话框、审批条、流式内容进出 | `Reveal`                                                        | 通过 `variant` 选择 `default`、`from-bottom`、`dialog`、`overlay`、`stream`；退出完成使用 `onExitComplete` |
| 展开和收起                                                 | `Disclosure.Root` + `Disclosure.Trigger` + `Disclosure.Content` | 高度由组件测量，chevron 用 `Disclosure.Chevron`                                                            |
| 文本内容替换                                               | `SwapText`                                                      | 不要在业务组件里重新实现 blur swap                                                                         |
| 运行中状态指示                                             | `OrbitSquares`                                                  | 仅用于状态指示，不把它当作页面过渡                                                                         |

禁止在业务文件中新增 `@keyframes`、`cubic-bezier`、自定义 motion duration，或用 timer 猜测退出动画时长。`Reveal` 的 `animationend` 生命周期是退出完成的唯一通知机制；`prefers-reduced-motion` 由设计系统集中处理。

## 四、选中、悬停与按钮

选中和悬停统一使用 `SelectableList` / `SelectableItem`：

- 纵向列表（会话、设置导航、provider）使用 `orientation="vertical"`。
- 横向 tab 或 segmented control 使用 `orientation="horizontal"`。
- 默认 `selectionStyle="sliding"`；没有稳定滑轨或需要整项填充时明确使用 `selectionStyle="fill"`。
- 不要用 `hover:bg-neutral-*` 等直接调色板类、伪元素或蓝色下划线另起一套选中视觉；统一交给 selectable 原语和 `kw-selection-*` token。单个独立项目行也应使用 `SelectableItem`，并让 `data-selected` 反映当前状态。

按钮使用 `Button` 的 `primary`、`secondary`、`ghost`、`danger` 变体；图标操作使用 `IconButton` 并提供可访问的 `label`。不要用带文字的圆角矩形替代已有的图标按钮，也不要在业务处复制 hover/focus 规则。

## 五、插件 UI 约定

插件只依赖 `@kowork/design-system` 的 `PluginUiKit` 和 CSS custom properties，并自动继承宿主当前的 light/dark、accent、chrome/raised 语义。阶段 2 没有修改 `PluginUiKit` 的组件集合或 API 版本，`Slider` 只从普通入口导出。插件不得：

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
