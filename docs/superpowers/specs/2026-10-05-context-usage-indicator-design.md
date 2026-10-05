# 上下文占用指示器与手动压缩 设计文档

日期：2026-10-05
状态：已确认（口径=占上下文窗口 / 持久摘要压缩 / 当前模型 AI 生成 / 记忆开关保持全局 / 摘要注入 system prompt / 覆盖式单摘要）

## 背景与目标

侧边栏输入框下方的免责声明（`.input-disclaimer`，"内容由 AI 生成，仅供参考"）绝对定位居中，左右两侧为空白。本方案利用左下角空白：

1. 展示**会话级**上下文占用百分比（实时反映"下一次发送的预计 token 占用"）；
2. 点击可打开详情弹窗，查看占用分解与记忆/压缩状态；
3. 提供**手动压缩**：将"将要携带的上下文"（含旧摘要）用当前模型浓缩为一段摘要，持久化缓存到会话，此后发送直接复用。

核心设计原则（回答"压缩频率"问题）：

| 动作 | 频率 | 是否调 API | 是否持久化 |
|---|---|---|---|
| 发送时的本地组装（摘要+消息子集）+ 兜底裁剪 | 每次发送 | 否（纯本地，毫秒级） | 否 |
| AI 压缩摘要生成 | **仅用户手动点击时** | 是（一次调用） | **是，会话对象（会话级缓存）** |
| 占用百分比计算 | 输入防抖 300ms | 否（纯本地） | 否 |

绝不"每次发送前调 AI 压缩"。AI 摘要只在手动触发时生成一次并持久化，后续发送零 API 调用复用缓存；再次手动压缩才重新生成（覆盖更新）。

## 上下文占用计算模型

### 口径

```
占用% = 预计发送 tokens ÷ 模型上下文窗口 × 100%
```

- 分母 = `getContextWindow(model, userConfiguredWindow, customModelMap)` 返回的上下文窗口（与发送路径一致）。
- 分子 = 模拟下一次发送的真实组装结果：

```
预计发送 tokens = systemPromptTokens + toolTokens + selectedHistoryTokens + currentInputTokens
```

| 组成 | 来源 |
|---|---|
| 系统提示词 | `getSystemPrompt(agent)` 实际文本 `estimateTokens`（含压缩摘要注入段）；结果缓存，见"更新时机" |
| 工具定义 | `(state.enabledTools.length + 有效 MCP 工具数) × 200`（复用 `estimateToolsTokens` 口径） |
| 历史消息 | `selectHistoryForSend()` 的选择结果，逐条剥图片（`stripImagesFromContent`）后 `estimateMessagesTokens` |
| 当前输入 | 输入框 `userInput.value` 的 `estimateTokens` |

- 输出预留（4096）与安全余量（2000）**不计入分子**，在详情弹窗中单独列出说明。
- 颜色分档：复用 `assessContextPressure(预计发送, 上下文窗口)` → `<0.7` 正常 / `<0.9` 警告（橙）/ `≥0.9` 危险（红）。

### 历史选择流水线（与发送同源）

按以下顺序执行，封装为共享纯函数 `selectHistoryForSend()`（新增 `src/shared/context-usage.js`），发送路径与预览计算共用，杜绝显示值与实际发送漂移：

1. **记忆层**：`isolateChat === false` → 历史为空（仅当前消息）。
2. **窗口层**：`maxMemoryMessages` 有值 → 取全量历史的最近 N 条；否则全量。
3. **压缩层**：若会话存在有效 `contextCompaction`：
   - 摘要（S）拼入 system prompt 注入段永久携带（见"摘要注入 system prompt"），不参与窗口滑动与预算裁剪；
   - 窗口内位于压缩点（`upToMessageId`）**之后**的消息保留；位于压缩点及之前的消息由 S 替代，不再重复携带。
4. **预算层**：对"窗口内保留消息 + 当前消息"做 token 预算裁剪（从后往前保留至 `historyBudget` 内，与现有实现一致；S 在 system 中受 `preserveSystem` 保护、不参与裁剪）；被裁消息生成规则式摘要（`generateMessagesSummary`）返回给调用方注入 system prompt（现有兜底逻辑保留）。

输出结构：

