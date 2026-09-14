// background/scheduler.js - 定时任务调度引擎
// 负责：任务 CRUD 编排、cron/一次性/间隔的 next-run 计算、chrome.alarms 注册/重建、触发执行

import { getStoredConfig } from './config.js';
import { getTools } from './tool-executor.js';
import { reactLoop, callApiNonStream } from './react-loop.js';
import { createScheduledSession, appendMessageToSession } from '../storage/session-store.js';
import { getSession, getScheduledTask, getAllScheduledTasks, putScheduledTask, deleteScheduledTask } from '../storage/db.js';
import { BUILTIN_AGENTS } from '../shared/agent-defaults.js';
import * as AgentClient from './local-agent-client.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  sched: {
    missingFields: '缺少必要字段（名称、指令、定时规则）',
    notFound: '定时任务不存在',
    running: '运行中',
    success: '成功',
    failed: '失败',
    userMsgPrefix: '定时任务',
    invalidCron: 'Cron 表达式无效',
    invalidInterval: '间隔时间格式无效',
    taskDisabled: '任务已停用，无法执行',
    notifFailTitle: '定时任务执行失败',
    notifFailMsg: '任务「{name}」执行失败：{error}',
  },
});
registerTranslations('en', {
  sched: {
    missingFields: 'Missing required fields (name, prompt, schedule)',
    notFound: 'Scheduled task not found',
    running: 'Running',
    success: 'Success',
    failed: 'Failed',
    userMsgPrefix: 'Scheduled task',
    invalidCron: 'Invalid cron expression',
    invalidInterval: 'Invalid interval value',
    taskDisabled: 'Task is disabled',
    notifFailTitle: 'Scheduled task failed',
    notifFailMsg: 'Task "{name}" failed: {error}',
  },
});

const ALARM_PREFIX = 'st:';

// 运行中的任务集合，防止同一任务并发执行
const RUNNING = new Set();

// 取非空值：null/undefined 视为缺省，回退到 fallback
function pick(v, fb) {
  return (v !== null && v !== undefined) ? v : fb;
}

// ==================== 定时规则解析 ====================

/**
 * 生成字段匹配器：支持 *、单值、列表、区间、步长（a-b/n）
 */
