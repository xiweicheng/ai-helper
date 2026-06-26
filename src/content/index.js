// content/index.js - Content Script 入口文件

import {
  getPageText, getFullHtml, queryInteractiveElements, generateUniqueSelector,
  getElementText, getElementValue, getSelectedContent,
  extractTable, copyToClipboard, pasteFromClipboard, hoverElement,
  extractMetadata, highlightText, extractLinks, extractForms,
  getElementSelector, extractImages, searchInPage, pageToMarkdown, removeHighlights,
  pageToJson, findSimilarElements, getIframeContent, getPageLanguage, readAccessibilityTree
} from './page-tools.js';

import {
  clickElement, fillForm, scrollToPosition, waitForElement, keyboardInput,
  dragAndDrop, fileUpload, watchElement, manageStorage,
  getElementRect, getComputedStyleTool, getComputedStyle, pickColor,
  diffPage, textToSpeech
} from './interaction-tools.js';

import {
  videoControl, generateQRCode, performanceAudit, screenshotElement,
  shadowDomQuery, pageToPdf, runJavascript, injectCss, setZoom
} from './advanced-tools.js';

import { initSelectionToolbar } from './selection-toolbar.js';

// ==================== 快捷键支持 ====================
// Ctrl+Shift+A 或 Cmd+Shift+A 打开 Popup
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'A') {
    e.preventDefault();
    chrome.action.click();
  }
});

// ==================== 消息监听 ====================

