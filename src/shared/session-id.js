// shared/session-id.js - 会话 ID 判定

/**
 * 浮层问答等旁支任务的临时会话 ID（popup_ / popup_tools_）。
 *
 * 这类 ID 只用于隔离流式信令，不是真实会话：没有会话记录、没有可续跑的面板，
 * 因此不能进入会话列表/执行停靠条，也不应被自动续跑或计入会话统计。
 * @param {string} sessionId
 * @returns {boolean}
 */
export function isEphemeralSessionId(sessionId) {
  return /^popup_/.test(String(sessionId || ''));
}
