// debugger-tools - 基于 Chrome DevTools Protocol 的高级页面调试工具
//
// 单工具 + action 枚举设计：
//   attach/detach/evaluate/input/network/screenshot/emulate
// 普通点击/输入/内容提取应优先使用 interact_element、page_content 等常规工具，
// 本工具仅覆盖 content script 无法实现的场景（原生输入、网络抓包、最早时机执行 JS 等）。

export const DEBUGGER_TOOLS = [
  {
    id: 'debug_page',
    category: 'debug_dev',
    execution: 'background',
    parallelizable: false,
    requiresConfirmation: false,
    confirmationActions: ['attach'],
    type: 'function',
    function: {
      name: 'debug_page',
      description: [
        'Advanced page debugging via Chrome DevTools Protocol (stronger than content scripts).',
        'Usage flow: MUST call action=attach first (user confirmation required; a yellow debugger infobar shows on the tab until detach), then call other actions, and finally call action=detach.',
        'Only use this when normal tools are insufficient: native-level mouse/keyboard events (canvas, file inputs, widgets that ignore synthetic events), capturing XHR/fetch request and response bodies, evaluating JS at page context, full-page screenshots beyond the viewport, or device/UA emulation.',
        'For ordinary clicking, typing, scrolling and content extraction, prefer interact_element / page_content (no debugger bar).',
        'Actions:',
        'attach: open a debugger session on the target tab (requires user confirmation).',
        'detach: close the session and remove the debugger infobar. Call it when debugging work is done.',
        'evaluate: execute JavaScript in the page main world and get its return value (async/await supported).',
        'input: dispatch native input events — click (by selector or x/y), type text into a focused element, press a key (Enter/Tab/Escape/arrows...), mouse-wheel scroll.',
        'network: passive network recording — start (optionally filterUrl), collect (drain recorded requests incl. response bodies), stop.',
        'screenshot: capture viewport, full page, or a single element (by selector); the image is downloaded locally.',
        'emulate: override userAgent, viewport/device metrics, geolocation, timezone, or prefers-color-scheme; use target=reset to clear all overrides.',
      ].join(' '),
      parameters: {
        type: 'object',
        properties: {
          action: {
            type: 'string',
            enum: ['attach', 'detach', 'evaluate', 'input', 'network', 'screenshot', 'emulate'],
            description: 'Debugger action to perform. attach is required before any other action.',
          },
          tabId: { type: 'integer', description: 'Target tab ID. Omit to use the active tab.' },

          // ── evaluate ──
          expression: {
            type: 'string',
            description: 'action=evaluate: JavaScript source to run in page context. May return a Promise (it is awaited). Return value is JSON-serialized.',
          },

          // ── input ──
          inputType: {
            type: 'string',
            enum: ['click', 'type', 'press', 'scroll'],
            description: 'action=input: event type. click=mouse click; type=insert text; press=keyboard shortcut; scroll=mouse wheel.',
          },
          selector: {
            type: 'string',
            description: 'CSS selector. action=input click/type: target element (click uses its center point; type focuses it first). action=screenshot: capture only this element box.',
          },
          x: { type: 'integer', description: 'action=input click/scroll: viewport X coordinate in CSS pixels (used when selector omitted).' },
          y: { type: 'integer', description: 'action=input click/scroll: viewport Y coordinate in CSS pixels (used when selector omitted).' },
          text: { type: 'string', description: 'action=input type: text to insert into the focused/target element.' },
          key: {
            type: 'string',
            description: 'action=input press: key name, e.g. "Enter", "Tab", "Escape", "Backspace", "Delete", "Space", "ArrowLeft/Up/Right/Down", "Home", "End", "PageUp", "PageDown", "F5", or a single character like "a" (prefix with "Control+"/"Shift+"/"Alt+" for modifiers). Single printable characters are typed as text (Shift-aware); Ctrl/Alt/Meta combos are treated as shortcuts and do not insert characters. For multi-character input use inputType=type.',
          },
          deltaX: { type: 'number', description: 'action=input scroll: horizontal wheel delta (positive scrolls left). Default 0.' },
          deltaY: { type: 'number', description: 'action=input scroll: vertical wheel delta (positive scrolls down). Default 300.' },

          // ── network ──
          networkMode: {
            type: 'string',
            enum: ['start', 'collect', 'stop'],
            description: 'action=network: start=begin recording; collect=return and clear buffered entries; stop=stop recording and return remaining entries.',
          },
          filterUrl: { type: 'string', description: 'action=network start: only record requests whose URL contains this substring (e.g. "/api/"). Omit to record all.' },

          // ── screenshot ──
          fullPage: { type: 'boolean', description: 'action=screenshot: capture the full scrollable page, not only the viewport. Ignored when selector is provided.' },
          imageFormat: { type: 'string', enum: ['png', 'jpeg'], description: 'action=screenshot: image format (default png).' },
          quality: { type: 'integer', description: 'action=screenshot: JPEG quality 1-100 (jpeg only).' },

          // ── emulate ──
          emulateTarget: {
            type: 'string',
            enum: ['ua', 'viewport', 'geolocation', 'timezone', 'colorScheme', 'reset'],
            description: 'action=emulate: what to override. reset clears ALL emulation overrides.',
          },
          userAgent: { type: 'string', description: 'action=emulate target=ua: custom User-Agent string.' },
          viewportWidth: { type: 'integer', description: 'action=emulate target=viewport: viewport width in CSS pixels.' },
          viewportHeight: { type: 'integer', description: 'action=emulate target=viewport: viewport height in CSS pixels.' },
          deviceScaleFactor: { type: 'number', description: 'action=emulate target=viewport: DPR (default 1).' },
          mobile: { type: 'boolean', description: 'action=emulate target=viewport: enable mobile metrics (touch, fixed viewport).' },
          latitude: { type: 'number', description: 'action=emulate target=geolocation: latitude.' },
          longitude: { type: 'number', description: 'action=emulate target=geolocation: longitude.' },
          timezoneId: { type: 'string', description: 'action=emulate target=timezone: IANA timezone id, e.g. "Asia/Shanghai" or "America/New_York".' },
          colorScheme: { type: 'string', enum: ['dark', 'light'], description: 'action=emulate target=colorScheme: emulate prefers-color-scheme.' },
        },
        required: ['action'],
      },
    },
  },
];
