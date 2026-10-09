# 侧边栏输入区一体化容器改造 设计文档

日期：2026-10-09
状态：已确认（一体化容器 / "+" 收纳单行 / 信息带保持现状 / 四档降级链——均经 4 轮 mockup 评审确认）

## 背景与目标

侧边栏输入区现状为"三层结构"：上方工具栏（记忆/工具/划词 ｜ 助手/温度）+ 独立输入框（内部左右内嵌按钮）+ 输入框下方信息带（占用环 / AI 声明 / 模型名）。用户参考主流 AI 客户端（Qoder 等）的输入框形态提出改造：

1. **一体化容器**：输入区收进一个大圆角容器——上部文字输入区、下部功能入口行，输入框去掉独立边框；
2. **入口全部下移**：上方工具栏移除，记忆/工具/划词/助手/温度/发送等整合进容器底行；
3. **"+" 收纳**：提示词/截图/附件收进底行最左侧 "+" 按钮的菜单（底行最清爽、最贴参考截图）；
4. **信息带保持现状**：输入框下方的占用环 / AI 声明 / 模型名——不搬、不合、不改（用户明确指示）。

## 已确认的设计决策（mockup 评审记录）

| # | 决策 | 确认来源 |
|---|---|---|
| 1 | 一体化容器（textarea 与底行同一大圆角框，textarea 无边框） | 用户第 1 轮选择 |
| 2 | "+" 收纳单行方案（提示词/截图/附件收进 "+"） | 用户第 1 轮选择，4 轮沿用 |
| 3 | 底行 7 入口：`+ / 记忆 / 工具 / 划词 ｜ 助手 / 温度 / 发送` | 第 4 轮最终形态 |
| 4 | 信息带（环/声明/模型名）不搬、不合、不改，位置样式原样保留 | 用户第 4 轮明确指示 |
| 5 | 四档测量式降级链（见下文） | 第 2、4 轮确认 |
| 6 | 组合键与状态逻辑全部无损保留（提示词 Ctrl+单击、截图 Ctrl/Shift+单击、发送停止态） | 用户第 2 轮强调 + 源码逐项核对 |

## UI 设计

### 目标形态（宽屏，约 ≥450px 侧边栏）

```
┌─ .input-container（一体化大圆角容器）───────────────┐
│  [动态指示条：划词/网页/知识库/图片/文件（如有）]     │
│  输入 / 快捷提示、@ 切换助手或网页…                  │ ← textarea 无边框
│                                                    │
│  [+] [记忆 全] [工具 48] [划词]   [🤖 默认助手] [🌡 0.65] [➤] │ ← .input-bottom-row
│  ◔ 9%        内容由 AI 生成，仅供参考     deepseek-v4-pro  │ ← 信息带（现状不动）
└────────────────────────────────────────────────────┘
```

- 容器：大圆角（16px）+ 单一边框 + 轻阴影（现 `.input-container` 的 border-top 分隔线移除，改为完整边框）；textarea 去边框/圆角/阴影，focus 视觉从 textarea 迁移至容器 `:focus-within`（现 `.input-container textarea:focus` 的紫色描边效果平移至容器）；
- 底行：单行 flex，左组（+ 与三个开关）右组（助手/温度/发送），中间弹性空间；
- 信息带：DOM 与样式完全不动；容器 padding-bottom 22px 保持，三元素继续以现存 absolute 定位浮动于容器底部（视觉位于底行下方一行，与现状"输入框下方"一致）。

### 四档降级链（测量式，无硬编码断点）

沿用现有 `toolbar-adapt.js` 的"实测降级"机制（每次测量 → 不足才降一级 → 空间恢复自动还原）；降级对象从旧工具栏改为底行。让位顺序 = 信息文字优先、功能标签其次、入口最后：

| 级 | 不足时收缩 | 视觉变化 |
|---|---|---|
| ①②  | 隐藏温度数字 → 助手名折叠 emoji | 🌡 0.65 → 🌡；🤖 默认助手 → 🤖（悬停看全名） |
| ③ | 记忆/工具/划词 → 图标态 | [🧠] [🔧｜48] [✏️]：激活态浅紫底保留；工具 = 图标 + 计数分体小胶囊（**配置入口不丢**）；记忆条数做成角标 |
| ④ | 划词收进 "+" 菜单（兜底） | 底行 = [+] [🧠] [🔧｜48] [🤖] [🌡] [➤]；"+" 加蓝点提示"菜单内有开启的开关"；极端不足时 gap 收紧兜底 |

宽度参考（中文界面、示意值）：≥450px 完整 / ≈400px 触发 ①② / ≈330px 触发 ③ / ≤300px 触发 ④；英文文案与长名称场景由测量机制自动提前降级。

