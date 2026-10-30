// side_panel/chat-resume.js - 任务恢复（resume）相关函数
// 从 chat-manager.js 拆分，包含 showResumeDialog / _clearResumableFlagsForSession /
// _verifyCheckpointAndHideButton / _checkForAbandonedCheckpoint / resumeTask

import state from './state.js';
import { formatDuration } from './utils.js';
import { renderMessageMermaid } from './markdown-render.js';
import { appendMessageToSession, markSessionCompleted } from './session-manager.js';
import { notifyGenerationEnded } from './generation-lifecycle.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  chatResume: {
    title: '继续执行任务',
    desc: '任务执行被中断，你可以提供补充说明帮助模型继续。',
    budgetTitle: '执行预算已用完（部分完成）',
    budgetDesc: '任务已到时间/轮数预算上限，以上回复是已完成部分与缺项清单。点击继续将在新的预算下接着未完成部分执行，可先补充说明调整目标。',
    placeholder: '输入补充说明（可选）…',
    continueBtn: '继续',
    interruptedAgo: '（{duration}前）',
    taskInterrupted: '任务执行被中断{elapsed}',
    checkpointNotFound: '检查点已失效，无法继续执行。请重新发送任务。',
    taskCancelled: '任务已被用户停止',
    swRestarted: 'Service Worker 已重启，请重新发送任务',
    resumeFailed: '恢复失败：{message}',
    unknownError: '未知错误',
  },
});
registerTranslations('en', {
  chatResume: {
    title: 'Continue Task',
    desc: 'The task was interrupted. You can provide additional guidance to help the model continue.',
    budgetTitle: 'Execution budget exhausted (partially complete)',
    budgetDesc: 'The task hit its time/round budget. The reply above lists what is completed and what remains. Press Continue to resume the unfinished parts with a fresh budget; you may add guidance first.',
    placeholder: 'Enter additional guidance (optional)…',
    continueBtn: 'Continue',
    interruptedAgo: ' ({duration} ago)',
    taskInterrupted: 'Task execution was interrupted{elapsed}',
    checkpointNotFound: 'The checkpoint has expired and the task cannot be resumed. Please resend the task.',
    taskCancelled: 'Task was stopped by user',
    swRestarted: 'Service Worker restarted. Please resend the task.',
    resumeFailed: 'Resume failed: {message}',
    unknownError: 'Unknown error',
  },
});

// 从 chat-manager.js 导入核心函数（依赖注入方向：chat-manager → chat-resume）
import {
  addMessage,
  addLoadingMessage,
  removeLoadingMessage,
  callApi,
  saveChatHistory,
} from './chat-manager.js';

/**
 * 显示"继续执行任务"对话框，返回用户输入的指导文本
 * @returns {Promise<string|null>} 用户输入的文本（留空时为 ''），取消时为 null
 */
