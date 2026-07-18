// background/tool-clipboard.js - 剪贴板工具（使用 Offscreen Document）
// 从 tool-executor.js 拆分，包含 clipboard / get_page_content / extract_data 工具实现

import { getActiveTabId, sendToContentScriptWithRetry, makeResult } from './tool-helpers.js';

// ==================== 剪贴板工具（使用 Offscreen Document） ====================

let creatingOffscreenDocument = null;

async function ensureOffscreenDocument() {
  const offscreenUrl = chrome.runtime.getURL('offscreen/offscreen.html');
  const existingContexts = await chrome.runtime.getContexts({
    contextTypes: ['OFFSCREEN_DOCUMENT'],
    documentUrls: [offscreenUrl]
  });

  if (existingContexts.length > 0) {
    return;
  }

  if (creatingOffscreenDocument) {
    await creatingOffscreenDocument;
    return;
  }

  creatingOffscreenDocument = chrome.offscreen.createDocument({
    url: 'offscreen/offscreen.html',
    reasons: ['CLIPBOARD'],
    justification: '用于读写系统剪贴板内容'
  });

  try {
    await creatingOffscreenDocument;
  } finally {
    creatingOffscreenDocument = null;
  }
}

// ── 合并后的工具处理函数 ──

/**
 * get_page_content：合并 get_page_text/get_full_html/page_to_markdown/page_to_json
 * 根据 format 参数路由到对应的 content script 消息类型
 */
export async function executeGetPageContent(args, toolCallId, _sessionId, sessionTabId) {
  const { format = 'text', selector, maxLength = 15000, tabId: argsTabId } = args;

  const messageTypeMap = {
    text: 'GET_PAGE_TEXT',
    html: 'GET_FULL_HTML'
  };

  const messageType = messageTypeMap[format];
  if (!messageType) {
    return makeResult(false, `不支持的格式: ${format}，可选: text, html`, toolCallId);
  }

  try {
    const targetTabId = argsTabId || sessionTabId || await getActiveTabId();
    if (!targetTabId) {
      return makeResult(false, '没有可用的标签页', toolCallId);
    }
    const message = { type: messageType, selector, maxLength };
    return await sendToContentScriptWithRetry(targetTabId, message, toolCallId);
  } catch (e) {
    return makeResult(false, e.message, toolCallId);
  }
}

/**
 * extract_data：合并 extract_table/extract_metadata/extract_links/extract_forms/extract_images
 * 根据 dataType 参数路由到对应的 content script 消息类型
 */
export async function executeExtractData(args, toolCallId, _sessionId, sessionTabId) {
  const {
    dataType,
    selector,
    filterType = 'all',
    includeHeaders = true,
    format = 'json',
    includeImages = false,
    minWidth = 0,
    minHeight = 0,
    maxResults = 100,
    tabId: argsTabId
  } = args;

  if (!dataType) {
    return makeResult(false, '缺少 dataType 参数', toolCallId);
  }

  const messageTypeMap = {
    table: 'EXTRACT_TABLE',
    metadata: 'EXTRACT_METADATA',
    links: 'EXTRACT_LINKS',
    forms: 'EXTRACT_FORMS',
    images: 'EXTRACT_IMAGES'
  };

  const messageType = messageTypeMap[dataType];
  if (!messageType) {
    return makeResult(false, `不支持的数据类型: ${dataType}，可选: table, metadata, links, forms, images`, toolCallId);
  }

  try {
    const targetTabId = argsTabId || sessionTabId || await getActiveTabId();
    if (!targetTabId) {
      return makeResult(false, '没有可用的标签页', toolCallId);
    }

    const message = { type: messageType, selector, filterType, includeHeaders, format, includeImages, minWidth, minHeight, maxResults };
    return await sendToContentScriptWithRetry(targetTabId, message, toolCallId);
  } catch (e) {
    return makeResult(false, e.message, toolCallId);
  }
}

/**
 * clipboard：合并 copy_to_clipboard/paste_from_clipboard/get_selected_content
 * 根据 action 参数路由到对应的处理器
 */
export async function executeClipboard(args, toolCallId) {
  const { action, text, format = 'text' } = args;

  if (!action) {
    return makeResult(false, '缺少 action 参数', toolCallId);
  }

  if (action === 'copy') {
    return executeCopyToClipboard({ text }, toolCallId);
  }

  if (action === 'paste') {
    return executePasteFromClipboard({}, toolCallId);
  }

  if (action === 'get_selected') {
    try {
      const tabId = await getActiveTabId();
      if (!tabId) {
        return makeResult(false, '没有可用的标签页', toolCallId);
      }
      return await sendToContentScriptWithRetry(tabId, { type: 'GET_SELECTED_CONTENT', format }, toolCallId);
    } catch (e) {
      return makeResult(false, e.message, toolCallId);
    }
  }

  return makeResult(false, `不支持的操作: ${action}，可选: copy, paste, get_selected`, toolCallId);
}

export async function executeCopyToClipboard(args, toolCallId) {
  const { text } = args;
  if (text === undefined || text === null) {
    return makeResult(false, '缺少 text 参数', toolCallId);
  }

  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: 'COPY_TO_CLIPBOARD',
      text: text
    });
    if (response?.success) {
      return makeResult(true, response.message || '已复制到剪贴板', toolCallId);
    } else {
      return makeResult(false, response?.error || '复制失败', toolCallId);
    }
  } catch (e) {
    return makeResult(false, e.message, toolCallId);
  }
}

export async function executePasteFromClipboard(args, toolCallId) {
  try {
    await ensureOffscreenDocument();
    const response = await chrome.runtime.sendMessage({
      type: 'PASTE_FROM_CLIPBOARD'
    });
    if (response?.success) {
      return { ...makeResult(true, response.text || '', toolCallId), text: response.text };
    } else {
      return makeResult(false, response?.error || '粘贴失败', toolCallId);
    }
  } catch (e) {
    return makeResult(false, e.message, toolCallId);
  }
}


// 导出剪贴板工具函数供 tool-executor.js 路由表使用
