import { D as DEFAULT_API_BASE, a as DEFAULT_MODEL, b as DEFAULT_REACT_CONFIG, c as DEFAULT_CHAT_CONFIG, B as BUILTIN_TOOLS } from './constants-5178b5af.js';

// background/state.js - 状态管理和取消控制

// ReAct 循环取消控制 - 使用 Map 支持多标签页
const cancelledTabs = new Map(); // tabId -> boolean

// 当前活跃的 ReAct 循环标签页（用于取消所有）
let activeReactTabId = null;

// 当前对话的 API 调用计数器（每次对话重置）
let currentDialogApiCallCount = 0;

function resetDialogApiCallCount() {
  currentDialogApiCallCount = 0;
}

function incrementDialogApiCallCount() {
  currentDialogApiCallCount++;
  return currentDialogApiCallCount;
}

function getDialogApiCallCount() {
  return currentDialogApiCallCount;
}

/**
 * 取消指定标签页的 ReAct 循环
 * @param {number|null} tabId - 标签页ID，为null时取消所有标签页的循环
 */
function cancelReactLoop(tabId) {
  if (tabId === null) {
    // 取消所有标签页的循环
    cancelledTabs.clear();
    console.log('[Background] 所有标签页的 ReAct 循环已取消');
  } else {
    cancelledTabs.set(tabId, true);
    console.log('[Background] ReAct 循环已取消，tabId:', tabId);
  }
}

/**
 * 重置指定标签页的取消状态
 * @param {number} tabId - 标签页ID
 */
function resetReactCancel(tabId) {
  if (tabId !== undefined) {
    cancelledTabs.delete(tabId);
    console.log('[Background] 标签页取消状态已重置，tabId:', tabId);
  }
}

/**
 * 检查指定标签页的 ReAct 循环是否已取消
 * @param {number} tabId - 标签页ID
 * @returns {boolean}
 */
function isCancelled(tabId) {
  if (tabId === undefined) {
    // 如果没有提供tabId，检查活跃标签页
    return activeReactTabId !== null && cancelledTabs.get(activeReactTabId) === true;
  }
  return cancelledTabs.get(tabId) === true;
}

/**
 * 设置当前活跃的 ReAct 循环标签页
 * @param {number} tabId - 标签页ID
 */
function setActiveReactTabId(tabId) {
  activeReactTabId = tabId;
  // 重置该标签页的取消状态
  if (tabId !== null) {
    cancelledTabs.delete(tabId);
  }
}

// 为了向后兼容，保留原有的函数名
function setCurrentReactTabId(id) { 
  setActiveReactTabId(id); 
}

// background/config.js - 配置管理

/**
 * 获取存储的配置
 */
function getStoredConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'apiBase', 'apiKey', 'modelName', 'enabledTools',
      'reactMaxIterations', 'reactApiTimeout', 'reactLoopTimeout', 'reactToolTimeout', 'reactClarifyTimeout',
      'reactApiRetryCount', 'reactApiRetryBaseDelay',
      'chatMaxInputHistory', 'chatMaxHistoryMessages', 'chatMaxMessageLength'
    ], (result) => {
      resolve({
        apiBase: result.apiBase || DEFAULT_API_BASE,
        apiKey: result.apiKey || '',
        modelName: result.modelName || DEFAULT_MODEL,
        enabledTools: result.enabledTools || ['get_page_content', 'get_element_by_selector', 'get_selected_content'],
        // ReAct 配置项
        reactConfig: {
          maxIterations: result.reactMaxIterations || DEFAULT_REACT_CONFIG.maxIterations,
          apiTimeout: result.reactApiTimeout || DEFAULT_REACT_CONFIG.apiTimeout,
          loopTimeout: result.reactLoopTimeout || DEFAULT_REACT_CONFIG.loopTimeout,
          toolTimeout: result.reactToolTimeout || DEFAULT_REACT_CONFIG.toolTimeout,
          clarifyTimeout: result.reactClarifyTimeout || DEFAULT_REACT_CONFIG.clarifyTimeout,
          apiRetryCount: result.reactApiRetryCount !== undefined ? result.reactApiRetryCount : DEFAULT_REACT_CONFIG.apiRetryCount,
          apiRetryBaseDelay: result.reactApiRetryBaseDelay !== undefined ? result.reactApiRetryBaseDelay : DEFAULT_REACT_CONFIG.apiRetryBaseDelay
        },
        // 对话配置项
        chatConfig: {
          maxInputHistory: result.chatMaxInputHistory || DEFAULT_CHAT_CONFIG.maxInputHistory,
          maxHistoryMessages: result.chatMaxHistoryMessages || DEFAULT_CHAT_CONFIG.maxHistoryMessages,
          maxMessageLength: result.chatMaxMessageLength || DEFAULT_CHAT_CONFIG.maxMessageLength
        }
      });
    });
  });
}

/**
 * 获取对话配置（供 side_panel 使用）
 */
function getChatConfig() {
  return new Promise((resolve) => {
    chrome.storage.local.get([
      'chatMaxInputHistory', 'chatMaxHistoryMessages', 'chatMaxMessageLength', 'chatMaxMemoryMessages'
    ], (result) => {
      resolve({
        maxInputHistory: result.chatMaxInputHistory || DEFAULT_CHAT_CONFIG.maxInputHistory,
        maxHistoryMessages: result.chatMaxHistoryMessages || DEFAULT_CHAT_CONFIG.maxHistoryMessages,
        maxMessageLength: result.chatMaxMessageLength || DEFAULT_CHAT_CONFIG.maxMessageLength,
        maxMemoryMessages: result.chatMaxMemoryMessages !== undefined ? result.chatMaxMemoryMessages : DEFAULT_CHAT_CONFIG.maxMemoryMessages
      });
    });
  });
}

// background/tool-executor.js - 工具定义与执行

/**
 * 获取启用的工具列表
 */
function getTools() {
  return new Promise((resolve) => {
    chrome.storage.local.get(['enabledTools'], (result) => {
      let enabledTools = result.enabledTools;
      
      // 如果没有保存的配置，使用默认值（全部启用）
      if (!enabledTools || !Array.isArray(enabledTools) || enabledTools.length === 0) {
        enabledTools = BUILTIN_TOOLS.map(t => t.id);
        console.log('[Background] 未找到工具配置，使用默认值（全部启用）');
      }
      
      console.log('[Background] 当前启用的工具配置:', enabledTools);
      
      const tools = BUILTIN_TOOLS
        .filter(tool => enabledTools.includes(tool.id))
        .map(tool => tool);
      
      console.log('[Background] 过滤后的工具列表:', tools.map(t => t.id), '数量:', tools.length);
      resolve(tools);
    });
  });
}

/**
 * 执行工具调用
 */
function executeTool(toolCall, tabId) {
  const { name, arguments: argsStr, id, function: functionObj, index } = toolCall;
  
  // 兼容不同的工具调用格式
  let toolName = name || (functionObj && functionObj.name);
  let toolCallId = id;
  let args = {};
  
  console.log('[Background] 工具调用原始数据:', JSON.stringify(toolCall));
  
  // 解析参数
  if (functionObj && functionObj.arguments) {
    try {
      const parsed = JSON.parse(functionObj.arguments);
      args = parsed || {};
    } catch (e) {
      console.error('[Background] 解析工具参数失败:', e, '原始值:', functionObj.arguments);
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
  } else if (typeof argsStr === 'object') {
    args = argsStr || {};
  } else if (typeof argsStr === 'string') {
    try {
      args = JSON.parse(argsStr);
    } catch (e) {
      console.error('[Background] 解析工具参数失败:', e, '原始值:', argsStr);
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
  }
  
  console.log('[Background] 执行工具:', toolName, args, 'id:', toolCallId);

  // ==================== 工具路由映射表 ====================
  // Background 直接执行的工具
  const BACKGROUND_HANDLERS = {
    search_bookmarks: (a) => executeSearchBookmarks(a),
    search_history: (a) => executeSearchHistory(a),
    capture_tab_screenshot: (a) => executeCaptureScreenshot(a),
    clarify_question: (a) => executeClarifyQuestion(a, toolCallId),
    show_notification: (a) => executeShowNotification(a, toolCallId),
    fetch_url: (a) => executeFetchUrl(a, toolCallId),
    open_tab: (a) => executeOpenTab(a),
    switch_tab: (a) => executeSwitchTab(a),
    close_tab: (a) => executeCloseTab(a),
    get_tabs: (a) => executeGetTabs(a),
    get_browser_info: (a) => executeGetBrowserInfo(),
    download_file: (a) => executeDownloadFile(a),
    manage_cookies: (a) => executeManageCookies(a, toolCallId),
    schedule_task: (a) => executeScheduleTask(a, toolCallId),
    execute_workflow: (a) => executeWorkflow(a, toolCallId),
    plan_task: (a) => executePlanTask(a, toolCallId),
    manage_user_scripts: (a) => executeManageUserScripts(a, toolCallId),
    compare_urls: (a) => executeCompareUrls(a, toolCallId),
    clear_page_data: (a) => executeClearPageData(a, toolCallId),
    resize_window: (a) => executeResizeWindow(a, toolCallId),
    navigate_back_forward: (a) => executeNavigateBackForward(a, toolCallId),
    reload_tab: (a) => executeReloadTab(a, toolCallId),
    mute_tab: (a) => executeMuteTab(a, toolCallId),
    pin_tab: (a) => executePinTab(a, toolCallId),
    group_tabs: (a) => executeGroupTabs(a, toolCallId),
    record_network: (a) => executeRecordNetwork(a, toolCallId),
  };

  // Content Script 委派的工具：toolName → [messageType, payloadBuilder(args)]
  const CONTENT_TOOLS = {
    get_page_text:             ['GET_PAGE_TEXT',             a => ({ maxLength: a.maxLength, includeHeadings: a.includeHeadings, includeLinks: a.includeLinks })],
    get_full_html:             ['GET_FULL_HTML',             a => ({ includeStyles: a.includeStyles, maxLength: a.maxLength })],
    query_interactive_elements:['QUERY_INTERACTIVE_ELEMENTS', a => ({ filterByText: a.filterByText, elementTypes: a.elementTypes, maxResults: a.maxResults })],
    get_element_by_selector:   ['GET_ELEMENT',               a => ({ selector: a.selector || null })],
    get_selected_content:      ['GET_SELECTED_CONTENT',      a => ({ format: a.format || 'text' })],
    click_element:             ['CLICK_ELEMENT',             a => ({ selector: a.selector, waitTime: a.waitTime, timeout: a.timeout })],
    fill_form:                 ['FILL_FORM',                 a => ({ fields: a.fields, waitTime: a.waitTime })],
    scroll_to:                 ['SCROLL_TO',                 a => ({ target: a.target, selector: a.selector, x: a.x, y: a.y, behavior: a.behavior })],
    extract_table:             ['EXTRACT_TABLE',             a => ({ selector: a.selector, includeHeaders: a.includeHeaders, format: a.format })],
    copy_to_clipboard:         ['COPY_TO_CLIPBOARD',         a => ({ text: a.text })],
    paste_from_clipboard:      ['PASTE_FROM_CLIPBOARD',      a => ({})],
    hover_element:             ['HOVER_ELEMENT',             a => ({ selector: a.selector })],
    extract_metadata:          ['EXTRACT_METADATA',          a => ({})],
    highlight_text:            ['HIGHLIGHT_TEXT',            a => ({ text: a.text, color: a.color })],
    wait_for_element:          ['WAIT_FOR_ELEMENT',          a => ({ selector: a.selector, state: a.state, timeout: a.timeout })],
    keyboard_input:            ['KEYBOARD_INPUT',            a => ({ key: a.key, text: a.text, ctrlKey: a.ctrlKey, shiftKey: a.shiftKey, altKey: a.altKey })],
    drag_and_drop:             ['DRAG_AND_DROP',             a => ({ sourceSelector: a.sourceSelector, targetSelector: a.targetSelector })],
    file_upload:               ['FILE_UPLOAD',               a => ({ selector: a.selector, fileName: a.fileName, fileContent: a.fileContent, fileType: a.fileType })],
    scroll_into_view:          ['SCROLL_INTO_VIEW',          a => ({ selector: a.selector, align: a.align, smooth: a.smooth })],
    extract_links:             ['EXTRACT_LINKS',             a => ({ filterType: a.filterType, includeImages: a.includeImages })],
    extract_forms:             ['EXTRACT_FORMS',             a => ({ formSelector: a.formSelector })],
    watch_element:             ['WATCH_ELEMENT',             a => ({ selector: a.selector, duration: a.duration })],
    manage_storage:            ['MANAGE_STORAGE',            a => ({ action: a.action, storage: a.storage, key: a.key, value: a.value })],
    get_element_rect:          ['GET_ELEMENT_RECT',          a => ({ selector: a.selector })],
    get_computed_style:        ['GET_COMPUTED_STYLE',        a => ({ selector: a.selector, properties: a.properties })],
    color_picker:              ['COLOR_PICKER',              a => ({})],
    diff_page:                 ['DIFF_PAGE',                 a => ({ action: a.action, snapshotName: a.snapshotName })],
    text_to_speech:            ['TEXT_TO_SPEECH',            a => ({ text: a.text, lang: a.lang, rate: a.rate, pitch: a.pitch })],
    extract_images:            ['EXTRACT_IMAGES',            a => ({ minWidth: a.minWidth, minHeight: a.minHeight, includeBackgroundImages: a.includeBackgroundImages, download: a.download, maxResults: a.maxResults })],
    search_in_page:            ['SEARCH_IN_PAGE',            a => ({ pattern: a.pattern, caseSensitive: a.caseSensitive, contextLength: a.contextLength, maxResults: a.maxResults, highlight: a.highlight })],
    video_control:             ['VIDEO_CONTROL',             a => ({ action: a.action, selector: a.selector, value: a.value })],
    generate_qrcode:           ['GENERATE_QRCODE',           a => ({ content: a.content, size: a.size, errorCorrection: a.errorCorrection, showImage: a.showImage })],
    page_to_markdown:          ['PAGE_TO_MARKDOWN',          a => ({ selector: a.selector, includeImages: a.includeImages, includeLinks: a.includeLinks, maxLength: a.maxLength })],
    performance_audit:         ['PERFORMANCE_AUDIT',         a => ({ includeResourceTiming: a.includeResourceTiming, includePaintTiming: a.includePaintTiming, includeMemoryInfo: a.includeMemoryInfo })],
    screenshot_element:        ['SCREENSHOT_ELEMENT',        a => ({ selector: a.selector, quality: a.quality, format: a.format })],
    shadow_dom_query:          ['SHADOW_DOM_QUERY',          a => ({ selector: a.selector, deep: a.deep, maxDepth: a.maxDepth, maxResults: a.maxResults })],
    page_to_pdf:               ['PAGE_TO_PDF',               a => ({ fileName: a.fileName, landscape: a.landscape, scale: a.scale, printBackground: a.printBackground, margins: a.margins })],
    page_to_json:              ['PAGE_TO_JSON',              a => ({ selector: a.selector, maxItems: a.maxItems })],
    find_similar_elements:     ['FIND_SIMILAR_ELEMENTS',     a => ({ selector: a.selector, maxResults: a.maxResults })],
    get_iframe_content:        ['GET_IFRAME_CONTENT',        a => ({ selector: a.selector, includeNested: a.includeNested, maxLength: a.maxLength })],
    run_javascript:            ['RUN_JAVASCRIPT',            a => ({ code: a.code, timeout: a.timeout })],
    inject_css:                ['INJECT_CSS',                a => ({ css: a.css, targetSelector: a.targetSelector, injectMode: a.injectMode })],
    find_text_on_page:         ['FIND_TEXT_ON_PAGE',         a => ({ query: a.query, caseSensitive: a.caseSensitive, highlight: a.highlight })],
    get_page_language:         ['GET_PAGE_LANGUAGE',         a => ({})],
    read_accessibility_tree:   ['READ_ACCESSIBILITY_TREE',   a => ({ maxResults: a.maxResults })],
    set_zoom:                  ['SET_ZOOM',                  a => ({ level: a.level })],
    clear_page_data:           ['CLEAR_PAGE_DATA',           a => ({ site: a.site })],
  };

  // 直接执行的工具
  if (BACKGROUND_HANDLERS[toolName]) {
    console.log(`[Background] ${toolName} 直接执行，不通过 content script`);
    return BACKGROUND_HANDLERS[toolName](args);
  }

  // Content Script 委派的工具
  if (CONTENT_TOOLS[toolName]) {
    const [messageType, buildPayload] = CONTENT_TOOLS[toolName];
    const messagePayload = buildPayload(args);

    return new Promise((resolve) => {
      const sendToContentScript = (targetTabId) => {
      return new Promise((innerResolve) => {
        chrome.tabs.sendMessage(targetTabId, { type: messageType, ...messagePayload }, (response) => {
          if (chrome.runtime.lastError) {
            const errorMsg = chrome.runtime.lastError.message;
            console.warn('[Background] 发送消息到 content script 失败:', errorMsg);
            
            // 检查是否是可访问的 URL
            chrome.tabs.get(targetTabId, (tab) => {
              if (chrome.runtime.lastError || !tab) {
                innerResolve({ success: false, error: '无法访问该标签页: ' + errorMsg, tool_call_id: toolCallId });
                return;
              }
              
              const url = tab.url || '';
              if (url.startsWith('chrome://') || url.startsWith('chrome-extension://') || url.startsWith('about:')) {
                innerResolve({ success: false, error: '无法在系统页面使用工具: ' + url, tool_call_id: toolCallId });
                return;
              }
              
              // 尝试自动注入 content script（从 manifest 读取实际文件名，因为 Vite 打包后 hash 会变）
              console.log('[Background] 尝试自动注入 content script 到 Tab:', targetTabId);
              const manifest = chrome.runtime.getManifest();
              const contentJsFiles = manifest.content_scripts?.[0]?.js || [];
              const contentFile = contentJsFiles.find(f => f.includes('content-')) || 'content.js';
              chrome.scripting.executeScript({
                target: { tabId: targetTabId },
                files: [contentFile]
              })
                .then(() => {
                  console.log('[Background] Content script 注入成功, 重试发送消息');
                  // 注入成功后稍等片刻再发送消息
                  setTimeout(() => {
                    chrome.tabs.sendMessage(targetTabId, { type: messageType, ...messagePayload }, (retryResponse) => {
                      if (chrome.runtime.lastError) {
                        console.warn('[Background] 重试发送消息也失败:', chrome.runtime.lastError.message);
                        innerResolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
                      } else {
                        innerResolve({ ...retryResponse, tool_call_id: toolCallId });
                      }
                    });
                  }, 500);
                })
                .catch(err => {
                  console.error('[Background] 注入 content script 失败:', err);
                  innerResolve({ success: false, error: '注入 Content Script 失败: ' + err.message, tool_call_id: toolCallId });
                });
            });
          } else {
            innerResolve({ ...response, tool_call_id: toolCallId });
          }
        });
      });
    };
    
    if (tabId) {
      sendToContentScript(tabId).then(result => resolve(result));
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          sendToContentScript(tabs[0].id).then(result => resolve(result));
        } else {
          resolve({ success: false, error: '没有可用的标签页', tool_call_id: toolCallId });
        }
      });
    }
  });
  }

  // 未知工具
  return { success: false, error: '未知工具: ' + toolName, tool_call_id: toolCallId };
}

