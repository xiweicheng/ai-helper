> **🌐 Language / 语言**: [中文](Configuration) · **English**

# Configuration

This page lists **all configuration items** in the AI Helper options page and their defaults. Entry point: right-click the extension icon → "Options", or extension details page → "Extension options".

> ← Back to [Wiki Home](Home-EN) · Related: [Installation & Quick Start](Quick-Start-EN) · [Agent Service](Agent-Service-EN)

---

## Options Page Tabs at a Glance

| Tab | Contents |
| --- | --- |
| **Basic Settings** | API Key, API Base URL, model, system prompt, default temperature |
| **Image Recognition** | Vision model and independent API config |
| **Reasoning** | ReAct loop parameters |
| **Reflection** | Three-tier reflection strategy |
| **Streaming Output** | Streaming rendering and delay |
| **Chat** | History limit, memory limit, context window |
| **Agent** | Local Agent pairing connection |
| **Toolbar** | Text-selection floating toolbar management |
| **Toolbox** | MCP Server and Skill management |

---

## Basic Settings

| Parameter | Description |
| --- | --- |
| **API Key** | OpenAI-compatible API key |
| **API Base URL** | API endpoint URL |
| **Model Name** | Presets (DeepSeek V4 Pro / Flash) + custom models |
| **System Prompt** | Custom system prompt (with reset button) |
| **Default Temperature** | Four presets from 0.2–0.9 |

> **Multi-provider profiles**: you can save multiple configuration profiles (endpoint / key / model list), then pick the provider first and the model second in the side panel.

---

## Image Recognition Settings

| Parameter | Description |
| --- | --- |
| **Image Recognition Switch** | Globally enable / disable image input |
| **Image Recognition Model** | Vision model name; empty = use the main model |
| **Image Recognition API Base** | Independent API URL; empty = use the main config |
| **Image Recognition API Key** | Independent API token; empty = use the main config |

---

## ReAct Configuration

| Parameter | Default | Description |
| --- | --- | --- |
| Max iterations | 100 | ReAct loop limit (1–100) |
| API timeout | 300s | Single API call timeout (10–600s) |
| Loop timeout | 30min | Overall reasoning loop timeout (1–60min) |
| Tool timeout | 600s | Single tool execution timeout (5–600s) |
| Clarification timeout | 3min | Clarification dialog wait timeout (1–10min) |
| API retries | 3 | Failure retry count (0–10), exponential backoff |
| Retry delay | 1s | Base delay (0.5–30s) |
| Tool pre-selection | off | Auto-filter relevant tools to reduce token consumption |
| Pre-selection threshold | 10 | Pre-selection starts only when the tool count exceeds this |
| Tool safety confirmation | on | Confirmation dialog for sensitive operations |

---

## Reflection Configuration

| Level | Default | Description |
| --- | --- | --- |
| Reflection master switch | off | Globally disables all reflection |
| Post reflection | on | Final-answer quality assessment |
| Quality threshold | 7 | 1–10; retry below this value |
| Revision threshold | 5 | Revise directly below this value |
| Subtask reflection | off | Subtask result assessment |
| Tool-level reflection | on | Triggered after 3 consecutive failures, max 2 per round |

> Post reflection scores on **completeness, accuracy, relevance, tool usage, clarity, safety, efficiency** — 7 dimensions — and automatically decides "pass / revise / re-run".

---

## Streaming Output Configuration

| Parameter | Default | Description |
| --- | --- | --- |
| LLM streaming output | on | OpenAI stream mode |
| Character render delay | 30ms | Per-character delay in the Side Panel; 0 = instant |
| Agent streaming output | on | Real-time streaming output for command execution |

---

## Chat Configuration

| Parameter | Default | Description |
| --- | --- | --- |
| Max history rounds | 50 | Conversation history retention limit (10–200) |
| Max input history | 20 | Input history entries kept (10–100) |
| Single-message limit | 100000 | Max characters per message |
| Memory limit | 20 | Max history messages sent to the LLM |
| Context window | auto | 0 = infer from the model name; custom mapping supported |

---

## Agent Pairing

Enter the **6-digit pairing code** shown in the terminal in the "Agent" tab to connect. After connecting, you can manage multiple paired Agents and switch between them at any time.

> See **[Agent Service](Agent-Service-EN)** for details.

---

## Toolbar Configuration

Manage the floating toolbar that appears when selecting text on a web page:

- Add / remove tools and **drag-to-reorder**
- Custom-prompt tools
- **Domain blocking** (disable on specific sites)
- Icon-compact mode, direct count display, temporary hide

---

## Toolbox Configuration

### MCP Servers

- CRUD for MCP Servers
- Configure startup command, parameters, and environment variables (password input for sensitive values)
- Connect / disconnect, enable / disable
- One-click enable / disable of all MCP services

### Skill Management

- Categorized display and search
- Import (JSON / Markdown / Zip / URL)
- Visual SKILL.md editor
- One-click enable / disable of all Skills

---

## Keyboard Shortcuts

| Shortcut | Function |
| --- | --- |
| `Ctrl+Shift+Y` / `Cmd+Shift+Y` | Global shortcut to open the side panel |
| `Ctrl+T` / `Cmd+T` | Open the tool selection panel |
| `Alt+/` | Show the shortcut panel |
| `Alt+↑/↓` | Switch message focus |
| `Alt+Shift+↑/↓` | Jump to first / last message |
| `Esc` | Close panel / clear input |

---

## Data Persistence Strategy

| Data type | Storage location | Description |
| --- | --- | --- |
| Extension config | `chrome.storage.local` | API Key, ReAct params, models, image recognition, etc. |
| Chat sessions | IndexedDB (`ai-helper-db`) | Active sessions + archived sessions |
| UI prototypes | IndexedDB | Associated by session |
| Toolbar config | `chrome.storage.local` | Tool list, ordering, domain blocking |
| Input history | `chrome.storage.local` | Auto-deduplicated |
| Cross-restart messages | `chrome.storage.session` | SW restart recovery, background task persistence |

### IndexedDB Database Design

`ai-helper-db` (v4), seven object stores:

| Store | Purpose |
| --- | --- |
| `sessions` | Active sessions (index: updatedAt) |
| `activeSession` | Current active session ID |
| `archivedSessions` | Archived sessions (index: createdAt) |
| `uiPrototypes` | UI prototypes (index: createdAt, sessionId) |
| `tokenStats` | Token usage stats (index: timestamp, sessionId) |
| `reactCheckpoints` | ReAct Checkpoints (7-day TTL auto-expiry) |
| `bookmarks` | Message bookmarks (index: sessionId, pinned, createdAt) |

Supports automatic recovery from transaction failures and auto-migration from legacy `chrome.storage.local`.

---

## Config Import / Export

The options page supports exporting the entire configuration to a file, or importing from a file, making it easy to sync or back up across devices.
