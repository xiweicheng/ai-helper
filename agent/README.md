# AI Helper Agent

AI Helper 本地代理服务，为 [AI Helper Chrome 扩展](https://github.com/xiweicheng/ai-helper) 提供本地文件读写和系统命令执行能力。

## 安装

```bash
npm install -g ai-helper-agent
```

要求 Node.js >= 18.0.0。

## 快速开始

```bash
# 启动 Agent（默认工作目录为当前目录）
ai-helper-agent start

# 指定工作目录
ai-helper-agent start --workdir /path/to/your/project

# 指定端口
ai-helper-agent start --port 18911
```

启动后终端会显示 4 位配对码，在 Chrome 扩展设置页「本地Agent」标签中填入即可完成配对。

## CLI 命令

| 命令 | 说明 |
|------|------|
| `start` | 启动 Agent 服务 |
| `stop` | 停止正在运行的 Agent |
| `restart` | 重启 Agent 服务 |
| `status` | 查看运行状态 |
| `paircode` | 查看配对码提示 |
| `config` | 查看当前配置 |
| `help` | 显示帮助信息 |
| `--version` / `-v` | 显示版本号 |

### 启动选项

```
--port <端口>      监听端口，默认 18910
--host <地址>      监听地址，默认 127.0.0.1
--workdir <目录>   工作目录（文件读写限制在此范围内）
```

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

## API 端点

### 无需认证

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/pair` | 配对认证 |
| GET | `/api/status` | 健康检查（版本号、运行状态） |

### 需要认证（Bearer Token）

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/fs/read` | 读取文件内容 |
| POST | `/api/fs/write` | 写入文件 |
| POST | `/api/fs/list` | 列出目录 |
| POST | `/api/fs/delete` | 删除文件/目录 |
| POST | `/api/exec` | 执行系统命令 |
| POST | `/api/exec/stop` | 停止命令执行 |
| GET | `/api/exec/running` | 运行中的进程列表 |
| GET | `/api/status/detail` | 详细信息（含工作目录） |
| POST | `/api/shutdown` | 关闭 Agent 服务 |

### WebSocket

| 路径 | 说明 |
|------|------|
| `ws://127.0.0.1:18910/ws/exec/:execId` | 命令执行实时输出流 |

## 技术栈

- Node.js >= 18
- 原生 `http` 模块（HTTP 服务）
- `ws` 库（WebSocket 服务）
- 零外部框架依赖

## License

MIT