/**
 * 执行书签搜索
 */
function executeSearchBookmarks(args, toolCallId) {
  const query = args.query || '';
  const maxResults = args.maxResults || 10;
  
  console.log('[Background] 执行书签搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults);
  
  return new Promise((resolve) => {
    if (!chrome.bookmarks) {
      console.error('[Background] chrome.bookmarks API 不可用');
      resolve('浏览器不支持书签 API');
      return;
    }
    
    // 如果查询为空，获取书签树根节点来列出所有书签
    if (!query || query.trim() === '') {
      console.log('[Background] 空查询，获取书签根节点...');
      chrome.bookmarks.getTree((bookmarksTree) => {
        console.log('[Background] chrome.bookmarks.getTree 回调, 树节点数量:', bookmarksTree ? bookmarksTree.length : 'null');
        
        if (chrome.runtime.lastError) {
          console.error('[Background] chrome.bookmarks.getTree 错误:', chrome.runtime.lastError.message);
          resolve('获取书签失败: ' + chrome.runtime.lastError.message);
          return;
        }
        
        // 递归收集所有书签（排除文件夹）
        const allBookmarks = [];
        function collectBookmarks(nodes) {
          if (!nodes) return;
          nodes.forEach(node => {
            if (node.url) {
              allBookmarks.push(node);
            }
            if (node.children && node.children.length > 0) {
              collectBookmarks(node.children);
            }
          });
        }
        collectBookmarks(bookmarksTree);
        
        console.log('[Background] 收集到的书签总数:', allBookmarks.length);
        
        if (allBookmarks.length === 0) {
          resolve('浏览器中暂无书签');
          return;
        }
        
        // 限制结果数量
        const limitedResults = allBookmarks.slice(0, maxResults);
        
        // 格式化结果
        const formattedResults = limitedResults.map(bookmark => ({
          title: bookmark.title || '(无标题)',
          url: bookmark.url || '',
          dateAdded: bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : null
        }));
        
        const resultText = `浏览器中共有 ${allBookmarks.length} 个书签，显示前 ${formattedResults.length} 个：\n` +
          formattedResults.map((b, i) => `${i+1}. ${b.title}\n   URL: ${b.url}`).join('\n\n');
        
        console.log('[Background] 书签搜索成功，返回结果:', formattedResults.length);
        resolve(resultText);
      });
      return;
    }
    
    // 有查询关键词，执行搜索
    console.log('[Background] 调用 chrome.bookmarks.search...');
    chrome.bookmarks.search(query, (results) => {
      console.log('[Background] chrome.bookmarks.search 回调, 结果数量:', results ? results.length : 'null');
      
      if (chrome.runtime.lastError) {
        console.error('[Background] chrome.bookmarks.search 错误:', chrome.runtime.lastError.message);
        resolve('搜索书签失败: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (!results || results.length === 0) {
        console.log('[Background] 未找到匹配的书签');
        resolve('未找到匹配的书签。提示：尝试使用具体关键词搜索');
        return;
      }
      
      // 限制结果数量
      const limitedResults = results.slice(0, maxResults);
      
      // 格式化结果
      const formattedResults = limitedResults.map(bookmark => ({
        title: bookmark.title || '(无标题)',
        url: bookmark.url || '',
        dateAdded: bookmark.dateAdded ? new Date(bookmark.dateAdded).toLocaleString('zh-CN') : null
      }));
      
      const resultText = `找到 ${results.length} 个匹配的书签，显示前 ${formattedResults.length} 个：\n` +
        formattedResults.map((b, i) => `${i+1}. ${b.title}\n   URL: ${b.url}`).join('\n\n');
      
      console.log('[Background] 书签搜索成功，返回结果:', formattedResults.length);
      resolve(resultText);
    });
  });
}

/**
 * 执行历史记录搜索
 */
function executeSearchHistory(args, toolCallId) {
  const query = args.query || '';
  const maxResults = args.maxResults || 10;
  const startTime = args.startTime || null;
  const endTime = args.endTime || null;
  
  console.log('[Background] 执行历史记录搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults, '时间范围:', startTime, '-', endTime);
  
  return new Promise((resolve) => {
    if (!chrome.history) {
      console.error('[Background] chrome.history API 不可用');
      resolve('浏览器不支持历史 API');
      return;
    }
    
    const searchOptions = {
      text: query,
      maxResults: maxResults
    };
    
    if (startTime) {
      searchOptions.startTime = startTime;
    }
    if (endTime) {
      searchOptions.endTime = endTime;
    }
    
    console.log('[Background] 调用 chrome.history.search, 选项:', JSON.stringify(searchOptions));
    chrome.history.search(searchOptions, (results) => {
      console.log('[Background] chrome.history.search 回调, 结果数量:', results ? results.length : 'null');
      
      if (chrome.runtime.lastError) {
        console.error('[Background] chrome.history.search 错误:', chrome.runtime.lastError.message);
        resolve('搜索历史失败: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (!results || results.length === 0) {
        console.log('[Background] 未找到匹配的访问记录');
        resolve('未找到匹配的访问记录。提示：尝试使用具体关键词搜索');
        return;
      }
      
      // 格式化结果
      const formattedResults = results.map(history => ({
        title: history.title || '(无标题)',
        url: history.url,
        lastVisitTime: history.lastVisitTime ? new Date(history.lastVisitTime).toLocaleString('zh-CN') : null,
        visitCount: history.visitCount || 0
      }));
      
      const resultText = `找到 ${results.length} 个匹配的访问记录：\n` +
        formattedResults.map((h, i) => `${i+1}. ${h.title}\n   URL: ${h.url}\n   最后访问: ${h.lastVisitTime}\n   访问次数: ${h.visitCount}`).join('\n\n');
      
      console.log('[Background] 历史记录搜索成功，返回结果:', formattedResults.length);
      resolve(resultText);
    });
  });
}

/**
 * 执行标签页截图
 */
function executeCaptureScreenshot(args, toolCallId) {
  const format = args.format || 'jpeg';
  const quality = args.quality || 80;
  
  console.log('[Background] 执行标签页截图:', 'format=', format, 'quality=', quality);
  
  return new Promise((resolve) => {
    // 使用 chrome.tabs.captureVisibleTab 截图当前可见标签页
    const captureOptions = {
      format: format,
      quality: quality
    };
    
    console.log('[Background] 准备截图可见标签页...');
    chrome.tabs.captureVisibleTab(undefined, captureOptions, (dataUrl) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 截图失败:', chrome.runtime.lastError.message);
        resolve('截图失败: ' + chrome.runtime.lastError.message);
        return;
      }
      
      if (!dataUrl || dataUrl.length === 0) {
        console.error('[Background] 截图结果为空');
        resolve('截图结果为空，可能是该页面不允许截图或窗口中没有可见标签页');
        return;
      }
      
      const imageSize = (dataUrl.length / 1024 / 1024).toFixed(2);
      
      console.log('[Background] 截图成功，dataUrl 长度:', dataUrl.length, '大小:', imageSize, 'MB');
      
      // 触发下载
      triggerScreenshotDownload(dataUrl, format);
      
      // 返回成功消息
      const result = `截图成功！\n图片大小约 ${imageSize} MB\n格式: ${format}\n质量: ${quality}\n截图已自动下载到浏览器默认下载目录`;
      resolve(result);
    });
  });
}

/**
 * 触发截图下载
 */
function triggerScreenshotDownload(dataUrl, format) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const fileName = `screenshot_${timestamp}.${format === 'png' ? 'png' : 'jpg'}`;
  
  // 直接将 Base64 data URL 传给 chrome.downloads
  chrome.downloads.download({
    url: dataUrl,
    filename: 'Downloads/' + fileName,
    saveAs: false
  }, (downloadId) => {
    if (chrome.runtime.lastError) {
      console.error('[Background] 下载失败:', chrome.runtime.lastError.message);
    } else {
      console.log('[Background] 截图已触发下载，ID:', downloadId, '文件名:', fileName);
    }
  });
}

/**
 * 执行问题澄清工具
 * 通过 Side Panel 弹窗让用户选择或输入澄清信息
 * 注意：此工具需要用户交互，使用独立的澄清超时配置
 */
async function executeClarifyQuestion(args, toolCallId) {
  const { question, options, recommendedOption, allowCustomInput = true, allowAdditionalInfo = true } = args;
  
  console.log('[Background] 执行澄清工具:', args, 'toolCallId:', toolCallId);
  
  // 获取配置以使用合适的超时时间
  const config = await getStoredConfig();
  const clarifyTimeout = config.reactConfig.clarifyTimeout;
  
  return new Promise((resolve) => {
    const clarifyData = {
      question,
      options: options || [],
      recommendedOption: recommendedOption !== undefined ? recommendedOption : 0,
      allowCustomInput,
      allowAdditionalInfo,
      toolCallId,
      timeout: clarifyTimeout  // 传递超时时间给前端显示倒计时
    };
    
    let timeoutId = null;
    let clarifyResponseHandler = null;
    
    /**
     * 清理函数：确保监听器和计时器都被正确清理
     */
    const cleanup = () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
      if (clarifyResponseHandler) {
        chrome.runtime.onMessage.removeListener(clarifyResponseHandler);
        clarifyResponseHandler = null;
      }
    };
    
    /**
     * 处理澄清响应
     */
    const handleResponse = (msg) => {
      if (msg.type === 'CLARIFY_RESPONSE' && msg.toolCallId === toolCallId) {
        cleanup();
        
        console.log('[Background] 收到澄清响应:', msg);
        
        const { selectedOption, customInput, additionalInfo } = msg;
        
        let result = '';
        if (selectedOption >= 0 && options[selectedOption]) {
          result = `已选择: ${options[selectedOption]}`;
        } else if (customInput && customInput.trim()) {
          result = `自定义输入: ${customInput.trim()}`;
        } else {
          result = '未提供澄清信息';
        }
        
        if (additionalInfo && additionalInfo.trim()) {
          result += `\n补充说明: ${additionalInfo.trim()}`;
        }
        
        resolve(result);
      }
    };
    
    // 发送消息到 Side Panel 显示澄清弹窗
    chrome.runtime.sendMessage({
      type: 'SHOW_CLARIFY_DIALOG',
      data: clarifyData
    }, (response) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 发送澄清消息失败:', chrome.runtime.lastError.message);
        cleanup(); // 确保清理
        resolve({ 
          success: false, 
          error: '无法显示澄清对话框: ' + chrome.runtime.lastError.message,
          tool_call_id: toolCallId 
        });
        return;
      }
      
      console.log('[Background] 澄清对话框已发送到 Side Panel，超时:', clarifyTimeout, 'ms');
      
      // 设置超时处理（使用配置的澄清超时时间）
      timeoutId = setTimeout(() => {
        console.error('[Background] 澄清对话框超时');
        cleanup(); // 确保清理
        
        // 通知前端倒计时结束
        chrome.runtime.sendMessage({
          type: 'CLARIFY_TIMEOUT',
          toolCallId: toolCallId
        }).catch(() => {});
        
        resolve({ 
          success: false, 
          error: `用户未在规定时间内完成澄清 (${Math.round(clarifyTimeout/1000)}秒)`,
          tool_call_id: toolCallId 
        });
      }, clarifyTimeout);
      
      // 监听用户的澄清响应
      clarifyResponseHandler = (msg, sender, sendResponse) => {
        handleResponse(msg);
      };
      
      chrome.runtime.onMessage.addListener(clarifyResponseHandler);
    });
  });
}

/**
 * 执行浏览器通知工具
 * 使用 chrome.notifications API 显示桌面通知
 */
function executeShowNotification(args, toolCallId) {
  const { 
    title, 
    message, 
    icon, 
    silent = false, 
    requireInteraction = false, 
    playSound = false, 
    soundType = 'default' 
  } = args;
  
  console.log('[Background] 执行浏览器通知:', args, 'toolCallId:', toolCallId);
  
  return new Promise((resolve) => {
    // 使用 chrome.notifications API 创建通知
    const notificationOptions = {
      type: 'basic',
      title: title,
      message: message,
      iconUrl: icon || 'icons/icon128.png',
      silent: silent,
      requireInteraction: requireInteraction
    };
    
    chrome.notifications.create(notificationOptions, (notificationId) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 创建通知失败:', chrome.runtime.lastError.message);
        resolve('通知创建失败: ' + chrome.runtime.lastError.message);
        return;
      }
      
      console.log('[Background] 通知已创建，ID:', notificationId);
      
      // 播放提示音 - 发送消息到 side_panel 播放
      if (playSound) {
        chrome.runtime.sendMessage({
          type: 'PLAY_NOTIFICATION_SOUND',
          soundType: soundType
        });
      }
      
      resolve('通知已发送');
    });
  });
}

/**
 * 带超时控制的 fetch 请求
 */
async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      throw new Error(`请求超时 (${timeoutMs}ms)`);
    }
    throw error;
  }
}

