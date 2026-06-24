// clarify-dialog.js - 问题澄清对话框

import state from './state.js';
import { showToast } from './utils.js';

export function formatTimeDisplay(seconds) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export function playNotificationSound(soundType = 'default') {
  try {
    const audioContext = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    // 根据类型设置不同的频率和时长
    const soundConfig = {
      default: { frequency: 800, duration: 0.3 },
      success: { frequency: 523, duration: 0.2 },
      warning: { frequency: 440, duration: 0.4 },
      error: { frequency: 220, duration: 0.5 }
    };
    
    const config = soundConfig[soundType] || soundConfig.default;
    
    oscillator.frequency.value = config.frequency;
    oscillator.type = 'sine';
    
    gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + config.duration);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + config.duration);
    
    console.log('[SidePanel] 提示音已播放:', soundType);
  } catch (error) {
    console.error('[SidePanel] 播放提示音失败:', error.message);
  }
}

export function updateClarifyTimer(remainingSeconds, totalSeconds) {
  const timerElement = document.getElementById('clarifyTimer');
  const timerTextElement = document.getElementById('clarifyTimerText');
  
  if (!timerElement || !timerTextElement) return;
  
  // 更新显示文本
  timerTextElement.textContent = `剩余时间: ${formatTimeDisplay(remainingSeconds)}`;
  
  // 计算剩余百分比
  const percentage = (remainingSeconds / totalSeconds) * 100;
  
  // 根据剩余时间设置样式
  timerElement.classList.remove('warning', 'critical');
  
  if (remainingSeconds <= 10) {
    // 最后 10 秒：紧急状态
    timerElement.classList.add('critical');
    timerTextElement.textContent = `即将超时: ${formatTimeDisplay(remainingSeconds)}`;
  } else if (remainingSeconds <= 30 || percentage <= 15) {
    // 最后 30 秒或 15%：警告状态
    timerElement.classList.add('warning');
  }
  
  // 播放提示音（最后 30 秒时）
  if (remainingSeconds === 30) {
    playNotificationSound('warning');
  }
}

export function startClarifyTimer(timeoutMs) {
  // 清除之前的计时器
  stopClarifyTimer();
  
  state.clarifyTimeoutValue = timeoutMs;
  const totalSeconds = Math.ceil(timeoutMs / 1000);
  let remainingSeconds = totalSeconds;
  
  // 初始化显示
  updateClarifyTimer(remainingSeconds, totalSeconds);
  
  // 每秒更新倒计时
  state.clarifyTimerInterval = setInterval(() => {
    remainingSeconds--;
    if (remainingSeconds <= 0) {
      stopClarifyTimer();
      // 倒计时结束时的处理由 background.js 负责
    } else {
      updateClarifyTimer(remainingSeconds, totalSeconds);
    }
  }, 1000);
}

export function stopClarifyTimer() {
  if (state.clarifyTimerInterval) {
    clearInterval(state.clarifyTimerInterval);
    state.clarifyTimerInterval = null;
  }
}

