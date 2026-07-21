// side_panel/chat-streaming.js - 流式输出相关函数
// 从 chat-manager.js 拆分，包含流式消息创建/更新/完成、工具调用卡片渲染、
// 任务取消清理、流式元素重连等函数。
// 共享状态（_streamingElements / _streamedContentMap / _pendingPreselectLog /
// _thinkingStartTime / _processStartTime / _reasoningContent）由本模块统一持有，
// 通过访问器函数提供给 chat-manager.js 的 callApi 使用。

import state from './state.js';
import { escapeHtml } from './utils.js';
import { formatMessageContent, addCodeCopyButtons, renderMessageMermaid } from './markdown-render.js';
import { ICON_IMAGE_24 } from './icons.js';
import { loadAndShowPrototype } from './ui-prototype.js';
import { copyAssistantMessage, quoteAndAsk } from './chat-copy.js';
import { addBookmark, removeBookmark, isBookmarked } from './bookmark-manager.js';
import { updateBookmarkBtnState } from './bookmark-panel.js';

// Agent 名称缓存（用于 dispatch_sub_agent 工具卡片显示名称而非 ID）
let agentNameCache = new Map(); // agentId -> agentName

/**
 * 刷新 Agent 名称缓存
 */
export async function refreshAgentNames() {
  try {
    const { getAllAgents } = await import('./agent-store.js');
    const agents = await getAllAgents();
    agentNameCache.clear();
    for (const a of agents) {
      agentNameCache.set(a.id, a.name || a.id);
    }
  } catch (e) {
    // 静默失败
  }
}

/**
 * 根据 agentId 获取 agent 名称，找不到则返回 id 本身
 */
function getAgentName(agentId) {
  return agentNameCache.get(agentId) || agentId;
}
import {
  exportAssistantMessageToDocx,
  exportAssistantMessageToPdf,
  exportAssistantMessageToMarkdown,
  exportAssistantMessageToImage,
} from './chat-export.js';
import logger from '../shared/logger.js';

// 从 chat-manager.js 反向导入（依赖注入方向：chat-manager → chat-streaming）
// 注意：ES Module 循环依赖安全，只要不在模块顶层立即调用即可
import {
  extractTextContent,
  deleteMessage,
  bindExecutionLogDelegate,
  bindReflectionBadgeDelegate,
  showCommandTerminateDialog,
} from './chat-manager.js';

// ============================================================
// 流式输出共享状态（由本模块统一持有）
// ============================================================

const _streamingElements = new Map();  // sessionId -> HTMLElement
const _streamedContentMap = new Map();  // sessionId -> accumulated content string
let _pendingPreselectLog = null;  // 缓存的预筛选日志，STREAM_START 时添加到流式元素

let _thinkingStartTime = 0;

let _processStartTime = 0;

let _reasoningContent = '';

// ============================================================
// 状态访问器（供 chat-manager.js 的 callApi 使用，避免直接操作内部变量）
// ============================================================

/**
 * 创建按 sessionId 隔离的流式元素访问器（防止多会话并行时串台）
 * @param {string} sessionId - 会话 ID
 * @returns {(val?: HTMLElement) => HTMLElement|null} val 为 undefined 时返回当前元素，否则设置并返回
 */
export function createStreamingElementAccessor(sessionId) {
  return (val) => {
    if (val === undefined) return _streamingElements.get(sessionId) || null;
    _streamingElements.set(sessionId, val);
    return val;
  };
}

/** 删除指定会话的所有流式状态（callApi 清理时调用） */
export function deleteStreamingState(sessionId) {
  _streamingElements.delete(sessionId);
  _streamedContentMap.delete(sessionId);
}

/** 获取指定会话的累积流式内容（reconnectStreamingElement 内部使用，外部一般通过局部变量） */
export function getStreamedContent(sessionId) {
  return _streamedContentMap.get(sessionId) || '';
}

/** 设置指定会话的累积流式内容 */
export function setStreamedContent(sessionId, content) {
  _streamedContentMap.set(sessionId, content);
}

/** 获取缓存的预筛选日志 */
export function getPendingPreselectLog() {
  return _pendingPreselectLog;
}

/** 设置缓存的预筛选日志 */
export function setPendingPreselectLog(log) {
  _pendingPreselectLog = log;
}

/** 获取思考开始时间戳 */
export function getThinkingStartTime() {
  return _thinkingStartTime;
}

/** 设置思考开始时间戳 */
export function setThinkingStartTime(ts) {
  _thinkingStartTime = ts;
}

/** 获取处理开始时间戳 */
export function getProcessStartTime() {
  return _processStartTime;
}

/** 设置处理开始时间戳 */
export function setProcessStartTime(ts) {
  _processStartTime = ts;
}

/** 获取推理内容 */
export function getReasoningContent() {
  return _reasoningContent;
}

/** 设置推理内容 */
export function setReasoningContent(content) {
  _reasoningContent = content;
}

// ============================================================
// 流式消息创建与更新
// ============================================================

/**
 * 创建流式消息容器（包含思考指示器、停止按钮）
 * @returns {HTMLElement} 流式消息 wrapper
 */
export function addStreamingMessage() {
  const chatContainer = document.getElementById('chatContainer');
  const wrapper = document.createElement('div');
  wrapper.className = 'message-wrapper assistant streaming';
  const messageId = 'msg_' + Date.now().toString(36) + '_' + Math.random().toString(36).substring(2, 8);
  wrapper.dataset.messageId = messageId;
  wrapper.innerHTML = `
    <div class="message-content">
      <div class="stream-content"></div>
      <div class="thinking-indicator">
        <svg class="thinking-icon pulse-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
          <circle cx="8" cy="12" r="1.5"/>
          <circle cx="16" cy="12" r="1.5"/>
        </svg>
        <div class="thinking-dots">
          <span></span><span></span><span></span>
        </div>
        <span class="thinking-label">思考中...</span>
        <button class="streaming-stop-btn" title="停止生成">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </button>
      </div>
      <div class="stream-status hidden"></div>
    </div>
  `;
  chatContainer.appendChild(wrapper);
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });

  // 绑定流式消息内的停止按钮
  const streamingStopBtn = wrapper.querySelector('.streaming-stop-btn');
  if (streamingStopBtn) {
    streamingStopBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      cancelStreamingTask(streamingStopBtn);
    });
  }

  return wrapper;
}

/**
 * 重连流式元素：将旧元素重新插入 DOM，并补充脱落后缺失的文本内容
 * @param {string} sessionId - 会话 ID
 */
export function reconnectStreamingElement(sessionId) {
  const oldEl = _streamingElements.get(sessionId);
  if (!oldEl) {
    // 没有旧元素（极端情况），不处理
    return;
  }

  // 将旧元素重新插入 DOM，它保留了工具调用卡片、思考标记等完整状态
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;

  chatContainer.appendChild(oldEl);

  // 补充脱落后缺失的文本内容（STREAM_CHUNK 在脱落期间跳过了 DOM 更新）
  const accumulated = _streamedContentMap.get(sessionId) || '';
  if (accumulated) {
    updateStreamingMessage(oldEl, accumulated);

    // 关闭当前可见的思考指示器：正常 ReAct 流程中，每次 STREAM_TOOL_CALL 之后
    // 会由 appendToolCallItems 隐藏思考指示器并插入"思考结果"badge。但元素脱落期间
    // 如果错过了工具调用（或当前轮次没有工具调用），思考指示器会残留在可见状态。
    // 这会导致后续 STREAM_START 触发 "已有可见的思考指示器" 警告并跳过创建新指示器。
    // 主动隐藏残留指示器，确保后续迭代能正常创建新的思考指示器。
    // 注意：仅在 accumulated 非空时才执行，避免在内容被 STREAM_START 重置后
    // 创建出"有 badge 但无对应思考内容"的空洞。
    const visibleIndicators = oldEl.querySelectorAll('.thinking-indicator:not(.hidden)');
    visibleIndicators.forEach(indicator => {
      const parent = indicator.parentElement;
      const prevSibling = indicator.previousElementSibling;
      const badge = document.createElement('span');
      badge.className = 'thinking-badge';
      badge.innerHTML = '<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果';
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        parent.insertBefore(badge, prevSibling);
      } else {
        parent.insertBefore(badge, indicator);
      }
      indicator.classList.add('hidden');
    });
  }

  // 滚动到底部
  requestAnimationFrame(() => {
    chatContainer.scrollTop = chatContainer.scrollHeight;
  });
}

/**
 * 更新流式消息内容（增量渲染 Markdown）
 * 流式输出过程中思考指示器保持可见，仅在一轮思考完成后才隐藏并显示思考结果badge
 * 支持多轮 ReAct 迭代：每轮追加独立的思考标记
 */