/**
 * 带重试的 fetch 请求
 * 可重试的错误：网络错误、超时、5xx、429（Rate Limit）
 * 不重试的错误：4xx（除429外）、取消
 * 使用指数退避策略：baseDelay * 2^attempt
 *
 * @param {string} url
 * @param {Object} options - fetch options
 * @param {number} timeoutMs - 单次请求超时时间
 * @param {number} maxRetries - 最大重试次数（默认3）
 * @param {number} baseDelay - 基础延迟毫秒数（默认1000）
 * @param {Function} onRetry - 重试回调 (attempt, error, delay) => void
 * @returns {Promise<Response>}
 */
async function fetchWithRetry(url, options, timeoutMs, maxRetries = 3, baseDelay = 1000, onRetry = null) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const response = await fetchWithTimeout(url, options, timeoutMs);

      // 5xx 或 429 可重试
      if ((response.status >= 500 || response.status === 429) && attempt < maxRetries) {
        const errorText = await response.text().catch(() => '');
        lastError = new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
        const delay = baseDelay * Math.pow(2, attempt);
        console.log(`[Background] API 返回 ${response.status}，${delay}ms 后重试 (${attempt + 1}/${maxRetries})`);
        if (onRetry) onRetry(attempt + 1, lastError, delay);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      return response;
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries) break;

      // 被取消（AbortError 且不是超时）不重试
      if (error.name === 'AbortError' && !error.message.includes('超时')) {
        break;
      }

      const delay = baseDelay * Math.pow(2, attempt);
      console.log(`[Background] API 调用失败，${delay}ms 后重试 (${attempt + 1}/${maxRetries}):`, error.message);
      if (onRetry) onRetry(attempt + 1, error, delay);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

function executeFetchUrl(args, toolCallId) {
  const { url, method = 'GET', headers = {}, body, timeout = 30000 } = args;
  
  console.log('[Background] 执行 HTTP 请求:', 'method=', method, 'url=', url, 'timeout=', timeout);
  
  // 验证 URL 格式
  if (!url) {
    return Promise.resolve({ 
      success: false, 
      error: '缺少 URL 参数',
      tool_call_id: toolCallId 
    });
  }
  
  // 检查 URL 是否有效
  try {
    new URL(url);
  } catch (e) {
    return Promise.resolve({ 
      success: false, 
      error: `无效的 URL 格式: ${url}`,
      tool_call_id: toolCallId 
    });
  }
  
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      controller.abort();
      console.log('[Background] HTTP 请求超时:', url);
    }, timeout);
    
    const fetchOptions = {
      method: method.toUpperCase(),
      headers: headers,
      signal: controller.signal
    };
    
    // 只在有 body 且不是 GET/HEAD 方法时添加 body
    if (body && method.toUpperCase() !== 'GET' && method.toUpperCase() !== 'HEAD') {
      fetchOptions.body = typeof body === 'object' ? JSON.stringify(body) : body;
    }
    
    console.log('[Background] fetch 选项:', JSON.stringify(fetchOptions));
    
    fetch(url, fetchOptions)
    .then(async response => {
      clearTimeout(timeoutId);
      console.log('[Background] HTTP 响应状态:', response.status, response.statusText);
      
      try {
        const text = await response.text();
        const result = {
          success: response.status >= 200 && response.status < 300,
          status: response.status,
          statusText: response.statusText,
          content: text.substring(0, 10000),
          contentLength: text.length,
          url: response.url
        };
        console.log('[Background] HTTP 响应内容长度:', text.length);
        resolve({ ...result, tool_call_id: toolCallId });
      } catch (textError) {
        console.error('[Background] 读取响应内容失败:', textError);
        resolve({
          success: false,
          error: `读取响应内容失败: ${textError.message}`,
          status: response.status,
          tool_call_id: toolCallId
        });
      }
    })
    .catch(error => {
      clearTimeout(timeoutId);
      
      let errorMessage = error.message;
      
      // 提供更详细的错误信息
      if (error.name === 'AbortError') {
        // AbortError 是预期的超时行为，使用 warn 而非 error
        console.warn('[Background] HTTP 请求超时:', url, `(${timeout}ms)`);
        errorMessage = `请求超时 (${timeout}ms)，目标服务器响应过慢`;
      } else {
        console.error('[Background] HTTP 请求失败:', error.name, error.message);
        if (error.message === 'Failed to fetch') {
          errorMessage = `无法访问目标 URL，可能原因：\n1. 目标服务器不可达\n2. URL 不存在或已失效\n3. 目标服务器拒绝连接\n4. 网络连接问题`;
        } else if (error.message.includes('CORS')) {
          errorMessage = `CORS 跨域限制，目标服务器不允许跨域访问`;
        }
      }
      
      resolve({ 
        success: false, 
        error: errorMessage,
        originalError: error.message,
        url: url,
        tool_call_id: toolCallId 
      });
    });
  });
}

/**
 * 获取浏览器信息
 */
function executeGetBrowserInfo(args, toolCallId) {
  console.log('[Background] 获取浏览器信息');
  
  const info = {
    success: true,
    browserName: navigator.appName,
    browserVersion: navigator.appVersion,
    platform: navigator.platform,
    language: navigator.language,
    userAgent: navigator.userAgent,
    cookieEnabled: navigator.cookieEnabled,
    onLine: navigator.onLine,
    prefersDarkMode: typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches,
    screenWidth: typeof screen !== 'undefined' ? screen.width : null,
    screenHeight: typeof screen !== 'undefined' ? screen.height : null,
    colorDepth: typeof screen !== 'undefined' ? screen.colorDepth : null
  };
  
  // 通过 chrome API 获取更多信息
  if (typeof chrome !== 'undefined' && chrome.runtime) {
    info.extensionVersion = chrome.runtime.getManifest().version;
  }
  
  return Promise.resolve(info);
}

/**
 * 下载文件
 */
function executeDownloadFile(args, toolCallId) {
  const { url, filename } = args;
  
  console.log('[Background] 下载文件:', 'url=', url, 'filename=', filename);
  
  return new Promise((resolve) => {
    // 提取文件名
    let downloadFilename = filename;
    if (!downloadFilename) {
      const urlParts = url.split('/');
      downloadFilename = urlParts[urlParts.length - 1].split('?')[0] || 'download';
    }
    
    chrome.downloads.download({
      url: url,
      filename: 'Downloads/' + downloadFilename,
      saveAs: true
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 下载失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        console.log('[Background] 下载已创建，ID:', downloadId);
        resolve({ 
          success: true, 
          message: `文件下载已开始`,
          downloadId: downloadId,
          filename: downloadFilename
        });
      }
    });
  });
}

/**
 * 打开新标签页
 */
function executeOpenTab(args, toolCallId) {
  const { url, active = true } = args;
  
  console.log('[Background] 打开新标签页:', 'url=', url, 'active=', active);
  
  return new Promise((resolve) => {
    chrome.tabs.create({ url: url, active: active }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 打开标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ 
          success: true, 
          message: `已打开新标签页`,
          tabId: tab.id,
          url: tab.url 
        });
      }
    });
  });
}

/**
 * 切换到指定标签页
 */
function executeSwitchTab(args, toolCallId) {
  const { tabId } = args;
  
  console.log('[Background] 切换标签页:', 'tabId=', tabId);
  
  return new Promise((resolve) => {
    chrome.tabs.update(tabId, { active: true }, (tab) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 切换标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve({ 
          success: true, 
          message: `已切换到标签页 ${tabId}`,
          tabId: tab.id,
          url: tab.url 
        });
      }
    });
  });
}

/**
 * 关闭指定标签页
 */
function executeCloseTab(args, toolCallId) {
  const { tabId } = args;
  
  console.log('[Background] 关闭标签页:', 'tabId=', tabId);
  
  return new Promise((resolve) => {
    const targetTabId = tabId || null;
    
    if (targetTabId === null) {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs.length > 0) {
          chrome.tabs.remove(tabs[0].id, () => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message });
            } else {
              resolve({ success: true, message: '已关闭当前标签页' });
            }
          });
        } else {
          resolve({ success: false, error: '未找到当前标签页' });
        }
      });
    } else {
      chrome.tabs.remove(tabId, () => {
        if (chrome.runtime.lastError) {
          resolve({ success: false, error: chrome.runtime.lastError.message });
        } else {
          resolve({ success: true, message: `已关闭标签页 ${tabId}` });
        }
      });
    }
  });
}

/**
 * 获取当前窗口的所有标签页
 */
function executeGetTabs(args, toolCallId) {
  const { includeUrl = true, includeTitle = true } = args;
  
  console.log('[Background] 获取标签页列表:', 'includeUrl=', includeUrl, 'includeTitle=', includeTitle);
  
  return new Promise((resolve) => {
    chrome.tabs.query({ currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError) {
        console.error('[Background] 获取标签页失败:', chrome.runtime.lastError.message);
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        const result = tabs.map(tab => {
          const item = { id: tab.id };
          if (includeUrl) item.url = tab.url;
          if (includeTitle) item.title = tab.title;
          item.active = tab.active;
          return item;
        });
        
        resolve({ 
          success: true, 
          count: result.length,
          tabs: result 
        });
      }
    });
  });
}

/**
 * Cookie管理工具
 */
function executeManageCookies(args, toolCallId) {
  return new Promise((resolve) => {
    const { action, name, value, domain, path = '/', secure = false, httpOnly = false, expirationDate } = args;
    
    const getCurrentDomain = (callback) => {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (tabs && tabs[0] && tabs[0].url) {
          try {
            const url = new URL(tabs[0].url);
            callback(url.hostname);
          } catch (e) {
            callback('');
          }
        } else {
          callback('');
        }
      });
    };
    
    getCurrentDomain((currentDomain) => {
      const cookieDomain = domain || currentDomain;
      
      switch (action) {
        case 'get':
          if (!name) {
            resolve({ success: false, error: 'get操作需要提供name参数', tool_call_id: toolCallId });
            return;
          }
          chrome.cookies.get({ url: `https://${cookieDomain}`, name }, (cookie) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, cookie: cookie, tool_call_id: toolCallId });
            }
          });
          break;
          
        case 'set':
          if (!name || value === undefined) {
            resolve({ success: false, error: 'set操作需要提供name和value参数', tool_call_id: toolCallId });
            return;
          }
          const cookieData = {
            url: `https://${cookieDomain}`,
            name,
            value,
            path,
            secure,
            httpOnly,
            domain: cookieDomain.startsWith('.') ? cookieDomain : '.' + cookieDomain
          };
          if (expirationDate) {
            cookieData.expirationDate = expirationDate;
          }
          chrome.cookies.set(cookieData, (cookie) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, cookie: cookie, message: `已设置Cookie: ${name}`, tool_call_id: toolCallId });
            }
          });
          break;
          
        case 'remove':
          if (!name) {
            resolve({ success: false, error: 'remove操作需要提供name参数', tool_call_id: toolCallId });
            return;
          }
          chrome.cookies.remove({ url: `https://${cookieDomain}`, name }, (details) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, message: `已删除Cookie: ${name}`, tool_call_id: toolCallId });
            }
          });
          break;
          
        case 'list':
          chrome.cookies.getAll({ domain: cookieDomain }, (cookies) => {
            if (chrome.runtime.lastError) {
              resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
            } else {
              resolve({ success: true, cookies: cookies, total: cookies.length, tool_call_id: toolCallId });
            }
          });
          break;
          
        default:
          resolve({ success: false, error: `未知操作: ${action}`, tool_call_id: toolCallId });
      }
    });
  });
}

/**
 * 定时任务工具
 */
function executeScheduleTask(args, toolCallId) {
  return new Promise((resolve) => {
    const { action, name, delayInMinutes, periodInMinutes, scheduledTime, taskData } = args;
    
    switch (action) {
      case 'create':
        if (!name) {
          resolve({ success: false, error: 'create操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        
        const alarmInfo = {};
        
        if (periodInMinutes !== undefined) {
          alarmInfo.periodInMinutes = periodInMinutes;
        }
        if (delayInMinutes !== undefined) {
          alarmInfo.delayInMinutes = delayInMinutes;
        }
        if (scheduledTime) {
          alarmInfo.when = new Date(scheduledTime).getTime();
        }
        
        if (taskData) {
          chrome.storage.local.set({ [`schedule_task_${name}`]: taskData }, () => {});
        }
        
        chrome.alarms.create(name, alarmInfo, () => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
          } else {
            resolve({ success: true, message: `已创建定时任务: ${name}`, tool_call_id: toolCallId });
          }
        });
        break;
        
      case 'get':
        if (!name) {
          resolve({ success: false, error: 'get操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        chrome.alarms.get(name, (alarm) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
          } else {
            resolve({ success: true, alarm: alarm, tool_call_id: toolCallId });
          }
        });
        break;
        
      case 'list':
        chrome.alarms.getAll((alarms) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
          } else {
            resolve({ success: true, alarms: alarms, total: alarms.length, tool_call_id: toolCallId });
          }
        });
        break;
        
      case 'clear':
        if (!name) {
          resolve({ success: false, error: 'clear操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        chrome.alarms.clear(name, (cleared) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
          } else {
            chrome.storage.local.remove(`schedule_task_${name}`);
            resolve({ success: true, cleared: cleared, message: `已清除定时任务: ${name}`, tool_call_id: toolCallId });
          }
        });
        break;
        
      case 'clearAll':
        chrome.alarms.clearAll((cleared) => {
          if (chrome.runtime.lastError) {
            resolve({ success: false, error: chrome.runtime.lastError.message, tool_call_id: toolCallId });
          } else {
            resolve({ success: true, cleared: cleared, message: '已清除所有定时任务', tool_call_id: toolCallId });
          }
        });
        break;
        
      default:
        resolve({ success: false, error: `未知操作: ${action}`, tool_call_id: toolCallId });
    }
  });
}

/**
 * 任务规划工具执行函数
 */
function executePlanTask(args, toolCallId) {
  const { taskDescription, subtasks = [], isComplex = true, strategy = 'sequential' } = args;
  
  console.log('[Background] 执行任务规划工具:', JSON.stringify(args));
  
  // 验证必要参数
  if (!taskDescription) {
    return Promise.resolve({ 
      success: false, 
      error: '缺少任务描述参数',
      tool_call_id: toolCallId 
    });
  }
  
  if (!Array.isArray(subtasks) || subtasks.length === 0) {
    return Promise.resolve({ 
      success: false, 
      error: '子任务列表不能为空',
      tool_call_id: toolCallId 
    });
  }
  
  // 验证子任务结构
  const invalidSubtasks = subtasks.filter(st => !st.id || !st.name || !st.description);
  if (invalidSubtasks.length > 0) {
    return Promise.resolve({ 
      success: false, 
      error: `子任务结构不完整，缺少id/name/description`,
      tool_call_id: toolCallId 
    });
  }
  
  // 生成任务规划摘要
  const planSummary = {
    taskDescription: taskDescription,
    isComplex: isComplex,
    strategy: strategy,
    totalSubtasks: subtasks.length,
    estimatedTotalSteps: subtasks.reduce((sum, st) => sum + (st.estimatedSteps || 1), 0),
    subtasks: subtasks.map(st => ({
      id: st.id,
      name: st.name,
      description: st.description,
      dependencies: st.dependencies || [],
      requiredTools: st.requiredTools || [],
      estimatedSteps: st.estimatedSteps || 1
    })),
    planId: toolCallId || crypto.randomUUID(),
    createdAt: new Date().toISOString()
  };
  
  // 保存当前任务规划到临时存储
  chrome.storage.local.set({ 
    [`current_plan_${planSummary.planId}`]: planSummary,
    lastPlanTimestamp: Date.now()
  }, () => {
    console.log('[Background] 任务规划已保存');
  });
  
  // 格式化返回结果
  const formatResult = () => {
    let result = `📋 任务规划完成\n\n`;
    result += `**原始任务**: ${taskDescription}\n\n`;
    result += `**任务复杂度**: ${isComplex ? '复杂任务（已拆解）' : '简单任务'}\n`;
    result += `**执行策略**: ${strategy === 'sequential' ? '顺序执行' : strategy === 'parallel' ? '并行执行' : '条件执行'}\n`;
    result += `**子任务数量**: ${subtasks.length}\n\n`;
    result += `**子任务列表**:\n`;
    
    subtasks.forEach((st, index) => {
      result += `\n${index + 1}. **${st.name}**\n`;
      result += `   - ID: ${st.id}\n`;
      result += `   - 描述: ${st.description}\n`;
      if (st.dependencies && st.dependencies.length > 0) {
        result += `   - 依赖: ${st.dependencies.join(', ')}\n`;
      }
      if (st.requiredTools && st.requiredTools.length > 0) {
        result += `   - 所需工具: ${st.requiredTools.join(', ')}\n`;
      }
      result += `   - 预估步骤: ${st.estimatedSteps || 1}\n`;
    });
    
    return result;
  };
  
  return Promise.resolve({
    success: true,
    data: planSummary,
    message: formatResult(),
    tool_call_id: toolCallId
  });
}

