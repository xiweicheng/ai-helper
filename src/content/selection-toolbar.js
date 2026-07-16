// content/selection-toolbar.js - 选中文本浮动工具栏（豆包风格）

import { deepGetSelection, getRangeViewportPosition, attachSelectionListeners, removeSelectionListeners } from './shadow-dom-utils.js';

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
let shadowSelectionListeners = new Set(); // Shadow DOM 选择监听器集合
let isTopFrame = window.top === window;   // 是否为顶层 frame
let lastSentIframeText = '';              // 防止iframe重复发送相同选区
let pendingIframeSelection = null;       // iframe中等待鼠标抬起的选区数据 { text, x, y }

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
function isExtensionValid() {
  try {
    if (typeof chrome !== 'object' || !chrome) return false;
    if (typeof chrome.runtime !== 'object' || !chrome.runtime) return false;
    return !!chrome.runtime.id;
  } catch {
    return false;
  }
}

// ==================== 样式注入 ====================
function injectStyles() {
  if (document.getElementById('aih-selection-toolbar-styles')) return;
  
  const style = document.createElement('style');
  style.id = 'aih-selection-toolbar-styles';
  style.textContent = `
    #aih-selection-toolbar {
      position: fixed;
      z-index: 2147483647;
      display: none;
      align-items: center;
      gap: 1px;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.95);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid #e8e8e8;
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
    }
    #aih-selection-toolbar.show {
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
      color: #333;
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
      background: #f0f0f0;
    }
    #aih-selection-toolbar .aih-tb-btn:active {
      background: #e4e4e4;
    }
    #aih-selection-toolbar .aih-tb-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    #aih-selection-toolbar .aih-tb-divider {
      width: 1px;
      height: 14px;
      background: #e0e0e0;
      margin: 0 1px;
      flex-shrink: 0;
    }
    #aih-selection-toolbar .aih-tb-grip {
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 4px 2px;
      color: #bbb;
      cursor: grab;
      flex-shrink: 0;
      border-radius: 6px;
      transition: color 0.15s;
    }
    #aih-selection-toolbar .aih-tb-grip:hover {
      color: #666;
    }
    #aih-selection-toolbar .aih-tb-grip:active {
      cursor: grabbing;
    }
    #aih-selection-toolbar .aih-tb-btn.primary {
      background: #3b82f6;
      color: #fff;
      font-weight: 500;
    }
    #aih-selection-toolbar .aih-tb-btn.primary:hover {
      background: #2563eb;
    }
    #aih-selection-toolbar .aih-tb-btn.primary .aih-tb-icon {
      color: #fff;
    }
    
    /* 溢出下拉菜单 */
    .aih-overflow-dropdown {
      position: fixed;
      z-index: 2147483646;
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid #e8e8e8;
      border-radius: 10px;
      box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12), 0 1px 3px rgba(0, 0, 0, 0.06);
      padding: 4px;
      min-width: 140px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
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
      color: #333;
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
      background: #f0f0f0;
    }
    .aih-overflow-dropdown .aih-dropdown-item .aih-tb-icon {
      display: flex;
      align-items: center;
      flex-shrink: 0;
    }

    /* 下拉菜单分隔线 */
    .aih-overflow-dropdown .aih-dropdown-divider {
      height: 1px;
      background: #e8e8e8;
      margin: 4px 8px;
    }
    /* 下拉菜单设置按钮 */
    .aih-overflow-dropdown .aih-dropdown-settings {
      color: #555;
    }
    .aih-overflow-dropdown .aih-dropdown-settings:hover {
      background: #f0f0f0;
      color: #667eea;
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
      border: 1px solid #ddd;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
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
      color: #333;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      line-height: 1.4;
      transition: flex 0.2s ease;
      box-sizing: border-box;
    }
    #aih-selection-toolbar .aih-tb-ask-input::placeholder {
      color: #bbb;
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
      background: rgba(255, 255, 255, 0.98);
      backdrop-filter: blur(16px);
      -webkit-backdrop-filter: blur(16px);
      border: 1px solid #e8e8e8;
      border-radius: 14px;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.12), 0 2px 8px rgba(0, 0, 0, 0.06);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.65;
      color: #333;
      overflow: hidden;
      animation: aih-panel-in 0.2s ease-out;
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
      border-bottom: 1px solid #f0f0f0;
      background: #fafafa;
      font-size: 15px;
      color: #555;
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
      color: #999;
      cursor: pointer;
      transition: background 0.15s, color 0.15s;
      padding: 0;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-result-lock:hover,
    #aih-selection-result .aih-result-close:hover {
      background: #e8e8e8;
      color: #555;
    }
    #aih-selection-result .aih-result-lock.locked {
      color: #3b82f6;
    }
    #aih-selection-result .aih-result-body {
      padding: 12px 14px;
      word-break: break-word;
    }
    #aih-selection-result .aih-result-body p {
      margin: 0 0 8px;
    }
    #aih-selection-result .aih-result-body p:last-child {
      margin-bottom: 0;
    }
    #aih-selection-result .aih-result-body pre {
      background: #f5f5f5;
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
      background: #f0f0f0;
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
      border-left: 3px solid #3b82f6;
      margin: 8px 0;
      padding: 4px 12px;
      color: #666;
      background: #f8f9fa;
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
      border: 1px solid #e0e0e0;
      padding: 6px 10px;
      text-align: left;
    }
    #aih-selection-result .aih-result-body th {
      background: #f5f5f5;
      font-weight: 600;
    }
    #aih-selection-result .aih-result-body a {
      color: #3b82f6;
      text-decoration: none;
    }
    #aih-selection-result .aih-result-body a:hover {
      text-decoration: underline;
    }
    #aih-selection-result .aih-result-body hr {
      border: none;
      border-top: 1px solid #e0e0e0;
      margin: 12px 0;
    }
    #aih-selection-result .aih-result-loading {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 20px 14px;
      color: #888;
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
      border: 2px solid #e0e0e0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: aih-spin 0.8s linear infinite;
    }
    @keyframes aih-spin {
      to { transform: rotate(360deg); }
    }
    #aih-selection-result .aih-result-error {
      padding: 16px 14px;
      color: #e53e3e;
      font-size: 13px;
    }
    #aih-selection-result .aih-result-footer {
      display: flex;
      gap: 6px;
      padding: 8px 14px;
      background: #fafafa;
    }
    #aih-selection-result .aih-result-footer-btn {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 5px 10px;
      border: none;
      border-radius: 6px;
      background: transparent;
      color: #666;
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
      background: #e8e8e8;
      color: #333;
    }
    #aih-selection-result .aih-result-footer-btn .aih-tb-icon {
      display: flex;
      align-items: center;
    }
    /* 推荐追问 */
    #aih-selection-result .aih-result-suggestions {
      padding: 10px 14px;
      border-top: 1px solid #f0f0f0;
    }
    #aih-selection-result .aih-suggestions-label {
      font-size: 11px;
      color: #999;
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
      border: 1px solid #e8e8e8;
      border-radius: 8px;
      background: #fafafa;
      color: #333;
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
      background: #eff6ff;
      border-color: #3b82f6;
      color: #2563eb;
    }
    /* 追问输入框 */
    #aih-selection-result .aih-result-followup {
      display: flex;
      flex-shrink: 0;
      align-items: center;
      padding: 8px 14px;
      border-top: 1px solid #f0f0f0;
    }
    #aih-selection-result .aih-followup-wrap {
      display: flex;
      align-items: center;
      flex: 1;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
      background: #fff;
      transition: border-color 0.15s;
    }
    #aih-selection-result .aih-followup-wrap:focus-within {
      border-color: #3b82f6;
    }
    #aih-selection-result .aih-followup-input {
      flex: 1;
      padding: 6px 8px;
      border: none;
      background: transparent;
      font-size: 13px;
      font-family: inherit;
      outline: none;
      color: #333;
    }
    #aih-selection-result .aih-followup-input::placeholder {
      color: #bbb;
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
      color: #3b82f6;
      cursor: pointer;
      transition: color 0.15s;
      box-sizing: border-box;
      user-select: none;
      -webkit-user-select: none;
    }
    #aih-selection-result .aih-followup-send:hover {
      color: #2563eb;
    }
  `;
  document.head.appendChild(style);
}