export function updateStreamingMessage(element, fullContent) {
  const contentDiv = element.querySelector('.stream-content');
  if (!contentDiv) return;
  
  // 查找当前可见的思考指示器（判断是否正在思考中）
  // 优先查找 stream-content 内的指示器，然后查找 message-content 内的
  const visibleThinking = contentDiv.querySelector('.thinking-indicator:not(.hidden)')
    || element.querySelector('.thinking-indicator:not(.hidden)');
  
  if (visibleThinking) {
    // 当前正在思考中：检查是否是第一次收到内容，如果是，将"思考中"改为"输出中"
    const thinkingLabel = visibleThinking.querySelector('.thinking-label');
    if (thinkingLabel && thinkingLabel.textContent === '思考中...') {
      thinkingLabel.textContent = '输出中...';
    }
    
    // 当前正在思考中/输出中
    if (contentDiv.contains(visibleThinking)) {
      // 思考指示器在 stream-content 内：在指示器前面创建/更新 thinking-content
      const prevSibling = visibleThinking.previousElementSibling;
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        prevSibling.innerHTML = formatMessageContent(fullContent);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'thinking-content';
        wrapper.innerHTML = formatMessageContent(fullContent);
        contentDiv.insertBefore(wrapper, visibleThinking);
      }
    } else {
      // 思考指示器在 message-content 中（第一轮迭代）：
      // 如果 stream-content 中没有 thinking-content，创建新的；否则更新最后一个
      // 注意：这里不能简单地更新最后一个，因为可能有多个轮次的思考内容
      const thinkingContents = contentDiv.querySelectorAll('.thinking-content');
      if (thinkingContents.length === 0) {
        // 没有任何思考内容，创建新的
        const wrapper = document.createElement('div');
        wrapper.className = 'thinking-content';
        wrapper.innerHTML = formatMessageContent(fullContent);
        contentDiv.appendChild(wrapper);
      } else {
        // 检查最后一个 thinking-content 是否是当前轮的（前面没有 thinking-badge）
        const lastContent = thinkingContents[thinkingContents.length - 1];
        const nextSibling = lastContent.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('thinking-badge')) {
          // 最后一个 thinking-content 是当前轮的，更新它
          lastContent.innerHTML = formatMessageContent(fullContent);
        } else {
          // 最后一个 thinking-content 已经是上一轮的（后面有 badge），创建新的
          const wrapper = document.createElement('div');
          wrapper.className = 'thinking-content';
          wrapper.innerHTML = formatMessageContent(fullContent);
          contentDiv.appendChild(wrapper);
        }
      }
    }
  } else {
    // 思考已完成（无可见指示器）：在最后一个 thinking-badge 后更新内容
    const badges = contentDiv.querySelectorAll('.thinking-badge');
    if (badges.length > 0) {
      const lastBadge = badges[badges.length - 1];
      let contentAfter = lastBadge.nextElementSibling;
      if (contentAfter && contentAfter.classList.contains('thinking-content')) {
        contentAfter.innerHTML = formatMessageContent(fullContent);
      } else {
        const wrapper = document.createElement('div');
        wrapper.className = 'thinking-content';
        wrapper.innerHTML = formatMessageContent(fullContent);
        lastBadge.after(wrapper);
      }
    } else {
      // 没有 badge，也没有 thinking-indicator，直接创建 thinking-content
      const wrapper = document.createElement('div');
      wrapper.className = 'thinking-content';
      wrapper.innerHTML = formatMessageContent(fullContent);
      contentDiv.appendChild(wrapper);
    }
  }
  
  // 自动滚动（等浏览器完成布局后再滚动，确保 scrollHeight 已更新）
  // 仅当该流式消息属于当前会话时才滚动，防止后台会话串台滚动
  if (element.isConnected) {
    requestAnimationFrame(() => {
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }
}

/**
 * 更新流式消息状态文本（工具调用时）
 */
export function updateStreamingStatus(element, statusText) {
  const statusDiv = element.querySelector('.stream-status');
  if (statusDiv) {
    statusDiv.classList.remove('hidden');
    statusDiv.innerHTML = `<svg class="tool-status-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg> ${statusText}`;
  }
}

/**
 * 追加工具调用卡片到流式消息
 * 一轮思考结束：隐藏思考指示器，添加思考结果badge（在思考内容上面）
 */
export function appendToolCallItems(element, toolCalls) {
  if (!element || !toolCalls?.length) return;
  
  const contentDiv = element.querySelector('.stream-content');
  if (!contentDiv) return;
  
  // 一轮思考结束：隐藏思考指示器，添加思考结果badge（在思考内容上面）
  // 查找所有可见的思考指示器（可能在 message-content 或 stream-content 中）
  const visibleThinking = element.querySelector('.thinking-indicator:not(.hidden)');
  if (visibleThinking) {
    const duration = _thinkingStartTime > 0 ? ((Date.now() - _thinkingStartTime) / 1000).toFixed(1) + 's' : '';
    const badge = document.createElement('span');
    badge.className = 'thinking-badge';
    badge.innerHTML = `<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${duration ? ' <span class="thinking-duration">'+duration+'</span>' : ''}`;
    
    if (contentDiv.contains(visibleThinking)) {
      // 思考指示器在 stream-content 内：找到当前轮的 thinking-content，在它前面插入 badge
      const prevSibling = visibleThinking.previousElementSibling;
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        contentDiv.insertBefore(badge, prevSibling);
      } else {
        contentDiv.insertBefore(badge, visibleThinking);
      }
      visibleThinking.classList.add('hidden');
    } else {
      // 思考指示器在 message-content 中：找到最后一个 thinking-content，在它前面插入 badge
      const thinkingContents = contentDiv.querySelectorAll('.thinking-content');
      if (thinkingContents.length > 0) {
        const lastContent = thinkingContents[thinkingContents.length - 1];
        const nextSibling = lastContent.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('thinking-badge')) {
          contentDiv.insertBefore(badge, lastContent);
        } else {
          contentDiv.appendChild(badge);
        }
      } else {
        contentDiv.appendChild(badge);
      }
      visibleThinking.classList.add('hidden');
      visibleThinking.remove();
    }
  }
  
  // 工具分类配置：{ toolName: { icon, label, summaryFn } }
  const toolMeta = {
    execute_command:       { metaType: 'exec' },
    agent_exec_command:     { metaType: 'exec' },
    execute_agent_exec_command: { metaType: 'exec' },
    agent_read_file:       { metaType: 'file', action: '读取' },
    agent_write_file:      { metaType: 'file', action: '写入' },
    file_upload:           { metaType: 'file', action: '上传' },
    download_file:         { metaType: 'file', action: '下载' },
    fetch_url:             { metaType: 'web', action: '请求' },
    click_element:         { metaType: 'web', action: '点击' },
    fill_form:             { metaType: 'web', action: '填写' },
    open_tab:              { metaType: 'web', action: '打开' },
    search_bookmarks:      { metaType: 'search' },
    search_history:        { metaType: 'search' },
    search_in_page:        { metaType: 'search' },
    dispatch_sub_agent:    { metaType: 'subagent', action: '分派' },
  };
  
  toolCalls.forEach(tc => {
    const toolName = tc.function?.name || 'unknown';
    const meta = toolMeta[toolName] || { metaType: 'other' };
    let args;
    try {
      args = JSON.parse(tc.function?.arguments || '{}');
    } catch {
      args = { raw: tc.function?.arguments || '' };
    }
    
    const formattedArgs = JSON.stringify(args, null, 2);
    
    // 根据工具类型构建摘要行
    let summaryHtml = '';
    let summaryTitle = '';  // 完整内容，用于 title 提示
    if (meta.metaType === 'exec') {
      const cmd = args.command || args.cmd || JSON.stringify(args);
      summaryTitle = cmd;
      summaryHtml = `<code class="tool-call-cmd">$ ${escapeHtml(cmd)}</code>`;
    } else if (meta.metaType === 'file') {
      const path = args.file_path || args.filePath || args.path || args.filename || args.fileName || args.url || '';
      const icon = meta.action === '读取' ? '📖' : meta.action === '写入' ? '📝' : meta.action === '上传' ? '📤' : '📥';
      summaryTitle = path || toolName;
      summaryHtml = `<span class="tool-call-file">${icon} ${escapeHtml(path) || escapeHtml(toolName)}</span>`;
    } else if (meta.metaType === 'web') {
      const url = args.url || args.href || args.selector || '';
      summaryTitle = url || JSON.stringify(args);
      summaryHtml = `<span class="tool-call-web">${escapeHtml(meta.action)}: ${escapeHtml(url) || escapeHtml(JSON.stringify(args).substring(0, 80))}</span>`;
    } else if (meta.metaType === 'search') {
      const query = args.query || args.keyword || args.text || '';
      summaryTitle = query || toolName;
      summaryHtml = `<span class="tool-call-search">🔍 ${escapeHtml(query) || escapeHtml(toolName)}</span>`;
    } else if (meta.metaType === 'subagent') {
      // 子 Agent 分派：优先显示 Agent 名称而非 ID
      const agentId = args.subAgentId || args.agent_id || '';
      const agentName = agentId ? getAgentName(agentId) : '';
      const taskPreview = (args.task || '').substring(0, 80);
      if (agentName && agentName !== agentId) {
        summaryTitle = `${agentName} (${agentId}): ${taskPreview}`;
        summaryHtml = `<span class="tool-call-subagent">🤖 <strong>${escapeHtml(agentName)}</strong> <span class="tool-call-subagent-id">(${escapeHtml(agentId)})</span>: ${escapeHtml(taskPreview)}</span>`;
      } else {
        summaryTitle = `${agentId}: ${taskPreview}`;
        summaryHtml = `<span class="tool-call-subagent">🤖 <strong>${escapeHtml(agentId)}</strong>: ${escapeHtml(taskPreview)}</span>`;
      }
    } else {
      const keys = Object.keys(args);
      if (keys.length === 0) {
        summaryTitle = toolName;
        summaryHtml = `<span>${escapeHtml(toolName)}</span>`;
      } else if (keys.length === 1) {
        const val = JSON.stringify(args[keys[0]]);
        summaryTitle = `${keys[0]}: ${val}`;
        summaryHtml = `<span>${escapeHtml(keys[0])}: ${escapeHtml(val.substring(0, 80))}</span>`;
      } else {
        summaryTitle = keys.map(k => `${k}=${JSON.stringify(args[k])}`).join(', ');
        const preview = keys.slice(0, 2).map(k => `${escapeHtml(k)}=${escapeHtml(JSON.stringify(args[k]).substring(0, 30))}`).join(', ');
        summaryHtml = `<span>${preview}${keys.length > 2 ? ' ...' : ''}</span>`;
      }
    }
    
    // 图标
    const iconSvg = meta.metaType === 'exec'
      ? `<svg class="tool-call-icon exec" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/>
         </svg>`
      : meta.metaType === 'file'
      ? `<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
          <polyline points="14 2 14 8 20 8"/>
         </svg>`
      : `<svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
         </svg>`;
    
    const item = document.createElement('div');
    item.className = 'tool-call-item expanded';
    item.setAttribute('data-tool-call-id', tc.id || '');
    item.setAttribute('data-meta-type', meta.metaType);
    item.setAttribute('data-created-at', Date.now());
    // 命令执行类工具：添加终止按钮
    const isExecCommand = toolName === 'agent_exec_command' || toolName === 'execute_agent_exec_command';
    const terminateBtnHtml = isExecCommand ? `
        <button class="tool-call-terminate-btn" title="终止命令">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
          </svg>
        </button>` : '';
    // 所有非命令执行工具：添加"终止等待"按钮（跳过当前工具等待，不杀进程）
    // 命令执行工具已有独立的终止按钮（弹框两种终止模式），不需要此按钮
    const abortToolBtnHtml = isExecCommand ? '' : `
        <button class="tool-call-abort-btn" title="终止等待（跳过当前工具执行等待，不终止实际进程）">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14">
            <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
          </svg>
        </button>`;
    item.innerHTML = `
      <div class="tool-call-header">
        ${iconSvg}
        <span class="tool-call-name">${escapeHtml(toolName)}</span>
        <div class="tool-call-summary">${summaryHtml}</div>
        <span class="tool-call-executing">执行中...</span>
        ${terminateBtnHtml}
        ${abortToolBtnHtml}
        <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
      </div>
      <div class="tool-call-body">
        ${createCodeBlockHtml(escapeHtml(formattedArgs))}
      </div>
    `;
    
    // 设置摘要的 title 属性（完整内容，通过 JS 直接赋值避免 HTML 转义截断）
    if (summaryTitle) {
      const summaryDiv = item.querySelector('.tool-call-summary');
      if (summaryDiv) summaryDiv.title = summaryTitle;
    }
    
    // 绑定代码块复制按钮
    addCodeCopyButtons();
    
    // 绑定终止按钮事件（仅命令执行工具）
    if (isExecCommand) {
      const terminateBtn = item.querySelector('.tool-call-terminate-btn');
      if (terminateBtn) {
        terminateBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          showCommandTerminateDialog(state.activeSessionId);
        });
      }
    }
    
    // 绑定"终止等待"按钮事件（所有工具）
    const abortBtn = item.querySelector('.tool-call-abort-btn');
    if (abortBtn) {
      abortBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        // 发送终止等待消息到后台，不弹确认框
        chrome.runtime.sendMessage({ type: 'ABORT_CURRENT_TOOL', sessionId: state.activeSessionId });
        // 按钮变为已点击状态
        abortBtn.disabled = true;
        abortBtn.title = '正在终止...';
      });
    }
    
    // 点击展开/折叠
    item.querySelector('.tool-call-header').addEventListener('click', () => {
      item.classList.toggle('expanded');
    });
    
    contentDiv.appendChild(item);
  });
  
  // 滚动到底部（等浏览器完成布局后）
  // 仅当该流式消息属于当前会话时才滚动，防止后台会话串台滚动
  if (element.isConnected) {
    requestAnimationFrame(() => {
      const chatContainer = document.getElementById('chatContainer');
      if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
    });
  }
}

