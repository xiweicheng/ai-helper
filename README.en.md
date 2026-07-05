# AI Helper - Web Smart Assistant

> An LLM-powered Chrome browser extension with 60+ built-in tools, supporting natural language conversation, browser automation, and web content processing via a ReAct (Reasoning + Acting) inference loop. Optional Node.js agent provides file system access, command execution, skill system, and MCP protocol extension.

| Feature | Description |
|---------|-------------|
| Platform | Chrome / Edge / Other Chromium-based browsers |
| Extension Standard | Manifest V3 |
| Minimum Chrome Version | 114+ (requires Side Panel API) |
| API Protocol | OpenAI Chat Completions Compatible |
| Build Tooling | Vite + @crxjs/vite-plugin |
| Local Agent | Optional, Node.js 18+ process for file/command capabilities |
| Skill System | Workflow and Agent skill types, skill creation from conversation |
| MCP Protocol | Model Context Protocol support for third-party tools |
| Multi-Agent | Custom agents with role templates and tool permissions |

---

## Architecture Overview

The project uses a **five-layer architecture**, communicating via Chrome Extension messaging channels:

```
┌──────────────────────────────────────────────────────────────┐
│                   Side Panel (UI Layer)                       │
│  side_panel.html + src/side_panel/*.js                        │
│  Chat | Markdown/Mermaid | Tool Panel | Prompts              │
│  Selection Query | Input History | Execution Log | Clarify    │
│  Agent Manager | Token Stats | Agent Selector                 │
└──────────────┬──────────────────────────────┬────────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│  Background Service       │    │    Options Page (Config)      │
│  Worker (Core Logic)      │    │  options.html + src/options/  │
│                          │    │  API Key/Model/Tools/ReAct    │
│  src/background/          │    │  Toolbar/Prompts/Toolbox     │
│  ├── index.js (router)    │    └──────────────────────────────┘
│  ├── react-loop.js        │
│  ├── tool-executor.js     │
│  ├── tool-preselector.js  │
│  ├── agent-dispatcher.js  │
│  ├── stream-controller.js │
│  ├── token-recorder.js    │
│  ├── config.js            │
│  ├── constants.js         │
│  └── state.js             │
└──────────────┬─────────────┘    ┌──────────────────────────────┐
               │                   │   Local Agent (Optional)      │
               │                   │  agent/ (Node.js Process)     │
               │                   │  HTTP REST + WebSocket        │
               │                   │  File/Command + Skill + MCP   │
               │                   └──────────────────────────────┘
               │  chrome.tabs.sendMessage
               ▼
┌──────────────────────────────────────────────────────────────┐
│           Content Script (Page Tool Execution)                │
│  src/content/*.js (injected into web pages)                   │
│  ├── index.js (message routing, 60+ tools)                    │
│  ├── page-tools.js (content extraction)                      │
│  ├── interaction-tools.js (page interaction)                 │
│  ├── advanced-tools.js (advanced features)                    │
│  └── selection-toolbar.js (selection floating toolbar)        │
└──────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────┐
│                   Storage (Persistence)                       │
│  src/storage/                                                 │
│  ├── db.js (IndexedDB)                                        │
│  ├── session-store.js (Session Adapter)                       │
│  └── token-store.js (Token Stats)                             │
└──────────────────────────────────────────────────────────────┘
```

### Core Data Flow

```
User Input → Side Panel (Agent Selection)
  → chrome.runtime.sendMessage('CALL_API')
    → Background: Tool Preselection → ReAct Loop
      → Token Budget Management → Context Pressure Monitoring
      → LLM API Call (OpenAI Compatible, Stream Support)
        → If tool needed: Confirmation Check → Execute Tool
          ├── Background (Tab management, bookmarks)
          ├── Content Script (Page interaction, content extraction)
          └── Local Agent (File/command, MCP tools)
        → Tool Reflection → Result Cache → Feed back to LLM
      → Task Decomposition & Parallel Execution (Sub-task dispatch)
      → Post Reflection: Quality Assessment → Pass/Revise/Retry
    → chrome.runtime.sendMessage('API_COMPLETE')
  → Side Panel: Markdown rendering, Mermaid rendering, Token stats update
```

