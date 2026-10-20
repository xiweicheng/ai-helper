# 脚本产物识别增强 + 聊天内文件路径可点击 设计方案

- 日期：2026-10-20
- 范围：侧边栏任务文件产物（Artifacts）识别链路 + 聊天消息 Markdown 渲染
- 约束（用户明确）：**不改 Agent 端、不遍历工作目录、零执行成本取向**；产物识别采用「提示词声明 + stat 兜底」，不引入 ReAct 循环内软门
- 交付：功能一（AI 声明脚本动态生成的产物并入面板）+ 功能二（聊天回答里的文件路径可点击，定位到侧边栏自带工作目录面板）

## 1. 背景与问题

用户反馈：下达「处理一件事 / 生成报表文件」类任务时，AI 通过脚本（如 `python3 export_bookmarks.py`）在运行时**动态生成**文件（如带日期的 `浏览器书签分类分析_2026-10-20.xlsx`），但最终「本次任务的文件产物」面板识别不到这些文件，只能识别到脚本本身（`.py`）。用户还希望：AI 回答里涉及文件路径时，能直接点击路径定位到该文件、打开侧边栏自带的工作目录管理面板并高亮那个文件（**不是**调系统 Finder）。

### 1.1 根因

现有产物识别（`src/side_panel/artifacts-manager.js` 的 `extractArtifactsFromExecutionLog`）是**纯静态分析**：解析 `agent_exec` 命令本身、扫描已知脚本内容（bash/CMD/PowerShell/Python 的写文件模式）、兜底解析 `ls -R`/`find` 输出。对**运行时才确定路径**的动态生成文件（日期名、随机名、运行时拼接路径）静态无法预测——这是能力缺口，不是 bug。Agent 端 `executor.js` 执行命令时对文件系统零感知。

### 1.2 业界做法与本方案定位

| 做法 | 代表 | 机制 | 本方案取舍 |
|------|------|------|-----------|
| 执行窗口快照 diff | Devin / OpenHands | 命令 spawn 前后各扫一次目录取差集 | ❌ 用户否决：遍历成本 + 脏目录风险 |
| fs.watch 事件流 | — | 常驻监听工作目录收集变更事件 | ❌ 事件噪声 / 跨平台差异 / 重启漏事件 |
| AI 自觉声明 | Cursor / Claude Artifacts | 提示词要求 AI 列出产物 | ✅ 采用为主通道（零成本） |
| 路径 linkify | Claude Code / Cursor | 渲染时把路径转可点击 | ✅ 采用为功能二 |

**关键共识（用户已确认）**：「让 AI 自觉声明」无论用工具还是文本约定，都**无法 100% 保证照做**（独立工具更易被当收尾动作跳过）。因此本方案不追求"绝对不漏"，而是**静态分析地板（已有，确定性场景不依赖 AI）+ AI 声明补缺口（尽力而为，覆盖动态路径）+ stat 校验（防幻觉）**三层组合。

## 2. 设计决策

### 2.1 功能一：AI 声明产物的载体 = 文本约定（非新增工具）

在**主 ReAct 系统提示词**中要求 AI：当通过脚本/命令生成或修改了文件，在**最终回答末尾**用固定行内标记列出产物路径。

- 落点：`src/side_panel/utils.js` 的 `getSystemPrompt(agent)`（`chat-manager.js:1064` 调用它构造 `messages[0]`）。在此追加一段产物声明指引，与现有工作目录/命令执行环境说明同处。
- **选择文本约定而非 `report_artifact` 工具的理由**：文本声明与"最终回答"天然绑定，漏报率低于需要 AI 主动额外调用的独立工具；且零工具定义改动、不改工具执行链路。用户已确认此取舍。
- 标记格式（行内、易正则、不与 Markdown 语法冲突）：
  ```
  [[artifact:浏览器书签分类分析_2026-10-20.xlsx|书签统计报表]]
  [[artifact:export_bookmarks.py|导出脚本]]
  ```
  路径部分必填、描述（`|` 之后）可选。提示词中给出正例，并明确"只列本次任务在工作目录内真实生成/修改的文件，不要列未产生的文件"。

提示词文案（zh/en 双语，随 `getSystemPrompt` 现有语言分支）要点：
1. 触发条件：本次任务通过脚本或命令创建/修改了文件产物时。
2. 输出位置：最终回答的**末尾**，每条一行 `[[artifact:路径|可选说明]]`。
3. 约束：仅列工作目录内、本次真实产生的文件；路径尽量给出相对工作目录或绝对路径；不得虚构。