function evaluateExpression(expr, variables) {
  if (typeof expr === 'string' && expr.startsWith('{{') && expr.endsWith('}}')) {
    const code = expr.slice(2, -2).trim();
    try {
      return new Function(...Object.keys(variables), `return ${code}`)(...Object.values(variables));
    } catch (e) {
      return expr;
    }
  }
  return expr;
}

function substituteVariables(obj, variables) {
  if (typeof obj === 'string') {
    return evaluateExpression(obj, variables);
  }
  if (Array.isArray(obj)) {
    return obj.map(item => substituteVariables(item, variables));
  }
  if (typeof obj === 'object' && obj !== null) {
    const result = {};
    Object.keys(obj).forEach(key => {
      result[key] = substituteVariables(obj[key], variables);
    });
    return result;
  }
  return obj;
}

/**
 * 工作流执行工具
 */
function executeWorkflow(args, toolCallId) {
  return new Promise((resolve) => {
    const { workflow, workflowName, variables = {}, debug = false } = args;
    
    let workflowDefinition = workflow;
    
    if (workflowName && !workflow) {
      chrome.storage.local.get(`workflow_${workflowName}`, (result) => {
        workflowDefinition = result[`workflow_${workflowName}`];
        if (!workflowDefinition) {
          resolve({ success: false, error: `未找到工作流: ${workflowName}`, tool_call_id: toolCallId });
          return;
        }
        executeWorkflowSteps(workflowDefinition, variables, debug, toolCallId, resolve);
      });
    } else if (workflow) {
      executeWorkflowSteps(workflow, variables, debug, toolCallId, resolve);
    } else {
      resolve({ success: false, error: '需要提供workflow对象或workflowName', tool_call_id: toolCallId });
    }
  });
}

async function executeWorkflowSteps(workflow, variables, debug, toolCallId, resolve) {
  const { steps = [], name = '未命名工作流' } = workflow;
  const results = [];
  let currentVariables = { ...variables };
  
  if (debug) {
    console.log(`[Background] 开始执行工作流: ${name}, 步骤数: ${steps.length}`);
  }

  /**
   * 递归执行子步骤并收集结果（用于 condition/loop 内部）
   */
  async function runSubSteps(subSteps) {
    const subResults = [];
    let subVars = { ...currentVariables };

    for (let i = 0; i < subSteps.length; i++) {
      const step = subSteps[i];
      const stepName = step.name || `子步骤 ${i + 1}`;

      try {
        let result;
        switch (step.type) {
          case 'delay':
            await new Promise(r => setTimeout(r, (step.duration || 1000)));
            result = { success: true, message: `等待 ${step.duration || 1000}ms` };
            break;
          case 'variable':
            if (step.set) {
              Object.keys(step.set).forEach(key => {
                subVars[key] = evaluateExpression(step.set[key], subVars);
              });
              result = { success: true, variables: { ...subVars } };
            } else if (step.get) {
              result = { success: true, value: subVars[step.get] };
            }
            break;
          case 'condition': {
            const condResult = evaluateExpression(step.condition, subVars);
            const innerResults = [];
            if (condResult && step.ifTrue) {
              const inner = await runSubSteps(step.ifTrue);
              innerResults.push(...inner.results);
              subVars = { ...inner.variables };
            } else if (!condResult && step.ifFalse) {
              const inner = await runSubSteps(step.ifFalse);
              innerResults.push(...inner.results);
              subVars = { ...inner.variables };
            }
            result = { success: true, conditionResult: condResult, subResults: innerResults };
            break;
          }
          case 'loop': {
            const iterations = evaluateExpression(step.iterations || 5, subVars);
            const loopResults = [];
            for (let j = 0; j < iterations; j++) {
              subVars.loopIndex = j;
              if (step.steps) {
                const inner = await runSubSteps(step.steps);
                loopResults.push({ iteration: j, results: inner.results });
                subVars = { ...inner.variables };
              }
            }
            delete subVars.loopIndex;
            result = { success: true, iterations, loopResults };
            break;
          }
          case 'tool':
            const toolArgs = substituteVariables(step.args, subVars);
            const toolResult = await executeTool({
              name: step.tool,
              arguments: toolArgs
            });
            result = toolResult;
            if (step.saveResultTo) {
              subVars[step.saveResultTo] = toolResult;
            }
            break;
          default:
            result = { success: false, error: `未知步骤类型: ${step.type}` };
        }

        subResults.push({ step: stepName, result });

        if (!result.success && step.continueOnError !== true) {
          return { results: subResults, variables: subVars, error: `子步骤 "${stepName}" 失败: ${result.error}` };
        }
      } catch (error) {
        subResults.push({ step: stepName, result: { success: false, error: error.message } });
        if (step.continueOnError !== true) {
          return { results: subResults, variables: subVars, error: `子步骤 "${stepName}" 异常: ${error.message}` };
        }
      }
    }

    return { results: subResults, variables: subVars };
  }
  
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const stepName = step.name || `步骤 ${i + 1}`;
    
    if (debug) {
      console.log(`[Background] 执行步骤: ${stepName}`);
    }
    
    try {
      let result;
      
      switch (step.type) {
        case 'delay':
          await new Promise(r => setTimeout(r, (step.duration || 1000)));
          result = { success: true, message: `等待 ${step.duration || 1000}ms` };
          break;
          
        case 'variable':
          if (step.set) {
            Object.keys(step.set).forEach(key => {
              currentVariables[key] = evaluateExpression(step.set[key], currentVariables);
            });
            result = { success: true, variables: currentVariables };
          } else if (step.get) {
            result = { success: true, value: currentVariables[step.get] };
          }
          break;
          
        case 'condition': {
          const conditionResult = evaluateExpression(step.condition, currentVariables);
          const subResults = [];
          if (conditionResult && step.ifTrue) {
            const inner = await runSubSteps(step.ifTrue);
            subResults.push(...inner.results);
            currentVariables = { ...inner.variables };
          } else if (!conditionResult && step.ifFalse) {
            const inner = await runSubSteps(step.ifFalse);
            subResults.push(...inner.results);
            currentVariables = { ...inner.variables };
          }
          result = { success: true, conditionResult, subResults };
          break;
        }
          
        case 'loop': {
          const iterations = evaluateExpression(step.iterations || 5, currentVariables);
          const loopResults = [];
          for (let j = 0; j < iterations; j++) {
            currentVariables['loopIndex'] = j;
            if (step.steps) {
              const inner = await runSubSteps(step.steps);
              loopResults.push({ iteration: j, results: inner.results });
              currentVariables = { ...inner.variables };
            }
          }
          result = { success: true, iterations, loopResults };
          break;
        }
          
        case 'tool':
          const toolArgs = substituteVariables(step.args, currentVariables);
          const toolResult = await executeTool({
            name: step.tool,
            arguments: toolArgs
          });
          result = toolResult;
          if (step.saveResultTo) {
            currentVariables[step.saveResultTo] = toolResult;
          }
          break;
          
        default:
          result = { success: false, error: `未知步骤类型: ${step.type}` };
      }
      
      results.push({ step: stepName, result });
      
      if (!result.success && step.continueOnError !== true) {
        resolve({
          success: false,
          error: `工作流执行失败，步骤: ${stepName}, 错误: ${result.error}`,
          results: results,
          tool_call_id: toolCallId
        });
        return;
      }
      
    } catch (error) {
      if (debug) {
        console.error(`[Background] 步骤 ${stepName} 执行出错:`, error);
      }
      results.push({ step: stepName, result: { success: false, error: error.message } });
      
      if (step.continueOnError !== true) {
        resolve({
          success: false,
          error: `工作流执行失败，步骤: ${stepName}, 错误: ${error.message}`,
          results: results,
          tool_call_id: toolCallId
        });
        return;
      }
    }
  }
  
  resolve({
    success: true,
    message: `工作流 "${name}" 执行完成`,
    results: results,
    finalVariables: currentVariables,
    tool_call_id: toolCallId
  });
}

/**
 * 用户脚本管理工具
 */
function executeManageUserScripts(args, toolCallId) {
  return new Promise((resolve) => {
    const { action, name, code, matchPatterns, runAt = 'document_idle' } = args;
    
    switch (action) {
      case 'create':
        if (!name || !code) {
          resolve({ success: false, error: 'create操作需要提供name和code参数', tool_call_id: toolCallId });
          return;
        }
        const scriptData = {
          name,
          code,
          matchPatterns: matchPatterns || ['<all_urls>'],
          runAt,
          createdAt: Date.now(),
          enabled: true
        };
        chrome.storage.local.set({ [`user_script_${name}`]: scriptData }, () => {
          resolve({ success: true, message: `已创建脚本: ${name}`, script: scriptData, tool_call_id: toolCallId });
        });
        break;
        
      case 'get':
        if (!name) {
          resolve({ success: false, error: 'get操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        chrome.storage.local.get(`user_script_${name}`, (result) => {
          const script = result[`user_script_${name}`];
          if (script) {
            resolve({ success: true, script: script, tool_call_id: toolCallId });
          } else {
            resolve({ success: false, error: `未找到脚本: ${name}`, tool_call_id: toolCallId });
          }
        });
        break;
        
      case 'list':
        chrome.storage.local.get(null, (result) => {
          const scripts = Object.keys(result)
            .filter(key => key.startsWith('user_script_'))
            .map(key => result[key]);
          resolve({ success: true, scripts: scripts, total: scripts.length, tool_call_id: toolCallId });
        });
        break;
        
      case 'update':
        if (!name) {
          resolve({ success: false, error: 'update操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        chrome.storage.local.get(`user_script_${name}`, (result) => {
          const existing = result[`user_script_${name}`];
          if (!existing) {
            resolve({ success: false, error: `未找到脚本: ${name}`, tool_call_id: toolCallId });
            return;
          }
          const updated = {
            ...existing,
            code: code !== undefined ? code : existing.code,
            matchPatterns: matchPatterns !== undefined ? matchPatterns : existing.matchPatterns,
            runAt: runAt !== undefined ? runAt : existing.runAt,
            updatedAt: Date.now()
          };
          chrome.storage.local.set({ [`user_script_${name}`]: updated }, () => {
            resolve({ success: true, message: `已更新脚本: ${name}`, script: updated, tool_call_id: toolCallId });
          });
        });
        break;
        
      case 'delete':
        if (!name) {
          resolve({ success: false, error: 'delete操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        chrome.storage.local.remove(`user_script_${name}`, () => {
          resolve({ success: true, message: `已删除脚本: ${name}`, tool_call_id: toolCallId });
        });
        break;
        
      case 'run':
        if (!name && !code) {
          resolve({ success: false, error: 'run操作需要提供name或code参数', tool_call_id: toolCallId });
          return;
        }
        
        if (code) {
          chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
            if (tabs && tabs[0]) {
              // 通过消息通信让 content script 执行脚本
              chrome.tabs.sendMessage(tabs[0].id, {
                type: 'executeScript',
                code: code
              }, (response) => {
                if (response) {
                  resolve({ success: response.success, result: response.result, error: response.error, tool_call_id: toolCallId });
                } else {
                  resolve({ success: false, error: '脚本执行失败', tool_call_id: toolCallId });
                }
              });
            }
          });
        } else {
          chrome.storage.local.get(`user_script_${name}`, (result) => {
            const script = result[`user_script_${name}`];
            if (!script) {
              resolve({ success: false, error: `未找到脚本: ${name}`, tool_call_id: toolCallId });
              return;
            }
            chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
              if (tabs && tabs[0]) {
                // 通过消息通信让 content script 执行脚本
                chrome.tabs.sendMessage(tabs[0].id, {
                  type: 'executeScript',
                  code: script.code
                }, (response) => {
                  if (response) {
                    resolve({ success: response.success, result: response.result, error: response.error, tool_call_id: toolCallId });
                  } else {
                    resolve({ success: false, error: '脚本执行失败', tool_call_id: toolCallId });
                  }
                });
              }
            });
          });
        }
        break;
        
      default:
        resolve({ success: false, error: `未知操作: ${action}`, tool_call_id: toolCallId });
    }
  });
}

