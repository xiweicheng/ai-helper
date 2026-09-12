# 工作目录 HTML 文件渲染预览 — 设计文档

日期：2026-09-05
状态：已确认，待实施

## 背景与问题

工作目录面板（`src/side_panel/workspace-panel.js`）的文件预览能力按 `getPreviewType()` 分流。HTML 文件被归入 `text` 类型，走带行号的源码渲染分支（`workspace-preview-code-table`），用户只能看到 HTML 源码，看不到 HTML + CSS 的实际渲染效果。

对 AI 生成的页面类交付物而言，"看到渲染效果"是验收环节的核心诉求，源码视图无法满足。

## 目标

在工作目录的 HTML 文件预览中提供渲染视图，让用户直接看到 HTML 结构与 CSS 样式结合后的视觉效果，并可在渲染视图与源码视图之间切换。

## 非目标（本期明确不做）

| 项 | 原因 |
| --- | --- |
| 保证 `<script>` 执行 | 受扩展页 CSP 限制，需 manifest sandbox 页或 Agent 静态端点，属二期 |
| 相对路径本地资源解析（`./style.css`、`./img/a.png`） | srcdoc 的 base URL 为 `about:srcdoc`，无处解析；需 Agent 新增 GET 静态服务端点配合 `<base>`，属二期 |
| 缩放工具栏 | 侧边栏较窄时宽页面只能横向滚动；`ui-prototype.js` 已有现成实现可后续搬用 |
| HTML 开放"在浏览器中打开"按钮 | 与本期核心诉求无关，避免范围膨胀 |

## 能力边界（实施后须向用户明确说明）

| 渲染结果 | 内容 |
| --- | --- |
| 确定可用 | HTML 结构、内联 `<style>`、CDN 外链 `<link rel="stylesheet">`、远程 `<img src="https://...">`、远程字体 |
| 不可用 | 相对路径本地资源（CSS / 图片 / JS） |
| 尽力而为 | 内联 `<script>`、CDN `<script>`（如 Tailwind CDN） |

`script` 一项为"尽力而为"的原因：扩展页 CSP 为 `script-src 'self'`，srcdoc iframe 继承父文档 CSP，内联脚本很可能被拦截。保留 `sandbox="allow-scripts"` 属性以争取执行机会，但设计不依赖脚本执行。实施时须实测确认脚本是否运行，并将结论反馈用户。

CSS 与图片不受 `script-src` 约束（manifest 未声明 `default-src`），因此远程样式表与远程图片可正常加载。

## 方案选型

评估过三条路线，选定 B 的简化形态：

- **A：Agent 新增 GET 静态服务端点 + 面板内 iframe 直连。** iframe 内是 `http://127.0.0.1` 源文档，扩展页 CSP 不作用于它，脚本完整执行且相对资源天然解析，保真度最高。代价是需要改 Agent、处理 token 走 query 参数、并为远端 Agent 的混合内容拦截做降级。列为二期升级路径。
- **B：srcdoc iframe（选定）。** 复用 `ui-prototype.js` 已验证的 `wrapPrototypeHtml()` + `<iframe sandbox="allow-scripts">` 模式，不改 manifest、不改 Agent，改动面最小。
- **C：调 Agent 在系统浏览器打开。** 复用现有 `AgentClient.openBrowser()`，保真度 100% 但每次都要离开侧边栏，不满足"面板内查看"。

## 架构

### 新增单元：`src/side_panel/html-preview.js`

单一职责——把一段 HTML 文本安全地渲染进指定容器。不依赖任何工作目录 / Agent / i18n 状态，可独立测试。

导出三个函数：

- `wrapHtmlForPreview(html)` — 归一化 HTML 文本。完整文档（`<!DOCTYPE` 或 `<html` 开头）注入 `html,body{overflow:auto!important;height:auto!important;}` 滚动修复样式；HTML 片段包裹为标准文档结构（含 `<meta charset="UTF-8">` 与 viewport）。
- `mountHtmlPreview(container, html)` — 在 `container` 内创建 `<iframe class="workspace-html-preview-frame" sandbox="allow-scripts">` 并赋值 `srcdoc`，返回 iframe 元素。
- `unmountHtmlPreview(container)` — 清空 iframe 的 `srcdoc` 后移除节点，终止文档内可能在运行的定时器与动画。

`wrapHtmlForPreview` 由 `ui-prototype.js` 现有的私有函数 `wrapPrototypeHtml()` 抽取而来。`ui-prototype.js` 改为 import 该函数并删除本地副本，消除重复实现。这是一处受控的小重构（新增一行 import、删除一个函数），`ui-prototype.js` 的调用点与行为保持不变。

依赖方向：`html-preview.js` 不 import 任何 side_panel 模块，因此不引入循环依赖。

### 改动单元：`src/side_panel/workspace-panel.js`

**工具栏按钮**

