// background/activity-store.js - 敏感操作审计日志 + 工具使用统计的内存聚合存储（PERF-08）
// 旧实现（原 tool-executor.js 内联）每次写入都是全数组/全对象 get → 改一条 → 整份 set，
// 且 react-loop 并行工具组下多路 get→set 跨 await 交错会丢更新（统计少记、审计丢条目）。
// 现方案：
//   1. 内存权威态：冷启动从 storage 加载一次（单飞 loadPromise，并发只读一次），
//      之后追加/累加全在内存完成——SW 内单线程，从根上消灭读-改-写竞态；
//   2. 防抖合并落盘：标脏后 ~2s 窗口内的任意次修改合并为一次 set（两个键各自脏、可同批写）；
//   3. 关键审计即时刷：不可逆/授权边界类条目（Cookie 写删、清页面数据、文件删除、
//      用户拒绝/取消命令）不等防抖，append 内 await 落盘——审计"丢了无人发现"不可接受；
//   4. 兜底：flush 失败保留脏标（下次写入或挂起时重试，数据不丢，内存态为准）；
//      SW 挂起（onSuspend）前尽力刷一次。
// 已知取舍：toolUsageStats 的读端（侧边栏统计面板）可能看到最长 2s 的陈旧窗口；
// sensitiveAuditLog 本地这份当前无代码读取方（面板读的是 agent 端日志），属取证兜底。
// 落盘形状与旧版逐字段一致（数组条目 timestamp/category/action/details、统计四字段），读端无感。
import logger from '../shared/logger.js';

const AUDIT_LOG_KEY = 'sensitiveAuditLog';
const TOOL_STATS_KEY = 'toolUsageStats';
const MAX_AUDIT_ENTRIES = 100;
const FLUSH_DEBOUNCE_MS = 2000;

// null = 未加载；加载后为权威态。单飞加载避免并发下重复 get / 互相覆盖
let loadPromise = null;
let auditEntries = null;
let toolStats = null;
let auditDirty = false;
let statsDirty = false;
let flushTimer = null;

async function doLoad() {
  const r = await chrome.storage.local.get([AUDIT_LOG_KEY, TOOL_STATS_KEY]);
  auditEntries = Array.isArray(r[AUDIT_LOG_KEY]) ? r[AUDIT_LOG_KEY] : [];
  toolStats = r[TOOL_STATS_KEY] && typeof r[TOOL_STATS_KEY] === 'object' ? r[TOOL_STATS_KEY] : {};
}

function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = doLoad().catch((err) => {
      loadPromise = null; // 加载失败允许下次重试
      throw err;
    });
  }
  return loadPromise;
}

// 关键审计判定：不可逆操作与授权边界事件必须即时落盘（不等防抖）。
// action 前缀在各调用点均为固定英文构造，不随界面语言变化。
function isUrgentAudit(category, action) {
  if (category === 'cookie_write' || category === 'page_data_clear' || category === 'file_delete') return true;
  if (category === 'command_exec' && /^(User denied|Command cancelled)/.test(action)) return true;
  return false;
}

function scheduleFlush() {
  if (flushTimer) return; // 窗口内已有定时器，合并即防抖
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushActivityStoreNow();
  }, FLUSH_DEBOUNCE_MS);
}

/**
 * 立即落盘所有脏数据（审计数组 + 工具统计各自独立脏标，可同批一次 set）。
 * 无脏数据时为空操作；失败保留脏标待重试。
 */
export async function flushActivityStoreNow() {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (!auditDirty && !statsDirty) return;
  const ops = {};
  if (auditDirty) ops[AUDIT_LOG_KEY] = [...auditEntries];
  if (statsDirty) ops[TOOL_STATS_KEY] = { ...toolStats };
  try {
    await chrome.storage.local.set(ops);
    auditDirty = false;
    statsDirty = false;
  } catch (e) {
    logger.warn('[Background] activity store flush failed, will retry on next write/suspend:', e);
  }
}

/**
 * 追加一条敏感操作审计日志（内存态立即生效，落盘按防抖/即时策略）
 */
export async function appendAuditLog(category, action, details = {}) {
  try {
    await ensureLoaded();
    auditEntries.unshift({ timestamp: new Date().toISOString(), category, action, details });
    if (auditEntries.length > MAX_AUDIT_ENTRIES) auditEntries.length = MAX_AUDIT_ENTRIES;
    auditDirty = true;
    if (isUrgentAudit(category, action)) await flushActivityStoreNow();
    else scheduleFlush();
  } catch (e) {
    logger.warn('[Background] Audit log write failed:', e);
  }
}

/**
 * 记录一次工具使用统计（内存累加立即生效，落盘走防抖合并）
 */
export async function recordToolStats(toolName, result, duration) {
  try {
    await ensureLoaded();
    const entry = toolStats[toolName] || { callCount: 0, successCount: 0, totalDuration: 0, lastUsed: 0 };
    entry.callCount++;
    if (result.success) entry.successCount++;
    entry.totalDuration += duration;
    entry.lastUsed = Date.now();
    toolStats[toolName] = entry;
    statsDirty = true;
    scheduleFlush();
  } catch (e) {
    logger.warn('[Background] recordtoolstats failed:', e);
  }
}

// SW 被回收前尽力刷盘（onSuspend 非保证送达，故关键审计另有即时档兜底）
if (typeof chrome !== 'undefined' && chrome.runtime?.onSuspend?.addListener) {
  chrome.runtime.onSuspend.addListener(() => { void flushActivityStoreNow(); });
}
