// confirm-dialog.js - 敏感操作确认对话框

import state from './state.js';

let confirmResolve = null;
let countdownTimer = null;
let autoTimeoutId = null;

/**
 * 格式化倒计时时间
 * @param {number} seconds
 * @returns {string}
 */
function formatCountdown(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

/**
 * 显示工具操作确认对话框
 * @param {Object} data - { toolName, toolLabel, args, message, toolCallId, sessionId, timeout }
 */
export function showConfirmDialog(data) {
  const { toolName, toolLabel, args, message, toolCallId, sessionId, timeout = 180000 } = data;
  
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
        .map(([k, v]) => {
          const rawValue = typeof v === 'string' ? v : JSON.stringify(v);
          const displayValue = rawValue.length > 80 ? rawValue.substring(0, 80) + '...' : rawValue;
          const titleAttr = rawValue.length > 80 ? ` title="${rawValue.replace(/"/g, '&quot;')}"` : '';
          return `<span class="confirm-arg"${titleAttr}><strong>${k}:</strong> ${displayValue}</span>`;
        })
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
  
  // 清理之前的计时器
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (autoTimeoutId) {
    clearTimeout(autoTimeoutId);
    autoTimeoutId = null;
  }
  
  // 启动倒计时
  const totalSeconds = Math.floor(timeout / 1000);
  let remainingSeconds = totalSeconds;
  const countdownEl = document.getElementById('confirmCountdownText');
  const countdownContainer = document.getElementById('confirmCountdown');
  
  if (countdownEl && countdownContainer) {
    countdownContainer.style.display = 'flex';
    countdownEl.textContent = `剩余时间: ${formatCountdown(remainingSeconds)}`;
    
    countdownTimer = setInterval(() => {
      remainingSeconds--;
      if (remainingSeconds <= 0) {
        clearInterval(countdownTimer);
        countdownTimer = null;
        countdownEl.textContent = '剩余时间: 0:00';
        return;
      }
      countdownEl.textContent = `剩余时间: ${formatCountdown(remainingSeconds)}`;
      
      // 最后30秒变红闪烁
      if (remainingSeconds <= 30) {
        countdownContainer.classList.add('warning');
      }
    }, 1000);
  }
  
  overlay.style.display = 'flex';
  
  return new Promise((resolve) => {
    confirmResolve = resolve;
    
    // 自动超时处理：默认拒绝
    autoTimeoutId = setTimeout(() => {
      if (confirmResolve) {
        console.log('[SidePanel] 确认对话框超时，自动拒绝');
        handleConfirmResponse(false, 'single');
      }
    }, timeout);
  });
}

/**
 * 处理用户确认/拒绝
 * @param {boolean} confirmed
 * @param {string} scope - 'single' | 'loop'
 */
function handleConfirmResponse(confirmed, scope = 'single') {
  const overlay = document.getElementById('confirmOverlay');
  if (overlay) {
    overlay.style.display = 'none';
  }
  
  // 清理计时器
  if (countdownTimer) {
    clearInterval(countdownTimer);
    countdownTimer = null;
  }
  if (autoTimeoutId) {
    clearTimeout(autoTimeoutId);
    autoTimeoutId = null;
  }
  
  // 重置倒计时样式
  const countdownContainer = document.getElementById('confirmCountdown');
  if (countdownContainer) {
    countdownContainer.classList.remove('warning');
    countdownContainer.style.display = 'none';
  }
  
  // 发送确认结果回 background
  chrome.runtime.sendMessage({
    type: 'TOOL_CONFIRMATION_RESPONSE',
    toolCallId: state.currentConfirmToolCallId,
    confirmed,
    scope,
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
  const approveOnceBtn = document.getElementById('confirmApproveOnceBtn');
  const approveLoopBtn = document.getElementById('confirmApproveLoopBtn');
  const denyBtn = document.getElementById('confirmDenyBtn');
  
  if (approveOnceBtn) {
    approveOnceBtn.addEventListener('click', () => handleConfirmResponse(true, 'single'));
  }
  if (approveLoopBtn) {
    approveLoopBtn.addEventListener('click', () => handleConfirmResponse(true, 'loop'));
  }
  if (denyBtn) {
    denyBtn.addEventListener('click', () => handleConfirmResponse(false, 'single'));
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