### "+" 菜单（浮层）

- 触发：点击底行最左 "+"；再次点击 / 点击外部关闭；点击任一项后自动关闭；
- 位置：向上弹出（`bottom: calc(100% + 8px)`，与现有各下拉一致）；
- 内容：
  - **添加区（常驻）**：提示词 / 截图 / 附件——三个原按钮移入，按钮改为"图标 + 文字标签"菜单项；副标签标注组合键（`Ctrl+单击 → 网页`、`Ctrl+单击 → 区域截图`），避免组合键功能隐没；
  - **开关区（仅 ④ 级时出现）**：划词开关整组移入（DOM 动态移动），菜单内显示为开关行；
- "+" 蓝点：菜单内存在已激活开关（划词开启）时显示，关闭时消失。

### 信息带（不动约束）

`#contextUsageIndicator` / `.input-disclaimer` / `#currentModelTag`：
- DOM、定位（left/right/bottom）、样式、现有 420px 媒体查询降级**全部保持现状**；
- 不参与底行测量与降级，不进入 "+" 菜单。

## 功能保全清单（逐个源码核对）

| 入口 | 新位置 | 必须保留的交互 |
|---|---|---|
| 提示词 | "+" 菜单 | 单击 = 提示词选择器；**Ctrl/Cmd+单击 = 网页选择器** |
| 截图 | "+" 菜单 | 单击 = 整页截图；**Ctrl/Shift/Cmd+单击 = 区域截图**；`enableImageInput` 控制显隐 |
| 附件 | "+" 菜单 | 单击 = 文件选择（图片识别开启时图片走图片消息）；拖拽上传保留 |
| 发送 | 底行最右 | 生成中自动变"停止"按钮（stop-mode），点击取消任务 |
| 记忆 | 底行左 | 开关切换（全局持久化）+ 条数标签下拉（不限 / 最近 N 条 / 自定义 1-400） |
| 工具 | 底行左 | 总开关 + 配置按钮（配置弹窗、计数、双色角标） |
| 划词 | 底行左（④ 级时移入菜单） | 开关切换 |
| 助手 | 底行右 | 助手下拉（切换/管理/配对全套） |
| 温度 | 底行右 | 模型设置浮层（厂商/模型/温度滑杆/预设） |

不受影响：输入框键盘交互（`/` `@` `$`、↑↓ 历史、Esc、Enter/Shift+Enter）、动态指示条、拖拽门板、所有下拉浮层（助手/温度/记忆条数/工具配置）。

## 技术方案

### DOM 改造（side_panel.html）

1. `.input-toolbar` 整体移除，子元素迁移：
   - `#memoryGroup` / `.tool-toggle-wrapper` / 划词组 → `.input-bottom-row` 左组
   - `#agentSelectorWrapper` / `.temp-selector` → `.input-bottom-row` 右组
2. 新增 `.input-bottom-row`（置于 `.input-wrapper` 之后）：
   - 左组：`#inputAddBtn`（新）→ `#memoryGroup` → `.tool-toggle-wrapper` → 划词组
   - 右组：`#agentSelectorWrapper` → `.temp-selector` → `#sendBtn`（从 `.input-right-buttons` 移出）
3. 新增 `#inputAddMenu`（浮层，位于底行内便于对齐定位，向上弹出）：添加区含 `#promptTriggerBtn` / `#screenshotBtn` / `#fileAttachBtn`（移入）+ 开关区容器 `#inputAddMenuSwitches`
4. `.input-right-buttons` 容器移除（截图/附件→菜单、发送→底行）
5. `.input-wrapper` 保留：内部仅剩 `#fileInput`（hidden）与 `#userInput`；拖拽上传（dragenter/dragover/drop、drag-over 门板）与键盘交互零改动
6. textarea 去掉左右 44px 内嵌按钮让位 padding（改写 `.input-wrapper textarea` 现规则）
7. 三个开关的 label 内各加一个隐藏 `<span class="toggle-icon">`（图标态显示，避免 i18n 覆盖问题）
8. 信息带三元素（`#contextUsageIndicator` / `.input-disclaimer` / `#currentModelTag`）DOM 原样不动
9. **所有元素 id 保持不变**（事件绑定零改动的前提）

### CSS 改造（styles.css）

- `.input-container`：一体化容器（完整边框 + 16px 圆角 + 背景 + 轻阴影，移除现 border-top 分隔线）；textarea 去边框/圆角/阴影（改写现 `.input-container textarea` 与 `:focus` 规则），focus 迁移至容器 `:focus-within`；
- `.input-bottom-row`：flex 单行布局、gap、左右分组；
- 元素尺寸按 mockup：chips 12px 字、按钮统一小尺寸、发送按钮圆形；
- 降级态样式：
  - 沿用并改写 `temp-collapsed` / `agent-collapsed`（类名保留，作用对象改底行）；
  - 新增 `switches-icon`（③ 级：隐藏文字、图标态、工具分体胶囊、记忆角标）；
  - 新增 `selection-in-menu`（④ 级：底行隐藏划词组）；