/**
 * 生成带复制按钮的代码块 HTML
 * @param {string} codeContent - 代码内容（已转义）
 * @param {string} extraPreClass - 额外给 <pre> 添加的 CSS 类名（可选）
 * @returns {string} 完整的代码块 HTML
 */
export function createCodeBlockHtml(codeContent, extraPreClass = '') {
  const preClass = extraPreClass ? ` class="${extraPreClass}"` : '';
  return `<div class="code-block-container" style="position: relative;">
        <button class="code-copy-btn" title="复制代码">
          <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
            <path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>
          </svg>
        </button>
        <pre${preClass}><code>${codeContent}</code></pre>
      </div>`;
}

/**
 * 在流式消息的工具卡片中添加执行结果
 * @param {Object} result - { toolCallId, toolName, success, content, truncated, duration }
 */
export function appendToolResult(result, streamingElement) {
  if (!result?.toolCallId) return;
  
  // 在当前流式消息中查找对应的工具卡片
  const element = streamingElement;
  if (!element) return;
  
  const card = element.querySelector(`.tool-call-item[data-tool-call-id="${result.toolCallId}"]`);
  if (!card) return;
  
  // 标记为已有结果，停止执行中动画
  card.classList.add('has-result');

  // 对于极快完成的工具（如 agent_write_file 仅 7ms），STREAM_TOOL_CALL 和
  // STREAM_TOOL_RESULT 几乎同时到达，浏览器来不及渲染"执行中..."状态。
  // 因此设置最小显示延迟 400ms，确保用户能看到执行中的过渡状态。
  const createdTs = parseInt(card.getAttribute('data-created-at'), 10);
  const elapsed = Date.now() - createdTs;
  const MIN_DISPLAY_MS = 400;
  const delay = elapsed < MIN_DISPLAY_MS && elapsed >= 0 ? MIN_DISPLAY_MS - elapsed : 0;
  
  const renderResult = () => {
    // 移除执行中状态标识
    const executingBadge = card.querySelector('.tool-call-executing');
    if (executingBadge) executingBadge.remove();
    // 命令已完成，隐藏终止按钮和终止等待按钮
    const terminateBtn = card.querySelector('.tool-call-terminate-btn');
    if (terminateBtn) {
      terminateBtn.style.display = 'none';
    }
    const abortBtn = card.querySelector('.tool-call-abort-btn');
    if (abortBtn) {
      abortBtn.style.display = 'none';
    }
    
    // 移除旧的结果（如果有）
    const oldResult = card.querySelector('.tool-call-result');
    if (oldResult) oldResult.remove();
    
    // 截断提示
    const truncateNote = result.truncated 
      ? '<span class="tool-result-truncated" title="原始结果过大，已截断显示">(输出过长已截断)</span>' 
      : '';
    
    // 通过 data-meta-type 判断是否为命令执行工具
    // 命令执行工具有独立的流式输出区域（agent-stream-output），
    // 此处只展示状态行，不重复展示完整输出内容
    const isExecCommand = card.getAttribute('data-meta-type') === 'exec';
    
    // 将状态和耗时插入到标题栏中（替换执行中位置）
    const header = card.querySelector('.tool-call-header');
    const statusHtml = `
      <span class="tool-result-status ${result.success ? 'success' : 'fail'}">
        ${result.success 
          ? '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-2 15l-5-5 1.41-1.41L10 14.17l7.59-7.59L19 8l-9 9z"/></svg>' 
          : '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 2C6.47 2 2 6.47 2 12s4.47 10 10 10 10-4.47 10-10S17.53 2 12 2zm5 13.59L15.59 17 12 13.41 8.41 17 7 15.59 10.59 12 7 8.41 8.41 7 12 10.59 15.59 7 17 8.41 13.41 12 17 15.59z"/></svg>'}
      </span>
      ${result.duration ? `<span class="tool-result-duration">${result.duration}ms</span>` : ''}
      ${truncateNote}
    `;
    header.insertAdjacentHTML('beforeend', statusHtml);
    
    // 命令执行类工具：已有流式输出，不再创建下方结果区（状态已移到标题栏）
    if (!isExecCommand) {
      // 非命令执行工具：展示结果内容（不含状态行，状态已在标题栏）
      const contentText = result.content || (result.success ? '(无输出)' : '执行失败');
      const contentPreview = contentText.length > 500 
        ? contentText.substring(0, 500) + '\n... (点击展开查看完整输出)' 
        : contentText;
      const fullContent = contentText;
      
      const resultDiv = document.createElement('div');
      resultDiv.className = 'tool-call-result';
      resultDiv.innerHTML = `
        <div class="tool-result-content">
          ${createCodeBlockHtml(escapeHtml(contentPreview))}
        </div>
      `;
      
      if (fullContent.length > 500) {
        const codeBlock = resultDiv.querySelector('code');
        codeBlock.dataset.fullContent = fullContent;
        let isExpanded = false;
        resultDiv.style.cursor = 'pointer';
        resultDiv.addEventListener('click', (e) => {
          if (e.ctrlKey || e.metaKey) return;
          isExpanded = !isExpanded;
          codeBlock.textContent = isExpanded ? fullContent : contentPreview;
        });
      }
      
      card.appendChild(resultDiv);
    }
    
    // 绑定代码块复制按钮
    addCodeCopyButtons();
    
    // 滚动到底部（等浏览器完成布局后）
    // 仅当该流式消息属于当前会话时才滚动，防止后台会话串台滚动
    if (streamingElement.isConnected) {
      requestAnimationFrame(() => {
        const chatContainer = document.getElementById('chatContainer');
        if (chatContainer) chatContainer.scrollTop = chatContainer.scrollHeight;
      });
    }
  };
    
  // 根据延迟决定是否立即渲染或延迟渲染
  if (delay > 0) {
    setTimeout(renderResult, delay);
  } else {
    renderResult();
  }
}

