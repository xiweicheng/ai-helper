// content/index.js - Content Script 入口文件（Map 路由，统一同步/异步处理）

import {
  getPageText, getFullHtml, queryInteractiveElements,
  getSelectedContent, extractTable, copyToClipboard,
  pasteFromClipboard, hoverElement, extractMetadata,
  highlightText, extractLinks, extractForms,
  removeHighlights, extractImages, searchInPage,
  pageToMarkdown, pageToJson, findSimilarElements,
  getIframeContent, getElementCount, scrollAndCollect
} from './page-tools.js';

import {
  clickElement, fillForm, scrollToPosition, waitForElement,
  keyboardInput, dragAndDrop, fileUpload,
  manageStorage, pickColor, textToSpeech, selectDropdown
} from './interaction-tools.js';

import {
  videoControl, generateQRCode,
  shadowDomQuery, runJavascript, injectCss
} from './advanced-tools.js';

import { initSelectionToolbar } from './selection-toolbar.js';

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
// HANDLERS Map: message.type → handler 的键值映射，共 39 个条目
//
// 分类汇总：
//   页面读取(4):   GET_PAGE_TEXT, GET_FULL_HTML, QUERY_INTERACTIVE_ELEMENTS, GET_SELECTED_CONTENT
//   页面交互(4):   CLICK_ELEMENT, FILL_FORM, SCROLL_TO, HOVER_ELEMENT
//   表单/输入(2):   KEYBOARD_INPUT, FILE_UPLOAD
//   信息提取(10):  EXTRACT_TABLE, EXTRACT_METADATA, EXTRACT_LINKS, EXTRACT_FORMS, EXTRACT_IMAGES,
//                  SEARCH_IN_PAGE, PAGE_TO_MARKDOWN, PAGE_TO_JSON, FIND_SIMILAR_ELEMENTS, GET_IFRAME_CONTENT
//   高亮/选区(2):   HIGHLIGHT_TEXT, REMOVE_HIGHLIGHTS
//   元素分析(1):   SHADOW_DOM_QUERY
//   媒体/输出(4):   MANAGE_STORAGE, TEXT_TO_SPEECH, INJECT_CSS, VIDEO_CONTROL
//   异步工具(11):  COPY_TO_CLIPBOARD, PASTE_FROM_CLIPBOARD, WAIT_FOR_ELEMENT, DRAG_AND_DROP,
//                  SELECT_DROPDOWN, COLOR_PICKER, GENERATE_QRCODE, RUN_JAVASCRIPT,
//                  GET_ELEMENT_COUNT, SCROLL_AND_COLLECT, START_REGION_SELECTION
//   特殊(1):       CLEAR_PAGE_DATA（内联逻辑）
//
// 异步处理：ASYNC_HANDLERS Set 标记需 return true 保持消息通道开放的工具
//
const HANDLERS = {
  // ── 页面读取 ──
  GET_PAGE_TEXT:             (msg) => getPageText(msg),
  GET_FULL_HTML:             (msg) => getFullHtml(msg),
  QUERY_INTERACTIVE_ELEMENTS:(msg) => queryInteractiveElements(msg),
  GET_SELECTED_CONTENT:      (msg) => getSelectedContent(msg.format),

  // ── 页面交互 ──
  CLICK_ELEMENT:             (msg) => clickElement(msg.selector, msg.waitTime, msg.timeout),
  FILL_FORM:                 (msg) => fillForm(msg.fields, msg.waitTime),
  SCROLL_TO:                 (msg) => scrollToPosition(msg),
  HOVER_ELEMENT:             (msg) => hoverElement(msg.selector),

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
  PAGE_TO_MARKDOWN:          (msg) => pageToMarkdown(msg.selector, msg.includeImages, msg.includeLinks, msg.maxLength),
  PAGE_TO_JSON:              (msg) => pageToJson(msg.selector, msg.maxItems),
  FIND_SIMILAR_ELEMENTS:     (msg) => findSimilarElements(msg.selector, msg.maxResults),
  GET_IFRAME_CONTENT:        (msg) => getIframeContent(msg.selector, msg.includeNested, msg.maxLength),

  // ── 高亮/选区 ──
  HIGHLIGHT_TEXT:            (msg) => highlightText(msg.text, msg.color),
  REMOVE_HIGHLIGHTS:         ()   => removeHighlights(),

  // ── 元素分析 ──
  SHADOW_DOM_QUERY:          (msg) => shadowDomQuery(msg.selector, msg.deep, msg.maxDepth, msg.maxResults),

  // ── 媒体/输出 ──
  MANAGE_STORAGE:            (msg) => manageStorage(msg),
  TEXT_TO_SPEECH:            (msg) => textToSpeech(msg.text, msg.lang, msg.rate, msg.pitch),
  INJECT_CSS:                (msg) => injectCss(msg.css, msg.targetSelector, msg.injectMode),
  VIDEO_CONTROL:             (msg) => videoControl(msg.action, msg.selector, msg.value),

  // ── 异步工具（返回 Promise，需保持通道开放）──
  COPY_TO_CLIPBOARD:         (msg) => copyToClipboard(msg.text),
  PASTE_FROM_CLIPBOARD:      ()   => pasteFromClipboard(),
  WAIT_FOR_ELEMENT:          (msg) => waitForElement(msg.selector, msg.state, msg.timeout),
  DRAG_AND_DROP:             (msg) => dragAndDrop(msg.sourceSelector, msg.targetSelector),
  SELECT_DROPDOWN:           (msg) => selectDropdown(msg.triggerSelector, msg.optionText, msg.optionSelector, msg.timeout),
  COLOR_PICKER:              ()   => pickColor(),
  GENERATE_QRCODE:           (msg) => generateQRCode(msg.content, msg.size, msg.errorCorrection, msg.showImage),
  RUN_JAVASCRIPT:            (msg) => runJavascript(msg.code, msg.timeout),
  GET_ELEMENT_COUNT:         (msg) => getElementCount(msg.selector, msg.includeHidden),
  SCROLL_AND_COLLECT:        (msg) => scrollAndCollect(msg),

  // ── 特殊：清除站点数据（内联逻辑）──
  CLEAR_PAGE_DATA: (msg) => {
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
};

/** 异步工具的 message type 集合，用于判断是否需要 return true */
const ASYNC_HANDLERS = new Set([
  'COPY_TO_CLIPBOARD', 'PASTE_FROM_CLIPBOARD',
  'WAIT_FOR_ELEMENT', 'DRAG_AND_DROP',
  'SELECT_DROPDOWN', 'SCROLL_AND_COLLECT',
  'WATCH_ELEMENT', 'COLOR_PICKER',
  'GENERATE_QRCODE', 'SCREENSHOT_ELEMENT',
  'PAGE_TO_PDF', 'RUN_JAVASCRIPT',
  'START_REGION_SELECTION',
]);

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 旧版兼容：getSelectedText
  if (message.action === 'getSelectedText') {
    sendResponse({ text: window.getSelection()?.toString() || '' });
    return;
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
    hint.textContent = '拖拽选择截图区域，按 Esc 取消';

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
