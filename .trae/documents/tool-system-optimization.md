# 工具系统优化实施计划

## Context

前期分析发现工具系统存在三类问题：① Token 浪费（每轮重传全量工具、MCP schema 未压缩、子任务全量继承工具）；② 工具数量过多（59 个，用户勾选困难）；③ 描述冗余（tabId 提示、默认值重复声明等）。

用户确认了以下 5 项优化（T1-T5），要求：

* **T1**：仅把 `preselectMinToolCount` 从 3 改为 10，`enableToolPreselect` 保持默认关闭

* **T2**：MCP schema 压缩，避免撑爆上下文

* **T3**：子任务工具筛选做成**配置开关**，放在推理 tab，**默认关闭**（用户担心 AI 自行裁剪工具不全影响质量）

* **T4**：合并同类工具（17→5），减少工具数量，方便用户勾选

* **T5**：清理描述冗余，**不加系统提示词**（用户明确要求），仅调整工具描述

***

## T1. 预筛选阈值调整（最小改动）

**文件**：`src/background/constants.js`

**改动**：第 17 行 `preselectMinToolCount: 3` → `preselectMinToolCount: 10`

**不改动**：`enableToolPreselect: false` 保持不变（用户要求默认关闭）。

***

## T2. MCP 工具 schema 压缩

**文件**：`src/background/tool-executor.js`

### 2.1 新增 `compressMcpSchema` 工具函数（在 `loadMcpTools` 上方）

功能：

* 删除 `$schema`、`$ref`、`definitions`、`additionalProperties` 等非必要字段

* `description` 截断到 200 字符（超出加 `...`）

* `properties` 嵌套深度限制为 2 层（超过的用 `{ type: 'object', description: '嵌套对象' }` 替代）

* 参数数量限制为前 15 个，多余的合并到 `additionalParams`（type: object）

* 过滤 description 中的换行符（避免污染 system prompt）

### 2.2 修改 `loadMcpTools` 注册逻辑（第 82-94 行）

```js
parameters: compressMcpSchema(tool.inputSchema) || { type: 'object', properties: {} }
```

同时压缩 description：

```js
description: compressDescription(`[MCP:${tool.serverName}] ${tool.description || tool.name}`, 200)
```

### 2.3 添加数量上限保护（第 73 行循环内）

* 单 server 工具数上限 50（超过跳过并 `logger.warn`）

* 总 MCP 工具数硬上限 100（超过停止注册并 `logger.warn`）

***

## T3. 子任务工具筛选开关（默认关闭）

### 3.1 新增配置项

**文件**：`src/background/constants.js` 第 8-19 行 `DEFAULT_REACT_CONFIG`

新增字段：

```js
enableSubtaskToolFilter: false,  // 子任务工具筛选（默认关闭，开启后子任务仅继承 plan_task 标注的工具）
```

### 3.2 添加 UI 开关

**文件**：`options.html` 第 260 行（`toolConfirmationEnabled` 开关之后）

新增一个 `react-config-item`，参照 `toolConfirmationEnabled` 的结构：

```html
<div class="react-config-item">
  <label>
    子任务工具筛选
    <span class="hint-text">（开启后子任务仅继承 plan_task 标注的工具，节省 token；关闭则继承全部工具，保证质量）</span>
  </label>
  <label class="toggle-label">
    <input type="checkbox" id="enableSubtaskToolFilter">
    <span class="toggle-switch"></span>
    <span id="enableSubtaskToolFilterLabel">已启用</span>
  </label>
  <div class="info-text" style="font-size: 12px; color: #999; margin-top: 4px;">
    开启后，AI 拆解任务时会为每个子任务标注所需工具，子任务仅继承标注的工具。<br>
    关闭后，子任务继承全部工具（默认，保证任务执行质量）。
  </div>
</div>
```

### 3.3 配置加载与保存

**文件**：`src/options/config-manager.js`

* 第 1035 行附近（加载逻辑）：添加 `enableSubtaskToolFilter` 的读取，参照 `toolConfirmationEnabled`

* 第 1128 行附近（保存逻辑）：添加 `enableSubtaskToolFilter` 的保存

* 第 962 行附近的配置项列表、第 13 行（`config-io.js`）添加 `enableSubtaskToolFilter`

### 3.4 修改 `prepareToolSetsForSubtasks`

