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
});

// ==================== 消息路由（Map 查找，O(1)） ====================

/**
 * 所有消息处理器映射表
 * - 同步处理器：直接返回结果
 * - 异步处理器：返回 Promise，自动处理 return true
 * - 特殊处理器：内联逻辑（如 CLEAR_PAGE_DATA）
 */
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
};

/** 异步工具的 message type 集合，用于判断是否需要 return true */
const ASYNC_HANDLERS = new Set([
  'COPY_TO_CLIPBOARD', 'PASTE_FROM_CLIPBOARD',
  'WAIT_FOR_ELEMENT', 'DRAG_AND_DROP',
  'SELECT_DROPDOWN', 'SCROLL_AND_COLLECT',
  'WATCH_ELEMENT', 'COLOR_PICKER',
  'GENERATE_QRCODE', 'SCREENSHOT_ELEMENT',
  'PAGE_TO_PDF', 'RUN_JAVASCRIPT',
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
