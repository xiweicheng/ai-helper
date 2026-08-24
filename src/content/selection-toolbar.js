// content/selection-toolbar.js - 选中文本浮动工具栏（豆包风格）

import { deepGetSelection, getRangeViewportPosition, attachSelectionListeners, removeSelectionListeners } from './shadow-dom-utils.js';
import { injectStyles } from './selection-toolbar-styles.js';
import logger from '../shared/logger.js';
import { t, registerTranslations, subscribe } from '../shared/i18n.js';

// 注册工具名称翻译（与 options/constants.js 共享 key，content script 上下文独立）
registerTranslations('zh', {
  optionsConst: {
    aiSearch: 'AI搜索',
    explain: '解释',
    translate: '翻译',
    summary: '总结',
    copy: '复制',
  },
});

registerTranslations('en', {
  optionsConst: {
    aiSearch: 'AI Search',
    explain: 'Explain',
    translate: 'Translate',
    summary: 'Summarize',
    copy: 'Copy',
  },
});

// 内置工具名称 i18n key 映射（用于运行时动态获取当前语言的名称）
const BUILTIN_TOOL_NAME_KEYS = {
  'ai-search': 'optionsConst.aiSearch',
  'explain': 'optionsConst.explain',
  'translate': 'optionsConst.translate',
  'summary': 'optionsConst.summary',
  'copy': 'optionsConst.copy',
};

/** 获取内置工具的当前语言名称 */
function getBuiltinToolName(toolId) {
  const key = BUILTIN_TOOL_NAME_KEYS[toolId];
  return key ? t(key) : undefined;
}

registerTranslations('zh', {
  selToolbar: {
    settings: '设置',
    settingsTitle: '打开配置页面',
    disableTemporarily: '本次临时禁用',
    disableTemporarilyTitle: '暂时隐藏直到页面刷新',
    disableOnSite: '在此网站禁用',
    disableOnSiteTitle: '在此网站禁用工具栏',
    dragToMove: '拖拽移动',
    moreTools: '更多工具',
    copySelectedTitle: '复制选中内容',
    askPlaceholder: '问问...',
    sendTitle: '发送',
    aiAnswer: 'AI 回答',
    lockWindow: '锁定窗口',
    unlockWindow: '解除锁定',
    close: '关闭',
    copyAll: '复制',
    copyRichTitle: '复制 Markdown 文本（Ctrl/⌘ + 单击复制富文本）',
    regenerate: '重新生成',
    suggestedFollowups: '💡 推荐追问',
    followupPlaceholder: '继续提问...',
    sendToSidebar: '发送到侧边栏',
    aiThinking: 'AI 正在思考...',
    requestFailed: '请求失败: {msg}',
    copyFailed: '复制失败，请手动复制',
    copied: '已复制',
    copiedMarkdown: '已复制 Markdown',
    copiedRich: '已复制富文本',
    noResponse: '无响应',
    sysPromptAisearch: '你正在处理用户在网页上选中的内容。使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。',
    sysPromptExplain: '你正在处理用户在网页上选中的内容。用1-3句简洁解释选中内容，必要时补充一个简短示例。不要展开长篇论述。',
    sysPromptTranslate: '你正在处理用户在网页上选中的内容。自动检测语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加额外说明。',
    sysPromptSummary: '你正在处理用户在网页上选中的内容。用3-5个要点总结选中内容，每条要点一句话，提炼核心信息即可。',
    sysPromptCopy: '将选中内容复制到剪贴板。',
    userMsgAisearch: '搜索并分析以下内容：\n\n{text}',
    userMsgExplain: '用1-3句话简洁解释以下内容，不需要展开说明。\n\n{text}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3',
    userMsgTranslate: '翻译以下内容，只输出翻译结果：\n\n{text}',
    userMsgSummary: '用3-5个要点总结以下内容，每条要点一句话。\n\n{text}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3',
  },
});

registerTranslations('en', {
  selToolbar: {
    settings: 'Settings',
    settingsTitle: 'Open settings page',
    disableTemporarily: 'Disable temporarily',
    disableTemporarilyTitle: 'Temporarily hide until page refresh',
    disableOnSite: 'Disable on this site',
    disableOnSiteTitle: 'Disable toolbar on this website',
    dragToMove: 'Drag to move',
    moreTools: 'More tools',
    copySelectedTitle: 'Copy selected content',
    askPlaceholder: 'Ask...',
    sendTitle: 'Send',
    aiAnswer: 'AI Answer',
    lockWindow: 'Lock panel',
    unlockWindow: 'Unlock panel',
    close: 'Close',
    copyAll: 'Copy',
    copyRichTitle: 'Copy Markdown text (Ctrl/⌘+Click to copy rich text)',
    regenerate: 'Regenerate',
    suggestedFollowups: '💡 Suggested follow-ups',
    followupPlaceholder: 'Ask a follow-up...',
    sendToSidebar: 'Send to sidebar',
    aiThinking: 'AI is thinking...',
    requestFailed: 'Request failed: {msg}',
    copyFailed: 'Copy failed, please copy manually',
    copied: 'Copied',
    copiedMarkdown: 'Markdown copied',
    copiedRich: 'Rich text copied',
    noResponse: 'No response',
    sysPromptAisearch: 'You are processing content selected by the user on a web page. Use ReAct Agent mode to answer selected questions through multiple rounds of thinking, searching, and reasoning.',
    sysPromptExplain: 'You are processing content selected by the user on a web page. Explain the selected content in 1-3 concise sentences, supplementing with a brief example if necessary. Do not expand into lengthy discussions.',
    sysPromptTranslate: 'You are processing content selected by the user on a web page. Auto-detect language: Chinese→English, English→Chinese, other languages→provide both Chinese and English. Output only the translation result, no additional explanations.',
    sysPromptSummary: 'You are processing content selected by the user on a web page. Summarize the selected content in 3-5 bullet points, one sentence per point, distilling the core information.',
    sysPromptCopy: 'Copy the selected content to the clipboard.',
    userMsgAisearch: 'Search and analyze the following content:\n\n{text}',
    userMsgExplain: 'Explain the following content in 1-3 concise sentences without expanding.\n\n{text}\n\n---\nAfter answering, please provide 3 follow-up questions on a new line in the following format:\n---SUGGESTIONS---\nQuestion 1\nQuestion 2\nQuestion 3',
    userMsgTranslate: 'Translate the following content, output only the translation:\n\n{text}',
    userMsgSummary: 'Summarize the following content in 3-5 bullet points, one sentence per point.\n\n{text}\n\n---\nAfter answering, please provide 3 follow-up questions on a new line in the following format:\n---SUGGESTIONS---\nQuestion 1\nQuestion 2\nQuestion 3',
  },
});