export function showResumeDialog(options = {}) {
  return new Promise((resolve) => {
    // 构建弹窗 DOM
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay resume-dialog-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:var(--scrim);z-index:10000;align-items:center;justify-content:center;';

    const container = document.createElement('div');
    container.className = 'modal-container resume-dialog-container';
    container.style.cssText = 'background:var(--bg-surface);border-radius:8px;padding:24px;width:90%;max-width:480px;box-shadow:0 8px 32px var(--shadow-md);';

    const title = document.createElement('h3');
    title.textContent = t(options.budgetEnded ? 'chatResume.budgetTitle' : 'chatResume.title');
    title.style.cssText = 'margin:0 0 8px 0;font-size:16px;color:var(--text-primary);';

    const desc = document.createElement('p');
    desc.textContent = t(options.budgetEnded ? 'chatResume.budgetDesc' : 'chatResume.desc');
    desc.style.cssText = 'margin:0 0 16px 0;font-size:13px;color:var(--text-secondary);line-height:1.5;';

    const textarea = document.createElement('textarea');
    textarea.className = 'resume-dialog-textarea';
    textarea.placeholder = t('chatResume.placeholder');
    textarea.style.cssText = 'width:100%;min-height:80px;padding:8px 12px;border:1px solid var(--border-default);border-radius:4px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5;';
    textarea.rows = 3;

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = t('common.cancel');
    cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid var(--border-default);background:var(--bg-surface);color:var(--text-secondary);border-radius:4px;cursor:pointer;font-size:13px;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = t('chatResume.continueBtn');
    confirmBtn.style.cssText = 'padding:6px 16px;border:none;background:var(--info-500);color:var(--text-inverse);border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;';

    btnContainer.appendChild(cancelBtn);
    btnContainer.appendChild(confirmBtn);
    container.appendChild(title);
    container.appendChild(desc);
    container.appendChild(textarea);
    container.appendChild(btnContainer);
    overlay.appendChild(container);
    document.body.appendChild(overlay);

    // 自动聚焦
    requestAnimationFrame(() => textarea.focus());

    const cleanup = () => {
      overlay.remove();
      document.removeEventListener('keydown', onKeydown);
    };

    const onKeydown = (e) => {
      if (e.key === 'Escape') {
        cleanup();
        resolve(null);
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        cleanup();
        resolve(textarea.value.trim());
      }
    };

    cancelBtn.addEventListener('click', () => { cleanup(); resolve(null); });
    confirmBtn.addEventListener('click', () => { cleanup(); resolve(textarea.value.trim()); });
    // 不允许点击遮罩层关闭（遵循 no-native-dialogs 规则）
    document.addEventListener('keydown', onKeydown);
  });
}

/**
 * 清除指定会话中所有消息的 resumable 标记
 * 当 checkpoint 不存在时调用，移除所有"继续执行"按钮，避免用户反复点击无效按钮
 * 同时更新 messageHistory 和 DOM
 */
export function _clearResumableFlagsForSession(sessionId) {
  if (!sessionId) return;
  // state.messageHistory 与 DOM 永远只代表「当前激活会话」：传入的却是任意会话时
  // （跨会话队列派发、续跑期间用户切走），无条件清理抹掉的是用户正看着的那个会话的
  // 续跑入口，还会随 saveChatHistory 落盘成永久丢失。非激活会话的陈旧标记交给
  // _verifyCheckpointAndHideButton 在恢复渲染时按 checkpoint 实况自愈。
  if (sessionId !== state.activeSessionId) return;
  let changed = false;
  // 清除 messageHistory 中的 resumable 标记
  for (const msg of state.messageHistory) {
    if (msg.resumable) {
      msg.resumable = false;
      changed = true;
    }
  }
  // 清除 DOM 中的"继续执行"按钮
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer) {
    // 不能只匹配 "true"：预算软着陆的标记是 'budget'（见 _mountResumeButton），
    // 漏掉它会留下点不动的陈旧按钮（现场已被新的 checkpoint 取代）
    const resumableEls = chatContainer.querySelectorAll('.message[data-resumable]:not([data-resumable="false"])');
    resumableEls.forEach(el => {
      el.removeAttribute('data-resumable');
      const btn = el.querySelector('.resume-task-btn');
      if (btn) btn.remove();
    });
  }
  if (changed) {
    saveChatHistory();
  }
}

/**
 * 异步验证 checkpoint 是否存在，不存在则隐藏"继续执行"按钮
 * 在 addMessage / restoreMessageFromHtml 渲染带 resumable 标记的消息后调用
 */
export async function _verifyCheckpointAndHideButton(messageDiv, sessionId) {
  if (!messageDiv || !sessionId) return;
  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_CHECKPOINT', sessionId });
    if (!resp?.exists) {
      // checkpoint 不存在：移除按钮和标记
      messageDiv.removeAttribute('data-resumable');
      const btn = messageDiv.querySelector('.resume-task-btn');
      if (btn) btn.remove();
      // 同步更新 messageHistory
      const messageId = messageDiv.dataset.messageId;
      const msg = state.messageHistory.find(m => m.messageId === messageId);
      if (msg && msg.resumable) {
        msg.resumable = false;
        saveChatHistory();
      }
    }
  } catch (e) {
    // 通信失败时保持按钮可见（乐观策略）
  }
}

