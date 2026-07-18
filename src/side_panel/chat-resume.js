// side_panel/chat-resume.js - 任务恢复（resume）相关函数
// 从 chat-manager.js 拆分，包含 showResumeDialog / _clearResumableFlagsForSession /
// _verifyCheckpointAndHideButton / _checkForAbandonedCheckpoint / resumeTask

import state from './state.js';
import { formatDuration } from './utils.js';
import { renderMessageMermaid } from './markdown-render.js';
import { appendMessageToSession } from './session-manager.js';
import logger from '../shared/logger.js';

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
export function showResumeDialog() {
  return new Promise((resolve) => {
    // 构建弹窗 DOM
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay resume-dialog-overlay';
    overlay.style.cssText = 'display:flex;position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:10000;align-items:center;justify-content:center;';

    const container = document.createElement('div');
    container.className = 'modal-container resume-dialog-container';
    container.style.cssText = 'background:#fff;border-radius:8px;padding:24px;width:90%;max-width:480px;box-shadow:0 8px 32px rgba(0,0,0,0.2);';

    const title = document.createElement('h3');
    title.textContent = '继续执行任务';
    title.style.cssText = 'margin:0 0 8px 0;font-size:16px;color:#1a202c;';

    const desc = document.createElement('p');
    desc.textContent = '可以追加描述以调整任务方向（可选，留空则按原任务继续）';
    desc.style.cssText = 'margin:0 0 16px 0;font-size:13px;color:#718096;line-height:1.5;';

    const textarea = document.createElement('textarea');
    textarea.className = 'resume-dialog-textarea';
    textarea.placeholder = '例如：请跳过已完成的步骤，直接进入测试阶段...';
    textarea.style.cssText = 'width:100%;min-height:80px;padding:8px 12px;border:1px solid #cbd5e0;border-radius:4px;font-size:13px;resize:vertical;box-sizing:border-box;font-family:inherit;line-height:1.5;';
    textarea.rows = 3;

    const btnContainer = document.createElement('div');
    btnContainer.style.cssText = 'display:flex;justify-content:flex-end;gap:8px;margin-top:16px;';

    const cancelBtn = document.createElement('button');
    cancelBtn.textContent = '取消';
    cancelBtn.style.cssText = 'padding:6px 16px;border:1px solid #cbd5e0;background:#fff;color:#4a5568;border-radius:4px;cursor:pointer;font-size:13px;';

    const confirmBtn = document.createElement('button');
    confirmBtn.textContent = '继续执行';
    confirmBtn.style.cssText = 'padding:6px 16px;border:none;background:#3182ce;color:#fff;border-radius:4px;cursor:pointer;font-size:13px;font-weight:500;';

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
    const resumableEls = chatContainer.querySelectorAll('.message[data-resumable="true"]');
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
 * 检查是否存在被遗弃的 checkpoint（页面关闭/刷新导致任务中断，没有创建恢复入口卡片）
 * 如果存在且 messageHistory 中没有 resumable 标记的消息，自动添加恢复提示卡片
 */
export async function _checkForAbandonedCheckpoint() {
  const sessionId = state.activeSessionId;
  if (!sessionId) return;

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
      logger.debug('[SidePanel] 发现被遗弃的 checkpoint，自动添加恢复提示卡片');

      // 清除该会话的 DOM 缓存，确保下次切换会话时走全量重建路径
      // 避免缓存中包含不完整的恢复卡片（没有按钮）导致重复
      document.dispatchEvent(new CustomEvent('session-cache-invalidate', {
        detail: { sessionId }
      }));

      const checkpoint = resp.checkpoint;
      const duration = checkpoint.updatedAt ? formatDuration(Date.now() - checkpoint.updatedAt) : '';
      const elapsedText = duration ? `（中断 ${duration} 前）` : '';

      const content = `⚠️ 任务执行被中断${elapsedText}\n\n检测到您有一个未完成的任务，是否继续执行？`;

      // 如果 messageHistory 中已有 resumable 消息但 DOM 中没有按钮，更新消息内容并重新渲染
      if (hasResumableMessage) {
        const resumableMsg = state.messageHistory.find(msg => msg.resumable);
        if (resumableMsg) {
          resumableMsg.content = content;
          saveChatHistory();
        }
        // 移除旧的 resumable 消息元素（用多种方式查找）
        if (chatContainer) {
          let oldResumableEl = chatContainer.querySelector('.message[data-resumable="true"]');
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
    logger.warn('[SidePanel] 检查被遗弃的 checkpoint 失败:', e.message);
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
    logger.warn('[SidePanel] resumeTask: 缺少 sessionId');
    return false;
  }

  // 如果当前活跃会话不是要恢复的会话，先切换
  if (state.activeSessionId !== sessionId) {
    logger.warn('[SidePanel] resumeTask: 当前活跃会话与目标会话不一致，请先切换到目标会话');
    return false;
  }

  // 如果已有进行中的 API 调用，拒绝恢复
  if (state.pendingCallApiSessionIds && state.pendingCallApiSessionIds.has(sessionId)) {
    logger.warn('[SidePanel] resumeTask: 当前会话已有进行中的任务');
    return false;
  }

  logger.debug('[SidePanel] resumeTask: 开始恢复任务, sessionId:', sessionId, 'userGuidance:', userGuidance ? `"${userGuidance.substring(0, 50)}..."` : '(无)');

  // 前置检查：验证 checkpoint 是否存在，避免无效的恢复请求
  // 如果 checkpoint 不存在（已过期/被清理/从未保存），直接给出友好提示，不发送 RESUME_REACT
  try {
    const checkpointResp = await chrome.runtime.sendMessage({ type: 'GET_CHECKPOINT', sessionId });
    if (!checkpointResp?.exists) {
      logger.warn('[SidePanel] resumeTask: checkpoint 不存在，无法恢复, sessionId:', sessionId);
      const errorContent = '❌ 恢复失败：未找到可恢复的任务 checkpoint。\n\n可能原因：\n• 任务已正常完成（checkpoint 已被清理）\n• 任务中断时间过久（超过 7 天已过期）\n• 任务执行初期被中断（断点未及保存）\n\n建议重新发起任务。';
      const { messageId } = addMessage('assistant', errorContent, true, []);
      state.messageHistory.push({ role: 'assistant', content: errorContent, executionLog: [], messageId, resumable: false, resumed: true });
      saveChatHistory();
      // 同步清除原消息的 resumable 标记，避免用户反复点击无效按钮
      _clearResumableFlagsForSession(sessionId);
      return false;
    }
    logger.debug('[SidePanel] resumeTask: checkpoint 验证通过, iteration:', checkpointResp.checkpoint?.iteration);
  } catch (e) {
    logger.warn('[SidePanel] resumeTask: 验证 checkpoint 时通信失败，继续尝试恢复:', e.message);
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
  } catch (errorResult) {
    // 已切换到其他会话：保存到原会话历史，不修改当前 DOM
    if (state.activeSessionId !== mySessionId) {
      const resumable = !!errorResult.checkpoint || errorResult.swRestarted ||
                        errorResult.message === '任务已被用户停止';
      if (errorResult.message === '任务已被用户停止') {
        appendMessageToSession(mySessionId, { role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [], resumable, resumed: true });
      } else if (errorResult.swRestarted) {
        appendMessageToSession(mySessionId, { role: 'assistant', content: '⚠️ 后台服务重启，恢复中断', executionLog: errorResult.executionLog || [], resumable, resumed: true });
      } else {
        const errorContent = '❌ 恢复失败：' + (errorResult.message || '未知错误');
        // 恢复失败时不标记 resumable，避免在错误消息上再显示"继续执行"按钮（防止无限错误循环）
        appendMessageToSession(mySessionId, { role: 'assistant', content: errorContent, executionLog: errorResult.executionLog || [], resumable: false, resumed: true });
      }
      document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId: mySessionId } }));
      removeLoadingMessage(loadingId);
      return false;
    }

    // 用户主动取消
    if (errorResult.message === '任务已被用户停止') {
      removeLoadingMessage(loadingId);
      const { messageId } = addMessage('assistant', '任务已取消', false, errorResult.executionLog || []);
      state.messageHistory.push({ role: 'assistant', content: '任务已取消', executionLog: errorResult.executionLog || [], messageId, resumable: true, resumed: true });
      saveChatHistory();
      return false;
    }

    // SW 重启
    if (errorResult.swRestarted) {
      removeLoadingMessage(loadingId);
      const resumable = !!errorResult.checkpoint;
      const { messageId } = addMessage('assistant', '⚠️ 后台服务重启，恢复中断', false, errorResult.executionLog || []);
      state.messageHistory.push({ role: 'assistant', content: '⚠️ 后台服务重启，恢复中断', executionLog: errorResult.executionLog || [], messageId, resumable, resumed: true });
      saveChatHistory();
      return false;
    }

    // 其他错误（如 checkpoint 不存在）
    removeLoadingMessage(loadingId);
    const errorContent = '❌ 恢复失败：' + (errorResult.message || '未知错误');
    const { element: messageDiv, messageId } = addMessage('assistant', errorContent, true, errorResult.executionLog || []);
    // 恢复失败时不标记 resumable，避免在错误消息上再显示"继续执行"按钮（防止无限错误循环）
    state.messageHistory.push({ role: 'assistant', content: errorContent, executionLog: errorResult.executionLog || [], messageId, resumable: false, resumed: true });
    saveChatHistory();
    return false;
  } finally {
    // 无论成功/失败/取消，都重置生成状态，恢复发送按钮
    state.generatingSessionIds.delete(mySessionId);
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
  }

  // 恢复成功：SW 已清理 checkpoint，前端同步移除所有"继续执行"按钮
  // 避免用户在已恢复的任务上看到无效的"继续执行"按钮
  _clearResumableFlagsForSession(mySessionId);

  // 成功路径：检查是否已切换会话
  if (state.activeSessionId !== mySessionId) {
    const msgEntry = { role: 'assistant', content, executionLog, reflectionScore, wasRevised, resumed: true };
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
      messageId: assistantMsgId,
      resumed: true,
      htmlContent: streamingHtml,
    });
    saveChatHistory();
    return true;
  }

  // 非流式降级路径：移除 loading，添加 assistant 消息
  removeLoadingMessage(loadingId);
  const { element: messageDiv, messageId } = addMessage('assistant', content, true, executionLog, reflectionScore, wasRevised);
  state.messageHistory.push({
    role: 'assistant',
    content,
    executionLog,
    reflectionScore,
    wasRevised,
    messageId,
    resumed: true,
  });
  saveChatHistory();
  if (messageDiv) renderMessageMermaid(messageDiv);
  return true;
}