// ==================== SVG 图标 ====================
const ICONS = {
  search: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
  explain: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M12 2a7 7 0 0 0-7 7c0 2.4 1.2 4.5 3 5.7V17h8v-2.3c1.8-1.2 3-3.3 3-5.7a7 7 0 0 0-7-7Z"/></svg>`,
  translate: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>`,
  summary: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/><path d="M8 13h2"/><path d="M8 17h2"/><path d="M14 13h2"/><path d="M14 17h2"/></svg>`,
  copy: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  close: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
  sparkle: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg>`,
  lock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>`,
  unlock: `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>`,
  copyLarge: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  grip: `<svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="8" cy="6" r="1.5"/><circle cx="16" cy="6" r="1.5"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/><circle cx="8" cy="18" r="1.5"/><circle cx="16" cy="18" r="1.5"/></svg>`,
  send: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  more: `<svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  gear: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`,
  refresh: `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/></svg>`,
  block: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>`,
  eyeOff: `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M14.12 14.12a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>`
};

// ==================== DOM 元素 ====================
let toolbarEl = null;
let resultPanelEl = null;
let isToolbarVisible = false;
let isAskMode = false; // 问问AI 输入框模式
let askSavedSelectedText = ''; // 进入问问模式时保存的选中文本
let askSavedRange = null; // 进入问问模式时保存的选中范围
let askSavedLeft = ''; // 进入问问模式时保存的工具栏 left 值
let isResultVisible = false;
let isResultLocked = false;
let resultRawContent = '';     // 回答原始文本（不含追问）
let savedActionText = '';      // 触发工具操作时的选中文本（用于继续提问）
let lastActionType = '';       // 上次操作类型（用于重新生成）
let lastActionCustomPrompt = ''; // 上次操作的自定义系统提示词
let currentSelectedText = '';
let enableSelectionToolbar = true;
let blockedDomains = []; // 域名屏蔽列表
let toolbarTemporarilyHidden = false; // 临时隐藏（页面刷新后恢复）
let suppressNextClick = false;
let lastPanelPos = { x: 0, y: 0 };  // 保存面板位置，避免工具栏隐藏后无法获取
let pendingSelection = null;  // 鼠标拖动选中时暂存，抬起时再显示工具栏
let toolbarTools = null;  // 工具栏工具配置缓存
let toolbarMaxVisible = 5;  // 直接显示的工具数量（固定为5）
let toolbarIconOnly = false; // 图标精简模式
let overflowDropdownEl = null;  // 溢出下拉菜单
let streamContent = '';       // 流式模式下累积的内容
let streamRenderPending = false; // 流式 Markdown 渲染的 rAF 节流标记
let streamRenderToken = 0;    // 渲染令牌：STREAM_DONE/新会话时递增，作废挂起的 rAF 渲染
let shadowSelectionListeners = new Set(); // Shadow DOM 选择监听器集合
let isTopFrame = window.top === window;   // 是否为顶层 frame

// frameset 页面：顶层有 frameset 元素，直接子 frame 成为工具栏宿主
if (!isTopFrame) {
  try {
    if (window.parent === window.top && window.top.document.querySelector('frameset')) {
      isTopFrame = true;
    }
  } catch {
    // 跨域无法访问 top.document，保持默认行为
  }
}
logger.debug('[SelectionToolbar] moduleload isTopFrame:', isTopFrame, 'top===window:', window.top === window, 'hasBody:', !!document.body, 'parent===top:', window.parent === window.top);

let lastSentIframeText = '';              // 防止iframe重复发送相同选区
let pendingIframeSelection = null;       // iframe中等待鼠标抬起的选区数据 { text, x, y }

// frameset 页面没有 document.body，降级挂载到 document.documentElement
function appendToDoc(el) {
  (document.body || document.documentElement).appendChild(el);
}

// 拖拽状态
let dragState = null;

// 通用拖拽实现
function makeDraggable(element, handleSelector) {
  const handle = handleSelector ? element.querySelector(handleSelector) : element;
  if (!handle) return;
  
  handle.style.cursor = 'grab';
  
  handle.addEventListener('mousedown', (e) => {
    // 不拦截按钮点击
    if (e.target.closest('[role="button"]')) return;
    // 右键不拖拽
    if (e.button !== 0) return;
    
    e.preventDefault();
    e.stopPropagation();
    
    const rect = element.getBoundingClientRect();
    dragState = {
      el: element,
      startX: e.clientX,
      startY: e.clientY,
      startLeft: rect.left,
      startTop: rect.top,
      pointerId: e.pointerId || 0
    };
    
    handle.style.cursor = 'grabbing';
    element.style.transition = 'none';
  });
}

// 全局拖拽事件
document.addEventListener('mousemove', (e) => {
  if (!dragState) return;
  
  const dx = e.clientX - dragState.startX;
  const dy = e.clientY - dragState.startY;
  
  let newLeft = dragState.startLeft + dx;
  let newTop = dragState.startTop + dy;
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const rect = dragState.el.getBoundingClientRect();
  
  newLeft = Math.max(0, Math.min(newLeft, viewportWidth - rect.width));
  newTop = Math.max(0, Math.min(newTop, viewportHeight - rect.height));
  
  dragState.el.style.left = newLeft + 'px';
  dragState.el.style.top = newTop + 'px';
});

document.addEventListener('mouseup', () => {
  if (!dragState) return;
  
  // 恢复 transition
  dragState.el.style.transition = '';
  
  // 恢复 cursor
  const handle = dragState.el.querySelector('.aih-result-header') || dragState.el;
  handle.style.cursor = 'grab';
  
  dragState = null;
});

// 检查扩展上下文是否还有效
export function isExtensionValid() {
  try {
    if (typeof chrome !== 'object' || !chrome) return false;
    if (typeof chrome.runtime !== 'object' || !chrome.runtime) return false;
    return !!chrome.runtime.id;
  } catch {
    return false;
  }
}

// ==================== 工具栏工具加载 ====================
const DEFAULT_TOOLS = [
  { id: 'ai-search',  name: t('optionsConst.aiSearch'), systemPrompt: t('selToolbar.sysPromptAisearch'), builtin: true, order: 0 },
  { id: 'explain',   name: t('optionsConst.explain'),   systemPrompt: t('selToolbar.sysPromptExplain'), builtin: true, order: 1 },
  { id: 'translate', name: t('optionsConst.translate'), systemPrompt: t('selToolbar.sysPromptTranslate'), builtin: true, order: 2 },
  { id: 'summary',   name: t('optionsConst.summary'),   systemPrompt: t('selToolbar.sysPromptSummary'), builtin: true, order: 3 },
  { id: 'copy',      name: t('optionsConst.copy'),      systemPrompt: t('selToolbar.sysPromptCopy'), builtin: true, order: 99 }
];

/** 为 DEFAULT_TOOLS 应用当前语言的名称（用于 fallback 场景） */
function applyI18nNames(tools) {
  return tools.map(tool => {
    const i18nName = getBuiltinToolName(tool.id);
    return i18nName ? { ...tool, name: i18nName } : tool;
  });
}

function loadToolbarTools() {
  return new Promise((resolve) => {
    if (!isExtensionValid()) {
      toolbarTools = applyI18nNames([...DEFAULT_TOOLS]);
      resolve(toolbarTools);
      return;
    }
    if (toolbarTools) {
      resolve(toolbarTools);
      return;
    }
    try {
      chrome.storage.local.get(['toolbarTools', 'toolbarIconOnly'], (result) => {
        const rawTools = (result.toolbarTools && result.toolbarTools.length > 0) 
          ? result.toolbarTools 
          : DEFAULT_TOOLS;
        const defaultMap = new Map(DEFAULT_TOOLS.map(t => [t.id, t]));
        toolbarTools = rawTools.map(tool => {
          if (tool.builtin && defaultMap.has(tool.id)) {
            const i18nName = getBuiltinToolName(tool.id);
            return { ...tool, systemPrompt: defaultMap.get(tool.id).systemPrompt, name: i18nName || tool.name };
          }
          return tool;
        });
        toolbarIconOnly = result.toolbarIconOnly || false;
        resolve(toolbarTools);
      });
    } catch {
      toolbarTools = applyI18nNames([...DEFAULT_TOOLS]);
      resolve(toolbarTools);
    }
  });
}

function refreshToolbarCache() {
  toolbarTools = null;
  toolbarIconOnly = false;
  loadToolbarTools();
}

function getToolIcon(toolId) {
  const iconMap = {
    'ai-search': ICONS.search,
    'explain': ICONS.explain,
    'translate': ICONS.translate,
    'summary': ICONS.summary,
    'copy': ICONS.copy,
  };
  return iconMap[toolId] || ICONS.sparkle;
}

function createOverflowDropdown() {
  if (overflowDropdownEl) return;
  
  overflowDropdownEl = document.createElement('div');
  overflowDropdownEl.id = 'aih-overflow-dropdown';
  overflowDropdownEl.className = 'aih-overflow-dropdown';
  overflowDropdownEl.style.display = 'none';
  appendToDoc(overflowDropdownEl);
  
  document.addEventListener('click', (e) => {
    if (overflowDropdownEl && overflowDropdownEl.style.display === 'block') {
      if (!overflowDropdownEl.contains(e.target) && !e.target.closest('.aih-tb-btn-overflow')) {
        overflowDropdownEl.style.display = 'none';
      }
    }
  });
}

function renderOverflowDropdown(overflowTools) {
  if (!overflowDropdownEl) createOverflowDropdown();
  
  let itemsHtml = overflowTools.map(tool => {
    const icon = getToolIcon(tool.id);
    const displayName = tool.builtin ? (getBuiltinToolName(tool.id) || tool.name) : tool.name;
    return `<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${tool.id}">
      <span class="aih-tb-icon">${icon}</span>${displayName}
    </div>`;
  }).join('');
  
  itemsHtml += `<div class="aih-dropdown-divider"></div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="${t('selToolbar.settingsTitle')}">
    <span class="aih-tb-icon">${ICONS.gear}</span>${t('selToolbar.settings')}
  </div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="${t('selToolbar.disableTemporarilyTitle')}">
    <span class="aih-tb-icon">${ICONS.eyeOff}</span>${t('selToolbar.disableTemporarily')}
  </div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="${t('selToolbar.disableOnSiteTitle')}">
    <span class="aih-tb-icon">${ICONS.block}</span>${t('selToolbar.disableOnSite')}
  </div>`;
  
  overflowDropdownEl.innerHTML = itemsHtml;
  
  overflowDropdownEl._clickHandler = (e) => {
    if (e.target.closest('.aih-dropdown-settings')) {
      e.stopPropagation();
      overflowDropdownEl.style.display = 'none';
      try {
        chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'toolbar' }).catch(() => {});
      } catch {
        // 扩展上下文失效时静默忽略
      }
      return;
    }
    
    if (e.target.closest('.aih-dropdown-block')) {
      e.stopPropagation();
      e.preventDefault();
      overflowDropdownEl.style.display = 'none';
      blockCurrentDomain();
      return;
    }
    
    if (e.target.closest('.aih-dropdown-hide')) {
      e.stopPropagation();
      e.preventDefault();
      overflowDropdownEl.style.display = 'none';
      toolbarTemporarilyHidden = true;
      hideToolbar();
      hideResultPanel();
      currentSelectedText = '';
      return;
    }
    
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    overflowDropdownEl.style.display = 'none';
    handleAction(btn.dataset.action, currentSelectedText);
  };
  overflowDropdownEl.addEventListener('click', overflowDropdownEl._clickHandler);
  
  // 键盘支持：Enter/Space 触发点击
  overflowDropdownEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target.closest('[role="button"]');
      if (target) {
        e.preventDefault();
        target.click();
      }
    }
  });
}

// ==================== 工具栏创建 ====================
async function createToolbar() {
  if (toolbarEl) return;
  
  await loadToolbarTools();
  // AI搜索固定在最前，复制固定在最后，均不参与排序
  const tools = [...toolbarTools].sort((a, b) => a.order - b.order);
  const aiSearchTool = tools.find(t => t.id === 'ai-search');
  const configurableTools = tools.filter(t => t.id !== 'ai-search' && t.id !== 'copy');
  const visibleTools = configurableTools.slice(0, toolbarMaxVisible - 1); // 留一位给AI搜索
  const overflowTools = configurableTools.slice(toolbarMaxVisible - 1);
  
  toolbarEl = document.createElement('div');
  toolbarEl.id = 'aih-selection-toolbar';
  
  let buttonsHtml = `<span class="aih-tb-buttons">`;
  buttonsHtml += `<span class="aih-tb-grip" title="${t('selToolbar.dragToMove')}">${ICONS.grip}</span>`;
  
  const iconMode = toolbarIconOnly; // 图标精简模式：仅显示图标
  
  // AI搜索固定在第一个，始终显示
  if (aiSearchTool) {
    buttonsHtml += `<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="${t('optionsConst.aiSearch')}">
      <span class="aih-tb-icon">${ICONS.search}</span>${iconMode ? '' : t('optionsConst.aiSearch')}
    </div>`;
  }
  
  visibleTools.forEach((tool) => {
    const icon = getToolIcon(tool.id);
    const displayName = tool.builtin ? (getBuiltinToolName(tool.id) || tool.name) : tool.name;
    buttonsHtml += `<div class="aih-tb-btn" role="button" tabindex="0" data-action="${tool.id}" title="${displayName}">
      <span class="aih-tb-icon">${icon}</span>${iconMode ? '' : displayName}
    </div>`;
  });
  
  // "更多"按钮始终显示，提供溢出工具 + 设置/屏蔽入口
  buttonsHtml += `<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="${t('selToolbar.moreTools')}">
    <span class="aih-tb-icon">${ICONS.more}</span>
  </div>`;
  renderOverflowDropdown(overflowTools);
  
  // 复制按钮固定在最后
  buttonsHtml += `<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="${t('selToolbar.copySelectedTitle')}">
    <span class="aih-tb-icon">${ICONS.copy}</span>${iconMode ? '' : t('optionsConst.copy')}
  </div>`;
  buttonsHtml += `</span>`; // close .aih-tb-buttons

  // 问问AI 输入框（紧凑内联形态）
  buttonsHtml += `<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="${t('selToolbar.askPlaceholder')}" />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="${t('selToolbar.sendTitle')}">
      <span class="aih-tb-icon">${ICONS.send}</span>
    </div>
  </span>`;
  
  toolbarEl.innerHTML = buttonsHtml;
  
  toolbarEl.addEventListener('click', (e) => {
    if (e.target.closest('.aih-tb-btn-overflow')) {
      e.stopPropagation();
      const btn = e.target.closest('.aih-tb-btn-overflow');
      const rect = btn.getBoundingClientRect();
      if (overflowDropdownEl) {
        overflowDropdownEl.style.display = 
          overflowDropdownEl.style.display === 'block' ? 'none' : 'block';
        overflowDropdownEl.style.top = (rect.bottom + 4) + 'px';
        overflowDropdownEl.style.left = (rect.right - 160) + 'px';
      }
      return;
    }
    
    const btn = e.target.closest('[data-action]');
    if (!btn) return;
    e.stopPropagation();
    
    const action = btn.dataset.action;
    handleAction(action, currentSelectedText);
  });
  
  // 键盘支持：Enter/Space 触发点击
  toolbarEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target.closest('[role="button"]');
      if (target && !target.classList.contains('aih-tb-ask-send')) {
        e.preventDefault();
        target.click();
      }
    }
  });
  
  appendToDoc(toolbarEl);
  
  // 问问AI 输入框事件
  const askInput = toolbarEl.querySelector('.aih-tb-ask-input');
  const askSend = toolbarEl.querySelector('.aih-tb-ask-send');
  const buttonsWrap = toolbarEl.querySelector('.aih-tb-buttons');
  
  const doSend = () => {
    const val = askInput.value.trim();
    if (val) {
      const savedText = askSavedSelectedText; // 先保存，exitAskMode 会清空
      exitAskMode();
      askInput.value = '';
      sendToSidePanelInputWithContext(val, savedText);
      hideToolbar();
    }
  };
  
  const enterAskMode = () => {
    if (isAskMode) return;
    isAskMode = true;
    // 保存当前选中的文本和范围
    askSavedSelectedText = currentSelectedText || '';
    const selection = window.getSelection();
    if (selection.rangeCount > 0) {
      askSavedRange = selection.getRangeAt(0).cloneRange();
    }
    // 保存展开前右侧边缘位置，展开后使用 width 直接限制为 360px
    const oldRight = toolbarEl.getBoundingClientRect().right;
    askSavedLeft = toolbarEl.style.left;
    toolbarEl.classList.add('aih-ask-mode');
    toolbarEl.style.width = '360px';
    // 调整 left 使右侧位置保持不变
    const newLeft = Math.max(8, oldRight - 360);
    toolbarEl.style.left = newLeft + 'px';
    
    // 恢复选中高亮，并聚焦输入框（双重 rAF 确保 DOM 更新完成）
    requestAnimationFrame(() => {
      if (askSavedRange) {
        const sel = window.getSelection();
        sel.removeAllRanges();
        sel.addRange(askSavedRange);
      }
      requestAnimationFrame(() => {
        askInput.focus();
      });
    });
  };
  
  const exitAskMode = () => {
    if (!isAskMode) return;
    isAskMode = false;
    askSavedSelectedText = '';
    askSavedRange = null;
    toolbarEl.classList.remove('aih-ask-mode');
    toolbarEl.style.width = '';
    // 恢复原始 left 位置
    if (askSavedLeft) {
      toolbarEl.style.left = askSavedLeft;
      askSavedLeft = '';
    }
  };
  
  askInput.addEventListener('focus', () => {
    // 如果还没展开（mousedown 没来得及处理），补调
    if (!isAskMode) enterAskMode();
  });
  
  // mousedown 提前展开工具栏，阻止原生聚焦避免 DOM 变化时失焦
  askInput.addEventListener('mousedown', (e) => {
    if (!isAskMode) {
      e.preventDefault(); // 阻止原生 focus
      enterAskMode();
    }
  });
  
  askInput.addEventListener('blur', () => {
    // 延迟检查，以便点击发送按钮时能触发 doSend
    setTimeout(() => {
      if (isAskMode && !toolbarEl.contains(document.activeElement)) {
        exitAskMode();
        hideToolbar();
      }
    }, 150);
  });
  
  askInput.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      exitAskMode();
      askInput.blur();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      doSend();
    }
  });
  
  askSend.addEventListener('mousedown', (e) => {
    e.preventDefault(); // 防止 blur 先触发
    e.stopPropagation();
    doSend();
  });
  
  makeDraggable(toolbarEl, '.aih-tb-grip');
}

// ==================== 结果面板 ====================
function createResultPanel() {
  if (resultPanelEl) return;
  
  resultPanelEl = document.createElement('div');
  resultPanelEl.id = 'aih-selection-result';
  resultPanelEl.innerHTML = `
    <div class="aih-result-header">
      <span>${ICONS.sparkle} ${t('selToolbar.aiAnswer')}</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="${t('selToolbar.lockWindow')}">${ICONS.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="${t('selToolbar.close')}">${ICONS.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="${t('selToolbar.copyRichTitle')}">
          <span class="aih-tb-icon">${ICONS.copyLarge}</span>${t('selToolbar.copyAll')}
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="${t('selToolbar.regenerate')}">
          <span class="aih-tb-icon">${ICONS.refresh}</span>${t('selToolbar.regenerate')}
        </div>
      </div>
      <div class="aih-result-suggestions" style="display:none;">
        <div class="aih-suggestions-label">${t('selToolbar.suggestedFollowups')}</div>
        <div class="aih-suggestions-list"></div>
      </div>
    </div>
    <div class="aih-result-followup">
      <span class="aih-followup-wrap">
        <input type="text" class="aih-followup-input" placeholder="${t('selToolbar.followupPlaceholder')}" />
        <div class="aih-followup-send" role="button" tabindex="0" title="${t('selToolbar.sendToSidebar')}">${ICONS.send}</div>
      </span>
    </div>
  `;
  
  resultPanelEl.querySelector('.aih-result-close').addEventListener('click', (e) => {
    e.stopPropagation();
    hideResultPanel();
  });
  
  resultPanelEl.querySelector('.aih-result-lock').addEventListener('click', (e) => {
    e.stopPropagation();
    toggleResultLock();
  });
  
  resultPanelEl.querySelector('.aih-result-footer').addEventListener('click', (e) => {
    e.stopPropagation();
    const action = e.target.closest('[data-action]')?.dataset?.action;
    if (action === 'regenerate-result') {
      if (!lastActionType || !savedActionText) return;
      sendToAI(lastActionType, savedActionText, lastActionCustomPrompt);
    } else if (action === 'copy-result') {
      // Ctrl/⌘ + 单击：复制富文本；普通单击：复制 Markdown 原文
      if (e.ctrlKey || e.metaKey) {
        copyResultRichContent();
      } else {
        copyResultContent();
      }
    }
  });
  
  // 追问输入框事件
  const followupInput = resultPanelEl.querySelector('.aih-followup-input');
  const followupSend = resultPanelEl.querySelector('.aih-followup-send');
  
  followupSend.addEventListener('click', (e) => {
    e.stopPropagation();
    const text = followupInput.value.trim();
    if (text) {
      sendToSidePanelInput(text);
      followupInput.value = '';
    }
  });
  
  followupInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const text = followupInput.value.trim();
      if (text) {
        sendToSidePanelInput(text);
        followupInput.value = '';
      }
    }
  });
  
  // 推荐追问点击事件（委托在 suggestions-list 上）
  resultPanelEl.querySelector('.aih-suggestions-list').addEventListener('click', (e) => {
    const chip = e.target.closest('.aih-suggestion-chip');
    if (!chip) return;
    e.stopPropagation();
    const question = chip.dataset.question;
    if (question) {
      sendToSidePanelInput(question);
    }
  });
  
  // 键盘支持：Enter/Space 触发点击
  resultPanelEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const target = e.target.closest('[role="button"]');
      if (target) {
        e.preventDefault();
        target.click();
      }
    }
  });
  
  appendToDoc(resultPanelEl);
  
  // 结果面板通过标题栏拖拽
  makeDraggable(resultPanelEl, '.aih-result-header');
}

function showResultPanel(x, y, content, suggestions = []) {
  if (!resultPanelEl) return;
  
  // 流式 → 最终渲染：面板已在显示中，原地更新内容，
  // 不再移出屏外测量重定位，避免面板消失又重现的闪烁
  const alreadyVisible = isResultVisible && resultPanelEl.style.display !== 'none';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  
  // 保持滚动行为：用户未手动上滚时，吸底展示最新内容
  const scrollEl = resultPanelEl.querySelector('.aih-result-scroll');
  const stickBottom = !scrollEl || scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 24;
  body.innerHTML = content;
  if (stickBottom && scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
  
  // 渲染推荐追问
  const suggestionsEl = resultPanelEl.querySelector('.aih-result-suggestions');
  const suggestionsList = resultPanelEl.querySelector('.aih-suggestions-list');
  if (suggestions.length > 0 && suggestionsEl && suggestionsList) {
    suggestionsList.innerHTML = suggestions.map(s => 
      `<div class="aih-suggestion-chip" role="button" tabindex="0" data-question="${escapeHtml(s)}">${escapeHtml(s)}</div>`
    ).join('');
    suggestionsEl.style.display = 'block';
  } else if (suggestionsEl) {
    suggestionsEl.style.display = 'none';
  }
  
  // 已显示时保留当前位置（含用户拖拽后的位置），跳过重新定位
  if (alreadyVisible) return;
  
  // 确保面板始终在 body 最末尾，处于最顶层
  appendToDoc(resultPanelEl);
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  resultPanelEl.style.display = 'flex';
  resultPanelEl.style.left = '-9999px';
  resultPanelEl.style.top = '-9999px';
  
  requestAnimationFrame(() => {
    const rect = resultPanelEl.getBoundingClientRect();
    const panelWidth = rect.width || 420;
    const panelHeight = Math.min(rect.height || 200, 520);

    let left = x - panelWidth / 2;
    if (left < 8) left = 8;
    if (left + panelWidth > viewportWidth - 8) left = viewportWidth - panelWidth - 8;
    
    let top = y - panelHeight - 8;
    if (top < 8) {
      top = y + 8;
    }
    
    resultPanelEl.style.left = left + 'px';
    resultPanelEl.style.top = top + 'px';
    resultPanelEl.style.maxHeight = Math.min(520, viewportHeight - top - 16) + 'px';
    
    isResultVisible = true;
    
    // 再次确保在最顶层（防止 requestAnimationFrame 期间有其他元素插入）
    appendToDoc(resultPanelEl);
  });
}

function showResultLoading(x, y) {
  if (!resultPanelEl) return;
  
  // 保存面板位置，后续显示结果时复用
  lastPanelPos = { x, y };
  
  // 重置锁定状态
  isResultLocked = false;
  updateLockButton();
  
  // 隐藏推荐追问区域
  const suggestionsEl = resultPanelEl.querySelector('.aih-result-suggestions');
  if (suggestionsEl) suggestionsEl.style.display = 'none';
  
  // 清空追问输入框
  const followupInput = resultPanelEl.querySelector('.aih-followup-input');
  if (followupInput) followupInput.value = '';
  
  // 确保面板始终在 body 最末尾，处于最顶层
  appendToDoc(resultPanelEl);
  
  resultPanelEl.style.display = 'flex';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = `<div class="aih-result-loading"><div class="aih-spinner"></div>${t('selToolbar.aiThinking')}</div>`;
  
  positionPanel(resultPanelEl, x, y);
  isResultVisible = true;
  
  hideToolbar();
}

function showResultError(x, y, errorMsg) {
  if (!resultPanelEl) return;
  
  // 重置锁定状态
  isResultLocked = false;
  resultRawContent = '';
  updateLockButton();
  
  // 确保面板始终在 body 最末尾，处于最顶层
  appendToDoc(resultPanelEl);
  
  resultPanelEl.style.display = 'flex';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = `<div class="aih-result-error">${t('selToolbar.requestFailed', { msg: escapeHtml(errorMsg) })}</div>`;
  
  positionPanel(resultPanelEl, x, y);
  isResultVisible = true;
}

function positionPanel(panel, x, y) {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  panel.style.left = '-9999px';
  panel.style.top = '-9999px';
  
  requestAnimationFrame(() => {
    const rect = panel.getBoundingClientRect();
    const panelWidth = rect.width || 420;
    const panelHeight = Math.min(rect.height || 200, 520);
    
    let left = x - panelWidth / 2;
    if (left < 8) left = 8;
    if (left + panelWidth > viewportWidth - 8) left = viewportWidth - panelWidth - 8;
    
    let top = y - panelHeight - 8;
    if (top < 8) {
      top = y + 8;
    }
    
    panel.style.left = left + 'px';
    panel.style.top = top + 'px';
    panel.style.maxHeight = Math.min(520, viewportHeight - top - 16) + 'px';
    
    // 再次确保在最顶层（防止 requestAnimationFrame 期间有其他元素插入）
    appendToDoc(panel);
  });
}

function hideResultPanel() {
  if (!resultPanelEl) return;
  resultPanelEl.style.display = 'none';
  isResultVisible = false;
  isResultLocked = false;
  resultRawContent = '';
  updateLockButton();
}

function toggleResultLock() {
  isResultLocked = !isResultLocked;
  updateLockButton();
}

function updateLockButton() {
  if (!resultPanelEl) return;
  const lockBtn = resultPanelEl.querySelector('.aih-result-lock');
  if (!lockBtn) return;
  if (isResultLocked) {
    lockBtn.innerHTML = ICONS.lock;
    lockBtn.classList.add('locked');
    lockBtn.title = t('selToolbar.unlockWindow');
  } else {
    lockBtn.innerHTML = ICONS.unlock;
    lockBtn.classList.remove('locked');
    lockBtn.title = t('selToolbar.lockWindow');
  }
}

function sendToSidePanelInput(text) {
  if (!text || !isExtensionValid()) return;
  
  const selText = currentSelectedText || savedActionText || '';
  try {
    chrome.runtime.sendMessage({
      type: 'DIRECT_SEND',
      text: text,
      selectedText: selText
    }).catch(err => {
      logger.error('[SelectionToolbar] sendfollow-up tosidebar failed:', err);
    });
  } catch {
    // 扩展上下文失效时静默忽略
  }
}

function sendToSidePanelInputWithContext(text, selectedText) {
  if (!text || !isExtensionValid()) return;
  
  try {
    chrome.runtime.sendMessage({
      type: 'DIRECT_SEND',
      text: text,
      selectedText: selectedText || ''
    }).catch(err => {
      logger.error('[SelectionToolbar] send to sidesidebar failed:', err);
    });
  } catch {
    // 扩展上下文失效时静默忽略
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ==================== 流式 Markdown 实时渲染 ====================
/** rAF 节流：每帧最多渲染一次，避免高频 chunk 造成重复解析 */
function scheduleStreamRender() {
  if (streamRenderPending) return;
  streamRenderPending = true;
  const token = streamRenderToken;
  requestAnimationFrame(() => {
    streamRenderPending = false;
    // 令牌已变（流已结束或新会话开始），丢弃本次挂起的渲染，避免覆盖最终结果
    if (token !== streamRenderToken) return;
    renderStreamContent();
  });
}

/** 将累积的流式内容实时渲染为 Markdown */
function renderStreamContent() {
  if (!resultPanelEl || !isResultVisible) return;
  if (!streamContent) return;
  const body = resultPanelEl.querySelector('.aih-result-body');
  if (!body) return;

  // 流式期间剥离 ---SUGGESTIONS--- 之后的内容，避免追问建议提前闪现
  let text = streamContent;
  const suggestIdx = text.indexOf('---SUGGESTIONS---');
  if (suggestIdx !== -1) text = text.substring(0, suggestIdx);

  // 用户未手动上滚时，渲染后自动吸底展示最新内容
  const scrollEl = resultPanelEl.querySelector('.aih-result-scroll');
  const stickBottom = !scrollEl || scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 24;
  body.innerHTML = '<div class="aih-result-content-stream">' + renderStreamMarkdown(text) + '</div>';
  if (stickBottom && scrollEl) scrollEl.scrollTop = scrollEl.scrollHeight;
}

/** 流式 Markdown 渲染：未闭合的代码围栏临时补全，避免流式中途内容错乱 */
function renderStreamMarkdown(text) {
  if (typeof marked === 'undefined') {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }
  const fenceCount = (text.match(/```/g) || []).length;
  const normalized = fenceCount % 2 === 1 ? text + '\n```' : text;
  return marked.parse(normalized);
}