/**
 * 给已渲染的消息挂上「继续执行」按钮（addMessage / 流式收尾 / 续跑收尾共用）
 *
 * 流式回复不会走 addMessage（元素由 chat-streaming 的 finalizeStreamingMessage 收尾），
 * 所以「标记了 resumable 却没有按钮」是必然结果：用户当场看不到续跑入口，必须先切会话
 * 或刷新（走 restoreMessageFromHtml）才出现。此处统一挂载，两条渲染路径行为一致。
 *
 * @param {HTMLElement|null} messageDiv 已带 .message-footer 的消息根元素
 * @param {boolean|string} resumable  true / 'budget'
 * @returns {HTMLButtonElement|null}
 */
export function _mountResumeButton(messageDiv, resumable) {
  if (!messageDiv || !resumable) return null;
  const footer = messageDiv.querySelector(':scope > .message-footer');
  if (!footer) return null;
  const existing = footer.querySelector('.resume-task-btn');
  if (existing) return existing;  // 幂等：重复调用不会挂第二个按钮

  const budgetSemantics = resumable === 'budget';
  const resumeBtn = document.createElement('button');
  resumeBtn.className = 'resume-task-btn';
  resumeBtn.type = 'button';
  resumeBtn.title = t(budgetSemantics ? 'chatMsg.resumeTaskTitleBudget' : 'chatMsg.resumeTaskTitle');
  resumeBtn.innerHTML = `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <polygon points="5 3 19 12 5 21 5 3"></polygon>
    </svg>
    <span>${t('chatMsg.resumeTaskBtn')}</span>
  `;
  resumeBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (resumeBtn.disabled) return;
    // 先弹出对话框，让用户可选地追加任务描述（预算软着陆终态使用专属文案）
    const guidance = await showResumeDialog({ budgetEnded: budgetSemantics });
    if (guidance === null) return;  // 用户取消
    resumeBtn.disabled = true;
    resumeBtn.style.opacity = '0.6';
    resumeBtn.style.cursor = 'not-allowed';
    resumeTask(state.activeSessionId, guidance).finally(() => {
      resumeBtn.disabled = false;
      resumeBtn.style.opacity = '';
      resumeBtn.style.cursor = '';
    });
  });
  footer.appendChild(resumeBtn);
  // 在 messageDiv 上标记，便于恢复时识别（'budget' 与 'true' 都表示可续跑）
  messageDiv.dataset.resumable = String(resumable);
  // 异步验证 checkpoint 是否存在，不存在则隐藏按钮（避免刷新后按钮失效）
  _verifyCheckpointAndHideButton(messageDiv, state.activeSessionId);
  return resumeBtn;
}

/**
 * 检查是否存在被遗弃的 checkpoint（页面关闭/刷新导致任务中断，没有创建恢复入口卡片）
 * 如果存在且 messageHistory 中没有 resumable 标记的消息，自动添加恢复提示卡片
 */