function stripHtml(html) {
  // Service Worker 中无法使用 DOM API，使用正则表达式去除 HTML 标签
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function calculateDiff(text1, text2) {
  const len1 = text1.length;
  const len2 = text2.length;
  const maxLen = Math.max(len1, len2);
  const similarity = maxLen > 0 ? (maxLen - Math.abs(len1 - len2)) / maxLen : 1;
  
  let differences = [];
  const minLen = Math.min(len1, len2);
  
  for (let i = 0; i < minLen; i += 50) {
    const chunk1 = text1.substring(i, i + 50);
    const chunk2 = text2.substring(i, i + 50);
    if (chunk1 !== chunk2) {
      differences.push({
        position: i,
        expected: chunk2,
        actual: chunk1
      });
    }
    if (differences.length >= 10) break;
  }
  
  return {
    similarity: Math.round(similarity * 100),
    differences: differences.slice(0, 10),
    totalDifferences: differences.length
  };
}

/**
 * URL对比工具
 */
function executeCompareUrls(args, toolCallId) {
  return new Promise((resolve) => {
    const { url1, url2, compareTextOnly = true, ignoreWhitespace = true } = args;
    
    if (!url1 || !url2) {
      resolve({ success: false, error: '需要提供url1和url2参数', tool_call_id: toolCallId });
      return;
    }
    
    console.log('[Background] compare_urls 开始执行:', url1, url2);
    
    let content1 = null;
    let content2 = null;
    let completed = 0;
    let resolved = false;
    
    const safeResolve = (result) => {
      if (!resolved) {
        resolved = true;
        console.log('[Background] compare_urls 执行完成:', result.success ? '成功' : '失败');
        resolve(result);
      }
    };
    
    const checkComplete = () => {
      completed++;
      console.log('[Background] compare_urls 进度:', completed, '/2');
      if (completed === 2) {
        if (!content1 || !content2) {
          safeResolve({ success: false, error: '获取页面内容失败', tool_call_id: toolCallId });
          return;
        }
        
        try {
          let text1 = compareTextOnly ? stripHtml(content1) : content1;
          let text2 = compareTextOnly ? stripHtml(content2) : content2;
          
          if (ignoreWhitespace) {
            text1 = text1.replace(/\s+/g, ' ').trim();
            text2 = text2.replace(/\s+/g, ' ').trim();
          }
          
          const areEqual = text1 === text2;
          const diff = calculateDiff(text1, text2);
          
          safeResolve({
            success: true,
            url1,
            url2,
            areEqual,
            diff,
            length1: text1.length,
            length2: text2.length,
            tool_call_id: toolCallId
          });
        } catch (error) {
          console.error('[Background] compare_urls 处理内容失败:', error);
          safeResolve({ success: false, error: '处理页面内容失败: ' + error.message, tool_call_id: toolCallId });
        }
      }
    };
    
    // 带超时的 fetch 请求（带 credentials 以支持需要登录的页面）
    const fetchWithTimeout = (url, timeout = 8000) => {
      return new Promise((resolveFetch) => {
        const timeoutId = setTimeout(() => {
          console.log('[Background] fetch 超时:', url);
          resolveFetch(null);
        }, timeout);
        
        fetch(url, {
          credentials: 'include',
          mode: 'cors',
          headers: {
            'User-Agent': navigator.userAgent
          }
        })
          .then(response => {
            clearTimeout(timeoutId);
            if (!response.ok) {
              console.warn(`[Background] fetch ${url} 返回状态: ${response.status}`);
              return response.text();
            }
            return response.text();
          })
          .then(text => {
            resolveFetch(text);
          })
          .catch(error => {
            clearTimeout(timeoutId);
            console.error(`[Background] fetch ${url} 失败:`, error.message);
            resolveFetch(null);
          });
      });
    };
    
    // 执行两个 fetch 请求
    fetchWithTimeout(url1).then(text => { content1 = text; checkComplete(); });
    fetchWithTimeout(url2).then(text => { content2 = text; checkComplete(); });
    
    // 兜底超时：15秒后强制返回
    setTimeout(() => {
      safeResolve({ success: false, error: '对比操作超时', tool_call_id: toolCallId });
    }, 15000);
  });
}

/**
 * 清除页面数据（localStorage, sessionStorage, cookies, cache）
 */
function executeClearPageData(args, toolCallId) {
  const { site } = args;

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
        return;
      }

      const tab = tabs[0];
      let origin;
      try {
        const url = new URL(tab.url);
        origin = url.origin;
      } catch (e) {
        resolve({ success: false, error: '无法解析当前标签页 URL', tool_call_id: toolCallId });
        return;
      }

      const targetSite = site || origin;
      const cleared = [];

      // 定义一个 Promise 链来处理所有清除操作
      const cleanupTasks = [];

      // 1. 清除 cookies
      cleanupTasks.push(new Promise((resolveTask) => {
        chrome.cookies.getAll({}, (cookies) => {
          if (chrome.runtime.lastError) {
            console.warn('[Background] 获取 cookies 失败:', chrome.runtime.lastError.message);
            resolveTask();
            return;
          }
          const matchingCookies = cookies.filter(c => {
            const cookieDomain = c.domain.startsWith('.') ? c.domain.substring(1) : c.domain;
            try {
              const targetHostname = new URL(targetSite).hostname;
              return targetHostname.endsWith(cookieDomain) || cookieDomain.endsWith(targetHostname);
            } catch (e) {
              return false;
            }
          });

          if (matchingCookies.length === 0) {
            resolveTask();
            return;
          }

          let removed = 0;
          matchingCookies.forEach((cookie) => {
            const protocol = cookie.secure ? 'https:' : 'http:';
            const cookieUrl = `${protocol}//${cookie.domain.replace(/^\./, '')}${cookie.path}`;
            chrome.cookies.remove({ url: cookieUrl, name: cookie.name }, () => {
              removed++;
              if (removed === matchingCookies.length) {
                cleared.push('cookies');
                resolveTask();
              }
            });
          });
        });
      }));

      // 2. 通过 content script 清除 localStorage 和 sessionStorage
      cleanupTasks.push(new Promise((resolveTask) => {
        chrome.tabs.sendMessage(tab.id, {
          type: 'CLEAR_PAGE_DATA',
          storageTypes: ['localStorage', 'sessionStorage']
        }, (response) => {
          if (chrome.runtime.lastError) {
            console.warn('[Background] 发送 CLEAR_PAGE_DATA 消息失败:', chrome.runtime.lastError.message);
            // 尝试注入 content script 后再试
            const manifest = chrome.runtime.getManifest();
            const contentJsFiles = manifest.content_scripts?.[0]?.js || [];
            const contentFile = contentJsFiles.find(f => f.includes('content-')) || 'content.js';
            chrome.scripting.executeScript({
              target: { tabId: tab.id },
              files: [contentFile]
            }).then(() => {
              setTimeout(() => {
                chrome.tabs.sendMessage(tab.id, {
                  type: 'CLEAR_PAGE_DATA',
                  storageTypes: ['localStorage', 'sessionStorage']
                }, (retryResponse) => {
                  if (chrome.runtime.lastError) {
                    resolveTask();
                  } else {
                    if (retryResponse?.cleared) {
                      cleared.push(...retryResponse.cleared);
                    }
                    resolveTask();
                  }
                });
              }, 500);
            }).catch(() => {
              resolveTask();
            });
          } else {
            if (response?.cleared) {
              cleared.push(...response.cleared);
            }
            resolveTask();
          }
        });
      }));

      // 3. 使用 chrome.browsingData.remove 清除 cache 和 cookies（作为补充）
      cleanupTasks.push(new Promise((resolveTask) => {
        if (!chrome.browsingData) {
          resolveTask();
          return;
        }
        const removalOptions = { origins: [targetSite] };
        chrome.browsingData.remove(removalOptions, {
          cache: true,
          cookies: true,
          localStorage: true
        }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Background] browsingData.remove 失败:', chrome.runtime.lastError.message);
          } else {
            if (!cleared.includes('cookies')) cleared.push('cookies');
            if (!cleared.includes('localStorage')) cleared.push('localStorage');
            if (!cleared.includes('cache')) cleared.push('cache');
          }
          resolveTask();
        });
      }));

      Promise.allSettled(cleanupTasks).then(() => {
        resolve({
          success: true,
          cleared: [...new Set(cleared)],
          site: targetSite,
          tool_call_id: toolCallId
        });
      });
    });
  });
}

/**
 * 调整浏览器窗口大小
 */
function executeResizeWindow(args, toolCallId) {
  const { width, height } = args;

  return new Promise((resolve) => {
    chrome.windows.getCurrent((currentWindow) => {
      if (chrome.runtime.lastError || !currentWindow) {
        resolve({ success: false, error: '无法获取当前窗口', tool_call_id: toolCallId });
        return;
      }

      const previous = { width: currentWindow.width, height: currentWindow.height };

      if (width === undefined && height === undefined) {
        resolve({
          success: true,
          current: previous,
          tool_call_id: toolCallId
        });
        return;
      }

      const updateInfo = {};
      if (width !== undefined) updateInfo.width = width;
      if (height !== undefined) updateInfo.height = height;

      chrome.windows.update(currentWindow.id, updateInfo, (updatedWindow) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            previous,
            tool_call_id: toolCallId
          });
          return;
        }

        resolve({
          success: true,
          previous,
          current: { width: updatedWindow.width, height: updatedWindow.height },
          tool_call_id: toolCallId
        });
      });
    });
  });
}

/**
 * 导航前进/后退
 */
function executeNavigateBackForward(args, toolCallId) {
  const { direction = 'back' } = args;

  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
        resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
        return;
      }

      const tabId = tabs[0].id;

      if (direction === 'forward') {
        chrome.tabs.goForward(tabId, () => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
              direction,
              tool_call_id: toolCallId
            });
          } else {
            resolve({ success: true, direction, tool_call_id: toolCallId });
          }
        });
      } else {
        chrome.tabs.goBack(tabId, () => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: chrome.runtime.lastError.message,
              direction,
              tool_call_id: toolCallId
            });
          } else {
            resolve({ success: true, direction, tool_call_id: toolCallId });
          }
        });
      }
    });
  });
}

/**
 * 重新加载标签页
 */
function executeReloadTab(args, toolCallId) {
  const { tabId, bypassCache = false } = args;

  return new Promise((resolve) => {
    const doReload = (targetTabId) => {
      chrome.tabs.reload(targetTabId, { bypassCache: !!bypassCache }, () => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            tabId: targetTabId,
            bypassCache: !!bypassCache,
            tool_call_id: toolCallId
          });
        } else {
          resolve({
            success: true,
            tabId: targetTabId,
            bypassCache: !!bypassCache,
            tool_call_id: toolCallId
          });
        }
      });
    };

    if (tabId !== undefined) {
      doReload(tabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
          return;
        }
        doReload(tabs[0].id);
      });
    }
  });
}

/**
 * 静音/取消静音标签页
 */
function executeMuteTab(args, toolCallId) {
  const { tabId, muted } = args;

  return new Promise((resolve) => {
    if (muted === undefined) {
      resolve({ success: false, error: '缺少 muted 参数', tool_call_id: toolCallId });
      return;
    }

    const doMute = (targetTabId) => {
      chrome.tabs.update(targetTabId, { muted: !!muted }, (tab) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            tabId: targetTabId,
            tool_call_id: toolCallId
          });
        } else {
          resolve({
            success: true,
            tabId: targetTabId,
            muted: tab.mutedInfo?.muted || !!muted,
            tool_call_id: toolCallId
          });
        }
      });
    };

    if (tabId !== undefined) {
      doMute(tabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
          return;
        }
        doMute(tabs[0].id);
      });
    }
  });
}

/**
 * 固定/取消固定标签页
 */
function executePinTab(args, toolCallId) {
  const { tabId, pinned } = args;

  return new Promise((resolve) => {
    if (pinned === undefined) {
      resolve({ success: false, error: '缺少 pinned 参数', tool_call_id: toolCallId });
      return;
    }

    const doPin = (targetTabId) => {
      chrome.tabs.update(targetTabId, { pinned: !!pinned }, (tab) => {
        if (chrome.runtime.lastError) {
          resolve({
            success: false,
            error: chrome.runtime.lastError.message,
            tabId: targetTabId,
            tool_call_id: toolCallId
          });
        } else {
          resolve({
            success: true,
            tabId: targetTabId,
            pinned: tab.pinned,
            tool_call_id: toolCallId
          });
        }
      });
    };

    if (tabId !== undefined) {
      doPin(tabId);
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
          return;
        }
        doPin(tabs[0].id);
      });
    }
  });
}

/**
 * 标签页分组
 */
function executeGroupTabs(args, toolCallId) {
  const { tabIds, title, color } = args;

  return new Promise((resolve) => {
    if (!tabIds || !Array.isArray(tabIds) || tabIds.length === 0) {
      resolve({ success: false, error: '缺少 tabIds 参数（需为非空数组）', tool_call_id: toolCallId });
      return;
    }

    if (!chrome.tabs.group) {
      resolve({
        success: false,
        error: '当前浏览器不支持标签页分组功能（需要 Chrome 89+）',
        tool_call_id: toolCallId
      });
      return;
    }

    const VALID_COLORS = ['grey', 'blue', 'red', 'yellow', 'green', 'pink', 'purple', 'cyan'];

    const groupOptions = { tabIds: [tabIds[0]] };

    chrome.tabs.group(groupOptions, (groupId) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
          tool_call_id: toolCallId
        });
        return;
      }

      // 将其他标签页加入该分组
      const addRemaining = (remainingIds, currentGroupId) => {
        if (remainingIds.length === 0) {
          finalizeGroup(currentGroupId);
          return;
        }
        const nextId = remainingIds[0];
        chrome.tabs.group({ tabIds: [nextId], groupId: currentGroupId }, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Background] 将标签页加入分组失败:', chrome.runtime.lastError.message);
          }
          addRemaining(remainingIds.slice(1), currentGroupId);
        });
      };

      const finalizeGroup = (currentGroupId) => {
        // chrome.tabGroups API 在某些 Service Worker 上下文中不可用
        if (!chrome.tabGroups) {
          resolve({
            success: true,
            groupId: currentGroupId,
            title: title || undefined,
            color: color || undefined,
            tabIds,
            tool_call_id: toolCallId
          });
          return;
        }

        const updateProps = {};
        if (title) updateProps.title = title;
        if (color && VALID_COLORS.includes(color)) updateProps.color = color;

        if (Object.keys(updateProps).length === 0) {
          resolve({
            success: true,
            groupId: currentGroupId,
            title: title || undefined,
            tabIds,
            tool_call_id: toolCallId
          });
          return;
        }

        chrome.tabGroups.update(currentGroupId, updateProps, () => {
          if (chrome.runtime.lastError) {
            console.warn('[Background] 更新分组属性失败:', chrome.runtime.lastError.message);
          }
          resolve({
            success: true,
            groupId: currentGroupId,
            title: title || undefined,
            color: color || undefined,
            tabIds,
            tool_call_id: toolCallId
          });
        });
      };

      addRemaining(tabIds.slice(1), groupId);
    });
  });
}

/**
 * 网络录制工具
 * 使用 chrome.debugger API 捕获网络请求
 */
const networkRecordingState = {
  active: false,
  tabId: null,
  requests: [],
  startTime: null,
  eventHandler: null
};

function createDebuggerEventHandler() {
  return (source, method, params) => {
    if (!networkRecordingState.active) return;

    if (method === 'Network.requestWillBeSent') {
      networkRecordingState.requests.push({
        requestId: params.requestId,
        url: params.request?.url || '',
        method: params.request?.method || 'GET',
        type: params.type || 'Unknown',
        timestamp: params.timestamp || Date.now(),
        status: null,
        statusText: null,
        responseReceived: false
      });
    } else if (method === 'Network.responseReceived') {
      const existing = networkRecordingState.requests.find(r => r.requestId === params.requestId);
      if (existing) {
        existing.status = params.response?.status || null;
        existing.statusText = params.response?.statusText || null;
        existing.responseReceived = true;
        existing.responseTimestamp = params.timestamp || Date.now();
        existing.mimeType = params.response?.mimeType || null;
      }
    }
  };
}

function executeRecordNetwork(args, toolCallId) {
  const { action } = args;

  return new Promise((resolve) => {
    if (action === 'status') {
      resolve({
        success: true,
        action: 'status',
        active: networkRecordingState.active,
        requestCount: networkRecordingState.requests.length,
        startTime: networkRecordingState.startTime,
        tool_call_id: toolCallId
      });
      return;
    }

    if (action === 'start') {
      if (networkRecordingState.active) {
        resolve({
          success: false,
          error: '网络录制已在运行中',
          action: 'start',
          tool_call_id: toolCallId
        });
        return;
      }

      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        if (chrome.runtime.lastError || !tabs || tabs.length === 0) {
          resolve({ success: false, error: '无法获取当前标签页', tool_call_id: toolCallId });
          return;
        }

        const tabId = tabs[0].id;

        chrome.debugger.attach({ tabId }, '1.3', () => {
          if (chrome.runtime.lastError) {
            resolve({
              success: false,
              error: '无法附加调试器: ' + chrome.runtime.lastError.message,
              action: 'start',
              tool_call_id: toolCallId
            });
            return;
          }

          networkRecordingState.active = true;
          networkRecordingState.tabId = tabId;
          networkRecordingState.requests = [];
          networkRecordingState.startTime = Date.now();
          networkRecordingState.eventHandler = createDebuggerEventHandler();

          chrome.debugger.onEvent.addListener(networkRecordingState.eventHandler);

          chrome.debugger.sendCommand({ tabId }, 'Network.enable', {}, () => {
            if (chrome.runtime.lastError) {
              console.warn('[Background] Network.enable 失败:', chrome.runtime.lastError.message);
              // 即使 Network.enable 失败，也继续录制（部分浏览器可能已自动启用）
            }

            resolve({
              success: true,
              action: 'start',
              tabId,
              tool_call_id: toolCallId
            });
          });
        });
      });
      return;
    }

    if (action === 'stop') {
      if (!networkRecordingState.active) {
        resolve({
          success: false,
          error: '没有正在进行的网络录制',
          action: 'stop',
          tool_call_id: toolCallId
        });
        return;
      }

      const tabId = networkRecordingState.tabId;
      const requests = [...networkRecordingState.requests];
      const requestCount = requests.length;

      // 移除事件监听
      if (networkRecordingState.eventHandler) {
        chrome.debugger.onEvent.removeListener(networkRecordingState.eventHandler);
      }

      // 重置状态
      networkRecordingState.active = false;
      networkRecordingState.tabId = null;
      networkRecordingState.requests = [];
      networkRecordingState.startTime = null;
      networkRecordingState.eventHandler = null;

      chrome.debugger.detach({ tabId }, () => {
        if (chrome.runtime.lastError) {
          console.warn('[Background] 分离调试器失败:', chrome.runtime.lastError.message);
        }

        resolve({
          success: true,
          action: 'stop',
          requests,
          requestCount,
          tool_call_id: toolCallId
        });
      });
      return;
    }

    resolve({
      success: false,
      error: `未知操作: ${action}，支持 start/stop/status`,
      action,
      tool_call_id: toolCallId
    });
  });
}

// background/tool-preselector.js - 工具预筛选：通过前置规划调用减少工具传递

/**
 * 截断过长内容
 */
function truncateContent(content, maxLen = 2000) {
  const str = typeof content === 'string' ? content : JSON.stringify(content);
  return str.length > maxLen ? str.substring(0, maxLen) + '...' : str;
}