// ==================== 显示/隐藏 ====================
function showToolbar(x, y) {
  if (!toolbarEl || !currentSelectedText || isResultVisible) return;
  
  // 确保工具栏始终在 body 最末尾，处于最顶层
  appendToDoc(toolbarEl);
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  toolbarEl.style.display = 'flex';
  lastToolbarShowTime = Date.now();
  
  requestAnimationFrame(() => {
    const rect = toolbarEl.getBoundingClientRect();
    const toolbarWidth = rect.width || 300;
    const toolbarHeight = rect.height || 40;
    
    let left = x - toolbarWidth / 2;
    if (left < 8) left = 8;
    if (left + toolbarWidth > viewportWidth - 8) left = viewportWidth - toolbarWidth - 8;
    
    // 首选位置：选中内容上方
    let top = y - toolbarHeight - 10;
    // 如果上方空间不够，放到下方
    if (top < 8) {
      top = y + 10;
    }
    // 最终兜底：确保工具栏一定在可视区域内
    if (top < 8) top = 8;
    if (top + toolbarHeight > viewportHeight - 8) {
      top = viewportHeight - toolbarHeight - 8;
    }
    
    toolbarEl.style.left = left + 'px';
    toolbarEl.style.top = top + 'px';
    
    if (!isToolbarVisible) {
      toolbarEl.classList.add('show');
      isToolbarVisible = true;
    }
  });
}