---

## Project Structure

```
ai-helper/
├── agent/                              # Local Agent service (Node.js)
│   ├── bin/agent.js                    # CLI entry
│   ├── src/
│   │   ├── server.js                   # HTTP + WebSocket server
│   │   ├── executor.js                 # Command execution engine
│   │   ├── security.js                # Path sandbox + security
│   │   ├── config.js                   # Agent configuration
│   │   ├── auth.js                     # Pairing authentication
│   │   ├── search.js                   # File search (fd/rg)
│   │   ├── logger.js                   # Structured logging
│   │   ├── skill/                      # Skill system
│   │   │   ├── loader.js              # Skill loader (JSON/YAML/SKILL.md)
│   │   │   ├── registry.js            # Skill registry
│   │   │   ├── executor.js            # Workflow executor
│   │   │   └── markdown-loader.js     # Agent skill loader
│   │   └── mcp/                        # MCP protocol
│   │       ├── client.js              # MCP Client (JSON-RPC 2.0)
│   │       ├── registry.js            # MCP Server registry
│   │       ├── transport.js           # Stdio transport
│   │       └── mcp-config.js          # MCP configuration
│   └── package.json
├── icons/                              # Extension icons
│   ├── icon16.png / icon48.png / icon128.png
│   └── README.md
├── libs/                               # Third-party dependencies (CDN)
│   ├── marked.min.js                   # Markdown rendering engine
│   ├── mermaid.min.js                  # Diagram rendering engine
│   ├── qrcode.min.js                   # QR code generation library
│   └── github-markdown-light.min.css   # GitHub-flavored Markdown styles
├── scripts/                            # Post-build scripts
│   ├── fix-build.js                    # Fix @crxjs/vite-plugin build artifacts
│   ├── generate-icons.js               # Icon generation script
│   └── deploy-pages.sh                 # Pages deployment script
├── styles/                             # Style files
│   └── styles.css                      # Content Script floating box styles
├── src/                                # Source code
│   ├── background/                     # Background Service Worker
│   │   ├── index.js                    # Entry: message routing, API dispatch
│   │   ├── react-loop.js              # ReAct inference loop (core engine)
│   │   ├── tool-executor.js           # Tool execution
│   │   ├── tool-preselector.js        # Tool preselection
│   │   ├── agent-dispatcher.js        # Sub-task dispatcher
│   │   ├── stream-controller.js       # Streaming response controller
│   │   ├── token-recorder.js          # Token usage recorder
│   │   ├── config.js                   # Config read/write
│   │   ├── constants.js               # Defaults, 60+ built-in tools
│   │   └── state.js                   # Cancel control and API counter
│   ├── content/                        # Page-injected scripts
│   │   ├── index.js                    # Entry: message routing
│   │   ├── page-tools.js              # Page content tools
│   │   ├── interaction-tools.js       # Interaction tools
│   │   ├── advanced-tools.js          # Advanced tools
│   │   └── selection-toolbar.js       # Floating selection toolbar
│   ├── side_panel/                     # Side Panel UI
│   │   ├── index.js                    # Entry: event binding, component init
│   │   ├── chat-manager.js            # Chat management
│   │   ├── markdown-render.js         # Markdown/Mermaid rendering
│   │   ├── tool-panel.js              # Tool selection popup
│   │   ├── prompt-manager.js          # Prompt management
│   │   ├── agent-manager.js           # Multi-agent management UI
│   │   ├── agent-store.js             # Agent persistence
│   │   ├── token-stats-panel.js       # Token statistics panel
│   │   ├── clarify-dialog.js          # Clarification dialog
│   │   ├── message-toc.js             # Message table of contents
│   │   ├── input-history.js           # Input history
│   │   ├── state.js                    # UI state management
│   │   ├── utils.js                    # Utility functions
│   │   └── constants.js               # Temperature presets
│   ├── options/                        # Extension options page
│   │   ├── index.js                    # Entry: tab switching, form events
│   │   ├── config-manager.js          # Config management
│   │   ├── toolbar-config.js          # Toolbar configuration
│   │   ├── toolbox-config.js          # Toolbox configuration (Skill/MCP)
│   │   └── constants.js               # Default system prompt
│   ├── storage/                        # IndexedDB persistence
│   │   ├── db.js                       # IndexedDB wrapper
│   │   ├── session-store.js           # Session adapter
│   │   └── token-store.js             # Token stats storage
│   ├── config/                         # Global config constants
│   │   └── constants.js               # Storage keys, message types
│   └── shared/                         # Shared utilities
│       ├── tools.js                    # Tool categories
│       ├── utils.js                    # Shared helper functions
│       ├── token-counter.js           # Token counter
│       └── agent-defaults.js          # Built-in agent definitions
├── manifest.json                       # Chrome extension config
├── side_panel.html                     # Side panel HTML
├── options.html                        # Options page HTML
├── vite.config.js                      # Vite build config
├── package.json                        # npm package config
└── README.md
```