// ==================== 工具栏工具加载 ====================
const DEFAULT_TOOLS = [
  { id: 'ai-search',  name: 'AI搜索', systemPrompt: '使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。', builtin: true, order: 0 },
  { id: 'explain',   name: '解释',   systemPrompt: '对选中的内容进行解释说明，帮助理解其含义。', builtin: true, order: 1 },
  { id: 'translate', name: '翻译',   systemPrompt: '将选中的内容翻译成中文。', builtin: true, order: 2 },
  { id: 'summary',   name: '总结',   systemPrompt: '对选中的内容进行归纳总结，提炼关键要点。', builtin: true, order: 3 },
  { id: 'copy',      name: '复制',   systemPrompt: '将选中内容复制到剪贴板。', builtin: true, order: 99 }
];

function loadToolbarTools() {
  return new Promise((resolve) => {
    if (!isExtensionValid()) {
      toolbarTools = [...DEFAULT_TOOLS];
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
        toolbarTools = rawTools.map(t => {
          if (t.builtin && defaultMap.has(t.id)) {
            return { ...t, systemPrompt: defaultMap.get(t.id).systemPrompt };
          }
          return t;
        });
        toolbarIconOnly = result.toolbarIconOnly || false;
        resolve(toolbarTools);
      });
    } catch {
      toolbarTools = [...DEFAULT_TOOLS];
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
  document.body.appendChild(overflowDropdownEl);
  
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
    return `<div class="aih-dropdown-item" role="button" tabindex="0" data-action="${tool.id}">
      <span class="aih-tb-icon">${icon}</span>${tool.name}
    </div>`;
  }).join('');
  
  itemsHtml += `<div class="aih-dropdown-divider"></div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-settings" role="button" tabindex="0" title="打开配置页面">
    <span class="aih-tb-icon">${ICONS.gear}</span>设置
  </div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-hide" role="button" tabindex="0" title="暂时隐藏直到页面刷新">
    <span class="aih-tb-icon">${ICONS.eyeOff}</span>本次临时禁用
  </div>`;
  itemsHtml += `<div class="aih-dropdown-item aih-dropdown-block" role="button" tabindex="0" title="在此网站禁用工具栏">
    <span class="aih-tb-icon">${ICONS.block}</span>在此网站禁用
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
  buttonsHtml += `<span class="aih-tb-grip" title="拖拽移动">${ICONS.grip}</span>`;
  
  const iconMode = toolbarIconOnly; // 图标精简模式：仅显示图标
  
  // AI搜索固定在第一个，始终显示
  if (aiSearchTool) {
    buttonsHtml += `<div class="aih-tb-btn primary" role="button" tabindex="0" data-action="ai-search" title="AI 搜索">
      <span class="aih-tb-icon">${ICONS.search}</span>${iconMode ? '' : 'AI搜索'}
    </div>`;
  }
  
  visibleTools.forEach((tool) => {
    const icon = getToolIcon(tool.id);
    buttonsHtml += `<div class="aih-tb-btn" role="button" tabindex="0" data-action="${tool.id}" title="${tool.name}">
      <span class="aih-tb-icon">${icon}</span>${iconMode ? '' : tool.name}
    </div>`;
  });
  
  // "更多"按钮始终显示，提供溢出工具 + 设置/屏蔽入口
  buttonsHtml += `<div class="aih-tb-btn aih-tb-btn-overflow" role="button" tabindex="0" title="更多工具">
    <span class="aih-tb-icon">${ICONS.more}</span>
  </div>`;
  renderOverflowDropdown(overflowTools);
  
  // 复制按钮固定在最后
  buttonsHtml += `<div class="aih-tb-btn" role="button" tabindex="0" data-action="copy" title="复制选中内容">
    <span class="aih-tb-icon">${ICONS.copy}</span>${iconMode ? '' : '复制'}
  </div>`;
  buttonsHtml += `</span>`; // close .aih-tb-buttons
  
  // 问问AI 输入框（紧凑内联形态）
  buttonsHtml += `<span class="aih-tb-ask-wrap">
    <input type="text" class="aih-tb-ask-input" placeholder="问问..." />
    <div class="aih-tb-btn aih-tb-ask-send" role="button" tabindex="0" title="发送">
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
  
  document.body.appendChild(toolbarEl);
  
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
      <span>${ICONS.sparkle} AI 回答</span>
      <div class="aih-result-header-actions">
        <div class="aih-result-lock" role="button" tabindex="0" title="锁定窗口">${ICONS.unlock}</div>
        <div class="aih-result-close" role="button" tabindex="0" title="关闭">${ICONS.close}</div>
      </div>
    </div>
    <div class="aih-result-scroll">
      <div class="aih-result-body"></div>
      <div class="aih-result-footer">
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="copy-result" title="复制全部内容">
          <span class="aih-tb-icon">${ICONS.copyLarge}</span>复制
        </div>
        <div class="aih-result-footer-btn" role="button" tabindex="0" data-action="regenerate-result" title="重新生成答案">
          <span class="aih-tb-icon">${ICONS.refresh}</span>重新生成
        </div>
      </div>
      <div class="aih-result-suggestions" style="display:none;">
        <div class="aih-suggestions-label">💡 推荐追问</div>
        <div class="aih-suggestions-list"></div>
      </div>
    </div>
    <div class="aih-result-followup">
      <span class="aih-followup-wrap">
        <input type="text" class="aih-followup-input" placeholder="继续提问..." />
        <div class="aih-followup-send" role="button" tabindex="0" title="发送到侧边栏">${ICONS.send}</div>
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
      copyResultContent();
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
  
  document.body.appendChild(resultPanelEl);
  
  // 结果面板通过标题栏拖拽
  makeDraggable(resultPanelEl, '.aih-result-header');
}

