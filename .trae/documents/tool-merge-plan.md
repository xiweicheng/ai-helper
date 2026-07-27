# 工具合并实施计划

## Context

用户要求重新分析工具合并可行性，原则：**参数类似、参数少、语义统一**才合并；**不为合并而合并**，避免万能工具和参数爆炸。

经过对全部 37 个工具的参数分析，用户确认了以下 4 组合并（共 11→4，减少 7 个工具）：

* `manage_tab`（5→1，6 参数）

* `agent_trash`（2→1，3 参数）

* `manage_ai_agent`（2→1，3 参数）

* `search_browser_data`（2→1，5 参数）

不合并：`agent_file`（保持 5 个独立）、`agent_search`（保持 2 个独立）、`page_interaction`/`form_operation`/`content_extraction`/`storage_management`/`media_output`/`debug_dev`/记忆类/Skill类（参数差异大或功能不搭）。

合并后工具数：37 → 30。

## 实施步骤

### 1. 修改工具定义文件

#### `src/background/tools/tab-tools.js`

* **删除** 5 个工具：`open_tab`、`switch_tab`、`close_tab`、`reload_tab`、`navigate_back_forward`

* **新增** `manage_tab`：

  * `category: 'tab_management'`，`execution: 'background'`，`parallelizable: false`

  * `requiresConfirmation: false`，`confirmationActions: ['close']`（close 操作需 action 级确认）

  * 参数：`action`(enum: open/switch/close/reload/navigate)、`url`、`tabId`、`active`、`bypassCache`、`direction`

  * `required: ['action']`

* **保留** `get_tabs` 不变

* **删除** `search_bookmarks`、`search_history`

* **新增** `search_browser_data`：

  * `category: 'bookmark_history'`，`execution: 'background'`，`parallelizable: true`

  * 参数：`action`(enum: bookmark/history)、`query`、`maxResults`、`startTime`、`endTime`

  * `required: ['action', 'query']`

#### `src/background/tools/agent-tools.js`

* **删除** `agent_list_trash`、`agent_restore_trash`

* **新增** `agent_trash`：

  * `category: 'local_agent'`，`execution: 'background'`，`parallelizable: false`（restore 非并行，保守取 false）

  * 参数：`action`(enum: list/restore)、`trashId`、`hours`

  * `required: ['action']`

* **删除** `ai_agent_list`、`ai_agent_switch`

* **新增** `manage_ai_agent`：

  * `category: 'ai_collaboration'`，`execution: 'background'`，`parallelizable: false`（switch 非并行）

  * 参数：`action`(enum: list/switch)、`agentId`、`agentName`

  * `required: ['action']`

* **保留** 其他所有工具（agent\_read\_file/agent\_write\_file/agent\_list\_dir/agent\_delete\_file/agent\_download\_file/agent\_exec\_command/agent\_search\_files/agent\_search\_content/agent\_skill\_load/agent\_workflow\_run）不变

### 2. 修改 `src/background/constants.js`

* **新增** `CONFIRMATION_ACTION_MAP` 常量（action 级确认映射）：

  ```js
  export const CONFIRMATION_ACTION_MAP = Object.fromEntries(
    RAW_TOOLS.filter(t => Array.isArray(t.confirmationActions) && t.confirmationActions.length > 0)
      .map(t => [t.id, t.confirmationActions])
  );
  ```

  这会自动从 `manage_tab` 的 `confirmationActions: ['close']` 派生出 `{ manage_tab: ['close'] }`

* `CONFIRMATION_REQUIRED_TOOLS` 保持不变（manage\_tab 整体 `requiresConfirmation: false`，不进入此集合）

### 3. 修改 `src/background/tool-executor.js`

#### 3.1 新增 4 个合并执行器函数

在现有执行函数附近新增：

* `executeManageTab(args)` - 根据 `args.action` 分发到 `executeOpenTab`/`executeSwitchTab`/`executeCloseTab`/`executeReloadTab`/`executeNavigateBackForward`

* `executeAgentTrash(args)` - 根据 `args.action` 分发到 `executeAgentListTrash`/`executeAgentRestoreTrash`

* `executeManageAiAgent(args)` - 根据 `args.action` 分发到 `executeAgentList`/`executeAgentSwitch`

* `executeSearchBrowserData(args)` - 根据 `args.action` 分发到 `executeSearchBookmarks`/`executeSearchHistory`

#### 3.2 更新 `TOOL_HANDLERS` 注册表（L918-961）

* 删除旧工具名映射：`open_tab`、`switch_tab`、`close_tab`、`reload_tab`、`navigate_back_forward`、`search_bookmarks`、`search_history`、`agent_list_trash`、`agent_restore_trash`、`ai_agent_list`、`ai_agent_switch`

* 新增合并工具映射：`manage_tab: executeManageTab`、`agent_trash: executeAgentTrash`、`manage_ai_agent: executeManageAiAgent`、`search_browser_data: executeSearchBrowserData`