### 2.2 功能一：声明的解析、校验与并入

新增纯函数落在 `artifacts-manager.js`（与既有提取逻辑同处，不新建模块）：

- `parseDeclaredArtifactsFromText(text)`：正则扫描 `[[artifact:...|...]]` 标记，返回 `[{ path, note }]`；对路径做变量引用过滤（含 `$VAR`/`${VAR}`/`%VAR%` 的丢弃，沿用既有约定）。
- 在 `chat-manager.js` 产物按钮生成处（`extractArtifactsFromExecutionLog` 之后，当前 `chat-manager.js:1640`）：
  1. 从**本条 assistant 最终回答文本**解析声明产物。
  2. 与静态分析产物**按规范化路径去重合并**（`normalizePath` 已存在）。
  3. 合并后的列表沿用现有 `preFilterDeletedArtifacts` + `validateArtifactsAsync` 流程。

- **stat 防幻觉（复用现有链路，非遍历）**：声明路径必须经现有存在性校验才纳入面板。校验走 `filterInvalidArtifacts` → `CHECK_FILES_EXIST` → `statFile`，且**必须先 `isPathInsideWorkspace` 边界判断再 `resolveWorkspaceAbsolutePath`**（Agent `security.js checkPath` 对工作目录外路径返回 403，不可放宽，否则可被用于探测任意文件存在性）。校验只针对声明出的**少量具体路径**发一次批量请求，成本可忽略。
  - 目录外 / 不存在的声明路径 → 被现有过滤逻辑剔除（与静态产物同等待遇）。
  - Agent 离线 → 降级：现有逻辑已处理（保留目录内产物），声明产物同样降级保留。
- 合并产物在面板中新增来源标识字段 `source: 'declared' | 'static'`（内部字段，不影响现有渲染；用于日志与后续可能的角标区分）。

### 2.3 功能二：聊天内文件路径 linkify

在 Markdown 渲染**后处理阶段**把有效文件路径转为可点击元素，点击复用侧边栏自带面板定位能力。

- 现成能力：`src/side_panel/workspace-panel.js` 已导出 `locateFileInWorkspace(path)`（展开工作目录面板、虚拟滚动定位、瞬态高亮到目标文件；产物面板「定位到文件」即调它）。功能二**直接复用，不新造**。
- 落点：`src/side_panel/markdown-render.js` 的 `formatMarkdown(text)`（`marked.parse` 产出 HTML 之后，`</div>` 包装之前）。新增 `linkifyFilePaths(html)` 后处理。
- **linkify 算法**（在解析出的 DOM 上操作，避免破坏已有标签）：
  1. 用 `DOMParser`/临时容器解析 HTML，仅遍历**文本节点**与 `<code>` 文本内容。
  2. 正则匹配疑似路径：绝对路径（`/...`、`C:\...`）、`~/...`、带扩展名的工作目录相对文件名（如 `report_2026-10-20.xlsx`）。
  3. **降噪规则**（决定是否转链接）：
     - 跳过：`http(s)://` URL、纯目录（无扩展名且不在产物集合）、`node_modules/`、`.git/` 等、代码块内非路径字符串。
     - 仅当路径满足下列之一才转：(a) 属于**本条消息关联的产物列表**（功能一/静态分析已得到的有效路径）；或 (b) 经 `isPathInsideWorkspace` + 一次批量 stat 校验确认存在。
  4. 命中路径包成 `<span class="chat-file-link" data-path="转义后原始路径" title="...">` + 小文件图标。
- **点击**：`markdown-render.js` 内以 document 捕获阶段事件委托绑定（沿用既有 `ensureToolbarDelegate` 同类模式，兼容虚拟滚动/重渲染），点击 `.chat-file-link` → `locateFileInWorkspace(dataset.path)`；失败（文件已删）→ 复用现有 `fileNotFound` toast。
- **性能与流式**：linkify **只在消息最终渲染时执行一次**，流式每个 chunk 不跑；`STREAM_END`（或最终 `addMessage` 渲染）后对最终回答文本执行。存在性校验走一次批量 `CHECK_FILES_EXIST`，不逐路径发请求。
- **与功能一联动**：声明产物路径已在产物列表内，天然是 linkify 候选；两者共用「本条消息相关的有效路径集合」，避免重复 stat。

### 2.4 国际化

新增键（zh/en 双份，`registerTranslations`）：
- `artifacts.declaredNoteTooltip`：声明产物的说明 tooltip（若采用）。
- `chat.fileLinkTitle`：可点击路径的 hover 提示（"点击在工作目录中定位该文件"）。
- 系统提示词声明指引的 zh/en 文案。