**文件**：`src/background/react-loop.js` 第 2212-2222 行

```js
export async function prepareToolSetsForSubtasks(subtasks, parentTools = null) {
  const allTools = parentTools || await getTools();
  const reactConfig = await getStoredConfig().then(c => c.reactConfig || DEFAULT_REACT_CONFIG);
  const toolFilterEnabled = reactConfig.enableSubtaskToolFilter === true;
  const toolSets = {};
  
  subtasks.forEach(subtask => {
    if (toolFilterEnabled && Array.isArray(subtask.requiredTools) && subtask.requiredTools.length > 0) {
      // 筛选模式：仅继承标注的工具 + 必备元工具
      const metaTools = allTools.filter(t => ['clarify_question', 'plan_task'].includes(t.id));
      const filtered = allTools.filter(t => subtask.requiredTools.includes(t.id));
      toolSets[subtask.id] = [...filtered, ...metaTools];
      logger.debug(`[Background] 子任务 ${subtask.name} 筛选后 ${filtered.length} 个工具`);
    } else {
      // 默认模式：继承全部工具
      toolSets[subtask.id] = [...allTools];
      if (toolFilterEnabled) {
        logger.debug(`[Background] 子任务 ${subtask.name} 未标注 requiredTools，继承全部 ${allTools.length} 个工具`);
      }
    }
  });
  
  return toolSets;
}
```

### 3.5 扩展 `plan_task` schema

**文件**：`src/background/tools/ai-tools.js` 第 61-73 行

在 subtasks.items.properties 中新增可选字段：

```js
requiredTools: { 
  type: 'array', 
  items: { type: 'string' }, 
  description: '该子任务所需的工具ID列表（可选，开启子任务工具筛选时生效）' 
}
```

不加入 `required`，保证关闭开关时不影响现有行为。

***

## T4. 工具合并（17→5）

### 合并方案

| 合并组        | 旧工具（17个）                                                                                        | 新工具               | 新工具的 action 枚举                    |
| ---------- | ----------------------------------------------------------------------------------------------- | ----------------- | --------------------------------- |
| 标签页管理      | open\_tab/switch\_tab/close\_tab/reload\_tab/navigate\_back\_forward                            | `manage_tab`      | open/switch/close/reload/navigate |
| Agent 文件操作 | agent\_read\_file/agent\_write\_file/agent\_list\_dir/agent\_delete\_file/agent\_download\_file | `agent_file`      | read/write/list/delete/download   |
| Agent 搜索   | agent\_search\_files/agent\_search\_content                                                     | `agent_search`    | filename/content                  |
| 记忆操作       | agent\_memory\_store/agent\_memory\_recall/agent\_memory\_manage                                | `agent_memory`    | store/recall/manage               |
| AI 代理管理    | ai\_agent\_list/ai\_agent\_switch                                                               | `manage_ai_agent` | list/switch                       |

### 4.1 重写工具定义文件

**文件**：`src/background/tools/tab-tools.js`

* 删除 `open_tab`/`switch_tab`/`close_tab`/`reload_tab`/`navigate_back_forward` 5 个定义

* 新增 `manage_tab` 定义，`requiresConfirmation: false`，新增 `confirmationActions: ['close']` 字段

* 保留 `get_tabs`/`search_bookmarks`/`search_history` 不变

**文件**：`src/background/tools/agent-tools.js`

* 删除文件操作 5 个 + 搜索 2 个 + AI 代理 2 个定义

* 新增 `agent_file`（`confirmationActions: ['delete']`）、`agent_search`、`manage_ai_agent`

* 保留 `agent_list_trash`/`agent_restore_trash`/`agent_exec_command`/`agent_skill_load`/`agent_workflow_run` 不变

**文件**：`src/background/tools/memory-tools.js`

* 删除 3 个定义，新增 `agent_memory`（action: store/recall/manage）

### 4.2 新增 `confirmationActions` 派生与确认逻辑

**文件**：`src/background/constants.js` 第 113 行后新增：

```js
export const CONFIRMATION_ACTION_MAP = Object.fromEntries(
  RAW_TOOLS.filter(t => Array.isArray(t.confirmationActions) && t.confirmationActions.length > 0)
    .map(t => [t.id, t.confirmationActions])
);
```

**文件**：`src/background/react-loop.js`

* 第 5 行 import 增加 `CONFIRMATION_ACTION_MAP`