/**
 * 从消息列表中提取最后一条用户消息（当前问题）
 */
function extractLastUserQuestion(messages) {
  const userMessages = messages.filter(m => m.role === 'user');
  if (userMessages.length === 0) return '';
  return truncateContent(userMessages[userMessages.length - 1].content);
}

/**
 * 提取最近对话历史（排除 system/tool 消息），用于工具预筛选时提供上下文
 * 最多保留最近 HISTORY_COUNT 条 user+assistant 交替消息
 */
const HISTORY_COUNT = 4;

function extractHistoryContext(messages) {
  // 排除 system、tool 角色，只保留 user 和 assistant
  const dialogMessages = messages.filter(m => m.role === 'user' || m.role === 'assistant');
  if (dialogMessages.length === 0) return [];

  // 最后一条 user 消息是当前问题，不包含在历史中
  const lastUserIdx = dialogMessages.map((m, i) => ({ m, i })).filter(x => x.m.role === 'user').pop()?.i;
  if (lastUserIdx === undefined) return [];

  // 取最后一条 user 消息之前的最近 HISTORY_COUNT 条消息作为历史上下文
  const historyBefore = dialogMessages.slice(0, lastUserIdx);
  const recentHistory = historyBefore.slice(-HISTORY_COUNT);

  // 截断每条历史消息的内容，防止 token 过多
  return recentHistory.map(m => ({
    role: m.role,
    content: truncateContent(m.content, 1000)
  }));
}

/**
 * 构建工具预筛选的系统提示词
 */
function buildPreselectPrompt(tools) {
  const toolList = tools.map(t =>
    `- ${t.function.name}: ${t.function.description}`
  ).join('\n');

  return `你是智能助手。根据用户的问题，判断是否需要使用工具来完成。

规则：
1. 如果问题非常简单，你可以直接回答（如问候、常识问答、简单计算等），请直接给出回答内容。
2. 如果问题需要工具才能完成（如读取文件、搜索代码、执行命令、获取实时信息等），只输出一个 JSON 字符串数组，包含需要的工具名称。

可用工具列表：
${toolList}

输出格式：
- 直接回答时：直接输出回答内容
- 需要工具时：["tool_name_1", "tool_name_2"]`;
}

/**
 * 预筛选工具：通过一次轻量 API 调用让大模型判断需要哪些工具
 *
 * 对于简单问题，模型会直接回答，无需二次调用。
 *
 * @param {Array} messages - 用户消息列表
 * @param {string} model - 模型名称
 * @param {Array} tools - 全量工具列表
 * @param {Object} apiParams - API 参数（temperature 等）
 * @returns {Promise<{type: 'answer', content: string, executionLog: Array}|{type: 'tools', tools: Array, executionLog: Array}>}
 */
async function preselectTools(messages, model, tools, apiParams = {}, callCount = 1) {
  const totalCount = tools.length;
  const preselectId = crypto.randomUUID();
  const now = new Date().toISOString();

  // 基础 entry
  const createEntry = (status, extra = {}) => ({
    id: preselectId,
    iteration: 0,
    timestamp: now,
    nodeType: 'preselect',
    nodeName: `API调用 (第${callCount}次)（🔍工具预筛选）`,
    ...extra,
    status
  });

  // 如果工具很少（<=5个），不需要筛选
  if (totalCount <= 5) {
    console.log('[ToolPreselector] 工具数量 <= 5，跳过预筛选');
    return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'skip', params: { reason: '工具数量少', toolCount: totalCount } }, duration: 1 })] };
  }

  const userQuestion = extractLastUserQuestion(messages);
  if (!userQuestion) {
    console.warn('[ToolPreselector] 无法提取用户问题，使用全量工具');
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: '无法提取用户问题' })] };
  }

  const historyContext = extractHistoryContext(messages);
  const systemPrompt = buildPreselectPrompt(tools);

  console.log(`[ToolPreselector] 开始预筛选，全量工具: ${totalCount} 个，携带历史消息: ${historyContext.length} 条`);

  const startTime = Date.now();

  try {
    const config = await getStoredConfig();
    const apiUrl = `${config.apiBase}/chat/completions`;

    const apiMessages = [
      { role: 'system', content: systemPrompt },
      ...historyContext,
      { role: 'user', content: `用户问题：${userQuestion}` }
    ];

    const requestBody = {
      model: model || config.modelName,
      messages: apiMessages,
      stream: false,
      temperature: 0.1,
      max_tokens: 1024
    };

    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    }, config.reactConfig.apiTimeout, config.reactConfig.apiRetryCount, config.reactConfig.apiRetryBaseDelay);

    const duration = Date.now() - startTime;

    if (!response.ok) {
      console.warn('[ToolPreselector] API 请求失败，使用全量工具');
      return { type: 'tools', tools, executionLog: [createEntry('failed', { error: `API 请求失败: ${response.status}`, duration })] };
    }

    const data = await response.json();
    const content = (data.choices?.[0]?.message?.content || '').trim();

    console.log('[ToolPreselector] 大模型返回:', content);

    // 尝试从返回内容中提取 JSON 数组
    const jsonMatch = content.match(/^\s*\[.*\]\s*$/s);
    if (jsonMatch) {
      // 内容看起来是 JSON 数组，尝试解析为工具列表
      try {
        const selectedNames = JSON.parse(content);

        if (!Array.isArray(selectedNames)) {
          console.warn('[ToolPreselector] 返回的不是数组，当作直接回答');
          return { type: 'answer', content, executionLog: [createEntry('success', { thought: content, duration })] };
        }

        if (selectedNames.length === 0) {
          console.warn('[ToolPreselector] 返回空工具数组，使用全量工具');
          return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: '模型返回空数组' } }, duration })] };
        }

        const selectedTools = tools.filter(t =>
          selectedNames.includes(t.function.name)
        );

        if (selectedTools.length === 0) {
          console.warn('[ToolPreselector] 筛选后工具为空，使用全量工具');
          return { type: 'tools', tools, executionLog: [createEntry('success', { action: { name: 'all_tools', params: { reason: '筛选结果无匹配' } }, duration })] };
        }

        console.log(`[ToolPreselector] 预筛选完成: ${totalCount} → ${selectedTools.length} 个工具`,
          selectedTools.map(t => t.function.name));

        return {
          type: 'tools',
          tools: selectedTools,
          executionLog: [createEntry('success', {
            action: {
              name: 'preselect',
              params: { selected: selectedTools.map(t => t.function.name) }
            },
            apiRequest: { model: requestBody.model, messageCount: apiMessages.length, toolCount: totalCount },
            apiResponse: { toolCountAfter: selectedTools.length },
            duration
          })]
        };
      } catch {
        console.warn('[ToolPreselector] JSON 解析失败，当作直接回答');
        return { type: 'answer', content, executionLog: [createEntry('success', { thought: content, duration })] };
      }
    }

    // 不是 JSON 数组，当作直接回答
    console.log('[ToolPreselector] 模型直接回答，无需二次调用');
    return { type: 'answer', content, executionLog: [createEntry('success', { thought: content, duration })] };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.warn('[ToolPreselector] 预筛选异常，使用全量工具:', error.message);
    return { type: 'tools', tools, executionLog: [createEntry('failed', { error: error.message, duration })] };
  }
}

// background/react-loop.js - ReAct 推理循环与 API 调用

/**
 * 创建带执行日志的错误
 */
function createErrorWithLog(message, executionLog) {
  const error = new Error(message);
  error.executionLog = executionLog;
  return error;
}

/**
 * ReAct 推理循环
 * 注意：澄清工具执行时会暂停整体循环超时计时
 */
async function reactLoop(messages, model, tools, tabId, apiParams = {}, taskContext = null, onLogUpdate = null, globalIteration = { value: 0 }, initialLog = []) {
  let iteration = 0;
  let currentMessages = [...messages];
  
  const executionLog = [...initialLog];
  let currentSubtaskIndex = null;
  let subtaskPlan = null;
  
  // 缓存全量工具列表，用于 plan_task 拆解时临时展开
  let fullToolsCache = null;
  async function getFullTools() {
    if (!fullToolsCache) {
      fullToolsCache = await getTools();
    }
    return fullToolsCache;
  }
  
  resetReactCancel(tabId);
  setCurrentReactTabId(tabId);
  
  const config = await getStoredConfig();
  const reactConfig = config.reactConfig;
  const maxIterations = reactConfig.maxIterations;
  const apiTimeout = reactConfig.apiTimeout;
  const loopTimeout = reactConfig.loopTimeout;
  const toolTimeout = reactConfig.toolTimeout;
  const clarifyTimeout = reactConfig.clarifyTimeout;
  
  console.log('[Background] reactLoop 配置:', reactConfig);
  console.log('[Background] reactLoop 收到工具列表:', tools.map(t => t.function.name), '数量:', tools.length);
  console.log('[Background] reactLoop 任务上下文:', taskContext ? `子任务 ${taskContext.subtaskId || '无'} (${taskContext.subtaskName || '主任务'})` : '无');
  
  /**
   * 发送实时执行状态更新消息
   */
  function sendExecutionStatusUpdate(nodeName, status) {
    try {
      const logSnapshot = [...executionLog];
      
      // 如果有回调函数，通知父任务
      if (typeof onLogUpdate === 'function') {
        onLogUpdate(logSnapshot);
      }
      
      chrome.runtime.sendMessage({
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: nodeName,
        status: status,
        executionLog: logSnapshot
      }).catch(err => {
        console.log('[Background] 发送执行状态更新失败:', err.message);
      });
    } catch (e) {
      console.log('[Background] 发送执行状态更新异常:', e.message);
    }
  }
  
  // 整体循环超时控制 - 使用动态调整机制
  const loopStartTime = Date.now();
  let totalPausedDuration = 0;  // 累计暂停时长（澄清等待时间不计入）
  let pauseStartTime = null;    // 暂停开始时刻
  let isPaused = false;         // 是否处于暂停状态
  
  // 发送初始状态
  sendExecutionStatusUpdate('准备开始执行...', 'processing');
  
  /**
   * 暂停整体循环超时计时（用于澄清工具）
   */
  function pauseLoopTimer() {
    if (!isPaused) {
      pauseStartTime = Date.now();
      isPaused = true;
      console.log('[Background] 整体循环超时已暂停');
    }
  }
  
  /**
   * 计算当前剩余超时时间
   */
  function getRemainingTime() {
    const elapsedTime = Date.now() - loopStartTime;
    return loopTimeout + totalPausedDuration - elapsedTime;
  }
  
  /**
   * 恢复整体循环超时计时
   */
  function resumeLoopTimer() {
    if (isPaused && pauseStartTime !== null) {
      const pauseDuration = Date.now() - pauseStartTime;
      totalPausedDuration += pauseDuration;
      pauseStartTime = null;
      isPaused = false;
      
      console.log('[Background] 整体循环超时已恢复，暂停时长:', Math.round(pauseDuration / 1000), 's，剩余时间:', Math.round(getRemainingTime() / 1000), 's');
    }
  }
  
  try {
    while (iteration < maxIterations) {
      if (isCancelled(tabId)) {
        throw createErrorWithLog('ReAct 循环已被用户取消', executionLog);
      }
      
      // 检查超时（使用动态调整后的超时时间）
      const elapsedTime = Date.now() - loopStartTime;
      const adjustedTimeout = loopTimeout + totalPausedDuration;
      if (elapsedTime > adjustedTimeout) {
        throw createErrorWithLog(`ReAct 循环总超时 (${loopTimeout}ms，不含澄清等待时间)`, executionLog);
      }
      
      iteration++;
      // 递增 API 调用计数器（预筛选已经用了第1次）
      incrementDialogApiCallCount();
      const remainingTime = adjustedTimeout - elapsedTime;
      console.log(`[Background] ReAct 循环第 ${iteration} 次，剩余时间: ${Math.round(remainingTime / 1000)}s (已暂停: ${Math.round(totalPausedDuration / 1000)}s)`);
      
      let response;
      const apiCallStartTime = Date.now();
      
      // 过滤消息中的不必要字段，确保消息格式符合 API 要求
      const filteredMessages = currentMessages.map((msg, index) => {
        // 移除不需要传递给 API 的字段
        const { executionLog, subtaskId, subtaskName, subtaskIndex, ...rest } = msg;
        
        // 对于工具消息，确保只有 role、content 和 tool_call_id
        if (rest.role === 'tool') {
          // 如果没有 tool_call_id，记录警告并跳过这条消息
          if (!rest.tool_call_id) {
            console.warn(`[Background] 发现消息 ${index} 缺少 tool_call_id，已跳过`, msg);
            return null;
          }
          return {
            role: rest.role,
            content: rest.content,
            tool_call_id: rest.tool_call_id
          };
        }
        
        return rest;
      }).filter(msg => msg !== null);
      
      // 添加 API 调用开始的日志节点（状态为 processing）
      const apiLogId = crypto.randomUUID();
      const currentCount = getDialogApiCallCount();
      
      // 如果工具集中包含 plan_task，展开为全量工具，确保任务拆解时模型能感知所有可用工具
      const hasPlanTask = tools.some(t => t.function?.name === 'plan_task');
      const apiTools = hasPlanTask ? await getFullTools() : tools;
      if (hasPlanTask) {
        console.log('[Background] 当前迭代包含 plan_task，使用全量工具进行任务拆解，工具数:', apiTools.length);
      }
      
      executionLog.push({
        id: apiLogId,
        iteration: iteration,
        globalIteration: currentCount,
        timestamp: new Date().toISOString(),
        status: 'processing',
        nodeType: 'api_call',
        nodeName: `API调用 (第${currentCount}次${taskContext ? `, 子任务第${iteration}次` : ''})`,
        apiRequest: {
          messageCount: filteredMessages.length,
          toolCount: apiTools.length
        }
      });
      
      // 发送 API 调用状态
      sendExecutionStatusUpdate(`API调用 (第${currentCount}次${taskContext ? `, 子任务第${iteration}次` : ''})`, 'processing');
      
      try {
        const apiUrl = `${config.apiBase}/chat/completions`;
        console.log('[Background] API 请求工具数量:', apiTools.length);
        
        const requestBody = {
          model: model || config.modelName,
          messages: filteredMessages,
          tools: apiTools,
          stream: false
        };
        
        // 添加 temperature 和 top_p 参数
        if (apiParams.temperature !== undefined) {
          requestBody.temperature = apiParams.temperature;
        }
        if (apiParams.top_p !== undefined) {
          requestBody.top_p = apiParams.top_p;
        }
        
        // 使用带重试和超时的 fetch
        const fetchResponse = await fetchWithRetry(apiUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(requestBody)
        }, apiTimeout, reactConfig.apiRetryCount, reactConfig.apiRetryBaseDelay, (retryAttempt, retryError) => {
          console.warn(`[Background] API 重试 ${retryAttempt} 次后:`, retryError.message);
        });
        
        if (!fetchResponse.ok) {
          const errorText = await fetchResponse.text();
          console.error('[Background] API 响应错误:', fetchResponse.status, errorText);
          throw new Error(`HTTP error! status: ${fetchResponse.status}, message: ${errorText}`);
        }
        
        // 先获取原始文本，再解析 JSON
        const responseText = await fetchResponse.text();
        console.log('[Background] API 响应原始文本长度:', responseText.length, '预览:', responseText.substring(0, 200));
        try {
          response = JSON.parse(responseText);
        } catch (parseError) {
          console.error('[Background] JSON 解析失败:', parseError);
          console.error('[Background] 原始响应:', responseText);
          throw new Error('API 响应不是有效的 JSON: ' + parseError.message);
        }
      } catch (error) {
        console.error('[Background] API 调用失败:', error);
        
        // 更新 API 调用日志状态为失败
        const apiLogIndex = executionLog.findIndex(log => log.id === apiLogId);
        if (apiLogIndex !== -1) {
          executionLog[apiLogIndex] = {
            ...executionLog[apiLogIndex],
            duration: Date.now() - apiCallStartTime,
            status: 'failed',
            apiRequest: {
              ...executionLog[apiLogIndex].apiRequest,
              model: model || config.modelName,
              temperature: apiParams.temperature,
              top_p: apiParams.top_p,
              messageCount: filteredMessages.length,
              toolCount: apiTools.length
            },
            error: error.message
          };
        }
        
        throw createErrorWithLog(error.message);
      }
      
      // 更新成功的 API 调用日志
      const apiCallDuration = Date.now() - apiCallStartTime;
      const assistantMessage = response.choices?.[0]?.message;
      
      const apiLogIndex = executionLog.findIndex(log => log.id === apiLogId);
      if (apiLogIndex !== -1) {
        executionLog[apiLogIndex] = {
          ...executionLog[apiLogIndex],
          duration: apiCallDuration,
          status: 'success',
          thought: assistantMessage?.content || '',
          action: assistantMessage?.tool_calls?.length > 0 ? {
            name: assistantMessage.tool_calls[0].function?.name || assistantMessage.tool_calls[0].name,
            params: JSON.parse(assistantMessage.tool_calls[0].function?.arguments || '{}')
          } : null,
          apiRequest: {
            ...executionLog[apiLogIndex].apiRequest,
            model: model || config.modelName,
            temperature: apiParams.temperature,
            top_p: apiParams.top_p,
            messageCount: filteredMessages.length,
            toolCount: apiTools.length
          },
          apiResponse: {
            finishReason: response.choices?.[0]?.finish_reason,
            tokenUsage: response.usage
          }
        };
      }
      
      // 检查是否有工具调用
      if (assistantMessage?.tool_calls && assistantMessage.tool_calls.length > 0) {
        console.log('[Background] 收到工具调用:', assistantMessage.tool_calls);
        
        currentMessages.push(assistantMessage);
        
        for (const toolCall of assistantMessage.tool_calls) {
          const toolName = toolCall.function?.name || toolCall.name;
          const toolStartTime = Date.now();
          
          // 添加工具执行开始的日志节点（状态为 processing）
          const toolLogId = crypto.randomUUID();
          executionLog.push({
            id: toolLogId,
            iteration: iteration,
            timestamp: new Date().toISOString(),
            status: 'processing',
            nodeType: 'tool_exec',
            nodeName: `执行工具: ${toolName}`
          });
          
          // 发送工具执行状态
          sendExecutionStatusUpdate(`执行工具: ${toolName}`, 'processing');
          
          // 如果是澄清工具，暂停整体循环超时计时
          if (toolName === 'clarify_question') {
            pauseLoopTimer();
            chrome.runtime.sendMessage({
              type: 'CLARIFY_START'
            }).catch(err => {
              console.log('[Background] 发送 CLARIFY_START 消息失败:', err.message);
            });
          }
          
          let toolResult;
          try {
            // 使用带超时的工具执行（澄清工具不设置外层超时）
            toolResult = await executeToolWithTimeout(toolCall, tabId, toolTimeout, loopTimeout, clarifyTimeout);
            
            // 如果是澄清工具，恢复整体循环超时计时
            if (toolName === 'clarify_question') {
              resumeLoopTimer();
              chrome.runtime.sendMessage({
                type: 'CLARIFY_END'
              }).catch(err => {
                console.log('[Background] 发送 CLARIFY_END 消息失败:', err.message);
              });
              
              // 澄清后重新预筛选工具：用户补充了新信息，工具集需要同步更新
              console.log('[Background] 澄清完成，重新预筛选工具...');
              try {
                const fullTools = await getTools();
                if (fullTools.length > 5) {
                  const rePreselectCount = incrementDialogApiCallCount();
                  const reSelection = await preselectTools(currentMessages, model, fullTools, apiParams, rePreselectCount);
                  if (reSelection.type === 'tools') {
                    tools = reSelection.tools;
                    console.log('[Background] 澄清后工具重新筛选完成:', tools.map(t => t.function.name));
                  }
                  // 合并重新筛选的执行日志
                  if (reSelection.executionLog) {
                    executionLog.push(...reSelection.executionLog);
                  }
                }
              } catch (rePreselectErr) {
                console.warn('[Background] 澄清后工具重新筛选失败，继续使用当前工具集:', rePreselectErr.message);
              }
            }
            
            // 确保 toolResult 是字符串格式
            const toolResultStr = typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult);
            
            // 处理任务规划工具的结果，提取子任务列表
            if (toolName === 'plan_task' && toolResult && toolResult.success && toolResult.data) {
              subtaskPlan = toolResult.data;
              console.log('[Background] 收到任务规划结果:', JSON.stringify(subtaskPlan));
              
              // 先添加 plan_task 工具的响应消息（必须先响应工具调用）
              currentMessages.push({
                role: 'tool',
                content: JSON.stringify({
                  success: true,
                  message: `任务规划完成，已拆解为 ${subtaskPlan.subtasks.length} 个子任务`,
                  data: subtaskPlan
                }),
                tool_call_id: toolCall.id
              });
              
              // 更新工具执行日志
              const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
              if (toolLogIndex !== -1) {
                executionLog[toolLogIndex] = {
                  ...executionLog[toolLogIndex],
                  duration: Date.now() - toolStartTime,
                  status: 'success',
                  nodeName: `任务规划完成`,
                  action: {
                    name: toolName,
                    params: JSON.parse(toolCall.function?.arguments || '{}')
                  },
                  observation: `已拆解为 ${subtaskPlan.subtasks.length} 个子任务`,
                  subtaskCount: subtaskPlan.subtasks.length,
                  strategy: subtaskPlan.strategy
                };
              }
              
              // 发送任务规划完成状态更新（让实时日志显示plan_task节点）
              sendExecutionStatusUpdate('任务规划完成', 'success');
              
              // 开始执行子任务
              const subtaskResults = await executeSubtasks(subtaskPlan, model, tabId, apiParams, executionLog, globalIteration);
              
              // 将所有子任务结果添加到消息历史（作为系统消息，而非工具消息）
              const subtaskSummary = subtaskResults.map((result, idx) => 
                `子任务 ${idx + 1}: ${result.subtaskName}\n结果: ${result.result}`
              ).join('\n\n');
              
              currentMessages.push({
                role: 'system',
                content: `以下是拆解后子任务的执行结果，请进行总结：\n\n${subtaskSummary}`
              });
              
              // 继续下一轮循环，让模型总结子任务结果
              continue;
            }
            
            currentMessages.push({
              role: 'tool',
              content: toolResultStr,
              tool_call_id: toolCall.id,
              subtaskId: currentSubtaskIndex !== null ? `subtask_${currentSubtaskIndex}` : null,
              subtaskName: subtaskPlan?.subtasks[currentSubtaskIndex]?.name || null
            });
            
            console.log('[Background] 工具执行结果长度:', toolResultStr.length, '内容预览:', toolResultStr.substring(0, 200));
            
            // 检查工具执行是否成功
            const isSuccess = toolResult && toolResult.success !== false;
            
            // 更新工具执行日志
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              executionLog[toolLogIndex] = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: isSuccess ? 'success' : 'failed',
                nodeName: `工具执行:${toolName}`,
                action: {
                  name: toolName,
                  params: JSON.parse(toolCall.function?.arguments || '{}')
                },
                observation: toolResultStr.length > 500 ? toolResultStr.substring(0, 500) + '...' : toolResultStr
              };
            }
            
          } catch (toolError) {
            console.error('[Background] 工具执行失败:', toolError);
            
            // 如果是澄清工具，恢复整体循环超时计时
            if (toolName === 'clarify_question') {
              resumeLoopTimer();
              chrome.runtime.sendMessage({
                type: 'CLARIFY_END'
              }).catch(err => {
                console.log('[Background] 发送 CLARIFY_END 消息失败:', err.message);
              });
            }
            
            // 更新工具执行日志为失败
            const toolLogIndex = executionLog.findIndex(log => log.id === toolLogId);
            if (toolLogIndex !== -1) {
              executionLog[toolLogIndex] = {
                ...executionLog[toolLogIndex],
                duration: Date.now() - toolStartTime,
                status: 'failed',
                nodeName: `工具执行:${toolName}`,
                action: {
                  name: toolName,
                  params: JSON.parse(toolCall.function?.arguments || '{}')
                },
                error: toolError.message
              };
            }
            
            throw createErrorWithLog(toolError.message);
          }
        }
        
        continue;
      }
      
      const content = assistantMessage?.content || '';
      console.log('[Background] ReAct 循环完成，最终内容长度:', content.length);
      
      // 发送完成状态
      sendExecutionStatusUpdate('执行完成', 'success');
      
      // 返回执行日志和内容
      return { content, executionLog };
    }
    
    const error = new Error(`ReAct 循环超过最大迭代次数 (${maxIterations})`);
    error.executionLog = executionLog;
    throw error;
  } catch (error) {
    // 重新抛出错误，保持错误处理流程
    throw error;
  }
}