在预览头部（`workspace-preview-header`）现有 Markdown 切换按钮 `workspacePreviewMdToggleBtn` 之后新增 `workspacePreviewHtmlPreviewBtn`，初始 `display:none`。

复用现成资产，不新增 CSS 与 i18n key：

- CSS 类沿用 `workspace-preview-md-toggle-btn workspace-preview-icon-btn`（`active` 蓝色高亮态已定义）
- 内部两个 SVG 沿用 `.workspace-preview-md-icon-preview`（眼睛）与 `.workspace-preview-md-icon-source`（代码）类名
- `updateMdToggleIcon(btn, isActive)` 按子元素类名查找图标、与按钮 id 无关，直接复用
- title 复用 `workspace.switchToRenderPreview`（"切换为渲染预览"）与 `workspace.switchToSourcePreview`（"切换为源码预览"）

按钮为纯图标按钮（与 `workspacePreviewMdToggleBtn` 同形制，无文字标签），「渲染预览」仅作为功能称呼；用户可见的文案是 hover tooltip，即复用的两个 i18n key。仅在扩展名为 `html` / `htm` 时显示。

**默认模式**

打开 HTML 文件默认进入渲染视图，与 Markdown 预览默认渲染的现有行为一致，直接消除"打开就是源码"的问题。点按钮切回源码视图。

**渲染分支**

在 `previewFile()` 的 `previewType === 'text'` 分支内，于现有 Markdown 判断（`ext === 'md' || ext === 'markdown'`）之后并列新增 HTML 判断（`ext === 'html' || ext === 'htm'`）：

1. 显示切换按钮并置 `active`，title 设为 `switchToSourcePreview`，调 `updateMdToggleIcon(btn, true)`
2. 将读到的文本存入模块级 `currentHtmlSourceText`
3. `previewContent` 加 `html-rendered` 类
4. 调 `mountHtmlPreview(previewContent, wrapHtmlForPreview(text))`
5. 清空行数统计、隐藏编辑按钮、保留复制/下载/全屏按钮

**切换函数 `toggleHtmlPreview()`**

新增，绑定到按钮 click 事件，与现有 `toggleMarkdownPreview()` 并列（两者互不干涉，因为同一时刻只有一个按钮可见）。职责：

1. 切换 `previewContent` 的 `html-rendered` 类，以切换后的状态决定分支
2. 渲染分支：调 `mountHtmlPreview(previewContent, wrapHtmlForPreview(currentHtmlSourceText))`，按钮置 `active`、title 设为 `switchToSourcePreview`、`updateMdToggleIcon(btn, true)`，清空行数统计、隐藏编辑按钮
3. 源码分支：调 `unmountHtmlPreview(previewContent)` 后按现有 `workspace-preview-code-table` 行号逻辑渲染 `currentHtmlSourceText`，按钮去 `active`、title 设为 `switchToRenderPreview`、`updateMdToggleIcon(btn, false)`，恢复行数统计与编辑按钮

源码文本始终取自 `currentHtmlSourceText`，切换过程不重复请求 Agent。`previewFile()` 的 HTML 分支与 `toggleHtmlPreview()` 的渲染分支共用同一套挂载逻辑，避免两处实现漂移。

源码视图沿用现有 `workspace-preview-code-table` 行号渲染逻辑，不做改动。

**样式类命名**

容器使用新类 `html-rendered`，不复用 `markdown-rendered`。原因：`copyPreviewContent()` 以 `previewContent.classList.contains('markdown-rendered')` 判定是否走 Ctrl+Click 富文本分支，而该分支的 `copyWorkspaceRichText()` 依赖查找 `.workspace-preview-markdown` 节点。复用会导致 HTML 预览下 Ctrl+Click 复制静默失败。

使用 `html-rendered` 后，`copyPreviewContent()` 的现有逻辑天然正确：`previewType` 为 `text` 通过校验，`isRendered` 为 false 走普通分支，`markdownText` 为空因而回落到 `readFileContent()` 读取并复制原始 HTML 源码。无需修改该函数。

**工具栏按钮联动**

| 按钮 | 渲染模式 | 源码模式 |
| --- | --- | --- |
| 复制 | 显示 | 显示 |
| 下载 | 显示 | 显示 |
| 全屏 | 显示 | 显示 |
| 编辑 | 隐藏 | 显示 |
| 行数统计 | 清空 | 显示 |
| 渲染切换按钮 | `active` + 代码图标 | 非 `active` + 眼睛图标 |

渲染模式下隐藏编辑按钮：对 iframe 内的渲染结果做文本编辑无意义。用户需先切回源码视图再编辑。

**编辑模式衔接**

`enterEditMode()` 当前隐藏 `mdToggleBtn`，需在同一处连带隐藏 `workspacePreviewHtmlPreviewBtn`。

`saveEditedFile()` 与 `cancelEditMode()` 均在结尾重跑 `previewFile()`，会自动重置全部按钮状态并回到渲染视图，无需额外处理。