function hideToolbar() {
  if (!toolbarEl || !isToolbarVisible) return;
  
  if (isAskMode) {
    isAskMode = false;
    askSavedSelectedText = '';
    askSavedRange = null;
    toolbarEl.classList.remove('aih-ask-mode');
    toolbarEl.style.width = '';
    if (askSavedLeft) {
      toolbarEl.style.left = askSavedLeft;
      askSavedLeft = '';
    }
  }
  
  toolbarEl.classList.remove('show');
  toolbarEl.style.display = 'none';
  isToolbarVisible = false;
}

// 获取工具栏当前的屏幕位置（用于结果面板定位）
function getToolbarPosition() {
  if (!toolbarEl) return { x: 0, y: 0 };
  const rect = toolbarEl.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

function getPanelCenter(panel) {
  const rect = panel.getBoundingClientRect();
  return { x: rect.left + rect.width / 2, y: rect.top };
}

// ==================== 选中检测 ====================
function onSelectionChange() {
  if (!isExtensionValid()) return;
  if (!enableSelectionToolbar) return;
  if (!isTopFrame) {
    const result = deepGetSelection();
    logger.debug('[SelectionToolbar] iframe onSelectionChange text:', result.text?.substring(0, 30), 'currentSelectedText:', !!currentSelectedText, 'pendingIframeSelection:', !!pendingIframeSelection);
    if (result.text && result.text.length >= 2) {
      // 暂存选区数据，等待 mouseup 时再发送（与顶层 frame 行为一致）
      const pos = getRangeViewportPosition(result.range);
      pendingIframeSelection = { text: result.text, x: pos.x, y: pos.y };
      logger.debug('[SelectionToolbar] iframe pendingIframeSelection set');
    } else if (currentSelectedText) {
      // 选区被清除，通知顶层 frame 隐藏工具栏
      currentSelectedText = '';
      lastSentIframeText = '';
      pendingIframeSelection = null;
      try {
        chrome.runtime.sendMessage({ type: 'IFRAME_SELECTION_CLEAR' }).catch(() => {});
      } catch {
        // 扩展上下文失效时静默忽略
      }
    }
    return;
  }
  if (blockedDomains.length > 0 && blockedDomains.includes(window.location.hostname)) return;
  if (toolbarTemporarilyHidden) return;
  
  const mainSelection = window.getSelection();
  let text = mainSelection ? mainSelection.toString().trim() : '';
  let range = null;
  
  if (text && text.length >= 2 && mainSelection.rangeCount > 0) {
    range = mainSelection.getRangeAt(0);
  } else {
    const shadowResult = deepGetSelection();
    if (shadowResult.text && shadowResult.text.length >= 2) {
      text = shadowResult.text;
      range = shadowResult.range;
    }
  }
  
  if (!text || text.length < 2) {
    if (!isAskMode) hideToolbar();
    currentSelectedText = '';
    pendingSelection = null;
    return;
  }
  
  const maxLength = 5000;
  const displayText = text.length > maxLength ? text.substring(0, maxLength) + '...' : text;
  
  if (range) {
    const container = range.commonAncestorContainer;
    const editable = container.nodeType === Node.TEXT_NODE 
      ? container.parentElement.closest('[contenteditable], input, textarea')
      : container.closest && container.closest('[contenteditable], input, textarea');
    
    if (editable instanceof HTMLElement) {
      if (editable.tagName === 'INPUT' || editable.tagName === 'TEXTAREA') {
        hideToolbar();
        currentSelectedText = '';
        pendingSelection = null;
        return;
      }
    }
  }
  
  currentSelectedText = displayText;
  
  // 不在这里计算位置，等到鼠标抬起时再计算
  // 这样可以确保位置是在选区完全稳定后才计算的
  pendingSelection = true;
}

let lastIframeDismissTime = 0;           // 最后一次 iframe 关闭请求时间

// ==================== 点击外部隐藏 ====================
function onDocumentClick(e) {
  // 点击在工具栏或结果面板内部，不处理
  if (toolbarEl && toolbarEl.contains(e.target)) return;
  if (resultPanelEl && resultPanelEl.contains(e.target)) return;
  
  // 抑制点击（鼠标抬起后立即触发的点击事件）
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  
  // 隐藏本地工具栏和结果面板
  if (isResultVisible && !isResultLocked) {
    hideResultPanel();
  }
  if (isToolbarVisible && !isAskMode) {
    hideToolbar();
  }
  
  // 通知所有 frame 关闭工具栏和结果面板
  chrome.runtime.sendMessage({ type: 'IFRAME_CLICK_DISMISS' }).catch(() => {});
}

function onMouseUp(e) {
  logger.debug('[SelectionToolbar] onMouseUp isTopFrame:', isTopFrame, 'pendingSelection:', pendingSelection, 'pendingIframeSelection:', !!pendingIframeSelection, 'currentSelectedText:', !!currentSelectedText, 'isToolbarVisible:', isToolbarVisible, 'toolbarEl:', !!toolbarEl);
  
  // 三击（段落全选）：双击已显示的工具栏会被随后的第三次 click 关闭，
  // 提前抑制该 click，保留工具栏；子 iframe 中同样避免上报关闭事件
  if ((e.detail || 1) >= 3) {
    suppressNextClick = true;
  }
  
  // 子iframe：在 mouseup 时发送选区消息（与顶层 frame 行为一致）
  if (!isTopFrame) {
    if (pendingIframeSelection) {
      suppressNextClick = true;
      lastSentIframeText = pendingIframeSelection.text;
      currentSelectedText = pendingIframeSelection.text;
      try {
        // 直接发送给父 frame（避免 background 广播到所有 frame）
        window.parent.postMessage({
          type: 'IFRAME_SELECTION',
          text: pendingIframeSelection.text,
          x: pendingIframeSelection.x,
          y: pendingIframeSelection.y
        }, '*');
      } catch {
        // postMessage 失败时忽略
      }
      try {
        chrome.runtime.sendMessage({
          type: 'IFRAME_SELECTION',
          text: pendingIframeSelection.text,
          x: pendingIframeSelection.x,
          y: pendingIframeSelection.y
        }).catch(() => {});
      } catch {
        // 扩展上下文失效时静默忽略
      }
      pendingIframeSelection = null;
    } else if ((e.detail || 1) >= 3) {
      // 三击（段落全选）：选区在 mouseup 之后才稳定，延迟重读选区再上报；无选中内容时不发送
      setTimeout(() => {
        const result = deepGetSelection();
        if (!result.text || result.text.length < 2) return;
        const pos = getRangeViewportPosition(result.range);
        lastSentIframeText = result.text;
        currentSelectedText = result.text;
        try {
          window.parent.postMessage({
            type: 'IFRAME_SELECTION',
            text: result.text,
            x: pos.x,
            y: pos.y
          }, '*');
        } catch {
          // postMessage 失败时忽略
        }
        try {
          chrome.runtime.sendMessage({
            type: 'IFRAME_SELECTION',
            text: result.text,
            x: pos.x,
            y: pos.y
          }).catch(() => {});
        } catch {
          // 扩展上下文失效时静默忽略
        }
      }, 60);
    }
    return;
  }
  
  // 工具栏已显示时，不重新定位（点击工具栏按钮导致；三击时保留双击已显示的选区工具栏）
  if (isToolbarVisible) return;
  
  if (pendingSelection && currentSelectedText) {
    suppressNextClick = true;
    showToolbarFromSelection();
  } else if ((e.detail || 1) >= 3) {
    // 三击（段落全选）：第三次 mousedown 会先折叠选区导致 pendingSelection 被清空，
    // 段落选区在 mouseup 之后才稳定，延迟重新检测；无有效选区则不显示工具栏
    setTimeout(() => {
      if (isAskMode) return;
      onSelectionChange();
      if (pendingSelection && currentSelectedText) {
        showToolbarFromSelection();
      }
    }, 60);
  }
}

/** 基于当前选区计算位置并显示工具栏 */
function showToolbarFromSelection() {
  if (!pendingSelection || !currentSelectedText || isToolbarVisible) return;
  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      x = rect.left + rect.width / 2;
      y = rect.top;
    }
  }
  
  if (x === window.innerWidth / 2 && y === window.innerHeight / 2) {
    const shadowResult = deepGetSelection();
    if (shadowResult.text && shadowResult.text.length >= 2) {
      const pos = getRangeViewportPosition(shadowResult.range);
      x = pos.x;
      y = pos.y;
    }
  }
  
  // 显示工具栏前，先通知所有 frame 关闭已有的工具栏和结果面板
  try { chrome.runtime.sendMessage({ type: 'IFRAME_CLICK_DISMISS' }).catch(() => {}); } catch { /* 扩展上下文失效时静默忽略 */ }
  
  showToolbar(x, y);
  pendingSelection = null;
}