* 第 1088 行修改确认检查：

```js
const confirmationActions = CONFIRMATION_ACTION_MAP[toolName];
const needsConfirmation = reactConfig.toolConfirmationEnabled && (
  CONFIRMATION_REQUIRED_TOOLS.has(toolName) ||
  (confirmationActions && confirmationActions.includes(toolArgs.action))
);
```

* 第 48 行 `close_tab` 特殊处理改为 `manage_tab` + `toolArgs.action === 'close'`

### 4.3 新增合并执行函数（内部按 action 分发到原有 execute\*）

**文件**：`src/background/tool-executor.js`

在 `TOOL_HANDLERS`（第 919 行）中替换旧映射：

```js
manage_tab: executeManageTab,
agent_file: executeAgentFile,
agent_search: executeAgentSearch,
agent_memory: executeAgentMemory,
manage_ai_agent: executeManageAiAgent,
```

新增 5 个分发函数（每个函数根据 `args.action` 调用原有 `executeOpenTab`/`executeSwitchTab` 等）：

* `executeManageTab(args, toolCallId, sessionId, tabId)` → 按 action 分发到 executeOpenTab/executeSwitchTab/executeCloseTab/executeReloadTab/executeNavigateBackForward

* `executeAgentFile(args, ...)` → 按 action 分发到 executeAgentReadFile/executeAgentWriteFile/executeAgentListDir/executeAgentDeleteFile/executeAgentDownloadFile

* `executeAgentSearch(args, ...)` → 按 mode 分发到 executeAgentSearchFiles/executeAgentSearchContent

* `executeAgentMemory(args, ...)` → 按 action 分发到 executeAgentMemoryStore/executeAgentMemoryRecall/executeAgentMemoryManage

* `executeManageAiAgent(args, ...)` → 按 action 分发到 executeAgentList/executeAgentSwitch

原有 `executeOpenTab` 等函数**保留不删除**，作为合并函数的内部调用目标。

### 4.4 更新硬编码引用

| 文件                                | 行号        | 旧值                                                                                  | 新值                                                |
| --------------------------------- | --------- | ----------------------------------------------------------------------------------- | ------------------------------------------------- |
| `src/background/tool-executor.js` | 314       | `'ai_agent_list' \|\| 'ai_agent_switch'`                                            | `'manage_ai_agent'`                               |
| `src/background/tool-executor.js` | 1051-1056 | `toolsNeedingTabId` 中的 `'reload_tab', 'close_tab'`                                  | `'manage_tab'`                                    |
| `src/background/react-loop.js`    | 48        | `'close_tab'`                                                                       | `'manage_tab'` + 检查 `toolArgs.action === 'close'` |
| `src/shared/agent-defaults.js`    | 41        | `'agent_read_file', 'agent_search_content', 'agent_search_files', 'agent_list_dir'` | `'agent_file', 'agent_search'`                    |
| `src/side_panel/utils.js`         | 280       | `['agent_memory_store', 'agent_memory_recall', 'agent_memory_manage']`              | `['agent_memory']`                                |

### 4.5 enabledTools 存储兼容性

**文件**：`src/background/tool-executor.js` `getTools` 函数（第 264 行附近）

在读取 `enabledTools`（第 269 行）后，添加旧→新工具名映射转换：

```js
const TOOL_NAME_MIGRATION = {
  open_tab: 'manage_tab', switch_tab: 'manage_tab', close_tab: 'manage_tab',
  reload_tab: 'manage_tab', navigate_back_forward: 'manage_tab',
  agent_read_file: 'agent_file', agent_write_file: 'agent_file', agent_list_dir: 'agent_file',
  agent_delete_file: 'agent_file', agent_download_file: 'agent_file',
  agent_search_files: 'agent_search', agent_search_content: 'agent_search',
  agent_memory_store: 'agent_memory', agent_memory_recall: 'agent_memory', agent_memory_manage: 'agent_memory',
  ai_agent_list: 'manage_ai_agent', ai_agent_switch: 'manage_ai_agent',
};
enabledTools = enabledTools.map(id => TOOL_NAME_MIGRATION[id] || id);
// 去重（多个旧工具映射到同一新工具）
enabledTools = [...new Set(enabledTools)];
```

### 4.6 前端工具管理面板适配

需检查 `src/options/toolbox-config.js` 等文件中是否有旧工具名的硬编码引用，同步更新为新工具名。

