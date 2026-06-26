// background/tool-executor.js - 工具定义与执行
import { BUILTIN_TOOLS } from './constants.js';
import { getStoredConfig } from './config.js';
import { searchActiveSessionsMessages, getArchivedSessionsMessages, getActiveSessionId, ensureMigration } from '../storage/db.js';

/**
 * 获取启用的工具列表
 */
export function getTools() {
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

function tryParseToolArgs(argsStr) {
  if (!argsStr || typeof argsStr !== 'string') return null;
  
  const trimmed = argsStr.trim();
  if (!trimmed) return null;
  
  try {
    return JSON.parse(trimmed);
  } catch {
    console.warn('[Background] 工具参数直接解析失败，尝试修复...');
  }
  
  let fixed = trimmed;
  
  fixed = fixed.replace(/,\s*\}/g, '}');
  fixed = fixed.replace(/,\s*\]/g, ']');
  
  fixed = fixed.replace(/"([^"]+)":\s*([a-zA-Z\u4e00-\u9fa5][a-zA-Z0-9\u4e00-\u9fa5_]*)/g, '"$1": "$2"');
  
  fixed = fixed.replace(/:\s*(\{[\s\S]*\})/g, (match, value) => {
    try {
      JSON.parse(value);
      return match;
    } catch {
      return match;
    }
  });
  
  try {
    const result = JSON.parse(fixed);
    console.log('[Background] 工具参数修复解析成功:', result);
    return result;
  } catch (e) {
    console.error('[Background] 工具参数修复解析也失败:', e);
    return null;
  }
}

/**
 * 执行工具调用
 */