// ==================== 滚动/缩放时的处理 ====================
function onScrollOrResize() {
  if (isAskMode) return;
  
  // 子iframe中：滚动时重新发送选区位置到顶层frame
  if (!isTopFrame && currentSelectedText) {
    const result = deepGetSelection();
    if (result.text) {
      const pos = getRangeViewportPosition(result.range);
      try {
        window.parent.postMessage({
          type: 'IFRAME_SELECTION',
          text: result.text,
          x: pos.x,
          y: pos.y
        }, '*');
      } catch {
        // postMessage 失败时忽略
      }
      try {
        chrome.runtime.sendMessage({
          type: 'IFRAME_SELECTION',
          text: result.text,
          x: pos.x,
          y: pos.y
        }).catch(() => {});
      } catch {
        // 扩展上下文失效时静默忽略
      }
    }
    return;
  }
  
  if (!isToolbarVisible) return;
  
  // 滚动时：尝试根据当前选中内容重新定位工具栏
  // 先尝试获取普通选区
  const selection = window.getSelection();
  if (selection && selection.rangeCount > 0 && currentSelectedText) {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    if (rect.width > 0 || rect.height > 0) {
      showToolbar(rect.left + rect.width / 2, rect.top);
      return;
    }
  }
  
  // 再尝试获取 Shadow DOM 中的选区
  const shadowResult = deepGetSelection();
  if (shadowResult.text && shadowResult.text.length >= 2 && currentSelectedText) {
    const pos = getRangeViewportPosition(shadowResult.range);
    showToolbar(pos.x, pos.y);
    return;
  }
  
  hideToolbar();
}
function onResize() {
  if (isAskMode) return;
  if (isToolbarVisible) hideToolbar();
}