function showResultPanel(x, y, content, suggestions = []) {
  if (!resultPanelEl) return;
  
  // 确保面板始终在 body 最末尾，处于最顶层
  document.body.appendChild(resultPanelEl);
  
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  
  resultPanelEl.style.display = 'flex';
  resultPanelEl.style.left = '-9999px';
  resultPanelEl.style.top = '-9999px';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = content;
  
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
    document.body.appendChild(resultPanelEl);
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
  document.body.appendChild(resultPanelEl);
  
  resultPanelEl.style.display = 'flex';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = `<div class="aih-result-loading"><div class="aih-spinner"></div>AI 正在思考...</div>`;
  
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
  document.body.appendChild(resultPanelEl);
  
  resultPanelEl.style.display = 'flex';
  
  const body = resultPanelEl.querySelector('.aih-result-body');
  body.innerHTML = `<div class="aih-result-error">请求失败: ${escapeHtml(errorMsg)}</div>`;
  
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
    document.body.appendChild(panel);
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
    lockBtn.title = '解除锁定';
  } else {
    lockBtn.innerHTML = ICONS.unlock;
    lockBtn.classList.remove('locked');
    lockBtn.title = '锁定窗口';
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
      console.error('[SelectionToolbar] 发送追问到侧边栏失败:', err);
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
      console.error('[SelectionToolbar] 发送到侧边栏失败:', err);
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

// ==================== 显示/隐藏 ====================
function showToolbar(x, y) {
  if (!toolbarEl || !currentSelectedText || isResultVisible) return;
  
  // 确保工具栏始终在 body 最末尾，处于最顶层
  document.body.appendChild(toolbarEl);
  
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
    console.log('[SelectionToolbar] iframe onSelectionChange text:', result.text?.substring(0, 30), 'currentSelectedText:', !!currentSelectedText, 'pendingIframeSelection:', !!pendingIframeSelection);
    if (result.text && result.text.length >= 2) {
      // 暂存选区数据，等待 mouseup 时再发送（与顶层 frame 行为一致）
      const pos = getRangeViewportPosition(result.range);
      pendingIframeSelection = { text: result.text, x: pos.x, y: pos.y };
      console.log('[SelectionToolbar] iframe pendingIframeSelection 已设置');
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
  // 在 iframe 中点击时，通知顶层 frame 关闭结果面板和工具栏
  if (!isTopFrame) {
    window.top.postMessage({ type: 'IFRAME_CLICK_DISMISS' }, '*');
    return;
  }
  
  if (isResultVisible && resultPanelEl) {
    if (!resultPanelEl.contains(e.target) && !isResultLocked) {
      hideResultPanel();
    }
    return;
  }
  
  if (!isToolbarVisible) return;
  if (!toolbarEl) return;
  
  if (isAskMode) return;
  
  if (suppressNextClick) {
    suppressNextClick = false;
    return;
  }
  
  if (toolbarEl.contains(e.target)) return;
  
  hideToolbar();
}

function onMouseUp() {
  suppressNextClick = true;
  
  console.log('[SelectionToolbar] onMouseUp isTopFrame:', isTopFrame, 'pendingSelection:', pendingSelection, 'pendingIframeSelection:', !!pendingIframeSelection, 'currentSelectedText:', !!currentSelectedText, 'isToolbarVisible:', isToolbarVisible, 'toolbarEl:', !!toolbarEl);
  
  // 子iframe：在 mouseup 时发送选区消息（与顶层 frame 行为一致）
  if (!isTopFrame) {
    if (pendingIframeSelection) {
      lastSentIframeText = pendingIframeSelection.text;
      currentSelectedText = pendingIframeSelection.text;
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
    }
    return;
  }
  
  // 工具栏已显示时，不重新定位（点击工具栏按钮导致）
  if (isToolbarVisible) return;
  
  if (pendingSelection && currentSelectedText) {
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
    
    showToolbar(x, y);
    pendingSelection = null;
  }
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
    console.error('[SelectionToolbar] 复制失败:', err);
    showCopyErrorToast();
  });
}