```js
// src/shared/context-usage.js
export function selectHistoryForSend(history, {
  isolateChat,          // 记忆开关
  maxMemoryMessages,    // 条数限制（null/0 = 全部）
  compaction,           // contextCompaction 对象或 null
  historyBudget,        // token 预算（由各调用方按现行口径计算后传入）
  currentMessage,       // 当前待发送消息（用于预算计数）
}) -> {
  messages,             // 最终携带的消息数组（含当前消息）
  compactionApplied,    // 压缩是否生效
  trimmedCount,         // 预算裁剪掉的历史条数
  historySummaryText,   // 被裁消息的规则摘要（调用方注入 system，可为 null）
}

export function computeContextUsage({ model, agent, tools, history, inputText, maxMemoryMessages, compaction, customModelMap })
  -> { usedTokens, contextWindow, ratio, level, breakdown: { system, tools, history, input, outputReserve } }
```

预览与发送同源细则：`computeContextUsage` 内部按**主发送路径（chat-manager.js）现行口径**推导 `historyBudget`（`窗口 - systemTokens - 4096 - 2000`，再取 70%），并将 `inputText` 作为 `currentMessage` 参与预算计数；主发送路径改造后，预览与发送调用同一函数，口径天然一致。

### 更新时机

| 触发 | 说明 |
|---|---|
| 输入框输入 | 防抖 300ms 重算 |
| 消息发送完成 / 接收完成 | 重算 |
| 会话切换 | 重算（百分比跟随会话） |
| 记忆开关 / 条数限制变化 | 重算 |
| 模型或上下文窗口配置变化 | 重算 |
| 压缩完成 / 撤销 | 重算 |

系统提示词缓存策略：初始化、每次发送完成后、Agent/相关配置变化时异步刷新缓存文本；防抖计算使用缓存值，不重复调用 `getSystemPrompt()`（其中含 agent 服务网络查询）。有效 MCP 工具数同样按发送后缓存。

## 压缩模型（覆盖式单摘要）

**压缩对象 = 点击压缩那一刻，按当前记忆设置窗口选出的全部携带内容**（若已有旧摘要，旧摘要一并参与浓缩；含窗口内压缩点之后的全部消息，**不经发送时预算裁剪**——即超长时逐条截断清洗后仍全量参与浓缩，避免"被裁头部永久丢失"）。压缩不设"保留最近 N 条"，条数设置（1 条 / N 条 / 全部）决定携带范围，压缩决定"这批内容原文发还是浓缩后发"，两者正交。

**发送公式**：

```
system prompt = 基础系统提示词 + [上下文摘要 S 注入段（若有）]   ← S 拼入 system，非独立消息
发送消息数组   = [窗口内、压缩点之后的消息] + [当前输入]
```

- S 物理上拼入 system prompt（与"被裁消息规则摘要"注入方式一致，`preserveSystem` 天然保护其不被自动裁剪机制丢弃）；逻辑上代表压缩点之前的会话背景，不参与条数窗口滑动；
- `maxMemoryMessages` 继续对窗口生效（相对全量历史取最近 N 条）；
- 再次压缩 = 覆盖式更新：`S_new = AI浓缩(S_old + 当前窗口内压缩点之后的消息)`，压缩点前移到被压缩内容的最后一条，始终只有一段摘要。

**示例**：

| 时刻 | 历史总量 | 记忆设置 | 动作 | 实际发送 |
|---|---|---|---|---|
| 初始 | 50 条 | 全部 | — | 50 条 |
| 压缩① | 50 条 | 全部 | 浓缩 50 条 → S1 | S1 |
| 新增 6 条 | 56 条 | 全部 | — | S1 + 51~56 |
| 压缩② | 56 条 | 全部 | 浓缩 (S1+51~56) → S2 | S2 |

| 时刻 | 历史总量 | 记忆设置 | 实际发送 |
|---|---|---|---|
| 初始 | 50 条 | 带 10 条 | 41~50 |
| 压缩① | 50 条 | 带 10 条 | S1（41~50 浓缩） |
| 新增 6 条 | 56 条 | 带 10 条 | S1 + 51~56 |
| 窗口滑过压缩点后 | 76 条 | 带 10 条 | S1 + 67~76 |

边界：
- 记忆关闭（携带 0 条历史）时压缩按钮禁用（无可压缩内容）；
- 只带 1 条也可压缩（压缩对象即该条）；
- 生成中（`isGenerating`）禁用压缩按钮。