---

## Core Features

### Multi-Agent Management

Create and manage multiple custom AI agents, each with independent system prompts and tool permissions:

- **Built-in Templates**: Code Review Expert, Web Automation Assistant, Data Analyst, Documentation Writer
- **Custom Agents**: Create specialized agents with custom icons, names, system prompts, and tool permissions
- **Agent Selector**: Quick agent switching at the top of the side panel
- **Tool Filtering**: Each agent can have its own toolset to avoid context bloat
- **Sub-task Dispatch**: Delegate subtasks to other agents for multi-agent collaboration

### ReAct Inference Loop

The project uses the ReAct (Reasoning + Acting) pattern as its core inference engine:

1. **Tool Preselection**: Before the main model call, a lightweight API call lets a smaller model decide which tools are needed, reducing 60+ tools to 5-10 relevant ones, significantly cutting token usage
2. **Inference Loop**: LLM thinks → decides to call tool → executes tool → result fed back → continues reasoning → final answer
3. **Task Decomposition**: Supports the `plan_task` tool to break complex tasks into subtasks, with sequential, parallel, and dependency-based execution strategies
4. **Sub-task Dispatch**: Delegate subtasks to other agents for multi-agent collaboration
5. **Streaming Response**: OpenAI streaming support for real-time LLM output
6. **Clarification**: When task info is incomplete, the LLM can invoke `clarify_question` to show a dialog for user input
7. **Timeout Control**: Multi-level timeouts (API, tool, overall loop), with automatic loop timer pausing during clarification
8. **Token Budget Management**: Dynamic token budget calculation based on model context window
9. **Tool Result Cache**: Automatic caching for parallel tool results (30 entry limit)

### Token Statistics Panel

Real-time tracking and display of token usage:

- **Real-time Stats**: Token consumption updated after each API call
- **Session Stats**: Current session cumulative consumption, average per round
- **Daily Stats**: Today's cumulative consumption, call count
- **Chart Display**: Trend charts and detailed data
- **History**: Last 7 days of token usage history

### Skill System

Capture reusable skills from conversations:

- **Workflow Skill**: JSON/YAML-defined workflow skills that execute directly
- **Agent Skill**: SKILL.md-defined agent skills that AI can invoke autonomously
- **Built-in Skill**: `skill-creator` meta-skill for creating new skills from conversations
- **Skill Management**: Enable/disable, import/export, delete operations
- **Skill Capture**: Users can say "save this as a skill" to trigger skill creation

### MCP Protocol Extension

Model Context Protocol (MCP) support for third-party tool extensions:

- **MCP Client**: JSON-RPC 2.0 communication with stdio transport
- **MCP Server Management**: Configure, connect, disconnect, monitor status
- **Tool Discovery**: Auto-discover tools from MCP Servers
- **Tool Calling**: Call MCP tools through the Agent service
- **Multi-Server Support**: Connect to multiple MCP Servers simultaneously

### Side Panel Chat

