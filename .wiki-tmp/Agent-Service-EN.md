> **🌐 Language / 语言**: [中文](Agent-Service) · **English**

# Agent Service

AI Helper can optionally pair with a **Node.js Agent service** that provides **file system, terminal commands, Skills, the MCP protocol, a local knowledge base (RAG)**, and file upload capabilities beyond the browser sandbox.

> ← Back to [Wiki Home](Home-EN) · Related: [Built-in Tools Reference](Built-in-Tools-EN) · [Configuration](Configuration-EN) · [FAQ](FAQ-EN)

---

## Why You Need the Agent Service

Browser extensions run in a restricted sandbox and cannot directly read/write local files or run system commands. The Agent service is a separate process running on your machine; the extension talks to it via `127.0.0.1:18910`, unlocking:

- Read/write local files, browse the working directory, upload/download files
- Run terminal commands (with a three-tier security policy)
- Use the Skill system
- Extend third-party tools via the MCP protocol
- Local knowledge base (RAG) retrieval-augmented Q&A
- Cross-session long-term memory

> **Optional**: most web-page operations work without installing the Agent; file Q&A automatically falls back to browser-side extraction.

---

## Installation & Startup

### Global install (recommended)

```bash
npm install -g ai-helper-agent
```

Requires Node.js >= 18.0.0.

### Startup

```bash
# Foreground (terminal shows live run logs; good for debugging)
ai-helper-agent start

# Background (daemon mode; terminal returns immediately)
ai-helper-agent start --background
ai-helper-agent start -b

# Specify working directory and port
ai-helper-agent start --workdir /path/to/your/project --port 18911
```

After startup, the terminal shows a **6-digit pairing code**; enter it in the "**Agent**" tab of the extension options page to complete pairing.

### Local development mode

```bash
cd agent
npm install
npm start
# Defaults to listening on 127.0.0.1:18910
```

### Startup options

```
--background, -b    Run in the background (daemon mode)
--port <port>       Listening port, default 18910
--host <address>    Listening address, default 127.0.0.1
--workdir <dir>     Working directory (file read/write restricted to this scope)
```

---

## CLI Commands

| Command | Description |
| --- | --- |
| `ai-helper-agent start` / `start -b` | Start in foreground / background |
| `ai-helper-agent stop` | Stop the running Agent |
| `ai-helper-agent restart` / `restart -b` | Restart the service |
| `ai-helper-agent status` | View run status |
| `ai-helper-agent paircode` | View the pairing code |
| `ai-helper-agent config` | View the current configuration |
| `ai-helper-agent help` | Show help |
| `ai-helper-agent --version` / `-v` | Show the version number |

> `aha` is a shortcut alias for `ai-helper-agent`, e.g. `aha start -b`.

### Foreground vs Background

| Mode | Command | Terminal behavior | Use case |
| --- | --- | --- | --- |
| Foreground | `start` | Blocks the terminal, shows live run logs | Development debugging, troubleshooting |
| Background | `start --background` | Returns immediately, no terminal log output | Production, daily use |

In foreground mode, all operation logs stream to the terminal in a formatted way:

```
[12:30:01] [INFO] [file:read] path=/project/src/index.js size=2048
[12:30:05] [INFO] [command:started] command="npm test" cwd=/project execId=a1b2c3d4
[12:30:12] [INFO] [command:completed] execId=a1b2c3d4 exitCode=0 killed=false
[12:31:00] [WARN] [security:exec_denied] command="rm -rf /" reason=high-risk command blocked
```

### Process management

The Agent manages its process lifecycle via a PID file (`~/.ai-helper-agent/agent.pid`):

- The PID file is written automatically on startup
- `stop` first tries a graceful shutdown via the API, and falls back to killing the process via the PID file
- The PID file is cleaned up automatically on normal shutdown

---

## Security Mechanisms

### File sandbox

All file operations are restricted to the whitelisted directories in `allowedPaths`. `realpath` resolution prevents symlink bypasses, ensuring physical path safety.

### Tiered command control

**Blacklist** — blocked directly, cannot be bypassed:

| Type | Examples |
| --- | --- |
| Disk destruction | `rm -rf /`, `mkfs.*`, `dd if=... of=/dev/...` |
| System file overwrite | `> /etc/passwd`, `> /etc/shadow` |
| Malicious pipe execution | `curl ... \| bash`, `git clone ... \| sh` |
| Shell injection | backticks, `$()`, `${}` command substitution |
| Fork bomb | `:(){ :\|:& };:` |

**Graylist** — requires user confirmation before execution:

| Command pattern | Reason |
| --- | --- |
| `sudo ...` | Requires admin privileges |
| `npm install -g ...` | Global package install |
| `pip install/uninstall` | Python package management |
| `chmod -R 777` | Recursive permission change |
| `rm -rf ...` | Recursive forced deletion |
| `git push --force` | Force push |
| `shutdown/reboot` | Shutdown / reboot |

**Whitelist** — regular commands, allowed directly.

### Authentication

