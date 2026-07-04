# AI Helper Agent

AI Helper 代理服务，为 [AI Helper Chrome 扩展](https://github.com/xiweicheng/ai-helper) 提供本地文件读写和系统命令执行能力。

## 安装

```bash
npm install -g ai-helper-agent
```

要求 Node.js >= 18.0.0。

## 快速开始

```bash
# 前台启动（终端显示实时运行日志，适合调试）
ai-helper-agent start

# 后台启动（守护进程模式，终端立即返回）
ai-helper-agent start --background
ai-helper-agent start -b

# 指定工作目录和端口
ai-helper-agent start --workdir /path/to/your/project --port 18911
```

启动后终端会显示 4 位配对码，在 Chrome 扩展设置页「代理」标签中填入即可完成配对。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `start` | 启动代理服务（前台运行，显示实时日志） |
| `start --background` / `start -b` | 后台启动（守护进程模式） |
| `stop` | 停止正在运行的 Agent |
| `restart` | 重启代理服务（支持 -b 后台重启） |
| `status` | 查看运行状态 |
| `paircode` | 查看配对码提示 |
| `config` | 查看当前配置 |
| `help` | 显示帮助信息 |
| `--version` / `-v` | 显示版本号 |

### 启动选项

```
--background, -b    后台运行（守护进程模式）
--port <端口>       监听端口，默认 18910
--host <地址>       监听地址，默认 127.0.0.1
--workdir <目录>    工作目录（文件读写限制在此范围内）
```

### 前台 vs 后台运行

| 模式 | 命令 | 终端行为 | 适用场景 |
|------|------|----------|----------|
| 前台 | `start` | 阻塞终端，实时显示运行日志 | 开发调试、问题排查 |
| 后台 | `start --background` | 立即返回，终端无日志输出 | 生产环境、日常使用 |

前台运行时，所有文件读写、命令执行、安全拦截等操作日志会以格式化形式实时输出到终端：

```
[12:30:01] [INFO] [文件:read] path=/project/src/index.js size=2048
[12:30:05] [INFO] [命令:started] command="npm test" cwd=/project execId=a1b2c3d4
[12:30:12] [INFO] [命令:completed] execId=a1b2c3d4 exitCode=0 killed=false
[12:31:00] [WARN] [安全:exec_denied] command="rm -rf /" reason=高危命令被拦截
```

### 进程管理

Agent 通过 PID 文件（`~/.ai-helper-agent/agent.pid`）管理进程生命周期：

- 启动时自动写入 PID 文件
- `stop` 命令优先通过 API 优雅关闭，失败则通过 PID 文件 kill 进程
- 正常关闭时自动清理 PID 文件

## 安全机制

### 文件沙箱

所有文件操作限制在配置的 `allowedPaths` 白名单目录内。通过 `realpath` 解析防止符号链接绕过，确保物理路径安全。

### 命令分级管控

**黑名单** — 直接拦截，不可绕过：

| 类型 | 示例 |
|------|------|
| 磁盘破坏 | `rm -rf /`、`mkfs.*`、`dd if=... of=/dev/...` |
| 系统文件覆盖 | `> /etc/passwd`、`> /etc/shadow` |
| 恶意管道执行 | `curl ... \| bash`、`git clone ... \| sh` |
| Shell 注入 | 反引号、`$()`、`${}` 命令替换 |
| Fork bomb | `:(){ :\|:& };:` |

**灰名单** — 需要用户确认后才执行：

| 命令模式 | 原因 |
|----------|------|
| `sudo ...` | 需要管理员权限 |
| `npm install -g ...` | 全局安装包 |
| `pip install/uninstall` | Python 包管理 |
| `chmod -R 777` | 递归修改权限 |
| `rm -rf ...` | 递归强制删除 |
| `git push --force` | 强制推送 |
| `shutdown/reboot` | 关机/重启 |

### 认证机制

首次配对时用户在扩展中输入终端显示的 4 位配对码完成配对。配对码每 30 秒轮换。配对成功后使用 HMAC token 做后续请求认证，存储在 `~/.ai-helper-agent/pairings.json`。

## 配置

配置文件路径：`~/.ai-helper-agent/config.json`

```json
{
  "port": 18910,
  "host": "127.0.0.1",
  "workdir": "/path/to/project",
  "allowedPaths": [],
  "pairCodeTTL": 30,
  "commandTimeout": 300000,
  "fileMaxSize": 52428800
}
```

| 字段 | 说明 | 默认值 |
|------|------|--------|
| `port` | 监听端口 | 18910 |
| `host` | 监听地址 | 127.0.0.1 |
| `workdir` | 默认工作目录 | 启动时当前目录 |
| `allowedPaths` | 额外允许访问的目录列表 | `[]` |
| `pairCodeTTL` | 配对码有效期（秒） | 30 |
| `commandTimeout` | 命令执行超时（毫秒） | 300000（5分钟） |
| `fileMaxSize` | 文件读写最大字节数 | 52428800（50MB） |

## 文件搜索

Agent 优先使用系统原生搜索工具，不可用时自动回退到 Node.js 实现：

| 引擎 | 用途 | 检测命令 |
|------|------|----------|
| `fd` | 文件名搜索（快速） | `fd --version` |
| `rg` (ripgrep) | 文件内容搜索（快速） | `rg --version` |

状态接口返回当前可用的搜索工具：

```json
{ "searchTools": { "fd": true, "rg": true } }
```

## 审计日志

所有操作自动记录到审计日志中，日志文件位于 `~/.ai-helper-agent/logs/`。

### 双通道输出

- **终端输出**（前台模式）：格式化可读格式，输出到 stderr
- **文件输出**：JSON Lines 格式，写入日志文件

两种通道同时工作，互不影响。

### 日志格式

JSON Lines 格式，每行一条记录，文件按日命名 `agent-YYYY-MM-DD.log`。

```json
{"timestamp":"2026-01-15T10:30:00.123Z","level":"info","category":"fs","action":"read","path":"/home/user/project/src/index.js","size":2048}
{"timestamp":"2026-01-15T10:30:05.456Z","level":"info","category":"exec","action":"completed","command":"npm test","cwd":"/home/user/project","execId":"a1b2c3d4","exitCode":0,"killed":false,"stdoutLen":1024,"stderrLen":0}
{"timestamp":"2026-01-15T10:31:00.789Z","level":"warn","category":"security","action":"exec_denied","command":"rm -rf /","reason":"高危命令被拦截"}
```

### 日志分类

| category | 说明 | 包含的操作 |
|----------|------|-----------|
| `auth` | 认证事件 | 配对成功/失败 |
| `fs` | 文件操作 | read, write, list, delete, search_files, search_content |
| `exec` | 命令执行 | started, completed, stopped, error |
| `security` | 安全事件 | deny, confirm, auth 失败, 路径越权拦截 |
| `system` | 系统事件 | server_start, server_stop, shutdown, server_error, uncaught_exception, unhandled_rejection |

### 日志查询 API

```
GET /api/logs?date=2026-01-15&category=security&limit=50&offset=0
GET /api/logs/dates
```

- `date` - 日期筛选 (YYYY-MM-DD)，不传默认今天
- `category` - 分类筛选，不传返回全部
- `limit` - 返回条数上限，默认 200
- `offset` - 分页偏移

返回按时间倒序排列（最新的在前）。

### 自动清理

- 最多保留 30 个日志文件
- 单文件超过 10MB 自动删除
- 每次写入日志时触发检查

## API 端点

### 无需认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/pair` | 配对认证 |
| GET | `/api/status` | 健康检查（版本号、平台信息、搜索工具可用性） |
| POST | `/api/shutdown` | 关闭代理服务（仅限本地访问） |

### 需要认证（Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/fs/read` | 读取文件内容 |
| POST | `/api/fs/write` | 写入文件 |
| POST | `/api/fs/list` | 列出目录 |
| POST | `/api/fs/delete` | 删除文件/目录 |
| POST | `/api/fs/search_files` | 按文件名模式搜索（glob） |
| POST | `/api/fs/search_content` | 搜索文件内容（rg 优先，Node.js 回退） |
| POST | `/api/exec` | 执行系统命令 |
| POST | `/api/exec/stop` | 停止命令执行 |
| GET | `/api/exec/running` | 运行中的进程列表 |
| GET | `/api/status/detail` | 详细信息（含工作目录、配对码、搜索工具） |
| GET | `/api/logs` | 查询审计日志（支持 date/category/limit/offset 参数） |
| GET | `/api/logs/dates` | 获取可用日志日期列表 |

### WebSocket

| 路径 | 说明 |
|------|------|
| `ws://127.0.0.1:18910/ws/exec/:execId` | 命令执行实时输出流 |

## 健壮性

Agent 内置多层异常保护，防止单个错误导致整个服务崩溃：

- **请求级保护**：每个 HTTP 请求处理外层包裹异常捕获，异常时返回 500 而非崩溃
- **URL 解析保护**：畸形 URL 不会导致进程崩溃，返回 400
- **服务器级保护**：端口占用等服务器错误有专门处理，优雅报错退出
- **全局兜底**：`uncaughtException` 和 `unhandledRejection` 全局捕获，记录错误日志但不退出进程
- **文件 I/O 保护**：配置文件读写失败不影响服务运行
- **进程管理保护**：`SIGTERM`/`SIGKILL` 发送对已退出进程有 try-catch 保护

## 技术栈

- Node.js >= 18
- 原生 `http` 模块（HTTP 服务）
- `ws` 库（WebSocket 服务）
- 零外部框架依赖
- 可选依赖：`fd`、`rg`（ripgrep）— 用于加速文件搜索

## License

MIT