function fieldMatcher(field, min, max) {
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
 */
export function parseIntervalMinutes(value) {
  const str = String(value || '').trim();
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
export function computeNextRun(task) {
  const s = task.schedule;
  if (!s) return null;
  if (s.type === 'once') {
    if (s.onceMode === 'relative') {
      const mins = parseIntervalMinutes(s.value);
      return mins ? Date.now() + mins * 60 * 1000 : null;
    }
    const t = new Date(s.value).getTime();
    return Number.isNaN(t) ? null : t;
  }
  if (s.type === 'interval') {
    const mins = parseIntervalMinutes(s.value);
    if (!mins) return null;
    return Date.now() + mins * 60 * 1000;
  }
  if (s.type === 'cron') {
    return nextCronRun(s.value);
  }
  return null;
}

// ==================== 闹钟注册 ====================

function alarmNameOf(taskId) {
  return ALARM_PREFIX + taskId;
}

/**
 * 注册/清除单个任务的闹钟
 */
export function scheduleTaskAlarm(task) {
  if (!task || !task.id) return;
  const name = alarmNameOf(task.id);
  if (!task.enabled) {
    chrome.alarms.clear(name, () => {});
    return;
  }

  if (task.schedule?.type === 'interval') {
    const mins = parseIntervalMinutes(task.schedule.value) || 1;
    chrome.alarms.create(name, { delayInMinutes: mins, periodInMinutes: mins });
  } else {
    const next = computeNextRun(task);
    if (next) chrome.alarms.create(name, { when: next });
  }
}

/**
 * 启动时重建所有闹钟（SW 重启修复），由 index.js 调用
 */
export async function rehydrateAlarms() {
  try {
    const existing = await chrome.alarms.getAll();
    const existingNames = new Set(existing.map((a) => a.name));
    const tasks = await getAllScheduledTasks();
    const enabledNames = new Set(
      tasks.filter((t) => t.enabled && t.schedule).map((t) => alarmNameOf(t.id))
    );

    // 重建缺失的报警（浏览器重启后 chrome.alarms 会清空）；不触碰已存在的报警，
    // 避免 SW 因报警唤醒时 clear+create 打乱 interval 的周期基准
    for (const task of tasks) {
      const name = alarmNameOf(task.id);
      if (task.enabled && !existingNames.has(name)) {
        scheduleTaskAlarm(task);
      }
    }
    // 清理已删除/停用任务的孤儿报警
    for (const a of existing) {
      if (a.name.startsWith(ALARM_PREFIX) && !enabledNames.has(a.name)) {
        await chrome.alarms.clear(a.name);
      }
    }
    logger.debug(`[Scheduler] rehydrated alarms, tasks=${tasks.length}`);
  } catch (e) {
    logger.warn('[Scheduler] rehydrateAlarms failed:', e);
  }
}

// 顶层同步注册闹钟监听（MV3 唤醒依赖）
chrome.alarms.onAlarm.addListener((alarm) => {
  if (!alarm.name.startsWith(ALARM_PREFIX)) return;
  const taskId = alarm.name.slice(ALARM_PREFIX.length);
  runTask(taskId).catch((e) => logger.error('[Scheduler] onAlarm runTask failed:', taskId, e));
});

// ==================== 执行编排 ====================

async function loadAgent(agentId) {
  if (!agentId) return null;
  const builtin = BUILTIN_AGENTS.find((a) => a.id === agentId);
  if (builtin) return builtin;
  const result = await chrome.storage.local.get(['customAgents']);
  const customAgents = result.customAgents || [];
  return customAgents.find((a) => a.id === agentId) || null;
}

/**
 * 解析宿主会话：存在则复用，被删除则自动新建专属会话
 */
async function resolveHostSession(task) {
  if (task.sessionId) {
    const s = await getSession(task.sessionId);
    if (s) return { session: s, created: false };
  }
  const s = await createScheduledSession(task);
  return { session: s, created: true };
}

async function buildSystemPrompt(agent, skillIds) {
  const currentTime = new Date().toLocaleString('zh-CN');
  let prompt = agent?.systemPrompt || '';
  if (skillIds && skillIds.length > 0) {
    try {
      const r = await AgentClient.getAgentSkillPromptsFiltered(skillIds);
      if (r?.success && r.prompts) prompt += '\n\n' + r.prompts;
    } catch { /* 忽略技能加载失败 */ }
  }
  return `你是用户的 AI 助手，正在执行一个预先设定的定时任务。请严格按照任务指令完成并直接返回结果。
当前时间: ${currentTime}

${prompt}`.trim();
}

function waitForTabComplete(tabId, timeoutMs = 15000) {
  return new Promise((resolve) => {
    const start = Date.now();
    const check = async () => {
      try {
        const tab = await chrome.tabs.get(tabId);
        if (tab && tab.status === 'complete') { resolve(true); return; }
      } catch { resolve(false); return; }
      if (Date.now() - start > timeoutMs) { resolve(false); return; }
      setTimeout(check, 300);
    };
    check();
  });
}

async function readPageText(tabId) {
  try {
    let resp;
    try {
      resp = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT', maxLength: 12000 });
    } catch {
      // content script 可能尚未就绪，等待后重试一次
      await waitForTabComplete(tabId, 5000);
      resp = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT', maxLength: 12000 });
    }
    if (resp && resp.success && resp.data) {
      const d = resp.data;
      return `[网页上下文]\n标题: ${d.title || ''}\nURL: ${d.url || ''}\n内容:\n${d.content || ''}`;
    }
  } catch { /* 提取失败降级为仅 URL */ }
  return '';
}

/**
 * 提取指定网页的上下文：优先复用已打开 tab，否则新建并读取后关闭
 * @returns {Promise<{text: string, tabId: number|null, createdTabId: number|null}>}
 */
async function extractPageContext(url) {
  let tabId = null;
  let createdTabId = null;
  let text = '';
  try {
    let target = null;
    try {
      const u = new URL(url);
      const all = await chrome.tabs.query({});
      target = all.find((tab) => {
        try {
          const tu = new URL(tab.url || '');
          return tu.origin === u.origin && tu.pathname === u.pathname;
        } catch { return false; }
      }) || null;
    } catch { /* url 解析失败按无匹配处理 */ }

    if (target) {
      tabId = target.id;
    } else if (/^https?:/i.test(url)) {
      const tab = await chrome.tabs.create({ url, active: false });
      tabId = tab.id;
      createdTabId = tab.id;
      await waitForTabComplete(tabId, 15000);
    }

    if (tabId) {
      text = await readPageText(tabId);
    }
    if (!text) {
      text = `[网页上下文]\nURL: ${url}\n`;
    }
  } catch (e) {
    text = `[网页上下文]\nURL: ${url}\n`;
    logger.warn('[Scheduler] extractPageContext failed:', e);
  }
  return { text, tabId, createdTabId };
}

/**
 * 执行单个定时任务
 */
export async function runTask(taskId, force = false) {
  if (RUNNING.has(taskId)) {
    logger.debug('[Scheduler] task already running, skip:', taskId);
    return false;
  }
  let task = await getScheduledTask(taskId);
  if (!task) return false;
  if (!task.enabled && !force) return false;

  RUNNING.add(taskId);
  const runStartedAt = Date.now();
  let createdTabId = null;
  let ok = false;

  try {
    task = { ...task, lastStatus: 'running', lastRunAt: Date.now() };
    await putScheduledTask(task);

    // 1. 解析宿主会话（删除则自愈新建）
    const { session: hostSession, created } = await resolveHostSession(task);
    if (created) {
      task.sessionId = hostSession.id;
      await putScheduledTask(task);
    }

    // 2. 解析执行配置：任务覆盖 > 宿主会话 > 全局默认
    const agent = await loadAgent(task.agentId || hostSession.agentId);
    const config = await getStoredConfig();
    const model = task.model || hostSession.model || agent?.model || config.modelName;
    const useTools = pick(task.useTools, pick(hostSession.useTools, true));
    const agentId = task.agentId || hostSession.agentId || null;
    const agentToolIds = agent?.toolIds ?? null;
    const agentSkillIds = agent?.skillIds ?? null;
    const temperature = pick(task.temperature, pick(hostSession.temperature, config.temperature ?? 0.2));
    const topP = pick(task.topP, pick(hostSession.topP, config.topP ?? 1.0));
    const apiParams = { temperature, top_p: topP };

    // 3. 网页上下文（可选）
    let pageContext = '';
    let tabId = null;
    if (task.contextUrl) {
      if (task.contextMode === 'url_only') {
        pageContext = `[网页上下文]\nURL: ${task.contextUrl}\n`;
      } else {
        const pc = await extractPageContext(task.contextUrl);
        pageContext = pc.text;
        tabId = pc.tabId;
        createdTabId = pc.createdTabId;
      }
    }

    // 4. 构建消息
    const systemPrompt = await buildSystemPrompt(agent, agentSkillIds);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserContent(task, pageContext) },
    ];

    // 5. 执行
    const callId = 'st_' + taskId + '_' + Date.now().toString(36);
    let result;
    const tools = useTools ? await getTools(agentToolIds, agentId, agentSkillIds) : [];
    if (tools.length > 0) {
      const r = await reactLoop(messages, model, tools, tabId, apiParams, hostSession.id, null, null, { value: 0 }, [], callId);
      result = { content: r.content !== undefined ? r.content : r, executionLog: r.executionLog || [] };
    } else {
      const r = await callApiNonStream(messages, model, apiParams, hostSession.id, {}, callId);
      result = { content: r.content !== undefined ? r.content : r, executionLog: r.executionLog || [] };
    }

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    await appendRunMessages(hostSession.id, task, messages[1].content, content, result.executionLog);
    task = { ...task, lastStatus: 'success', lastError: null, lastRunAt: Date.now() };
    ok = true;
    logger.debug('[Scheduler] task completed:', taskId);
  } catch (e) {
    logger.error('[Scheduler] runTask failed:', taskId, e);
    const fresh = await getScheduledTask(taskId);
    task = { ...(fresh || task), lastStatus: 'failed', lastError: e?.message || String(e) };
    const failMsg = e?.message || String(e);
    try {
      if (task.sessionId) {
        await appendMessageToSession(task.sessionId, { role: 'assistant', content: t('sched.failed') + ': ' + failMsg });
      }
    } catch { /* 写失败说明不影响主流程 */ }
    // 失败通知：后台执行失败用户无感知，主动弹系统通知
    try {
      chrome.notifications.create('st_fail_' + taskId + '_' + Date.now(), {
        type: 'basic',
        iconUrl: chrome.runtime.getURL('icons/icon128.png'),
        title: t('sched.notifFailTitle'),
        message: t('sched.notifFailMsg', { name: task.name || '', error: failMsg }),
        priority: 2,
      });
    } catch { /* 通知失败忽略 */ }
  } finally {
    RUNNING.delete(taskId);
    // 运行历史（最多保留 50 条）
    const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
    runHistory.push({
      id: 'run_' + runStartedAt.toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      startedAt: runStartedAt,
      finishedAt: Date.now(),
      durationMs: Date.now() - runStartedAt,
      status: task.lastStatus,
      error: task.lastError || null,
    });
    task.runHistory = runHistory.slice(-50);
    // 一次性任务执行后停用
    if (task.schedule?.type === 'once') task.enabled = false;
    // 结束条件：达到最大执行次数 / 超过截止时间
    if (task.enabled && task.maxRuns != null && task.runHistory.length >= task.maxRuns) task.enabled = false;
    if (task.enabled && task.endAt != null && Date.now() >= task.endAt) task.enabled = false;
    task.nextRunAt = task.enabled ? computeNextRun(task) : null;
    task.updatedAt = Date.now();
    await putScheduledTask(task);
    scheduleTaskAlarm(task);
    if (createdTabId) {
      try { await chrome.tabs.remove(createdTabId); } catch { /* 忽略 */ }
    }
    // 通知侧边栏刷新会话（后台写入 IndexedDB 无法被侧边栏感知：可能新建了专属会话或追加了执行结果）
    if (task.sessionId) {
      chrome.runtime.sendMessage({ type: 'SCHEDULED_SESSION_UPDATED', sessionId: task.sessionId, taskId }).catch(() => {});
    }
  }
  return ok;
}