- **Natural Language Conversation**: OpenAI-compatible API, default DeepSeek
- **Chat History**: Auto-save up to 50 rounds, configurable memory limit
- **Model Switching**: Built-in DeepSeek models, custom model support
- **Temperature Control**: 4 presets (Precision Coding 0.2 / Balanced Dev 0.45 / Architecture Exploration 0.65 / Creative 0.9) with continuous slider
- **Isolated Chat**: Standalone Q&A without carrying historical context
- **In-Panel Selection Query**: Select text within side panel to show quick action menu
- **Prompt System**: Custom prompts, `/` quick select, menu toggle
- **Input History**: Arrow key recall of previous inputs

### Markdown & Mermaid Rendering

- Full Markdown support: code blocks (with line numbers, copy button, language tag), tables (export Excel/copy Markdown), quotes, lists
- Mermaid diagrams: flowcharts, sequence diagrams, Gantt charts, etc. Zoom (Ctrl+scroll), drag, download PNG, copy to clipboard, view source

### Message Export

- Copy full messages
- Copy individual code blocks
- Export as Word (.docx) documents
- Export as PDF documents
- Copy/download Markdown tables
- Download Mermaid diagrams as PNG

### Selection Floating Toolbar

Automatically appears when text is selected on any webpage, providing:

- **AI Search**: Opens side panel and initiates search
- **Quick Actions**: Explain, Translate, Summarize
- **Custom Tools**: Add custom prompt-based tools
- **Follow-up Input**: Inline input for follow-up questions
- **Result Panel**: Floating result display with follow-up and copy
- **Configuration**: Icon-only mode, visible count, domain blocking

---

## Built-in Tools (59)

### Page Interaction (6)
| Tool | Description |
|------|-------------|
| `click_element` | Click element |
| `hover_element` | Mouse hover |
| `drag_and_drop` | Drag-and-drop operation |
| `scroll_to` | Scroll to position |
| `wait_for_element` | Wait for element state change |
| `wait_for_navigation` | Wait for page navigation |

### Form & Input (4)
| Tool | Description |
|------|-------------|
| `fill_form` | Batch fill forms |
| `keyboard_input` | Keyboard input |
| `file_upload` | Inject files into upload controls |
| `select_dropdown` | Dropdown menu selection |

### Content Extraction (16)
| Tool | Description |
|------|-------------|
| `get_page_text` | Extract plain text content |
| `get_full_html` | Get complete HTML source |
| `query_interactive_elements` | Extract interactive elements (recommended) |
| `get_selected_content` | Get user-selected content |
| `extract_table` | Extract tables as JSON/Markdown |
| `extract_links` | Extract all links |
| `extract_forms` | Identify form structures |
| `extract_images` | Extract image URLs |
| `extract_metadata` | Extract page metadata (SEO) |
| `search_in_page` | Regex search page text |
| `page_to_markdown` | Convert page to Markdown |
| `page_to_json` | Extract structured data as JSON |
| `find_similar_elements` | Find similar structure elements |
| `get_iframe_content` | Get iframe content (same-origin) |
| `scroll_and_collect` | Scroll and collect long content |
| `get_element_count` | Quick element count |

### Tab Management (6)
| Tool | Description |
|------|-------------|
| `open_tab` | Open new tab |
| `switch_tab` | Switch to specified tab |
| `close_tab` | Close tab |
| `get_tabs` | List all tabs |
| `navigate_back_forward` | Navigate back/forward |
| `reload_tab` | Reload tab |

### Bookmarks & History (2)
| Tool | Description |
|------|-------------|
| `search_bookmarks` | Search browser bookmarks |
| `search_history` | Search browser history |

### Storage Management (3)
| Tool | Description |
|------|-------------|
| `manage_cookies` | Cookie management |
| `manage_storage` | localStorage/sessionStorage management |
| `clear_page_data` | One-click clear site data |

### Network Request (1)
| Tool | Description |
|------|-------------|
| `fetch_url` | HTTP requests |

### Media & Output (7)
| Tool | Description |
|------|-------------|
| `capture_tab_screenshot` | Tab screenshot |
| `take_full_page_screenshot` | Full page screenshot |
| `generate_qrcode` | Generate QR code |
| `copy_to_clipboard` | Copy to clipboard |
| `paste_from_clipboard` | Read from clipboard |
| `download_file` | Download files |
| `show_notification` | Desktop notifications |