***

## T5. 描述冗余清理（不加系统提示词）

**原则**：只删冗余、不删语义。保留条件性说明、示例、单位。

### 5.1 删除 `（可通过 get_tabs 获取）` 提示

**文件**：`src/background/tools/tab-tools.js`（第 56、115 行）、`src/background/tools/browser-tools.js`（多处，约 18 处）

将 `目标标签页ID（可通过 get_tabs 获取）` → `目标标签页ID`

### 5.2 删除 description 中的 `默认XXX` 后缀

**涉及文件**：`tab-tools.js`、`browser-tools.js`、`agent-tools.js`、`storage-tools.js`、`ai-tools.js`、`memory-tools.js`、`media-tools.js`

例如：

* `最大结果数，默认10` → `最大结果数`（保留 schema 中的 `default: 10`）

* `超时（ms），默认30000` → `超时（ms）`

* `点击后等待时间（ms），默认500` → `点击后等待时间（ms）`

### 5.3 删除 `通过本地Agent` 前缀

**文件**：`src/background/tools/agent-tools.js`

* `通过本地Agent读取文件内容` → `读取文件内容`

* `通过本地Agent写入文件` → `写入文件`

* `通过本地Agent列出目录内容` → `列出目录内容`

* `通过本地Agent删除文件或目录` → `删除文件或目录`

* `通过本地Agent下载工作目录下的文件或目录` → `下载工作目录下的文件或目录`

### 5.4 删除 `required: []` 空数组

**涉及文件**：`tab-tools.js`（第 79、98 行）、`agent-tools.js`（第 58、96、258、278 行）、`memory-tools.js`（第 51 行）、`storage-tools.js`（第 67 行）、`media-tools.js`、`ai-tools.js`

### 5.5 删除 description 中"必填"二字

**文件**：`src/background/tools/ai-tools.js` 第 19 行

`推荐选项索引（从0开始），必填` → `推荐选项索引（从0开始）`（`required` 数组已声明）

### 5.6 保留不删的内容

* 条件性说明：如 `记忆ID，update/delete时必须提供`（schema 无法表达条件性必填）

* 示例：如 `如"*.js"`、`如Enter、Escape、Ctrl+S`

* 单位：如 `（ms）`、`（Unix毫秒时间戳）`

* 核心动作描述：合并后的工具描述需清晰说明各 action 的用途

***

## 实施顺序

1. **T1**（1 行改动，独立）
2. **T5**（描述清理，独立，零风险）
3. **T2**（MCP schema 压缩，独立）
4. **T4**（工具合并，最复杂，需同步改执行器）
5. **T3**（子任务开关，依赖 T4 的新工具名）

T4 和 T3 建议一起实施，因为 T3 的 `requiredTools` 字段需要引用新工具名。

***

## 验证方法

### 构建验证

每次修改后运行 `npm run build:silent`，确认构建成功。

### 功能验证

**T1 验证**：

* 在浏览器扩展中检查 `chrome.storage.local.get('preselectMinToolCount')` 不需要手动设置

* 确认 `enableToolPreselect` 仍为 `false`

**T2 验证**：

* 连接一个返回冗长 schema 的 MCP server（或模拟）

* 检查 `chrome.storage.local.get('mcpTools')` 返回的工具 description 长度 ≤ 200 字符

* 确认 MCP 工具数超过 100 时停止注册

**T3 验证**：

* 推理 tab 中可见"子任务工具筛选"开关，默认关闭

* 关闭时：`plan_task` 拆解后子任务继承全部工具

* 开启时：子任务仅继承 `requiredTools` 标注的工具 + 元工具

**T4 验证**：

* 工具管理面板中可见合并后的 5 个新工具（manage\_tab/agent\_file/agent\_search/agent\_memory/manage\_ai\_agent）

* 旧工具名不再出现

* 调用 `manage_tab` action=open 能打开标签页

* 调用 `agent_file` action=delete 弹出确认框（confirmationActions 生效）

* 调用 `agent_file` action=read 不弹出确认框

* 旧 enabledTools 配置自动迁移到新工具名

**T5 验证**：

* 工具描述中不再出现 `（可通过 get_tabs 获取）`、`默认XXX`、`通过本地Agent`、`必填`、空 `required: []`

* 模型仍能正确识别工具用途（通过实际对话测试）