On first pairing, the user enters the **6-digit pairing code** shown in the terminal (the code rotates every 30 seconds). After successful pairing, subsequent requests are authenticated with an HMAC token stored in `~/.ai-helper-agent/pairings.json`.

### Other protections

- **Environment-variable whitelist** (~40 vars), with `TERM=dumb` disabling interactive commands
- **Script protection**: writing `.sh` / `.py` / `.js` files automatically strips execute permissions
- **Size limits**: request body 10MB, single file 50MB

---

## Configuration File

Config file path: `~/.ai-helper-agent/config.json`

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
| --- | --- | --- |
| `port` | Listening port | 18910 |
| `host` | Listening address | 127.0.0.1 |
| `workdir` | Default working directory | current directory at startup |
| `allowedPaths` | Additional allowed directory list | `[]` |
| `pairCodeTTL` | Pairing code validity (seconds) | 30 |
| `commandTimeout` | Command execution timeout (ms) | 300000 (5 min) |
| `fileMaxSize` | Max file read/write bytes | 52428800 (50MB) |

---

## HTTP API

### No authentication

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/pair` | Pairing authentication |
| GET | `/api/status` | Health check (version, platform info, search-tool availability) |
| POST | `/api/shutdown` | Shut down the Agent service (local access only) |

### Requires authentication (Bearer Token)

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/fs/read` | Read file content |
| POST | `/api/fs/write` | Write a file |
| POST | `/api/fs/list` | List a directory |
| POST | `/api/fs/delete` | Delete a file / directory (recycle bin by default) |
| POST | `/api/fs/stat` | File details (permissions, UID/GID, MIME, timestamps) |
| POST | `/api/fs/upload-stream` | Streaming upload |
| POST | `/api/fs/download-stream` | Streaming download |
| POST | `/api/fs/preview-xlsx` | Excel parse preview |
| POST | `/api/files/upload` | File upload |
| POST | `/api/fs/search_files` | Search files by name pattern (glob) |
| POST | `/api/fs/search_content` | Search file content (rg preferred, Node.js fallback) |
| POST | `/api/exec` | Run a system command |
| POST | `/api/exec/stop` | Stop command execution |
| GET | `/api/exec/running` | List running processes |
| GET | `/api/status/detail` | Detailed info (working directory, pairing code, search tools) |
| GET | `/api/logs` | Query audit logs (date/category/limit/offset supported) |
| GET | `/api/logs/dates` | Get available log date list |
| POST | `/api/agent/restart` | Restart the Agent online |
| POST | `/api/agent/update` | Update the Agent online |
| POST | `/api/trash/restore` | Restore a file from the recycle bin |
| GET | `/api/trash/list` | Recycle bin list |

### WebSocket

| Path | Description |
| --- | --- |
| `ws://127.0.0.1:18910/ws/exec/:execId` | Real-time command execution output stream |

---

## Skill System

The Agent service has a built-in Skill system for turning operation workflows into reusable skills.

### Skill types

| Type | Definition format | Execution | Purpose |
| --- | --- | --- | --- |
| **Workflow Skill** | JSON / YAML | Direct execution | Automation workflows, executed step by step |
| **Agent Skill** | SKILL.md | AI autonomous invocation | Knowledge distillation, triggered in conversation |

### Directory structure

All Skills are stored under `~/.ai-helper-agent/skills/`:

```
~/.ai-helper-agent/skills/
├── workflow-skill.json          # Workflow Skill (JSON format)
├── another-skill.yaml           # Workflow Skill (YAML format)
└── agent-skill/                 # Agent Skill (directory form)
    ├── SKILL.md                 # Skill definition file
    └── _meta.json               # Metadata (optional)
```

### SKILL.md format

```markdown
---
name: <skill-name>
description: "<concise description, including: (1) what the skill does, (2) when to trigger it>"
enabled: true
---

# <skill title>

## When to Use This Skill

- trigger condition 1
- trigger condition 2

## Core Capabilities

- capability 1
- capability 2

## Usage

### Step-by-Step

1. step 1
2. step 2

## Examples

[concrete examples]

## Source

Distilled from conversation, created: YYYY-MM-DD
```

### Built-in skill

- **skill-creator**: a meta-skill for creating and updating other skills from conversation.

### Skill API

| Method | Path | Description |
| --- | --- | --- |
| GET | `/api/skill/list` | Get the list of all Skills |
| GET | `/api/skill/:name` | Get a single Skill's full definition |
| POST | `/api/skill/import` | Import a new Skill |
| POST | `/api/skill/:name/toggle` | Toggle enable / disable |
| DELETE | `/api/skill/:name` | Delete a Skill |
| POST | `/api/skill/:name/run` | Run a Workflow Skill |

---

## MCP Protocol Extension

Supports the **Model Context Protocol (MCP)** to extend third-party tool capabilities.

### MCP Server configuration

Config file path: `~/.ai-helper-agent/config.json`

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
| --- | --- | --- |
| GET | `/api/mcp/status` | Get the status of all MCP Servers |
| POST | `/api/mcp/:serverId/connect` | Connect a specific MCP Server |
| POST | `/api/mcp/:serverId/disconnect` | Disconnect |
| GET | `/api/mcp/tools` | Get the list of all MCP tools |

