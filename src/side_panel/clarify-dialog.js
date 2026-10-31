// clarify-dialog.js - 问题澄清对话框
//
// 并发澄清队列 + 单模态闸门（与确认弹窗共用 interaction-gate 调度）：
// 1) 旧实现是单槽位：第二条 SHOW_CLARIFY_DIALOG 会就地覆盖 state.currentClarifyToolCallId
//    并重绘同一个 DOM，第一条提问被顶掉且用户在界面上看不到它，只能在后台白等到超时，
//    带着「澄清超时」的错误结果继续 —— 提问丢了、任务也被拖慢。现在逐条排队呈现、各自作答。
// 2) 旧实现与确认弹窗各自直接显示，两者同为 z-index 5000 的全屏遮罩会互相压住（澄清后出现，
//    压住确认），被压住的一方点不到按钮。现在两类弹窗都先向闸门申请呈现权，同一时刻只呈现一个，
//    并在真正呈现的那一刻上报 INTERACTION_DISPLAYED，后台据此才开始超时计时 ——
//    排队而未被看到的澄清不消耗用户时间。

import state from './state.js';
import { showToast } from './utils.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';
import {
  INTERACTION_KIND,
  registerInteractionPresenter,
  requestDisplay,
  releaseDisplay,
  notifyPendingChanged,
  getOtherPendingCount,
  reportInteractionDisplayed,
} from './interaction-gate.js';

const CLARIFY = INTERACTION_KIND.CLARIFY;

registerTranslations('zh', {
  clarify: {
    remainingTimeDynamic: '剩余时间: {time}',
    timeoutSoon: '时间即将耗尽',
    sessionNameTitle: '{title}',
    sessionNameId: '会话 ID: {id}',
    recommended: '推荐',
    otherOption: '其他（自定义输入）',
    timedOut: '已超时',
    timedOutDefaulted: '已超时，已按推荐项「{option}」继续',
    dropped: '澄清弹窗无法显示，已按未澄清继续',
    extend: '延长时间',
    extended: '已延长倒计时',
    extendLimit: '已达延长上限',
  },
});
registerTranslations('en', {
  clarify: {
    remainingTimeDynamic: 'Remaining time: {time}',
    timeoutSoon: 'Time is almost up',
    sessionNameTitle: '{title}',
    sessionNameId: 'Session ID: {id}',
    recommended: 'Recommended',
    otherOption: 'Other (custom input)',
    timedOut: 'Timed out',
    timedOutDefaulted: 'Timed out — continued with the recommended option "{option}"',
    dropped: 'Clarification dialog could not be shown; continuing as unanswered',
    extend: 'Extend time',
    extended: 'Countdown extended',
    extendLimit: 'Extend limit reached',
  },
});

// 待呈现的澄清请求（队头为下一条要显示的）
const clarifyQueue = [];
// 正在呈现的澄清请求（无则为 null）
let visibleClarify = null;

// 延长倒计时：剩余可延长次数（null=尚未由后台告知，按允许处理）、请求在途标志
let clarifyExtendsLeft = null;
let clarifyExtendPending = false;

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
    
    logger.debug('[SidePanel] soundplay:', soundType);
  } catch (error) {
    logger.error('[SidePanel] play sound failed:', error.message);
  }
}