export async function _checkForAbandonedCheckpoint() {
  const sessionId = state.activeSessionId;
  if (!sessionId) return;

  // 如果该会话有正在执行的后台任务（pendingCallApiSessionIds 包含该会话 ID），
  // 说明任务仍在运行中，checkpoint 存在是正常的（ReAct 循环定期保存），
  // 不应显示"任务中断"卡片
  if (state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.has(sessionId)) {
    return;
  }

  // 检查 messageHistory 中是否已经有带 resumable: true 的消息（避免重复添加）
  const hasResumableMessage = state.messageHistory.some(msg => msg.resumable);

  // 检查 DOM 中是否有"继续执行"按钮
  // 会话切换时可能用旧缓存恢复，缓存中可能没有按钮（因为按钮是异步添加的）
  const chatContainer = document.getElementById('chatContainer');
  const hasResumeBtnInDOM = chatContainer && chatContainer.querySelector('.resume-task-btn');

  // 如果 messageHistory 中已有 resumable 消息且 DOM 中已有按钮，无需重复添加
  if (hasResumableMessage && hasResumeBtnInDOM) {
    return;
  }

  try {
    const resp = await chrome.runtime.sendMessage({ type: 'GET_CHECKPOINT', sessionId });
    if (resp?.exists) {
      logger.debug('[SidePanel] found abandoned  checkpoint,auto addrestorehint card');

      // 清除该会话的 DOM 缓存，确保下次切换会话时走全量重建路径
      // 避免缓存中包含不完整的恢复卡片（没有按钮）导致重复
      document.dispatchEvent(new CustomEvent('session-cache-invalidate', {
        detail: { sessionId }
      }));

      const checkpoint = resp.checkpoint;
      const duration = checkpoint.updatedAt ? formatDuration(Date.now() - checkpoint.updatedAt) : '';
      const elapsedText = duration ? t('chatResume.interruptedAgo', { duration }) : '';

      const content = t('chatResume.taskInterrupted', { elapsed: elapsedText });

      // 如果 messageHistory 中已有 resumable 消息但 DOM 中没有按钮，更新消息内容并重新渲染
      if (hasResumableMessage) {
        const resumableMsg = state.messageHistory.find(msg => msg.resumable);
        if (resumableMsg) {
          resumableMsg.content = content;
          saveChatHistory();
        }
        // 移除旧的 resumable 消息元素（用多种方式查找）
        if (chatContainer) {
          let oldResumableEl = chatContainer.querySelector('.message[data-resumable]:not([data-resumable="false"])');
          if (!oldResumableEl) {
            const messages = chatContainer.querySelectorAll('.message.assistant');
            for (const msgEl of messages) {
              const textContent = msgEl.textContent || '';
              if (textContent.includes('任务执行被中断')) {
                oldResumableEl = msgEl;
                break;
              }
            }
          }
          if (oldResumableEl) {
            oldResumableEl.remove();
          }
        }
      }

      const { element: messageDiv, messageId } = addMessage('assistant', content, true, [], null, false, null, null, [], true);

      // 如果之前没有 resumable 消息，添加到 messageHistory
      if (!hasResumableMessage) {
        state.messageHistory.push({
          role: 'assistant',
          content,
          executionLog: [],
          messageId,
          resumable: true,
          interrupted: true,
        });
        saveChatHistory();
      }

      _verifyCheckpointAndHideButton(messageDiv, sessionId);
    }
  } catch (e) {
    logger.warn('[SidePanel] check abandoned  checkpoint failed:', e.message);
  }
}

/**
 * 从 checkpoint 恢复中断的 ReAct 任务
 * 不会向 messageHistory 添加新的 user 消息，仅触发后台 RESUME_REACT
 * 成功/失败后像 sendMessage 一样添加 assistant 消息
 *
 * 实现说明：复用 callApi 的流式输出基础设施（STREAM_START/STREAM_CHUNK/STREAM_DONE/API_COMPLETE），
 * 通过 options.resumeFromCheckpoint 切换 callApi 内部的消息发送类型（CALL_API → RESUME_REACT），
 * 避免重复维护两套流式监听逻辑。
 *
 * @param {string} sessionId - 要恢复的会话 ID
 * @param {string} [userGuidance=''] - 用户追加的任务描述（可选）
 * @returns {Promise<boolean>} 是否成功完成
 */
