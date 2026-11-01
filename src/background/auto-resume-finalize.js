// auto-resume-finalize.js - 闹钟自动续跑的终态收尾
//
// 缺口现场：手动「继续执行」（RESUME_REACT 分支）跑完会兜底落库 + 广播 API_COMPLETE；
// 而闹钟自动续跑原来只是 `await resumeReactLoopFromCheckpoint(...)` 就把结果丢掉 ——
// 续跑跑完，面板镜像收不到终态（气泡永远「生成中」），刷新后会话里也什么都没有，
// 只剩 checkpoint 被清掉。用户看到的就是「后台跑完了，会话里一个字都没有」。
//
// 本模块补齐这一半，与 RESUME_REACT 分支同构：先按「面板是否在场」兜底落库，
// 再广播终态。顺序有意义：
// - 先写库：面板确实不在场时（SW 冷启动续跑）结果不会白跑；
// - 再广播：面板重开的镜像靠广播收尾渲染，它自己那次写入由存储层按 callId 原地合并。
//
// 失败隔离：落库/广播异常都不外溢 —— 收尾失败绝不能炸掉闹钟的下一拍。
import logger from '../shared/logger.js';
import { persistCompletionWithoutPanel } from './panel-absent-persist.js';

const DEFAULT_IO = {
  persist: persistCompletionWithoutPanel,
  broadcast: (message) => {
    try {
      // MV3 的 sendMessage 返回 Promise；扩展重载瞬间也可能同步抛错
      const p = chrome.runtime.sendMessage(message);
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* 无接收方 / API 被剥离：广播失败不影响收尾 */ }
  },
};

/**
 * 自动续跑结束后的终态收尾（落库兜底 + 广播）
 * @param {Object} payload
 * @param {string} payload.sessionId
 * @param {string|null} [payload.callId] 本轮续跑的 auto_ callId（去重键）
 * @param {string} [payload.content] 成功内容
 * @param {string} [payload.error] 失败原因（与 content 二选一，优先 error）
 * @param {Array} [payload.executionLog]
 * @param {number} [payload.reflectionScore]
 * @param {string|null} [payload.reasoningContent]
 * @param {boolean} [payload.wasRevised]
 * @param {boolean} [payload.budgetEnded] 续跑又撞线 → 保留「可续跑」入口
 * @param {string|null} [payload.exhaustedBy]
 * @param {{persist:Function,broadcast:Function}} [io]
 * @returns {Promise<{persisted:boolean,broadcast:boolean,reason?:string}>}
 */
export async function finalizeAutoResume(payload = {}, io = DEFAULT_IO) {
  const { sessionId, callId } = payload;
  if (!sessionId) return { persisted: false, broadcast: false, reason: 'missing_session' };

  const isError = !!payload.error;
  const base = {
    sessionId,
    callId: callId || null,
    executionLog: Array.isArray(payload.executionLog) ? payload.executionLog : [],
    reflectionScore: payload.reflectionScore,
    wasRevised: payload.wasRevised || false,
    budgetEnded: payload.budgetEnded === true,
    exhaustedBy: payload.exhaustedBy || null,
  };

  // 1) 兜底落库：面板不在场时由 SW 写回；面板在场（有 keepalive port）时门控自己跳过
  let persisted = false;
  try {
    const res = await io.persist(isError
      ? { ...base, error: payload.error }
      : { ...base, content: payload.content || '' });
    persisted = !!res?.written;
  } catch (e) {
    logger.warn('[AutoResume] 终态兜底落库失败（不影响广播）:', e?.message || e);
  }

  // 2) 广播终态：面板镜像（reattach）靠它收尾渲染并落库（callId 去重）
  let broadcast = false;
  try {
    io.broadcast(isError
      ? { type: 'API_ERROR', ...base, error: payload.error, resumed: true }
      : {
        type: 'API_COMPLETE',
        ...base,
        content: payload.content || '',
        reasoningContent: payload.reasoningContent || null,
        resumed: true,
      });
    broadcast = true;
  } catch (e) {
    logger.warn('[AutoResume] 终态广播失败:', e?.message || e);
  }

  return { persisted, broadcast };
}
