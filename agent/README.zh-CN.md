> [English](./README.md) | [中文](./README.zh-CN.md)

# AI Helper Agent

AI Helper 代理服务，为 [AI Helper Chrome 扩展](https://github.com/xiweicheng/ai-helper)（[Edge 扩展商店](https://microsoftedge.microsoft.com/addons/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/kabhmgfbkhpbfhhnokaafhkdbckeipcl)）提供本地文件读写、系统命令执行、Skill 技能系统、MCP 协议扩展与可选本地知识库（RAG）能力。

## 安装

### 一键安装（推荐）

自动检测网络环境、下载 Node.js 运行时、安装 Agent 并配置开机自启——无需任何 Node.js 知识。

**macOS / Linux：**
```bash
curl -fsSL https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.sh | bash
```

**Windows（PowerShell）：**
```powershell
irm https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.ps1 | iex
```

### 手动安装（npm）

```bash
npm install -g ai-helper-agent
```

要求 Node.js >= 18.0.0（知识库/RAG 功能要求 >= 22.13.0）。

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

启动后终端会显示 6 位配对码，在 Chrome 扩展设置页「代理」标签中填入即可完成配对。

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
| `rag status` / `rag install` | 检测 RAG 依赖可用性 / 一键安装 RAG 依赖 |
| `update` | 检查并更新到最新版本（`--check` 仅查看） |
| `uninstall` | 一键卸载（保留用户数据） |
| `autostart off` | 关闭开机自启 |
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

命令终止按**整棵进程树**清理 —— `npm` 等派生出的孙进程（下载 / 编译子任务）一并终止，停止命令（`/api/exec/stop`）或超时终止后不会留下孤儿进程继续写磁盘；POSIX 对进程组发信号，Windows 使用 `taskkill /T`。

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

首次配对时用户在扩展中输入终端显示的 6 位配对码完成配对。配对码每 30 秒轮换。配对成功后使用 HMAC token 做后续请求认证，存储在 `~/.ai-helper-agent/pairings.json`。

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
| `memoryEmbedding` | 记忆语义召回通道配置，详见[语义召回通道](#语义召回通道tier)；推荐通过 `/api/memory/embedding-config` 读写，`enabled: false` 时 recall 只走关键词 | 关闭 |

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
| POST | `/api/memory/store` | 写入长期记忆（action：add / update / delete） |
| POST | `/api/memory/recall` | 关键词计分召回长期记忆（含会话级去重） |
| POST | `/api/memory/manage` | 记忆审查（`action: review`）/ 压缩淘汰（`action: compact`） |
| POST | `/api/memory/inject` | 为系统提示词执行三级注入筛选 |
| POST | `/api/memory/reindex` | 按当前 embedding 配置重建全部记忆向量缓存 |
| GET | `/api/memory/embedding-config` | 读取语义召回通道配置（明文 key 永不回显，附 `hasApiKey`） |
| POST | `/api/memory/embedding-config` | 保存语义召回通道配置 |
| POST | `/api/memory/test-embedding` | 探活 embedding 端点（成功回报向量维度） |
| GET | `/api/memory/vector-status` | 只读向量索引状态：`indexed` / `total`、已存指纹与当前指纹（`storedModelKey` / `currentModelKey`）、`stale`、`tier`。不构造 provider，因此查状态不会触发模型下载 |
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

## Skill 系统

Agent 服务内置 Skill 系统，支持将操作流程沉淀为可复用的技能。

### Skill 类型

| 类型 | 定义格式 | 执行方式 | 用途 |
|------|----------|----------|------|
| **Workflow Skill** | JSON/YAML | 直接执行 | 自动化流程，按步骤执行 |
| **Agent Skill** | SKILL.md | AI 自主调用 | 知识沉淀，在对话中触发 |

### Skill 目录结构

所有 Skill 存储在 `~/.ai-helper-agent/skills/` 目录下：

```
~/.ai-helper-agent/skills/
├── workflow-skill.json          # Workflow Skill（JSON 格式）
├── another-skill.yaml           # Workflow Skill（YAML 格式）
└── agent-skill/                 # Agent Skill（目录形式）
    ├── SKILL.md                 # 技能定义文件
    └── _meta.json               # 元数据（可选）
```

### SKILL.md 格式

```markdown
---
name: <skill-name>
description: "<简明描述，包含：(1) 技能做什么，(2) 何时触发调用>"
enabled: true
---

# <技能标题>

## When to Use This Skill

- 触发条件1
- 触发条件2

## Core Capabilities

- 能力1
- 能力2

## Usage

### Step-by-Step

1. 步骤1
2. 步骤2

## Examples

[具体示例]

## Source

从对话中沉淀，创建日期：YYYY-MM-DD
```

### 内置技能

- **skill-creator**：元技能，用于从对话中创建和更新其他技能

### Skill API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/skill/list` | 获取所有 Skill 列表 |
| GET | `/api/skill/:name` | 获取单个 Skill 完整定义 |
| POST | `/api/skill/import` | 导入新 Skill |
| POST | `/api/skill/:name/toggle` | 切换启用/停用状态 |
| DELETE | `/api/skill/:name` | 删除 Skill |
| POST | `/api/skill/:name/run` | 执行 Workflow Skill |

## MCP 协议扩展

支持 Model Context Protocol（MCP），扩展第三方工具能力。

### MCP Server 配置

配置文件路径：`~/.ai-helper-agent/config.json`

```json
{
  "mcpServers": [
    {
      "id": "my-mcp-server",
      "name": "My MCP Server",
      "command": ["python", "-m", "my_mcp_server"],
      "enabled": true
    }
  ]
}
```

### MCP API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/mcp/status` | 获取所有 MCP Server 状态 |
| POST | `/api/mcp/:serverId/connect` | 连接指定 MCP Server |
| POST | `/api/mcp/:serverId/disconnect` | 断开连接 |
| GET | `/api/mcp/tools` | 获取所有 MCP 工具列表 |

### 工作原理

1. Agent 启动时自动连接所有启用的 MCP Server
2. 通过 stdio 建立 JSON-RPC 2.0 通信
3. 自动发现 MCP Server 提供的工具
4. 工具调用请求通过 Agent 转发到 MCP Server
5. 工具结果返回给扩展

## 长期记忆

跨会话长期记忆由 Agent 全权托管：存储文件、读写互斥锁、召回计分、审查/淘汰、注入筛选全部在本进程内完成。插件只向下表端点转发工具调用——不再走通用文件 API 往返，也不依赖插件 Service Worker 是否存活。

- **数据位置** — `~/.ai-helper-agent/memory/global-memory.json`（facts + summaries + stats）
- **并发** — 进程内 Promise 链互斥锁串行化每一次读-改-写；会话级召回缓存（本对话已呈现过哪些记忆）常驻 Agent 内存
- **国际化** — 响应文案根据请求 `Accept-Language` 渲染
- **摘要来源** — 除工具主动写入外，`type: "summary"` 条目可由插件的会话上下文压缩自动沉淀（标签 `compaction` + `session:<会话 ID>`，`importance: 6`，`category: "decision"`）；同一会话重复压缩按 `memoryId` 更新同一条，不堆积

### 记录结构

```json
{
  "id": "fact_a1b2c3d4_xxxx",
  "type": "fact | summary",
  "category": "custom",
  "content": "...",
  "tags": ["..."],
  "importance": 5,
  "accessCount": 0,
  "lastAccessAt": null,
  "createdAt": "2026-01-15T10:30:00.000Z",
  "updatedAt": "2026-01-15T10:30:00.000Z",
  "sourceSessionId": null
}
```

### 召回计分

记忆关键词分 = `Σ（某字段上的命中单元数 × 该字段权重）`，另加整句原样命中分：

| 命中信号 | 分值 |
|----------|------|
| `content` 的命中单元 | × 3 / 单元 |
| `title` 的命中单元 | × 2 / 单元 |
| `tags` 的命中单元 | × 2 / 单元 |
| 查询原文（≥ 2 字）出现在 `content` 中 | +5 |
| 查询原文（≥ 2 字）出现在 `title` 中 | +3 |

单元数来自**最长命中片段**，而不是把查询拆碎：中文片段长 2 计 1 个单元、长 3 计 2 个、≥ 4 计 3 个（顶格），英文/数字整词每命中一个计 1 个；单字段封顶 3 个单元。切段与匹配零依赖，且**与知识库检索共用同一份实现**（`rag/keyword-match.js`），同一条查询在两个子系统里含义一致。

两道闸门挡住无关条目：

- **文档频率剔除** —— 在过半候选（且超过 2 条）里出现的单元无区分度，不参与计分。
- **命中门槛** —— 只有命中了**完整单元**（整个英文词或整个中文连续段）或累计 ≥ 2 个单元才算命中。只共享一个随机 2 字碎片不再算命中，整句原样加分也不能单独救回这样的条目。

### 语义召回通道（Tier）

关键词之外可以叠加一路向量召回，分三档，**缺省永远是 A 档**：

| 档位 | 条件 | 行为 |
|------|------|------|
| A `none` | 未配置或 `enabled: false`（缺省） | 只走上表的关键词计分，不产生任何新的网络调用 |
| B `remote` | `mode: "openai-compat"` 且 apiKey 与 modelName 都已填 | 远端 embedding + 进程内余弦比对 |
| C `local` | `mode: "local"` 且本机已具备 RAG 依赖 | 本地 transformers 模型出向量 |

- **向量是派生缓存** — `~/.ai-helper-agent/memory/memory-vectors.json` 可随时整删重建；`global-memory.json` 是唯一真源。缓存缺失或损坏一律当空处理，并在召回命中时按需补齐，绝不抛错。
- **模型一变即整体作废** — 缓存键是 `mode|modelName|dimensions`，任一变化都不再复用旧向量（维度不同无法比对），无需手工清理。
- **失败即降级，不拖垮记忆** — embedding 端点报错或超时（上限 8s）时，该次召回自动退回 A 档且响应仍是 200。`recall` 响应里的 `tier` 与 `vectorMatched` 说明这次实际走了哪一档、有几条被语义路采信（后者上限 2）。
- **双通道只融合名次，不融合分数** — 关键词与向量各排各的名次，按 `1/(60 + 名次)` 相加后重排（RRF）。两路分值刻度不可比，因此**只比名次、不比大小**：同时被两路命中的条目自然排前，只被一路命中的靠后。
- **语义采信门是两道，而不是「cos 超过某个绝对阈值」** — ① **查询级落点地板**：本次查询的最高 cos 低于 `0.48` 时判定「本库对这个查询没有答案」，整个语义通道一条都不采信（记忆会直接注入提示词，「全都勉强相关」等于「没有相关」）；② **条目级相对落差**：只采信距该最高分 `0.05` 以内的头部，最多 2 条。
- **为什么没有绝对相似度阈值** — 在真实 41 条库上：条目级绝对 cos 不可用（无关查询的 top1 落在 0.3340~0.4506，而阈值 ≥0.3 会放过 40/41 条、≥0.45 仍放过 20/41）；它只在查询级 top1 上可分（无关 0.3340~0.4506 vs 相关 0.5467~0.6353，间隙 0.096），所以上述地板只作用在查询级。
- **已知限制** — 地板 `0.48` 在 `BAAI/bge-m3` + 41 条库 + 9 条查询上标定，可用窗口为 `(0.4506, 0.5163]`（上下余量各约 0.03），**换 embedding 模型或改变记忆文本拼接方式后必须重新标定**；记忆条目数增长到几百条后该规则也需重测。分离度（`top1 − top2`）曾是本通道的主门，已被实测否定：库越大、无关查询的 top1−top2 越可能偶然变大，而真实库目标查询的 gap（0.0214）低于两条无关查询的（0.0361 / 0.0397），在 gap 轴上根本分不开——**不要把它加回来**。具体后果：目标条目的 cos 不是全场第 1、且落在头部 `0.05` 落差之外时，语义路不会返回它（真实库上这种条目靠词面路进窗口，名次会被压低）。
- **本地档只索引前 512 token（超出部分静默不进向量）** — 本地 `Xenova/bge-small-zh-v1.5` 的 tokenizer 窗口为 512 token，推理时**不报错地**砍掉尾部（实测真实库 41 条中 13 条超窗，最大一条只吃进 46% 的内容）。影响面有限：语义路看不到尾部，而**词面路拿的是全文**。知识库侧不受影响（默认 `chunkSize: 400` 已在窗口内）。远端模型窗口普遍大得多，且厂商截断行为从返回向量里看不出来，所以远端档不报该字段。本轮不改向量内容，只把超窗变成可见：`reindex` 响应带 `overWindow: { count, window, ids }`，进程日志点名是哪几条。
- **向量会随分批组合轻微漂移（已知噪声，非缺陷）** — 同一条记忆逐条嵌 vs 同批嵌的 cos 在 0.9940~0.9974（实测），源于 `q8` 量化核的数值差异，与批内文本长短无关；对名次融合无可观测影响，不影响召回结果。
- **运维入口** — 首次启用或更换模型后调一次 `POST /api/memory/reindex` 把存量记忆补进缓存（未启用时返回 `skipped`，端点不可达则明确 400 而非 500）。部分批失败时响应仍为成功但带 `failedBatches` 与 `lastError`（首条原因），全量原因进进程日志；本地档还会带 `overWindow`（超窗条数与点名）。
- **配置界面** — 扩展 options 页新增「记忆」Tab：读写本通道（`/api/memory/embedding-config`）、探活（`/api/memory/test-embedding`，**仅远端档**——本地档首次调用要先加载模型，必定击穿 8s 超时，所以那里直接隐藏按钮而不是给个骗人的失败）、重建缓存（`/api/memory/reindex`，执行前弹确认并写明实测耗时）、展示 `GET /api/memory/vector-status`——其中 `stale` 才是把「改了模型但没人重建」从静默退化变成可见的那个信号。注意这个界面不是为「免重启」而做的：`loadConfig()` 按文件 mtime 缓存、provider 缓存又按指纹取键，手改 `config.json` 同样即时生效。它的真实价值是可发现、可验证、防填错。表单硬守一条规则——用户看不见的字段从请求体里**缺席**，绝不交空值或 `0`：交 `dimensions: 0` 会把已存的 512 覆盖掉、改变指纹、冒报 `stale`，逼用户做一次无谓重建。
- **指纹陈旧只报告不改数据** — `vector-status` 只告诉你已存向量是由另一个 `mode|modelName|dimensions` 生成的，不删除也不重写：`stale` 且 `indexed > 0` 本身就是要看到的状态（而空库永不判为陈旧——首次启用是正常态）。

### 三级注入策略（系统提示词）

| 层级 | 规则 |
|------|------|
| 1 — 常驻 | `importance >= 8` 总是注入 |
| 2 — 预算 | 按价值排序，上限 1500 字符 + 12 条 |
| 3 — 仅索引 | 其余记忆只以标签索引行呈现，由模型主动 recall 拉取 |

> `type: "summary"` 的条目**不参与** Tier 1/2 注入，只计入 Tier 3（标签索引 + 按需召回）——会话压缩摘要因此不会挤占系统提示词预算，需要时由模型自己拉取。

记忆价值 = `importance x (1 + ln(accessCount + 1)) x 时间衰减`；价值降到 10 以下的条目由压缩淘汰（`/api/memory/manage` 的 `action: "compact"`）。

> 长期记忆需要带 `/api/memory/*` 端点的 Agent 版本。插件**不会**回退到通用文件 API——端点缺失时直接提示版本不匹配。

## 知识库（RAG）

可选的本地检索增强生成（RAG）能力：将文档索引为可检索的知识库，让插件回答时附带引用来源。RAG 依赖为可选安装 —— Agent 启动时自动检测可用性，并通过 `/api/rag/status` 对外暴露；依赖缺失时 RAG 请求返回 `503`，插件端提供一键安装（白名单依赖，进度可经 `/api/rag/install/status` 轮询）。也可通过 CLI 安装：`ai-helper-agent rag status` / `ai-helper-agent rag install`。曾成功安装过依赖的用户享受**启动自动恢复**：`npm -g` 更新代理会清理包目录内手动安装的依赖，Agent 启动检测到缺失时自动重新安装（标记 `trigger=auto`），用户零操作；从未安装成功过的用户不触发。

- **数据位置** —— 知识库存储于 `~/.ai-helper-agent/rag/`（可用环境变量 `AI_HELPER_RAG_ROOT` 覆盖）
- **多知识库管理** —— 创建 / 更新 / 删除 / 启用 / 停用知识库，各自维护向量配置与统计信息
- **多格式导入** —— `.txt` `.md` `.json` `.csv` `.html` / PDF / Word（`mammoth`）/ PPT（`officeparser`）/ Excel；支持文本、文件（base64）、URL 三种导入方式，解析 → 分块 → 向量化 → 存储分阶段进度可查
- **混合检索** —— 向量相似度 + 关键词命中抬分（中英文混合关键词提取）；跨库检索时 `topK` 配额按库均分
- **可插拔向量化** —— 默认本地模型（`Xenova/bge-small-zh-v1.5`，512 维，经 `@huggingface/transformers` 本地运行），也可接入任意 OpenAI 兼容向量服务（支持连通性测试并返回实际维度）
- **索引重建** —— 知识库向量空间变更时后台自动重建（临时目录重放 → 原子换入）

### RAG API

以下接口注册在认证区内（需 Bearer Token），且仅在 RAG 依赖可用时按需加载。

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/rag/install` | 触发白名单 RAG 依赖安装 |
| GET | `/api/rag/install/status` | 安装进度 |
| POST | `/api/rag/detect` | 重新检测 RAG 依赖可用性 |
| GET | `/api/rag/status` | 能力与安装状态 |
| POST | `/api/rag/test-embedding` | 测试远端向量服务连通性（返回实际维度） |
| GET | `/api/rag/collections` | 列出知识库 |
| POST | `/api/rag/collections` | 创建知识库 |
| PUT | `/api/rag/collections/{id}` | 更新名称 / 描述 / 向量配置（向量空间变更自动重建索引） |
| DELETE | `/api/rag/collections/{id}` | 删除知识库 |
| POST | `/api/rag/collections/{id}/toggle` | 启用 / 停用知识库 |
| GET | `/api/rag/collections/{id}/stats` | 文档数 / 分块数统计 |
| POST | `/api/rag/collections/{id}/ingest` | 导入文本 / 文件 / URL（同步执行） |
| GET | `/api/rag/collections/{id}/ingest/status` | 导入进度快照（供轮询） |
| GET | `/api/rag/collections/{id}/documents` | 文档列表 |
| DELETE | `/api/rag/collections/{id}/documents/{docId}` | 删除文档 |
| POST | `/api/rag/collections/{id}/search` | 单库检索 |
| POST | `/api/rag/search` | 跨知识库检索 |

## 技术栈

- Node.js >= 18
- 原生 `http` 模块（HTTP 服务）
- `ws` 库（WebSocket 服务）
- 零外部框架依赖
- 可选依赖：`fd`、`rg`（ripgrep）— 用于加速文件搜索
- 知识库（RAG）可选依赖：`vectra`（向量存储）、`@huggingface/transformers`（本地向量化）、`pdf-parse` / `mammoth` / `officeparser` / `cheerio`（文档解析）

## License

MIT
