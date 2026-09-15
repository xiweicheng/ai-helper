// background/scheduler-rules.js - 定时任务调度规则（纯函数）
// 从 scheduler.js 抽离，无 chrome/DB 依赖，便于单元测试：
// cron 下次触发时间、间隔解析、一次性/间隔/cron 下次执行、停用条件、任务参数规范化

/**
 * 取非空值：null/undefined 视为缺省，回退到 fallback
 */
export function pick(v, fb) {
  return (v !== null && v !== undefined) ? v : fb;
}

/**
 * 生成字段匹配器：支持 *、单值、列表、区间、步长（a-b/n）
 */
export function fieldMatcher(field, min, max) {
  if (field === '*' || field === '?' || field === '') return () => true;
  const ranges = [];
  for (const part of String(field).split(',')) {
    let step = 1;
    let base = part;
    const slash = part.indexOf('/');
    if (slash !== -1) {
      step = parseInt(part.slice(slash + 1), 10) || 1;
      base = part.slice(0, slash);
    }
    let lo;
    let hi;
    if (base === '*' || base === '') {
      lo = min;
      hi = max;
    } else if (base.includes('-')) {
      const seg = base.split('-');
      lo = parseInt(seg[0], 10);
      hi = parseInt(seg[1], 10);
    } else {
      lo = hi = parseInt(base, 10);
    }
    if (Number.isNaN(lo) || Number.isNaN(hi)) continue;
    ranges.push({ lo, hi, step });
  }
  return (v) => ranges.some(({ lo, hi, step }) => v >= lo && v <= hi && ((v - lo) % step === 0));
}

/**
 * 计算 5 段式 cron（分 时 日 月 周）的下一次触发时间戳
 * 说明：时区跟随本机（Service Worker 使用本地时间），month/day 未做英文名解析
 * @param {string} src cron 表达式
 * @param {number} [from] 起始时间戳（默认当前时间）
 * @returns {number|null} 毫秒时间戳；无法匹配返回 null
 */
export function nextCronRun(src, from = Date.now()) {
  if (!src) return null;
  const fields = String(src).trim().split(/\s+/);
  if (fields.length !== 5) return null;

  const minute = fieldMatcher(fields[0], 0, 59);
  const hour = fieldMatcher(fields[1], 0, 23);
  const dom = fieldMatcher(fields[2], 1, 31);
  const month = fieldMatcher(fields[3], 1, 12);
  const dow = fieldMatcher(fields[4], 0, 6);

  const domRestricted = !(fields[2] === '*' || fields[2] === '?');
  const dowRestricted = !(fields[4] === '*' || fields[4] === '?');

  const d = new Date(from + 60000); // 从下一分钟开始
  d.setSeconds(0, 0);

  const MAX_ITER = 366 * 24 * 60; // 最多向后扫描一年（按分钟）
  for (let i = 0; i < MAX_ITER; i++) {
    const mo = d.getMonth() + 1;
    const day = d.getDate();
    const dw = d.getDay();
    const hh = d.getHours();
    const mm = d.getMinutes();
    const domOk = dom(day);
    const dowOk = dow(dw);
    // 日 与 周 同时受限时按 OR 处理（类 Vixie cron 语义）；否则各自独立
    const dayOk = (domRestricted && dowRestricted) ? (domOk || dowOk) : ((domRestricted ? domOk : true) && (dowRestricted ? dowOk : true));
    if (month(mo) && dayOk && hour(hh) && minute(mm)) {
      return d.getTime();
    }
    d.setMinutes(d.getMinutes() + 1);
  }
  return null;
}

/**
 * 解析间隔值：支持 "30m"/"2h"/"1d" 或纯数字（分钟），最小 1 分钟
 * @returns {number|null} 分钟数；非法输入返回 null
 */
export function parseIntervalMinutes(value) {
  const str = String(value ?? '').trim();
  const m = str.match(/^(\d+(?:\.\d+)?)\s*(m|h|d|min|hour|day)?$/i);
  if (!m) return null;
  let num = parseFloat(m[1]);
  if (Number.isNaN(num)) return null;
  const unit = (m[2] || 'm').toLowerCase();
  if (unit === 'h' || unit === 'hour') num *= 60;
  else if (unit === 'd' || unit === 'day') num *= 24 * 60;
  return Math.max(1, Math.round(num));
}

/**
 * 计算任务下次触发时间戳
 */
export function computeNextRun(task, now = Date.now()) {
  const s = task?.schedule;
  if (!s) return null;
  if (s.type === 'once') {
    if (s.onceMode === 'relative') {
      const mins = parseIntervalMinutes(s.value);
      return mins ? now + mins * 60 * 1000 : null;
    }
    const t = new Date(s.value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (s.type === 'interval') {
    const mins = parseIntervalMinutes(s.value);
    if (!mins) return null;
    return now + mins * 60 * 1000;
  }
  if (s.type === 'cron') {
    return nextCronRun(s.value, now);
  }
  return null;
}

/**
 * 一次执行完成后，判断任务是否应停用
 * 规则：一次性任务执行完即停；达到最大执行次数；超过截止时间
 * 注意：调用时 runHistory 应已包含本次运行记录
 * @param {Object} task 任务对象
 * @param {number} [now] 当前时间戳
 * @returns {boolean} 是否应停用
 */
export function shouldDisableAfterRun(task, now = Date.now()) {
  if (!task) return false;
  if (task.schedule?.type === 'once') return true;
  if (task.maxRuns != null && Array.isArray(task.runHistory) && task.runHistory.length >= task.maxRuns) return true;
  if (task.endAt != null && now >= task.endAt) return true;
  return false;
}

/**
 * 规范化创建/更新任务的入参（数字字段容错转换，缺省统一为 null）
 */
export function normalizeTaskPayload(data = {}) {
  return {
    name: data.name || '',
    description: data.description || '',
    prompt: data.prompt || '',
    schedule: data.schedule || null,
    enabled: data.enabled !== false,
    contextUrl: data.contextUrl || null,
    contextMode: data.contextMode || 'fetch',
    sessionId: data.sessionId || null,
    model: data.model || null,
    agentId: data.agentId || null,
    useTools: data.useTools != null ? data.useTools : null,
    temperature: data.temperature != null ? data.temperature : null,
    topP: data.topP != null ? data.topP : null,
    maxRuns: data.maxRuns != null ? (Number(data.maxRuns) || null) : null,
    endAt: data.endAt != null ? (Number(data.endAt) || null) : null,
  };
}