// ==================== 操作处理 ====================
function handleAction(action, text) {
  if (!text) return;
  
  savedActionText = text; // 保存用于继续提问时带入选中的内容
  if (action === 'copy') {
    copySelectedText(text);
    hideToolbar();
    return;
  }
  
  lastActionType = action;
  lastActionCustomPrompt = '';
  
  const BUILTIN_ACTIONS = ['ai-search', 'explain', 'translate', 'summary'];
  if (BUILTIN_ACTIONS.includes(action)) {
    sendToAI(action, text);
    return;
  }
  
  // 自定义工具
  const tool = toolbarTools.find(t => t.id === action);
  if (tool) {
    lastActionCustomPrompt = tool.systemPrompt || '';
    sendToAI(action, text, tool.systemPrompt);
  }
}

function copySelectedText(text) {
  copyToClipboard(text).then(() => {
    showCopyToast();
  }).catch(err => {
    logger.error('[SelectionToolbar] copy failed:', err);
    showCopyErrorToast();
  });
}

function copyResultContent() {
  const text = resultRawContent;
  if (!text) return;
  copyToClipboard(text).then(() => {
    showCopyToast(t('selToolbar.copiedMarkdown'));
  }).catch(err => {
    logger.error('[SelectionToolbar] copyresult failed:', err);
    showCopyErrorToast();
  });
}

/** 一键复制富文本（渲染后的 Markdown，同时附带纯文本） */
function copyResultRichContent() {
  const text = resultRawContent;
  if (!text) return;
  const html = typeof marked !== 'undefined'
    ? marked.parse(text)
    : escapeHtml(text).replace(/\n/g, '<br>');
  // 包裹一层基础样式，保证粘贴到第三方编辑器时的基本可读性
  const htmlDoc = `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;font-size:14px;line-height:1.6;">${html}</div>`;

  if (navigator.clipboard && typeof ClipboardItem !== 'undefined') {
    try {
      const item = new ClipboardItem({
        'text/html': new Blob([htmlDoc], { type: 'text/html' }),
        'text/plain': new Blob([text], { type: 'text/plain' }),
      });
      navigator.clipboard.write([item]).then(() => {
        showCopyToast(t('selToolbar.copiedRich'));
      }).catch(err => {
        logger.error('[SelectionToolbar] richcopy failed:', err);
        fallbackRichCopy();
      });
      return;
    } catch (err) {
      logger.error('[SelectionToolbar] richcopy failed:', err);
    }
  }
  fallbackRichCopy();
}

/** 富文本复制兜底：选中已渲染内容区域后用 execCommand 复制，完成后恢复页面原选区 */
function fallbackRichCopy() {
  const body = resultPanelEl && resultPanelEl.querySelector('.aih-result-body');
  if (!body) {
    showCopyErrorToast();
    return;
  }
  const sel = window.getSelection();
  const prevRanges = [];
  for (let i = 0; i < sel.rangeCount; i++) prevRanges.push(sel.getRangeAt(i).cloneRange());
  const range = document.createRange();
  range.selectNodeContents(body);
  sel.removeAllRanges();
  sel.addRange(range);
  try {
    if (document.execCommand('copy')) {
      showCopyToast(t('selToolbar.copiedRich'));
    } else {
      showCopyErrorToast();
    }
  } catch (err) {
    logger.error('[SelectionToolbar] fallback richcopy failed:', err);
    showCopyErrorToast();
  } finally {
    sel.removeAllRanges();
    prevRanges.forEach(r => sel.addRange(r));
  }
}

