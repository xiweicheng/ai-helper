> ← Back to [README](../../README.md) · [中文文档](../zh/DOCUMENTATION.md)

# AI Helper — Full Documentation

Complete technical reference for AI Helper: architecture, all 31 feature areas, the 40+ built-in tools, the optional Agent service, configuration options, state management design, and the FAQ.

For a quick overview of what AI Helper can do and how to install it, head back to the [README](../../README.md).

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Core Data Flow](#core-data-flow)
- [Project Structure](#project-structure)
- [Core Features](#core-features)
- [Built-in Tools](#built-in-tools-40-configurable--mcp-dynamic-extensions)
- [Tech Stack](#tech-stack)
- [Agent Service](#agent-service)
- [Getting Started](#getting-started)
- [Configuration Reference](#configuration-reference)
- [State Management Design](#state-management-design)
- [FAQ](#faq)

---

## Architecture Overview

The project uses a **five-layer architecture**, communicating via Chrome Extension API messaging channels:

```
┌──────────────────────────────────────────────────────────────┐
│                   Side Panel (UI Layer)                       │
│  side_panel.html + src/side_panel/*.js                        │
│  Chat Management | Multi-session Tabs | Markdown/Mermaid      │
│  Prompt Management | Selection Query | Input History          │
│  Execution Logs | Clarification/Confirmation Dialogs          │
│  UI Prototype Preview | Quality Assessment | Message TOC      │
│  Multi-Agent Manager | Token Stats | Agent Selector           │
│  Image Recognition Input | Image Annotation | File Upload     │
│  Session Export/Import | Skill Selector | MCP Service Selector│
│  Chat Export (Word/PDF) | Checkpoint Resume | Message Copy    │
│  Workspace Management | File Preview | Message Search         │
│  Message Bookmarks | @ Web Page Selector                      │
│  Context Usage Indicator | Completion Feedback | Notifications│
└──────────────┬──────────────────────────────┬────────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│  Background Service       │    │    Options Page (Config)      │
│  Worker (Core Logic)      │    │  options.html + src/options/  │
│                          │    │  API Key/Model/Tools/ReAct    │
│  src/background/          │    │  Reflection/Toolbar/Knowledge │
│  ├── index.js (router)    │    │  Agent Pairing Management     │
│  ├── react-loop.js (ReAct)│    │  Toolbox (MCP + Skill Mgmt)  │
│  ├── react-reflection.js  │    └──────────────────────────────┘
│  ├── context-summarizer.js│
│  ├── context-compactor.js │    ┌──────────────────────────────┐
│  ├── tool-executor.js     │    │    Agent Service (Optional)    │
│  ├── tool-preselector.js  │    │  agent/ (Node.js Process)     │
│  ├── notifier.js          │    │  HTTP REST + WebSocket        │
│  ├── scheduler.js         │    │  File R/W | Cmd Exec | Search │
│  ├── local-agent-client.js│    │  Skill System                 │
│  ├── config.js            │    │  MCP Protocol Extensions      │
│  ├── state.js             │    │  Local RAG Knowledge Base     │
│  ├── agent-dispatcher.js  │    │  Path Sandbox | Security      │
│  ├── stream-controller.js │    │  File Upload API              │
│  ├── token-recorder.js    │    └──────────────────────────────┘
│  └── constants.js         │
└──────────────┬─────────────┘
               │
               │  chrome.tabs.sendMessage
               ▼
┌──────────────────────────────────────────────────────────────┐
│           Content Script (Page Tool Execution)                │
│  src/content/*.js (injected into web pages)                   │
│  ├── index.js (message routing, page tools)                   │
│  ├── page-tools.js (content extraction, a11y tree, Markdown)  │
│  ├── page-interaction.js (interactive element query)          │
│  ├── interaction-tools.js (interaction, TTS, eyedropper)      │
│  ├── advanced-tools.js (video, perf audit, Shadow DOM, screenshot)│
│  ├── shadow-dom-utils.js (Shadow DOM + iframe penetration)    │
│  └── selection-toolbar.js (selection floating toolbar)        │
└──────────────────────────────────────────────────────────────┘
               │
               ▼
┌──────────────────────────────────────────────────────────────┐
│           Offscreen Document (Auxiliary Layer)                 │
│  src/offscreen/ (Clipboard Operations)                        │
│  │   ├── offscreen.html + offscreen.js (clipboard MV3-compatible implementation)      │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Storage (Persistence)                       │
│  src/storage/                                                 │
│  ├── db.js (IndexedDB wrapper, transaction retry, auto-migration)│
│  ├── session-store.js (Session Storage Adapter)               │
│  └── token-store.js (Token Stats Storage)                     │
└──────────────────────────────────────────────────────────────┘
```

### Core Data Flow

```
User Input → Side Panel (Agent Selection, optional image/file, optional Skill/MCP)
  → chrome.runtime.sendMessage('CALL_API')
    → Background: MCP Tool Injection → Tool Preselection → ReAct Loop
      → Token Budget Management → Context Pressure Monitoring → Token Stats
      → LLM API Call (OpenAI Compatible, retry & exponential backoff, streaming + DeepSeek thinking)
        → If tool needed: Confirmation Check (sensitive ops) → Execute Tool
          ├── Background (Tab management, bookmarks, etc.)
          ├── Content Script (Page interaction, content extraction, etc.)
          ├── Local Agent (File R/W, command exec, MCP tools, etc.)
          └── Offscreen Document (Clipboard R/W)
        → Tool Reflection → Result Cache → Feed back to LLM
      → Task Decomposition & Parallel Execution (plan_task, sub-agent dispatch)
      → Post Reflection: Multi-dimensional Quality Assessment → Pass/Revise/Retry
    → chrome.runtime.sendMessage('API_COMPLETE')
  → Side Panel: Markdown, Mermaid, Quality Display, Token Stats Update
  → Desktop Notification (when the side panel is not visible) + completion sound/confetti
```

---

## Project Structure

```
ai-helper/
├── agent/                               # Agent Service (Node.js Standalone)
│   ├── bin/agent.js                     # CLI startup script
│   ├── publish.sh                        # NPM publish script
│   ├── PUBLISH.md                        # Publishing docs
│   ├── src/
│   │   ├── server.js                    # HTTP + WebSocket server
│   │   ├── executor.js                  # Command execution engine (stream/block)
│   │   ├── process-tree.js              # Process tree management (full-chain cleanup)
│   │   ├── security.js                  # Path sandbox + command security tiers
│   │   ├── config.js                    # Agent config (disk persistence)
│   │   ├── auth.js                      # Pairing auth (6-digit dynamic code)
│   │   ├── search.js                    # File/content search (fd/rg acceleration)
│   │   ├── logger.js                    # Structured logging
│   │   ├── trash.js                     # File trash bin (soft delete + 7-day cleanup)
│   │   ├── i18n.js / sys-lang.js        # Agent i18n & system language detection
│   │   ├── locales/                     # Agent-localized messages
│   │   ├── rag/                         # Local knowledge base (RAG)
│   │   │   ├── routes.js               # RAG API routes
│   │   │   ├── manager.js              # Collection CRUD & enable/disable
│   │   │   ├── install.js              # Dependency check/install/auto-recovery
│   │   │   ├── searcher.js             # Vector + keyword hybrid search
│   │   │   ├── document/ / embedding/ / store/  # Parsing / Embedding / Storage
│   │   │   └── url-guard.js / errors.js / probe-child.mjs
│   │   ├── skill/                       # Skill System
│   │   │   ├── loader.js               # Skill loader (JSON/YAML/SKILL.md)
│   │   │   ├── registry.js             # Skill registry
│   │   │   ├── executor.js             # Workflow Skill executor
│   │   │   ├── markdown-loader.js      # Agent Skill loader (SKILL.md)
│   │   │   └── template.js             # Skill templates
│   │   └── mcp/                         # MCP Protocol Support
│   │       ├── client.js               # MCP Client (JSON-RPC 2.0)
│   │       ├── registry.js             # MCP Server registry
│   │       ├── transport.js            # Stdio transport
│   │       └── mcp-config.js           # MCP configuration
│   └── package.json
├── icons/                               # Extension icons
│   ├── icon16.png / icon48.png / icon128.png
│   └── README.md
├── libs/                                # Third-party deps (CDN/local)
│   ├── marked.min.js                    # Markdown rendering engine
│   ├── mermaid.min.js                   # Mermaid diagram engine
│   ├── qrcode.min.js                    # QR code generation
│   ├── pdf.worker.min.js               # PDF.js Worker (PDF extraction)
│   ├── html2canvas.min.js              # HTML canvas capture (PDF export)
│   ├── jspdf.min.js                     # jsPDF generation
│   └── github-markdown-light.min.css    # GitHub-style Markdown CSS
├── scripts/                             # Build & tooling scripts
│   ├── fix-build.js                     # Fix @crxjs/vite-plugin build artifacts
│   ├── silent-build.js                  # Silent build (CI-friendly, only outputs on failure)
│   ├── generate-icons.js                # Icon generation script
│   ├── deploy-pages.sh                  # Pages deployment script
│   ├── push-all.sh                      # One-click push to all remotes
│   ├── sync-wiki-to-gitee.sh            # Sync GitHub Wiki to Gitee
│   ├── auto-record.py                   # Demo video auto-recording
│   ├── gen-competition-pdf.py           # Competition doc PDF generation
│   └── gen-portfolio-pdf.py             # Portfolio PDF generation
├── styles/
│   └── styles.css                       # Content Script floating box styles
├── src/                                 # Extension source code
│   ├── background/                      # Background Service Worker
│   │   ├── index.js                     # Entry: message routing, session mgmt, agent health
│   │   ├── react-loop.js               # ReAct inference loop (core, with 3-tier reflection)
│   │   ├── react-reflection.js         # 3-tier reflection (post / tool-level / sub-task)
│   │   ├── context-summarizer.js       # Incremental context summarization (long chats)
│   │   ├── context-compactor.js        # Manual context compaction (history digest)
│   │   ├── tool-executor.js            # Tool registration, execution dispatch, MCP injection
│   │   ├── tool-preselector.js         # Tool preselection (lightweight API pre-filter)
│   │   ├── tool-helpers.js             # Shared tool helpers (download, screenshot, etc.)
│   │   ├── tool-debugger.js            # CDP debug bridge (debug_page executor)
│   │   ├── tool-memory.js              # Long-term memory tool handler
│   │   ├── tool-screenshot.js          # Screenshot tool handler
│   │   ├── notifier.js                 # Desktop notification center (multi-instance dedup)
│   │   ├── panel-visibility.js         # Panel visibility decision for notifications
│   │   ├── scheduler.js                # Scheduled task engine (Cron / interval / one-time)
│   │   ├── scheduler-rules.js          # Schedule rule parsing & next-run calculation
│   │   ├── detach-window.js            # Detached window (popup) state restore
│   │   ├── local-agent-client.js       # Agent HTTP/WebSocket communication
│   │   ├── agent-dispatcher.js         # Sub-task dispatch for agents
│   │   ├── stream-controller.js        # Stream response controller
│   │   ├── token-recorder.js           # Token usage stats recorder
│   │   ├── config.js                    # Config R/W
│   │   ├── constants.js                # Defaults, 40+ built-in tools, category mapping
│   │   ├── state.js                    # Multi-session cancel control, API counter
│   │   └── tools/                       # Tool definitions by category
│   │       ├── browser-tools.js        │ Page interaction + Form + Content (15)
│   │       ├── tab-tools.js            │ Tab mgmt + Bookmarks/History (3)
│   │       ├── storage-tools.js        │ Storage mgmt + Network (4)
│   │       ├── media-tools.js          │ Media output + Debug/Dev (7)
│   │       ├── ai-tools.js             │ AI Collaboration + Debug/Dev (6)
│   │       ├── agent-tools.js          │ Local Agent + AI Collaboration (7)
│   │       ├── debugger-tools.js       │ CDP debug tool definitions (debug_page)
│   │       ├── rag-tools.js            │ Knowledge base tools (knowledge_*)
│   │       └── memory-tools.js         │ Long-term Memory (1)
│   ├── content/                         │ Page-injected scripts
│   │   ├── index.js                     # Entry: message routing dispatch
│   │   ├── page-tools.js               # Page content tools (extraction, search, a11y tree)
│   │   ├── page-extract.js             # Page extraction toolkit (8 exported functions)
│   │   ├── page-interaction.js         # Interactive element query (query_interactive_elements)
│   │   ├── page-utils.js               # Page utility functions
│   │   ├── interaction-tools.js        # Interaction tools (click, fill, TTS, etc.)
│   │   ├── advanced-tools.js           # Advanced tools (video, perf, Shadow DOM, etc.)
│   │   ├── shadow-dom-utils.js         # Shadow DOM recursive penetration + same-origin iframe
│   │   ├── selection-toolbar.js        # Selection floating toolbar
│   │   └── selection-toolbar-styles.js # Selection floating toolbar styles
│   ├── offscreen/                       # Offscreen Document (clipboard ops)
│   │   ├── offscreen.html              # Offscreen page
│   │   └── offscreen.js                # Clipboard API bridge
│   ├── side_panel/                      # Side Panel UI
│   │   ├── index.js                     # Entry: event binding, config, keyboard shortcuts
│   │   ├── chat-manager.js             # Chat management (send/receive, logs, export/import)
│   │   ├── chat-streaming.js           # Streaming output (STREAM_START/CHUNK/DONE)
│   │   ├── chat-panels.js              # Execution log panel + reflection display
│   │   ├── chat-resume.js              # Checkpoint resume
│   │   ├── chat-export.js              # Chat export (Word/PDF/image)
│   │   ├── chat-copy.js                # Message copy
│   │   ├── markdown-render.js          # Markdown/Mermaid rendering & interaction
│   │   ├── tool-panel.js               # Tool selection popup (category filter, search)
│   │   ├── prompt-manager.js           # Prompt management (CRUD, quick select, drag sort)
│   │   ├── agent-manager.js            # Multi-agent management UI
│   │   ├── agent-store.js              # Agent data persistence
│   │   ├── agent-at-selector.js        # Agent @ selector (agent tab + page tab)
│   │   ├── page-selector.js            # @ page selector (inject current tab context)
│   │   ├── token-stats-panel.js        # Token statistics panel
│   │   ├── session-manager.js          # Multi-session storage API
│   │   ├── session-manager-ui.js       # Session tabs UI (switch, rename, archive)
│   │   ├── clarify-dialog.js           # Clarification dialog (countdown, audio alert)
│   │   ├── confirm-dialog.js           # Sensitive operation confirmation dialog
│   │   ├── ui-prototype.js             # UI prototype preview & management
│   │   ├── message-toc.js              # Message table of contents (auto-nav)
│   │   ├── input-history.js            # Input history (arrow key recall)
│   │   ├── image-preview.js            # Image preview, compression, multi-switch, annotation
│   │   ├── image-helpers.js            # Image visibility detection, thumbnails, screenshot btn
│   │   ├── file-extract.js             # File extraction (PDF/Word/Excel/Text), Agent upload
│   │   ├── skill-selector.js           # Skill/MCP service quick selector
│   │   ├── export-import.js            # Session export/import (batch select, format validate)
│   │   ├── execution-log-render.js     # Execution log rendering (task groups, real-time)
│   │   ├── log-summary-adaptive.js     # Log summary area adaptive degradation
│   │   ├── workspace-manager.js        # Workspace data mgmt (cache, icons, formatting)
│   │   ├── workspace-panel.js          # Workspace UI panel (tree, preview, upload)
│   │   ├── bookmark-manager.js         # Bookmark data mgmt (IndexedDB)
│   │   ├── bookmark-panel.js           # Bookmark UI panel (search, grouped view)
│   │   ├── search-panel.js             # Message search UI (full-text, dual-mode)
│   │   ├── schedule-panel.js           # Scheduled task panel (create/edit/history)
│   │   ├── version-info.js             # Version info dialog (version/tag/commit)
│   │   ├── context-indicator.js        # Context usage indicator + manual compaction entry
│   │   ├── completion-feedback.js      # Completion feedback (sound/confetti/notification)
│   │   ├── provider-selector.js        # Provider/model selector (search filter + sort)
│   │   ├── toolbar-adapt.js            # Input toolbar adaptive degradation
│   │   ├── icons.js                     # Shared SVG icon constants
│   │   ├── state.js                     # Global state management (Proxy dual-export)
│   │   ├── utils.js                     # Utilities (Toast, system prompt builder, etc.)
│   │   └── constants.js                # Temperature presets, tool category names
│   ├── options/                         # Extension options page
│   │   ├── index.js                     # Entry: tab switching, form events, agent pairing
│   │   ├── config-manager.js           # Config R/W management
│   │   ├── config-io.js                # Config import/export
│   │   ├── save-bar.js                 # Save bar (sticky at bottom on overflow)
│   │   ├── profile-manager.js          # Provider profiles (new/copy/rename/switch)
│   │   ├── model-fetcher.js            # Model list auto-fetch
│   │   ├── knowledge-panel.js          # Knowledge base panel (create/import/disable)
│   │   ├── toolbar-config.js           # Toolbar config (drag sort, domain blocklist)
│   │   ├── toolbox-config.js           # Toolbox config entry
│   │   ├── toolbox-shared.js           # Toolbox shared state & helpers
│   │   ├── toolbox-mcp.js              # MCP server management (CRUD, connect, env vars)
│   │   ├── toolbox-skills.js           # Skill management (categories, import, editor)
│   │   ├── toolbox-rag.js              # Knowledge base dependency install & status
│   │   └── constants.js                # Default system prompts and config constants
│   ├── storage/                         # IndexedDB persistence layer
│   │   ├── db.js                        # IndexedDB wrapper (transaction retry, auto-migration)
│   │   ├── session-store.js            # Session storage adapter
│   │   └── token-store.js              # Token stats storage
│   ├── config/
│   │   └── constants.js                # Storage keys, message types, etc.
│   └── shared/                          # Shared modules
│       ├── tools.js                     # Tool categories, temperature presets
│       ├── utils.js                     # Shared utility functions (makeResult, etc.)
│       ├── token-counter.js            # Token counting, budget mgmt, context compression, summaries
│       ├── context-usage.js            # Context usage calc (same source as actual sending)
│       ├── compaction-prompt.js        # Manual compaction summary prompt template
│       ├── model-profiles.js           # Provider profiles data model & migration
│       ├── i18n.js                     # Lightweight i18n (zh/en)
│       ├── logger.js                    # Unified logging module
│       └── agent-defaults.js           # Built-in agent definitions and templates
├── manifest.json                        # Chrome extension config
├── side_panel.html                      # Side panel HTML
├── options.html                         # Options page HTML
├── vite.config.js                       # Vite build config
├── package.json
└── README.md
```

---

## Core Features

### 1. Multimodal Input

#### Image Recognition Input
Attach images in conversations for multimodal understanding via Vision API (OpenAI-compatible):

- **Image Compression**: Auto-compresses large images (1024px + JPEG 65%), reducing token consumption
- **Independent API Config**: Optional separate API Base / API Key / Model for Vision
- **Global Toggle**: Enable/disable image input at any time
- **Multi-Image Upload**: Attach multiple images for comparative analysis

#### File Upload Q&A
Upload and extract file content directly in the browser — no Agent service required:

- **Supported Formats**:

| Format | Extraction Engine | Notes |
|--------|-------------------|-------|
| PDF | PDF.js (pdfjs-dist) | Full text extraction, multi-page |
| Word (.docx) | mammoth.js | Rich text → plain text |
| Excel (.xlsx/.xls) | SheetJS (xlsx) | Multi-sheet CSV export |
| Plain Text | FileReader API | 50+ extensions auto-detected |

- **Agent-Preferred Upload**: When connected to Agent, automatically uploads to working directory for direct file manipulation
- **Browser Fallback**: When Agent is unavailable, switches to browser-side extraction
- **File Preview Bar**: Shows filename, size, extraction status, supports deletion

#### Image Annotation Editor
A complete in-browser image annotation toolkit, edit images directly in preview before sending:

- **6 Annotation Tools**: Brush (B), Rectangle (R), Ellipse (E), Arrow (A), Line (L), Eraser
- **Adjustable**: Color, thickness, opacity
- **Undo Support** (up to 20 steps, Ctrl+Z)
- **Keyboard Shortcuts**: Enter to confirm, Esc to cancel
- **Auto-update**: Annotation results immediately synced to attachment list

### 2. Multi-Agent Management

Create and manage multiple custom AI agents, each with independent system prompts and tool permissions:

- **Built-in Templates**: Default Assistant, Code Review Expert, Web Automation Assistant, Data Analyst, Documentation Writer
- **Custom Agents**: Create specialized agents with custom icons, names, system prompts, models, temperatures, and tool permissions
- **Agent Selector**: Quick switching at the top of the side panel, with `@AgentName` quick-switch syntax
- **Tool Filtering**: Each agent can have its own toolset to avoid context bloat
- **Sub-task Dispatch**: `dispatch_task` supports parallel dispatch, sub-agents execute independently and return results
- **Agent Persistence**: Based on `chrome.storage.local`, persists across restarts

### 3. ReAct Inference Loop

The project uses the ReAct (Reasoning + Acting) pattern as its core inference engine:

1. **MCP Tool Dynamic Injection**: Before each inference cycle, automatically pulls the latest MCP tool list from Agent and injects it into RAW_TOOLS
2. **Tool Preselection**: Before the main model call, a lightweight API pre-check determines which tools are needed, reducing 40+ built-in tools to 5-10 relevant ones, significantly cutting token usage. Simple questions can be answered directly, skipping the inference loop
3. **Inference Loop**: LLM thinks → decides to call tools → executes tools → results fed back → continues reasoning
4. **Token Budget Management**: Dynamically calculates available token budget per model context window (80%), truncates by token count, retains tool_calls/tool message pairing integrity
5. **Context Pressure Monitoring**: Three-level monitoring (safe/warning/critical), auto-triggers summary compression
6. **Context Smart Compression**: Long quoted content is automatically summarized and compressed, preventing permanent context occupation
7. **Tool Result Cache**: Parallel tool results are auto-cached (30 entry limit)
8. **Parallel Tool Execution**: Tools marked as parallel in the same round are executed concurrently via `Promise.all`
9. **Task Decomposition**: `plan_task` supports sequential, parallel, and conditional execution strategies with retry/rollback/continue on failure
10. **Sub-task Dispatch**: `dispatch_task` delegates subtasks to other agents for parallel execution
11. **Streaming Response**: OpenAI streaming (SSE) with DeepSeek thinking support; replies render token-by-token in real time. Agent command output streams live as well
12. **Clarification Mechanism**: When info is incomplete, a clarification dialog pops up with auto-paused loop timer and suggested options
13. **Multi-Level Timeout Control**: API timeout 5min, tool timeout 10min, overall loop timeout 30min
14. **Cancel Control**: Users can cancel the inference loop at any time, isolated per session
15. **SW Restart Recovery**: Keepalive ports monitor Service Worker silent restarts, auto-notifying Side Panel to recover. Background task state persisted to `chrome.storage.session`
16. **Checkpoint**: A checkpoint is auto-saved after each inference round, supporting resume after interruption

### 4. Reflection System (Multi-Tier Quality Assurance)

| Level | Description | Trigger Condition |
|-------|-------------|-------------------|
| **Tool-Level** | Quick assessment of tool result usefulness post-execution | Tool returns error / empty result / oversized result (>50000 chars) / 3 consecutive failures |
| **Sub-task Reflection** | Evaluates sub-task result completeness and relevance | Only complex-marked sub-tasks (configurable) |
| **Post-Reflection** | Final answer 7-dimension quality scoring | Auto-executes after each inference cycle |

Post-reflection scoring dimensions: Completeness, Accuracy, Relevance, Tool Usage, Clarity, Safety, Efficiency. Based on score threshold, decides to: pass (≥7), revise (5-7), or re-execute (<5).

### 5. Context Compression & Token Budget Management

Smart context management strategy:

- **Context Usage Indicator**: Shows usage percentage below the input box in real time (ring progress + safe/warning/critical coloring); click for a breakdown of system prompt, tool definitions, message history, and current input
- **Manual Context Compaction**: One-click compaction of history into an AI-structured summary (session-persisted, undoable before sending; a later compaction merges the old summary with new messages)
- **Adaptive Token Estimation**: Chinese ~1.5 chars/token, English ~4 chars/token
- **Auto Context Window Detection**: Infers context window from model name (custom mappings supported, 256K by default)
- **Message Budget = Context Window - System Prompt - Tool Definitions - Output Reserve**
- **Three-Level Context Pressure**: safe / warning / critical
- **Message Summaries**: When pressure reaches critical, early messages are auto-summarized, replacing original content
- **Quote Compression**: Long quoted/selected content auto-compressed to summaries
- **Token-Level Truncation**: 70% beginning + 30% end + truncation marker

### 6. Token Statistics Panel

- **Real-time Stats**: Token consumption updated after each API call
- **Session Stats**: Current session cumulative, average per round
- **Daily Stats**: Today's cumulative, call count
- **History**: Last 7 days of token usage

### 7. Skill System

Two skill types covering deterministic automation and AI autonomous invocation:

- **Workflow Skill**: JSON/YAML-defined deterministic workflows with parameter validation and result display
- **Agent Skill**: SKILL.md-based AI capability extensions, AI autonomously invokes in conversations
- **Built-in Skill**: `skill-creator` meta-skill for creating new skills from conversations
- **Quick Selector**: "Skills" tab in the input dropdown for quick search and selection
- **Import Methods**: JSON file upload, direct Markdown writing, Zip packages (with resources), URL download
- **Skill Editor**: Visual SKILL.md editing with description, version, and resource management
- **Global Toggle**: One-click enable/disable all Skills in the options Toolbox

### 8. MCP Protocol Extension

Model Context Protocol (MCP) support for dynamically extending third-party tool capabilities:

- **MCP Tool Dynamic Injection**: Before each inference cycle, auto-pulls latest MCP tools from Agent and injects them
- **MCP Client**: JSON-RPC 2.0 communication with stdio transport
- **MCP Server Management**: Visual configuration, connection, disconnection in options "Toolbox" tab
- **Environment Variables**: Per-server independent env vars, sensitive values with password input
- **Multi-Server Support**: Connect multiple MCP Servers simultaneously, tools auto-merged and grouped by server
- **Global Toggle**: One-click enable/disable all MCP services
- **Quick Selector**: "MCP" tab in the input dropdown for quick MCP service selection

### 9. Multi-Session Management

- **Tab Switching**: Horizontal tab bar, auto-restores message history, model, tools, and temperature
- **Session Creation**: One-click creation, auto-generated title (from first user message)
- **Session Rename/Delete**: Right-click context menu
- **Session Archive/Restore**: Up to 20 archived, restorable anytime
- **Cross-Session Message Delivery**: Background task results auto-appended to original session
- **Persistent Storage**: Based on IndexedDB, auto-migrates from legacy `chrome.storage.local`
- **Session Export/Import**: Batch select export as `.aihelper.json`, compatible with new/legacy format import

### 10. Session Export/Import

- **Batch Export**: Dialog with multi-select, select all/deselect/current only
- **Export Format**: `.aihelper.json`, includes full message history, execution logs, reflection scores, HTML content, agent config
- **Import Compatibility**: Supports new `.aihelper.json` format and legacy message array format
- **Smart Filenames**: Single session named by session title, multi-session named by count + timestamp

### 11. Side Panel Chat

- **Natural Language Conversation**: OpenAI-compatible API, default DeepSeek V4 Pro
- **Model Switching**: Built-in DeepSeek models, custom model add/remove with context window mapping
- **Temperature Control**: 4 presets (Precision 0.2 / Daily 0.45 / Divergent 0.65 / Creative 0.9) with continuous fine-tuning
- **Memory Limit**: Configurable history message count sent to LLM
- **Isolated Chat**: Standalone Q&A mode without historical context
- **Selection Query**: Select text in side panel to show quick action menu
- **Prompt System**: Custom prompts CRUD, `/` quick select, drag-to-reorder
- **Input History**: Arrow key recall, auto-dedup management
- **System Prompt**: Auto-injects environment info (Chrome extension, OS, agent platform), enforces task planning rules
- **Question List Navigation**: Hover the bottom message jump hotzone to expand a question list for quickly locating historical questions

### 12. Markdown & Mermaid Rendering

- Full Markdown support: code blocks (with line numbers, copy button, language tag), tables (export Excel/copy Markdown), quotes, lists
- **Three-Phase Placeholder Strategy**: Mermaid → Code blocks → Tables extracted as placeholders sequentially, restored after rendering
- Mermaid diagrams: flowcharts, sequence diagrams, Gantt charts, etc. Zoom (Ctrl+scroll), drag-pan, download PNG, copy to clipboard, view source
- **Table Cell Inline Markdown**: Supports bold, italic, code, strikethrough

### 13. UI Prototype Preview System

- **Inline Preview**: iframe `srcdoc` rendering, auto-detects complete docs vs fragments
- **Zoom Control**: 0.25x-2.0x, Ctrl+scroll / Ctrl+0 to reset
- **Prototype Library**: Save to IndexedDB, supports open/edit/delete
- **Export**: Download as .html or open in new tab
- **Continue Optimization**: One-click fills optimization instructions into input

### 14. Message Operations

| Operation | Description |
|-----------|-------------|
| Copy Message | Copy raw Markdown content |
| Edit & Resend | Refill message into input box |
| Quote Follow-up | Set assistant message as quoted context (auto-compressed) |
| Export Word | Markdown → styled .doc download |
| Export PDF | Browser print window export |
| Export JSON | Full conversation history (with execution logs) JSON download |

### 15. Selection Floating Toolbar

Auto-appears with frosted-glass style when text is selected on any webpage:

- **AI Search**: Opens side panel and initiates search
- **Quick Actions**: Explain, Translate, Summarize
- **Custom Tools**: Add custom prompt tools with drag-to-reorder
- **Follow-up Input**: Inline input box for direct follow-up
- **Result Panel**: Draggable, resizable floating panel with Markdown rendering and lock feature
- **Suggested Follow-ups**: Auto-generated follow-up buttons in AI responses
- **Configuration**: Icon-only mode, visible count, domain blocklist, temporary hide

### 16. Execution Log Panel

- **Real-time Mode**: Live updates during inference with pulse animation
- **Static Mode**: Complete execution timeline displayed on completion
- **Task Group Visualization**: Complex tasks grouped by task groups, with collapse/expand
- **Node Details**: Tool name, status, duration, input params, output content, API request details
- **Summary Stats**: Total nodes, success/failure count, sub-task progress
- **Status Filtering**: Filter by success/failure/sub-task
- **Single Expand**: Click title to expand/collapse individual details

### 17. Quality Assessment Display

Post-reflection result visualization:

- **Overall Score**: 0-10, color-coded (green/yellow/red) + emoji
- **7-Dimension Radar**: Per-dimension progress bar
- **Issue Discovery**: Specific issues and improvement suggestions
- **Evaluation Process**: Round count, decision, reasoning details

### 18. Message Table of Contents (TOC)

Hover over assistant messages to auto-generate floating navigation:

- Auto-extracts H1-H6 headings
- Floating panel, smooth scroll to target
- 1.5s highlight flash effect

### 19. Long-term Memory System

AI Helper has long-term memory capabilities, storing and retrieving user information across sessions:

- **Memory Storage**: AI automatically identifies important information (preferences, knowledge, decisions) and calls `agent_memory` to store it
- **Memory Types**: Supports fact memory and conversation summary memory
- **Smart Retrieval**: Use `agent_memory` to search historical memories by keywords, tags, and type
- **Memory Management**: Auto-review memory quality, merge duplicates, evict low-value memories
- **Tag Classification**: Preference, knowledge, decision, and custom tag categories
- **Importance Scoring**: 1-10 scale for priority sorting
- **Auto-Archival**: Facts capped at 50, summaries at 20, exceeding triggers auto-compaction

### 20. ReAct Checkpoint Resume

Automatically saves checkpoints during task execution, supporting one-click recovery after interruption:

- **Auto-save**: Checkpoint automatically saved to IndexedDB after each ReAct inference cycle
- **SW Restart Recovery**: Service Worker silent restart recovery via `chrome.storage.session`
- **Manual Resume**: Interrupted task message cards show a "Continue" button, with optional description to resume
- **Streaming Output Preservation**: Streaming output after recovery is fully saved to message history, persists across page refreshes
- **TTL Auto-expiry**: Checkpoints auto-clean after 7 days to prevent data accumulation
- **Multi-connection Management**: IndexedDB supports safe close & rebuild for SW + Side Panel dual connections

### 21. @ Web Page Tab Selector

Input `@` to open a selector with a "Web Pages" tab for quickly selecting current browser tabs as conversation context:

- **Tab List**: Lists all open tabs in the current window, showing favicon, title, and URL
- **Current Page Marker**: Highlights the currently active tab
- **Keyword Filter**: Quick filter by title/URL
- **Context Injection**: Automatically injects page content as conversation context after selection
- **Dynamic Count Display**: Tab titles show option count in real-time (e.g., "Assistants (5)" "Pages (12)")

### 22. Shadow DOM Deep Penetration

Supports recursive penetration of Shadow DOM and same-origin iframes for element lookup and manipulation:

- **Recursive Penetration**: `deepQuerySelector` / `deepQuerySelectorAll` can penetrate multiple Shadow DOM layers (max depth 5)
- **iframe Support**: Automatically enters same-origin iframes for lookup
- **Visibility Detection**: Strict visibility judgment (display/visibility/opacity/dimensions)
- **React Component Support**: `keyboard_input` bypasses React synthetic event system, `fill_form` supports contenteditable/prosemirror rich text editors

### 23. Workspace Management

After connecting to the agent service, you can directly browse and manage the local file system in the sidebar:

- **Directory Tree Navigation**: Breadcrumb navigation, go up, click to expand directories, sort by name/size/modified time
- **Multi-select Operations**: Checkbox batch selection, select all/deselect all, batch download ZIP, batch delete
- **Drag & Drop Move**: Drag files/directories to target paths within the panel, drag to breadcrumb for quick move
- **Keyboard Navigation**: ↑↓ navigate, Enter open, Space select, Delete delete, F2 rename, Esc cancel
- **Directory Cache**: LRU cache for last 20 directories (30s TTL), avoids duplicate requests
- **Agent Switch Aware**: Auto-resets cache and refreshes when Agent connection state changes
- **File-based Q&A**: After selecting files, one-click to attach file paths as context to chat input
- **Upload**: Button select and drag & drop upload, streaming HTTP upload (up to 3 concurrent), with progress panel and cancel
- **Download**: Streaming download with progress bar, cancel support, directories auto-pack to ZIP
- **Virtual Scrolling**: Auto-enabled when file items exceed 200, only renders visible area, optimizes large directory performance

### 24. File Preview

Click files in the workspace to preview instantly without leaving the sidebar:

- **Text/Code**: Syntax-highlighted preview with line numbers (up to 1MB / 10000 lines)
- **PDF**: Built-in preview based on PDF.js, supports zoom, page flipping, fit page
- **Word (.docx)**: HTML preview based on mammoth.js conversion (up to 20MB)
- **Excel (.xlsx)**: Rendered as table via backend parsing, supports first 2000 rows
- **Images**: Built-in preview, wheel zoom + drag pan (up to 50MB)
- **File Details**: Click info button to show permissions (rwx + octal), UID/GID, MIME type, timestamps

### 25. Message Search

Built-in full-text message search in the sidebar for quickly locating historical conversations:

- **Dual-mode Search**: Global search (loads all sessions from IndexedDB) and current session search (fast query from memory)
- **Incremental Loading**: Searches current session first and displays immediately, then searches other sessions one by one, updating UI while searching
- **Advanced Syntax**: Supports `&` (AND) and `|` (OR) combination search, `&` has higher priority than `|`
- **Navigation & Positioning**: Click results to auto-switch to target session, scroll to message, 2-second highlight animation
- **Search History**: Up/down keys navigate history (up to 20 entries)
- **Search Term Highlighting**: Matching terms highlighted in preview, showing 30 characters of context before and after

### 26. Message Bookmarks

Important AI answers can be bookmarked with one click for quick review:

- **One-click Bookmark**: Click bookmark icon in message bottom action bar to bookmark/unbookmark
- **Pin Support**: Important bookmarks can be pinned to top of bookmark panel
- **Search Filter**: Supports AND/OR advanced search syntax for filtering bookmarked content
- **Grouped Display**: Grouped by current session and other sessions, matching terms highlighted
- **Quick Navigation**: Click bookmark entry to auto-jump to corresponding session message position
- **Auto-cleanup**: Orphaned bookmark records auto-removed when messages or sessions don't exist

### 27. File Trash Bin

Agent-side file deletion defaults to soft delete, moving to trash rather than physical deletion:

- **Soft Delete Protection**: Deleted files auto-moved to `~/.ai-helper-agent/.trash/` directory, original path and time recorded
- **7-day Retention**: Expired files auto-cleaned (opportunistic cleanup before each operation + periodic cleanup every 6 hours)
- **One-click Restore**: `agent_trash` tool can restore files to original path
- **Trash List**: View all trash entries via `agent_trash`
- **API Integration**: `/api/fs/delete` defaults to trash, `/api/trash/restore` and `/api/trash/list` provide restore and list endpoints

### 28. Agent Restart & Auto-update

Agent service supports online restart and one-click update without manual terminal operation:

- **Online Restart**: `/api/agent/restart` two-phase restart (spawn helper → wait for old process exit → start new process)
- **Auto-update**: `/api/agent/update` executes `npm install -g ai-helper-agent@latest` and auto-restarts (90s timeout protection)
- **Update Cooldown**: Disallows repeated restarts/updates within 10 seconds to prevent accidental concurrency
- **Failure Fallback**: Update failures don't rollback old process, returns manual installation guide

### 29. Context Incremental Summary

When conversation context tokens exceed budget, auto-generates summaries for old tool call rounds:

- **Round Extraction**: Auto-identifies complete tool call rounds (assistant tool_calls + all tool results)
- **LLM Summary Generation**: Calls lightweight API to summarize tool calls into a one-sentence Chinese summary
- **Fallback Strategy**: Falls back to deleting old messages directly if summary request fails
- **Batch Processing**: Supports processing multiple rounds within one token excess period

### 30. Scheduled Tasks

Create scheduled tasks that automatically run preset prompts at a specified time and write results into a bound host session:

- **Three Schedule Types**: One-time (after X minutes / at a specific time), interval (e.g. `30m` / `2h` / `1d`), and 5-field Cron expressions
- **Web-page Context**: Optionally bind a page URL as context, with "fetch content" or "URL only" modes
- **Host Session**: Results land in a bound host session; if that session is deleted, a dedicated session is auto-created on execution
- **Scheduling Engine**: Built on Chrome Alarms with automatic re-hydration after Service Worker restarts
- **Management Panel**: Create / edit / delete / enable / disable / run now
- **Run History**: Records each run's status, duration, and error (up to 50 entries), expandable in the panel
- **Desktop Notifications**: Runs in the background with no sound or other alert channels; per the "Scheduled Task Notification" toggle (on by default), pops a desktop notification on completion/failure; click the notification to open the side panel
- **Termination Conditions**: Interval tasks support "max runs" and "end time"
- **Run Now**: Triggers execution and auto-navigates to the host session, scrolling to the bottom to wait for the result

### 31. Desktop Notifications & Completion Feedback

Stay informed even when tasks run in the background (managed in Options → Basic → "Completion Feedback"):

- **Three Independent Toggles**: Task completion/failure notifications, scheduled task notifications, and interaction reminders (when AI needs confirmation or clarification) — all toggleable anytime in Options with immediate effect
- **Completion/Failure Notifications**: Only pop when the side panel is not visible (no interruption when visible); success notifications auto-dismiss, failure notifications stay until manually closed; click to open the side panel at the corresponding session
- **Scheduled Task Notifications**: Scheduled tasks run in the background with no other alert channels, so they always pop when the toggle is on (default on)
- **Interaction Reminders**: Pop a desktop reminder when the inference loop waits for sensitive-operation confirmation / clarification, preventing tasks from being stuck in a dialog unnoticed; no interruption when the side panel is visible
- **Multi-instance Dedup**: Tab-specific scope allows multiple side panel instances; notification creation is centralized in the Background (globally unique) and visibility is judged per "task-originating instance", never showing duplicates
- **Completion Sound & Confetti**: Distinct success/failure sounds and a success confetti animation, each independently toggleable

---

## Built-in Tools (40+ Configurable + MCP Dynamic Extensions)

### Content Extraction (6)
| Tool | Description |
|------|-------------|
| `page_content` | Get page content in multiple formats (text/html, supports cross-tab extraction) |
| `extract_data` | Extract structured data (table/links/forms/images/metadata, supports cross-tab) |
| `query_elements` | Extract interactive elements as a tree snapshot (recommended; returns stable ref ids for interact_element / fill_form — open overlays lifted to the top, paginate with page/hasMore, re-query after page changes, supports countOnly mode) |
| `search_in_page` | Regex search page text (with highlight support) |
| `iframe_content` | Get iframe content (same-origin, nested support) |
| `scroll_collect` | Scroll and collect long content (dedup aggregation) |

### Page Interaction (6)
| Tool | Description |
|------|-------------|
| `interact_element` | Page element interaction (click/hover/type input, supports ref/text/selector positioning, ref preferred) |
| `drag_drop` | Drag-and-drop operation (⚠️ experimental, may not work on most pages, use click instead) |
| `scroll_to` | Scroll to position/element/text (with alignment options) |
| `wait_element` | Wait for element appear/disappear (strict visibility check) |
| `wait_navigation` | Wait for page navigation (load/domcontentloaded/networkidle) |
| `handle_dialog` | Handle page dialogs (alert/confirm/prompt); pre-arm accept/dismiss before triggering an action |

### Form & Input (4)
| Tool | Description |
|------|-------------|
| `fill_form` | Batch form filling (fields accept ref/selector locating, supports rich text editor/contenteditable) |
| `keyboard_input` | Keyboard input (bypasses React controlled components) |
| `file_upload` | File upload (DataTransfer injection) |
| `select_dropdown` | Dropdown selection (native select + custom components, supports ref positioning) |

### Tab Management (2)
| Tool | Description |
|------|-------------|
| `manage_tab` | Tab management (open/switch/close/back/forward/reload operations) |
| `list_tabs` | Get all tab list |

### Bookmarks & History (1)
| Tool | Description |
|------|-------------|
| `search_browser_data` | Search browser bookmarks and history |

### Storage Management (3)
| Tool | Description |
|------|-------------|
| `manage_cookies` | Cookie management (CRUD, requires confirmation) |
| `manage_storage` | localStorage/sessionStorage management |
| `clear_data` | One-click clear site data (requires confirmation) |

### Network Request (1)
| Tool | Description |
|------|-------------|
| `fetch_url` | HTTP requests (timeout, retry, exponential backoff, AbortSignal cancellation) |

### Media & Output (5)
| Tool | Description |
|------|-------------|
| `capture_page` | Page screenshot (download/visual analysis/download+analysis three modes, viewport only) |
| `clipboard` | Clipboard operations (copy/paste/get page selection) |
| `qrcode` | Generate QR code (QRCode library + Canvas fallback) |
| `download_file` | Download files (requires confirmation) |
| `notify` | Desktop notifications |

### Debug & Dev (4)
| Tool | Description |
|------|-------------|
| `inject_css` | Inject CSS styles (global/scoped/inline) |
| `browser_info` | Get browser environment info |
| `highlight_text` | Highlight text on page |
| `debug_page` | Advanced page debugging over Chrome DevTools Protocol (attach → operate → detach): native input events, XHR/fetch interception, page-context evaluation, full-page screenshots, device emulation |

### AI Collaboration (7)
| Tool | Description |
|------|-------------|
| `clarify_question` | Show clarification dialog (suggestions, countdown, audio alert) |
| `plan_task` | Complex task decomposition planner (parallel/sequential/conditional) |
| `preview_ui` | UI prototype preview & management (preview/get actions) |
| `search_chats` | Search chat memory (current session / all history sessions) |
| `dispatch_task` | Dispatch subtasks to sub-agents (supports parallel dispatch) |
| `manage_agent` | Manage paired agents (query status, switch agent) |
| `exec_log` | Extract historical execution logs, analyze success paths and failure lessons |

### Agent (5) — Requires Agent Service
| Tool | Description |
|------|-------------|
| `agent_file` | File operations (read/write/list/delete/download, path sandbox) |
| `agent_trash` | Trash management (list/restore deleted files) |
| `agent_exec` | Execute terminal commands (black/gray/white-list three-tier security, force/timeout) |
| `agent_search` | Search files (by filename or content, fd/ripgrep accelerated) |
| `agent_skill` | Skill loading and execution (load/run actions) |

### Long-term Memory (1) — Requires Agent Service
| Tool | Description |
|------|-------------|
| `agent_memory` | Unified memory management. store=CRUD, recall=keyword search, manage=review & compact, distinguished by action parameter |

### Knowledge Base RAG (3) — Requires Agent Service with RAG enabled
> Dynamically registered only when the knowledge base is enabled in Options and the Agent-side RAG dependencies are available.

| Tool | Description |
|------|-------------|
| `knowledge_search` | Search knowledge base content (optionally scoped to a collectionId, or cross-collection; disabled collections are excluded from autonomous search) |
| `knowledge_ingest` | Ingest text / local files / URLs into a knowledge base (with metadata) |
| `knowledge_list` | List available knowledge bases and their document counts |

### MCP Tools (Dynamic Extension)
When connected to third-party MCP servers, tools are automatically registered. Quantity depends on connected MCP Servers.

### Sensitive Tool Security Confirmation

The following tool operations show a confirmation dialog before execution (30-second timeout auto-reject, can be globally disabled):

- `manage_tab` (close action), `download_file`, `manage_cookies`, `clear_data`
- `agent_file` (delete action), `agent_exec`

Agent command execution three-tier security:
1. **Blacklist** (always blocked): `rm -rf /`, `mkfs.*`, fork bombs, curl-to-shell pipes, etc.
2. **Graylist** (requires confirmation): `sudo`, `npm install -g`, `chmod -R 777`, `git push --force`, etc.
3. **Whitelist** (auto-allowed): Regular commands

---

## Tech Stack

| Technology | Description |
|------------|-------------|
| Vite + @crxjs/vite-plugin | Build toolchain, ES Modules, dev HMR |
| Manifest V3 | Latest Chrome extension protocol |
| Service Worker | Background process, API calls and tool execution |
| Side Panel API | Chrome 114+ side panel |
| Content Script | Page injection, DOM operations |
| Offscreen Document | MV3 clipboard operations compatibility layer |
| IndexedDB | Session/prototype/token stats/scheduled task persistence |
| chrome.storage.local | Config storage, agent definitions |
| chrome.storage.session | Cross-restart message recovery, background task persistence |
| chrome.notifications API | Desktop notifications (completion / scheduled / interaction) |
| chrome.alarms API | Scheduled task scheduling (auto re-hydration after SW restarts) |
| chrome.debugger API | CDP screenshot/PDF export/page debugging (debug_page) |
| OpenAI Compatible API | LLM calls (with Vision), default DeepSeek V4, streaming support |
| marked.js | Markdown rendering engine |
| mermaid.js | Diagram rendering engine |
| QRCode.js | QR code generation (Canvas fallback) |
| pdfjs-dist | PDF text extraction |
| mammoth.js | Word .docx text extraction |
| SheetJS (xlsx) | Excel .xlsx/.xls text extraction |
| Web Speech API | Text-to-speech |
| EyeDropper API | Color picker |
| Navigation/Performance API | Performance auditing |
| Node.js (Agent) | Local file/command service, skill system, MCP protocol |
| WebSocket (Agent) | Real-time command output streaming |
| MCP Protocol | Model Context Protocol, extending third-party tools |

---

## Agent Service

The extension can optionally pair with a Node.js agent service, providing file system, terminal command, Skill, MCP, and file upload capabilities beyond the browser sandbox.

### Agent Architecture

```
┌─────────────────────────────────┐
│   Chrome Extension (Background)  │
│   local-agent-client.js          │
│   HTTP REST + WebSocket          │
└──────────────┬──────────────────┘
               │ 127.0.0.1:18910
               ▼
┌─────────────────────────────────┐
│   ai-helper-agent (Node.js)      │
│   ├── HTTP API                   │
│   │   ├── /api/fs/* (File CRUD)   │
│   │   ├── /api/files/upload       │
│   │   ├── /api/exec (Cmd Exec)    │
│   │   ├── /api/status (Health)    │
│   │   ├── /api/pair (Pair Auth)   │
│   │   ├── /api/logs (Log Query)   │
│   │   ├── /api/shutdown (Graceful)│
│   │   ├── /api/skill/* (Skills)   │
│   │   ├── /api/mcp/* (MCP Mgmt)   │
│   │   └── /api/rag/* (Knowledge)  │
│   ├── WebSocket (Cmd Output Stream)│
│   ├── Skill System                  │
│   │   ├── Workflow Skill Executor   │
│   │   └── Agent Skill Loader        │
│   ├── MCP Protocol Extensions      │
│   │   ├── MCP Client Management    │
│   │   └── JSON-RPC 2.0             │
│   ├── Local RAG Knowledge Base     │
│   │   ├── Vector + Keyword Search  │
│   │   └── Dependency Auto-recovery │
│   └── Security Layer               │
│       ├── Bearer Token Auth         │
│       ├── Path Sandbox (realpath)   │
│       └── Cmd Black/Gray/White-list │
└─────────────────────────────────┘
```

### Agent Core Features

- **Rich CLI Commands**: Supports `start`/`stop`/`restart`/`status`/`paircode`/`config` commands, with `aha` quick alias
- **Background Daemon Mode**: `start --background` / `-b` background startup mode, terminal returns immediately, non-blocking
- **Process Management**: PID file management, process-tree tracking & retrieval (full-chain cleanup for commands), graceful shutdown, prevents duplicate startup
- **Pairing Auth**: 6-digit dynamic code + extensionId pairing, generates Bearer Token
- **Path Sandbox**: `realpathSync` resolves symlinks, prefix-matches whitelisted paths
- **Command Security**: Environment variable whitelist (~40 vars), `TERM=dumb` disables interactivity
- **Script Protection**: Written `.sh`/`.py`/`.js` etc. auto-strip execute permissions
- **Size Limits**: 10MB request body, 50MB per file
- **File Trash Bin**: Deleted files default to soft delete to `~/.ai-helper-agent/.trash/`, 7-day auto-cleanup, supports restore
- **Online Update**: Supports online restart and auto-update Agent via API (`/api/agent/restart`, `/api/agent/update`)
- **Multi-format Preview**: Server-side supports xlsx parsing preview, browser-side supports PDF/Word/image preview
- **Audit Logging**: Dual-channel output (terminal formatted + file JSON Lines), named by date, auto-cleanup 30 days
- **Multi-level Robustness Protection**: Request-level exception capture, URL parsing protection, global fallback, file I/O protection, process management protection
- **Fast Search**: fd (filename) + ripgrep (content) native acceleration, auto-falls back to Node.js implementation when unavailable
- **Local RAG Knowledge Base**: Dependency auto-check/install & startup auto-recovery; vector + keyword hybrid search (mixed Chinese/English keywords supported); disabled collections are excluded from autonomous search but remain available for @ manual reference
- **Concurrency Safety**: Disk write mutex, graceful shutdown prevents double-close
- **Config Caching**: mtime detection, avoids redundant disk reads

### Skill System (Agent-side)

| Type | Definition Format | Execution | Purpose |
|------|-------------------|-----------|---------|
| **Workflow Skill** | JSON/YAML | Direct execution | Automated workflows, step-by-step execution with conditional skipping |
| **Agent Skill** | SKILL.md | AI autonomous invocation | Knowledge distillation, triggered in conversation |

Import methods: JSON upload / Online Markdown writing / Zip packages (with resources) / URL download

### MCP Protocol (Agent-side)

- **MCP Client**: JSON-RPC 2.0 based, stdio transport
- **Auto Discovery**: Auto-fetches tool list on connection
- **Multi-Server**: Multiple servers simultaneously, tools auto-merged
- **Dynamic Injection**: Auto-syncs latest tool list before each inference cycle

### Starting the Agent

```bash
# Option 1: Global install (recommended)
npm install -g ai-helper-agent
ai-helper-agent start              # foreground start, real-time logs
ai-helper-agent start -b           # background daemon mode
aha start -b                        # quick alias: aha

# Option 2: Local development
cd agent
npm install
npm start
# Default listening on 127.0.0.1:18910
```

**Common Commands:**

| Command | Description |
|---------|-------------|
| `ai-helper-agent start` / `start -b` | Foreground / background start |
| `ai-helper-agent stop` | Stop running Agent |
| `ai-helper-agent restart` / `restart -b` | Restart service |
| `ai-helper-agent status` | Check running status |
| `ai-helper-agent paircode` | View pairing code |
| `ai-helper-agent config` | View current config |

Enter the pairing code shown in the terminal on the extension options page's "Agent" tab to complete connection.

---

## Getting Started

### Install (Recommended)

Download the latest auto-built package `ai-helper-*.zip` from [GitHub Releases](https://github.com/xiweicheng/ai-helper/releases/latest), extract it, then open `chrome://extensions/`, enable **Developer mode**, click **Load unpacked**, and select the extracted folder. (Alternatively, install from the Microsoft Edge Add-ons store.)

### Development Mode

```bash
npm install
npm run dev
```

In Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the project `dist` folder
5. Source changes auto-reload the extension

### Production Build

```bash
npm run build
# Or silent build (outputs only on failure)
npm run build:silent
```

Build output in `dist/`. `scripts/fix-build.js` auto-fixes path issues and renames hashed filenames.

### Configuration

The Options page has 7 tabs: Basic, ReAct, Reflection, Toolbar, Agent, Toolbox, and Knowledge Base.

1. Right-click extension icon → **Options**
2. **Basic**: Pick UI language and provider profile, enter API Key / API Base URL / Model; optionally enable image recognition, completion feedback, and desktop notifications
3. **ReAct**: Adjust inference loop parameters and streaming output
4. **Reflection**: Configure the three-tier reflection strategy
5. **Toolbar**: Manage the selection floating toolbar (tool list, ordering, domain blocklist)
6. **Agent**: Pair with the local agent service
7. **Toolbox**: Manage MCP servers and Skills
8. **Knowledge Base**: Create / import knowledge bases (requires Agent-side RAG dependencies)
9. Start chatting in the side panel

---

## Configuration Reference

The Options page has 7 tabs: Basic, ReAct, Reflection, Toolbar, Agent, Toolbox, and Knowledge Base.

### Basic Settings (Basic tab)

| Parameter | Description |
|-----------|-------------|
| UI Language | Switch between Chinese / English instantly |
| Provider Profile | Multiple profiles with independent API Base / API Key / model lists; new, save-as, rename, delete; switching takes effect immediately |
| API Base URL | API endpoint URL (pick from dropdown or type; custom addresses supported) |
| API Key | OpenAI-compatible API key (required) |
| Model Name | Dropdown selection + "Fetch from API" to pull the provider's model list; add custom models with context window |
| Image Recognition | Global toggle; independent Vision API Base / Key / Model (empty = reuse main config) |
| System Prompt | Custom system prompt (with reset button) |
| Completion Feedback | Sound (distinct success/failure effects), confetti (success only), completion/failure desktop notifications, scheduled task desktop notifications |
| Interaction Reminder | Desktop reminder when AI needs confirmation or clarification |
| Message Timestamp | Show the ask time below user message bubbles |
| Side Panel Scope | Global mode (shared across the window) or tab-specific mode (follows the tab) |
| Tab Grouping | In tab-specific mode, group tabs that opened the side panel into a colored tab group |

### ReAct Settings (ReAct tab)

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max Iterations | 100 | Inference-action loop limit (10-1000) |
| API Timeout | 5min | Single API call max wait (1-10min) |
| Loop Timeout | 30min | Overall loop max execution time (1-120min) |
| Tool Timeout | 10min | Single tool execution max wait (1-30min) |
| Sensitive Op Confirmation | On | Confirmation dialog for sensitive operations (tool calls, command execution); disabled = auto-allow |
| Execution Log | On | Show the "Execution Log" button under messages for API/tool details |
| Streaming Output | On | Token-by-token rendering + live Agent command output; disable as fallback for compatibility issues |
| Expand Tool Cards in Stream | Off | Tool cards expand by default when enabled |

Note: user clarification time does not count toward the loop timeout (timer pauses); API retry (3 attempts, exponential backoff) and tool preselection are built-in strategies — no configuration needed.

### Reflection Settings (Reflection tab)

| Level | Default | Description |
|-------|---------|-------------|
| Reflection Master Switch | On | Globally controls all reflection |
| Post-Reflection | On | Assesses final result quality after the loop; auto-revise or re-execute below threshold |
| Tool-Level Reflection | On | Checks tool results after each call, adjusts strategy on errors/exceptions |
| Sub-task Reflection | Off | Independent assessment of decomposed sub-tasks (advanced feature) |

### Chat Settings (in the side panel)

| Parameter | Default | Description |
|-----------|---------|-------------|
| Memory Limit | Unlimited | Dropdown next to the "Memory" toggle: Unlimited / last 200 / 100 / 50 / 20 / 10 / 5 / 2 / custom 1-400 messages |
| Context Window | Auto | Inferred from model name (detects up to 256K by default); customizable when adding a model |

### Keyboard Shortcuts

| Shortcut | Action |
|----------|--------|
| `Ctrl+T` / `Cmd+T` | Open/close tool selection panel |
| `Alt+/` | Show shortcuts panel |
| `Alt+S` | Full-page screenshot |
| `Alt+Shift+S` | Region screenshot |
| `Alt+N` | New session |
| `Alt+W` | Close current session |
| `Alt+E` | Edit the latest user message |
| `Alt+↑/↓` | Switch message focus (previous / next) |
| `Alt+Ctrl/Cmd+↑/↓` | Jump to top / bottom |
| `Esc` | Close shortcuts panel / clear input |
| `Ctrl+Shift+Y` / `Cmd+Shift+Y` | Global shortcut to open side panel |

---

## State Management Design

### Dual-Export Proxy Pattern

[state.js](./src/side_panel/state.js) uses a unique dual-export Proxy pattern:

```js
// Both imports point to the same data
import state from './state.js';      // state.messageHistory
import { messageHistory } from './state.js'; // Direct destructuring
```

Proxy getter/setter delegates to top-level `let` bindings, ensuring all modules share the same state without a framework. Supports 80+ state fields including image input, file attachments, skill selection, MCP service selection, etc.

### Data Persistence Strategy

| Data Type | Storage | Description |
|-----------|---------|-------------|
| Extension Config | `chrome.storage.local` | API Key, ReAct params, models, image recognition, etc. |
| Chat Sessions | IndexedDB (`ai-helper-db`) | Active sessions + archived sessions |
| UI Prototypes | IndexedDB | Associated by session |
| Toolbar Config | `chrome.storage.local` | Tool list, ordering, domain blocklist |
| Input History | `chrome.storage.local` | Auto-dedup management |
| Cross-Restart Messages | `chrome.storage.session` | SW restart recovery, background task persistence |

### IndexedDB Database Design

`ai-helper-db` (v6), eight object stores:

| Store | Purpose |
|-------|---------|
| `sessions` | Active sessions (index: updatedAt) |
| `activeSession` | Current active session ID |
| `archivedSessions` | Archived sessions (index: createdAt) |
| `uiPrototypes` | UI prototypes (index: createdAt, sessionId) |
| `tokenStats` | Token usage stats (index: timestamp, sessionId) |
| `reactCheckpoints` | ReAct Checkpoints (7-day TTL auto-expiry) |
| `bookmarks` | Message bookmarks (index: sessionId, pinned, createdAt) |
| `scheduledTasks` | Scheduled tasks (index: nextRunAt, enabled) |

Supports automatic transaction failure recovery and legacy `chrome.storage.local` auto-migration.

---

## FAQ

**Q: Extension icon not showing after loading?**
Ensure Developer mode is enabled on `chrome://extensions/` and the correct extension directory is selected.

**Q: Side panel won't open?**
Chrome version must be ≥ 114. Older versions don't support the Side Panel API.

**Q: Tool invocation doesn't work?**
Check if tools are enabled on the options page. Some tools require specific website permissions. Agent tools require prior pairing.

**Q: Build filenames have hashes?**
`scripts/fix-build.js` automatically renames hashed filenames to stable names — no reload needed.

**Q: How to enable image recognition?**
In the Options page "Basic" tab, turn on "Enable Image Recognition". Optionally configure an independent Vision API Base/Key/Model.

**Q: How to upload files for Q&A?**
Paste or drag files into the input area, supporting PDF/Word/Excel/Text. With Agent connected, files are uploaded to the working directory for deeper manipulation.

**Q: How to connect the local Agent?**
```bash
# Global install (recommended)
npm install -g ai-helper-agent && ai-helper-agent start
# Or start locally
cd agent && npm install && npm start
```
Then enter the 6-digit pairing code shown in the terminal on the extension options page "Agent" tab.

**Q: How to add MCP tools?**
Options → "Toolbox" tab → Add MCP Server → Fill in command and args → Connect. Tools auto-register into the system.

**Q: How to import/export conversations?**
Click the "Export" button below the sidebar input box to select multiple sessions for batch export. Import via file picker.

**Q: Agent command execution fails?**
Ensure the agent service is running (`npm start`), and check that `~/.ai-helper-agent/config.json` `allowedPaths` includes the target path.

**Q: How to run Agent in the background?**
Use `ai-helper-agent start -b` or `aha start -b` background startup mode. Use `ai-helper-agent stop` to stop, `ai-helper-agent status` to check status.

**Q: Are Agent operations logged?**
Yes. All file reads/writes, command executions, and security events are recorded in audit logs located at `~/.ai-helper-agent/logs/`, in JSON Lines format, retained for 30 days. Queryable via `/api/logs`.
