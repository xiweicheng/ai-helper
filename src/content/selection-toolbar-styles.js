// content/selection-toolbar-styles.js - 划词工具栏样式注入（支持 light/dark 主题）
// 从 selection-toolbar.js 拆分，包含工具栏与结果面板的 CSS 样式。
// 划词浮层注入宿主页面，读不到扩展页 :root 的 theme.css 变量，故自带一份 token 子集变量块；
// 由 selectionToolbarFollowTheme 开关决定是否跟随扩展主题（关闭时恒 light）。

// 容器变量块作用域（顶层浮层元素）
const VAR_SELECTORS = '#aih-selection-toolbar, .aih-overflow-dropdown, #aih-selection-result, .aih-token-popup';

// 语义 token 子集：light 值还原既有观感，dark 值做暗色适配
export const TOOLBAR_TOKENS = {
  light: {
    'bg-elevated': "#ffffff",
    'tb-panel': "rgba(255,255,255,0.96)",
    'tb-fill': "#f5f6f7",
    'tb-hover': "#f0f0f0",
    'tb-active': "#e4e4e4",
    'tb-border': "#e8e8e8",
    'tb-table-border': "#e0e0e0",
    'tb-divider': "#f0f0f0",
    'tb-text': "#2b3038",
    'tb-text-2': "#5a6675",
    'tb-text-3': "#98a1ad",
    'tb-text-muted': "#bbbbbb",
    'tb-accent': "#3b82f6",
    'tb-accent-hover': "#2563eb",
    'tb-accent-soft': "#eff6ff",
    'tb-on-accent': "#ffffff",
    'tb-brand': "#667eea",
    'tb-warning': "#f59e0b",
    'tb-warning-ink': "#b45309",
    'tb-danger': "#e53e3e"
  },
  dark: {
    'bg-elevated': "#262a33",
    'tb-panel': "rgba(28,31,38,0.94)",
    'tb-fill': "#2a2f3a",
    'tb-hover': "#343b48",
    'tb-active': "#414a5a",
    'tb-border': "#363d4a",
    'tb-table-border': "#3f4756",
    'tb-divider': "#2f3542",
    'tb-text': "#e7eaf0",
    'tb-text-2': "#b7becb",
    'tb-text-3': "#79808e",
    'tb-text-muted': "#565d6b",
    'tb-accent': "#6aa1fb",
    'tb-accent-hover': "#4a8bf0",
    'tb-accent-soft': "#1f2c46",
    'tb-on-accent': "#ffffff",
    'tb-brand': "#8da2f2",
    'tb-warning': "#fbbf24",
    'tb-warning-ink': "#d9a441",
    'tb-danger': "#fc8181"
  },
};

// 生成容器作用域的 CSS 变量块（紧凑无空格，便于断言）
export function buildToolbarVars(resolved) {
  const t = TOOLBAR_TOKENS[resolved === 'dark' ? 'dark' : 'light'];
  const decls = Object.keys(t).map((k) => `--${k}:${t[k]};`).join('');
  return `${VAR_SELECTORS}{${decls}}`;
}