async function copyToClipboard(text) {
  if (!navigator.clipboard) {
    return fallbackCopy(text);
  }
  
  try {
    await navigator.clipboard.writeText(text);
  } catch (err) {
    if (err.name === 'NotAllowedError' || err.name === 'SecurityError') {
      return fallbackCopy(text);
    }
    throw err;
  }
}

function fallbackCopy(text) {
  return new Promise((resolve, reject) => {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-9999px';
    textarea.style.opacity = '0';
    appendToDoc(textarea);
    
    try {
      textarea.select();
      textarea.setSelectionRange(0, text.length);
      
      const success = document.execCommand('copy');
      if (success) {
        resolve();
      } else {
        reject(new Error('execCommand copy failed'));
      }
    } catch (err) {
      reject(err);
    } finally {
      textarea.remove();
    }
  });
}

function showCopyErrorToast() {
  const oldToast = document.getElementById('aih-copy-toast');
  if (oldToast) oldToast.remove();
  
  const toast = document.createElement('div');
  toast.id = 'aih-copy-toast';
  toast.textContent = t('selToolbar.copyFailed');
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(239, 68, 68, 0.9);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    animation: aih-toast-in 0.2s ease-out, aih-toast-out 0.2s 1.5s ease-in forwards;
  `;
  
  appendToDoc(toast);
  toast.style.zIndex = '2147483647';
  setTimeout(() => toast.remove(), 1800);
}

function showCopyToast(text) {
  const oldToast = document.getElementById('aih-copy-toast');
  if (oldToast) oldToast.remove();
  
  const toast = document.createElement('div');
  toast.id = 'aih-copy-toast';
  toast.textContent = text || t('selToolbar.copied');
  toast.style.cssText = `
    position: fixed;
    top: 50%;
    left: 50%;
    transform: translate(-50%, -50%);
    background: rgba(0, 0, 0, 0.75);
    color: #fff;
    padding: 10px 24px;
    border-radius: 8px;
    font-size: 14px;
    z-index: 2147483647;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    pointer-events: none;
    animation: aih-toast-in 0.2s ease-out, aih-toast-out 0.2s 1s ease-in forwards;
  `;
  
  if (!document.getElementById('aih-toast-anim')) {
    const anim = document.createElement('style');
    anim.id = 'aih-toast-anim';
    anim.textContent = `
      @keyframes aih-toast-in { from { opacity: 0; transform: translate(-50%, -50%) scale(0.9); } to { opacity: 1; transform: translate(-50%, -50%) scale(1); } }
      @keyframes aih-toast-out { from { opacity: 1; } to { opacity: 0; } }
    `;
    document.head.appendChild(anim);
  }
  
  appendToDoc(toast);
  // 确保 toast 在最顶层
  toast.style.zIndex = '2147483647';
  setTimeout(() => toast.remove(), 1300);
}

function sendToAI(action, text, customSystemPrompt) {
  if (!isExtensionValid()) {
    logger.warn('[SelectionToolbar] extensiontextexpired,pleaserefreshpage');
    return;
  }
  
  const actionLabels = {
    'ai-search': t('selToolbar.userMsgAisearch', { text }),
    'explain': t('selToolbar.userMsgExplain', { text }),
    'translate': t('selToolbar.userMsgTranslate', { text }),
    'summary': t('selToolbar.userMsgSummary', { text }),
  };
  
  const message = customSystemPrompt ? `请处理以下内容：\n\n${text}` : (actionLabels[action] || text);
  
  // AI搜索：打开侧边栏，不显示浮动面板
  if (action === 'ai-search') {
    hideToolbar();
    
    // 清除页面选中文本，避免 Side Panel 的 setInterval 重复检测到选中内容
    window.getSelection().removeAllRanges();
    
    try {
      chrome.runtime.sendMessage({
        type: 'SELECTION_TOOLBAR_ACTION',
        action: action,
        text: text,
        prompt: message
      }).catch(err => {
        logger.error('[SelectionToolbar] sendmessage failed:', err);
      });
    } catch {
      // 扩展上下文失效时静默忽略
    }
    return;
  }
  
  createResultPanel();
  
  const actionTitles = {
    'ai-search': t('optionsConst.aiSearch'),
    'explain': t('optionsConst.explain'),
    'translate': t('optionsConst.translate'),
    'summary': t('optionsConst.summary')
  };
  let panelTitle = actionTitles[action];
  if (!panelTitle && toolbarTools) {
    const tool = toolbarTools.find(t => t.id === action);
    if (tool) {
      panelTitle = tool.builtin ? (getBuiltinToolName(tool.id) || tool.name) : tool.name;
    } else {
      panelTitle = t('selToolbar.aiAnswer');
    }
  }
  const titleSpan = resultPanelEl.querySelector('.aih-result-header span');
  if (titleSpan) {
    titleSpan.innerHTML = `${ICONS.sparkle} ${panelTitle || t('selToolbar.aiAnswer')}`;
  }
  
  const pos = isResultVisible && resultPanelEl
    ? getPanelCenter(resultPanelEl)
    : getToolbarPosition();
  showResultLoading(pos.x, pos.y);
  
  try {
    chrome.runtime.sendMessage({
      type: 'SELECTION_TOOLBAR_ACTION',
      action: action,
      text: text,
      prompt: message,
      systemPrompt: customSystemPrompt || ''
    }).catch(err => {
      logger.error('[SelectionToolbar] sendmessage failed:', err);
      showResultError(pos.x, pos.y, err.message);
    });
  } catch {
    // 扩展上下文失效时静默忽略
  }
}

// ==================== 监听 AI 响应 ====================
if (isExtensionValid()) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!isExtensionValid()) return;
  
  if (message.type === 'IFRAME_SELECTION') {
    if (!isTopFrame) return;
    
    logger.debug('[SelectionToolbar] recei to  IFRAME_SELECTION text:', message.text?.substring(0, 30), 'isToolbarVisible:', isToolbarVisible, 'isResultVisible:', isResultVisible);
    
    currentSelectedText = message.text;
    
    // 如果宿主 frame 不是顶层窗口（如 frameset 子 frame），将顶层视口坐标转换为当前 frame 视口坐标
    let adjX = message.x;
    let adjY = message.y;
    if (window.top !== window && window.frameElement) {
      try {
        const frameRect = window.frameElement.getBoundingClientRect();
        adjX = message.x - frameRect.left;
        adjY = message.y - frameRect.top;
      } catch {
        // frameElement 访问失败，使用原始坐标
      }
    }
    
    // 工具栏已显示时，只更新位置，不重新show（避免跳动）
    if (isToolbarVisible && toolbarEl && currentSelectedText) {
      requestAnimationFrame(() => {
        const viewportWidth = window.innerWidth;
        const toolbarWidth = toolbarEl.offsetWidth || 300;
        const toolbarHeight = toolbarEl.offsetHeight || 40;
        let left = adjX - toolbarWidth / 2;
        if (left < 8) left = 8;
        if (left + toolbarWidth > viewportWidth - 8) left = viewportWidth - toolbarWidth - 8;
        let top = adjY - toolbarHeight - 8;
        if (top < 8) top = adjY + 8;
        toolbarEl.style.left = left + 'px';
        toolbarEl.style.top = top + 'px';
      });
      return;
    }
    
    pendingSelection = { x: adjX, y: adjY };
    
    if (currentSelectedText && currentSelectedText.length >= 2) {
      showToolbar(adjX, adjY);
    }
    return;
  }
  
  if (message.type === 'IFRAME_SELECTION_CLEAR') {
    if (!isTopFrame) return;
    if (isToolbarVisible && !isAskMode) {
      hideToolbar();
      currentSelectedText = '';
    }
    return;
  }
  
  if (message.type === 'IFRAME_CLICK_DISMISS') {
    const now = Date.now();
    if (isToolbarVisible && toolbarEl && now - lastToolbarShowTime > 300) {
      hideToolbar();
      currentSelectedText = '';
    }
    if (isResultVisible && !isResultLocked) {
      hideResultPanel();
    }
    return;
  }
  
  if (!isTopFrame) {
    return;
  }
  
  // 流式输出：开始（保留 loading 动画，等第一个 chunk 到达后再替换）
  if (message.type === 'SELECTION_TOOLBAR_STREAM_START') {
    streamContent = '';
    streamRenderPending = false;
    streamRenderToken++;
    return;
  }
  
  // 流式输出：内容增量（rAF 节流，实时渲染 Markdown）
  if (message.type === 'SELECTION_TOOLBAR_STREAM_CHUNK') {
    streamContent += (message.delta || '');
    scheduleStreamRender();
    return;
  }
  
  // 流式输出：完成
  if (message.type === 'SELECTION_TOOLBAR_STREAM_DONE') {
    // 先作废挂起的流式渲染，防止其用已清空的内容覆盖最终结果
    streamRenderToken++;
    // 确保收到所有内容
    if (message.finalContent) {
      streamContent = message.finalContent;
    }
    
    const rawContent = streamContent || t('selToolbar.noResponse');
    resultRawContent = streamContent;
    
    // 解析 ---SUGGESTIONS--- 分隔符
    let answerContent = rawContent;
    let suggestions = [];
    const suggestIdx = rawContent.indexOf('---SUGGESTIONS---');
    if (suggestIdx !== -1) {
      answerContent = rawContent.substring(0, suggestIdx).trim();
      resultRawContent = answerContent;
      const suggestBlock = rawContent.substring(suggestIdx + '---SUGGESTIONS---'.length);
      suggestions = suggestBlock
        .split('\n')
        .map(s => s.replace(/^[\d]+[\.\、\s]+/, '').trim())
        .filter(s => s.length > 0)
        .slice(0, 3);
    }
    
    // 用 marked 解析 Markdown，渲染最终结果
    const htmlContent = typeof marked !== 'undefined'
      ? marked.parse(answerContent)
      : escapeHtml(answerContent).replace(/\n/g, '<br>');
    showResultPanel(lastPanelPos.x, lastPanelPos.y, htmlContent, suggestions);
    
    streamContent = '';
    return;
  }
  
  // 非流式：一次性返回完整结果
  if (message.type === 'SELECTION_TOOLBAR_RESULT') {
    if (message.error) {
      resultRawContent = '';
      showResultError(lastPanelPos.x, lastPanelPos.y, message.error);
    } else {
      const rawContent = message.content || t('selToolbar.noResponse');
      
      // 解析 ---SUGGESTIONS--- 分隔符，分离回答和追问
      let answerContent = rawContent;
      resultRawContent = rawContent;
      let suggestions = [];
      const suggestIdx = rawContent.indexOf('---SUGGESTIONS---');
      if (suggestIdx !== -1) {
        answerContent = rawContent.substring(0, suggestIdx).trim();
        resultRawContent = answerContent;  // 复制时只复制回答部分
        const suggestBlock = rawContent.substring(suggestIdx + '---SUGGESTIONS---'.length);
        suggestions = suggestBlock
          .split('\n')
          .map(s => s.replace(/^[\d]+[\.\、\s]+/, '').trim())  // 去掉序号前缀
          .filter(s => s.length > 0)
          .slice(0, 3);
      }
      
      // 使用 marked 解析 Markdown 内容
      const htmlContent = typeof marked !== 'undefined' 
        ? marked.parse(answerContent) 
        : escapeHtml(answerContent).replace(/\n/g, '<br>');
      showResultPanel(lastPanelPos.x, lastPanelPos.y, htmlContent, suggestions);
    }
  }
});
}

// ==================== 域名屏蔽 ====================
function blockCurrentDomain() {
  if (!isExtensionValid()) return;
  const hostname = window.location.hostname;
  try {
    chrome.storage.local.get(['blockedDomains'], (result) => {
      try {
        const list = result.blockedDomains || [];
        if (!list.includes(hostname)) {
          list.push(hostname);
          chrome.storage.local.set({ blockedDomains: list }, () => {
            blockedDomains = list;
            hideToolbar();
            hideResultPanel();
            currentSelectedText = '';
          });
        }
      } catch {
        // 扩展上下文失效时静默忽略
      }
    });
  } catch {
    // 扩展上下文失效时静默忽略
  }
}

// ==================== 监听开关状态变化 ====================
function loadToggleState() {
  if (!isExtensionValid()) return;
  
  chrome.storage.local.get(['enableSelectionToolbar', 'blockedDomains'], (result) => {
    enableSelectionToolbar = result.enableSelectionToolbar !== undefined ? !!result.enableSelectionToolbar : true;
    blockedDomains = result.blockedDomains || [];
    logger.debug('[SelectionToolbar] toggle state:', enableSelectionToolbar ? 'enabled' : 'disabled', 'blocked domains:', blockedDomains.length);
  });
}

if (isExtensionValid()) {
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (!isExtensionValid()) return;
    
    if (areaName === 'local' && changes.enableSelectionToolbar) {
      enableSelectionToolbar = !!(changes.enableSelectionToolbar.newValue);
      if (!enableSelectionToolbar) {
        hideToolbar();
        hideResultPanel();
        currentSelectedText = '';
      }
    }
    
    if (areaName === 'local' && changes.blockedDomains) {
      blockedDomains = changes.blockedDomains.newValue || [];
    }
    
    if (areaName === 'local' && changes.toolbarTools) {
      refreshToolbarCache();
    }
  });
}

// 语言切换时刷新工具栏缓存并重建 DOM（内置工具名称随语言变化）
subscribe(() => {
  refreshToolbarCache();
  // 重建工具栏 DOM 以反映新语言的工具名称
  if (toolbarEl) {
    toolbarEl.remove();
    toolbarEl = null;
  }
  createToolbar();
  // 重建结果面板以确保新语言文本立即生效
  if (resultPanelEl) {
    resultPanelEl.remove();
    resultPanelEl = null;
    isResultVisible = false;
    isResultLocked = false;
    resultRawContent = '';
  }
});

// ==================== 导出的启动/停止函数 ====================
export function initSelectionToolbar() {
  injectStyles();
  createToolbar();
  createResultPanel();
  loadToggleState();
  
  document.addEventListener('selectionchange', onSelectionChange);
  document.addEventListener('click', onDocumentClick, true);
  document.addEventListener('mouseup', onMouseUp, true);
  window.addEventListener('scroll', onScrollOrResize, true);
  window.addEventListener('resize', onResize);
  
  // 监听来自子 iframe 的消息（选区、点击关闭等）
  window.addEventListener('message', (event) => {
    // 处理来自子 iframe 的选区消息（直接发给父 frame，避免 background 广播到所有 frame）
    if (event.data?.type === 'IFRAME_SELECTION' && isTopFrame) {
      currentSelectedText = event.data.text;
      
      // 将顶层视口坐标转换为当前 frame 视口坐标
      let adjX = event.data.x;
      let adjY = event.data.y;
      if (window.top !== window && window.frameElement) {
        try {
          const frameRect = window.frameElement.getBoundingClientRect();
          adjX = event.data.x - frameRect.left;
          adjY = event.data.y - frameRect.top;
        } catch {
          // frameElement 访问失败，使用原始坐标
        }
      }
      
      // 工具栏已显示时，只更新位置
      if (isToolbarVisible && toolbarEl && currentSelectedText) {
        requestAnimationFrame(() => {
          const viewportWidth = window.innerWidth;
          const toolbarWidth = toolbarEl.offsetWidth || 300;
          const toolbarHeight = toolbarEl.offsetHeight || 40;
          let left = adjX - toolbarWidth / 2;
          if (left < 8) left = 8;
          if (left + toolbarWidth > viewportWidth - 8) left = viewportWidth - toolbarWidth - 8;
          let top = adjY - toolbarHeight - 8;
          if (top < 8) top = adjY + 8;
          toolbarEl.style.left = left + 'px';
          toolbarEl.style.top = top + 'px';
        });
        return;
      }
      
      pendingSelection = { x: adjX, y: adjY };
      
      if (currentSelectedText && currentSelectedText.length >= 2) {
        showToolbar(adjX, adjY);
      }
      return;
    }
    
    if (event.data?.type === 'IFRAME_CLICK_DISMISS' && isTopFrame) {
      // 工具栏由 IFRAME_SELECTION_CLEAR 消息驱动隐藏，此处只处理结果面板
      if (isResultVisible && !isResultLocked) {
        hideResultPanel();
      }
    }
  });
  
  if (isTopFrame) {
    shadowSelectionListeners = attachSelectionListeners(onSelectionChange);
    
    const mutationObserver = new MutationObserver(() => {
      removeSelectionListeners(shadowSelectionListeners);
      shadowSelectionListeners = attachSelectionListeners(onSelectionChange);
    });
    mutationObserver.observe(document.body, { childList: true, subtree: true });
  }
  
  logger.debug('[SelectionToolbar] initialization complete', isTopFrame ? '(toplayerframe)' : '(subframe)');
}

export function destroySelectionToolbar() {
  document.removeEventListener('selectionchange', onSelectionChange);
  document.removeEventListener('click', onDocumentClick, true);
  document.removeEventListener('mouseup', onMouseUp, true);
  window.removeEventListener('scroll', onScrollOrResize, true);
  window.removeEventListener('resize', onResize);
  
  removeSelectionListeners(shadowSelectionListeners);
  
  hideToolbar();
  hideResultPanel();
  
  if (toolbarEl) {
    toolbarEl.remove();
    toolbarEl = null;
  }
  if (resultPanelEl) {
    resultPanelEl.remove();
    resultPanelEl = null;
  }
  
  const style = document.getElementById('aih-selection-toolbar-styles');
  if (style) style.remove();
}