export function showClarifyDialog(data) {
  console.log('[SidePanel] 显示澄清对话框:', data);
  
  const { question, options, recommendedOption, allowCustomInput = true, allowAdditionalInfo = true, toolCallId, timeout = 180000, sessionId } = data;
  
  // 保存工具调用ID和所属会话ID
  state.currentClarifyToolCallId = toolCallId;
  state.currentClarifySessionId = sessionId || null;
  
  // 查找并显示所属会话名称
  const sessionNameEl = document.getElementById('clarifySessionName');
  if (sessionNameEl) {
    if (sessionId && state.sessions) {
      const session = state.sessions.find(s => s.id === sessionId);
      if (session) {
        sessionNameEl.textContent = `会话: ${session.title}`;
        sessionNameEl.style.display = 'block';
      } else {
        sessionNameEl.textContent = `会话: ${sessionId.substring(0, 8)}...`;
        sessionNameEl.style.display = 'block';
      }
    } else {
      sessionNameEl.textContent = '';
      sessionNameEl.style.display = 'none';
    }
  }
  
  // 使用推荐选项作为默认选中项
  // 如果没有指定推荐选项，默认使用第一个选项
  const finalRecommendedOption = recommendedOption !== undefined && recommendedOption >= 0 ? recommendedOption : 0;
  const finalRecommendedOptions = [finalRecommendedOption];
  const finalDefaultOption = finalRecommendedOption;
  
  // 更新问题显示
  const clarifyQuestion = document.getElementById('clarifyQuestion');
  if (clarifyQuestion) {
    clarifyQuestion.textContent = question;
  }
  
  // 渲染选项列表
  const optionsList = document.getElementById('clarifyOptionsList');
  if (optionsList) {
    // 只移除选项项，保留自定义输入区域
    document.querySelectorAll('.clarify-option-item').forEach(item => {
      item.remove();
    });
    
    options.forEach((option, index) => {
      const isRecommended = finalRecommendedOptions.includes(index);
      const item = document.createElement('div');
      item.className = `clarify-option-item ${finalDefaultOption === index ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`;
      item.dataset.index = index;
      item.innerHTML = `
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${option}${isRecommended ? '<span class="clarify-option-badge">推荐</span>' : ''}</div>
      `;
      item.addEventListener('click', () => selectClarifyOption(index));
      optionsList.appendChild(item);
    });
    
    // 如果允许自定义输入，添加"其他"选项到末尾
    if (allowCustomInput) {
      const otherItem = document.createElement('div');
      otherItem.className = 'clarify-option-item';
      otherItem.dataset.index = -1;
      otherItem.innerHTML = `
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">其他（请自定义输入）</div>
      `;
      otherItem.addEventListener('click', () => selectClarifyOption(-1));
      optionsList.appendChild(otherItem);
      
      // 将自定义输入区域移到"其他"选项之后
      const customInput = document.getElementById('clarifyCustomInput');
      if (customInput) {
        optionsList.appendChild(customInput);
      }
    }
  }
  
  // 初始时隐藏自定义输入区域（选择"其他"选项后才显示）
  const customInput = document.getElementById('clarifyCustomInput');
  if (customInput) {
    customInput.classList.remove('show');
  }
  
  // 显示/隐藏补充信息区域
  const additionalInfo = document.getElementById('clarifyAdditionalInfo');
  if (additionalInfo) {
    additionalInfo.classList.toggle('show', allowAdditionalInfo);
  }
  
  // 清空输入框
  const customTextarea = document.getElementById('clarifyCustomTextarea');
  if (customTextarea) {
    customTextarea.value = '';
  }
  const additionalTextarea = document.getElementById('clarifyAdditionalTextarea');
  if (additionalTextarea) {
    additionalTextarea.value = '';
  }
  
  // 显示对话框
  const overlay = document.getElementById('clarifyOverlay');
  if (overlay) {
    overlay.classList.add('show');
  }
  
  // 启动倒计时
  startClarifyTimer(timeout);
  
  console.log('[SidePanel] 澄清对话框已显示');
}