/**
 * 执行子任务序列
 * 支持顺序执行、并行执行和条件执行策略
 */
async function executeSubtasks(subtaskPlan, model, tabId, apiParams, parentExecutionLog, globalIteration = { value: 0 }) {
  const { subtasks = [], strategy = 'sequential', taskDescription } = subtaskPlan;
  const results = [];
  
  console.log('[Background] 开始执行子任务，策略:', strategy, '数量:', subtasks.length);
  
  // 按依赖关系排序（拓扑排序）
  const sortedSubtasks = sortSubtasksByDependencies(subtasks);
  
  // 筛选每个子任务需要的工具
  const toolSets = await prepareToolSetsForSubtasks(sortedSubtasks);
  
  if (strategy === 'sequential') {
    // 顺序执行
    for (let i = 0; i < sortedSubtasks.length; i++) {
      const subtask = sortedSubtasks[i];
      const subtaskTools = toolSets[subtask.id] || [];
      
      console.log(`[Background] 执行子任务 ${i + 1}/${sortedSubtasks.length}: ${subtask.name}`);
      
      // 添加子任务开始日志
      const subtaskLogId = crypto.randomUUID();
      parentExecutionLog.push({
        id: subtaskLogId,
        iteration: 0,
        timestamp: new Date().toISOString(),
        status: 'processing',
        nodeType: 'subtask',
        nodeName: `子任务 ${i + 1}: ${subtask.name}`,
        subtaskId: subtask.id,
        subtaskName: subtask.name,
        subtaskIndex: i
      });
      
      // 发送子任务开始状态
      chrome.runtime.sendMessage({
        type: 'EXECUTION_STATUS_UPDATE',
        nodeName: `子任务 ${i + 1}: ${subtask.name}`,
        status: 'processing',
        executionLog: [...parentExecutionLog]
      }).catch(err => {});
      
      try {
        // 为子任务创建独立的消息上下文
        const subtaskMessages = [
          {
            role: 'system',
            content: `你正在执行一个子任务。请专注完成此任务，不要询问用户。\n\n任务背景：${taskDescription}\n\n当前子任务：${subtask.description}\n\n可用工具：${subtaskTools.map(t => t.function.name).join(', ')}`
          },
          {
            role: 'user',
            content: subtask.description
          }
        ];
        
        // 调用子任务的ReAct循环
        const subtaskResult = await reactLoop(
          subtaskMessages, 
          model, 
          subtaskTools, 
          tabId, 
          apiParams,
          { subtaskId: subtask.id, subtaskName: subtask.name },
          (subtaskLog) => {
            // 实时回调：将子任务日志合并到父日志并发送更新
            const mergedLog = [...parentExecutionLog];
            subtaskLog.forEach(childLog => {
              mergedLog.push({
                ...childLog,
                subtaskId: subtask.id,
                subtaskName: subtask.name,
                subtaskIndex: i
              });
            });
            
            chrome.runtime.sendMessage({
              type: 'EXECUTION_STATUS_UPDATE',
              nodeName: `子任务 ${i + 1}: ${subtask.name}`,
              status: 'processing',
              executionLog: mergedLog
            }).catch(err => {});
          },
          globalIteration
        );
        
        // 将子任务内部的执行日志合并到父执行日志中
        if (subtaskResult.executionLog && subtaskResult.executionLog.length > 0) {
          subtaskResult.executionLog.forEach(childLog => {
            parentExecutionLog.push({
              ...childLog,
              subtaskId: subtask.id,
              subtaskName: subtask.name,
              subtaskIndex: i
            });
          });
        }
        
        // 更新子任务日志为成功
        const logIndex = parentExecutionLog.findIndex(log => log.id === subtaskLogId);
        if (logIndex !== -1) {
          parentExecutionLog[logIndex] = {
            ...parentExecutionLog[logIndex],
            status: 'success',
            duration: Date.now() - new Date(parentExecutionLog[logIndex].timestamp).getTime(),
            result: subtaskResult.content.substring(0, 200) + (subtaskResult.content.length > 200 ? '...' : '')
          };
        }
        
        // 发送子任务完成状态（包含完整的执行日志）
        chrome.runtime.sendMessage({
          type: 'EXECUTION_STATUS_UPDATE',
          nodeName: `子任务 ${i + 1}: ${subtask.name} (完成)`,
          status: 'success',
          executionLog: [...parentExecutionLog]
        }).catch(err => {});
        
        results.push({
          subtaskId: subtask.id,
          subtaskName: subtask.name,
          result: subtaskResult.content,
          executionLog: subtaskResult.executionLog || [],
          success: true
        });
        
      } catch (error) {
        // 将子任务内部的执行日志合并到父执行日志中（即使失败也要记录）
        if (error.executionLog && error.executionLog.length > 0) {
          error.executionLog.forEach(childLog => {
            parentExecutionLog.push({
              ...childLog,
              subtaskId: subtask.id,
              subtaskName: subtask.name,
              subtaskIndex: i
            });
          });
        }
        
        // 更新子任务日志为失败
        const logIndex = parentExecutionLog.findIndex(log => log.id === subtaskLogId);
        if (logIndex !== -1) {
          parentExecutionLog[logIndex] = {
            ...parentExecutionLog[logIndex],
            status: 'failed',
            duration: Date.now() - new Date(parentExecutionLog[logIndex].timestamp).getTime(),
            error: error.message
          };
        }
        
        // 发送子任务失败状态（包含完整的执行日志）
        chrome.runtime.sendMessage({
          type: 'EXECUTION_STATUS_UPDATE',
          nodeName: `子任务 ${i + 1}: ${subtask.name} (失败)`,
          status: 'failed',
          executionLog: [...parentExecutionLog]
        }).catch(err => {});
        
        results.push({
          subtaskId: subtask.id,
          subtaskName: subtask.name,
          result: error.message,
          executionLog: error.executionLog || [],
          success: false
        });
        
        // 如果是顺序执行，遇到失败可以选择继续或停止
        // 这里选择继续执行剩余子任务
      }
    }
  } else {
    // 并行执行或其他策略暂未实现，降级为顺序执行
    console.warn('[Background] 并行/条件执行策略暂未实现，降级为顺序执行');
    return executeSubtasks({ ...subtaskPlan, strategy: 'sequential' }, model, tabId, apiParams, parentExecutionLog, globalIteration);
  }
  
  return results;
}

/**
 * 按依赖关系对任务进行拓扑排序
 */
function sortSubtasksByDependencies(subtasks) {
  const sorted = [];
  const visited = new Set();
  const tempMark = new Set();
  
  function visit(node) {
    if (tempMark.has(node.id)) {
      throw new Error('检测到子任务依赖循环');
    }
    if (!visited.has(node.id)) {
      tempMark.add(node.id);
      const dependencies = node.dependencies || [];
      dependencies.forEach(depId => {
        const depNode = subtasks.find(s => s.id === depId);
        if (depNode) {
          visit(depNode);
        }
      });
      tempMark.delete(node.id);
      visited.add(node.id);
      sorted.push(node);
    }
  }
  
  subtasks.forEach(subtask => {
    if (!visited.has(subtask.id)) {
      visit(subtask);
    }
  });
  
  return sorted;
}

/**
 * 为每个子任务准备工具集
 */
