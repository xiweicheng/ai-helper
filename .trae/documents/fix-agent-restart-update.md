# 修复 Agent 重启与自动更新功能

## Context（背景）

代理端（`agent/`）的重启（`/api/agent/restart`）和自动更新（`/api/agent/update`）功能测试不生效：调用后服务最终没有重新起来。

经分析，存在两类致命问题：

### 问题 1：重启时序缺陷（两个致命 bug 叠加）

当前 `/api/agent/restart`（[server.js:449-484](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L449-L484)）的流程是：先 spawn 一个 `--background` 模式的新进程，500ms 后再 `shutdown()` 老进程。

- **bug 1a**：`--background` 分支启动时会检查 `isRunning`（[agent.js:204-209](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/bin/agent.js#L204-L209)）。此刻老进程还活着、端口还在响应，`isRunning` 返回 `true`，新进程输出"已在运行中"后立即 `process.exit(0)`。
- **bug 1b**：即便绕过 1a，`--background` 分支会立即 spawn 孙进程绑定端口。此时老进程还占着端口，触发 `EADDRINUSE`（[server.js:1564-1567](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L1564-L1567)），孙进程 `process.exit(1)`。

两条路都是死路 → 老进程 shutdown 后无任何进程存活。

### 问题 2：更新流程从未真正更新

当前 `/api/agent/update`（[server.js:487-557](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L487-L557)）：

- **bug 2a**：用 `existsSync(join(agentDir, '.git'))` 检测 git 仓库。`agent/` 是根仓库的普通子目录，没有独立 `.git`，检查恒为 false → git pull 被永远跳过。
- **bug 2b**：`npm install`（局部，在 `agentDir` 执行）只是安装 `agent/package.json` 的依赖，不是更新 `ai-helper-agent` 包本身。
- **bug 2c**：更新末尾的重启逻辑与问题 1 相同，同样失败。

### 用户决策

- 放弃 git 更新方式，正式部署方式为 `npm install -g ai-helper-agent`。
- 更新改为 `npm install -g ai-helper-agent@latest`，**不指定 `--registry`**（继承用户环境配置，公司内网/外网自适应）。
- npm 全局安装可能需要写权限：**检测失败时提示用户手动执行**，不中断老进程。

### 预期结果

- 重启：老进程退出后新进程能可靠拉起，前端健康检查恢复在线。
- 更新：npm 全局安装成功 → 自动重启；失败 → 返回错误信息，老进程继续运行，用户可手动执行更新。

---

## 实现方案

核心思路：引入**两阶段重启**。spawn 一个 detached 的"重启包装器"（`_restart-helper` 子命令），它独立于老进程存活，**先等老进程退出 + 端口释放**，再以 `--background` 模式启动新进程。这样 `isRunning` 检查能通过、端口也不会冲突。

### 改动 1：`agent/bin/agent.js` — 新增 `_restart-helper` 内部子命令

在 `restart` 分支之后新增 `_restart-helper` 分支。这是一个 detached 运行的包装器，复用文件内已有的 `applyCliArgs`、`removePidFile`、`ensureAgentDir`、`PID_FILE`、`spawn`、`writeFileSync` 等。

职责：
1. 解析参数：`--old-pid`、`--port`、`--host`、`--workdir`、`--script`（其中 `--script` 是 `bin/agent.js` 的绝对路径，用于 spawn 新进程）
2. 轮询老进程 PID 退出（`process.kill(pid, 0)` 探活），超时 15s 后 SIGKILL 兜底
3. 轮询端口释放（`fetch /api/status` 失败即视为释放），超时 10s
4. 额等 500ms 确保 socket 完全回收
5. `removePidFile()` 清理旧 PID
6. 以 `--background` 模式 spawn 新进程（此时老进程已退出，`isRunning` 检查通过、端口可用）
7. 写入新 PID 文件，`child.unref()`，自身 `process.exit(0)`

时序安全保证：包装器是 detached + `child.unref()`，老进程 `process.exit()` 不影响它；它自身在 spawn 完新进程后也立即退出，不长期驻留。

### 改动 2：`agent/src/server.js` — 修复 `/api/agent/restart`

替换 [server.js:449-484](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L449-L484) 的实现：

- 立即返回 `{ success: true, message: 'Agent 正在重启...' }`
- 把 `process.argv[1]` 和 `config.workdir` 用 `resolve()` 转成绝对路径（修复相对路径不健壮的问题）
- spawn `node <agentScript> _restart-helper --old-pid <pid> --port <port> --host <host> --workdir <abs> --script <abs>`，`detached: true, stdio: 'ignore'`，`child.unref()`
- `setTimeout(() => shutdown(), 500)` 关闭老进程

### 改动 3：`agent/src/server.js` — 重写 `/api/agent/update`

替换 [server.js:487-557](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L487-L557)：

- **删除** git pull 相关代码（包括 `existsSync(join(agentDir, '.git'))` 检测）
- **同步执行** `npm install -g ai-helper-agent@latest --no-audit --no-fund`（不加 `--registry`，用 npm 默认配置）
  - 用 `spawn('npm', [...], { shell: true, env: { ...process.env } })`，捕获 stdout/stderr 和退出码
  - 不设 cwd（全局安装与当前目录无关）
- **成功** → `jsonResponse(res, 200, { success: true, message: '更新成功，Agent 正在重启...' })`，然后走与改动 2 相同的两阶段重启（spawn `_restart-helper` + 500ms 后 shutdown）
- **失败** → `jsonResponse(res, 200, { success: false, error: '更新失败，请手动执行：npm install -g ai-helper-agent@latest', details: <stderr/错误> })`，**不 shutdown**，老进程继续运行

注意：`jsonResponse` 改在 npm install 完成后调用（不再立即返回），这样前端能收到真实的成功/失败结果。

### 改动 4：`agent/src/server.js` — 补充 import

在 [server.js:6](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/agent/src/server.js#L6) 的 path import 中加入 `resolve`：

```js
import { join, dirname, basename, resolve } from 'path';
```

### 改动 5：`src/background/local-agent-client.js` — 调整 update 超时

[local-agent-client.js:896](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/background/local-agent-client.js#L896) 的 `updateAgent` 超时从 `15000` 调整到 `120000`（2 分钟），因为 `npm install -g` 同步等待结果，可能耗时较长。

`restartAgent` 超时保持 `10000` 不变（restart 接口仍立即返回）。

### 改动 6：`src/side_panel/index.js` — 更新确认弹窗文案

[index.js:997](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/src/side_panel/index.js#L997) 的文案"将先拉取最新代码/依赖，然后重启服务"改为"将通过 npm 安装最新版本，然后重启服务"，与新流程一致。前端 toast 处理逻辑（`response.success` 分支）无需改动，已能正确显示成功/失败。

---

## 关键文件清单

| 文件 | 改动类型 |
|------|---------|
| `agent/bin/agent.js` | 新增 `_restart-helper` 子命令分支 |
| `agent/src/server.js` | 修复 `/api/agent/restart`、重写 `/api/agent/update`、补充 `resolve` import |
| `src/background/local-agent-client.js` | `updateAgent` 超时 15s → 120s |
| `src/side_panel/index.js` | 更新确认弹窗文案 |

---

## 复用的现有函数

- `agent/bin/agent.js`：`applyCliArgs`（L159）、`removePidFile`（L69）、`ensureAgentDir`（L33）、`PID_FILE` 常量（L11）
- `agent/src/server.js`：`jsonResponse`（L211）、`logSystem`/`logError`（从 `./logger.js` import）、`shutdown`（L1592）、`spawn`（已 import）
- Node 18+ 内置 `fetch`（用于端口探活）

---

## 验证方法

### 1. 重启功能验证

```bash
# 前台启动 agent（复现用户原场景）
cd /Users/xiweicheng/Documents/trae_projects/ai-helper/agent
node bin/agent.js start

# 另开终端，调用重启接口（需带认证 token）
curl -X POST http://127.0.0.1:18910/api/agent/restart \
  -H "Authorization: Bearer <token>"

# 预期：
# - 接口立即返回 { success: true, message: 'Agent 正在重启...' }
# - 老进程在 ~500ms 后退出
# - _restart-helper 等待老进程退出 + 端口释放后启动新进程
# - 约 2-3 秒后 http://127.0.0.1:18910/api/status 恢复响应
# - agent.pid 文件更新为新 PID
```

### 2. 更新功能验证（成功路径）

```bash
# 启动 agent
node bin/agent.js start --background

# 调用更新接口
curl -X POST http://127.0.0.1:18910/api/agent/update \
  -H "Authorization: Bearer <token>"

# 预期：
# - 接口在 npm install 完成后返回 { success: true, message: '更新成功，Agent 正在重启...' }
# - 随后自动两阶段重启
# - 服务恢复后版本号为最新
```

### 3. 更新功能验证（失败路径，模拟权限不足）

```bash
# 用需要 sudo 的 node 环境启动，或手动制造 npm 全局目录不可写
# 调用更新接口
curl -X POST http://127.0.0.1:18910/api/agent/update \
  -H "Authorization: Bearer <token>"

# 预期：
# - 接口返回 { success: false, error: '更新失败，请手动执行：npm install -g ai-helper-agent@latest', details: '...' }
# - 老进程不中断，服务持续可用
# - 前端 toast 显示"更新失败: ..."
```

### 4. 前端 UI 验证

- 在 Side Panel 代理下拉菜单点击"重启代理" → 确认 → 看到"代理服务正在重启..."toast → 几秒后代理恢复在线
- 点击"更新代理" → 确认 → 看到"正在更新代理（可能需要几分钟）..."→ 成功显示"代理正在更新并重启..." / 失败显示"更新失败: ..."

### 5. 构建验证

按工作区规则，修改完成后运行 `npm run build:silent` 确认构建通过。
