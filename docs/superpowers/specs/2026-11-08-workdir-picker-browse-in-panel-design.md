# 工作目录选择：面板内置目录浏览器（根治版）设计方案

- 日期：2026-11-08
- 范围：侧边栏「切换工作目录」弹窗的目录选择能力（`src/side_panel/workspace-panel.js` / `workspace-manager.js` + `agent/src/server.js`）
- 目标：把目录选择从「依赖系统原生弹窗」改为「面板内置目录浏览器」为默认通道，原生弹窗降级为本地可选增强
- 非目标：目录授权模型（`allowedPaths` / `checkPath`）不变；不做文件选择、不做新建目录、不做文件内容预览
- 状态：阶段 0（Agent 端 `POST /api/fs/browse`）、阶段 1（面板内置浏览器 + 去掉 hostname 门控）、阶段 2（原生弹窗降级治理）与阶段 3 的 MV3 探针已完成（2026-11-08）；仅剩 Windows 真机矩阵待执行

## 1. 背景与现状

### 1.1 现有链路

```
侧边栏「浏览…」按钮（workspace-panel.js）
  → pickDirectory()（workspace-manager.js）POST /api/config/pick-directory
  → Agent 进程（server.js，仅接受 loopback 来源）
  → spawn powershell.exe / cscript.exe
  → System.Windows.Forms.FolderBrowserDialog / Shell.BrowseForFolder
  → 选中路径 base64 回传 → 回填输入框
```

关键落点：