function buildUserContent(task, pageContext) {
  let content = `[${t('sched.userMsgPrefix')}: ${task.name || ''}]\n${task.prompt || ''}`;
  if (pageContext) content += '\n\n' + pageContext;
  return content;
}

async function appendRunMessages(sessionId, task, userContent, content, executionLog) {
  // 会话里记录的用户消息与真实发给模型的内容保持一致，便于回溯
  await appendMessageToSession(sessionId, { role: 'user', content: userContent });
  await appendMessageToSession(sessionId, { role: 'assistant', content, executionLog: executionLog || [] });
}

// ==================== 消息命令处理（供 index.js 路由） ====================

function normalizeTaskPayload(data) {
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

/**
 * 统一处理 SCHEDULED_TASK_* 消息
 * @returns {boolean} 是否异步 sendResponse
 */
export function handleScheduledTaskCommand(message, sendResponse) {
  const { type } = message;

  if (type === 'SCHEDULED_TASK_LIST') {
    (async () => {
      try {
        const tasks = (await getAllScheduledTasks()).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        sendResponse({ success: true, tasks });
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    })();
    return true;
  }

  if (type === 'SCHEDULED_TASK_CREATE' || type === 'SCHEDULED_TASK_UPDATE') {
    (async () => {
      try {
        const data = normalizeTaskPayload(message.task || {});
        if (!data.name || !data.prompt || !data.schedule || !['once', 'interval', 'cron'].includes(data.schedule.type)) {
          sendResponse({ success: false, error: t('sched.missingFields') });
          return;
        }
        // 定时规则校验：非法 cron/interval 会导致任务静默永不执行，保存时即拦截
        const s = data.schedule;
        if (s.type === 'cron' && !nextCronRun(s.value)) {
          sendResponse({ success: false, error: t('sched.invalidCron') });
          return;
        }
        if (s.type === 'interval' && !parseIntervalMinutes(s.value)) {
          sendResponse({ success: false, error: t('sched.invalidInterval') });
          return;
        }
        if (s.type === 'once' && s.onceMode === 'relative' && !parseIntervalMinutes(s.value)) {
          sendResponse({ success: false, error: t('sched.invalidInterval') });
          return;
        }
        const now = Date.now();
        let task;
        if (type === 'SCHEDULED_TASK_CREATE') {
          task = {
            id: 'st_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
            ...data,
            lastRunAt: null,
            nextRunAt: null,
            lastStatus: null,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          };
        } else {
          const existing = await getScheduledTask(message.task.id);
          if (!existing) { sendResponse({ success: false, error: t('sched.notFound') }); return; }
          task = { ...existing, ...data, id: existing.id, updatedAt: now };
        }
        task.nextRunAt = task.enabled ? computeNextRun(task) : null;
        await putScheduledTask(task);
        scheduleTaskAlarm(task);
        sendResponse({ success: true, task });
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    })();
    return true;
  }

  if (type === 'SCHEDULED_TASK_DELETE') {
    (async () => {
      try {
        await deleteScheduledTask(message.id);
        chrome.alarms.clear(alarmNameOf(message.id), () => {});
        sendResponse({ success: true });
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    })();
    return true;
  }

  if (type === 'SCHEDULED_TASK_TOGGLE') {
    (async () => {
      try {
        const task = await getScheduledTask(message.id);
        if (!task) { sendResponse({ success: false, error: t('sched.notFound') }); return; }
        task.enabled = !!message.enabled;
        task.nextRunAt = task.enabled ? computeNextRun(task) : null;
        task.updatedAt = Date.now();
        await putScheduledTask(task);
        scheduleTaskAlarm(task);
        sendResponse({ success: true, task });
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    })();
    return true;
  }

  if (type === 'SCHEDULED_TASK_RUN_NOW') {
    (async () => {
      try {
        const task = await getScheduledTask(message.id);
        if (!task) { sendResponse({ success: false, error: t('sched.notFound') }); return; }
        // force=true：即使任务已停用也允许手动立即执行
        const ok = await runTask(message.id, true);
        sendResponse({ success: ok });
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    })();
    return true;
  }

  return false;
}