export async function resumeTask(sessionId, userGuidance = '') {
  if (!sessionId) {
    logger.warn('[SidePanel] resumeTask: missing sessionId');
    return false;
  }

  // 如果当前活跃会话不是要恢复的会话，先切换
  if (state.activeSessionId !== sessionId) {
    logger.warn('[SidePanel] resumeTask: currently activesessionwith targetsession not consistent,please switch firstto targetsession');
    return false;
  }

  // 如果已有进行中的 API 调用，拒绝恢复
  if (state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.has(sessionId)) {
    logger.warn('[SidePanel] resumeTask: currentsession has ongoingtask');
    return false;
  }

  logger.debug('[SidePanel] resumeTask: startrestoretask, sessionId:', sessionId, 'userGuidance:', userGuidance ? `"${userGuidance.substring(0, 50)}..."` : '( no )');

  // 前置检查：验证 checkpoint 是否存在，避免无效的恢复请求
  // 如果 checkpoint 不存在（已过期/被清理/从未保存），直接给出友好提示，不发送 RESUME_REACT
  try {
    const checkpointResp = await chrome.runtime.sendMessage({ type: 'GET_CHECKPOINT', sessionId });
    if (!checkpointResp?.exists) {
      logger.warn('[SidePanel] resumeTask: checkpoint not found, no way to restore, sessionId:', sessionId);
      const errorContent = t('chatResume.checkpointNotFound');
      const { messageId } = addMessage('assistant', errorContent, true, []);
      state.messageHistory.push({ role: 'assistant', content: errorContent, executionLog: [], messageId, resumable: false, resumed: true });
      saveChatHistory();
      // 同步清除原消息的 resumable 标记，避免用户反复点击无效按钮
      _clearResumableFlagsForSession(sessionId);
      return false;
    }
    logger.debug('[SidePanel] resumeTask: checkpoint verified, iteration:', checkpointResp.checkpoint?.iteration);
  } catch (e) {
    logger.warn('[SidePanel] resumeTask: verify checkpoint hourcommunication failed,continue tryrestore:', e.message);
    // 通信失败时不阻止恢复，让 SW 端再判断一次
  }

  const mySessionId = sessionId;
  const loadingId = addLoadingMessage();

  // 标记为生成中，让发送按钮切换为停止按钮（供用户中途取消恢复任务）
  state.isGenerating = true;

  let content = '';
  let executionLog = [];
  let reflectionScore = null;
  let wasRevised = false;
  let wasStreamed = false;
  let budgetEnded = false;
  let streamingHtml = null;
  let streamingConnected = true;
  let streamingMsgId = null;

  try {
    // 复用 callApi 的流式输出基础设施，通过 resumeFromCheckpoint 切换为发送 RESUME_REACT
    const result = await callApi(null, null, false, {}, {
      resumeFromCheckpoint: true,
      userGuidance,
      loadingId,
    });
    content = result.content;
    executionLog = result.executionLog || [];
    reflectionScore = result.reflectionScore;
    wasRevised = result.wasRevised || false;
    wasStreamed = result.wasStreamed || false;
    streamingHtml = result.streamingHtml || null;
    streamingConnected = result.streamingConnected !== undefined ? result.streamingConnected : true;
    streamingMsgId = result.streamingMsgId || null;
    // 续跑同样可能再次撞线软着陆（后台已保留新的 budget_exhausted 现场）
    budgetEnded = result.budgetEnded === true;
  } catch (errorResult) {
    // 已切换到其他会话：保存到原会话历史，不修改当前 DOM
    if (state.activeSessionId !== mySessionId) {
      // 必须走 t()：字面量只匹配中文，英文界面下「用户取消」会被误判成恢复失败，
      // 于是既不写 taskCancelled 文案、也不给 resumable，续跑入口当场丢失
      const taskStopped = errorResult.message === t('chatMsg.errTaskStopped');
      const resumable = !!errorResult.checkpoint || errorResult.swRestarted || taskStopped;
      if (taskStopped) {
        appendMessageToSession(mySessionId, { role: 'assistant', content: t('chatResume.taskCancelled'), executionLog: errorResult.executionLog || [], resumable, resumed: true });
      } else if (errorResult.swRestarted) {
        appendMessageToSession(mySessionId, { role: 'assistant', content: t('chatResume.swRestarted'), executionLog: errorResult.executionLog || [], resumable, resumed: true });
      } else {
        const errorContent = t('chatResume.resumeFailed', { message: errorResult.message || t('chatResume.unknownError') });
        // 恢复失败时不标记 resumable，避免在错误消息上再显示"继续执行"按钮（防止无限错误循环）
        appendMessageToSession(mySessionId, { role: 'assistant', content: errorContent, executionLog: errorResult.executionLog || [], resumable: false, resumed: true });
      }
      document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId: mySessionId } }));
      removeLoadingMessage(loadingId);
      return false;
    }

    // 用户主动取消
    if (errorResult.message === t('chatMsg.errTaskStopped')) {
      removeLoadingMessage(loadingId);
      const { messageId } = addMessage('assistant', t('chatResume.taskCancelled'), false, errorResult.executionLog || []);
      state.messageHistory.push({ role: 'assistant', content: t('chatResume.taskCancelled'), executionLog: errorResult.executionLog || [], messageId, resumable: true, resumed: true });
      saveChatHistory();
      return false;
    }

    // SW 重启
    if (errorResult.swRestarted) {
      removeLoadingMessage(loadingId);
      const resumable = !!errorResult.checkpoint;
      const { messageId } = addMessage('assistant', t('chatResume.swRestarted'), false, errorResult.executionLog || []);
      state.messageHistory.push({ role: 'assistant', content: t('chatResume.swRestarted'), executionLog: errorResult.executionLog || [], messageId, resumable, resumed: true });
      saveChatHistory();
      return false;
    }

    // 其他错误（如 checkpoint 不存在）
    removeLoadingMessage(loadingId);
    const errorContent = t('chatResume.resumeFailed', { message: errorResult.message || t('chatResume.unknownError') });
    const { element: messageDiv, messageId } = addMessage('assistant', errorContent, true, errorResult.executionLog || []);
    // 恢复失败时不标记 resumable，避免在错误消息上再显示"继续执行"按钮（防止无限错误循环）
    state.messageHistory.push({ role: 'assistant', content: errorContent, executionLog: errorResult.executionLog || [], messageId, resumable: false, resumed: true });
    saveChatHistory();
    return false;
  } finally {
    // 无论成功/失败/取消，都重置生成状态，恢复发送按钮（并通知队列接力）
    notifyGenerationEnded(mySessionId);
  }

  // 恢复成功：上一轮 checkpoint 已被消费，先清掉旧入口，避免同一现场挂两个按钮。
  // 但「续跑又撞线」时后台保留了新的 budget_exhausted 现场，必须给本轮回复重新挂入口——
  // 否则用户第二次撞线就再也没有「继续执行」可点（只能改稿重发）。
  _clearResumableFlagsForSession(mySessionId);
  const resumable = budgetEnded ? 'budget' : false;

  // 成功路径：检查是否已切换会话
  if (state.activeSessionId !== mySessionId) {
    const msgEntry = { role: 'assistant', content, executionLog, reflectionScore, wasRevised, resumable, resumed: true };
    if (wasStreamed && streamingHtml) {
      msgEntry.htmlContent = streamingHtml;
    }
    appendMessageToSession(mySessionId, msgEntry);
    document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId: mySessionId } }));
    removeLoadingMessage(loadingId);
    return true;
  }

  // 流式输出已渲染消息：跳过 removeLoadingMessage 和 addMessage
  if (wasStreamed && streamingHtml) {
    // 流式消息已通过 STREAM_START/STREAM_CHUNK/API_COMPLETE 在 callApi 内部完成渲染
    // 仅需记录到 messageHistory（必须保存 htmlContent，否则刷新后流式输出内容丢失）
    const assistantMsgId = streamingMsgId;
    state.messageHistory.push({
      role: 'assistant',
      content,
      executionLog,
      reflectionScore,
      wasRevised,
      resumable,
      messageId: assistantMsgId,
      resumed: true,
      htmlContent: streamingHtml,
    });
    saveChatHistory();
    if (resumable) {
      const streamedEl = assistantMsgId ? document.querySelector(`[data-message-id="${assistantMsgId}"]`) : null;
      _mountResumeButton(streamedEl, resumable);
    }
    return true;
  }

  // 非流式降级路径：移除 loading，添加 assistant 消息
  removeLoadingMessage(loadingId);
  const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog, reflectionScore, wasRevised, null, null, [], resumable);
  state.messageHistory.push({
    role: 'assistant',
    content,
    executionLog,
    reflectionScore,
    wasRevised,
    resumable,
    messageId,
    resumed: true,
  });
  saveChatHistory();
  if (messageDiv) renderMessageMermaid(messageDiv);
  return true;
}