#### 3.3 在 `getTools()` 中新增旧工具名迁移（L388 附近）

在 `getTools` 函数内添加 `TOOL_NAME_MIGRATION` 映射，将用户已保存配置中的旧工具名自动迁移到新工具名：

```js
const TOOL_NAME_MIGRATION = {
  open_tab: 'manage_tab', switch_tab: 'manage_tab', close_tab: 'manage_tab',
  reload_tab: 'manage_tab', navigate_back_forward: 'manage_tab',
  search_bookmarks: 'search_browser_data', search_history: 'search_browser_data',
  agent_list_trash: 'agent_trash', agent_restore_trash: 'agent_trash',
  ai_agent_list: 'manage_ai_agent', ai_agent_switch: 'manage_ai_agent',
};
```

复用现有迁移逻辑（map + 去重）。

### 4. 修改 `src/background/react-loop.js`

#### 4.1 更新 `TOOL_DISPLAY_NAMES`（L29-34）

```js
const TOOL_DISPLAY_NAMES = {
  manage_cookies: '管理 Cookie',
  clear_page_data: '清除页面数据',
  download_file: '下载文件',
  manage_tab: '标签页管理',  // 替换 close_tab
  agent_delete_file: '删除文件',  // 新增（agent_delete_file 仍 requiresConfirmation: true）
};
```

#### 4.2 更新确认逻辑（L1088 附近）

当前逻辑：`const needsConfirmation = CONFIRMATION_REQUIRED_TOOLS.has(toolName) && reactConfig.toolConfirmationEnabled;`

新增 action 级确认检查：

```js
// 1. 工具级确认（requiresConfirmation: true）
const toolLevelConfirm = CONFIRMATION_REQUIRED_TOOLS.has(toolName);
// 2. action 级确认（confirmationActions 包含当前 action）
const actionLevelConfirm = CONFIRMATION_ACTION_MAP[toolName]?.includes(toolArgs.action);
const needsConfirmation = (toolLevelConfirm || actionLevelConfirm) && reactConfig.toolConfirmationEnabled;
```

需从 `constants.js` 导入 `CONFIRMATION_ACTION_MAP`。

#### 4.3 更新 `requestToolConfirmation` 中的 close\_tab 特殊处理（L48）

将 `if (toolName === 'close_tab' && toolArgs.tabId !== undefined)` 改为：

```js
if (toolName === 'manage_tab' && toolArgs.action === 'close' && toolArgs.tabId !== undefined)
```

### 5. 检查 `src/side_panel/index.js` 和 `src/options/index.js`

* 搜索是否有硬编码的旧工具名（`open_tab`、`close_tab`、`ai_agent_list` 等）

* 如有，更新为新工具名或移除（分类标签基于 category，通常无需改）

## 验证

### 构建验证

```bash
npm run build:silent
```

预期 `BUILD_SUCCESS`。

### 功能验证（手动）

1. **旧配置兼容**：用户已有 `enabledTools` 包含 `close_tab` 等 → `getTools()` 迁移后应包含 `manage_tab`
2. **标签页关闭确认**：模型调用 `manage_tab` + `action=close` → 弹出确认对话框（验证 action 级确认）
3. **其他 action 不确认**：模型调用 `manage_tab` + `action=switch` → 不弹确认
4. **回收站/AI代理/书签历史**：调用 `agent_trash`/`manage_ai_agent`/`search_browser_data` 各 action → 正常执行
5. **工具列表**：options 页面工具列表显示 30 个工具，分类正确

## 涉及文件清单

1. `src/background/tools/tab-tools.js` - 合并 manage\_tab + search\_browser\_data
2. `src/background/tools/agent-tools.js` - 合并 agent\_trash + manage\_ai\_agent
3. `src/background/constants.js` - 新增 CONFIRMATION\_ACTION\_MAP
4. `src/background/tool-executor.js` - 新执行器 + TOOL\_HANDLERS 更新 + 旧名迁移
5. `src/background/react-loop.js` - action 级确认逻辑 + TOOL\_DISPLAY\_NAMES 更新
6. `src/side_panel/index.js` / `src/options/index.js` - 检查硬编码工具名（如有则更新）

## 风险与注意事项

* **action 级确认是新机制**：需确保 `CONFIRMATION_ACTION_MAP` 正确派生，且确认逻辑覆盖所有 action 级敏感操作

* **旧工具名迁移**：迁移逻辑必须去重（多个旧名映射到同一新名），避免 `enabledTools` 数组出现重复 ID

* **parallelizable 取值**：合并工具的 `parallelizable` 取最保守值（任一原工具非并行则合并后非并行）

* **执行器分发**：合并执行器内部调用原执行函数时，需正确传递参数（原函数期望的参数名与新工具的参数名一致）