/**
 * 创建工具预筛选卡片（用于流式过程折叠区的最前面）
 * @param {Object} entry - preselect 执行日志条目
 * @returns {HTMLElement}
 */
export function createPreSelectCard(entry) {
  const card = document.createElement('div');
  card.className = 'tool-call-item expanded preselect-card';
  
  const isFailed = entry.status === 'failed';
  const statusText = isFailed ? '失败' : '完成';
  const statusClass = isFailed ? 'fail' : 'success';
  
  let summaryHtml = '';
  if (entry.action?.params?.selected) {
    // 成功筛选：显示筛选结果
    const selected = entry.action.params.selected;
    const toolCount = entry.apiRequest?.toolCount || '?';
    summaryHtml = `<span class="preselect-summary">从 ${toolCount} 个工具中筛选出 <strong>${selected.length}</strong> 个：${selected.map(n => `<code>${escapeHtml(n)}</code>`).join('、')}</span>`;
  } else if (entry.action?.name === 'all_tools') {
    summaryHtml = `<span class="preselect-summary">跳过筛选（${escapeHtml(entry.action.params.reason || '')}），使用全部工具</span>`;
  } else if (entry.action?.name === 'skip') {
    summaryHtml = `<span class="preselect-summary">跳过筛选（${escapeHtml(entry.action.params.reason || '')}），工具总数 ${entry.action.params.toolCount || '?'}</span>`;
  } else if (entry.error) {
    summaryHtml = `<span class="preselect-summary" style="color:#dc2626;">${escapeHtml(entry.error)}</span>`;
  } else if (entry.thought) {
    summaryHtml = `<span class="preselect-summary">模型直接回答：${escapeHtml(entry.thought).substring(0, 200)}</span>`;
  }
  
  const duration = entry.duration ? `${entry.duration}ms` : '';
  
  card.innerHTML = `
    <div class="tool-call-header">
      <svg class="tool-call-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
      </svg>
      <span class="tool-call-name">工具预筛选</span>
      <span class="tool-call-status ${statusClass}">${statusText}</span>
      ${duration ? `<span class="tool-call-duration">${duration}</span>` : ''}
      <svg class="tool-call-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
    </div>
    <div class="tool-call-body">
      ${summaryHtml}
      ${entry.apiResponse?.toolCountAfter !== undefined ? `<div class="preselect-meta">筛选后工具数：<strong>${entry.apiResponse.toolCountAfter}</strong></div>` : ''}
    </div>
  `;
  
  card.querySelector('.tool-call-header').addEventListener('click', () => {
    card.classList.toggle('expanded');
  });
  
  return card;
}

/**
 * 完成流式消息：移除状态文本，添加底部工具栏（复制/引用/导出/执行日志）
 * 如果包含 ReAct 工具调用过程，自动将思考过程包装到可折叠区域，最终答案始终可见
 * @param {HTMLElement} element - 流式消息容器元素
 * @param {string} content - 最终内容
 * @param {Array} executionLog - 执行日志
 * @param {number|null} reflectionScore - 反思评分
 * @param {string|null} reasoningContent - 推理/思考过程内容
 */
