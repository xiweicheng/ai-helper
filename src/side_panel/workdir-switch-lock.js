// workdir-switch-lock.js - 「本会话现在能不能切换工作目录」的唯一判定
//
// 为什么单独成模块：这条判定原先在两处各写一份。
//   1) chip 渲染时（updateWorkdirTag）把结果写进 dataset.locked —— 一次性快照；
//   2) 弹窗入口（showSwitchWorkdirDialog）自己再算一遍。
// 快照不会随「生成结束 / 队列被删空」回弹，于是任务早就跑完了，输入框底部的入口还是灰的，
// 只有把会话切走再切回（触发一次新的渲染）才看起来恢复。收敛成一份，两侧都当场调用。
//
// 语义保持原样：目标会话正在生成，或队列里还有待执行条目 → 禁止切换。
// 长任务中途换目录会让执行中的请求在下一次权限校验时失配，所以宁可让用户等这一轮跑完。

import state from './state.js';
import { getQueuedCount } from './queue-store.js';

/**
 * @param {string|null} [sessionId] 目标会话，缺省取面板当前会话
 * @returns {boolean} true = 此刻禁止切换工作目录
 */
export function isWorkdirSwitchBlocked(sessionId) {
  const sid = sessionId || state.activeSessionId;
  if (!sid) return false;
  // 纯同步内存读：这个判定挂在渲染路径上（生成/队列事件都会调它），不允许在这里发网络请求
  return !!(state.generatingSessionIds?.has(sid) || getQueuedCount(sid) > 0);
}