### Debug & Dev (2)
| Tool | Description |
|------|-------------|
| `inject_css` | Inject CSS styles |
| `get_browser_info` | Browser environment info |

### AI Collaboration (5)
| Tool | Description |
|------|-------------|
| `clarify_question` | Show clarification dialog |
| `highlight_text` | Highlight text on page |
| `plan_task` | Task decomposition planner |
| `preview_ui_prototype` | UI prototype preview & management |
| `search_conversation_memory` | Search conversation memory |

### Local Agent (7)
| Tool | Description |
|------|-------------|
| `agent_read_file` | Read local file |
| `agent_write_file` | Write local file |
| `agent_list_dir` | List directory contents |
| `agent_delete_file` | Delete local file |
| `agent_exec_command` | Execute terminal command |
| `agent_search_files` | Search by file name |
| `agent_search_content` | Search text in files |

---

## Tech Stack

| Technology | Description |
|------------|-------------|
| Vite + @crxjs/vite-plugin | Build toolchain with ES Modules and HMR |
| Manifest V3 | Latest Chrome extension protocol |
| Service Worker | Background process for API calls and tool execution |
| Side Panel API | Chrome 114+ side panel |
| Content Script | Page injection, DOM operations |
| IndexedDB | Session/prototype/token stats persistence |
| chrome.storage.local | Config storage, agent definitions |
| chrome.storage.session | Cross-restart message recovery |
| chrome.debugger API | Full page screenshots and other advanced features |
| OpenAI Compatible API | LLM integration, default DeepSeek, streaming support |
| marked.js | Markdown rendering engine |
| mermaid.js | Diagram rendering engine |
| qrcode.js | QR code generation library |
| Node.js (Agent) | Local file/command service, skill system, MCP protocol |
| WebSocket (Agent) | Real-time command output streaming |
| MCP Protocol | Model Context Protocol for third-party tools |

---

## Getting Started

### Development Mode

```bash
# Install dependencies
npm install

# Start dev server (supports HMR)
npm run dev
```

Then in Chrome:
1. Open `chrome://extensions/`
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select the `dist` folder under the project directory (auto-generated by Vite)
5. The extension will auto-reload on source changes

### Production Build

```bash
npm run build
```

Build output is in `dist/`, ready to load into Chrome.

> `scripts/fix-build.js` automatically fixes @crxjs/vite-plugin path issues and renames hashed filenames to stable names.

### Configuration

1. Right-click the extension icon → select **Options**
2. Enter your API Key and API base URL (default `https://api.deepseek.com`)
3. Configure model name, ReAct parameters (iterations, timeouts, etc.)
4. Manage the selection toolbar in the **Toolbar Config** tab
5. Start chatting in the side panel

---

## Configuration Reference

### ReAct Settings (Options → ReAct Tab)

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max Iterations | 5 | ReAct loop limit (1-20) |
| API Timeout | 60s | Single API call timeout |
| Loop Timeout | 300s | Overall inference loop timeout |
| Tool Timeout | 30s | Single tool execution timeout |
| Clarify Timeout | 180s | Clarification dialog wait timeout |

### Chat Settings (Options → Chat Tab)

| Parameter | Default | Description |
|-----------|---------|-------------|
| Max History Rounds | 50 | Max conversation rounds retained |
| Max Message Length | 5000 | Max characters per message |
| Memory History Limit | Unlimited | Max history messages sent to LLM |

---

## FAQ

**Q: Extension icon not showing after loading?**  
Ensure Developer mode is enabled on `chrome://extensions/` and the correct `dist` directory is selected.

**Q: Side panel won't open?**  
Chrome version must be ≥ 114. Older versions don't support the Side Panel API.

**Q: Tool invocation doesn't work?**  
Check if tools are enabled on the options page. Some tools require specific website permissions.

**Q: Build filenames have hashes, do I need to reload the extension on every build?**  
`scripts/fix-build.js` automatically renames hashed filenames to stable names, so no reload is needed.

---

## License

MIT License

Copyright (c) 2026 AI Helper