## UI 设计

### 指示器（输入框下方左下角）

```
┌──────────────────────────────────────────────┐
│  (输入工具栏: 记忆(3) 工具⚙ 划词      助手)   │
│  ┌────────────────────────────────────────┐  │
│  │ 输入框                                  │  │
│  └────────────────────────────────────────┘  │
│  ◔ 42%           内容由 AI 生成，仅供参考      │
└──────────────────────────────────────────────┘
```

- 形态：圆环 + 百分比小胶囊按钮，颜色随档位（正常灰绿 / 警告橙 / 危险红）；
- hover：`title` 提示"预计发送 54K / 128K tokens"（复用 `formatTokenCount`）；
- 点击：打开详情弹窗；
- `.input-container` 底部布局调整：免责声明保持居中，指示器绝对定位左下（保持 `pointer-events` 可点，免责声明维持 `pointer-events:none`）；
- 窄屏（420px 断点，项目已有该断点）简化为圆环图标或更小字号。

### 详情弹窗

复用 `showTokenPopup` 的定位与关闭模式（点击外部关闭、自适应上下方）：

1. 顶部：大号百分比 + 进度条 + 状态文案（上下文充裕 / 偏高 / 接近上限）；
2. 分解列表：系统提示词 / 工具定义（N 个）/ 历史消息（携带 x/y 条 · 预算裁剪 z 条）/ 当前输入 / 输出预留 4.1K / 安全余量 2K；
3. 记忆状态行：`记忆已开启 · 携带全部|N 条`；记忆关闭时提示"记忆关闭：仅发送当前问题"；
4. 参考行：最近一次请求的实际 `prompt_tokens`（取自最近一条含 `tokenUsage` 的 executionLog，估算 vs 实际对比）；
5. 压缩状态区：
   - 无压缩：`压缩上下文`按钮（记忆关闭或历史为空时禁用）；
   - 已有压缩：`已压缩 N 条（摘要 ≈ x tokens）` + `撤销压缩`按钮（未发送新消息时）；发送新消息后显示 `再次压缩`按钮（覆盖式合并更新），撤销窗口关闭。

### 压缩交互流程

```
点击压缩 → 确认弹窗（将压缩 N 条；当前 62% → 预计 18%；提示调用 AI 需几秒）
→ 确认 → 按钮 loading（禁止重复触发）→ 成功：保存会话 + 插入分隔条 + 刷新指示器
→ 失败：toast 报错，数据不变
```

### 聊天区分隔条

在压缩点（`upToMessageId`）对应消息之后渲染：

```
────────────────────────────────
⬆ 上方 N 条消息已压缩为摘要 · 查看 / 撤销
────────────────────────────────
```

- `查看`：展开显示摘要文本；`撤销`：二次确认后移除压缩（恢复全量携带）；
- 渲染点：`chat-manager.js` 的历史渲染与恢复路径（`_loadChatHistoryImpl` / `addMessage` 恢复 / 流式 HTML 恢复），按 `upToMessageId` 定位插入；
- `upToMessageId` 在消息列表中找不到时：不渲染分隔条，压缩视为失效（见数据模型）。

## 数据模型

### 会话对象新增字段（IndexedDB，存整会话对象，无需 schema 迁移）

```js
contextCompaction: {
  summary: string,          // AI 生成的摘要文本
  upToMessageId: string,    // 压缩覆盖边界（含该条消息）
  compressedCount: number,  // 本次压缩覆盖的消息条数（含并入的旧摘要所代表条数）
  summaryTokens: number,    // 摘要的 token 估算
  savedTokens: number,      // 发送侧预估节省（压缩前携带 tokens - 压缩后携带 tokens）
  model: string,            // 生成摘要使用的模型
  createdAt: string,
  revision: number,         // 覆盖式压缩的递增版本号
}
```

- `saveCurrentSession()`（`src/storage/session-store.js`）在保存时同步该字段；`switchToSession()` 时恢复到 `state`；
- **每次发送前不重算、不验证**该字段（保持"发送零额外成本"）：仅在发送组装时读取使用；
- 失效兜底：`upToMessageId` 找不到（消息被删/编辑）→ 本次发送忽略压缩（回到常规逻辑），详情弹窗提示"压缩记录已失效，可移除"；不自动删除数据。