- `#inputAddMenu` 浮层样式 + "+" 蓝点（`::after`）；
- 清理 `.input-toolbar` 相关死样式；
- **不动**：信息带（`.context-usage-indicator` / `.input-disclaimer` / `.current-model-tag`）全部样式与 420px 断点规则。

### JS 改造（3 个文件）

1. **重写 `src/side_panel/toolbar-adapt.js`**：
   - 目标选择器改为 `.input-bottom-row`，容器仍为 `.input-container`；
   - 降级链 4 级类切换（①②③④）；
   - ④ 级"划词收进菜单"：降到底仍溢出时，DOM 移动划词组到 `#inputAddMenuSwitches`（恢复时移回底行左组）；事件监听绑定在元素上，移动不丢失；
   - 保留三大约束：浮层测量排除（`isInsideOverlay`/`collectOverlays`）、恢复后动画快进（`finishReplayedAnimations`）、MutationObserver 跳过浮层内部变更；rAF 节流。
2. **新增 `src/side_panel/input-add-menu.js`**：菜单开合、外部点击关闭、菜单项点击后关闭、蓝点状态更新（监听划词开关状态）。
3. **修改 `src/side_panel/index.js`**：初始化接线（自适应初始化沿用、菜单初始化）。
4. 其余模块（agent-manager.js / prompt-manager.js / tool-panel.js / 发送逻辑等）**零改动**——id 与事件绑定全部不变。

### i18n（src/shared/locales/zh.js / en.js）

新增 key：菜单项主标签（提示词/截图/附件）、副标签组合键提示（`Ctrl+单击 → 网页` 等）、菜单开关区标题；其余复用现有 key。

## 边界情况

| 场景 | 行为 |
|---|---|
| 助手下拉 / 模型浮层打开时测量 | 浮层排除，不误降级（沿用现约束） |
| 语言切换（中↔英） | 文案长度变化触发重测自动适配 |
| 记忆条数标签（全 ↔ 数字）、工具计数变化 | MutationObserver 触发重测 |
| 生成中 | 发送按钮 stop-mode 照常；菜单与降级不受影响 |
| 最窄 280px | ④ 级后实测仍有余量；极端情况 gap 收紧兜底 |
| 图片功能关闭（enableImageInput=false） | 菜单中截图项隐藏（与原 display 逻辑一致） |
| 拖拽文件 | 拖入门板挂载 `.input-wrapper`，行为不变 |
| 浮层动画 | 降级测量隐藏-恢复后快进动画，防闪帧（沿用现约束） |
| 输入区高度变化 | 上方工具栏（约 30px）与新增底行（约 30px）互抵，整体高度基本持平；聊天区由既有 flex 布局自动消化 |

## 文件改动清单

| 类型 | 文件 | 内容 |
|---|---|---|
| 修改 | `side_panel.html` | 底行 DOM、"+" 按钮与菜单、textarea 调整、图标 span |
| 修改 | `src/side_panel/styles.css` | 一体化容器、底行、四档降级态、菜单浮层、死样式清理 |
| 重写 | `src/side_panel/toolbar-adapt.js` | 4 级降级链 + 菜单收容逻辑 |
| 新增 | `src/side_panel/input-add-menu.js` | 菜单交互与蓝点 |
| 修改 | `src/side_panel/index.js` | 初始化接线 |
| 修改 | `src/shared/locales/zh.js`、`src/shared/locales/en.js` | 新 i18n key |

## 测试计划

- 视觉探针（Playwright，`test-results-probes/` 惯例，独立目录防清空）：
  - 全宽度扫描（280~700px）：四档降级按顺序触发、无水平溢出、信息带位置不受影响；
  - "+" 菜单：开合、外部点击关闭、菜单项点击后关闭、④ 级蓝点显隐、划词移入/移出菜单；
  - 组合键：Ctrl+单击提示词 → 网页选择器；Ctrl+单击截图 → 区域截图（stub 验证）；
  - 功能回归：记忆条数下拉、工具配置弹窗、助手下拉、模型设置浮层在底行位置下正常弹出与定位。
- 构建验证：`npm run build:silent`。

## 不在本期范围

- 底行新增其他功能入口（MCP / 技能等）；
- 信息带的任何调整（用户明确不动）；
- 双行形态、横向滚动等替代布局（评审阶段已否决）。
