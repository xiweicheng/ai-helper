// content/index.js - Content Script 入口文件（Map 路由，统一同步/异步处理）

import {
  getPageText, getFullHtml, getSelectedContent, extractTable,
  copyToClipboard, pasteFromClipboard, hoverElement,
  highlightText
} from './page-tools.js';

import {
  queryInteractiveElements, scrollAndCollect,
  interactByRef, scrollToText, getSelectorByRef
} from './page-interaction.js';

import {
  extractMetadata, extractLinks, extractForms,
  extractImages, searchInPage, getIframeContent
} from './page-extract.js';

import {
  clickElement, fillForm, scrollToPosition, waitForElement,
  keyboardInput, dragAndDrop, fileUpload,
  manageStorage, selectDropdown, clickByText
} from './interaction-tools.js';

import {
  generateQRCode, injectCss
} from './advanced-tools.js';

import { deepGetSelection } from './shadow-dom-utils.js';

import { initSelectionToolbar, isExtensionValid } from './selection-toolbar.js';

import { t, registerTranslations, initI18n } from '../shared/i18n.js';

registerTranslations('zh', {
  contentIndex: {
    invalidRef: '无效的元素编号 ref={ref}，请先调用 query_elements',
    regionSelectHint: '拖拽选择截图区域，按 Esc 取消',
  },
});

registerTranslations('en', {
  contentIndex: {
    invalidRef: 'Invalid element ref={ref}; please call query_elements first',
    regionSelectHint: 'Drag to select the screenshot area; press Esc to cancel',
  },
});

// 初始化 i18n：从 chrome.storage.local 读取语言偏好，跨环境同步
initI18n();

console.log('[ContentScript] 内容脚本已加载 URL:', window.location.href, 'isTopFrame:', window.top === window, 'hasBody:', !!document.body);

// ==================== 快捷键支持 ====================
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    chrome.action.click();
  }

  // Alt+S ：全页面截图（页面焦点时可用）
  if (e.altKey && !e.shiftKey && e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'CAPTURE_TAB_FROM_PAGE' });
  }

  // Alt+Shift+S ：区域截图（页面焦点时可用）
  if (e.altKey && e.shiftKey && e.code === 'KeyS' && !e.ctrlKey && !e.metaKey) {
    e.preventDefault();
    chrome.runtime.sendMessage({ type: 'CAPTURE_REGION_FROM_PAGE' });
  }
});