function copyResultContent() {
  const text = resultRawContent;
  if (!text) return;
  copyToClipboard(text).then(() => {
    showCopyToast();
  }).catch(err => {
    console.error('[SelectionToolbar] 复制结果失败:', err);
    showCopyErrorToast();
  });
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
    document.body.appendChild(textarea);
    
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
  toast.textContent = '复制失败，请手动复制';
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
  
  document.body.appendChild(toast);
  toast.style.zIndex = '2147483647';
  setTimeout(() => toast.remove(), 1800);
}

function showCopyToast() {
  const oldToast = document.getElementById('aih-copy-toast');
  if (oldToast) oldToast.remove();
  
  const toast = document.createElement('div');
  toast.id = 'aih-copy-toast';
  toast.textContent = '已复制';
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
  
  document.body.appendChild(toast);
  // 确保 toast 在最顶层
  toast.style.zIndex = '2147483647';
  setTimeout(() => toast.remove(), 1300);
}

function sendToAI(action, text, customSystemPrompt) {
  if (!isExtensionValid()) {
    console.warn('[SelectionToolbar] 扩展上下文已失效，请刷新页面');
    return;
  }
  
  const actionLabels = {
    'ai-search': `搜索并分析以下内容：\n\n${text}`,
    'explain': `用1-3句话简洁解释以下内容，不需要展开说明。\n\n${text}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`,
    'translate': `翻译以下内容，只输出翻译结果：\n\n${text}`,
    'summary': `用3-5个要点总结以下内容，每条要点一句话。\n\n${text}\n\n---\n回答完毕后，请在最后另起一行，严格按以下格式提供3个用户可能追问的问题：\n---SUGGESTIONS---\n问题1\n问题2\n问题3`
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
        console.error('[SelectionToolbar] 发送消息失败:', err);
      });
    } catch {
      // 扩展上下文失效时静默忽略
    }
    return;
  }
  
  createResultPanel();
  
  const actionTitles = {
    'ai-search': 'AI搜索',
    'explain': '解释',
    'translate': '翻译',
    'summary': '总结'
  };
  let panelTitle = actionTitles[action];
  if (!panelTitle && toolbarTools) {
    const tool = toolbarTools.find(t => t.id === action);
    panelTitle = tool ? tool.name : 'AI 回答';
  }
  const titleSpan = resultPanelEl.querySelector('.aih-result-header span');
  if (titleSpan) {
    titleSpan.innerHTML = `${ICONS.sparkle} ${panelTitle || 'AI 回答'}`;
  }
  
  const pos = isResultVisible && resultPanelEl
    ? getPanelCenter(resultPanelEl)
    : getToolbarPosition();
  showResultLoading(pos.x, pos.y);
  
  chrome.runtime.sendMessage({
    type: 'SELECTION_TOOLBAR_ACTION',
    action: action,
    text: text,
    prompt: message,
    systemPrompt: customSystemPrompt || ''
  }).catch(err => {
    console.error('[SelectionToolbar] 发送消息失败:', err);
    showResultError(pos.x, pos.y, err.message);
  });
}