async function prepareToolSetsForSubtasks(subtasks) {
  const allTools = await getTools();
  const toolSets = {};
  const allToolNames = allTools.map(t => t.function.name);
  const allToolIds = allTools.map(t => t.id);
  
  subtasks.forEach(subtask => {
    const requiredToolNames = subtask.requiredTools || [];
    if (requiredToolNames.length > 0) {
      // 只选择子任务需要的工具（按工具名称或ID匹配，忽略大小写）
      toolSets[subtask.id] = allTools.filter(tool => {
        const toolName = tool.function.name.toLowerCase();
        const toolId = tool.id.toLowerCase();
        return requiredToolNames.some(req => {
          const reqLower = req.toLowerCase();
          return toolName === reqLower || toolId === reqLower;
        });
      });
      
      // 检查是否有工具未匹配到
      const unmatchedTools = requiredToolNames.filter(req => {
        const reqLower = req.toLowerCase();
        return !allToolNames.some(name => name.toLowerCase() === reqLower) &&
               !allToolIds.some(id => id.toLowerCase() === reqLower);
      });
      
      if (unmatchedTools.length > 0) {
        console.warn(`[Background] 子任务 ${subtask.name} 指定的工具不存在: ${unmatchedTools.join(', ')}`);
      }
      
      console.log(`[Background] 子任务 ${subtask.name} 需要工具: ${requiredToolNames.join(', ')}, 匹配到 ${toolSets[subtask.id].length} 个`);
    } else {
      // 如果没有指定工具，使用空工具集（强制 LLM 明确指定工具）
      toolSets[subtask.id] = [];
      console.warn(`[Background] 子任务 ${subtask.name} 未指定所需工具，将使用空工具集`);
    }
  });
  
  return toolSets;
}

/**
 * 带超时控制的工具执行
 * 注意：clarify_question 工具已在外层暂停整体循环超时，此处不设置额外超时
 */
async function executeToolWithTimeout(toolCall, tabId, timeoutMs, loopTimeoutMs, clarifyTimeoutMs) {
  const toolName = toolCall.function?.name || toolCall.name;
  
  // clarify_question 工具：
  // 1. 整体循环超时已在 reactLoop 中暂停
  // 2. 内部有独立的澄清超时控制
  // 3. 此处不设置外层超时，直接执行
  if (toolName === 'clarify_question') {
    console.log(`[Background] 澄清工具直接执行，无外层超时（整体循环超时已暂停）`);
    return executeTool(toolCall, tabId);
  }
  
  // 其他工具使用正常超时
  console.log(`[Background] 工具 ${toolName} 使用超时: ${timeoutMs}ms`);
  
  return new Promise(async (resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error(`工具执行超时 (${timeoutMs}ms): ${toolName}`));
    }, timeoutMs);
    
    try {
      const result = await executeTool(toolCall, tabId);
      clearTimeout(timeoutId);
      resolve(result);
    } catch (error) {
      clearTimeout(timeoutId);
      reject(error);
    }
  });
}

/**
 * 调用 OpenAI 兼容 API（非流式，简单模式）
 */
function callApiNonStream(messages, model, apiParams = {}) {
  return getStoredConfig().then(config => {
    const apiUrl = `${config.apiBase}/chat/completions`;

    console.log('[Background] 发送非流式 API 请求到:', apiUrl);

    // 过滤消息中的 executionLog 字段，不传递给大模型
    const filteredMessages = messages.map(msg => {
      const { executionLog, ...rest } = msg;
      return rest;
    });

    const requestBody = {
      model: model || config.modelName,
      messages: filteredMessages,
      stream: false
    };

    // 添加 temperature 和 top_p 参数
    if (apiParams.temperature !== undefined) {
      requestBody.temperature = apiParams.temperature;
    }
    if (apiParams.top_p !== undefined) {
      requestBody.top_p = apiParams.top_p;
    }

    return fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(requestBody)
    });
  })
  .then(async response => {
    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP error! status: ${response.status}, message: ${errorText}`);
    }
    const rawText = await response.text();
    try {
      return JSON.parse(rawText);
    } catch (parseErr) {
      console.error('[Background] JSON 解析失败，原始响应:', rawText.substring(0, 500));
      throw new Error(`JSON 解析失败: ${parseErr.message}`);
    }
  })
  .then(data => {
    console.log('[Background] API 响应:', JSON.stringify(data).substring(0, 200));
    const content = data.choices?.[0]?.message?.content || '';
    return content;
  })
  .catch(error => {
    console.error('[Background] API 调用失败:', error);
    throw error;
  });
}

// background/index.js - Service Worker 入口文件

// ==================== Side Panel 路由配置 ====================

/**
 * Side Panel 路由配置
 * Chrome 114+ 使用 side_panel.open() API
 */
chrome.sidePanel?.setPanelBehavior?.({ openPanelOnActionClick: true });

// 监听标签页变化，确保 Side Panel 可以正确打开
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url?.startsWith('http')) {
    chrome.sidePanel?.setOptions?.({
      enabled: true
    });
  }
});

// ==================== 消息监听 ====================

// 监听来自 popup/side_panel 的消息
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'CANCEL_REACT') {
    const { tabId } = message;
    cancelReactLoop(tabId);
    return false;
  }
  
  if (message.type === 'CALL_API') {
    const { messages, model, useTools, tabId, apiParams } = message;
    
    // 重置当前对话的 API 调用计数器
    resetDialogApiCallCount();
    
    console.log('[Background] 收到 CALL_API 消息，useTools:', useTools, 'tabId:', tabId, 'apiParams:', apiParams);
    
    const apiCall = useTools 
      ? (async () => {
          const tools = await getTools();

          // 工具开关打开但实际没有可用工具，跳过预筛选，直接普通对话
          if (tools.length === 0) {
            console.log('[Background] 没有可用工具，跳过预筛选，直接普通对话');
            return callApiNonStream(messages, model, apiParams);
          }

          console.log('[Background] 获取到工具列表，数量:', tools.length, '工具:', tools.map(t => t.function.name));

          // 预筛选工具：通过前置规划调用减少不必要的工具传递
          // 先递增计数器，让预筛选也能显示正确的调用次数
          const preselectCount = incrementDialogApiCallCount();
          const preselection = await preselectTools(messages, model, tools, apiParams, preselectCount);

          // 发送预筛选完成状态，让实时日志面板也能看到这个步骤
          const currentCount = preselectCount;
          const statusUpdate = {
            type: 'EXECUTION_STATUS_UPDATE',
            nodeName: `API调用 (第${currentCount}次)（🔍工具预筛选）`,
            status: 'success',
            executionLog: preselection.executionLog
          };
          console.log('[Background] 发送预筛选状态更新:', statusUpdate);
          chrome.runtime.sendMessage(statusUpdate).then(() => {
            console.log('[Background] 预筛选状态更新发送成功');
          }).catch(err => {
            console.error('[Background] 预筛选状态更新发送失败:', err);
          });

          // 模型直接回答了，无需再调主力模型
          if (preselection.type === 'answer') {
            console.log('[Background] 预筛选模型直接回答，跳过主力模型调用');
            return { content: preselection.content, executionLog: preselection.executionLog };
          }

          const { tools: selectedTools, executionLog: preselectLog } = preselection;
          console.log('[Background] 预筛选后工具数量:', selectedTools.length, '工具:', selectedTools.map(t => t.function.name));

          const reactResult = await reactLoop(messages, model, selectedTools, tabId, apiParams, null, null, { value: 1 }, preselectLog);
          return {
            content: reactResult.content !== undefined ? reactResult.content : reactResult,
            executionLog: reactResult.executionLog || preselectLog
          };
        })()
      : callApiNonStream(messages, model, apiParams);
    
    apiCall
      .then(result => {
        // 兼容两种返回格式：{ content, executionLog } 或直接返回 content
        const content = result.content !== undefined ? result.content : result;
        const executionLog = result.executionLog || [];
        
        console.log('[Background] API 调用完成，内容长度:', content.length, '执行日志条目数:', executionLog.length);
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          content: content,
          executionLog: executionLog
        }).catch(err => {
          console.warn('[Background] 发送回传消息失败:', err);
        });
      })
      .catch(error => {
        console.error('[Background] API 调用失败:', error);
        // 获取 executionLog（如果可用）
        const executionLog = error.executionLog || [];
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          error: error.message || 'API 调用失败',
          executionLog: executionLog
        }).catch(err => {
          console.warn('[Background] 发送错误消息失败:', err);
        });
      });
    
    return false;
  }
  
  if (message.type === 'GET_SESSION') {
    getStoredConfig().then((config) => {
      sendResponse({
        modelName: config.modelName
      });
    });
    return true;
  }
  
  if (message.type === 'GET_CHAT_CONFIG') {
    getChatConfig().then((config) => {
      sendResponse(config);
    });
    return true;
  }
  
  // 打开配置页面
  if (message.type === 'OPEN_OPTIONS_PAGE') {
    const targetHash = message.hash || '';
    chrome.runtime.openOptionsPage(() => {
      if (targetHash) {
        // 找到 options 页面并设置 hash
        chrome.tabs.query({ url: chrome.runtime.getURL('options.html') + '*' }, (tabs) => {
          if (tabs.length > 0) {
            chrome.tabs.update(tabs[0].id, { url: chrome.runtime.getURL('options.html') + '#' + targetHash });
          }
        });
      }
    });
    return false;
  }
  // 选中文本工具栏操作
  if (message.type === 'SELECTION_TOOLBAR_ACTION') {
    const { prompt, action, text, systemPrompt } = message;
    const tabId = sender.tab?.id;
    
    console.log('[Background] 收到选中文本工具栏操作:', action, 'tabId:', tabId);
    
    // AI搜索：打开侧边栏，在侧边栏中发起搜索
    if (action === 'ai-search') {
      // 在消息处理器中直接调用 sidePanel.open（必须在任何 await 之前，保留用户手势上下文）
      if (tabId) {
        chrome.sidePanel.open({ tabId }).catch(err => {
          console.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
        });
      }
      handleSelectionSearch(prompt, text);
      return false;
    }
    
    // 其他操作（解释、翻译、总结、自定义工具）：直接调用 API
    const systemPrompts = {
      'explain': '你是一个知识解释助手。用1-3句话简洁解释用户选中的内容，必要时补充一个简短示例。不要展开长篇论述，不要询问用户是否需要更多信息。',
      'translate': '你是一个翻译助手。自动检测输入语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加任何解释、说明或额外文字。',
      'summary': '你是一个信息提炼助手。用3-5个要点总结用户选中的内容，每条要点一句话，提炼核心信息即可。'
    };
    
    // 自定义工具使用传入的 systemPrompt，内置工具使用默认的
    const systemContent = systemPrompt || systemPrompts[action] || '你是一个有帮助的AI助手，请用简洁的语言回答用户的问题。';
    
    const messages = [
      { role: 'system', content: systemContent },
      { role: 'user', content: prompt }
    ];
    
    resetDialogApiCallCount();
    
    getStoredConfig().then(async (config) => {
      try {
        const result = await callApiNonStream(messages, config.modelName, {});
        const content = result.content !== undefined ? result.content : result;
        const executionLog = result.executionLog || [];
        
        console.log('[Background] 选中文本工具栏 API 完成，内容长度:', content.length);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            content: content
          }).catch(() => {
            console.warn('[Background] 发送 SELECTION_TOOLBAR_RESULT 到 tab 失败');
          });
        }
        
        chrome.runtime.sendMessage({
          type: 'API_COMPLETE',
          content: content,
          executionLog: executionLog
        }).catch(() => {
          console.warn('[Background] 发送 API_COMPLETE 失败（可能 Side Panel 未打开）');
        });
      } catch (error) {
        console.error('[Background] 选中文本工具栏 API 失败:', error);
        
        if (tabId) {
          chrome.tabs.sendMessage(tabId, {
            type: 'SELECTION_TOOLBAR_RESULT',
            error: error.message || 'API 调用失败'
          }).catch(() => {});
        }
        
        chrome.runtime.sendMessage({
          type: 'API_ERROR',
          error: error.message || 'API 调用失败'
        }).catch(() => {});
      }
    });
    
    return false;
  }
  
  // 选中文本工具栏追问：填充侧边栏输入框
  if (message.type === 'FILL_SIDEPANEL_INPUT') {
    const tabId = sender.tab?.id;
    const text = message.text;
    console.log('[Background] 收到追问填充请求:', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        console.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
      });
    }
    
    // 存储待填充的文本到 session storage（防止侧边栏未打开时丢失）
    chrome.storage.session.set({
      pendingFillInput: {
        text: text,
        timestamp: Date.now()
      }
    }).catch(() => {});
    
    // 发送消息给 Side Panel
    chrome.runtime.sendMessage({
      type: 'FILL_SIDEPANEL_INPUT',
      text: text
    }).catch(() => {
      console.log('[Background] Side Panel 未打开，填充内容已存储，等待 Side Panel 加载');
    });
    
    return false;
  }
  
  // 页面导出 PDF（通过 CDP Page.printToPDF）
  if (message.type === 'GENERATE_PDF') {
    const tabId = sender.tab?.id;
    if (!tabId) {
      sendResponse({ success: false, error: '无法获取标签页 ID' });
      return false;
    }

    handleGeneratePdf(tabId, message.options)
      .then(result => sendResponse(result))
      .catch(error => sendResponse({ success: false, error: error.message }));

    return true; // 异步响应
  }

  // 选中文本工具栏追问：直接发送到侧边栏
  if (message.type === 'DIRECT_SEND') {
    const tabId = sender.tab?.id;
    const text = message.text;
    const selectedText = message.selectedText || '';
    console.log('[Background] 收到直接发送请求:', text?.substring(0, 50));
    
    // 打开侧边栏
    if (tabId) {
      chrome.sidePanel.open({ tabId }).catch(err => {
        console.warn('[Background] 打开 Side Panel 失败:', err?.message || err);
      });
    }
    
    // 存储待发送的文本到 session storage（防止侧边栏未打开时丢失）
    chrome.storage.session.set({
      pendingDirectSend: {
        text: text,
        selectedText: selectedText,
        timestamp: Date.now()
      }
    }).catch(() => {});
    
    // 发送消息给 Side Panel
    chrome.runtime.sendMessage({
      type: 'DIRECT_SEND',
      text: text,
      selectedText: selectedText
    }).catch(() => {
      console.log('[Background] Side Panel 未打开，发送内容已存储，等待 Side Panel 加载');
    });
    
    return false;
  }
});

// 处理选中文本的 AI 搜索：存储搜索结果并通知 Side Panel
async function handleSelectionSearch(prompt, selectedText, tabId) {
  console.log('[Background] 处理选中文本 AI 搜索:', prompt.substring(0, 50) + '...');
  
  // 存储待处理的搜索内容到 session storage
  await chrome.storage.session.set({
    pendingSelectionSearch: {
      prompt: prompt,
      selectedText: selectedText,
      timestamp: Date.now()
    }
  });
  
  // 发送消息给 Side Panel（Side Panel 已由 content script 在有用户手势时打开）
  chrome.runtime.sendMessage({
    type: 'SELECTION_AI_SEARCH',
    prompt: prompt,
    selectedText: selectedText
  }).catch(() => {
    console.log('[Background] Side Panel 未打开，搜索内容已存储，等待 Side Panel 加载');
  });
}

/**
 * 通过 CDP Page.printToPDF 生成 PDF
 */
async function handleGeneratePdf(tabId, options) {
  console.log('[Background] 开始生成 PDF, tabId:', tabId, 'options:', JSON.stringify(options));

  // 附加 debugger 到目标标签页
  return new Promise((resolve) => {
    const debuggee = { tabId };

    chrome.debugger.attach(debuggee, '1.3', () => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: `附加 debugger 失败: ${chrome.runtime.lastError.message}` });
        return;
      }

      // 先启用 Page 域
      chrome.debugger.sendCommand(debuggee, 'Page.enable', {}, () => {
        // 忽略 enable 的错误（可能已经启用）

        // 调用 Page.printToPDF
        chrome.debugger.sendCommand(debuggee, 'Page.printToPDF', options, (result) => {
          // 尝试分离 debugger（忽略分离错误）
          chrome.debugger.detach(debuggee, () => {});

          if (chrome.runtime.lastError) {
            resolve({ success: false, error: `PDF 生成失败: ${chrome.runtime.lastError.message}` });
            return;
          }

          if (!result || !result.data) {
            resolve({ success: false, error: 'PDF 生成失败：返回数据为空' });
            return;
          }

          console.log('[Background] PDF 生成成功，数据大小:', result.data.length, '字符');
          resolve({
            success: true,
            data: result.data
          });
        });
      });
    });
  });
}