// ==================== 消息路由表（Map 查找，O(1)） ====================
//
// HANDLERS Map: message.type → handler 的键值映射
//
// 分类汇总：
//   页面读取(4):   GET_PAGE_TEXT, GET_FULL_HTML, QUERY_ELEMENTS, GET_SELECTED_CONTENT
//   页面交互(3):   INTERACT_ELEMENT, FILL_FORM, SCROLL_TO
//   表单/输入(2):   KEYBOARD_INPUT, FILE_UPLOAD
//   信息提取(5):   EXTRACT_TABLE, EXTRACT_METADATA, EXTRACT_LINKS, EXTRACT_FORMS, EXTRACT_IMAGES,
//                  SEARCH_IN_PAGE, IFRAME_CONTENT, SCROLL_COLLECT
//   高亮/选区(1):   HIGHLIGHT_TEXT
//   媒体/输出(2):   MANAGE_STORAGE, INJECT_CSS
//   异步工具(7):   COPY_TO_CLIPBOARD, PASTE_FROM_CLIPBOARD, WAIT_ELEMENT, DRAG_DROP,
//                  SELECT_DROPDOWN, QRCODE, START_REGION_SELECTION
//   特殊(1):       CLEAR_DATA（内联逻辑）
//
// 异步处理：ASYNC_HANDLERS Set 标记需 return true 保持消息通道开放的工具
//
const HANDLERS = {
  // ── 页面读取 ──
  GET_PAGE_TEXT:             (msg) => getPageText(msg),
  GET_FULL_HTML:             (msg) => getFullHtml(msg),
  QUERY_ELEMENTS:            (msg) => queryInteractiveElements(msg),
  GET_SELECTED_CONTENT:      (msg) => getSelectedContent(msg.format),

  // ── 页面交互 ──
  // interact_element 支持 3 种定位：ref（优先）> text > selector
  INTERACT_ELEMENT:           (msg) => {
    if (msg.ref != null) {
      return interactByRef(msg.ref, msg.action, { waitTime: msg.waitTime, timeout: msg.timeout });
    }
    if (msg.text) {
      return clickByText(msg.text, { tag: msg.tag, action: msg.action, waitTime: msg.waitTime, timeout: msg.timeout });
    }
    if (msg.action === 'hover') return hoverElement(msg.selector);
    return clickElement(msg.selector, msg.waitTime, msg.timeout);
  },
  FILL_FORM:                 (msg) => fillForm(msg.fields, msg.waitTime),
  // scroll_to 支持 target=text（滚动到文本），其余走 scrollToPosition
  SCROLL_TO:                 (msg) => {
    if (msg.target === 'text' && msg.text) {
      return scrollToText(msg.text, { maxScrolls: msg.maxScrolls, pauseMs: msg.pauseMs });
    }
    return scrollToPosition(msg);
  },

  // ── 表单/输入工具 ──
  KEYBOARD_INPUT:            (msg) => keyboardInput(msg),
  FILE_UPLOAD:               (msg) => fileUpload(msg.selector, msg.fileName, msg.fileContent, msg.fileType),

  // ── 信息提取 ──
  EXTRACT_TABLE:             (msg) => extractTable(msg.selector, msg.includeHeaders, msg.format),
  EXTRACT_METADATA:          ()   => extractMetadata(),
  EXTRACT_LINKS:             (msg) => extractLinks(msg.filterType, msg.includeImages),
  EXTRACT_FORMS:             (msg) => extractForms(msg.formSelector),
  EXTRACT_IMAGES:            (msg) => extractImages(msg),
  SEARCH_IN_PAGE:            (msg) => searchInPage(msg),
  IFRAME_CONTENT:            (msg) => getIframeContent(msg.selector, msg.includeNested, msg.maxLength),
  SCROLL_COLLECT:            (msg) => scrollAndCollect(msg),

  // ── 高亮/选区 ──
  HIGHLIGHT_TEXT:            (msg) => highlightText(msg.text, msg.color),

  // ── 媒体/输出 ──
  MANAGE_STORAGE:            (msg) => manageStorage(msg),
  INJECT_CSS:                (msg) => injectCss(msg.css, msg.targetSelector, msg.injectMode),

  // ── 异步工具（返回 Promise，需保持通道开放）──
  COPY_TO_CLIPBOARD:         (msg) => copyToClipboard(msg.text),
  PASTE_FROM_CLIPBOARD:      ()   => pasteFromClipboard(),
  WAIT_ELEMENT:              (msg) => waitForElement(msg.selector, msg.state, msg.timeout),
  DRAG_DROP:                 (msg) => dragAndDrop(msg.sourceSelector, msg.targetSelector),
  SELECT_DROPDOWN:           (msg) => {
    let triggerSelector = msg.triggerSelector;
    if (msg.ref != null && !triggerSelector) {
      triggerSelector = getSelectorByRef(msg.ref);
      if (!triggerSelector) {
        return { success: false, error: `无效的元素编号 ref=${msg.ref}，请先调用 query_elements` };
      }
    }
    return selectDropdown(triggerSelector, msg.optionText, msg.optionSelector, msg.timeout);
  },
  QRCODE:                    (msg) => generateQRCode(msg.content, msg.size, msg.errorCorrection, msg.showImage),

  // ── 特殊：清除站点数据（内联逻辑）──
  CLEAR_DATA: (msg) => {
    try {
      const cleared = [];
      if (msg.site) {
        if (window.location.href.includes(new URL(msg.site).hostname)) {
          localStorage.clear();
          sessionStorage.clear();
          cleared.push('localStorage', 'sessionStorage');
        }
      } else {
        localStorage.clear();
        sessionStorage.clear();
        cleared.push('localStorage', 'sessionStorage');
      }
      return { success: true, cleared };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  // ── 区域截图选择 ──
  START_REGION_SELECTION: () => startRegionSelection(),

  // ── 页面度量 ──
  GET_PAGE_METRICS: () => ({
    width: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth || 0, window.innerWidth),
    height: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight || 0, window.innerHeight),
  }),
};

/** 异步工具的 message type 集合，用于判断是否需要 return true */
const ASYNC_HANDLERS = new Set([
  'COPY_TO_CLIPBOARD', 'PASTE_FROM_CLIPBOARD',
  'WAIT_ELEMENT', 'DRAG_DROP',
  'SELECT_DROPDOWN', 'QRCODE',
  'START_REGION_SELECTION',
  // INTERACT_ELEMENT: ref/text/click 分支含 auto-wait，均为 async
  // SCROLL_TO: target=text 分支为 async（循环滚动查找）
  // KEYBOARD_INPUT: 含 auto-wait，为 async
  'INTERACT_ELEMENT', 'SCROLL_TO', 'KEYBOARD_INPUT',
]);

// 这些工具类型只在顶层 frame 处理，避免 all_frames 响应冲突
const TOP_FRAME_ONLY_TYPES = new Set([
  'GET_PAGE_TEXT',
  'GET_FULL_HTML',
  'EXTRACT_METADATA',
  'EXTRACT_TABLE',
  'IFRAME_CONTENT',
  'QUERY_ELEMENTS',
  // ref 模式依赖 elementRegistry（顶层 frame 维护）；text 模式为页面级查找
  'INTERACT_ELEMENT', 'SCROLL_TO',
]);

