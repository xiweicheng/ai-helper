> [English](./README.md) | [中文](./README.zh-CN.md)

# AI Helper Agent

AI Helper Agent — a local proxy service that provides the [AI Helper Chrome Extension](https://github.com/xiweicheng/ai-helper) ([Chrome Web Store](https://chromewebstore.google.com/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/fnolhphogjkdcmnecpeckhjoeofldiac) / [Edge Add-ons](https://microsoftedge.microsoft.com/addons/detail/ai-helper-%E7%BD%91%E9%A1%B5%E6%99%BA%E8%83%BD%E5%8A%A9%E6%89%8B/kabhmgfbkhpbfhhnokaafhkdbckeipcl)) with local file read/write, system command execution, Skill system, MCP protocol extension, and an optional local knowledge base (RAG) capability.

## Installation

### One-click install (recommended)

Automatically detects network environment, downloads Node.js runtime, installs Agent, and configures auto-start — no Node.js knowledge required.

**macOS / Linux:**
```bash
curl -fsSL https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.sh | bash
```

**Windows (PowerShell):**
```powershell
irm https://raw.githubusercontent.com/xiweicheng/ai-helper/main/install.ps1 | iex
```

### Manual install (npm)

```bash
npm install -g ai-helper-agent
```

Requires Node.js >= 18.0.0 (>= 22.13.0 for Knowledge Base / RAG features).

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

After startup, the terminal will display a 6-digit pairing code. Enter it in the "Agent" tab of the Chrome extension settings page to complete pairing.

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
| `rag status` / `rag install` | Check RAG dependency availability / one-click install |
| `update` | Check and update to latest version (`--check` for info only) |
| `uninstall` | One-click uninstall (keeps user data) |
| `autostart off` | Disable auto-start at boot |
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

Command termination targets the **entire process tree** — grandchild processes spawned by `npm` etc. (download / build subtasks) are cleaned up together, so stopping a command (`/api/exec/stop`) or timing out never leaves orphan processes writing to disk; POSIX signals the process group, Windows uses `taskkill /T`.

## Security

### File Sandbox

All file operations are restricted to directories listed in the `allowedPaths` whitelist. `realpath` resolution prevents symlink bypasses, ensuring physical paths are safe.

### Command Tiered Control

**Blacklist** — Blocked directly, cannot be bypassed:

| Type | Examples |
|------|----------|
| Disk destruction | `rm -rf /`, `mkfs.*`, `dd if=... of=/dev/...` |
| Recursive delete of critical system dirs | `rm -rf /usr`, `/var`, `/bin`, `/sbin`, `/lib`, `/boot`, `/opt`, `/root`, `/System`, `/Library` |
| System file overwrite | `> /etc/passwd`, `> /etc/shadow` |
| Malicious pipe execution | `curl ... \| bash`, `git clone ... \| sh` |
| Fork bomb | `:(){ :\|:& };:` |

**Greylist** — Requires user confirmation before execution:

| Command Pattern | Reason |
|-----------------|--------|
| `sudo ...` | Requires admin privileges |
| `npm install -g ...` | Global package installation |
| `pip install/uninstall` | Python package management |
| `chmod -R 777`, `chmod 000`, `chmod a-rwx` | Permission change that renders a file unusable |
| `chown ...` | Change file owner |
| `rm -rf ...` (incl. `rm -r -f`, `rm --recursive --force`) | Recursive forced deletion |
| `dd of=...`, `shred`, `truncate -s 0` | Raw overwrite / destroy / empty a file |
| `curl`, `wget`, `nc`, `ssh`, `scp` | Outbound network connection |
| `kill`, `pkill`, `killall` | Terminate processes |
| `systemctl`, `launchctl`, `crontab`, `sysctl` | System service / scheduled jobs / kernel parameters |
| `git push --force` | Force push |
| `shutdown/reboot` | System shutdown/restart |
| backticks, `$()` command substitution | Statically unclear where the substituted result flows |

> Command substitution (`$(…)`, backticks) is treated as *suspicious syntax*, not a *dangerous effect*: it sits in the greylist (confirm), not the blacklist, and read-only heads such as `echo`/`pwd`/`cd` are exempted so `pwd; echo $(date)` runs directly. Commands **inside** a substitution — including one nested in quotes, e.g. `bash -c "echo \`rm -rf /\`"` — are still checked against the black/grey lists.

> Anti-bypass: privilege prefixes (`sudo` / `doas`) are peeled before matching, so a hard-forbidden action stays `deny` even when wrapped — `sudo rm -rf /usr`, `sudo dd of=/dev/sda`, `sudo sh -c "rm -rf /usr"`, `curl … | sudo sh`. Redirects that overwrite system files match anywhere in the line (`echo x > /etc/passwd`), path spellings are normalized (`rm -rf //usr` ≡ `/usr`), and the root-permission blacklist targets only `/` itself (plain absolute paths like `chmod 777 /tmp/x` fall back to greylist confirm, not a hard block).

### Authentication

Pairing is completed by entering the 6-digit pairing code displayed in the terminal into the extension. The pairing code rotates every 30 seconds. After successful pairing, an HMAC token is used for subsequent request authentication, stored in `~/.ai-helper-agent/pairings.json`.

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
| `memoryEmbedding` | Semantic memory recall channel config — see [Semantic recall channel](#semantic-recall-channel-tiers). Managed through `/api/memory/embedding-config`; `enabled: false` keeps recall keyword-only | disabled |

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
| POST | `/api/memory/store` | Write long-term memory (action: add / update / delete) |
| POST | `/api/memory/recall` | Recall long-term memory by keyword scoring (with per-session dedup) |
| POST | `/api/memory/manage` | Memory review (`action: review`) / compaction (`action: compact`) |
| POST | `/api/memory/inject` | Three-tier injection selection for the system prompt |
| POST | `/api/memory/reindex` | Rebuild the memory vector cache for every entry using the current embedding config |
| GET | `/api/memory/embedding-config` | Read the semantic recall channel config (plain key never echoed; `hasApiKey` included) |
| POST | `/api/memory/embedding-config` | Save the semantic recall channel config |
| POST | `/api/memory/test-embedding` | Probe the embedding endpoint (returns vector dimensions on success) |
| GET | `/api/memory/vector-status` | Read-only vector index status: `indexed` / `total`, stored vs current fingerprint (`storedModelKey` / `currentModelKey`), `stale`, `tier`. Never builds a provider, so querying it cannot trigger a model download |
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

## Long-term Memory

Cross-session long-term memory is owned by the agent: the storage file, the read-modify-write lock, recall scoring, review/compaction and injection selection all run in this process. The extension only forwards tool calls to the endpoints below — no generic file-API round-trips, no dependency on the extension Service Worker staying alive.

- **Data location** — `~/.ai-helper-agent/memory/global-memory.json` (facts + summaries + stats)
- **Concurrency** — an in-process promise-chain lock serializes every read-modify-write; the per-session recall cache (which memories were already surfaced in this conversation) lives in agent memory
- **i18n** — response text is rendered from the request's `Accept-Language`
- **Where summaries come from** — besides explicit tool writes, `type: "summary"` entries are sedimented automatically by the extension's session context compaction (tags `compaction` + `session:<id>`, `importance: 6`, `category: "decision"`); re-compacting the same session updates the same `memoryId` instead of piling up

### Record schema

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

### Recall scoring

A memory's keyword score is `Σ (matched units in a field × that field's weight)`, plus whole-query bonuses:

| Signal | Score |
|--------|-------|
| matched unit in `content` | × 3 per unit |
| matched unit in `title` | × 2 per unit |
| matched unit in `tags` | × 2 per unit |
| full query (≥ 2 chars) found in `content` | +5 |
| full query (≥ 2 chars) found in `title` | +3 |

Units come from the **longest matching fragment**, not from chopping the query into pieces: a CJK fragment of length 2 counts as 1 unit, 3 counts as 2, ≥ 4 counts as 3 (top of the scale), and each whole latin/digit word counts as 1 — capped at 3 units per field. Extraction and matching are zero-dependency and **shared with knowledge-base retrieval** (`rag/keyword-match.js`), so a query means the same thing in both subsystems.

Two gates keep irrelevant memories out:

- **Document frequency** — a unit found in over half of the candidates (and in more than 2 of them) carries no discriminating power and scores nothing.
- **Hit threshold** — a memory counts as a hit only when it matched a *whole* unit (an entire latin word or an entire CJK run) or at least 2 units. Sharing only a random 2-character fragment is no longer a hit; the exact-match bonuses alone cannot rescue such an entry.

### Semantic recall channel (tiers)

A vector channel can be layered on top of keyword scoring. It runs at one of three tiers and **the default is always Tier A**:

| Tier | Condition | Behaviour |
|------|-----------|-----------|
| A `none` | Unconfigured or `enabled: false` (default) | Keyword scoring only, exactly as above; no new network calls |
| B `remote` | `mode: "openai-compat"` with both apiKey and modelName set | Remote embeddings + in-process cosine comparison |
| C `local` | `mode: "local"` and RAG dependencies present locally | Vectors from a local transformers model |

- **Vectors are a derived cache** — `~/.ai-helper-agent/memory/memory-vectors.json` can be deleted at any time; `global-memory.json` is the single source of truth. A missing or corrupt cache is treated as empty and refilled on demand during recall — it never throws.
- **Changing the model invalidates everything** — the cache key is `mode|modelName|dimensions`; if any part changes the old vectors are dropped rather than compared (mismatched dimensions cannot be compared). No manual cleanup needed.
- **Failure degrades, it does not break memory** — when the embedding endpoint errors or exceeds its 8s timeout, that recall falls back to Tier A and still answers 200. `tier` and `vectorMatched` in the recall response say which tier actually ran and how many hits were accepted by the semantic route (capped at 2).
- **Both channels fuse ranks, not scores** — keywords and vectors each produce their own ranking, which is merged as `1/(60 + rank)` (RRF). The two scales are not comparable, so only **rank** is consumed, never magnitude: an item hit by both routes naturally floats to the top, one hit by a single route lands behind it.
- **The semantic gate has two stages, not one absolute cosine threshold** — (1) **query-level floor**: if the best cosine of this query is below `0.48`, the library is judged to hold no answer for it and the whole semantic route contributes nothing (recall output goes straight into the prompt — "everything is marginally relevant" equals "nothing is relevant"); (2) **item-level relative drop-off**: only items within `0.05` of that best score are accepted, at most 2.
- **Why there is no absolute similarity threshold** — measured on a real 41-item library: absolute cosine fails at item level (irrelevant queries reach top1 scores of 0.3340~0.4506, while a ≥0.3 threshold admits 40/41 items and ≥0.45 still admits 20/41). It separates only at query-level top1 (irrelevant 0.3340~0.4506 vs relevant 0.5467~0.6353, gap 0.096), which is exactly where the floor above is applied.
- **Known limits** — the `0.48` floor was calibrated on `BAAI/bge-m3` with a 41-item library and 9 queries; its usable window is `(0.4506, 0.5163]` (roughly 0.03 of headroom on each side). **Recalibration is mandatory when the embedding model or the memory-text concatenation changes**, and the rule needs re-measurement once the library grows to a few hundred items. Separation (`top1 − top2`) was the original main gate of this channel and was falsified by measurement: the larger the library, the more an irrelevant query's top1−top2 can grow by chance, and the real library's target query had a gap of 0.0214 — below two irrelevant queries at 0.0361 / 0.0397, so the two are inseparable on that axis. **Do not add it back.** Practical consequence: when a target item is not the library's best cosine and falls outside the `0.05` drop-off, the semantic route will not return it (on the real library such items still enter via the keyword route, at a lower rank).
- **The local backend only indexes the first 512 tokens (the tail is dropped silently)** — the tokenizer window of `Xenova/bge-small-zh-v1.5` is 512 tokens and inference cuts the tail **without any error** (measured: 13 of 41 items in a real library exceed it; the largest one gets only 46% of its content in). Blast radius is limited: the semantic channel cannot see the tail, while **the keyword channel still reads the full text**. The knowledge base is unaffected (its default `chunkSize: 400` already fits). Remote models have far larger windows, and a vendor's truncation behaviour is invisible in the vectors it returns — so the remote tier reports nothing. This round changes no vector content; it only makes the overflow visible: `reindex` now returns `overWindow: { count, window, ids }` and the process log names the items.
- **Vectors drift slightly with batch composition (known noise, not a bug)** — embedding one memory alone vs inside a batch gives cos 0.9940–0.9974 (measured), caused by the `q8` quantized kernels and unrelated to how long the batch partners are; no observable effect on rank fusion and no effect on recall results.
- **Operations entry point** — after first enabling the channel or switching models, call `POST /api/memory/reindex` once to backfill existing memories (it returns `skipped` when the channel is off, and a clear 400 — not 500 — when the endpoint is unreachable). When only some batches fail the response still reports success but carries `failedBatches` plus `lastError` (the first reason); the full reasons go to the process log. On the local tier it also carries `overWindow` (how many items exceed the window, and which).
- **Configuration UI** — the extension's options page has a **Memory** tab that reads and writes this channel (`/api/memory/embedding-config`), probes the endpoint (`/api/memory/test-embedding`, remote tier only — the local tier's first call has to load the model and would always blow the 8s budget, so the button is hidden there instead of lying), rebuilds the cache (`/api/memory/reindex` behind an explicit confirmation that quotes the measured cost) and shows `GET /api/memory/vector-status`, whose `stale` flag is what makes "the model changed but nobody rebuilt" visible instead of silently degrading recall. Note the tab is a convenience, not a restart workaround: `loadConfig()` caches by file mtime and the provider cache is keyed by the fingerprint, so editing `config.json` by hand takes effect just as immediately. Its real value is discoverability, verification and mis-fill prevention. One rule the form follows strictly — a field the user cannot see is **absent from the request body**, never empty or `0`: sending `dimensions: 0` would overwrite a stored `512`, change the fingerprint, raise a false `stale` and force a pointless rebuild.
- **Fingerprint staleness is report-only** — `vector-status` tells you the stored vectors were built by a different `mode|modelName|dimensions`; it does not discard or rewrite them, because `stale` with `indexed > 0` is a state worth looking at (and an empty library is never called stale — first-time enablement is normal).

### Injection tiers (system prompt)

| Tier | Rule |
|------|------|
| 1 — resident | `importance >= 8` is always injected |
| 2 — budgeted | ranked by value, capped at 1500 characters and 12 items |
| 3 — index only | remaining memories surface as tag index lines; the model pulls them with a recall call |

> Entries with `type: "summary"` are **never** part of Tier 1/2 injection — they count only toward Tier 3 (tag index + on-demand recall), so compaction summaries never eat system-prompt budget; the model pulls them when needed.

Memory value = `importance x (1 + ln(accessCount + 1)) x timeDecay`; entries whose value falls below 10 are evicted by compaction (`/api/memory/manage` with `action: "compact"`).

> Long-term memory needs an agent build that ships the `/api/memory/*` endpoints. The extension deliberately does **not** fall back to the generic file API — a missing endpoint is reported as a version-mismatch hint instead.

## Knowledge Base (RAG)

Optional local retrieval-augmented generation. Turn documents into searchable knowledge bases so the extension can answer with cited sources. The RAG stack ships as optional dependencies — the agent detects availability at startup and reports it via `/api/rag/status`; when dependencies are missing, RAG requests return `503` and the extension offers one-click installation (whitelisted packages, progress polled from `/api/rag/install/status`). Installation is also available from the CLI: `ai-helper-agent rag status` / `ai-helper-agent rag install`. Users who have installed the dependencies successfully before get **automatic recovery on startup**: `npm -g` upgrades prune manually-installed packages inside the package directory, so the agent re-installs them automatically (marked `trigger=auto`) — no manual action needed; users who never installed successfully are not prompted.

- **Data location** — knowledge bases are stored under `~/.ai-helper-agent/rag/` (override with the `AI_HELPER_RAG_ROOT` environment variable)
- **Multiple knowledge bases** — create / update / delete / enable / disable collections, each keeping its own embedding config and statistics
- **Multi-format ingestion** — `.txt` `.md` `.json` `.csv` `.html` / PDF / Word (`mammoth`) / PPT (`officeparser`) / Excel; ingest by raw text, file (base64), or URL, with staged parsing → chunking → embedding → storage progress
- **Hybrid retrieval** — vector similarity with keyword-hit boosting (mixed Chinese/English keyword extraction); searching multiple bases splits the `topK` quota across them
- **Pluggable embeddings** — local model (`Xenova/bge-small-zh-v1.5`, 512-dim, runs locally via `@huggingface/transformers`) by default, or any OpenAI-compatible embedding endpoint (with a connectivity test returning actual dimensions)
- **Index rebuild** — changing a collection's embedding space rebuilds its index in the background (temporary-directory replay → atomic swap)

### RAG API

Endpoints are registered inside the authenticated region (Bearer token required) and loaded on demand — only when the RAG dependencies are available.

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rag/install` | Start whitelisted RAG dependency installation |
| GET | `/api/rag/install/status` | Installation progress |
| POST | `/api/rag/detect` | Re-detect RAG dependency availability |
| GET | `/api/rag/status` | Capability & install status |
| POST | `/api/rag/test-embedding` | Test remote embedding endpoint connectivity (returns actual dimensions) |
| GET | `/api/rag/collections` | List knowledge bases |
| POST | `/api/rag/collections` | Create a knowledge base |
| PUT | `/api/rag/collections/{id}` | Update name / description / embedding config (rebuilds index on embedding-space change) |
| DELETE | `/api/rag/collections/{id}` | Delete a knowledge base |
| POST | `/api/rag/collections/{id}/toggle` | Enable / disable a knowledge base |
| GET | `/api/rag/collections/{id}/stats` | Document / chunk statistics |
| POST | `/api/rag/collections/{id}/ingest` | Ingest text / file / URL (synchronous) |
| GET | `/api/rag/collections/{id}/ingest/status` | Ingestion progress snapshot (for polling) |
| GET | `/api/rag/collections/{id}/documents` | Document list |
| DELETE | `/api/rag/collections/{id}/documents/{docId}` | Delete a document |
| POST | `/api/rag/collections/{id}/search` | Search a single knowledge base |
| POST | `/api/rag/search` | Cross-knowledge-base search |

## Tech Stack

- Node.js >= 18
- Native `http` module (HTTP server)
- `ws` library (WebSocket server)
- Zero external framework dependencies
- Optional dependencies: `fd`, `rg` (ripgrep) — for accelerated file search
- Optional dependencies for the knowledge base (RAG): `vectra` (vector store), `@huggingface/transformers` (local embeddings), `pdf-parse` / `mammoth` / `officeparser` / `cheerio` (document parsers)

## License

MIT