export function finalizeStreamingMessage(element, content, executionLog = [], reflectionScore = null, reasoningContent = null, wasRevised = false) {
  if (!element) return;
  
  const messageContent = element.querySelector('.message-content');
  const streamContent = element.querySelector('.stream-content');
  
  // 最后一轮思考结束：隐藏思考指示器，添加思考结果badge（在思考内容上面）
  const visibleThinking = element.querySelector('.thinking-indicator:not(.hidden)');
  if (visibleThinking && streamContent) {
    const duration = _thinkingStartTime > 0 ? ((Date.now() - _thinkingStartTime) / 1000).toFixed(1) + 's' : '';
    const badge = document.createElement('span');
    badge.className = 'thinking-badge';
    badge.innerHTML = `<svg class="thinking-icon-static" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/><circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/></svg>思考结果${duration ? ' <span class="thinking-duration">'+duration+'</span>' : ''}`;
    
    if (streamContent.contains(visibleThinking)) {
      // 思考指示器在 stream-content 内：找到当前轮的 thinking-content，在它前面插入 badge
      const prevSibling = visibleThinking.previousElementSibling;
      if (prevSibling && prevSibling.classList.contains('thinking-content')) {
        // thinking-content 在 thinking-indicator 前面，在 content 前面插入 badge
        streamContent.insertBefore(badge, prevSibling);
      } else {
        // 没有 thinking-content，在 thinking-indicator 前面插入 badge
        streamContent.insertBefore(badge, visibleThinking);
      }
      visibleThinking.classList.add('hidden');
    } else {
      // 思考指示器在 message-content 中（第一轮迭代）：找到最后一个 thinking-content，在它前面插入 badge
      const thinkingContents = streamContent.querySelectorAll('.thinking-content');
      if (thinkingContents.length > 0) {
        const lastContent = thinkingContents[thinkingContents.length - 1];
        const nextSibling = lastContent.nextElementSibling;
        if (!nextSibling || !nextSibling.classList.contains('thinking-badge')) {
          // 最后一个 thinking-content 是当前轮的，在它前面插入 badge
          streamContent.insertBefore(badge, lastContent);
        } else {
          // 最后一个 thinking-content 已经是上一轮的，在末尾插入 badge
          streamContent.appendChild(badge);
        }
      } else {
        // 没有 thinking-content，追加到末尾
        streamContent.appendChild(badge);
      }
      visibleThinking.classList.add('hidden');
      visibleThinking.remove();
    }
  }
  
  // 隐藏所有剩余的思考指示器（确保全部隐藏）
  element.querySelectorAll('.thinking-indicator').forEach(el => el.classList.add('hidden'));
  
  const statusDiv = element.querySelector('.stream-status');
  if (statusDiv) statusDiv.remove();
  element.classList.remove('streaming');
  
  // 检测是否为 ReAct 过程（包含工具调用卡片）
  const hasToolCalls = (messageContent && messageContent.querySelector('.tool-call-item'))
    || (streamContent && streamContent.querySelector('.tool-call-item'));
  
  if (hasToolCalls) {
    // ============================================
    // ReAct 模式：包装思考过程到可折叠区域
    // ============================================
    
    // 计算整体思考耗时
    const totalDuration = _processStartTime > 0 ? ((Date.now() - _processStartTime) / 1000).toFixed(1) + 's' : '';
    
    // 统计 ReAct 过程节点数量、成功数和失败数
    const reactNodes = (executionLog || []).filter(e => e.nodeType === 'api_call' || e.nodeType === 'tool_exec');
    const successCount = reactNodes.filter(e => e.status === 'success').length;
    const failCount = reactNodes.filter(e => e.status === 'failed').length;
    const nodeCount = reactNodes.length;
    
    // 创建可折叠的思考过程区域
    const processHistory = document.createElement('div');
    processHistory.className = 'thinking-process collapsed';
    
    const processHeader = document.createElement('div');
    processHeader.className = 'thinking-process-header';
    const statsHtml = nodeCount > 0 ? `
      <span class="thinking-process-stat">
        <span class="stat-icon node-icon">◉</span>
        <span class="stat-label">总节点</span>
        <span class="stat-value">${nodeCount}</span>
      </span>
      <span class="thinking-process-divider">|</span>
      <span class="thinking-process-stat success">
        <span class="stat-icon success-icon">✓</span>
        <span class="stat-label">成功</span>
        <span class="stat-value">${successCount}</span>
      </span>
      <span class="thinking-process-stat failed">
        <span class="stat-icon failed-icon">✗</span>
        <span class="stat-label">失败</span>
        <span class="stat-value">${failCount}</span>
      </span>
    ` : '';
    processHeader.innerHTML = `
      <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
        <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
      </svg>
      <span class="thinking-process-title">思考过程</span>
      <div class="thinking-process-stats">${statsHtml}</div>
      <span class="thinking-process-duration">${totalDuration}</span>
      <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <polyline points="6 9 12 15 18 9"/>
      </svg>
    `;
    
    const processBody = document.createElement('div');
    processBody.className = 'thinking-process-body';
    const processContent = document.createElement('div');
    processContent.className = 'thinking-process-content';
    processBody.appendChild(processContent);
    
    // 移动 stream-content 的内容到 process-content
    if (streamContent) {
      while (streamContent.firstChild) {
        processContent.appendChild(streamContent.firstChild);
      }
    }
    
    // 移动所有 tool-call-item 到 process-content
    const toolItems = messageContent.querySelectorAll('.tool-call-item');
    toolItems.forEach(item => processContent.appendChild(item));
    
    // 移除流式过程中可能已添加的预筛选卡片（避免重复），然后统一从 executionLog 重建
    processContent.querySelectorAll('.preselect-card').forEach(el => el.remove());
    const preselectEntries = (executionLog || []).filter(e => e.nodeType === 'preselect');
    logger.debug('[finalizeStreamingMessage] executionLog length:', (executionLog || []).length, 'preselectEntries:', preselectEntries.length);
    preselectEntries.forEach(entry => {
      logger.debug('[finalizeStreamingMessage] creating preselect card for entry:', entry);
      const preselectCard = createPreSelectCard(entry);
      processContent.insertBefore(preselectCard, processContent.firstChild);
    });
    
    // 移除与最终答案重复的 thinking-badge/thinking-content（最终答案统一由 final-answer 展示）
    // 在 ReAct 模式下，最后一个 thinking-content 就是最终答案，应该始终移除它和它前面的 badge
    // 除非 wasRevised 为 true（反思修改了答案，此时最终答案与最后一个 thinking-content 不同）
    const thinkingContents = processContent.querySelectorAll('.thinking-content');
    const finalText = extractTextContent(content).trim();
    
    if (thinkingContents.length > 0) {
      const lastContent = thinkingContents[thinkingContents.length - 1];
      const lastContentText = lastContent.textContent.trim();
      
      // 判断是否需要移除：
      // 1. 未修订时：始终移除最后一个 thinking-content（因为它就是最终答案）
      // 2. 已修订时：只有当内容相同时才移除（反思没有实际改变内容）
      const shouldRemove = !wasRevised || (wasRevised && lastContentText === finalText);
      
      if (shouldRemove) {
        // 通过 DOM 关系查找对应的 thinking-badge（在 thinking-content 前面）
        let prevSibling = lastContent.previousElementSibling;
        while (prevSibling) {
          if (prevSibling.classList.contains('thinking-badge')) {
            prevSibling.remove();
            break;
          }
          prevSibling = prevSibling.previousElementSibling;
        }
        
        lastContent.remove();
      }
    }
    
    // 检查 processContent 是否还有实际内容
    // 如果为空，则不显示思考过程区域，只显示最终答案
    const hasProcessContent = processContent.children.length > 0 && processContent.textContent.trim();
    
    if (hasProcessContent) {
      processHistory.appendChild(processHeader);
      processHistory.appendChild(processBody);
      
      // 创建最终答案区域（始终可见，不折叠）
      const finalAnswer = document.createElement('div');
      finalAnswer.className = 'final-answer';
      const textContent = extractTextContent(content);
      if (textContent && textContent.trim()) {
        finalAnswer.innerHTML = formatMessageContent(textContent);
      }
      
      // 清理 message-content 中的残留元素
      // 移除原始的 thinking-indicator（来自 addStreamingMessage 模板）
      const origThinking = messageContent.querySelector('.thinking-indicator');
      if (origThinking) origThinking.remove();
      // 清空 stream-content（所有子节点已移入思考过程区域）
      if (streamContent) streamContent.innerHTML = '';
      
      // 插入 process-history 和 final-answer
      messageContent.appendChild(processHistory);
      messageContent.appendChild(finalAnswer);
      
      // 点击头部切换折叠
      processHeader.addEventListener('click', () => {
        processHistory.classList.toggle('collapsed');
      });
    } else {
      // 思考过程区域为空：直接渲染最终答案，不显示思考过程区域
      const origThinking = messageContent.querySelector('.thinking-indicator');
      if (origThinking) origThinking.remove();
      if (streamContent) {
        const textContent = extractTextContent(content);
        if (textContent && textContent.trim()) {
          streamContent.innerHTML = formatMessageContent(textContent);
        }
      }
    }
    
  } else {
    // ============================================
    // 非 ReAct 模式：普通流式回答
    // ============================================
    if (streamContent) {
      const textContent = extractTextContent(content);
      // 如果 stream-content 中已有 thinking-content（流式过程中创建），也包装到可折叠区域
      const hasThinkingContent = streamContent.querySelector('.thinking-content');
      
      if (hasThinkingContent) {
        // 有思考内容：包装到 thinking-process 区域，创建独立的 final-answer 显示最终答案
        const totalDuration = _processStartTime > 0 ? ((Date.now() - _processStartTime) / 1000).toFixed(1) + 's' : '';
        
        // 统计 ReAct 过程节点数量、成功数和失败数（非 ReAct 模式只有 api_call）
        const reactNodes = (executionLog || []).filter(e => e.nodeType === 'api_call' || e.nodeType === 'tool_exec');
        const successCount = reactNodes.filter(e => e.status === 'success').length;
        const failCount = reactNodes.filter(e => e.status === 'failed').length;
        const nodeCount = reactNodes.length;
        
        const processHistory = document.createElement('div');
        processHistory.className = 'thinking-process collapsed';
        
        const processHeader = document.createElement('div');
        processHeader.className = 'thinking-process-header';
        const statsHtml = nodeCount > 0 ? `
          <span class="thinking-process-stat">
            <span class="stat-icon node-icon">◉</span>
            <span class="stat-label">总节点</span>
            <span class="stat-value">${nodeCount}</span>
          </span>
          <span class="thinking-process-divider">|</span>
          <span class="thinking-process-stat success">
            <span class="stat-icon success-icon">✓</span>
            <span class="stat-label">成功</span>
            <span class="stat-value">${successCount}</span>
          </span>
          <span class="thinking-process-stat failed">
            <span class="stat-icon failed-icon">✗</span>
            <span class="stat-label">失败</span>
            <span class="stat-value">${failCount}</span>
          </span>
        ` : '';
        processHeader.innerHTML = `
          <svg class="thinking-process-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v1a3 3 0 0 0 3 3 3 3 0 0 1 3 3v1a3 3 0 0 1-3 3 3 3 0 0 0-3 3v1a3 3 0 0 0 3 3"/>
            <circle cx="8" cy="12" r="1.5"/><circle cx="16" cy="12" r="1.5"/>
          </svg>
          <span class="thinking-process-title">思考过程</span>
          <div class="thinking-process-stats">${statsHtml}</div>
          <span class="thinking-process-duration">${totalDuration}</span>
          <svg class="thinking-process-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="6 9 12 15 18 9"/>
          </svg>
        `;
        
        const processBody = document.createElement('div');
        processBody.className = 'thinking-process-body';
        const processContent = document.createElement('div');
        processContent.className = 'thinking-process-content';
        processBody.appendChild(processContent);
        
        // 移动 stream-content 的内容到 process-content
        while (streamContent.firstChild) {
          processContent.appendChild(streamContent.firstChild);
        }
        
        // 移除与最终答案重复的最后一个 thinking-content 和对应的 badge
        const thinkingContents = processContent.querySelectorAll('.thinking-content');
        const finalText = textContent.trim();
        if (thinkingContents.length > 0) {
          const lastContent = thinkingContents[thinkingContents.length - 1];
          const lastContentText = lastContent.textContent.trim();
          const shouldRemove = !wasRevised || (wasRevised && lastContentText === finalText);
          if (shouldRemove) {
            let prevSibling = lastContent.previousElementSibling;
            while (prevSibling) {
              if (prevSibling.classList.contains('thinking-badge')) {
                prevSibling.remove();
                break;
              }
              prevSibling = prevSibling.previousElementSibling;
            }
            lastContent.remove();
          }
        }
        
        // 检查 processContent 是否还有实际内容
        // 如果为空，则不显示思考过程区域，只显示最终答案
        const hasProcessContent = processContent.children.length > 0 && processContent.textContent.trim();
        
        if (hasProcessContent) {
          processHistory.appendChild(processHeader);
          processHistory.appendChild(processBody);
          
          // 创建最终答案区域（始终可见，不折叠）
          const finalAnswer = document.createElement('div');
          finalAnswer.className = 'final-answer';
          if (textContent && textContent.trim()) {
            finalAnswer.innerHTML = formatMessageContent(textContent);
          }
          
          // 清理 message-content 中的残留元素
          const origThinking = messageContent.querySelector('.thinking-indicator');
          if (origThinking) origThinking.remove();
          
          // 插入 process-history 和 final-answer
          messageContent.appendChild(processHistory);
          messageContent.appendChild(finalAnswer);
          
          // 点击头部切换折叠
          processHeader.addEventListener('click', () => {
            processHistory.classList.toggle('collapsed');
          });
        } else {
          // 思考过程区域为空：直接渲染最终答案，不显示思考过程区域
          const origThinking = messageContent.querySelector('.thinking-indicator');
          if (origThinking) origThinking.remove();
          if (textContent && textContent.trim()) {
            streamContent.innerHTML = formatMessageContent(textContent);
          }
        }
      } else if (textContent && textContent.trim()) {
        // 没有思考内容：直接渲染最终答案
        streamContent.innerHTML = formatMessageContent(textContent);
      }
    }
  }
  
  // 设置数据属性（供工具栏按钮使用）
  element.classList.add('assistant', 'message');
  element.dataset.rawContent = typeof content === 'string' ? content : JSON.stringify(content);
  element.dataset.textContent_ = extractTextContent(content);
  element.dataset.executionLog = JSON.stringify(executionLog);
  
  // 添加底部工具栏
  const footer = document.createElement('div');
  footer.className = 'message-footer';
  
  // 复制按钮
  const copyBtn = document.createElement('button');
  copyBtn.className = 'copy-btn';
  copyBtn.title = '复制 Markdown 内容 (Ctrl/Cmd + 点击复制富文本)';
  copyBtn.innerHTML = [
    '<svg viewBox="0 0 16 16" fill="currentColor">',
    '<path d="M0 6.75C0 5.784.784 5 1.75 5h1.5a.75.75 0 0 1 0 1.5h-1.5a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-1.5a.75.75 0 0 1 1.5 0v1.5A1.75 1.75 0 0 1 9.25 16h-7.5A1.75 1.75 0 0 1 0 14.25zM5 1.75C5 .784 5.784 0 6.75 0h7.5C15.216 0 16 .784 16 1.75v7.5A1.75 1.75 0 0 1 14.25 11h-7.5A1.75 1.75 0 0 1 5 9.25zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .138.112.25.25.25h7.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25z"/>',
    '</svg>',
    '<span>复制</span>'
  ].join('');
  copyBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    copyAssistantMessage(element, copyBtn, e);
  });
  footer.appendChild(copyBtn);
  
  // 引用按钮
  const quoteBtn = document.createElement('button');
  quoteBtn.className = 'quote-btn';
  quoteBtn.title = '引用该内容问答';
  quoteBtn.innerHTML = [
    '<svg t="1781246498458" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="9645" width="14" height="14"><path d="M156.09136 606.57001a457.596822 457.596822 0 0 1 221.680239-392.516385 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z m406.752731 0a457.596822 457.596822 0 0 1 221.680239-392.007944 50.844091 50.844091 0 1 1 50.844091 86.943396 355.90864 355.90864 0 0 0-138.804369 152.532274h16.77855a152.532274 152.532274 0 1 1-152.532274 152.532274z" fill="#8a8a8a" p-id="9646"></path></svg>',
    '<span>引用</span>'
  ].join('');
  quoteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    quoteAndAsk(element);
  });
  footer.appendChild(quoteBtn);
  
  // 导出菜单
  const exportMenuContainer = document.createElement('div');
  exportMenuContainer.className = 'export-menu-container';
  
  const exportTriggerBtn = document.createElement('button');
  exportTriggerBtn.className = 'export-trigger-btn';
  exportTriggerBtn.innerHTML = '<svg t="1781245244396" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5115" width="14" height="14"><path d="M496.213333 739.84c2.133333 2.133333 4.693333 3.84 7.68 5.12 0.853333 0.426667 2.133333 0.426667 2.986667 0.853333 1.706667 0.426667 2.986667 0.853333 4.693333 0.853334 5.546667 0 11.093333-2.133333 14.933334-6.4l256-256c8.533333-8.533333 8.533333-21.76 0-30.293334s-21.76-8.533333-30.293334 0L533.333333 674.133333V128c0-11.946667-9.386667-21.333333-21.333333-21.333333s-21.333333 9.386667-21.333333 21.333333v545.706667l-219.306667-219.306667c-8.533333-8.533333-21.76-8.533333-30.293333 0s-8.533333 21.76 0 30.293333l255.146666 255.146667zM768 874.666667H256c-11.946667 0-21.333333 9.386667-21.333333 21.333333s9.386667 21.333333 21.333333 21.333333h512c11.946667 0 21.333333-9.386667 21.333333-21.333333s-9.386667-21.333333-21.333333-21.333333z" fill="#8a8a8a" p-id="5116"></path></svg><span>导出</span><svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>';
  
  const exportDropdown = document.createElement('div');
  exportDropdown.className = 'export-dropdown';
  exportDropdown.innerHTML = [
    '<button class="export-dropdown-item export-docx-item" type="button">',
    '<svg t="1781245550030" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="6544" width="32" height="32"><path d="M747.936 901.171H276.819c-72.2 0-130.953-55.224-130.953-123.078V244.721c0-67.854 58.752-123.078 130.953-123.078h383.525c6.597 0 12.937 2.505 17.795 6.954l192.363 178.046c5.317 4.96 8.386 11.914 8.386 19.227v452.223c0 67.854-58.752 123.078-130.952 123.078zM276.819 174.004c-43.31 0-78.592 31.703-78.592 70.717v533.372c0 39.015 35.282 70.718 78.592 70.718h471.117c43.31 0 78.592-31.703 78.592-70.718V337.324l-176.461-163.32H276.819z" fill="#8a8a8a" p-id="6545"></path><path d="M830.567 331.546H669.446c-14.471 0-26.18-11.71-26.18-26.181V156.209c0-14.471 11.709-26.18 26.18-26.18s26.181 11.709 26.181 26.18v122.976h134.94c14.471 0 26.181 11.709 26.181 26.18s-11.711 26.181-26.181 26.181z" fill="#8a8a8a" p-id="6546"></path><path d="M730.214 428.749l-92.04 343.616h-53.179L511.363 498.29l-75.677 274.074h-53.179l-92.04-343.616h49.088l69.542 255.667 69.541-255.667h63.406l69.541 255.667 69.541-255.667h49.088z" fill="#8a8a8a" p-id="6547"></path></svg>',
    '<span>导出 Word</span>',
    '</button>',
    '<button class="export-dropdown-item export-pdf-item" type="button">',
    '<svg t="1781245863206" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="8152" width="32" height="32"><path d="M582.4 864H170.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V170.666667c0-6.4 4.266667-10.666667 10.666667-10.666667h309.333333V320c0 40.533333 34.133333 74.666667 74.666667 74.666667h160v38.4c0 17.066667 14.933333 32 32 32s32-14.933333 32-32V298.666667c0-8.533333-4.266667-17.066667-8.533334-23.466667l-170.666666-170.666667c-6.4-6.4-14.933333-8.533333-23.466667-8.533333H170.666667C130.133333 96 96 130.133333 96 170.666667v682.666666c0 40.533333 34.133333 74.666667 74.666667 74.666667h411.733333c17.066667 0 32-14.933333 32-32s-14.933333-32-32-32z m132.266667-550.4v17.066667H554.666667c-6.4 0-10.666667-4.266667-10.666667-10.666667V160h19.2l151.466667 153.6z" fill="#8a8a8a" p-id="8153"></path><path d="M332.8 533.333333c-12.8 0-19.2 2.133333-25.6 6.4-6.4 4.266667-8.533333 12.8-8.533333 23.466667v206.933333c0 6.4 2.133333 12.8 6.4 19.2 4.266667 4.266667 10.666667 8.533333 21.333333 8.533334s17.066667-4.266667 21.333333-8.533334c4.266667-4.266667 6.4-10.666667 6.4-19.2v-64h32c57.6 0 89.6-29.866667 89.6-87.466666 0-27.733333-8.533333-51.2-23.466666-64-14.933333-14.933333-36.266667-21.333333-66.133334-21.333334h-53.333333z m87.466667 85.333334c0 12.8-2.133333 23.466667-8.533334 27.733333-4.266667 4.266667-14.933333 8.533333-27.733333 8.533333h-32v-70.4H384c12.8 0 21.333333 2.133333 27.733333 8.533334 6.4 4.266667 8.533333 12.8 8.533334 25.6zM667.733333 571.733333c-8.533333-12.8-21.333333-21.333333-34.133333-29.866666-14.933333-4.266667-32-8.533333-51.2-8.533334h-61.866667c-8.533333 0-17.066667 0-23.466666 8.533334-2.133333 4.266667-4.266667 10.666667-4.266667 19.2V768c0 8.533333 2.133333 14.933333 4.266667 19.2 6.4 8.533333 14.933333 8.533333 23.466666 8.533333h64c19.2 0 34.133333-4.266667 49.066667-10.666666 12.8-6.4 25.6-17.066667 34.133333-29.866667 8.533333-12.8 14.933333-25.6 19.2-42.666667 4.266667-14.933333 6.4-32 6.4-49.066666 0-17.066667-2.133333-34.133333-6.4-49.066667-4.266667-14.933333-10.666667-29.866667-19.2-42.666667z m-42.666666 153.6c-8.533333 12.8-21.333333 19.2-38.4 19.2h-38.4v-160H576c21.333333 0 38.4 6.4 46.933333 19.2 10.666667 12.8 14.933333 34.133333 14.933334 59.733334 2.133333 27.733333-4.266667 46.933333-12.8 61.866666zM851.2 533.333333h-106.666667c-8.533333 0-17.066667 2.133333-21.333333 6.4-6.4 4.266667-8.533333 12.8-8.533333 21.333334v209.066666c0 6.4 2.133333 12.8 6.4 17.066667 4.266667 6.4 10.666667 8.533333 21.333333 8.533333 8.533333 0 17.066667-2.133333 21.333333-8.533333 2.133333-4.266667 6.4-8.533333 6.4-19.2v-85.333333h72.533334c12.8 0 23.466667-6.4 25.6-17.066667 2.133333-8.533333 2.133333-14.933333 0-17.066667-2.133333-4.266667-6.4-17.066667-25.6-17.066666H768v-49.066667h81.066667c8.533333 0 14.933333-2.133333 19.2-4.266667 4.266667-2.133333 8.533333-8.533333 8.533333-21.333333 2.133333-12.8-8.533333-23.466667-25.6-23.466667z" fill="#8a8a8a" p-id="8154"></path></svg>',
    '<span>导出 PDF</span>',
    '</button>',
    '<button class="export-dropdown-item export-image-item" type="button">',
    '<svg t="1784207887308" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="5993" width="32" height="32"><path d="M400.696 268.795c-17.249 0-31.233 13.986-31.233 31.233v30.471c0 17.249 13.986 31.233 31.233 31.233s31.233-13.986 31.233-31.233v-30.471c0-17.249-13.985-31.233-31.233-31.233z" fill="#8a8a8a" p-id="5994"></path><path d="M623.649 361.734c17.249 0 31.234-13.986 31.234-31.233v-30.471c0-17.249-13.986-31.233-31.234-31.233s-31.233 13.986-31.233 31.233v30.471c-0.001 17.248 13.985 31.233 31.233 31.233z" fill="#8a8a8a" p-id="5995"></path><path d="M438.295 388.804c-14.656 9.104-19.155 28.362-10.050 43.013 11.209 18.047 41.976 48.59 86.157 48.59 43.958 0 75.1-30.313 86.574-48.223 9.303-14.529 5.068-33.847-9.455-43.15-14.539-9.298-33.852-5.068-43.15 9.455-0.122 0.199-13.38 19.45-33.969 19.45-20.009 0-32.444-18.128-33.278-19.373-9.166-14.423-28.28-18.805-42.829-9.761z" fill="#8a8a8a" p-id="5996"></path><path d="M824.508503 116.690676 571.592236 116.690676c-17.248849 0-31.233352 13.985526-31.233352 31.233352s13.985526 31.233352 31.233352 31.233352l252.916267 0c40.181141 0 72.878844 32.692586 72.878844 72.878844l0 396.966057-189.334159-165.29465c-12.20088-10.655687-30.517037-10.207479-42.173518 0.9967L468.578048 674.16231 309.521472 517.519714c-11.895935-11.70253-30.903847-12.002358-43.154869-0.645706L126.957507 646.163629l0-394.126382c0-40.186258 32.692586-72.878844 72.878844-72.878844l252.916267 0c17.248849 0 31.233352-13.985526 31.233352-31.233352S470.000444 116.690676 452.751594 116.690676L199.836351 116.690676c-74.632791 0-135.346571 60.71378-135.346571 135.346571l0 520.56405c0 74.632791 60.71378 135.346571 135.346571 135.346571l252.916267 0c17.248849 0 31.233352-13.985526 31.233352-31.233352s-13.985526-31.233352-31.233352-31.233352L199.836351 845.481164c-40.186258 0-72.878844-32.692586-72.878844-72.878844l0-41.23924 160.003134-148.385539 159.428036 157.007917c12.048407 11.865235 31.361265 11.981892 43.546795 0.274246l198.576661-190.68697 208.876238 182.346001 0 40.683585c0 40.186258-32.697703 72.878844-72.878844 72.878844L571.592236 845.481164c-17.248849 0-31.233352 13.985526-31.233352 31.233352s13.985526 31.233352 31.233352 31.233352l252.916267 0c74.627674 0 135.346571-60.71378 135.346571-135.346571L959.855074 252.037247C959.855074 177.404456 899.136178 116.690676 824.508503 116.690676z" fill="#8a8a8a" p-id="5997"></path></svg>',
    '<span>导出图片</span>',
    '</button>',
    '<button class="export-dropdown-item export-md-item" type="button">',
    '<svg t="1784038824502" class="icon" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg" p-id="1666" width="32" height="32"><path d="M601.216 85.333333a42.666667 42.666667 0 0 1 30.485333 12.821334l209.450667 213.973333a42.666667 42.666667 0 0 1 12.181333 29.866667V853.333333a85.333333 85.333333 0 0 1-85.333333 85.333334H256a85.333333 85.333333 0 0 1-85.333333-85.333334V170.666667a85.333333 85.333333 0 0 1 85.333333-85.333334h345.216z m-35.584 64H256a21.333333 21.333333 0 0 0-21.333333 21.333334v682.666666a21.333333 21.333333 0 0 0 21.333333 21.333334h512a21.333333 21.333333 0 0 0 21.333333-21.333334V395.413333h-191.68a32 32 0 0 1-32-32L565.632 149.333333z m64 38.186667v143.893333h140.821333L629.632 187.52z" fill="#8a8a8a" p-id="1667"></path><path d="M384.341333 800l-3.072-0.106667a32 32 0 0 1-29.162666-34.624l21.973333-256c2.752-32.256 46.165333-40.490667 60.544-11.477333l77.290667 156.010667 78.805333-156.224c14.08-27.925333 55.082667-20.906667 60.074667 8.789333l0.384 3.050667 20.714666 256a32 32 0 0 1-63.786666 5.162666l-11.541334-142.549333-56.341333 111.722667c-11.413333 22.613333-42.88 23.381333-55.744 2.517333l-1.493333-2.730667-54.912-110.826666-12.181334 142.016a32 32 0 0 1-31.552 29.269333z" fill="#8a8a8a" p-id="1668"></path></svg>',
    '<span>导出 Markdown</span>',
    '</button>'
  ].join('');
  
  const docxBtn = exportDropdown.querySelector('.export-docx-item');
  docxBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportAssistantMessageToDocx(element, docxBtn, exportDropdown);
  });
  
  const mdBtn = exportDropdown.querySelector('.export-md-item');
  mdBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportAssistantMessageToMarkdown(element, mdBtn, exportDropdown);
  });
  
  const pdfBtn = exportDropdown.querySelector('.export-pdf-item');
  pdfBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportAssistantMessageToPdf(element, pdfBtn, exportDropdown);
  });
  
  const imageBtn = exportDropdown.querySelector('.export-image-item');
  imageBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    exportAssistantMessageToImage(element, imageBtn, exportDropdown);
  });
  
  exportTriggerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.export-dropdown.show').forEach(menu => {
      if (menu !== exportDropdown) menu.classList.remove('show');
    });
    exportDropdown.classList.toggle('show');
  });
  
  let hoverTimer = null;
  exportMenuContainer.addEventListener('mouseenter', () => {
    hoverTimer = setTimeout(() => {
      document.querySelectorAll('.export-dropdown.show').forEach(menu => {
        if (menu !== exportDropdown) menu.classList.remove('show');
      });
      exportDropdown.classList.add('show');
    }, 300);
  });
  exportMenuContainer.addEventListener('mouseleave', () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
    setTimeout(() => {
      if (!exportMenuContainer.matches(':hover') && !exportDropdown.matches(':hover')) {
        exportDropdown.classList.remove('show');
      }
    }, 100);
  });
  
  exportMenuContainer.appendChild(exportTriggerBtn);
  exportMenuContainer.appendChild(exportDropdown);
  footer.appendChild(exportMenuContainer);

  const rightActionsContainer = document.createElement('div');
  rightActionsContainer.className = 'footer-right-actions';
  rightActionsContainer.style.marginLeft = 'auto';
  rightActionsContainer.style.display = 'flex';
  rightActionsContainer.style.alignItems = 'center';
  rightActionsContainer.style.gap = '8px';
  
  // 执行日志按钮（如果启用且有日志）
  if (executionLog && executionLog.length > 0 && state.chatConfig?.enableExecutionLog) {
    const logBtn = document.createElement('button');
    logBtn.className = 'execution-log-btn';
    logBtn.type = 'button';
    logBtn.title = '执行日志';
    logBtn.innerHTML = [
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">',
      '<circle cx="12" cy="12" r="10"></circle>',
      '<polyline points="12 6 12 12 16 14"></polyline>',
      '</svg>'
    ].join('');
    rightActionsContainer.appendChild(logBtn);
  }
  
  // 质量评估徽章（反思评分）
  const hasReflection = reflectionScore !== null && reflectionScore !== undefined;
  const reflectionRounds = executionLog 
    ? executionLog.filter(e => e.nodeType === 'reflection' && e.reflectionType === 'post' && e.status === 'success').length 
    : 0;
  const postReflection = executionLog?.find(e => e.nodeType === 'reflection' && e.reflectionType === 'post');
  
  if (hasReflection && state.chatConfig?.enableExecutionLog) {
    const scoreColor = reflectionScore >= 8 ? 'score-high' : (reflectionScore >= 5 ? 'score-mid' : 'score-low');
    const scoreEmoji = reflectionScore >= 8 ? '✅' : (reflectionScore >= 5 ? '🔍' : '⚠️');
    const roundsTag = reflectionRounds > 1 ? ` (${reflectionRounds}轮)` : '';
    
    const scoreBadge = document.createElement('button');
    scoreBadge.className = 'reflection-score-btn';
    scoreBadge.type = 'button';
    scoreBadge.title = `AI 质量评估: ${reflectionScore}/10${roundsTag}\n点击查看评估详情`;
    scoreBadge.innerHTML = `<span class="reflection-badge ${scoreColor}">${scoreEmoji} ${reflectionScore}/10</span>`;
    scoreBadge.dataset.reflectionData = JSON.stringify({
      overallScore: postReflection?.overallScore ?? reflectionScore,
      dimensions: postReflection?.dimensions || null,
      issues: postReflection?.issues || null,
      suggestions: postReflection?.suggestions || null,
      decision: postReflection?.action?.decision || null,
      useful: postReflection?.useful ?? null,
      reasoning: postReflection?.reasoning || null,
      suggestion: postReflection?.suggestion || null,
      rounds: reflectionRounds,
      wasRevised: false
    });
    
    rightActionsContainer.appendChild(scoreBadge);
  } else if (!hasReflection && postReflection && postReflection.status === 'failed' && state.chatConfig?.enableExecutionLog) {
    const warnBadge = document.createElement('button');
    warnBadge.className = 'reflection-score-btn';
    warnBadge.type = 'button';
    warnBadge.title = '反思评估失败（点击查看执行日志）';
    warnBadge.innerHTML = `<span class="reflection-badge score-low">⚠️ 反思失败</span>`;
    rightActionsContainer.appendChild(warnBadge);
  }
  
  // 原型预览按钮
  const prototypeCall = executionLog?.slice().reverse().find(e => e.nodeType === 'tool_exec' && e.action?.name === 'preview_ui_prototype' && e.status === 'success');
  if (prototypeCall) {
    let localOpened = false;
    if (prototypeCall.observation) {
      try {
        const obs = typeof prototypeCall.observation === 'string' 
          ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
        localOpened = obs?.localOpened === true;
      } catch (e) {}
    }

    const prototypeBtn = document.createElement('button');
    prototypeBtn.className = 'prototype-btn-small';
    prototypeBtn.type = 'button';
    prototypeBtn.title = localOpened ? '已在本地浏览器打开，点击可在面板内查看' : '查看 UI 原型';
    prototypeBtn.innerHTML = ICON_IMAGE_24;
    prototypeBtn.addEventListener('click', () => {
      let prototypeId = prototypeCall.prototypeId;
      if (!prototypeId && prototypeCall.observation) {
        try {
          const parsed = typeof prototypeCall.observation === 'string' 
            ? JSON.parse(prototypeCall.observation) : prototypeCall.observation;
          prototypeId = parsed?.prototypeId;
        } catch (e) {}
      }
      if (prototypeId) {
        loadAndShowPrototype(prototypeId);
      } else {
        logger.error('[SidePanel] 未找到 prototypeId，entry keys:', Object.keys(prototypeCall), 'observation:', prototypeCall.observation);
      }
    });
    rightActionsContainer.appendChild(prototypeBtn);
  }

  // 收藏按钮
  const bookmarkBtn = document.createElement('button');
  bookmarkBtn.className = 'bookmark-btn';
  bookmarkBtn.title = '收藏消息';
  bookmarkBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>
    </svg>
  `;
  if (isBookmarked(state.activeSessionId, element.dataset.messageId)) {
    bookmarkBtn.classList.add('bookmarked');
    bookmarkBtn.title = '取消收藏';
    bookmarkBtn.querySelector('svg').setAttribute('fill', 'currentColor');
  }
  bookmarkBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    const sid = state.activeSessionId;
    const mid = element.dataset.messageId;
    if (bookmarkBtn.classList.contains('bookmarked')) {
      await removeBookmark(sid, mid);
      updateBookmarkBtnState(bookmarkBtn, sid, mid);
      const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
      refreshBookmarkPanel();
    } else {
      const textContent = element.dataset.textContent_ || '';
      const sessionTitle = state.sessions.find(s => s.id === sid)?.title || '';
      await addBookmark(sid, mid, textContent, sessionTitle);
      updateBookmarkBtnState(bookmarkBtn, sid, mid);
      const { refreshBookmarkPanel } = await import('./bookmark-panel.js');
      refreshBookmarkPanel();
    }
  });
  rightActionsContainer.appendChild(bookmarkBtn);

  const deleteBtn = document.createElement('button');
  deleteBtn.className = 'delete-btn';
  deleteBtn.title = '删除消息';
  deleteBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polyline points="3 6 5 6 21 6"></polyline>
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
    </svg>
  `;
  deleteBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    deleteMessage(element);
  });
  rightActionsContainer.appendChild(deleteBtn);

  footer.appendChild(rightActionsContainer);

  element.querySelector('.message-content').appendChild(footer);
  
  // 绑定事件委托（执行日志/反思弹窗点击）
  bindExecutionLogDelegate();
  bindReflectionBadgeDelegate();
  
  // 添加代码复制按钮、Mermaid 渲染等后处理
  addCodeCopyButtons();
  // Mermaid 渲染为异步操作，渲染完成后自动更新 htmlContent
  renderMessageMermaid(element).then(() => {
    element.dataset.htmlContent = element.outerHTML;
  });
  
  // 先保存当前 HTML 到 dataset（Mermaid 渲染完成后会更新）
  element.dataset.htmlContent = element.outerHTML;
}

