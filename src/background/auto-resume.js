/**
 * 任务级自动续跑闹钟（auto-resume watch）—— 方案 B"一定往下执行"的官方语义保障
 *
 * MV3 Service Worker 可被系统随时回收（浏览器重启/崩溃/策略强杀），心跳（sw-heartbeat）
 * 挡不住这些场景。chrome.alarms 是官方认可的唤醒源，且闹钟跨 SW 与浏览器重启持久。
 * 主任务执行期间注册 30s 周期闹钟：SW 被杀后闹钟最迟 30s 唤醒 SW，
 * 由 background/index.js 接线扫描残留 checkpoint 自动续跑
 * （子任务级防重放机制已保证续跑不会二次执行写操作）。
 *
 * 安全阀（决策语义见 decideAutoResume）：
 * - user_cancelled / error 终态不自动续——尊重用户意志、保持明确失败的人工确认语义；
 * - 会话仍在 activeReactLoops 中不重复续（防双执行）；
 * - 连续续跑 AUTO_RESUME_MAX_ATTEMPTS 次仍失败 → 停止并在"刚耗尽"的当拍桌面通知一次（防风暴）。
 *
 * 本模块只依赖 shared/logger（叶子分层，规避循环依赖，与 sw-heartbeat.js 同约定）；
 * 续跑执行逻辑通过 registerAutoResumeAlarmHandler 由 index.js 接线注入。
 */
import { logger } from '../shared/logger.js';

export const AUTO_RESUME_ALARM_NAME = 'react-auto-resume-watch';
// 0.5 分钟 = 30s：桌面 Chrome 允许的最小周期
export const AUTO_RESUME_INTERVAL_MIN = 0.5;
// 自动续跑尝试次数上限：达到后停止并提示人工介入，防无限重试风暴
export const AUTO_RESUME_MAX_ATTEMPTS = 3;

// 不自动续的终态：user_cancelled = 用户意志；error = 明确失败（catch 栈完整执行过，
// 说明任务是有界终止而非蒸发，保留"用户在面板点继续/重试"的原语义）
const TERMINAL_REASONS = new Set(['user_cancelled', 'error']);

/**
 * 自动续跑决策（纯函数，可单测）
 * @param {Array} checkpoints getAllReactCheckpoints() 结果
 * @param {Set<string>} activeSessionIds 当前执行中的会话（activeReactLoops，防双执行）
 * @param {number} [maxAttempts] 次数上限
 * @returns {{targets: Array<{checkpoint: Object, nextAttempts: number}>, justExhausted: Array<Object>}}
 *   targets - 本次应续跑（先回写递增计数再执行）；
 *   justExhausted - 恰好"耗尽于本拍"（仅此时通知一次；超限后静默，防通知风暴）
 */
export function decideAutoResume(checkpoints, activeSessionIds = new Set(), maxAttempts = AUTO_RESUME_MAX_ATTEMPTS) {
  const targets = [];
  const justExhausted = [];
  for (const cp of checkpoints || []) {
    if (!cp || !cp.sessionId) continue;
    if (TERMINAL_REASONS.has(cp.interruptedReason)) continue;
    if (activeSessionIds.has(cp.sessionId)) continue;
    const attempts = cp.autoResumeAttempts || 0;
    if (attempts > maxAttempts) continue; // 早已耗尽且已通知过：静默
    if (attempts === maxAttempts) {
      justExhausted.push(cp);
      continue;
    }
    targets.push({ checkpoint: cp, nextAttempts: attempts + 1 });
  }
  return { targets, justExhausted };
}

// 引用计数：与心跳同模式，多任务并发共享一个闹钟（决策按会话维度扫描，无需每会话一个）
let refCount = 0;
let watching = false;

/** 主任务开始时调用：注册周期唤醒闹钟（幂等，引用计数管理） */
export function startAutoResumeWatch() {
  refCount++;
  if (watching) return;
  try {
    chrome.alarms?.create?.(AUTO_RESUME_ALARM_NAME, { periodInMinutes: AUTO_RESUME_INTERVAL_MIN });
    void chrome.runtime?.lastError;
    watching = true;
    logger.debug('[AutoResume] watch alarm started');
  } catch (e) {
    logger.warn('[AutoResume] start watch failed:', e.message);
  }
}

/** 主任务结束时调用：计数归零后移除闹钟（任务正常完成/取消都不再需要唤醒续跑） */
export function stopAutoResumeWatch() {
  if (refCount > 0) refCount--;
  if (refCount > 0 || !watching) return;
  try {
    chrome.alarms?.clear?.(AUTO_RESUME_ALARM_NAME, () => {
      void chrome.runtime?.lastError;
    });
    logger.debug('[AutoResume] watch alarm stopped');
  } catch (e) {
    logger.warn('[AutoResume] stop watch failed:', e.message);
  } finally {
    watching = false;
  }
}

export function isAutoResumeWatchRunning() {
  return watching;
}

/**
 * 注册闹钟回调（由 background/index.js 接线，注入续跑执行逻辑，避免本模块反向依赖业务）
 * @param {() => (void|Promise<void>)} handler
 */
export function registerAutoResumeAlarmHandler(handler) {
  if (typeof handler !== 'function') return;
  try {
    // 顶层可选链：扩展重载/终止瞬间 API 可能已被剥离（SW 启动竞态防护约定）
    chrome.alarms?.onAlarm?.addListener?.((alarm) => {
      if (alarm?.name !== AUTO_RESUME_ALARM_NAME) return;
      Promise.resolve()
        .then(() => handler())
        .catch((e) => logger.warn('[AutoResume] handler failed:', e?.message || e));
    });
  } catch (e) {
    logger.warn('[AutoResume] register handler failed:', e.message);
  }
}

/** 仅测试使用：重置模块状态 */
export function __resetAutoResumeWatchForTest() {
  refCount = 0;
  watching = false;
}