### 摘要注入 system prompt

- 发送时组装：`systemPrompt + '\n\n' + '[上下文摘要｜压缩 N 条历史]\n' + summary`；
- 与现有"被裁消息规则摘要注入 system"（chat-manager.js 既有 `messages[0].content + '\n\n' + summary` 模式）完全一致，避免 role 顺序兼容问题；
- 注入段文案走 i18n（zh/en）。

## 发送集成（三处发送路径）

改造范围：`chat-manager.js`（sendMessage 主路径，含工具）、`index.js`（directSend / 划词发送）、`prompt-manager.js`（提示词发送）。

三处现有逻辑（记忆开关 → 条数限制 → 预算裁剪 → 规则摘要注入）统一切换为调用 `selectHistoryForSend()`：

- 各调用方保留自身差异（预算窗口计算口径、工具数），通过参数传入 `historyBudget` / `currentMessage`；
- 返回的 `messages` 直接用于后续发送组装；`historySummaryText` 按现有方式注入 system；
- `compaction.summary` 注入 system 的操作也由各调用方在组装 `messages[0]` 后追加（共享一个 helper：`appendCompactionToSystemPrompt(systemContent, compaction)`）。

## 与现有自动机制的关系（无冲突、分层互补）

系统现有四种"自动"机制，与手动压缩作用域不同，互不覆盖：

| # | 机制 | 位置 | 触发条件 | 作用域 | 是否调 AI | 是否持久化 |
|---|---|---|---|---|---|---|
| A | 发送前预算裁剪 + 规则摘要 | 三处发送路径（超 `historyBudget` 时） | 每次发送 | 本次请求的消息组装 | 否 | 否 |
| B | 发送前临界压力裁剪（`assessContextPressure` = critical） | 三处发送路径发送前 | ≥90% 窗口 | 本次请求的消息组装 | 否 | 否 |
| C | ReAct 循环增量摘要（`trimMessages()` 摘要模式） | background/react-loop.js | 每轮工具执行后超 ReAct 预算 | 单次任务执行期上下文（工具轮次） | 是（每轮最多 3 次，失败降级兜底） | 否 |
| D | ReAct 循环压力裁剪 | react-loop.js（每轮 API 调用前） | critical 或 >85% 窗口 | 单次任务执行期上下文 | 否 | 否 |

与手动压缩（会话级、AI 生成、持久化）的协同结论：

1. **不覆盖**：A/B/C/D 均不读写会话对象的 `contextCompaction` 字段；会话数据层的手动压缩成果不会被自动机制修改或清除。
2. **不冲突的物理保证**：S 注入 system prompt，A/B 的 `trimMessagesByBudget` 以 `preserveSystem=true` 运行，S 不会被裁剪丢弃；C/D 在 background 执行期操作 `currentMessages`，与侧边栏会话历史及 S 隔离。
3. **协同方向**：手动压缩降低发送占用 → A/B 触发频率下降、warning/critical 状态回落；C/D 因 ReAct 初始上下文变小而更少触发。自动机制逻辑保持不变，继续作为安全网保留（仅作用于未压缩的保留消息与当前消息）。
4. **概念对应**：C 相当于"任务执行期内的自动压缩"（一句话摘要工具轮次），手动压缩相当于"会话历史的显式压缩"（结构化摘要问答历史）；两者层次不同、可同时存在。

极端边界：若压缩后仍触发 A/B（如摘要+保留消息本身超大），自动机制仅作用于未压缩部分；即使保留消息被裁至最少，S 仍随 system 保留。

## AI 摘要通道（background）

- 新增消息类型 `COMPACT_CONTEXT_SUMMARY`（侧边栏 → background）；
- 侧边栏负责准备素材：按当前携带范围取消息（`selectHistoryForSend` 结果的等价物，或直接消息引用），逐条清洗（剥图片 `stripImagesFromContent`、单条内容超长用 `truncateContentSmart` 截断到合理上限），控制摘要请求输入不超模型窗口；
- background 新建 `context-compactor.js`，模式参照 `context-summarizer.js`：读取当前 API 配置（apiBase/apiKey/model）→ `fetchWithRetry` 非流式单次调用（低温度，`max_tokens` 约 2048）→ 返回摘要文本；
- 提示词要求结构化输出（中文）：当前任务目标与进展、关键结论与决策、涉及的文件/路径/数据、未完成事项与后续步骤；总长限制（如 ≤1000 字）；
- 通过 `token-recorder.recordTokenUsage` 记录本次调用（`callType: 'context_compaction'`）；
- 失败处理：HTTP/解析/超时失败 → 返回错误 → 侧边栏 toast 报错，不改数据（不静默降级为规则式摘要，避免"假压缩"）。