**状态重置**

两处需补齐新状态的重置，避免跨文件预览时状态残留：

- `previewFile()` 开头（现有 `mdToggleBtn` 重置的同一位置）：隐藏新按钮、移除 `active`、图标复位、移除 `html-rendered` 类、`currentHtmlSourceText = null`、调 `unmountHtmlPreview()`
- `closePreview()`（现有 `markdown-rendered` 清理的同一位置）：同上

**状态存放**

源码文本存于模块级 `let currentHtmlSourceText = null`，对齐文件内 `currentPdfDoc` / `currentMediaUrl` 等既有模块级状态的做法。不写入 `previewArea.dataset`——大 HTML 字符串挂在 DOM attribute 上会产生序列化开销。

### 改动单元：`src/side_panel/styles.css`

新增两条规则：

- `#workspacePreviewContent.html-rendered { overflow: hidden; padding: 0; }` — 滚动交由 iframe 内部文档处理，避免双层滚动条
- `.workspace-html-preview-frame { width: 100%; height: 100%; border: 0; display: block; }`

全屏预览（`previewArea.fullscreen`）无需额外适配：容器撑满后 iframe 以 100% 跟随。

### 改动单元：`src/side_panel/ui-prototype.js`

删除私有函数 `wrapPrototypeHtml()`，改为从 `./html-preview.js` import `wrapHtmlForPreview`。两处调用点（`showUiPrototypeDialog()` 与 `downloadPrototype()`）仅替换函数名，行为不变。

## 数据流

```
双击 HTML 文件 / 产物面板点预览
  → previewFile(filePath, fileName)
  → getPreviewType() === 'text'，大小未超 PREVIEW_MAX_TEXT (1MB)
  → readFileContent(filePath)            // POST /api/fs/read，UTF-8 文本
  → ext === 'html' | 'htm'
  → currentHtmlSourceText = text
  → wrapHtmlForPreview(text)             // 归一化 + 滚动修复
  → mountHtmlPreview(previewContent, wrapped)
  → <iframe sandbox="allow-scripts" srcdoc="...">
```

点切换按钮 → `toggleHtmlPreview()` 在 `mountHtmlPreview()` 与行号源码渲染之间切换，源码文本始终取自 `currentHtmlSourceText`，不重复请求 Agent。

## 错误处理

- 文件超过 `PREVIEW_MAX_TEXT`：沿用现有 `workspace.fileTooLargeNoPreview` 提示，不进入渲染分支
- `readFileContent()` 失败：沿用现有 `workspace.previewFailed` 提示
- HTML 文本为空或纯空白：`wrapHtmlForPreview()` 仍包裹为标准文档，iframe 渲染空白页，不报错
- iframe 内部脚本抛错：由 sandbox 隔离，不影响侧边栏；无需捕获
- 关闭预览 / 切换文件：`unmountHtmlPreview()` 先清 `srcdoc` 再移除节点，避免文档内定时器与动画在后台继续运行

## 测试

- 单测文件 `test/unit/html-preview.unit.test.js`（沿用项目 `<name>.unit.test.js` 命名约定）。本项目 vitest 默认 `environment: 'node'`，而本测试需操作 iframe DOM，必须在文件首行加 `// @vitest-environment jsdom` 显式覆盖。覆盖点：
  - `wrapHtmlForPreview()` 对完整文档注入滚动修复样式（分别覆盖含 `</head>`、仅含 `<body>`、两者都无三种输入）
  - `wrapHtmlForPreview()` 对 HTML 片段包裹出含 charset 与 viewport 的标准文档
  - `mountHtmlPreview()` 创建的 iframe 带 `sandbox="allow-scripts"` 且 `srcdoc` 已赋值
  - `unmountHtmlPreview()` 移除节点前清空 `srcdoc`
- 回归验证 `ui-prototype.js` 重构后原型预览与下载行为不变
- 手工验证：内联 `<style>` 页面渲染正确、CDN `<link>` 样式生效、渲染/源码切换往返、编辑保存后回到渲染视图、全屏、关闭预览无残留、切换预览不同文件无状态串味
- 实测并记录 `<script>` 是否执行，结论反馈用户

## 交付要求

按项目既有约定，改动完成后执行 `npm run build:silent` 构建。

## 二期升级路径（备忘）

若后续需要完整保真（脚本执行 + 相对资源解析），推荐方案 A：Agent 新增 `GET /api/fs/view/<相对路径>` 静态服务端点，复用 `checkPath()` 做工作目录边界校验，流式返回原始内容与正确 `Content-Type`；面板内 iframe 的 `src` 直指该端点。iframe 内为 `http://127.0.0.1` 源文档，扩展页 CSP 不再适用，脚本完整执行且相对路径天然解析。需处理：token 经 query 参数传递、远端 Agent 的混合内容拦截降级到 `AgentClient.openBrowser()`、老版本 Agent 无该端点时的兼容降级。