export async function executeTool(toolCall, tabId, sessionId = null) {
  const { name, arguments: argsStr, id, function: functionObj, index } = toolCall;
  
  // 兼容不同的工具调用格式
  let toolName = name || (functionObj && functionObj.name);
  let toolCallId = id;
  let args = {};
  
  console.log('[Background] 工具调用原始数据:', JSON.stringify(toolCall));
  
  // 解析参数
  if (functionObj && functionObj.arguments) {
    try {
      const parsed = tryParseToolArgs(functionObj.arguments);
      args = parsed || {};
    } catch (e) {
      console.error('[Background] 解析工具参数失败:', e, '原始值:', functionObj.arguments);
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
  } else if (typeof argsStr === 'object') {
    args = argsStr || {};
  } else if (typeof argsStr === 'string') {
    try {
      const parsed = tryParseToolArgs(argsStr);
      args = parsed || {};
    } catch (e) {
      console.error('[Background] 解析工具参数失败:', e, '原始值:', argsStr);
      return { success: false, error: '工具参数解析失败', tool_call_id: toolCallId };
    }
  }
  
  console.log('[Background] 执行工具:', toolName, args, 'id:', toolCallId);

  // ==================== 工具路由映射表 ====================
  // Background 直接执行的工具
  const BACKGROUND_HANDLERS = {
    search_bookmarks: (a) => executeSearchBookmarks(a, toolCallId),
    search_history: (a) => executeSearchHistory(a, toolCallId),
    capture_tab_screenshot: (a) => executeCaptureScreenshot(a, toolCallId),
    clarify_question: (a) => executeClarifyQuestion(a, toolCallId, sessionId),
    show_notification: (a) => executeShowNotification(a, toolCallId),
    fetch_url: (a) => executeFetchUrl(a, toolCallId),
    open_tab: (a) => executeOpenTab(a, toolCallId),
    switch_tab: (a) => executeSwitchTab(a, toolCallId),
    close_tab: (a) => executeCloseTab(a, toolCallId),
    get_tabs: (a) => executeGetTabs(a, toolCallId),
    get_browser_info: (a) => executeGetBrowserInfo(a, toolCallId),
    download_file: (a) => executeDownloadFile(a, toolCallId),
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
    record_network: (a) => executeRecordNetwork(a, toolCallId, sessionId),
    search_conversation_memory: (a) => executeSearchConversationMemory(a, toolCallId, sessionId),
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
export function executeSearchBookmarks(args, toolCallId) {
  const query = args.query || '';
  const maxResults = parseInt(args.maxResults, 10) || 10;
  
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
export function executeSearchHistory(args, toolCallId) {
  const query = args.query || '';
  const maxResults = parseInt(args.maxResults, 10) || 10;
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
 * 执行对话记忆搜索
 * 搜索当前会话和/或历史会话中的对话记录
 */
async function executeSearchConversationMemory(args, toolCallId, sessionId = null) {
  const query = (args.query || '').toLowerCase();
  const maxResults = parseInt(args.maxResults, 10) || 5;
  const searchScope = args.searchScope || 'current_session';

  console.log('[Background] 执行对话记忆搜索:', 'query=', JSON.stringify(query), 'maxResults=', maxResults, 'scope=', searchScope, 'sessionId=', sessionId);

  try {
    // 确保从 chrome.storage 迁移完成
    await ensureMigration();

    // 收集所有可搜索的消息
    let allMessages = [];

    // 活跃会话消息：使用传入的 sessionId，避免多会话切换时读到错误会话
    let activeFilter = null;
    if (searchScope !== 'all_sessions') {
      activeFilter = sessionId || await getActiveSessionId();
    }
    const activeMessages = await searchActiveSessionsMessages(activeFilter);
    allMessages = activeMessages.map((m) => ({
      session: m.sessionLabel,
      index: m.index,
      role: m.role,
      content: m.content,
    }));

    // 归档会话消息（仅在 all_sessions 时）
    if (searchScope === 'all_sessions') {
      const archivedMessages = await getArchivedSessionsMessages();
      archivedMessages.forEach((m) => {
        allMessages.push({
          session: m.sessionLabel,
          index: m.index,
          role: m.role,
          content: m.content,
        });
      });
    }

    if (allMessages.length === 0) {
      return '未找到任何对话记录。';
    }

    // 关键词匹配搜索（分词 + 包含匹配）
    const keywords = query.split(/\s+/).filter((k) => k.length > 0);
    const scoredMessages = allMessages.map((msg) => {
      const contentLower = msg.content.toLowerCase();
      let score = 0;

      // 精确匹配整句加分
      if (contentLower.includes(query)) {
        score += 10;
      }

      // 每个关键词匹配加分
      for (const kw of keywords) {
        if (contentLower.includes(kw)) {
          score += 3;
        }
        // 关键词出现次数加权
        const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const count = (contentLower.match(new RegExp(escaped, 'g')) || []).length;
        score += count * 0.5;
      }

      // 标题/引用标记等更相关
      if (contentLower.includes('[引用内容]') || contentLower.includes('[选中内容]')) {
        score += 1;
      }

      return { ...msg, score };
    });

    // 按分数排序，过滤零分
    const relevant = scoredMessages
      .filter((m) => m.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, maxResults);

    if (relevant.length === 0) {
      return `未找到与 "${args.query}" 相关的对话记录。请尝试使用其他关键词搜索。`;
    }

    // 格式化结果
    const resultText =
      `找到 ${relevant.length} 条相关对话记录：\n\n` +
      relevant
        .map((m, i) => {
          const contentPreview =
            m.content.length > 500 ? m.content.substring(0, 500) + '...' : m.content;
          return `### ${i + 1}. [${m.session}] ${m.role === 'user' ? '用户' : '助手'}消息 (相关度: ${m.score.toFixed(1)})\n${contentPreview}`;
        })
        .join('\n\n---\n\n');

    console.log('[Background] 对话记忆搜索成功，返回:', relevant.length, '条结果');
    return resultText;
  } catch (err) {
    console.error('[Background] 对话记忆搜索失败:', err);
    return `搜索对话记录时出错: ${err.message}`;
  }
}

/**
 * 执行标签页截图
 */
export function executeCaptureScreenshot(args, toolCallId) {
  const format = args.format || 'jpeg';
  const quality = args.quality !== undefined ? parseInt(args.quality, 10) : 80;
  
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
export function triggerScreenshotDownload(dataUrl, format) {
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
export async function executeClarifyQuestion(args, toolCallId, sessionId = null) {
  const { question, options, recommendedOption, allowCustomInput = true, allowAdditionalInfo = true } = args;
  
  console.log('[Background] 执行澄清工具:', args, 'toolCallId:', toolCallId, 'sessionId:', sessionId);
  
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
      timeout: clarifyTimeout,  // 传递超时时间给前端显示倒计时
      sessionId  // 携带 sessionId 让前端知道是哪个会话的澄清
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
      sessionId,
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
          toolCallId: toolCallId,
          sessionId
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
export function executeShowNotification(args, toolCallId) {
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
      silent: silent === true || silent === 'true',
      requireInteraction: requireInteraction === true || requireInteraction === 'true'
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
 * @param {string} url
 * @param {Object} options - fetch options（可包含外部 signal）
 * @param {number} timeoutMs
 */
export async function fetchWithTimeout(url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  // 如果有外部 signal，需要同时监听外部取消和超时
  const externalSignal = options?.signal;
  
  try {
    // 组合内部超时 signal 和外部 signal
    let combinedSignal = controller.signal;
    if (externalSignal) {
      combinedSignal = AbortSignal.any([controller.signal, externalSignal]);
    }
    
    const response = await fetch(url, {
      ...options,
      signal: combinedSignal
    });
    clearTimeout(timeoutId);
    return response;
  } catch (error) {
    clearTimeout(timeoutId);
    if (error.name === 'AbortError') {
      // 如果是外部取消导致的，直接抛出原始 AbortError（fetchWithRetry 不会重试）
      if (externalSignal?.aborted) {
        throw error;
      }
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
export async function fetchWithRetry(url, options, timeoutMs, maxRetries = 3, baseDelay = 1000, onRetry = null) {
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

export function executeFetchUrl(args, toolCallId) {
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
export function executeGetBrowserInfo(args, toolCallId) {
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
export function executeDownloadFile(args, toolCallId) {
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
export function executeOpenTab(args, toolCallId) {
  const { url, active: rawActive = true } = args;
  const active = typeof rawActive === 'boolean' ? rawActive : String(rawActive).toLowerCase() === 'true';
  
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
export function executeSwitchTab(args, toolCallId) {
  const { tabId: rawTabId } = args;
  const tabId = parseInt(rawTabId, 10);
  
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
export function executeCloseTab(args, toolCallId) {
  const { tabId: rawTabId } = args;
  const tabId = rawTabId !== undefined ? parseInt(rawTabId, 10) : undefined;
  
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
export function executeGetTabs(args, toolCallId) {
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
export function executeManageCookies(args, toolCallId) {
  return new Promise((resolve) => {
    const { action, name, value, domain, path = '/', secure: rawSecure = false, httpOnly: rawHttpOnly = false, expirationDate: rawExpirationDate } = args;
    const secure = rawSecure === true || rawSecure === 'true';
    const httpOnly = rawHttpOnly === true || rawHttpOnly === 'true';
    const expirationDate = rawExpirationDate !== undefined ? parseFloat(rawExpirationDate) : undefined;
    
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
export function executeScheduleTask(args, toolCallId) {
  return new Promise((resolve) => {
    const { action, name, delayInMinutes: rawDelay, periodInMinutes: rawPeriod, scheduledTime, taskData } = args;
    
    switch (action) {
      case 'create':
        if (!name) {
          resolve({ success: false, error: 'create操作需要提供name参数', tool_call_id: toolCallId });
          return;
        }
        
        const alarmInfo = {};
        
        const periodInMinutes = rawPeriod !== undefined ? parseFloat(rawPeriod) : undefined;
        const delayInMinutes = rawDelay !== undefined ? parseFloat(rawDelay) : undefined;
        
        if (periodInMinutes !== undefined && !isNaN(periodInMinutes)) {
          alarmInfo.periodInMinutes = periodInMinutes;
        }
        if (delayInMinutes !== undefined && !isNaN(delayInMinutes)) {
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
export function executePlanTask(args, toolCallId) {
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

export function evaluateExpression(expr, variables) {
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

export function substituteVariables(obj, variables) {
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
export function executeWorkflow(args, toolCallId) {
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

export async function executeWorkflowSteps(workflow, variables, debug, toolCallId, resolve) {
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
export function executeManageUserScripts(args, toolCallId) {
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
export function executeCompareUrls(args, toolCallId) {
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
export function executeClearPageData(args, toolCallId) {
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
export function executeResizeWindow(args, toolCallId) {
  const { width: rawWidth, height: rawHeight } = args;
  const width = rawWidth !== undefined ? parseInt(rawWidth, 10) : undefined;
  const height = rawHeight !== undefined ? parseInt(rawHeight, 10) : undefined;

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
export function executeNavigateBackForward(args, toolCallId) {
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
export function executeReloadTab(args, toolCallId) {
  const { tabId: rawTabId, bypassCache = false } = args;
  const tabId = rawTabId !== undefined ? parseInt(rawTabId, 10) : undefined;

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
export function executeMuteTab(args, toolCallId) {
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
export function executePinTab(args, toolCallId) {
  const { tabId: rawTabId, pinned } = args;
  const tabId = rawTabId !== undefined ? parseInt(rawTabId, 10) : undefined;

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
export function executeGroupTabs(args, toolCallId) {
  const { tabIds: rawTabIds, title, color } = args;
  const tabIds = Array.isArray(rawTabIds) ? rawTabIds.map(id => parseInt(id, 10)) : rawTabIds;

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
 * 按 sessionId 隔离，支持多会话并行录制
 */
const networkRecordingStateMap = new Map(); // sessionId -> { active, tabId, requests, startTime, eventHandler }

function getRecordingState(sessionId) {
  if (!networkRecordingStateMap.has(sessionId)) {
    networkRecordingStateMap.set(sessionId, {
      active: false,
      tabId: null,
      requests: [],
      startTime: null,
      eventHandler: null
    });
  }
  return networkRecordingStateMap.get(sessionId);
}

function createDebuggerEventHandler(recordingState) {
  return (source, method, params) => {
    if (!recordingState.active) return;

    if (method === 'Network.requestWillBeSent') {
      recordingState.requests.push({
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
      const existing = recordingState.requests.find(r => r.requestId === params.requestId);
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

export function executeRecordNetwork(args, toolCallId, sessionId = null) {
  const { action } = args;
  const effectiveSessionId = sessionId || 'default';
  const recordingState = getRecordingState(effectiveSessionId);

  return new Promise((resolve) => {
    if (action === 'status') {
      resolve({
        success: true,
        action: 'status',
        active: recordingState.active,
        requestCount: recordingState.requests.length,
        startTime: recordingState.startTime,
        tool_call_id: toolCallId
      });
      return;
    }

    if (action === 'start') {
      if (recordingState.active) {
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

          recordingState.active = true;
          recordingState.tabId = tabId;
          recordingState.requests = [];
          recordingState.startTime = Date.now();
          recordingState.eventHandler = createDebuggerEventHandler(recordingState);

          chrome.debugger.onEvent.addListener(recordingState.eventHandler);

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
      if (!recordingState.active) {
        resolve({
          success: false,
          error: '没有正在进行的网络录制',
          action: 'stop',
          tool_call_id: toolCallId
        });
        return;
      }

      const tabId = recordingState.tabId;
      const requests = [...recordingState.requests];
      const requestCount = requests.length;

      // 移除事件监听
      if (recordingState.eventHandler) {
        chrome.debugger.onEvent.removeListener(recordingState.eventHandler);
      }

      // 重置状态
      recordingState.active = false;
      recordingState.tabId = null;
      recordingState.requests = [];
      recordingState.startTime = null;
      recordingState.eventHandler = null;

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

export { stripHtml, calculateDiff };
