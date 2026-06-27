// confirm-dialog.js - 敏感工具操作确认对话框

import state from './state.js';

let confirmResolve = null;

/**
 * 显示工具操作确认对话框
 * @param {Object} data - { toolName, toolLabel, args, message, toolCallId, sessionId, timeout }
 */
export function showConfirmDialog(data) {
  const { toolName, toolLabel, args, message, toolCallId, sessionId, timeout = 30000 } = data;
  
  console.log('[SidePanel] 显示确认对话框:', toolName, data);
  
  state.currentConfirmToolCallId = toolCallId;
  state.currentConfirmSessionId = sessionId || null;
  
  const overlay = document.getElementById('confirmOverlay');
  if (!overlay) return;
  
  // 更新显示
  document.getElementById('confirmToolName').textContent = toolLabel || toolName;
  
  // 显示参数摘要
  const argsSummary = document.getElementById('confirmArgsSummary');
  if (argsSummary && args) {
    const relevantArgs = Object.entries(args)
      .filter(([k, v]) => v !== undefined && v !== null && v !== '')
      .slice(0, 5);
    if (relevantArgs.length > 0) {
      argsSummary.innerHTML = relevantArgs
        .map(([k, v]) => `<span class="confirm-arg"><strong>${k}:</strong> ${typeof v === 'string' ? v.substring(0, 50) : JSON.stringify(v).substring(0, 50)}</span>`)
        .join('');
      argsSummary.style.display = 'block';
    } else {
      argsSummary.style.display = 'none';
    }
  }
  
  // 显示说明消息
  const messageEl = document.getElementById('confirmMessage');
  if (messageEl) {
    messageEl.textContent = message || `模型请求执行操作: ${toolLabel || toolName}`;
  }
  
  overlay.style.display = 'flex';
  
  return new Promise((resolve) => {
    confirmResolve = resolve;
    
    // 自动超时处理：默认拒绝
    setTimeout(() => {
      if (confirmResolve) {
        console.log('[SidePanel] 确认对话框超时，自动拒绝');
        handleConfirmResponse(false);
      }
    }, timeout);
  });
}

/**
 * 处理用户确认/拒绝
 */
function handleConfirmResponse(confirmed) {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  
  // 发送确认结果回 background
  chrome.runtime.sendMessage({
    type: 'TOOL_CONFIRMATION_RESPONSE',
    toolCallId: state.currentConfirmToolCallId,
    confirmed,
    sessionId: state.currentConfirmSessionId
  }).catch(err => {
    console.log('[SidePanel] 发送确认响应失败:', err.message);
  });
  
  state.currentConfirmToolCallId = null;
  state.currentConfirmSessionId = null;
  
  if (confirmResolve) {
    confirmResolve(confirmed);
    confirmResolve = null;
  }
}

/**
 * 初始化确认对话框事件
 */
export function initConfirmEvents() {
  const confirmBtn = document.getElementById('confirmApproveBtn');
  const denyBtn = document.getElementById('confirmDenyBtn');
  
  if (confirmBtn) {
    confirmBtn.addEventListener('click', () => handleConfirmResponse(true));
  }
  if (denyBtn) {
    denyBtn.addEventListener('click', () => handleConfirmResponse(false));
  }
  
  // 监听来自 background 的消息
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_CONFIRM_DIALOG') {
      showConfirmDialog(message.data);
      sendResponse({ received: true });
      return false;
    }
    return false;
  });
}
