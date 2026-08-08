> [English](./README.en.md) | [中文](./README.md)

# AI Helper Agent

AI Helper Agent — a local proxy service that provides the [AI Helper Chrome Extension](https://github.com/xiweicheng/ai-helper) with local file read/write, system command execution, Skill system, and MCP protocol extension capabilities.

## Installation

```bash
npm install -g ai-helper-agent
```

Requires Node.js >= 18.0.0.

## Quick Start

```bash
# Start in foreground (real-time logs in terminal, ideal for debugging)
ai-helper-agent start

# Start in background (daemon mode, terminal returns immediately)
ai-helper-agent start --background
ai-helper-agent start -b

# Specify work directory and port
ai-helper-agent start --workdir /path/to/your/project --port 18911
```

After startup, the terminal will display a 4-digit pairing code. Enter it in the "Agent" tab of the Chrome extension settings page to complete pairing.

## CLI Commands

| Command | Description |
|---------|-------------|
| `start` | Start the agent service (foreground, with real-time logs) |
| `start --background` / `start -b` | Start in background (daemon mode) |
| `stop` | Stop the running agent |
| `restart` | Restart the agent service (supports -b for background restart) |
| `status` | Check running status |
| `paircode` | Show pairing code |
| `config` | View current configuration |
| `help` | Show help information |
| `--version` / `-v` | Show version number |

### Startup Options

```
--background, -b    Run in background (daemon mode)
--port <port>       Listen port, default 18910
--host <address>    Listen address, default 127.0.0.1
--workdir <dir>     Work directory (file read/write restricted to this scope)
```

### Foreground vs Background

| Mode | Command | Terminal Behavior | Use Case |
|------|---------|-------------------|----------|
| Foreground | `start` | Blocks terminal, shows real-time logs | Development, debugging |
| Background | `start --background` | Returns immediately, no log output | Production, daily use |

When running in foreground, all file read/write, command execution, and security interception logs are output in real-time in a formatted manner:

```
[12:30:01] [INFO] [File:read] path=/project/src/index.js size=2048
[12:30:05] [INFO] [Command:started] command="npm test" cwd=/project execId=a1b2c3d4
[12:30:12] [INFO] [Command:completed] execId=a1b2c3d4 exitCode=0 killed=false
[12:31:00] [WARN] [Security:exec_denied] command="rm -rf /" reason=High-risk command blocked
```

### Process Management

The agent manages process lifecycle via a PID file (`~/.ai-helper-agent/agent.pid`):

- Automatically writes PID file on startup
- `stop` command prefers graceful shutdown via API, falls back to killing process via PID file
- Automatically cleans up PID file on normal shutdown

## Security

### File Sandbox

All file operations are restricted to directories listed in the `allowedPaths` whitelist. `realpath` resolution prevents symlink bypasses, ensuring physical paths are safe.

### Command Tiered Control

**Blacklist** — Blocked directly, cannot be bypassed:

| Type | Examples |
|------|----------|
| Disk destruction | `rm -rf /`, `mkfs.*`, `dd if=... of=/dev/...` |
| System file overwrite | `> /etc/passwd`, `> /etc/shadow` |
| Malicious pipe execution | `curl ... \| bash`, `git clone ... \| sh` |
| Shell injection | Backticks, `$()`, `${}` command substitution |
| Fork bomb | `:(){ :\|:& };:` |

**Greylist** — Requires user confirmation before execution:

| Command Pattern | Reason |
|-----------------|--------|
| `sudo ...` | Requires admin privileges |
| `npm install -g ...` | Global package installation |
| `pip install/uninstall` | Python package management |
| `chmod -R 777` | Recursive permission modification |
| `rm -rf ...` | Recursive forced deletion |
| `git push --force` | Force push |
| `shutdown/reboot` | System shutdown/restart |

### Authentication

Pairing is completed by entering the 4-digit pairing code displayed in the terminal into the extension. The pairing code rotates every 30 seconds. After successful pairing, an HMAC token is used for subsequent request authentication, stored in `~/.ai-helper-agent/pairings.json`.

## Configuration

Configuration file path: `~/.ai-helper-agent/config.json`

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

| Field | Description | Default |
|-------|-------------|---------|
| `port` | Listen port | 18910 |
| `host` | Listen address | 127.0.0.1 |
| `workdir` | Default work directory | Current directory at startup |
| `allowedPaths` | Additional allowed directory list | `[]` |
| `pairCodeTTL` | Pairing code validity (seconds) | 30 |
| `commandTimeout` | Command execution timeout (ms) | 300000 (5 min) |
| `fileMaxSize` | Max file read/write size (bytes) | 52428800 (50 MB) |

## File Search

The agent prefers native system search tools, with automatic fallback to Node.js implementation when unavailable:

| Engine | Purpose | Detection Command |
|--------|---------|-------------------|
| `fd` | Filename search (fast) | `fd --version` |
| `rg` (ripgrep) | File content search (fast) | `rg --version` |

The status endpoint reports currently available search tools:

```json
{ "searchTools": { "fd": true, "rg": true } }
```

## Audit Logs

All operations are automatically recorded in audit logs, located in `~/.ai-helper-agent/logs/`.

### Dual Channel Output

- **Terminal output** (foreground mode): Formatted human-readable output to stderr
- **File output**: JSON Lines format, written to log files

Both channels work simultaneously without interfering with each other.

### Log Format

JSON Lines format, one record per line, files named by date `agent-YYYY-MM-DD.log`.

```json
{"timestamp":"2026-01-15T10:30:00.123Z","level":"info","category":"fs","action":"read","path":"/home/user/project/src/index.js","size":2048}
{"timestamp":"2026-01-15T10:30:05.456Z","level":"info","category":"exec","action":"completed","command":"npm test","cwd":"/home/user/project","execId":"a1b2c3d4","exitCode":0,"killed":false,"stdoutLen":1024,"stderrLen":0}
{"timestamp":"2026-01-15T10:31:00.789Z","level":"warn","category":"security","action":"exec_denied","command":"rm -rf /","reason":"High-risk command blocked"}
```

### Log Categories

| Category | Description | Included Actions |
|----------|-------------|-----------------|
| `auth` | Authentication events | Pairing success/failure |
| `fs` | File operations | read, write, list, delete, search_files, search_content |
| `exec` | Command execution | started, completed, stopped, error |
| `security` | Security events | deny, confirm, auth failure, path breach interception |
| `system` | System events | server_start, server_stop, shutdown, server_error, uncaught_exception, unhandled_rejection |

### Log Query API

```
GET /api/logs?date=2026-01-15&category=security&limit=50&offset=0
GET /api/logs/dates
```

- `date` - Date filter (YYYY-MM-DD), defaults to today
- `category` - Category filter, returns all if omitted
- `limit` - Max number of records returned, defaults to 200
- `offset` - Pagination offset

Results are returned in reverse chronological order (newest first).

### Auto Cleanup

- Maximum 30 log files retained
- Single files exceeding 10 MB are automatically deleted
- Cleanup check triggered on every log write

## API Endpoints

### No Authentication Required

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/pair` | Pairing authentication |
| GET | `/api/status` | Health check (version, platform info, search tool availability) |
| POST | `/api/shutdown` | Shut down the agent service (local access only) |

### Authentication Required (Bearer Token)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/fs/read` | Read file content |
| POST | `/api/fs/write` | Write file |
| POST | `/api/fs/list` | List directory |
| POST | `/api/fs/delete` | Delete file/directory |
| POST | `/api/fs/search_files` | Search files by name pattern (glob) |
| POST | `/api/fs/search_content` | Search file content (rg preferred, Node.js fallback) |
| POST | `/api/exec` | Execute system command |
| POST | `/api/exec/stop` | Stop command execution |
| GET | `/api/exec/running` | List running processes |
| GET | `/api/status/detail` | Detailed info (work directory, pairing code, search tools) |
| GET | `/api/logs` | Query audit logs (supports date/category/limit/offset params) |
| GET | `/api/logs/dates` | Get available log date list |

### WebSocket

| Path | Description |
|------|-------------|
| `ws://127.0.0.1:18910/ws/exec/:execId` | Real-time command execution output stream |

## Robustness

The agent has built-in multi-layer exception protection to prevent a single error from crashing the entire service:

- **Request-level protection**: Each HTTP request handler is wrapped with exception catching, returns 500 instead of crashing
- **URL parsing protection**: Malformed URLs don't crash the process, returns 400
- **Server-level protection**: Server errors like port conflicts are handled gracefully
- **Global fallback**: `uncaughtException` and `unhandledRejection` global handlers, logs errors but doesn't exit the process
- **File I/O protection**: Config file read/write failures don't affect service operation
- **Process management protection**: `SIGTERM`/`SIGKILL` sending has try-catch protection for already-exited processes

## Skill System

The agent has a built-in Skill system that allows codifying workflows into reusable skills.

### Skill Types

| Type | Definition Format | Execution | Purpose |
|------|-------------------|-----------|---------|
| **Workflow Skill** | JSON/YAML | Direct execution | Automated workflows, step-by-step |
| **Agent Skill** | SKILL.md | AI autonomous invocation | Knowledge codification, triggered in conversation |

### Skill Directory Structure

All skills are stored in `~/.ai-helper-agent/skills/`:

```
~/.ai-helper-agent/skills/
├── workflow-skill.json          # Workflow Skill (JSON format)
├── another-skill.yaml           # Workflow Skill (YAML format)
└── agent-skill/                 # Agent Skill (directory form)
    ├── SKILL.md                 # Skill definition file
    └── _meta.json               # Metadata (optional)
```

### SKILL.md Format

```markdown
---
name: <skill-name>
description: "<Brief description including: (1) what the skill does, (2) when to trigger>"
enabled: true
---

# <Skill Title>

## When to Use This Skill

- Trigger condition 1
- Trigger condition 2

## Core Capabilities

- Capability 1
- Capability 2

## Usage

### Step-by-Step

1. Step 1
2. Step 2

## Examples

[Concrete examples]

## Source

Codified from conversation, created: YYYY-MM-DD
```

### Built-in Skills

- **skill-creator**: Meta-skill for creating and updating other skills from conversations

### Skill API

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/skill/list` | Get all skills list |
| GET | `/api/skill/:name` | Get a single skill's full definition |
| POST | `/api/skill/import` | Import a new skill |
| POST | `/api/skill/:name/toggle` | Toggle enable/disable status |
| DELETE | `/api/skill/:name` | Delete a skill |
| POST | `/api/skill/:name/run` | Execute a workflow skill |

## MCP Protocol Extension

Supports Model Context Protocol (MCP) to extend third-party tool capabilities.

### MCP Server Configuration

Configuration file path: `~/.ai-helper-agent/config.json`

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

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/mcp/status` | Get all MCP server statuses |
| POST | `/api/mcp/:serverId/connect` | Connect to specified MCP server |
| POST | `/api/mcp/:serverId/disconnect` | Disconnect |
| GET | `/api/mcp/tools` | Get all MCP tools list |

### How It Works

1. Agent auto-connects all enabled MCP servers on startup
2. Establishes JSON-RPC 2.0 communication via stdio
3. Auto-discover tools provided by MCP servers
4. Tool call requests are forwarded to MCP servers via the agent
5. Tool results are returned to the extension

## Tech Stack

- Node.js >= 18
- Native `http` module (HTTP server)
- `ws` library (WebSocket server)
- Zero external framework dependencies
- Optional dependencies: `fd`, `rg` (ripgrep) — for accelerated file search

## License

MIT
