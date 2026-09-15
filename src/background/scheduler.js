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
import {
  pick,
  nextCronRun,
  parseIntervalMinutes,
  computeNextRun,
  shouldDisableAfterRun,
  normalizeTaskPayload,
} from './scheduler-rules.js';

// 兼容外部可能的具名导入
export { nextCronRun, parseIntervalMinutes, computeNextRun, shouldDisableAfterRun, normalizeTaskPayload };

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function formatPageContext(d) {
  return `[网页上下文]\n标题: ${d.title || ''}\nURL: ${d.url || ''}\n内容:\n${d.content || ''}`;
}

// scripting 兜底注入：函数会被序列化到页面内执行，必须完全自包含
function injectedPageText(maxLength) {
  try {
    const root = document.body || document.documentElement;
    const clone = root.cloneNode(true);
    clone.querySelectorAll('script,style,noscript,template,svg,canvas').forEach((n) => n.remove());
    let text = (clone.innerText || clone.textContent || '')
      .replace(/[ \t ]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
    if (text.length > maxLength) text = text.slice(0, maxLength);
    return { success: true, data: { title: document.title || '', url: location.href, content: text } };
  } catch (e) {
    return { success: false, error: String(e) };
  }
}

async function readPageText(tabId) {
  // 1. content script 通道：短轮询，兼容新建 tab 时 content script 尚未就绪
  for (let i = 0; i < 3; i++) {
    try {
      const resp = await chrome.tabs.sendMessage(tabId, { type: 'GET_PAGE_TEXT', maxLength: 12000 });
      if (resp && resp.success && resp.data) return { text: formatPageContext(resp.data), title: resp.data.title || '' };
    } catch {
      // 通道未就绪（常见于扩展安装/更新前打开的旧 tab，content script 未注入）
    }
    await sleep(400);
  }
  // 2. 通道不可用时，用 scripting API 直接注入提取函数读 DOM 兜底
  try {
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: injectedPageText,
      args: [12000],
    });
    const r = results && results[0] && results[0].result;
    if (r && r.success && r.data) return { text: formatPageContext(r.data), title: r.data.title || '' };
  } catch (e) {
    // chrome:// 等受限页面无法注入，降级为仅 URL
    logger.warn('[Scheduler] scripting fallback failed:', e);
  }
  return { text: '', title: '' };
}

/**
 * 提取指定网页的上下文：优先复用已打开 tab，否则新建并读取后关闭
 * @returns {Promise<{text: string, title: string, tabId: number|null, createdTabId: number|null}>}
 */
async function extractPageContext(url) {
  let tabId = null;
  let createdTabId = null;
  let text = '';
  let title = '';
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
      const r = await readPageText(tabId);
      text = r.text;
      title = r.title;
    }
    if (!text) {
      text = `[网页上下文]\nURL: ${url}\n`;
    }
  } catch (e) {
    text = `[网页上下文]\nURL: ${url}\n`;
    logger.warn('[Scheduler] extractPageContext failed:', e);
  }
  return { text, title, tabId, createdTabId };
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
    let pageMeta = null;
    if (task.contextUrl) {
      if (task.contextMode === 'url_only') {
        pageContext = `[网页上下文]\nURL: ${task.contextUrl}\n`;
        pageMeta = { url: task.contextUrl, title: '' };
      } else {
        const pc = await extractPageContext(task.contextUrl);
        pageContext = pc.text;
        tabId = pc.tabId;
        createdTabId = pc.createdTabId;
        pageMeta = { url: task.contextUrl, title: pc.title || '' };
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
      // callApiNonStream 不返回 executionLog，token 用量在顶层 r.usage，
      // 需包装成 api_call 日志节点，否则结果底部不显示 token 消耗
      const r = await callApiNonStream(messages, model, apiParams, hostSession.id, {}, callId);
      const executionLog = r.usage ? [{
        id: 'st_api_' + Date.now().toString(36),
        iteration: 1,
        timestamp: new Date().toISOString(),
        status: 'success',
        nodeType: 'api_call',
        apiResponse: { tokenUsage: r.usage },
      }] : [];
      result = { content: r.content !== undefined ? r.content : r, executionLog };
    }

    const content = typeof result.content === 'string' ? result.content : JSON.stringify(result.content);
    await appendRunMessages(hostSession.id, task, content, result.executionLog, pageMeta);
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
    // 停用条件：一次性任务执行完 / 达到最大执行次数 / 超过截止时间
    if (shouldDisableAfterRun(task)) task.enabled = false;
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

async function appendRunMessages(sessionId, task, content, executionLog, pageMeta) {
  // 展示用用户消息只含任务指令；网页正文仅在本次模型调用的 messages 中传给模型，不铺进对话。
  // 网页以「引用」气泡（contextBubbles: page）呈现在问题上方，与手动选择网页的效果一致。
  // 用户消息记录真实执行时刻，供对话面板展示发问时间戳
  const runTimestamp = new Date().toISOString();
  const userMessage = {
    role: 'user',
    content: buildUserContent(task, ''),
    timestamp: runTimestamp,
  };
  if (pageMeta && pageMeta.url) {
    userMessage.contextBubbles = [{ type: 'page', title: pageMeta.title || pageMeta.url, url: pageMeta.url }];
  }
  await appendMessageToSession(sessionId, userMessage);
  await appendMessageToSession(sessionId, { role: 'assistant', content, executionLog: executionLog || [], timestamp: runTimestamp });
}

// ==================== 消息命令处理（供 index.js 路由） ====================

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
        // 先解析宿主会话（快），立即把 sessionId 返给侧边栏用于定位/滚动等待结果；
        // 模型执行耗时长，异步进行，不阻塞响应（force=true 允许手动立即执行）
        let sessionId = task.sessionId || null;
        try {
          const { session, created } = await resolveHostSession(task);
          sessionId = session.id;
          if (created) {
            task.sessionId = session.id;
            await putScheduledTask(task);
          }
        } catch { /* 会话解析失败交给 runTask 兜底 */ }
        runTask(message.id, true).catch((e) => logger.error('[Scheduler] run now failed:', message.id, e));
        sendResponse({ success: true, sessionId });
      } catch (e) { sendResponse({ success: false, error: e.message }); }
    })();
    return true;
  }

  return false;
}