- [workspace-panel.js 6156-6165](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/workspace-panel.js#L6156-L6165)：仅当代理地址是 `localhost / 127.0.0.1 / [::1]` 时才渲染「浏览…」按钮。
- [workspace-panel.js 6203-6237](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/workspace-panel.js#L6203-L6237)：按钮事件与各失败分支的 toast。
- [workspace-manager.js 371-410](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/workspace-manager.js#L371-L410)：客户端 200s 超时。
- [server.js 1221-1273](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L1221-L1273)：端点 + loopback 门控 + 失败诊断日志。
- [directory-picker.js](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/directory-picker.js)：三后端兜底（`powershell-inline` → `powershell-encoded` → `cscript-vbs`）。

### 1.2 已暴露的结构性问题

| 问题 | 根因 | 后果 |
|---|---|---|
| Windows 上终端不同，弹窗成功率不同 | 窗口由 Agent 进程 spawn 子进程创建，继承父终端的 PATH / 环境变量大小写 / TEMP / 控制台与桌面归属 | Git Bash / PowerShell 下偶发「点了没反应」 |
| 远端代理完全没有入口 | 端点强制 loopback，前端也按 hostname 隐藏按钮 | 远端只能手输路径 |
| 失败可能完全静默 | `ShowDialog` 返回 `Cancel` 被归类为「用户取消」 | 窗口其实没画出来，但用户看不到任何提示 |
| 弹窗可能被遮挡/离屏 | 无 owner / owner 句柄拿不到 / 无前台激活权 / 上次位置在已拔掉显示器 | 用户认为没弹 |
| 一次卡住阻塞后续 | `inFlight` 单例 + 最长 180s 总预算 | 后续点击全是 `busy`，观感是「点了没反应」 |
| 无法在没有桌面会话的环境工作 | RDP 断开、Session 0、detached 后台进程 | 永远弹不出来 |

**结论**：只要选择能力仍然依赖「Agent 机器上的原生窗口可见」，上述问题就无法在客户端彻底消除；必须把默认通道换成纯 HTTP 的目录浏览。

## 2. 设计决策

1. **默认走面板内置目录浏览器**：目录列举 = 一次认证的 HTTP 请求 + 前端列表，不 spawn 任何子进程，不依赖桌面会话/终端类型。
2. **本地/远端不再作为能力门控**：只要扩展能连上已配对的 Agent，就能浏览**该 Agent 主机**的目录。`platform` 只影响根节点与路径展示，不影响可用性。
3. **路径语义固定为「Agent 主机上的路径」**：UI 明确展示代理端平台与主机标识；选中结果回填后仍是同一条 `/api/config/workdir` 切换链路。
4. **浏览 ≠ 授权**：浏览端点只读列目录，绝不写配置；授权仍由 `/api/config/workdir` 写入 `allowedPaths`。
5. **原生弹窗保留但降级**：`/api/config/pick-directory` 维持 loopback 门控，作为本机桌面环境下的可选次级入口（「用系统对话框选择」），不作为默认路径。
6. **新增独立端点，不复用 `/api/fs/list`**：后者受 `checkPath` 沙箱约束且返回文件与 stat 信息（[server.js 1382-1402](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L1382-L1402)、[security.js checkPath](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/security.js#L155-L260)）；工作目录选择必须在沙箱之外浏览，且只需要目录名。

## 3. 目标架构与数据流

```
用户在弹窗点「浏览…」
  → 打开内嵌浏览器视图（不关闭切换弹窗）
  → POST /api/fs/browse  { path?: string }   (Bearer + X-AIH-Session-Id)
  → Agent: 校验 token → 解析/规范化路径 → readdir(withFileTypes)
          → 仅保留目录 → 排序 → 返回 { path, parent, roots, entries, truncated }
  → 前端渲染面包屑 + 驱动器/根 + 目录列表
  → 用户选中某目录 → 回填「或输入绝对路径」输入框 → 关闭浏览器视图
  → 用户点「切换」→ 现有 /api/config/workdir 流程（不变）
```

- 无子进程、无窗口、无桌面依赖：Git Bash / CMD / PowerShell / 远端 / 无头服务器行为一致。
- 单次请求只列一层，不递归；导航深度由用户操作决定。

## 4. 接口契约

### 4.1 `POST /api/fs/browse`

- 认证：与其它 `/api/*` 一致，`Authorization: Bearer <token>`；可选 `X-AIH-Session-Id`（仅用于日志与 scope 展示，不影响浏览范围）。
- 请求体：

```json
{ "path": "C:\\Users\\me\\Documents" }
```

  - `path` 省略 / `null` / 空串：返回根节点集合（Windows 为可用盘符 + 用户主目录；POSIX 为 `/` + 用户主目录），`entries` 为空。
  - 路径以 `~` 开头：按 Agent 进程的 `os.homedir()` 展开（仅前缀匹配，不做 shell 展开）。
  - 统一用 JSON body 传路径，**不放进 URL query 或自定义请求头**，规避非 ASCII 路径在头部编码上的历史问题。
- 成功响应（HTTP 200）：

```json
{
  "success": true,
  "path": "C:\\Users\\me\\Documents",
  "parent": "C:\\Users\\me",
  "platform": "win32",
  "entries": [
    { "name": "Projects", "path": "C:\\Users\\me\\Documents\\Projects", "kind": "dir", "link": false },
    { "name": "Work",     "path": "C:\\Users\\me\\Documents\\Work",     "kind": "dir", "link": true  }
  ],
  "roots": [
    { "name": "C:", "path": "C:\\", "kind": "drive" },
    { "name": "D:", "path": "D:\\", "kind": "drive" },
    { "name": "主目录", "path": "C:\\Users\\me", "kind": "home" }
  ],
  "truncated": false
}
```

  - `entries` 仅包含目录；不返回文件、大小、mtime（最小信息面）。
  - `link: true` 表示符号链接/目录联接；`stat` 失败或指向非目录的链接不返回。
  - 排序：名称升序，`win32` 大小写不敏感；`.` 开头的隐藏目录保留，前端以弱化样式呈现。
  - 单层最多 `MAX_BROWSE_ENTRIES = 5000`，超出置 `truncated: true`。

- 错误响应（机器码 + 本地化 message）：

| HTTP | `error` | 触发 | 前端表现 |
|---|---|---|---|
| 400 | `bad_path` | 空字节、非法路径、路径过长 | 行内错误 + 保留上一级可返回 |
| 400 | `not_a_directory` | 目标是文件 | 同上 |
| 404 | `path_not_found` | 不存在或链接已断 | 同上 |
| 403 | `permission_denied` | EACCES / EPERM | 提示「无权限，可返回上一级」 |
| 429 | `rate_limited` | 超过频控 | 提示稍后重试 |
| 401 | — | token 无效（现有认证层） | 现有错误提示 |
| 404 | — | Agent 版本过旧，无此路由 | 前端标记「不支持浏览」并回退手输 |

- 审计：`logFs('browse', { path, entryCount, truncated, linkCount })`；不记录文件内容（本来也不返回）。

### 4.2 频控与边界

- 频控：每 `extId` 令牌桶，`30 次 / 10 秒`；超出返回 429。正常用户点击速率远低于此。
- 超时：处理器内部 5s 上限（`readdir` + 批量 `stat` 用 `Promise.race`），超时返回 `path_not_found` 之外的 `timeout` 机器码（HTTP 504）。
- 深度：不限制导航层数，但每次只列一层，天然避免递归爆炸。
- 符号链接：`lstat` 判定链接；`stat` 解析后必须是目录才返回；不跟随链接做递归。
- Windows 盘符枚举：对 `A:`–`Z:` 逐个 `existsSync` + `stat` 目录判定，仅返回存在且可访问的盘符；不做 PowerShell 调用。
- 明确不做：文件列表、文件内容、新建/重命名/删除、递归搜索（这些继续由 `/api/fs/*` 承担，且受 `checkPath` 约束）。

## 5. 前端交互设计

### 5.1 入口与可见性

- 「浏览…」按钮改为**始终渲染**（只要已配对可连）；不再以 hostname 判断本地/远端。
- 首次点击先探测端点：
  - 200 → 打开内嵌浏览器；
  - 404 → 标记 `browseSupported = false`，toast「当前代理端版本过旧，暂不支持目录浏览，请手动输入或更新代理端」；
  - 网络失败 → toast「无法连接 Agent」。
- 原「原生弹窗」能力：本地代理且探测到交互桌面时，在浏览器视图底部提供次级动作「改用系统对话框」（调用现有 `pickDirectory()`）。失败不阻塞内置浏览器。

### 5.2 浏览器视图布局（在现有弹窗内切换，不新开 modal）

复用现有弹窗容器（[workspace-panel.js 6167-6191](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/workspace-panel.js#L6167-L6191)），新增一个视图层：

```
┌ 切换本会话工作目录 ──────────────────────────── ✕ ┐
│ 当前: C:\Users\me\ws（本会话）                       │
│                                                    │
│ [目录列表视图]  ⇄  [内置浏览器视图]                  │
│ ┌ 浏览器视图 ───────────────────────────────────┐  │
│ │ 代理端: Windows · DESKTOP-XXX                  │  │
│ │ 根: [C:] [D:] [主目录]                          │  │
│ │ C: › Users › me › Documents          [上级]     │  │
│ │ ─────────────────────────────────────────────  │  │
│ │ 📁 Projects                                    │  │
│ │ 📁 Work                                        │  │
│ │ 📁 .config        (隐藏，弱化)                  │  │
│ │ …                                              │  │
│ │ 加载失败 / 无权限 / 空目录 → 行内状态 + 上一级   │  │
│ │ ─────────────────────────────────────────────  │  │
│ │              [返回列表]  [选择当前目录]          │  │
│ └────────────────────────────────────────────────┘  │
│ 或输入绝对路径                                       │
│ [__________________________] [浏览…]                │
│                              [取消] [切换]          │
└────────────────────────────────────────────────────┘
```

交互细则：

- 面包屑：点击任一段跳到该层；过长时从头折叠为 `C: › … › me › Documents`。
- 目录项：单击选中（高亮）；**双击进入下一层**（与系统目录列表习惯一致）；`Enter` 同样进入，`Backspace` / `Alt+↑` / 「上级」按钮返回父目录。
- 行内快捷回填：悬停或该行被选中时，最右侧出现 `✓` 按钮，点击即把该目录回填到输入框并关闭浏览器视图（与底部「选择此目录」同一出口）；根节点层（盘符/主目录）只用于导航，不提供 `✓`。
- 「选择此目录」：把选中项（未选中时为当前浏览位置）回填到输入框并关闭浏览器视图（不自动切换）。
- `Esc`：先关闭浏览器视图，再按一次才关闭整个弹窗（与现有 Esc 语义分层）。
- 加载态：骨架条 + 「正在读取…」；请求串行（同一时刻只允许一个在途请求），新导航取消旧请求（`AbortController`）。
- 空目录：「此目录下没有子目录」+ 仍可「选择当前目录」。
- 错误态：行内提示 + 「返回上一级」；403 明确写「当前 Agent 进程无权读取此目录」。
- 性能：仅渲染可见项（超过 200 项启用简单分页/虚拟滚动阈值）；切换目录时保留滚动位置到顶部。
- 可访问性：列表为 `role="listbox"` + `aria-activedescendant`；按钮为真实 `<button>`；支持键盘全流程。

### 5.3 平台展示与路径格式化

- 标题栏右上角展示 `代理端: ${platformName} · ${hostname}`（均来自已认证的 `/api/status/detail` 的 `PLATFORM_INFO`，[server.js 905](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L905)）。
- 路径展示统一使用 Agent 返回的 `path` 原样（Windows 反斜杠、POSIX 斜杠）；前端不做跨平台转换。
- 手动输入框的 placeholder 按平台切换：`win32` → `C:\Users\you\path`，其它 → `/Users/you/path`。

## 6. 安全与权限模型

| 维度 | 结论 |
|---|---|
| 认证 | 沿用 Bearer token；未配对不可用 |
| 授权 | 浏览不授予任何访问权；切换后仍写 `allowedPaths`（现有 `/api/config/workdir`） |
| 数据面 | 只返回目录名，不返回文件与 stat，降低信息泄露面 |
| 遍历 | 单层列举；不递归；链接解析后必须是目录 |
| 频控 | 30 次 / 10 秒 / extId；防枚举刷量 |
| 审计 | 每次列举记录路径、数量、是否截断 |
| 远端暴露面 | 端点等价于「已配对客户端可枚举 Agent 主机目录结构」。这是远端选目录的必要代价；通过「仅目录 + 频控 + 审计 + token」收敛。若未来支持多用户/共享 Agent，需要再加设备白名单或 browse 短时票据（见 §10 未决） |
| 硬阻止目录 | 不新增拦截规则：浏览只读、不落盘；`~/.ai-helper-agent` 等敏感目录的**读写**限制仍由 `checkPath` 在文件类接口执行 |

## 7. 兼容与降级

1. **旧版 Agent（无 `/api/fs/browse`）**：首次 404 → 隐藏「浏览…」或改走本地原生弹窗（若 loopback）；手动输入始终可用。
2. **Agent 离线**：现有「无法连接 Agent」toast，不打开浏览器视图。
3. **远端 + 旧版 Agent**：只能手输（与现状一致）。
4. **原生弹窗保留**：现有三后端与诊断代码不改；仅从默认入口降为次级动作，避免回滚成本。
5. **数据兼容**：无新增存储字段；浏览器视图状态仅存在于内存。

## 8. 实施拆解

### 阶段 0：Agent 端只读浏览端点（可在 macOS 上完成并测试）

- 新增 `agent/src/dir-browse.js`（纯函数 + 平台分支）：
  - `normalizeBrowsePath(raw, platform, homedir)`：`~` 展开、`path.resolve`、根路径保留尾分隔符、拒绝空字节与超长。
  - `listRoots(platform, homedir)`：Windows 盘符探测；POSIX 返回 `/` 与主目录。
  - `listChildDirs(absPath)`：`readdir({ withFileTypes: true })` + 仅目录 + 链接 `stat` 校验 + 排序 + 截断。
  - `buildBrowsePayload(...)`：统一响应结构。
- `agent/src/server.js` 认证区新增路由（紧邻 `/api/fs/list`），含频控、审计、5s 超时。
- 单测 `agent/test/unit/dir-browse.unit.test.js`：
  - 仅目录、不返回文件；
  - 隐藏目录保留、排序大小写不敏感；
  - 断链/非目录链接被剔除；
  - 截断标记；
  - `~` 展开、根路径、空字节、超长路径；
  - Windows 盘符函数用注入的 `existsImpl` 测（不依赖真机）。
- 集成测试 `agent/test/integration/api.integration.test.js` 增补：无 token 401、正常列目录、404/400/403 分支、频控 429。

验收：`node --test agent/test/unit/*.test.js` 全绿；端点在 macOS 真机可列 `/`、`~`。

### 阶段 1：扩展端内嵌浏览器视图

- 新增 `src/side_panel/workdir-browser.js`，导出 `openWorkdirBrowser({ dialogEl, initialPath, platformName, hostname, onSelect, onUseNative })`：
  - 负责视图渲染、状态机、请求串行与取消、键盘交互；
  - 依赖注入一个 `listDirs(path)`（来自 `workspace-manager.js`），便于单测替身。
- `src/side_panel/workspace-manager.js` 新增：

```js
export async function browseDirs(path) // → POST /api/fs/browse，8s 超时
```

- `src/side_panel/workspace-panel.js`：
  - 移除 6156-6165 的 hostname 门控；
  - 「浏览…」改为打开内嵌视图（保留原生为次级动作）；
  - 视图关闭时把选中路径写入 `manualInput`，并恢复列表视图；
  - 复用现有 toast 文案体系，新增错误分支映射。
- i18n（zh/en 双份）：`browseLoading`、`browseEmpty`、`browsePermissionDenied`、`browseTruncated`、`browseAgentHost`、`browseRoots`、`browseUp`、`browseChooseCurrent`、`browseBackToList`、`browseUseNative`、`browseUnsupported`。
- 源码守卫单测 `test/unit/workdir-browse-ui.unit.test.js`：
  - 不得再以 hostname 隐藏浏览按钮；
  - 必须走 `/api/fs/browse`（不得改动 `/api/fs/list` 的沙箱）；
  - 选中只回填、不自动调用切换；
  - Esc 分层；
  - 错误分支文案齐全。

验收：`npx vitest run` 全绿、`npx eslint src/ agent/` 无输出、`npm run build:silent` 通过。

### 阶段 2：原生弹窗降级与失败治理（**已完成 2026-11-08**）

- 前端：浏览器视图底部「改用系统对话框」，仅当 `hostname` 为回环地址时展示（阶段 1 已随视图落地）。
- 原生链路治理（本次实施）：
  - **`busy` 可取消**：`pickDirectoryNative` 并发时返回 `{ error: 'busy', cancellable: true, elapsedMs }`；
    新增 `cancelPickDirectory()` 强杀当前子进程并 await 本次 pick 收尾，取消返回后 `inFlight` 已释放。
  - **请求断开即 kill**：`/api/config/pick-directory` 挂 `res.on('close')` → `cancelPickDirectory()`；
    新增 `POST /api/config/pick-directory/cancel`。取消结论为 `error: 'cancelled'`（与用户取消的
    `success: true, path: null` 区分），且不写入失败日志。
  - **`ShowDialog` 返回 Cancel 但未观测到窗口 → `no-window`**：退出码 2/0 只有在收到 `SHOWN_MARKER`
    时才判定为用户取消；否则返回 `no-window` 并继续尝试下一个后端，不再静默。
- 扩展端：`busy && cancellable` → 取消旧窗口后重试一次；`error === 'cancelled'` 静默（面板已关闭）。

验收：`node --test agent/test/unit/*.test.js` 899 例全绿；`npx vitest run` 258 文件 / 4281 例通过；
`npm run build:silent` → `BUILD_SUCCESS`；`npx eslint src/ agent/` 无告警。

### 阶段 3：联调与真机矩阵（**探针已完成 2026-11-08，真机矩阵待执行**）

MV3 探针（`npm run build:silent` 后手动运行）：

| 探针 | 覆盖 | 结果 |
|---|---|---|
| `test-results-probes/_workdir-ext-ui.mjs` | 本机代理全链路 + **内置浏览**（只列目录 / 单击选中回填 / 双击进入嵌套 / 行内 `✓` 快捷回填 / 面包屑向上 / Esc 分层 / 404 旧版降级）+ 原生弹窗路径 | **122/122 PASS** |
| `test-results-probes/_workdir-browse-remote.mjs` | **非回环地址配对**（`http://[::ffff:127.0.0.1]` 构造远端语义）+ 内置浏览 / 选中回填 / 会话级切换 / 「改用系统对话框」不出现 / 不触碰原生端点 | **15/15 PASS** |

> 运行方式：`npm run build:silent && node test-results-probes/_workdir-browse-remote.mjs`
> （两个探针各用独立端口 18985 / 18987，可分别执行；不接触本机已安装的 Agent）

Windows 真机手测矩阵（必须，macOS 无法覆盖）：

| 场景 | 期望 | 状态 |
|---|---|---|
| CMD / PowerShell / Git Bash 启动 Agent | 三者内置浏览行为一致 | 待测 |
| Agent `aha start -b`（detached） | 内置浏览正常 | 待测 |
| 远端 Agent（同网段） | 可浏览远端目录并回填，无「改用系统对话框」 | 待测 |
| RDP 断开重连 | 内置浏览不受影响 | 待测 |
| 无权限目录 / 空目录 / 超长路径 | 均有明确行内状态 | 待测 |
| 旧版 Agent | 回退手输或本地原生弹窗 | 待测 |
| 本机原生弹窗（次级入口） | 连点不再永久 busy：第二次点击会取消旧窗口并重开 | 待测 |

## 9. 验收标准（整体）

1. 目录选择不再 spawn 任何子进程；三种终端 + detached + 远端行为一致。
2. 任何失败都有可见反馈，不存在「点击后无任何提示」的分支。
3. 浏览端点不返回文件信息，不写配置；`/api/fs/list` 的 `checkPath` 沙箱保持原样。
4. 选中路径仍是绝对路径，切换流程与现有 `/api/config/workdir` 完全兼容。
5. 旧版 Agent、Agent 离线、无权限目录均有明确降级路径。

## 10. 风险与未决问题

| 项 | 说明 | 建议 |
|---|---|---|
| 远端安全暴露面 | 已配对客户端可枚举 Agent 主机目录结构 | 先接受 + 频控/审计；若未来多用户，引入 `POST /api/fs/browse-token`（短时票据，TTL 5 分钟） |
| UNC / 网络盘 | `\\server\share` 可读性取决于 Agent 身份 | 允许手输；列举失败给「无权限/不存在」，不特殊处理 |
| MSYS 风格路径 | 用户可能粘贴 `/c/Users/...` | 第一阶段不做自动转换；在输入框提示「请使用 Agent 主机原生路径」。若反馈多，再加 `/c/` → `C:\` 的保守转换 |
| 隐藏目录展示 | Windows 隐藏属性需要额外 `stat` | 第一阶段只按名称 `.` 前缀弱化；不读属性 |
| 大目录 | 5000 项上限 | 超出给 `truncated` 提示，用户可手输更精确路径 |
| 新建目录 | 本方案不做 | 需求出现时走 `/api/fs/mkdir`（现已存在）另开弹窗 |

## 11. 回滚策略

- 端点与视图均为**新增**；前端以常量开关 `WORKDIR_BROWSER_ENABLED`（构建期）控制入口。
- 回滚只需恢复 `workspace-panel.js` 的 hostname 门控与原生 `pickDirectory()` 调用；Agent 端新端点可保留（无副作用）。
- 现有 `directory-picker.js` 与三后端链路不做删除，确保回滚后本机原生弹窗仍按原逻辑工作。