export function hideClarifyDialog() {
  const overlay = document.getElementById('clarifyOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  state.currentClarifyToolCallId = null;
  state.currentClarifySessionId = null;
  stopClarifyTimer();  // 停止倒计时
  console.log('[SidePanel] 澄清对话框已隐藏');
}

export function selectClarifyOption(index) {
  // 移除所有选中状态
  document.querySelectorAll('.clarify-option-item').forEach(item => {
    item.classList.remove('selected');
  });
  
  // 添加当前选中状态 - 根据 dataset.index 查找对应元素
  const selectedItem = document.querySelector(`.clarify-option-item[data-index="${index}"]`);
  if (selectedItem) {
    selectedItem.classList.add('selected');
  }
  
  // 显示/隐藏自定义输入区域
  const customInput = document.getElementById('clarifyCustomInput');
  if (customInput) {
    if (index === -1) {
      // 选择"其他"，显示自定义输入框
      customInput.classList.add('show');
      // 聚焦到自定义输入框
      const customTextarea = document.getElementById('clarifyCustomTextarea');
      if (customTextarea) {
        customTextarea.focus();
      }
    } else {
      // 选择其他选项，隐藏自定义输入框
      customInput.classList.remove('show');
    }
  }
  
  console.log('[SidePanel] 选择澄清选项:', index);
}

export function sendClarifyResponse() {
  if (!state.currentClarifyToolCallId) {
    console.error('[SidePanel] 没有当前工具调用ID');
    return;
  }
  
  // 获取选中的选项索引
  let selectedOption = -1;
  document.querySelectorAll('.clarify-option-item').forEach((item, index) => {
    if (item.classList.contains('selected')) {
      selectedOption = parseInt(item.dataset.index);
    }
  });
  
  // 获取自定义输入内容
  const customTextarea = document.getElementById('clarifyCustomTextarea');
  const customInput = customTextarea ? customTextarea.value.trim() : '';
  
  // 获取补充信息
  const additionalTextarea = document.getElementById('clarifyAdditionalTextarea');
  const additionalInfo = additionalTextarea ? additionalTextarea.value.trim() : '';
  
  // 构建响应数据
  const responseData = {
    type: 'CLARIFY_RESPONSE',
    toolCallId: state.currentClarifyToolCallId,
    selectedOption,
    customInput,
    additionalInfo
  };
  
  console.log('[SidePanel] 发送澄清响应:', responseData);
  
  // 发送消息到 background.js（不需要回调响应）
  chrome.runtime.sendMessage(responseData);
  
  // 隐藏对话框
  hideClarifyDialog();
}

export function cancelClarify() {
  if (state.currentClarifyToolCallId) {
    // 发送取消响应（不需要回调响应）
    const responseData = {
      type: 'CLARIFY_RESPONSE',
      toolCallId: state.currentClarifyToolCallId,
      selectedOption: -1,
      customInput: '',
      additionalInfo: ''
    };
    
    chrome.runtime.sendMessage(responseData);
  }
  
  hideClarifyDialog();
}

export function initClarifyEvents() {
  // 确认按钮
  const confirmBtn = document.getElementById('clarifyConfirmBtn');
  if (confirmBtn) {
    confirmBtn.addEventListener('click', sendClarifyResponse);
  }
  
  // 取消按钮
  const cancelBtn = document.getElementById('clarifyCancelBtn');
  if (cancelBtn) {
    cancelBtn.addEventListener('click', cancelClarify);
  }
  
  // 不响应遮罩层点击关闭（防止误触导致澄清卡死）
  
  // 监听来自 background.js 的澄清请求
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_CLARIFY_DIALOG') {
      console.log('[SidePanel] 收到澄清请求:', message, '当前激活会话:', state.activeSessionId);
      
      // 澄清弹窗始终显示（因为后台 ReAct 循环被阻塞），通过会话名称区分归属
      showClarifyDialog(message.data);
      sendResponse({ success: true });
    } else if (message.type === 'PLAY_NOTIFICATION_SOUND') {
      console.log('[SidePanel] 收到播放提示音请求:', message);
      playNotificationSound(message.soundType);
      sendResponse({ success: true });
    } else if (message.type === 'CLARIFY_TIMEOUT') {
      console.log('[SidePanel] 收到澄清超时通知:', message);
      
      // 只处理当前显示的澄清会话的超时
      if (message.sessionId && state.currentClarifySessionId && message.sessionId !== state.currentClarifySessionId) {
        console.log('[SidePanel] 澄清超时来自其他会话，忽略');
        return;
      }
      
      // 更新倒计时显示为超时状态
      const timerElement = document.getElementById('clarifyTimer');
      const timerTextElement = document.getElementById('clarifyTimerText');
      if (timerElement && timerTextElement) {
        timerElement.classList.remove('warning');
        timerElement.classList.add('critical');
        timerTextElement.textContent = '已超时';
      }
      playNotificationSound('error');
    }
  });
  
  console.log('[SidePanel] 澄清对话框事件已初始化');
}