if (isExtensionValid()) {
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 页面级内容获取工具：只在顶层 frame 响应，避免 iframe 响应覆盖主页面内容
  if (TOP_FRAME_ONLY_TYPES.has(message.type) && window.top !== window) {
    return;
  }

  // 旧版兼容：getSelectedText
  if (message.action === 'getSelectedText') {
    // 优先使用 window.getSelection()，再回退到 deepGetSelection（穿透 Shadow DOM）
    // 只有当前 frame 有焦点且选区有内容时才响应，避免多 frame 场景下返回旧 frame 的选区
    const winSel = window.getSelection()?.toString()?.trim() || '';
    if (winSel && document.hasFocus()) {
      sendResponse({ text: winSel });
      return true;
    }
    const deep = deepGetSelection();
    if (deep.text && deep.text.trim() && document.hasFocus()) {
      sendResponse({ text: deep.text.trim() });
    }
    return true;
  }

  const handler = HANDLERS[message.type];
  if (!handler) return;

  const result = handler(message);

  if (ASYNC_HANDLERS.has(message.type) || result instanceof Promise) {
    // 异步：保持通道开放，then 后回复
    Promise.resolve(result).then(sendResponse);
    return true;
  }

  // 同步：直接回复
  sendResponse(result);
});
}

// 初始化选中文本浮动工具栏
initSelectionToolbar();

// ==================== 区域截图选择 ====================

/**
 * 在页面上启动区域选择模式，用户拖拽选择截图区域
 * 返回 Promise<{x, y, width, height} | null>
 */
function startRegionSelection() {
  return new Promise((resolve) => {
    // 创建遮罩层
    const overlay = document.createElement('div');
    overlay.id = '__region_select_overlay__';
    overlay.style.cssText = `
      position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
      z-index: 2147483647; cursor: crosshair;
      background: rgba(0, 0, 0, 0.15);
    `;

    // 选择框（pointer-events: none 确保不拦截鼠标事件）
    const selectBox = document.createElement('div');
    selectBox.id = '__region_select_box__';
    selectBox.style.cssText = `
      position: fixed; z-index: 2147483647; pointer-events: none;
      border: 2px dashed #667eea;
      background: rgba(102, 126, 234, 0.1);
      display: none;
    `;

    // 提示文字
    const hint = document.createElement('div');
    hint.style.cssText = `
      position: fixed; top: 16px; left: 50%; transform: translateX(-50%);
      z-index: 2147483647; pointer-events: none;
      padding: 8px 20px; border-radius: 20px;
      background: rgba(0, 0, 0, 0.75); color: #fff;
      font-size: 14px; font-family: sans-serif;
    `;
    hint.textContent = t('contentIndex.regionSelectHint');

    let startX = 0, startY = 0;
    let isDragging = false;

    function getPos(e) {
      return { x: e.clientX, y: e.clientY };
    }

    function updateBox(x1, y1, x2, y2) {
      const left = Math.min(x1, x2);
      const top = Math.min(y1, y2);
      const width = Math.abs(x2 - x1);
      const height = Math.abs(y2 - y1);
      selectBox.style.left = left + 'px';
      selectBox.style.top = top + 'px';
      selectBox.style.width = width + 'px';
      selectBox.style.height = height + 'px';
      selectBox.style.display = 'block';
    }

    function cleanup() {
      overlay.remove();
      selectBox.remove();
      hint.remove();
      document.removeEventListener('keydown', onKeyDown, true);
    }

    function onKeyDown(e) {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        cleanup();
        resolve(null);
      }
    }

    overlay.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      const { x, y } = getPos(e);
      startX = x;
      startY = y;
      isDragging = true;
      document.body.appendChild(selectBox);
      document.body.appendChild(hint);
    });

    overlay.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const { x, y } = getPos(e);
      updateBox(startX, startY, x, y);
    });

    overlay.addEventListener('mouseup', (e) => {
      if (!isDragging) return;
      e.preventDefault();
      e.stopPropagation();
      isDragging = false;

      const { x, y } = getPos(e);
      const rect = {
        x: Math.min(startX, x),
        y: Math.min(startY, y),
        width: Math.abs(x - startX),
        height: Math.abs(y - startY),
      };

      cleanup();

      // 最小区域阈值
      if (rect.width < 10 || rect.height < 10) {
        resolve(null);
        return;
      }

      // 等待一帧确保遮罩层渲染移除后再截图
      requestAnimationFrame(() => resolve(rect));
    });

    document.addEventListener('keydown', onKeyDown, true);
    document.body.appendChild(overlay);
  });
}