### How it works

1. The Agent connects to all enabled MCP Servers on startup
2. JSON-RPC 2.0 communication is established over stdio
3. Tools provided by the MCP Server are auto-discovered
4. Tool-call requests are forwarded through the Agent to the MCP Server
5. Tool results are returned to the extension

> You can also add and manage MCP Servers visually in the "Toolbox" tab of the extension options page.

---

## Knowledge Base (RAG)

An optional local retrieval-augmented generation (RAG) capability: index documents into a searchable knowledge base so the extension can answer with citation sources.

- **Optional dependency** — availability is auto-detected at Agent startup and exposed via `/api/rag/status`; when dependencies are missing, RAG requests return `503`, and the extension offers one-click install (whitelisted dependencies, progress pollable via `/api/rag/install/status`)
- **Data location** — the knowledge base is stored in `~/.ai-helper-agent/rag/` (overridable with the `AI_HELPER_RAG_ROOT` env var)
- **Multiple knowledge bases** — create / update / delete knowledge bases, each maintaining its own vector config and statistics
- **Multi-format import** — `.txt` `.md` `.json` `.csv` `.html` / PDF / Word (`mammoth`) / PPT (`officeparser`) / Excel; supports text, file (base64), and URL import
- **Hybrid retrieval** — vector similarity + keyword-hit boosting; for cross-library search, the `topK` quota is split evenly across libraries
- **Pluggable vectorization** — a local model by default (`Xenova/bge-small-zh-v1.5`, 512-dim, run locally via `@huggingface/transformers`), or any OpenAI-compatible vector service
- **Index rebuild** — when a knowledge base's vector space changes, the index is rebuilt in the background (replay in a temp directory → atomic swap-in)

### RAG API

The following endpoints are registered in the authenticated zone (Bearer Token required) and are loaded on demand only when RAG dependencies are available.

| Method | Path | Description |
| --- | --- | --- |
| POST | `/api/rag/install` | Trigger whitelisted RAG dependency install |
| GET | `/api/rag/install/status` | Install progress |
| POST | `/api/rag/detect` | Re-detect RAG dependency availability |
| GET | `/api/rag/status` | Capability and install status |
| POST | `/api/rag/test-embedding` | Test remote vector-service connectivity (returns actual dimension) |
| GET | `/api/rag/collections` | List knowledge bases |
| POST | `/api/rag/collections` | Create a knowledge base |
| PUT | `/api/rag/collections/{id}` | Update name / description / vector config |
| DELETE | `/api/rag/collections/{id}` | Delete a knowledge base |
| GET | `/api/rag/collections/{id}/stats` | Document / chunk count statistics |
| POST | `/api/rag/collections/{id}/ingest` | Ingest text / file / URL |
| GET | `/api/rag/collections/{id}/ingest/status` | Ingestion progress snapshot |
| GET | `/api/rag/collections/{id}/documents` | Document list |
| DELETE | `/api/rag/collections/{id}/documents/{docId}` | Delete a document |
| POST | `/api/rag/collections/{id}/search` | Single-library search |
| POST | `/api/rag/search` | Cross-knowledge-base search |

---

## File Search

The Agent prefers the system's native search tools and falls back to a Node.js implementation when unavailable:

| Engine | Purpose | Detection command |
| --- | --- | --- |
| `fd` | File-name search (fast) | `fd --version` |
| `rg` (ripgrep) | File-content search (fast) | `rg --version` |

---

## Audit Logs

All operations are recorded to audit logs under `~/.ai-helper-agent/logs/`.

### Dual-channel output

- **Terminal output** (foreground mode): formatted, human-readable, written to stderr
- **File output**: JSON Lines format, written to log files (named per day `agent-YYYY-MM-DD.log`)

### Log categories

| category | Description | Operations included |
| --- | --- | --- |
| `auth` | Authentication events | pairing success / failure |
| `fs` | File operations | read, write, list, delete, search_files, search_content |
| `exec` | Command execution | started, completed, stopped, error |
| `security` | Security events | deny, confirm, auth failure, path-escalation blocks |
| `system` | System events | server_start, server_stop, shutdown, server_error, etc. |

### Log query API

```
GET /api/logs?date=2026-01-15&category=security&limit=50&offset=0
GET /api/logs/dates
```

- `date` — date filter (YYYY-MM-DD), defaults to today
- `category` — category filter, returns all if omitted
- `limit` — max number of results, default 200
- `offset` — pagination offset

### Auto-cleanup

- Keeps at most 30 log files
- Files over 10MB are deleted automatically

---

## Tech Stack

- Node.js >= 18
- Native `http` module (HTTP service)
- `ws` library (WebSocket service)
- **Zero external framework dependencies**
- Optional dependencies: `fd`, `rg` (ripgrep) — to accelerate file search
- RAG optional dependencies: `vectra` (vector storage), `@huggingface/transformers` (local vectorization), `pdf-parse` / `mammoth` / `officeparser` / `cheerio` (document parsing)
