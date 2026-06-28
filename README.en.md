# AI Helper - Web Smart Assistant

> An LLM-powered Chrome browser extension with 50+ built-in tools, supporting natural language conversation, browser automation, and web content processing via a ReAct (Reasoning + Acting) inference loop.

| Feature | Description |
|---------|-------------|
| Platform | Chrome / Edge / Other Chromium-based browsers |
| Extension Standard | Manifest V3 |
| Minimum Chrome Version | 114+ (requires Side Panel API) |
| API Protocol | OpenAI Chat Completions Compatible |
| Build Tooling | Vite + @crxjs/vite-plugin |

---

## Architecture Overview

The project uses a **four-layer architecture**, communicating via Chrome Extension messaging channels:

```
┌──────────────────────────────────────────────────────────────┐
│                   Side Panel (UI Layer)                       │
│  side_panel.html + src/side_panel/*.js                        │
│  Chat | Markdown/Mermaid | Tool Panel | Prompts              │
│  Selection Query | Input History | Execution Log | Clarify    │
└──────────────┬──────────────────────────────┬────────────────┘
               │  chrome.runtime.sendMessage   │
               ▼                               ▼
┌──────────────────────────┐    ┌──────────────────────────────┐
│  Background Service       │    │    Options Page (Config)      │
│  Worker (Core Logic)      │    │  options.html + src/options/  │
│                          │    │  API Key/Model/Tools/ReAct    │
│  src/background/          │    │  Toolbar/Prompts/Domains     │
│  ├── index.js (router)    │    └──────────────────────────────┘
│  ├── react-loop.js        │
│  ├── tool-executor.js     │
│  ├── tool-preselector.js  │
│  ├── config.js            │
│  ├── constants.js         │
│  └── state.js             │
└──────────────┬─────────────┘
               │  chrome.tabs.sendMessage
               ▼
┌──────────────────────────────────────────────────────────────┐
│           Content Script (Page Tool Execution)                │
│  src/content/*.js (injected into web pages)                   │
│  ├── index.js (message routing, 50+ tools)                    │
│  ├── page-tools.js (content extraction)                      │
│  ├── interaction-tools.js (page interaction)                 │
│  ├── advanced-tools.js (advanced features)                    │
│  └── selection-toolbar.js (selection floating toolbar)        │
└──────────────────────────────────────────────────────────────┘
```

### Core Data Flow

```
User Input → Side Panel
  → chrome.runtime.sendMessage('CALL_API')
    → Background: Tool Preselection → ReAct Loop
      → LLM API Call (OpenAI Compatible)
        → If tool needed: Execute (Background directly or delegate to Content Script)
        → Tool result feeds back to LLM → Next reasoning cycle
      → Final answer
    → chrome.runtime.sendMessage('API_COMPLETE')
  → Side Panel: Markdown rendering, Mermaid chart rendering
```

---

## Project Structure

```
ai-helper/
├── icons/                              # Extension icons
│   ├── icon16.png / icon48.png / icon128.png
│   └── README.md
├── libs/                               # Third-party dependencies (CDN)
│   ├── marked.min.js                   # Markdown rendering engine
│   ├── mermaid.min.js                  # Diagram rendering engine
│   ├── qrcode.min.js                   # QR code generation library
│   └── github-markdown-light.min.css   # GitHub-flavored Markdown styles
├── scripts/                            # Post-build scripts
│   └── fix-build.js                    # Fix @crxjs/vite-plugin build artifacts
├── styles/                             # Style files
│   └── styles.css                      # Content Script floating box styles
├── src/                                # Source code
│   ├── background/                     # Background Service Worker
│   │   ├── index.js                    # Entry: message routing, API dispatch
│   │   ├── react-loop.js              # ReAct inference loop (core engine)
│   │   ├── tool-executor.js           # Tool execution (26 background + 40+ content script tools)
│   │   ├── tool-preselector.js        # Tool preselection (lightweight API call to filter toolset)
│   │   ├── config.js                   # Config read/write
│   │   ├── constants.js               # Defaults, 50+ built-in tools, category mappings
│   │   └── state.js                   # Cancel control and API counter
│   ├── content/                        # Page-injected scripts
│   │   ├── index.js                    # Entry: message routing, 50+ tool handlers
│   │   ├── page-tools.js              # Page content tools (text, metadata, links, etc.)
│   │   ├── interaction-tools.js       # Interaction tools (click, fill, scroll, drag, etc.)
│   │   ├── advanced-tools.js          # Advanced tools (video, screenshot, Shadow DOM, etc.)
│   │   └── selection-toolbar.js       # Floating selection toolbar
│   ├── side_panel/                     # Side Panel UI
│   │   ├── index.js                    # Entry: event binding, component init
│   │   ├── chat-manager.js            # Chat management (send/receive, execution log)
│   │   ├── markdown-render.js         # Markdown/Mermaid rendering & interaction
│   │   ├── tool-panel.js              # Tool selection popup
│   │   ├── prompt-manager.js          # Prompt management (CRUD, quick select)
│   │   ├── clarify-dialog.js          # Clarification dialog
│   │   ├── message-toc.js             # Message table of contents
│   │   ├── input-history.js           # Input history (up/down arrow recall)
│   │   ├── state.js                    # UI state management
│   │   ├── utils.js                    # Utility functions
│   │   └── constants.js               # Temperature presets, category names
│   ├── options/                        # Extension options page
│   │   ├── index.js                    # Entry: tab switching, form events
│   │   ├── config-manager.js          # Config management
│   │   ├── toolbar-config.js          # Toolbar configuration
│   │   └── constants.js               # Default system prompt
│   ├── config/                         # Global config constants
│   │   └── constants.js               # Storage keys, message types, etc.
│   └── shared/                         # Shared utilities
│       ├── tools.js                    # Tool categories and shared definitions
│       └── utils.js                    # Shared helper functions
├── manifest.json                       # Chrome extension config
├── side_panel.html                     # Side panel HTML
├── options.html                        # Options page HTML
├── vite.config.js                      # Vite build config
├── package.json                        # npm package config
└── README.md
```

---

## Core Features

### ReAct Inference Loop

The project uses the ReAct (Reasoning + Acting) pattern as its core inference engine:

1. **Tool Preselection**: Before the main model call, a lightweight API call lets a smaller model decide which tools are needed, reducing 50+ tools to 5-10 relevant ones, significantly cutting token usage
2. **Inference Loop**: LLM thinks → decides to call tool → executes tool → result fed back → continues reasoning → final answer
3. **Task Decomposition**: Supports the `plan_task` tool to break complex tasks into subtasks, topologically sorted by dependencies and executed sequentially
4. **Clarification**: When task info is incomplete, the LLM can invoke `clarify_question` to show a dialog for user input
5. **Timeout Control**: Multi-level timeouts (API, tool, overall loop), with automatic loop timer pausing during clarification

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
| chrome.debugger API | Full page screenshots and other advanced features |
| OpenAI Compatible API | LLM integration, default DeepSeek |
| marked.js | Markdown rendering engine |
| mermaid.js | Diagram rendering engine |
| qrcode.js | QR code generation library |

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