## 边界情况汇总

| 场景 | 行为 |
|---|---|
| 记忆关闭 | 指示器正常显示（低占用）；压缩按钮禁用 |
| 无历史/历史为空 | 压缩按钮禁用 |
| 生成中 | 压缩按钮禁用；指示器可正常查看 |
| 压缩点消息被删除 | 压缩本次发送失效（忽略），详情提示可移除，不自动删除 |
| 压缩时素材超长 | 逐条截断清洗，保证摘要请求可发出 |
| 摘要生成失败 | toast 报错，会话数据不变 |
| 撤销压缩 | 删除字段 + 保存会话 + 移除分隔条 + 刷新指示器（二次确认） |
| 压缩后仍触发自动裁剪（A/B） | 自动机制仅作用于未压缩的保留消息与当前消息；S 随 system 保留（见"与现有自动机制的关系"） |
| 会话切换/删除 | 压缩随会话存储；删除会话自动清理（整对象删除） |
| 模型切换（窗口变化） | 指示器重算；压缩摘要不因模型切换失效 |
| 历史恢复渲染 | 分隔条在 `_loadChatHistoryImpl` 等恢复路径按 `upToMessageId` 重建 |
| 窄屏（<420px） | 指示器精简显示 |

## 文件改动清单

| 类型 | 文件 | 内容 |
|---|---|---|
| 新增 | `src/shared/context-usage.js` | `selectHistoryForSend()` / `computeContextUsage()` / `appendCompactionToSystemPrompt()` |
| 新增 | `src/side_panel/context-indicator.js` | 指示器渲染、详情弹窗、压缩流程编排（确认/loading/撤销） |
| 新增 | `src/background/context-compactor.js` | AI 摘要生成 |
| 修改 | `side_panel.html` | 指示器 DOM 容器 |
| 修改 | `src/side_panel/styles.css` | 指示器 / 详情弹窗 / 分隔条 / 窄屏样式 |
| 修改 | `src/side_panel/chat-manager.js` | 发送路径改用共享选择函数；分隔条渲染与恢复 |
| 修改 | `src/side_panel/index.js` | directSend / 划词路径改用共享选择函数；初始化指示器 |
| 修改 | `src/side_panel/prompt-manager.js` | 提示词发送路径改用共享选择函数 |
| 修改 | `src/storage/session-store.js` | 持久化 `contextCompaction`；切换会话恢复 |
| 修改 | `src/side_panel/state.js` | 新增当前会话压缩状态字段 |
| 修改 | `src/background/index.js` | 注册 `COMPACT_CONTEXT_SUMMARY` 消息处理 |
| 修改 | i18n（各模块 `registerTranslations`） | 指示器/弹窗/压缩/分隔条 zh+en 文案 |

## 测试计划

单测（`test/unit/`，Vitest）：

- `context-usage`：记忆开关 × 条数（1/N/全部）× 压缩（有/无/失效）× 预算裁剪的组合场景下 `selectHistoryForSend` 输出与 `computeContextUsage` 计算；
- 压缩示例表的逐行验证（含覆盖式二次压缩、窗口滑过压缩点）；
- 边界：记忆关闭、空历史、压缩点失效、摘要段参与预算裁剪。

手动 / E2E 场景：

- 三场景百分比正确性（关记忆 / 全带 / 带 2 条）且与实际发送 log 中的 tokens 一致；
- 压缩 → 发送 → 指示器下降 → 再压缩覆盖更新 → 撤销恢复；
- 输入实时刷新、会话切换刷新、模型切换刷新；
- 分隔条在刷新/切换会话后的恢复；窄屏显示。

## 后续事项（非本期）

- 记忆开关与条数限制改为会话级（本期保持全局，已确认）；
- 自动压缩策略（阈值触发）——本期仅手动。
