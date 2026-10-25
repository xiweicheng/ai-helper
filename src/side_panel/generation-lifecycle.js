// generation-lifecycle.js - "一次生成结束"的统一入口
//
// 背景：此前 4 处各自手写同一组收尾动作
//   chat-manager.js（sendMessage finally）、index.js（提示词发送 finally）、
//   prompt-manager.js（finally）、chat-resume.js（恢复 finally）
// 都是 `generatingSessionIds.delete` + `markSessionCompleted` + `generating-state-changed` 三连。
// 队列接力需要"会话刚刚空闲"这个时机，如果四处各写一遍，必有一处漏接线 —— 这正是
// 本功能最容易出错的地方。因此收敛成单一入口，队列接力只挂在这里一次。
//
// 注意：本模块不 import queue-runner（避免 chat-manager → lifecycle → runner → chat-manager
// 的循环依赖）。谁需要"生成结束"，谁在初始化时通过 onGenerationEnded 注册。

import state from './state.js';
import { markSessionCompleted } from './session-manager.js';
import logger from '../shared/logger.js';

/** 生成结束回调集合 */
const handlers = new Set();

/**
 * 注册"生成结束"回调。
 * @param {(sessionId: string) => void} fn
 * @returns {() => void} 取消注册
 */
export function onGenerationEnded(fn) {
  if (typeof fn !== 'function') return () => {};
  handlers.add(fn);
  return () => handlers.delete(fn);
}

/**
 * 统一收尾：清除生成态 → 标记完成 → 广播事件 → 通知订阅者。
 * 调用点只在自己额外需要 DOM 收尾（focus、清空图片预览）时补充，不再重复这三步。
 * @param {string} sessionId - 目标会话，缺省取当前激活会话
 */
export function notifyGenerationEnded(sessionId) {
  const sid = sessionId || state.activeSessionId;
  if (!sid) return;

  state.generatingSessionIds.delete(sid);

  try {
    // 若用户已切走到其他会话，标记此会话任务已完成，等待查看
    markSessionCompleted(sid);
  } catch (err) {
    logger.warn('[GenerationLifecycle] markSessionCompleted failed:', err?.message);
  }

  if (typeof document !== 'undefined' && typeof CustomEvent === 'function') {
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
    document.dispatchEvent(new CustomEvent('generation-ended', { detail: { sessionId: sid } }));
  }

  for (const fn of handlers) {
    try {
      fn(sid);
    } catch (err) {
      logger.error('[GenerationLifecycle] end handler failed:', err?.message);
    }
  }
}

/** 仅供测试：清空回调 */
export function __resetLifecycleForTest() {
  handlers.clear();
}
