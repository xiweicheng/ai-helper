// panel-absent-persist.js - 终态落库兜底（面板不在场时由 SW 写回会话）
//
// 为什么需要：普通聊天任务的助手消息只在面板侧落库（收到 API_COMPLETE 后
// appendMessageToSession）。SW 被系统回收 → 自动续跑在冷启动上下文里完成时，
// 广播的 API_COMPLETE 没有任何活着的 listener 接收（旧实例已卸载、新实例
// callId 不匹配），结果只留在随后被清理的 checkpoint 里 —— 任务白跑。
//
// 门控语义（保证正常流程零变化）：
// - hasKeepalivePort(sessionId)：keepalive 端口在 = 发起面板实例还活着、它会
//   自己写 → 一律不写。正常「面板里发起的任务」100% 命中此分支，行为不变；
// - 端口不在 → SW 写回，并打 callId 标记；写前按 callId 查重，与面板 reattach
//   的写入方向互斥（谁先写谁生效），任何时序都不会出现两条同源消息。
//
// 这里刻意只看 keepalive、不看接管实例的观察端口：本模块要保的不是「有人写」，
// 而是「一定写得住」。接管实例确实会自己落库，但那一次写入是异步的，刷新/关面板
// 随时能把它打断；而后台这一笔在广播终态之前就已写完。两边都写由 callId 幂等吃掉。
//
// 失败隔离：本模块所有异常都被吞掉 —— 落库兜底绝不能影响主链路的终态广播。
import logger from '../shared/logger.js';
import { hasKeepalivePort } from './state.js';
import { getSession } from '../storage/db.js';
import { appendMessageToSession } from '../storage/session-store.js';

// 默认 IO：生产语义。单测可以只注入此三个函数中的任意几个，其余落回默认。
const DEFAULT_IO = {
  hasPanel: hasKeepalivePort,
  getSession,
  appendMessageToSession,
};

/**
 * 任务终态时按「面板是否在场」决定是否由后台写回会话
 * @param {Object} payload
 * @param {string} payload.sessionId 会话 id
 * @param {string|null} [payload.callId] 本轮 callId（去重键；自动续跑为 auto_ 前缀）
 * @param {string} [payload.content] 成功内容
 * @param {string} [payload.error] 失败原因（与 content 二选一，优先 error）
 * @param {Array} [payload.executionLog] 执行日志
 * @param {number} [payload.reflectionScore]
 * @param {boolean} [payload.wasRevised]
 * @param {boolean} [payload.budgetEnded] 预算撞线软着陆 → 消息保持「可续跑」入口
 * @param {{hasPanel?:Function,getSession?:Function,appendMessageToSession?:Function}} [io] 局部替身，未注入的走生产默认
 * @returns {Promise<{written:boolean, reason?:string}>}
 */
export async function persistCompletionWithoutPanel(payload = {}, io = {}) {
  const { hasPanel, getSession, appendMessageToSession } = { ...DEFAULT_IO, ...io };
  const { sessionId, callId } = payload;
  if (!sessionId) return { written: false, reason: 'missing_session' };

  try {
    // 面板在场：它自己会写（保持现状，绝不重复写）
    if (hasPanel(sessionId)) return { written: false, reason: 'panel_present' };

    const content = payload.error ? String(payload.error) : (payload.content || '');
    const executionLog = Array.isArray(payload.executionLog) ? payload.executionLog : [];
    if (!content && executionLog.length === 0) return { written: false, reason: 'empty' };

    const session = await getSession(sessionId);
    if (!session) return { written: false, reason: 'session_missing' };

    // 查重：面板（或 reattach）已经写过同一 callId 的结果 → 跳过
    const history = Array.isArray(session.messageHistory) ? session.messageHistory : [];
    if (callId && history.some((m) => m && m.callId === callId)) {
      return { written: false, reason: 'duplicate' };
    }

    await appendMessageToSession(sessionId, {
      role: 'assistant',
      content,
      executionLog,
      reflectionScore: payload.reflectionScore,
      wasRevised: payload.wasRevised || false,
      callId: callId || undefined,
      resumed: true,
      resumable: payload.budgetEnded ? 'budget' : false,
    });
    logger.info(`[PanelAbsentPersist] 面板不在场，已由后台写回结果: sessionId=${sessionId}, callId=${callId || '-'}`);
    return { written: true };
  } catch (e) {
    logger.warn('[PanelAbsentPersist] 落库兜底失败（不影响主链路）:', e?.message || e);
    return { written: false, reason: 'error' };
  }
}