// ==================== 监听 AI 响应 ====================
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (!isExtensionValid()) return;
  
  if (message.type === 'IFRAME_SELECTION') {
    if (!isTopFrame) return;
    
    console.log('[SelectionToolbar] 收到 IFRAME_SELECTION text:', message.text?.substring(0, 30), 'isToolbarVisible:', isToolbarVisible, 'isResultVisible:', isResultVisible);
    
    currentSelectedText = message.text;
    
    // 工具栏已显示时，只更新位置，不重新show（避免跳动）
    if (isToolbarVisible && toolbarEl && currentSelectedText) {
      requestAnimationFrame(() => {
        const viewportWidth = window.innerWidth;
        const toolbarWidth = toolbarEl.offsetWidth || 300;
        const toolbarHeight = toolbarEl.offsetHeight || 40;
        let left = message.x - toolbarWidth / 2;
        if (left < 8) left = 8;
        if (left + toolbarWidth > viewportWidth - 8) left = viewportWidth - toolbarWidth - 8;
        let top = message.y - toolbarHeight - 8;
        if (top < 8) top = message.y + 8;
        toolbarEl.style.left = left + 'px';
        toolbarEl.style.top = top + 'px';
      });
      return;
    }
    
    pendingSelection = { x: message.x, y: message.y };
    
    if (currentSelectedText && currentSelectedText.length >= 2) {
      showToolbar(message.x, message.y);
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
  
  if (!isTopFrame) {
    return;
  }
  
  // 流式输出：开始（保留 loading 动画，等第一个 chunk 到达后再替换）
  if (message.type === 'SELECTION_TOOLBAR_STREAM_START') {
    streamContent = '';
    return;
  }
  
  // 流式输出：内容增量
  if (message.type === 'SELECTION_TOOLBAR_STREAM_CHUNK') {
    streamContent += (message.delta || '');
    if (resultPanelEl && isResultVisible) {
      const body = resultPanelEl.querySelector('.aih-result-body');
      if (body) {
        // 首个 chunk：替换 loading 动画为流式内容
        if (!body.querySelector('.aih-result-content-stream')) {
          body.innerHTML = '<div class="aih-result-content-stream"></div>';
        }
        // 流式过程中用纯文本显示，到 STREAM_DONE 时再渲染 markdown
        const escaped = escapeHtml(streamContent).replace(/\n/g, '<br>');
        body.innerHTML = '<div class="aih-result-content-stream">' + escaped + '</div>';
      }
    }
    return;
  }
  
  // 流式输出：完成
  if (message.type === 'SELECTION_TOOLBAR_STREAM_DONE') {
    // 确保收到所有内容
    if (message.finalContent) {
      streamContent = message.finalContent;
    }
    
    const rawContent = streamContent || '无响应';
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
      const rawContent = message.content || '无响应';
      
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
    console.log('[SelectionToolbar] 开关状态:', enableSelectionToolbar ? '已启用' : '已禁用', '屏蔽域名:', blockedDomains.length);
  });
}

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
  
  // 监听来自同源 iframe 的点击事件，关闭结果面板和工具栏
  window.addEventListener('message', (event) => {
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
  
  console.log('[SelectionToolbar] 初始化完成', isTopFrame ? '(顶层frame)' : '(子frame)');
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