// 监听来自 background 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // 获取纯文本内容
  if (message.type === 'GET_PAGE_TEXT') {
    const result = getPageText(message);
    sendResponse(result);
  }
  
  // 获取完整HTML
  if (message.type === 'GET_FULL_HTML') {
    const result = getFullHtml(message);
    sendResponse(result);
  }
  
  // 查询可交互元素
  if (message.type === 'QUERY_INTERACTIVE_ELEMENTS') {
    const result = queryInteractiveElements(message);
    sendResponse(result);
  }
  
  // 获取选中内容
  if (message.type === 'GET_SELECTED_CONTENT') {
    const result = getSelectedContent(message.format);
    sendResponse(result);
  }
  
  // 点击元素
  if (message.type === 'CLICK_ELEMENT') {
    const result = clickElement(message.selector, message.waitTime, message.timeout);
    sendResponse(result);
  }
  
  // 填充表单
  if (message.type === 'FILL_FORM') {
    const result = fillForm(message.fields, message.waitTime);
    sendResponse(result);
  }
  
  // 滚动到指定位置
  if (message.type === 'SCROLL_TO') {
    const result = scrollToPosition(message);
    sendResponse(result);
  }
  
  // 提取表格
  if (message.type === 'EXTRACT_TABLE') {
    const result = extractTable(message.selector, message.includeHeaders, message.format);
    sendResponse(result);
  }
  
  // 复制到剪贴板
  if (message.type === 'COPY_TO_CLIPBOARD') {
    copyToClipboard(message.text).then(result => sendResponse(result));
    return true;
  }
  
  // 从剪贴板粘贴
  if (message.type === 'PASTE_FROM_CLIPBOARD') {
    pasteFromClipboard().then(result => sendResponse(result));
    return true;
  }
  
  // 鼠标悬停
  if (message.type === 'HOVER_ELEMENT') {
    const result = hoverElement(message.selector);
    sendResponse(result);
  }
  
  // 提取元数据
  if (message.type === 'EXTRACT_METADATA') {
    const result = extractMetadata();
    sendResponse(result);
  }
  
  // 高亮文本
  if (message.type === 'HIGHLIGHT_TEXT') {
    const result = highlightText(message.text, message.color);
    sendResponse(result);
  }
  
  // 移除高亮
  if (message.type === 'REMOVE_HIGHLIGHTS') {
    const result = removeHighlights();
    sendResponse(result);
  }
  
  // ========== 交互工具 ==========
  
  // 等待元素
  if (message.type === 'WAIT_FOR_ELEMENT') {
    waitForElement(message.selector, message.state, message.timeout).then(result => sendResponse(result));
    return true;
  }
  
  // 键盘输入
  if (message.type === 'KEYBOARD_INPUT') {
    const result = keyboardInput(message);
    sendResponse(result);
  }
  
  // 拖拽操作
  if (message.type === 'DRAG_AND_DROP') {
    dragAndDrop(message.sourceSelector, message.targetSelector).then(result => sendResponse(result));
    return true;
  }
  
  // 文件上传
  if (message.type === 'FILE_UPLOAD') {
    const result = fileUpload(message.selector, message.fileName, message.fileContent, message.fileType);
    sendResponse(result);
  }
  
  // 提取链接
  if (message.type === 'EXTRACT_LINKS') {
    const result = extractLinks(message.filterType, message.includeImages);
    sendResponse(result);
  }
  
  // 提取表单
  if (message.type === 'EXTRACT_FORMS') {
    const result = extractForms(message.formSelector);
    sendResponse(result);
  }
  
  // 监听元素变化
  if (message.type === 'WATCH_ELEMENT') {
    watchElement(message.selector, message.duration).then(result => sendResponse(result));
    return true;
  }
  
  // 管理Storage
  if (message.type === 'MANAGE_STORAGE') {
    const result = manageStorage(message);
    sendResponse(result);
  }
  
  // 获取元素位置尺寸
  if (message.type === 'GET_ELEMENT_RECT') {
    const result = getElementRect(message.selector);
    sendResponse(result);
  }
  
  // 获取计算样式
  if (message.type === 'GET_COMPUTED_STYLE') {
    const result = getComputedStyle(message.selector, message.properties);
    sendResponse(result);
  }
  
  // 取色器
  if (message.type === 'COLOR_PICKER') {
    pickColor().then(result => sendResponse(result));
    return true;
  }
  
  // 页面差异对比
  if (message.type === 'DIFF_PAGE') {
    const result = diffPage(message.action, message.snapshotName);
    sendResponse(result);
  }
  
  // 文字转语音
  if (message.type === 'TEXT_TO_SPEECH') {
    const result = textToSpeech(message.text, message.lang, message.rate, message.pitch);
    sendResponse(result);
  }
  
  // ========== 高级工具 ==========
  
  // 提取图片
  if (message.type === 'EXTRACT_IMAGES') {
    const result = extractImages(message);
    sendResponse(result);
  }
  
  // 页面内搜索
  if (message.type === 'SEARCH_IN_PAGE') {
    const result = searchInPage(message);
    sendResponse(result);
  }
  
  // 视频控制
  if (message.type === 'VIDEO_CONTROL') {
    const result = videoControl(message.action, message.selector, message.value);
    sendResponse(result);
  }
  
  // 生成二维码
  if (message.type === 'GENERATE_QRCODE') {
    generateQRCode(message.content, message.size, message.errorCorrection, message.showImage).then(result => {
      sendResponse(result);
    });
    return true;
  }
  
  // 网页转Markdown
  if (message.type === 'PAGE_TO_MARKDOWN') {
    const result = pageToMarkdown(message.selector, message.includeImages, message.includeLinks, message.maxLength);
    sendResponse(result);
  }
  
  // 性能审计
  if (message.type === 'PERFORMANCE_AUDIT') {
    const result = performanceAudit(message.includeResourceTiming, message.includePaintTiming, message.includeMemoryInfo);
    sendResponse(result);
  }
  
  // 元素截图
  if (message.type === 'SCREENSHOT_ELEMENT') {
    screenshotElement(message.selector, message.quality, message.format).then(result => sendResponse(result));
    return true;
  }
  
  // Shadow DOM查询
  if (message.type === 'SHADOW_DOM_QUERY') {
    const result = shadowDomQuery(message.selector, message.deep, message.maxDepth, message.maxResults);
    sendResponse(result);
  }
  
  // 页面转PDF
  if (message.type === 'PAGE_TO_PDF') {
    pageToPdf(message.fileName, message.landscape, message.scale, message.printBackground, message.margins)
      .then(result => sendResponse(result));
    return true;
  }
  
  // ========== 新增工具消息处理 ==========
  // 页面结构化 JSON 提取
  if (message.type === 'PAGE_TO_JSON') {
    const result = pageToJson(message.selector, message.maxItems);
    sendResponse(result);
  }
  
  // 查找相似元素
  if (message.type === 'FIND_SIMILAR_ELEMENTS') {
    const result = findSimilarElements(message.selector, message.maxResults);
    sendResponse(result);
  }
  
  // iframe 内容获取
  if (message.type === 'GET_IFRAME_CONTENT') {
    const result = getIframeContent(message.selector, message.includeNested, message.maxLength);
    sendResponse(result);
  }
  
  // 在页面执行 JavaScript
  if (message.type === 'RUN_JAVASCRIPT') {
    runJavascript(message.code, message.timeout).then(result => sendResponse(result));
    return true;
  }
  
  // 注入 CSS
  if (message.type === 'INJECT_CSS') {
    const result = injectCss(message.css, message.targetSelector, message.injectMode);
    sendResponse(result);
  }
  
  // 获取页面语言
  if (message.type === 'GET_PAGE_LANGUAGE') {
    const result = getPageLanguage();
    sendResponse(result);
  }
  
  // 读取无障碍树
  if (message.type === 'READ_ACCESSIBILITY_TREE') {
    const result = readAccessibilityTree(message.maxResults);
    sendResponse(result);
  }
  
  // 页面缩放
  if (message.type === 'SET_ZOOM') {
    const result = setZoom(message.level);
    sendResponse(result);
  }
  
  // 清除站点数据（content script 端处理 localStorage/sessionStorage）
  if (message.type === 'CLEAR_PAGE_DATA') {
    try {
      const cleared = [];
      if (message.site) {
        // 指定站点清除（仅清除同源的 storage）
        if (window.location.href.includes(new URL(message.site).hostname)) {
          localStorage.clear();
          sessionStorage.clear();
          cleared.push('localStorage', 'sessionStorage');
        }
      } else {
        localStorage.clear();
        sessionStorage.clear();
        cleared.push('localStorage', 'sessionStorage');
      }
      sendResponse({ success: true, cleared });
    } catch (e) {
      sendResponse({ success: false, error: e.message });
    }
  }
  
  // 获取网页选中的内容（旧版兼容）
  if (message.action === 'getSelectedText') {
    const selectedText = window.getSelection()?.toString() || '';
    sendResponse({ text: selectedText });
  }
});

// 初始化选中文本浮动工具栏
initSelectionToolbar();