export function updateClarifyTimer(remainingSeconds, totalSeconds) {
  const timerElement = document.getElementById('clarifyTimer');
  const timerTextElement = document.getElementById('clarifyTimerText');
  
  if (!timerElement || !timerTextElement) return;
  
  // 更新显示文本
  timerTextElement.textContent = t('clarify.remainingTimeDynamic', { time: formatTimeDisplay(remainingSeconds) });
  
  // 计算剩余百分比
  const percentage = (remainingSeconds / totalSeconds) * 100;

  // 进度条宽度表达剩余比例
  const barFill = document.getElementById('clarifyTimerBarFill');
  if (barFill) {
    barFill.style.width = `${Math.max(0, Math.min(100, percentage))}%`;
  }
  
  // 根据剩余时间设置样式
  timerElement.classList.remove('warning', 'critical');
  
  if (remainingSeconds <= 10) {
    // 最后 10 秒：紧急状态
    timerElement.classList.add('critical');
    timerTextElement.textContent = t('clarify.timeoutSoon', { time: formatTimeDisplay(remainingSeconds) });
  } else if (remainingSeconds <= 30 || percentage <= 15) {
    // 最后 30 秒或 15%：警告状态
    timerElement.classList.add('warning');
  }

  // 延长按钮：剩余过半（≤50%，兜底 ≤60s）时高亮浮现，给中途离开/需要调研的用户留足缓冲
  const extendBtn = document.getElementById('clarifyExtendBtn');
  if (extendBtn) {
    extendBtn.classList.toggle('show', remainingSeconds <= 60 || percentage <= 50);
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
      // 到点本身不在面板侧下结论（结算权在后台，由下行 CLARIFY_TIMEOUT 收敛）；
      // 这里重发一次呈现回执，兜住"回执丢失 → 后台没起计时 → 提问永远挂着"：
      // 后台已起计时时会被幂等守卫忽略，不会有副作用
      if (visibleClarify) reportInteractionDisplayed(CLARIFY, visibleClarify);
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

/** 按剩余可延长次数与在途标志刷新延长按钮的禁用/文案 */
function refreshExtendBtnState() {
  const extendBtn = document.getElementById('clarifyExtendBtn');
  if (!extendBtn) return;
  const exhausted = clarifyExtendsLeft === 0;
  extendBtn.disabled = exhausted || clarifyExtendPending;
  extendBtn.textContent = exhausted ? t('clarify.extendLimit') : t('clarify.extend');
}

/** 用户点击“延长时间”：上行一条 CLARIFY_EXTEND，由后台重置权威计时器并回 CLARIFY_EXTENDED */
export function requestClarifyExtend() {
  if (!visibleClarify || clarifyExtendPending) return;
  if (clarifyExtendsLeft === 0) return;
  clarifyExtendPending = true;
  refreshExtendBtnState();
  Promise.resolve(chrome.runtime.sendMessage({
    type: 'CLARIFY_EXTEND',
    toolCallId: visibleClarify.toolCallId,
    sessionId: visibleClarify.sessionId,
  })).catch((err) => {
    logger.debug('[SidePanel] send clarify extend failed:', err?.message);
  });
  // 回执丢失兜底：3s 后若仍无回音，解除在途锁让用户可重试（后台仍以自身上限为准）
  setTimeout(() => {
    if (clarifyExtendPending) {
      clarifyExtendPending = false;
      refreshExtendBtnState();
    }
  }, 3000);
}

/**
 * 处理后台延长回执（port 定向与广播两条通道共用）：
 * 按 toolCallId 精确匹配当前可见条，重启镜像倒计时并刷新按钮次数。
 * @param {Object} message - { toolCallId, remainingMs, extendsLeft, denied }
 */
export function handleClarifyExtended(message) {
  const toolCallId = message?.toolCallId;
  if (!visibleClarify || visibleClarify.toolCallId !== toolCallId) return;
  clarifyExtendPending = false;
  if (message.denied || typeof message.remainingMs !== 'number') {
    clarifyExtendsLeft = 0;
    refreshExtendBtnState();
    showToast(t('clarify.extendLimit'), 'warning');
    return;
  }
  clarifyExtendsLeft = typeof message.extendsLeft === 'number' ? message.extendsLeft : clarifyExtendsLeft;
  // 以后台权威的新窗口重启倒计时（与后台 armCountdown 同值）
  startClarifyTimer(message.remainingMs);
  refreshExtendBtnState();
  showToast(t('clarify.extended'), 'success');
  logger.debug('[SidePanel] clarify extended, remainingMs:', message.remainingMs, 'left:', clarifyExtendsLeft);
}

/**
 * 组装问题文案：本条问题 + 自己后面还排几条 + 另一类被闸门挡住几条
 * @param {Object} item
 * @returns {string}
 */
function buildClarifyQuestion(item) {
  const mine = clarifyQueue.length;
  const others = getOtherPendingCount(CLARIFY);
  let text = item.question || '';
  if (mine > 0) text += ` ${t('dialog.pendingQueueClarify', { count: mine })}`;
  if (others > 0) text += ` ${t('dialog.otherPending', { count: others })}`;
  return text;
}

/** 刷新当前弹窗上的排队提示（队列长度变化后调用） */
function refreshClarifyHint() {
  if (!visibleClarify) return;
  const questionEl = document.getElementById('clarifyQuestion');
  if (questionEl) {
    questionEl.textContent = buildClarifyQuestion(visibleClarify);
  }
}

/**
 * 渲染一条澄清请求到 DOM 并启动倒计时
 * @param {Object} item - { question, options, recommendedOption, allowCustomInput, allowAdditionalInfo, toolCallId, timeout, sessionId }
 * @returns {boolean} 是否渲染成功（DOM 缺失时返回 false）
 */
function renderActiveClarify(item) {
  const {
    question,
    recommendedOption,
    allowCustomInput = true,
    allowAdditionalInfo = true,
    timeout = 300000,
    sessionId,
  } = item;

  const overlay = document.getElementById('clarifyOverlay');
  if (!overlay) return false;

  // 确保 options 是数组，防止 LLM 返回非数组类型导致 forEach 报错
  const options = Array.isArray(item.options) ? item.options : (item.options ? [String(item.options)] : []);

  // 保存当前呈现的澄清关联 ID 与所属会话 ID（供回发响应、以及外部读取）
  state.currentClarifyToolCallId = item.toolCallId;
  state.currentClarifySessionId = sessionId || null;

  // 查找并显示所属会话名称
  const sessionNameEl = document.getElementById('clarifySessionName');
  if (sessionNameEl) {
    if (sessionId && state.sessions) {
      const session = state.sessions.find(s => s.id === sessionId);
      if (session) {
        sessionNameEl.textContent = t('clarify.sessionNameTitle', { title: session.title });
        // 会话名在标题下方另起一行（block）；过长时单行省略，靠 title 悬浮看全名
        sessionNameEl.style.display = 'block';
        sessionNameEl.title = session.title || '';
      } else {
        sessionNameEl.textContent = t('clarify.sessionNameId', { id: sessionId.substring(0, 8) });
        sessionNameEl.style.display = 'block';
        sessionNameEl.title = sessionId;
      }
    } else {
      sessionNameEl.textContent = '';
      sessionNameEl.title = '';
      sessionNameEl.style.display = 'none';
    }
  }

  // 使用推荐选项作为默认选中项
  // 如果没有指定推荐选项，默认使用第一个选项
  const finalRecommendedOption = recommendedOption !== undefined && recommendedOption >= 0 ? recommendedOption : 0;
  const finalRecommendedOptions = [finalRecommendedOption];
  const finalDefaultOption = finalRecommendedOption;

  // 更新问题显示（含排队提示：并行子任务可能同时提出多个澄清）
  const clarifyQuestion = document.getElementById('clarifyQuestion');
  if (clarifyQuestion) {
    clarifyQuestion.textContent = buildClarifyQuestion(item);
  }

  // 渲染选项列表
  const optionsList = document.getElementById('clarifyOptionsList');
  if (optionsList) {
    // 只移除选项项，保留自定义输入区域
    document.querySelectorAll('.clarify-option-item').forEach(old => {
      old.remove();
    });
    
    options.forEach((option, index) => {
      const isRecommended = finalRecommendedOptions.includes(index);
      const el = document.createElement('div');
      el.className = `clarify-option-item ${finalDefaultOption === index ? 'selected' : ''} ${isRecommended ? 'recommended' : ''}`;
      el.dataset.index = index;
      el.setAttribute('role', 'radio');
      el.setAttribute('aria-checked', finalDefaultOption === index ? 'true' : 'false');
      el.setAttribute('tabindex', finalDefaultOption === index ? '0' : '-1');
      el.innerHTML = `
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content">${option}${isRecommended ? `<span class="clarify-option-badge">${t('clarify.recommended')}</span>` : ''}</div>
      `;
      el.addEventListener('click', () => selectClarifyOption(index));
      optionsList.appendChild(el);
    });
    
    // 如果允许自定义输入，添加"其他"选项到末尾
    if (allowCustomInput) {
      const otherItem = document.createElement('div');
      otherItem.className = 'clarify-option-item';
      otherItem.dataset.index = -1;
      otherItem.setAttribute('role', 'radio');
      otherItem.setAttribute('aria-checked', 'false');
      otherItem.setAttribute('tabindex', '-1');
      otherItem.innerHTML = `
        <div class="clarify-option-radio"></div>
        <div class="clarify-option-content clarify-option-other">${t('clarify.otherOption')}</div>
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

  // 清空输入框（避免沿用上一条澄清的作答内容）
  const customTextarea = document.getElementById('clarifyCustomTextarea');
  if (customTextarea) {
    customTextarea.value = '';
  }
  const additionalTextarea = document.getElementById('clarifyAdditionalTextarea');
  if (additionalTextarea) {
    additionalTextarea.value = '';
  }

  // 显示对话框
  overlay.classList.add('show');

  // 新一条从顶部开始呈现：重置中间滚动区，并清掉上一条遗留的 Header 滚动阴影
  const clarifyContent = document.querySelector('#clarifyContainer .clarify-content');
  const clarifyHeader = document.querySelector('#clarifyContainer .clarify-header');
  if (clarifyContent) clarifyContent.scrollTop = 0;
  if (clarifyHeader) clarifyHeader.classList.remove('scrolled');

  // 新一条重置延长额度：后台每条澄清各自计数，面板不得沿用上一条的禁用态
  clarifyExtendsLeft = null;
  clarifyExtendPending = false;
  refreshExtendBtnState();

  // 启动倒计时（与后台计时同起点：两者都以"本条真正呈现"为准）
  startClarifyTimer(timeout);

  logger.debug('[SidePanel] clarification dialogshown:', item.toolCallId, question);
  return true;
}

/**
 * 闸门授权后的呈现：呈现队头，已在呈现则保持，无内容则返回 false（交还闸门）
 * @returns {boolean}
 */
function presentClarify() {
  if (visibleClarify) return true;
  if (clarifyQueue.length === 0) return false;

  const item = clarifyQueue.shift();

  if (!renderActiveClarify(item)) {
    // DOM 缺失：不能只等着后台超时（后台在等呈现回执，不会起计时），
    // 按"未澄清"回发一条响应让这一条确定性地结算，任务不悬挂
    logger.error('[SidePanel] clarify overlay missing, settle as unanswered:', item.toolCallId);
    settleAsUnanswered(item);
    showToast(t('clarify.dropped'), 'warning');
    return false;
  }

  visibleClarify = item;
  // 上报呈现回执：后台此刻才开始倒计时
  reportInteractionDisplayed(CLARIFY, item);
  return true;
}

/** 回发一条"未作答"的澄清响应，让后台按未澄清立即结算（不改动后台的关联判定） */
function settleAsUnanswered(item) {
  Promise.resolve(chrome.runtime.sendMessage({
    type: 'CLARIFY_RESPONSE',
    toolCallId: item.toolCallId,
    selectedOption: -1,
    customInput: '',
    additionalInfo: '',
  })).catch(err => {
    logger.debug('[SidePanel] send unanswered clarify response failed:', err?.message);
  });
}

/** 当前项结算后推进：还有排队项就再次申请呈现，队列空则关闭并交还闸门 */
function advanceClarifyDisplay() {
  if (clarifyQueue.length > 0) {
    requestDisplay(CLARIFY);
    return;
  }
  hideOverlayAndState();
  releaseDisplay(CLARIFY);
}

/** 关闭弹层并清空面板侧当前态 */
function hideOverlayAndState() {
  const overlay = document.getElementById('clarifyOverlay');
  if (overlay) {
    overlay.classList.remove('show');
  }
  state.currentClarifyToolCallId = null;
  state.currentClarifySessionId = null;
  stopClarifyTimer();  // 停止倒计时
}

/** 结算正在呈现的那一条并推进队列 */
function settleClarifyVisible() {
  visibleClarify = null;
  advanceClarifyDisplay();
}

/**
 * 是否同一条澄清请求的重复投递（port 与广播两条通道各送一次）。
 * 只比关联 ID 不够：并行调用可能共用一个 id，那样会把另一条真实澄清吞掉。
 * @param {Object} a
 * @param {Object} b
 * @returns {boolean}
 */
function isSameClarifyRequest(a, b) {
  return !!a.toolCallId
    && a.toolCallId === b.toolCallId
    && (a.sessionId || null) === (b.sessionId || null)
    && a.question === b.question;
}

/**
 * 显示问题澄清对话框（并发请求自动排队，不互相覆盖，也不遮挡其他弹窗）
 * @param {Object} data - { question, options, recommendedOption, allowCustomInput, allowAdditionalInfo, toolCallId, timeout, sessionId }
 */
export function showClarifyDialog(data) {
  const item = { ...data, sessionId: data.sessionId || null };

  logger.debug('[SidePanel] showclarification dialog:', item.toolCallId, data);

  // 去重：同一条请求可能经 port 与广播两条通道重复投递（见 isSameClarifyRequest）
  if (visibleClarify && isSameClarifyRequest(visibleClarify, item)) {
    logger.debug('[SidePanel] duplicate clarify request, ignored:', item.toolCallId);
    return;
  }
  if (clarifyQueue.some((q) => isSameClarifyRequest(q, item))) {
    logger.debug('[SidePanel] queued duplicate clarify, ignored:', item.toolCallId);
    return;
  }

  clarifyQueue.push(item);
  // 向闸门申请呈现：空闲（或本就持有）时立即呈现队头，否则排队等待交接
  requestDisplay(CLARIFY);
  // 排队条数变化：自己持有闸门时刷新自己的提示，被确认挡住时由确认代为刷新
  refreshClarifyHint();
  notifyPendingChanged(CLARIFY);
}

export function hideClarifyDialog() {
  // 保留对外语义：关闭当前澄清并推进队列（被后台撤销/超时的路径也走这里）
  if (visibleClarify) {
    settleClarifyVisible();
    return;
  }
  hideOverlayAndState();
}

export function selectClarifyOption(index) {
  // 移除所有选中状态
  document.querySelectorAll('.clarify-option-item').forEach(item => {
    item.classList.remove('selected');
    item.setAttribute('aria-checked', 'false');
    item.setAttribute('tabindex', '-1');
  });
  
  // 添加当前选中状态 - 根据 dataset.index 查找对应元素
  const selectedItem = document.querySelector(`.clarify-option-item[data-index="${index}"]`);
  if (selectedItem) {
    selectedItem.classList.add('selected');
    selectedItem.setAttribute('aria-checked', 'true');
    selectedItem.setAttribute('tabindex', '0');
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
  
  logger.debug('[SidePanel] selectclarificationselect :', index);
}

/**
 * 提交当前正在呈现的这一条澄清（排队中的其他条不受影响）
 */
export function sendClarifyResponse() {
  // 没有正在呈现的澄清：忽略陈旧点击（例如已被后台超时撤销）
  if (!visibleClarify) {
    logger.error('[SidePanel] no  has currenttool callID');
    return;
  }

  const respondedToolCallId = visibleClarify.toolCallId;
  const respondedSessionId = visibleClarify.sessionId;

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
  
  // 构建响应数据：必须带回本条的关联 ID，后台据此只结算这一条
  const responseData = {
    type: 'CLARIFY_RESPONSE',
    toolCallId: respondedToolCallId,
    sessionId: respondedSessionId,
    selectedOption,
    customInput,
    additionalInfo,
  };
  
  logger.debug('[SidePanel] send clarificationresponse:', responseData);
  
  // 发送消息到 background.js（不需要回调响应）
  chrome.runtime.sendMessage(responseData);
  
  // 关闭当前条并按需呈现下一条
  settleClarifyVisible();
}

export function cancelClarify() {
  if (visibleClarify) {
    // 发送取消响应（不需要回调响应）
    const responseData = {
      type: 'CLARIFY_RESPONSE',
      toolCallId: visibleClarify.toolCallId,
      sessionId: visibleClarify.sessionId,
      selectedOption: -1,
      customInput: '',
      additionalInfo: ''
    };
    
    chrome.runtime.sendMessage(responseData);
  }
  
  hideClarifyDialog();
}

/**
 * 处理澄清超时/撤销通知（runtime 广播消息与 keepalive port 定向消息共用）
 *
 * 后台已自行结算这一条，面板不得再回发 CLARIFY_RESPONSE。
 * 关联一律按 toolCallId 精确匹配：只比会话会让并行子任务的超时把
 * "已超时"状态误刷到正在显示的另一条澄清上。
 * @param {Object} message - { toolCallId, sessionId }
 */
export function handleClarifyTimeout(message) {
  logger.debug('[SidePanel] received clarificationtimeoutnotification:', message);

  const toolCallId = message?.toolCallId;

  // 兼容不带 toolCallId 的旧消息：退回按会话过滤，避免误响其他会话
  if (!toolCallId) {
    if (message?.sessionId && state.currentClarifySessionId && message.sessionId !== state.currentClarifySessionId) {
      logger.debug('[SidePanel] clarificationtimeoutfrom othersession,ignore');
      return;
    }
    if (!visibleClarify) return;
    settleAfterTimeout(message?.defaultOption || null);
    return;
  }

  if (visibleClarify && visibleClarify.toolCallId === toolCallId) {
    settleAfterTimeout(message?.defaultOption || null);
    return;
  }

  // 排队中的条目：直接从队列移除并刷新提示，避免轮到它时弹出一条已经死掉的提问
  const idx = clarifyQueue.findIndex((q) => q.toolCallId === toolCallId);
  if (idx >= 0) {
    logger.debug('[SidePanel] drop queued clarify (already settled by background):', toolCallId);
    clarifyQueue.splice(idx, 1);
    refreshClarifyHint();
    notifyPendingChanged(CLARIFY);
  }
}

/** 后台判定超时/面板关闭后的本地收尾
 * @param {string|null} defaultOption - 后台实际采用的口径选项（超时代选时有值，面板被关掉时为 null）
 */
function settleAfterTimeout(defaultOption = null) {
  const question = visibleClarify?.question;
  settleClarifyVisible();
  // 旧行为是把弹窗留在原地显示"已超时"，队列化后必须推进到下一条，
  // 因此改用 toast 告知用户这一条为什么消失了；超时代选时必须说出「替你选了哪一项」，
  // 否则用户回来只看到一个已经消失的提问，不知道模型据此做了什么。
  showToast(
    defaultOption
      ? t('clarify.timedOutDefaulted', { option: defaultOption })
      : `${t('clarify.timedOut')}${question ? `：${question}` : ''}`,
    'warning'
  );
  playNotificationSound('error');
}

// 注册呈现器到单模态闸门：模块加载即注册，保证任何投递路径都走同一调度
registerInteractionPresenter(CLARIFY, {
  present: presentClarify,
  // 未呈现的条数：供确认弹窗告知用户「还有 N 条其他请求在排队」
  pendingCount: () => clarifyQueue.length,
  refresh: refreshClarifyHint,
});

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

  // 延长时间按钮
  const extendBtn = document.getElementById('clarifyExtendBtn');
  if (extendBtn) {
    extendBtn.addEventListener('click', requestClarifyExtend);
  }
  
  // 不响应遮罩层点击关闭（防止误触导致澄清卡死）

  // Header 滚动阴影：中间内容区真正滚动时，固定 Header 底部浮现阴影
  const clarifyContent = document.querySelector('#clarifyContainer .clarify-content');
  const clarifyHeader = document.querySelector('#clarifyContainer .clarify-header');
  if (clarifyContent && clarifyHeader) {
    clarifyContent.addEventListener('scroll', () => {
      clarifyHeader.classList.toggle('scrolled', clarifyContent.scrollTop > 2);
    });
  }
  
  // 监听来自 background.js 的澄清请求
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'SHOW_CLARIFY_DIALOG') {
      logger.debug('[SidePanel] received clarificationrequested :', message, 'currently activesession:', state.activeSessionId);
      
      // 澄清弹窗经由闸门排队呈现：后台 ReAct 循环被阻塞，但同一时刻只呈现一个模态
      showClarifyDialog(message.data);
      sendResponse({ success: true });
    } else if (message.type === 'PLAY_NOTIFICATION_SOUND') {
      logger.debug('[SidePanel] recei to play soundrequested :', message);
      playNotificationSound(message.soundType);
      sendResponse({ success: true });
    } else if (message.type === 'CLARIFY_TIMEOUT') {
      handleClarifyTimeout(message);
    } else if (message.type === 'CLARIFY_EXTENDED') {
      handleClarifyExtended(message);
    }
  });
  
  logger.debug('[SidePanel] clarification dialogeventinitializing');
}