## 3. 行为契约

1. AI 在最终回答末尾按 `[[artifact:路径|说明]]` 声明产物；面板产物 = 静态分析产物 ∪ 声明产物（按规范化路径去重）。
2. 声明路径必须通过「工作目录边界判断 + stat 存在性校验」才纳入面板；目录外/不存在的声明被剔除，与静态产物同等待遇。
3. Agent 离线时降级：保留目录内产物（含声明），不阻塞面板显示。
4. 聊天回答中，指向本条消息有效产物/已存在文件的真实路径渲染为可点击链接；URL、代码、目录、不存在路径保持普通文本。
5. 点击可点击路径 → 展开侧边栏自带工作目录面板并定位高亮该文件；文件已删 → `fileNotFound` 提示。
6. linkify 仅在最终渲染执行一次，流式期间不逐 chunk 处理。
7. 全程不改 Agent 端、不遍历工作目录、不新增工具。

## 4. 本期不做（已评估，留待后续）

| 项 | 为什么不做 |
|----|-----------|
| 执行窗口快照 diff / fs.watch | 用户否决：遍历成本 + 脏目录性能风险 + 跨平台不确定性 |
| `report_artifact` 独立工具 | 独立收尾工具更易被 AI 跳过，可靠性不比文本约定高，且增工具定义改动 |
| ReAct 循环内「零声明软门」逼问 | 用户选择不在本期引入循环逻辑改动 |
| 系统 Finder/资源管理器定位 | 用户明确要侧边栏自带面板定位，非系统能力 |

## 5. 验证计划

- **单测**（扩展端 `test/unit/`，Vitest）：
  - `parseDeclaredArtifactsFromText`：正常解析、多行、带/不带说明、变量引用过滤、非法/空路径、与 Markdown 文本混排不误伤。
  - 声明并入去重：静态 + 声明同路径只一条、不同路径合并、`source` 字段正确。
  - `linkifyFilePaths`：URL 不转、代码块内不误伤、产物路径转 `.chat-file-link`、`data-path` 转义（含 `"` `<`）、目录/不存在路径不转。
  - 源码守卫：`getSystemPrompt` 含声明指引（zh/en）；`chat-manager.js` 在产物生成处调用声明解析；点击委托绑定存在。
- **集成/冒烟**：真实渲染一条含声明标记 + 路径的 assistant 消息，断言面板产物计数含声明项、可点击链接生成、点击触发 `locateFileInWorkspace`（stub 断言被调用）。
- **回归**：现有 `artifacts-extract.unit.test.js` 全绿；`npm run build:silent` 通过；`eslint`（src + test）0。

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| AI 漏声明动态产物 | 静态分析地板仍覆盖可静态解析场景；提示词给出明确格式与正例提高照做率 |
| AI 幻觉不存在的产物路径 | stat 存在性校验剔除（仅校验声明的具体路径，成本可忽略） |
| linkify 误伤 URL/代码 | 严格降噪规则 + 仅对有效产物/已存在路径转链接 + 单测负向对照 |
| 相对路径解析歧义 | 复用 `resolveWorkspaceAbsolutePath` + `params.cwd` 一致的既有解析约定 |
| stat 受工作目录白名单限制（403） | 先 `isPathInsideWorkspace` 边界判断，目录外不发起校验、按现有策略处理 |
| 提示词膨胀占 token | 声明指引精简为几条 + 一个正例，纳入 `getSystemPrompt` 现有拼装 |

## 7. 涉及文件清单

- `src/side_panel/utils.js`：`getSystemPrompt` 追加产物声明指引（zh/en）。
- `src/side_panel/artifacts-manager.js`：新增 `parseDeclaredArtifactsFromText`；合并/去重/`source` 字段；stat 校验接线复用。
- `src/side_panel/chat-manager.js`：产物按钮生成处并入声明产物；最终回答文本传入解析。
- `src/side_panel/markdown-render.js`：`formatMarkdown` 后处理新增 `linkifyFilePaths` + 点击事件委托。
- `src/side_panel/workspace-panel.js`：复用 `locateFileInWorkspace`（预期无需改动，仅调用）。
- `src/side_panel/styles.css`：`.chat-file-link` 样式（下划线、hover 手型、图标间距）。
- 测试：`test/unit/` 新增声明解析 + linkify 用例；`test/unit/artifacts-extract.unit.test.js` 扩展合并用例。
- 文档同步（按既有清单）：CHANGELOG、README（zh/en）、docs/index.html、DOCUMENTATION（zh/en）。