// 组件规则（引用 var(--token)，不内联字面色）
const TOOLBAR_RULES = `

    #aih-selection-toolbar {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 1px;
      padding: 4px 6px;
      background: var(--tb-panel);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid var(--tb-border);
      border-radius: 12px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.10), 0 1px 3px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 13px;
      line-height: 1;
      user-select: none;
      -webkit-user-select: none;
      transition: opacity 0.15s ease, transform 0.15s ease;
      opacity: 0;
      transform: translateY(2px);
      white-space: nowrap;
      /* 浮层直接挂在宿主页面 DOM 上，阻断页面对 body/div 设置的 text-align 继承 */
      text-align: left;
    }
    #aih-selection-toolbar.aih-show {
      opacity: 1;
      transform: translateY(0);
    }
    #aih-selection-toolbar .aih-tb-btn {
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      padding: 4px 6px;
      border: none;
      border-radius: 8px;
      background: transparent;
      color: var(--tb-text);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
      outline: none;
      white-space: nowrap;
      line-height: 1;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-toolbar .aih-tb-btn:hover {
      background: var(--tb-hover);
    }
    #aih-selection-toolbar .aih-tb-btn:active {
      background: var(--tb-active);
    }
    #aih-selection-toolbar .aih-tb-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    #aih-selection-toolbar .aih-tb-divider {
      width: 1px;
      height: 14px;
      background: var(--tb-table-border);
      margin: 0 1px;
      flex-shrink: 0;
    }
    #aih-selection-toolbar .aih-tb-grip {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 2px;
      color: var(--tb-text-muted);
      cursor: grab;
      flex-shrink: 0;
      border-radius: 6px;
      transition: color 0.15s;
    }
    #aih-selection-toolbar .aih-tb-grip:hover {
      color: var(--tb-text-2);
    }
    #aih-selection-toolbar .aih-tb-grip:active {
      cursor: grabbing;
    }
    #aih-selection-toolbar .aih-tb-btn.primary {
      background: var(--tb-accent);
      color: var(--tb-on-accent);
      font-weight: 500;
    }
    #aih-selection-toolbar .aih-tb-btn.primary:hover {
      background: var(--tb-accent-hover);
    }
    #aih-selection-toolbar .aih-tb-btn.primary .aih-tb-icon {
      color: var(--tb-on-accent);
    }

    /* 溢出下拉菜单 */
    .aih-overflow-dropdown {
      position: fixed;
      z-index: 2147483646;
      background: var(--tb-panel);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--tb-border);
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
      padding: 4px;
      min-width: 140px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      text-align: left;
    }
    .aih-overflow-dropdown .aih-dropdown-item {
      display: flex;
      align-items: center;
      gap: 8px;
      width: 100%;
      padding: 8px 12px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--tb-text);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s;
      outline: none;
      font-family: inherit;
      white-space: nowrap;
      text-align: left;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    .aih-overflow-dropdown .aih-dropdown-item:hover {
      background: var(--tb-hover);
    }
    .aih-overflow-dropdown .aih-dropdown-item .aih-tb-icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    /* 下拉菜单分隔线 */
    .aih-overflow-dropdown .aih-dropdown-divider {
      height: 1px;
      background: var(--tb-border);
      margin: 4px 8px;
    }
    /* 下拉菜单设置按钮 */
    .aih-overflow-dropdown .aih-dropdown-settings {
      color: var(--tb-text-2);
    }
    .aih-overflow-dropdown .aih-dropdown-settings:hover {
      background: var(--tb-hover);
      color: var(--tb-brand);
    }

    /* 问问AI 内联输入框 */
    #aih-selection-toolbar .aih-tb-buttons {
      display: flex;
      align-items: center;
      gap: 1px;
    }
    #aih-selection-toolbar .aih-tb-ask-wrap {
      display: flex;
      align-items: center;
      gap: 0;
      border: 1px solid var(--tb-table-border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-elevated);
      width: 75px;
      flex-shrink: 0;
      transition: width 0.2s ease;
    }
    #aih-selection-toolbar .aih-tb-ask-input {
      flex: 1;
      min-width: 0;
      padding: 4px 6px;
      margin: 0;
      border: none;
      background: transparent;
      color: var(--tb-text);
      font-size: 13px;
      font-family: inherit;
      outline: none;
      line-height: 1.4;
      transition: flex 0.2s ease;
      box-sizing: border-box;
    }
    #aih-selection-toolbar .aih-tb-ask-input::placeholder {
      color: var(--tb-text-muted);
    }
    #aih-selection-toolbar .aih-tb-ask-send {
      flex-shrink: 0;
      padding: 4px 6px;
      border-radius: 0;
    }
    /* ask 模式：工具栏宽度限制 360px，输入框撑满 */
    #aih-selection-toolbar.aih-ask-mode {
      max-width: 360px;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-ask-wrap {
      flex: 1;
      width: auto;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-ask-input {
      flex: 1;
      width: auto;
    }
    #aih-selection-toolbar.aih-ask-mode .aih-tb-buttons {
      display: none;
    }

    /* 结果面板 */
    #aih-selection-result {
      position: fixed;
      z-index: 2147483647;
      display: none;
      flex-direction: column;
      width: 420px;
      max-width: 92vw;
      max-height: 520px;
      background: var(--tb-panel);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid var(--tb-border);
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.65;
      color: var(--tb-text);
      overflow: hidden;
      animation: aih-panel-in 0.2s ease-out;
      /* 阻断宿主页面（如 body 居中对齐）的 text-align 继承 */
      text-align: left;
    }
    @keyframes aih-panel-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    #aih-selection-result .aih-result-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      flex-shrink: 0;
      padding: 10px 14px;
      border-bottom: 1px solid var(--tb-divider);
      background: var(--tb-fill);
      font-size: 15px;
      color: var(--tb-text-2);
      font-weight: 600;
    }
    #aih-selection-result .aih-result-header-actions {
      display: flex;
      align-items: center;
      gap: 2px;
    }
    #aih-selection-result .aih-result-lock,
    #aih-selection-result .aih-result-close {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 24px;
      height: 24px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--tb-text-3);
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      padding: 0;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-lock:hover,
    #aih-selection-result .aih-result-close:hover {
      background: var(--tb-border);
      color: var(--tb-text-2);
    }
    #aih-selection-result .aih-result-lock.locked {
      color: var(--tb-accent);
    }
    #aih-selection-result .aih-result-body {
      padding: 12px 14px;
      word-break: break-word;
    }
    /* 正文居左（兼容任意第三方宿主页，同时不破坏 Markdown 自身对齐）：
       1) 容器级 text-align: left 阻断“页面通过 body 声明居中→继承下来”的污染（本次实际问题就是这种）；
       2) 高特异性后代规则再兜底页面对正文子元素的直接命中污染（如 .article p 直接声明居中）。
       关键点：【不加 !important】，使模型输出的内联 style="text-align"（如居中的 HTML 块）仍能生效；
       排除 th/td 以保留 Markdown 表格列对齐（:---: / ---:）。 */
    #aih-selection-result .aih-result-body,
    #aih-selection-result .aih-result-body :not(th):not(td) {
      text-align: left;
    }
    #aih-selection-result .aih-result-body p {
      margin: 0 0 8px;
    }
    #aih-selection-result .aih-result-body p:last-child {
      margin-bottom: 0;
    }
    #aih-selection-result .aih-result-body pre {
      background: var(--tb-fill);
      padding: 10px 12px;
      border-radius: 6px;
      overflow-x: auto;
      font-size: 13px;
      line-height: 1.5;
      margin: 8px 0;
    }
    #aih-selection-result .aih-result-body code {
      font-family: 'SF Mono', 'Menlo', 'Monaco', 'Courier New', monospace;
      font-size: 0.9em;
      background: var(--tb-hover);
      padding: 1px 4px;
      border-radius: 3px;
    }
    #aih-selection-result .aih-result-body pre code {
      background: none;
      padding: 0;
    }
    #aih-selection-result .aih-result-body ul,
    #aih-selection-result .aih-result-body ol {
      padding-left: 20px;
      margin: 8px 0;
    }
    #aih-selection-result .aih-result-body li {
      margin-bottom: 4px;
    }
    #aih-selection-result .aih-result-body h1,
    #aih-selection-result .aih-result-body h2,
    #aih-selection-result .aih-result-body h3,
    #aih-selection-result .aih-result-body h4 {
      margin: 12px 0 6px;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body h1 { font-size: 1.3em; }
    #aih-selection-result .aih-result-body h2 { font-size: 1.15em; }
    #aih-selection-result .aih-result-body h3 { font-size: 1.05em; }
    #aih-selection-result .aih-result-body blockquote {
      border-left: 3px solid var(--tb-accent);
      margin: 8px 0;
      padding: 4px 12px;
      color: var(--tb-text-2);
      background: var(--tb-fill);
      border-radius: 0 4px 4px 0;
    }
    #aih-selection-result .aih-result-body table {
      border-collapse: collapse;
      width: 100%;
      margin: 8px 0;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-body th,
    #aih-selection-result .aih-result-body td {
      border: 1px solid var(--tb-table-border);
      padding: 6px 10px;
      /* 不强制对齐方式：让 Markdown 表格列对齐（align 属性）生效，
         无 align 的单元格则继承正文的居左 */
    }
    #aih-selection-result .aih-result-body th {
      background: var(--tb-fill);
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body a {
      color: var(--tb-accent);
      text-decoration: none;
    }
    #aih-selection-result .aih-result-body a:hover {
      text-decoration: underline;
    }
    #aih-selection-result .aih-result-body hr {
      border: none;
      border-top: 1px solid var(--tb-table-border);
      margin: 12px 0;
    }
    #aih-selection-result .aih-result-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 14px;
      color: var(--tb-text-3);
      font-size: 13px;
    }
    #aih-selection-result .aih-result-scroll {
      flex: 1 1 0%;
      min-height: 0;
      overflow-y: auto;
    }
    #aih-selection-result .aih-spinner {
      width: 18px;
      height: 18px;
      border: 2px solid var(--tb-table-border);
      border-top-color: var(--tb-accent);
      border-radius: 50%;
      animation: aih-spin 0.8s linear infinite;
    }
    @keyframes aih-spin {
      to { transform: rotate(360deg); }
    }
    #aih-selection-result .aih-result-error {
      padding: 16px 14px;
      color: var(--tb-danger);
      font-size: 13px;
    }
    #aih-selection-result .aih-result-footer {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      background: var(--tb-fill);
    }
    #aih-selection-result .aih-result-footer-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: var(--tb-text-2);
      font-size: 12px;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      outline: none;
      font-family: inherit;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-footer-btn:hover {
      background: var(--tb-border);
      color: var(--tb-text);
    }
    #aih-selection-result .aih-result-footer-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    /* Token 消耗标签（底部工具栏右侧） */
    #aih-selection-result .aih-result-token {
      margin-left: auto;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 0;
      font-size: 11px;
      color: var(--tb-text-3);
      white-space: nowrap;
      cursor: pointer;
      user-select: none;
      -webkit-user-select: none;
      border-radius: 4px;
      transition: color 0.15s;
    }
    #aih-selection-result .aih-result-token:hover {
      color: var(--tb-text-2);
    }
    #aih-selection-result .aih-result-token .aih-token-dot {
      color: var(--tb-warning);
      font-size: 8px;
      line-height: 1;
    }
    /* Token 消耗明细弹窗（视觉对齐侧边栏 token-detail-popup） */
    .aih-token-popup {
      position: fixed;
      z-index: 2147483647;
      background: var(--bg-elevated);
      border-radius: 12px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
      min-width: 220px;
      max-width: 280px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      animation: aih-token-popup-in 0.15s ease-out;
      box-sizing: border-box;
      text-align: left;
    }
    @keyframes aih-token-popup-in {
      from { opacity: 0; transform: translateY(4px); }
      to { opacity: 1; transform: translateY(0); }
    }
    .aih-token-popup-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 10px 14px 8px;
      border-bottom: 1px solid var(--tb-divider);
    }
    .aih-token-popup-title {
      font-size: 13px;
      font-weight: 600;
      color: var(--tb-text);
    }
    .aih-token-popup-close {
      background: none;
      border: none;
      font-size: 18px;
      color: var(--tb-text-3);
      cursor: pointer;
      padding: 0 4px;
      line-height: 1;
      border-radius: 4px;
      transition: all 0.15s;
    }
    .aih-token-popup-close:hover {
      background: var(--tb-fill);
      color: var(--tb-text-2);
    }
    .aih-token-popup-body {
      padding: 10px 14px 12px;
    }
    .aih-token-popup-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 5px 0;
    }
    .aih-token-popup-row.aih-token-popup-total {
      padding: 6px 0 8px;
    }
    .aih-token-popup-label {
      font-size: 12px;
      color: var(--tb-text-2);
    }
    .aih-token-popup-total .aih-token-popup-label {
      font-size: 13px;
      font-weight: 600;
      color: var(--tb-text);
    }
    .aih-token-popup-right {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .aih-token-popup-value {
      font-size: 13px;
      font-weight: 600;
      color: var(--tb-text);
      font-variant-numeric: tabular-nums;
    }
    .aih-token-popup-total .aih-token-popup-value {
      font-size: 15px;
      color: var(--tb-warning-ink);
    }
    .aih-token-popup-percent {
      font-size: 11px;
      color: var(--tb-text-3);
      min-width: 32px;
      text-align: right;
    }
    .aih-token-popup-divider {
      height: 1px;
      background: var(--tb-hover);
      margin: 4px 0 6px;
    }
    /* 推荐追问 */
    #aih-selection-result .aih-result-suggestions {
      padding: 10px 14px;
      border-top: 1px solid var(--tb-divider);
    }
    #aih-selection-result .aih-suggestions-label {
      font-size: 11px;
      color: var(--tb-text-3);
      margin-bottom: 8px;
      font-weight: 500;
    }
    #aih-selection-result .aih-suggestions-list {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    #aih-selection-result .aih-suggestion-chip {
      display: block;
      width: 100%;
      text-align: left;
      padding: 7px 10px;
      border: 1px solid var(--tb-border);
      border-radius: 8px;
      background: var(--tb-fill);
      color: var(--tb-text);
      font-size: 13px;
      cursor: pointer;
      transition: background 0.15s, border-color 0.15s;
      outline: none;
      font-family: inherit;
      line-height: 1.4;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-suggestion-chip:hover {
      background: var(--tb-accent-soft);
      border-color: var(--tb-accent);
      color: var(--tb-accent-hover);
    }
    /* 追问输入框 */
    #aih-selection-result .aih-result-followup {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      padding: 8px 14px;
      border-top: 1px solid var(--tb-divider);
    }
    #aih-selection-result .aih-followup-wrap {
      display: flex;
      align-items: center;
      flex: 1;
      border: 1px solid var(--tb-table-border);
      border-radius: 8px;
      overflow: hidden;
      background: var(--bg-elevated);
      transition: border-color 0.15s;
    }
    #aih-selection-result .aih-followup-wrap:focus-within {
      border-color: var(--tb-accent);
    }
    #aih-selection-result .aih-followup-input {
      flex: 1;
      padding: 6px 8px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      color: var(--tb-text);
    }
    #aih-selection-result .aih-followup-input::placeholder {
      color: var(--tb-text-muted);
    }
    #aih-selection-result .aih-followup-send {
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      padding: 6px 8px;
      border: none;
      border-radius: 0;
      background: transparent;
      color: var(--tb-accent);
      cursor: pointer;
      transition: color 0.15s;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-followup-send:hover {
      color: var(--tb-accent-hover);
    }
  
`;