/**
 * 统一的停止任务处理函数：供输入区停止按钮和流式消息内停止按钮共用
 * @param {HTMLElement} stopBtn - 被点击的停止按钮元素
 */
export function cancelStreamingTask(stopBtn) {
  if (!stopBtn || stopBtn.disabled) return;

  stopBtn.disabled = true;
  stopBtn.style.opacity = '0.4';
  stopBtn.style.cursor = 'not-allowed';

  // 同时更新加载消息中的停止按钮（如果还存在）
  const loadingStopBtn = document.querySelector('.loading-message .stop-task-btn');
  if (loadingStopBtn) {
    loadingStopBtn.disabled = true;
    loadingStopBtn.style.opacity = '0.6';
    loadingStopBtn.style.cursor = 'not-allowed';
    const loadingText = document.querySelector('.loading-message .loading-text');
    if (loadingText) loadingText.textContent = '停止中...';
  }

  // 发送取消消息到后台
  chrome.runtime.sendMessage({
    type: 'CANCEL_REACT',
    tabId: null,
    sessionId: state.activeSessionId
  });

  // 立即清理前端状态
  if (state.pendingCancelApi) {
    state.pendingCancelApi({
      message: '任务已被用户停止',
      executionLog: state.currentExecutionStatus?.executionLog || []
    });
  }
}