// 完整样式表 = 变量块 + 规则
export function buildToolbarCss(resolved) {
  return buildToolbarVars(resolved) + '\n' + TOOLBAR_RULES;
}

/**
 * 注入工具栏与结果面板的 CSS 样式（幂等）。默认按 light 打底，
 * 真实主题由 applyToolbarTheme() 在初始化时依据开关覆盖。
 */
export function injectStyles() {
  if (document.getElementById('aih-selection-toolbar-styles')) return;
  const style = document.createElement('style');
  style.id = 'aih-selection-toolbar-styles';
  style.textContent = buildToolbarCss('light');
  document.head.appendChild(style);
}

/**
 * 依据生效主题（light/dark）重设样式表内容。
 * resolved 已由调用方按 selectionToolbarFollowTheme 归一（不跟随→恒 light）。
 */
export function applyToolbarTheme(resolved) {
  const style = document.getElementById('aih-selection-toolbar-styles');
  const next = resolved === 'dark' ? 'dark' : 'light';
  if (style) {
    if (style.dataset.themeApplied === next) return;
    style.dataset.themeApplied = next;
    style.textContent = buildToolbarCss(next);
    return;
  }
  injectStyles();
  const s = document.getElementById('aih-selection-toolbar-styles');
  if (s) { s.dataset.themeApplied = next; s.textContent = buildToolbarCss(next); }
}