/**
 * 清理被取消的流式消息：移除思考中占位和状态文本，更新所有"执行中"状态为"已取消"
 */
export function finalizeCancelledStream(element) {
  if (!element) return;

  // 隐藏所有思考指示器
  element.querySelectorAll('.thinking-indicator').forEach(el => el.classList.add('hidden'));

  // 更新状态文本为"已取消"
  const statusDiv = element.querySelector('.stream-status');
  if (statusDiv) {
    statusDiv.textContent = '';
  }

  // 工具调用卡片：将"执行中..."替换为"已取消"
  element.querySelectorAll('.tool-call-executing').forEach(el => {
    el.textContent = '已取消';
    el.classList.add('tool-call-cancelled');
  });

  // 子任务状态：将"执行中..."替换为"已取消"
  element.querySelectorAll('.subtask-status-label').forEach(el => {
    const spinner = el.querySelector('.subtask-spinner');
    if (spinner) spinner.remove();
    if (el.textContent.includes('执行中')) {
      el.textContent = '已取消';
    }
  });

  // 移除所有 spinner 动画
  element.querySelectorAll('.subtask-spinner, .thinking-spinner, .loading-dots').forEach(el => el.remove());

  // 移除 streaming 动画类
  element.classList.remove('streaming');
  element.classList.add('stream-cancelled');

  // 隐藏所有"终止等待"按钮
  element.querySelectorAll('.tool-call-abort-btn').forEach(el => el.style.display = 'none');
  // 隐藏所有"终止命令"按钮
  element.querySelectorAll('.tool-call-terminate-btn').forEach(el => el.style.display = 'none');
}
