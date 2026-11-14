// background/scheduler.js - 定时任务调度引擎
// 负责：任务 CRUD 编排、cron/一次性/间隔的 next-run 计算、chrome.alarms 注册/重建、触发执行

import { getStoredConfig } from './config.js';
import { getTools } from './tool-executor.js';
import { reactLoop, callApiNonStream, activeReactLoops } from './react-loop.js';
import { getActiveCallMap } from './active-call-registry.js';
import { willAutoResumeCheckpoint, startAutoResumeWatch } from './auto-resume.js';
import { createScheduledSession, appendMessageToSession } from '../storage/session-store.js';
import { getSession, getScheduledTask, getAllScheduledTasks, putScheduledTask, deleteScheduledTask, getReactCheckpoint } from '../storage/db.js';
import { BUILTIN_AGENTS } from '../shared/agent-defaults.js';
import { getEffectiveWorkdir } from '../shared/workdir-scope.js';
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
import { notifyTaskFeedback } from './notifier.js';
import { getActiveProfile, isModelInProfile } from '../shared/model-profiles.js';

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
    interrupted: '执行被中断（后台进程已重启，本次未完成）',
    sessionBusy: '宿主会话正在生成回复，本次触发已跳过，等待下一次调度',
    autoResumeExhausted: '自动续跑已达上限（{count} 次），本次执行未能完成',
    modelFallback: '原模型 {from} 在当前厂商（{vendor}）不可用，本次已改用 {to} 执行。',
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
    interrupted: 'Run was interrupted (the background process restarted before it finished)',
    sessionBusy: 'The host session is still generating a reply; this run was skipped and will wait for the next schedule',
    autoResumeExhausted: 'Auto-resume reached its limit ({count} attempts); this run could not finish',
    modelFallback: 'Model {from} is unavailable for the current vendor ({vendor}); this run used {to} instead.',
  },
});

const ALARM_PREFIX = 'st:';

// 运行中的任务集合，防止同一任务并发执行
const RUNNING = new Set();

// 宿主会话正忙时本轮跳过的重试间隔：不立刻重试（会形成忙循环），也不等到下一个完整周期
const SKIP_RETRY_MS = 2 * 60 * 1000;

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
    // 先对账、再建闹钟：建闹钟可能立刻触发 runTask，晚到的对账会把刚开始跑的任务误判为中断
    await reconcileInterruptedTasks(tasks);
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

/**
 * 对账「上次 SW 被回收时残留的 running 状态」。
 *
 * lastStatus='running' 只在 runTask 的 finally 里改回，SW 在长任务中间被回收时
 * finally 不会执行，任务会永久停在「运行中」，侧边栏入口一直转圈。
 * 这里在 SW 启动时（此时 RUNNING 必为空）区分两种残留：
 * - 会话还有 checkpoint 且 auto-resume 真的会接走：交给续跑收尾，状态由
 *   finishScheduledRunFromResume 回写，不能在这里误判失败；
 * - 没有 checkpoint，或 checkpoint 是终态 / 续跑次数已耗尽（不会再有人收尾）：
 *   本轮确实已经死了，标记失败并在会话里补一条中断说明。
 */
async function reconcileInterruptedTasks(tasks) {
  for (const task of tasks) {
    if (task.lastStatus !== 'running' || RUNNING.has(task.id)) continue;
    let checkpoint = null;
    if (task.sessionId) {
      try {
        checkpoint = await getReactCheckpoint(task.sessionId);
      } catch { /* 读 checkpoint 失败按「无 checkpoint」处理 */ }
    }
    if (checkpoint && willAutoResumeCheckpoint(checkpoint, activeReactLoops)) {
      // 交给 auto-resume 收尾；但它的唤醒闹钟可能已随浏览器重启丢失，
      // 这里补一次 watch（引用计数，重复调用安全），否则任务会一直停在 running
      startAutoResumeWatch();
      continue;
    }
    // 二次确认：读 checkpoint 是异步的，这期间新的一拍 runTask 可能已经接管该任务，
    // 此时不能把它的 running 覆盖成 failed（会写假失败记录 + 抹掉正在跑的 lastRunAt）
    let fresh = null;
    try {
      fresh = await getScheduledTask(task.id);
    } catch { /* 读失败就按启动快照处理 */ }
    if (RUNNING.has(task.id)) continue;
    if (fresh && (fresh.lastStatus !== 'running' || fresh.lastRunAt !== task.lastRunAt)) continue;
    const now = Date.now();
    const target = fresh || task;
    const startedAt = target.lastRunAt || now;
    target.lastStatus = 'failed';
    target.lastError = t('sched.interrupted');
    target.updatedAt = now;
    const runHistory = Array.isArray(target.runHistory) ? target.runHistory : [];
    runHistory.push({
      id: 'run_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6),
      startedAt,
      finishedAt: now,
      durationMs: Math.max(0, now - startedAt),
      status: 'failed',
      error: target.lastError,
    });
    target.runHistory = runHistory.slice(-50);
    await putScheduledTask(target);
    if (target.sessionId) {
      try {
        await appendMessageToSession(target.sessionId, {
          role: 'assistant',
          content: t('sched.failed') + ': ' + target.lastError,
        });
      } catch { /* 会话已删除时忽略 */ }
    }
    chrome.runtime.sendMessage({
      type: 'SCHEDULED_TASK_RUN_STATE',
      taskId: target.id,
      sessionId: target.sessionId,
      running: false,
    }).catch(() => {});
    logger.warn('[Scheduler] reconciled interrupted run:', target.id);
  }
}

/**
 * 自动续跑收尾后回写定时任务状态。
 *
 * 定时任务跑到一半 SW 被回收时，runTask 的 finally 不会执行，任务会一直停在
 * lastStatus='running'；auto-resume 续跑成功后回答已经落库，但入口图标还在转圈。
 * 这里按会话的 scheduledTaskId 找到任务，按续跑结果收尾（与 runTask 的 finally 同构）。
 * 注意：一个会话可能绑定多个任务（sessionTarget=current 的默认行为），所以必须先看
 * 会话上的 scheduledTaskId，再退回「该会话下正在 running 的那个」，不能只按 sessionId 取第一个。
 * @param {string} sessionId 会话 id
 * @param {{success: boolean, error?: string}} outcome
 */
export async function finishScheduledRunFromResume(sessionId, outcome = {}) {
  if (!sessionId) return false;
  let task = null;
  try {
    const session = await getSession(sessionId);
    if (session?.scheduledTaskId) task = await getScheduledTask(session.scheduledTaskId);
    if (!task) {
      const all = await getAllScheduledTasks();
      task = all.find((s) => s.sessionId === sessionId && s.lastStatus === 'running')
        || all.find((s) => s.sessionId === sessionId)
        || null;
    }
  } catch { /* 读库失败按无任务处理 */ }
  if (!task) return false;
  if (RUNNING.has(task.id)) return false; // 正常执行中，别抢它的收尾
  // 任务已不在 running（对账已收尾 / 根本没轮到它执行）：不能凭空补一条执行记录
  if (task.lastStatus !== 'running') return false;

  const now = Date.now();
  const startedAt = task.lastRunAt || now;
  task.lastStatus = outcome.success ? 'success' : 'failed';
  task.lastError = outcome.success ? null : (outcome.error || t('sched.interrupted'));
  const runHistory = Array.isArray(task.runHistory) ? task.runHistory : [];
  runHistory.push({
    id: 'run_' + now.toString(36) + '_' + Math.random().toString(36).slice(2, 6),
    startedAt,
    finishedAt: now,
    durationMs: Math.max(0, now - startedAt),
    status: task.lastStatus,
    error: task.lastError,
  });
  task.runHistory = runHistory.slice(-50);
  if (shouldDisableAfterRun(task)) task.enabled = false;
  task.nextRunAt = task.enabled ? computeNextRun(task) : null;
  task.updatedAt = now;
  await putScheduledTask(task);
  scheduleTaskAlarm(task);
  chrome.runtime.sendMessage({
    type: 'SCHEDULED_TASK_RUN_STATE',
    taskId: task.id,
    sessionId,
    running: false,
  }).catch(() => {});
  logger.debug('[Scheduler] reconciled task state after auto-resume:', task.id, task.lastStatus);
  return true;
}

/**
 * 该会话是否正被定时任务执行中。
 *
 * 供 GET_CHECKPOINT 判断会话活跃度：定时任务执行期间 checkpoint 一直存在，
 * 若只看 checkpoint 是否残留，会把「正在执行」误判成「任务被中断」并弹「继续执行」卡片。
 * @param {string} sessionId
 * @returns {Promise<boolean>}
 */
export async function isScheduledSessionRunning(sessionId) {
  if (!sessionId) return false;
  try {
    const tasks = await getAllScheduledTasks();
    return tasks.some((task) => task.sessionId === sessionId && task.lastStatus === 'running');
  } catch {
    return false;
  }
}

// 顶层同步注册闹钟监听（MV3 唤醒依赖；SW 终止竞态下 alarms 可能被剥离，可选链保护）
chrome.alarms?.onAlarm?.addListener?.((alarm) => {
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
 * 解析宿主会话：存在则复用，被删除或被归档则自动新建专属会话
 *
 * 归档会话对用户已不可见（不进标签栏/会话列表/全局搜索），继续往里写执行结果
 * 等于把结果写进一个用户看不见的地方，所以按「不存在」处理并重建专属会话。
 */
async function resolveHostSession(task) {
  if (task.sessionId) {
    const s = await getSession(task.sessionId);
    if (s && !s.archivedAt) return { session: s, created: false };
  }
  const s = await createScheduledSession(task);
  return { session: s, created: true };
}

async function buildSystemPrompt(agent, skillIds, workdir = '') {
  const currentTime = new Date().toLocaleString('zh-CN');
  let prompt = agent?.systemPrompt || '';
  if (skillIds && skillIds.length > 0) {
    try {
      const r = await AgentClient.getAgentSkillPromptsFiltered(skillIds);
      if (r?.success && r.prompts) prompt += '\n\n' + r.prompts;
    } catch { /* 忽略技能加载失败 */ }
  }
  // 工作目录必须按定时任务的目标会话注入（不读全局单例），否则模型会猜错路径
  const workdirLine = workdir ? `\n\n当前工作目录: ${workdir}\n（相对路径均基于该目录；需明确路径时请直接拼出绝对路径。）` : '';
  return `你是用户的 AI 助手，正在执行一个预先设定的定时任务。请严格按照任务指令完成并直接返回结果。
当前时间: ${currentTime}${workdirLine}

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
  // 模型被自动回退时填充（成功/失败分支都要在结果中提示）
  let modelFallbackNote = '';
  // 宿主会话 id 与「用户问题是否已落库」：失败分支要靠它们补齐/写失败说明
  let hostSessionId = null;
  let userMessageWritten = false;
  // 本轮 callId：成功/失败都要带上广播终态，面板镜像据此收尾与落库去重
  let callId = null;

  try {
    // 1. 解析宿主会话（删除/归档则自愈新建）
    const { session: hostSession, created } = await resolveHostSession(task);
    hostSessionId = hostSession.id;
    if (created) {
      task.sessionId = hostSession.id;
      await putScheduledTask(task);
    }

    // 1.5 宿主会话正忙（用户自己那一轮还没结束）：绝不并行起第二个循环。
    // 同一 sessionId 上并发会让 ReAct checkpoint 互相覆盖、activeReactLoops 被提前 delete、
    // active call 登记被顶掉（面板 reattach 失效）。本轮跳过，稍后重试，不消耗一次性任务的机会。
    if (activeReactLoops.has(hostSession.id) || getActiveCallMap()[hostSession.id]) {
      task = { ...task, lastStatus: 'skipped', lastError: t('sched.sessionBusy') };
      logger.warn('[Scheduler] host session busy, skip this run:', taskId, hostSession.id);
      return false;
    }

    // 1.6 标记运行中并广播（入口图标 / 停靠条）
    task = { ...task, lastStatus: 'running', lastRunAt: Date.now() };
    await putScheduledTask(task);
    chrome.runtime.sendMessage({ type: 'SCHEDULED_TASK_RUN_STATE', taskId, running: true }).catch(() => {});
    // 停靠条需要「哪个会话在被定时任务驱动」：taskId 只能让入口图标动起来，
    // 会话维度的停靠条目必须带上 sessionId
    chrome.runtime.sendMessage({
      type: 'SCHEDULED_TASK_RUN_STATE',
      taskId,
      sessionId: hostSession.id,
      running: true,
    }).catch(() => {});

    // 2. 解析执行配置：任务覆盖 > 宿主会话 > 全局默认
    const agent = await loadAgent(task.agentId || hostSession.agentId);
    const config = await getStoredConfig();
    let model = task.model || hostSession.model || agent?.model || config.modelName;
    // 一致性校验：候选模型可能来自创建时的历史配置（宿主会话/Agent 绑定），
    // 用户切换厂商后连接（apiBase/apiKey）已指向新厂商，历史模型名与其错配
    // 会触发 model_not_found。不属于当前激活厂商时回退到当前厂商的默认模型。
    if (model !== config.modelName) {
      try {
        const activeProfile = await getActiveProfile();
        if (activeProfile && !isModelInProfile(model, activeProfile)) {
          logger.warn(`[Scheduler] model "${model}" not in active profile "${activeProfile.name}", fallback to "${config.modelName}"`);
          modelFallbackNote = t('sched.modelFallback', { from: model, to: config.modelName, vendor: activeProfile.name });
          model = config.modelName;
        }
      } catch { /* 校验异常不阻塞执行：保持原模型，由调用阶段报错 */ }
    }
    const useTools = pick(task.useTools, pick(hostSession.useTools, true));
    const agentId = task.agentId || hostSession.agentId || null;
    const agentToolIds = agent?.toolIds ?? null;
    const agentSkillIds = agent?.skillIds ?? null;
    const agentMcpExcludedServerIds = agent?.mcpExcludedServerIds ?? null;
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

    // 4. 构建消息（目录按定时任务的宿主会话解析：已绑定用绑定值，未绑定用代理默认）
    let scheduledWorkdir = '';
    try {
      scheduledWorkdir = (await getEffectiveWorkdir(hostSession.id)) || '';
    } catch (e) {
      logger.warn('[Scheduler] resolve workdir failed:', e?.message || e);
    }
    const systemPrompt = await buildSystemPrompt(agent, agentSkillIds, scheduledWorkdir);
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: buildUserContent(task, pageContext) },
    ];

    // 4.5 用户问题立即落库：模型调用可能持续很久（工具调用/生图/长文本），
    // 若等跑完再写，执行期间点进会话只能看到空白；失败或被中断时更是永远没有「问题」。
    // 展示用消息不含网页正文（正文只在本次模型 messages 里），网页以引用气泡呈现。
    await appendRunUserMessage(hostSession.id, task, pageMeta, runStartedAt);
    userMessageWritten = true;
    // 让面板立刻看到本轮问题（phase=started 只重载内容，不标记「已完成待查看」）
    chrome.runtime.sendMessage({
      type: 'SCHEDULED_SESSION_UPDATED',
      sessionId: hostSession.id,
      taskId,
      phase: 'started',
    }).catch(() => {});
    // 停靠条按 sessionId 收起/展开该会话的定时来源（启动时还不知道宿主会话，故此处再播一次）
    chrome.runtime.sendMessage({
      type: 'SCHEDULED_TASK_RUN_STATE',
      taskId,
      sessionId: hostSession.id,
      running: true,
    }).catch(() => {});

    // 5. 执行
    callId = 'st_' + taskId + '_' + Date.now().toString(36);
    // 定时任务也登记为可重连：面板打开这个会话时能正常 reattach，看到与普通会话一致的
    // 流式输出 / 执行中状态 / 停止按钮。作为交换，结束时必须广播 API_COMPLETE / API_ERROR，
    // 否则镜像会永远停在「生成中」。
    const reattachOptions = { reattachable: true };
    let result;
    const tools = useTools ? await getTools(agentToolIds, agentId, agentSkillIds, null, agentMcpExcludedServerIds) : [];
    if (tools.length > 0) {
      const r = await reactLoop(messages, model, tools, tabId, apiParams, hostSession.id, null, null, { value: 0 }, [], callId, null, reattachOptions);
      result = { content: r.content !== undefined ? r.content : r, executionLog: r.executionLog || [] };
    } else {
      // callApiNonStream 不返回 executionLog，token 用量在顶层 r.usage，
      // 需包装成 api_call 日志节点，否则结果底部不显示 token 消耗
      const r = await callApiNonStream(messages, model, apiParams, hostSession.id, {}, callId, reattachOptions);
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
    // 模型被自动回退时在结果开头注明（charCode 10 为换行符，空行分隔提示与正文）
    const finalContent = modelFallbackNote ? modelFallbackNote + String.fromCharCode(10, 10) + content : content;
    const fullLog = result.executionLog || [];
    // 落库保留完整日志；只有广播给面板的 payload 做截断（镜像只是展示，且要考虑消息体积）
    await appendMessageToSession(hostSession.id, {
      role: 'assistant',
      content: finalContent,
      executionLog: fullLog,
      timestamp: new Date().toISOString(),
      // 幂等键：面板 reattach 镜像也会用同一 callId 落库，避免同一条回答写两次
      callId: callId || undefined,
    });
    // 广播终态：面板若正开着这个会话，镜像据此收尾（否则气泡会永远停在「生成中」）
    chrome.runtime.sendMessage({
      type: 'API_COMPLETE',
      sessionId: hostSession.id,
      callId,
      content: finalContent,
      executionLog: truncateRunLog(fullLog),
      reflectionScore: result.reflectionScore,
      reasoningContent: result.reasoningContent || null,
      wasRevised: result.wasRevised || false,
      budgetEnded: result.budgetEnded === true,
      exhaustedBy: result.exhaustedBy || null,
    }).catch(() => {});
    // 成功通知（受 scheduledNotificationEnabled 开关控制；定时任务无面板实例，不做可见性抑制）
    notifyTaskFeedback({ success: true, sessionId: task.sessionId, name: task.name, source: 'scheduled' }).catch(() => {});
    task = { ...task, lastStatus: 'success', lastError: null, lastRunAt: Date.now() };
    ok = true;
    logger.debug('[Scheduler] task completed:', taskId);
  } catch (e) {
    logger.error('[Scheduler] runTask failed:', taskId, e);
    const fresh = await getScheduledTask(taskId);
    task = { ...(fresh || task), lastStatus: 'failed', lastError: e?.message || String(e) };
    const failMsg = e?.message || String(e);
    try {
      const targetSessionId = hostSessionId || task.sessionId;
      if (targetSessionId) {
        // 失败发生在写用户问题之前（配置解析、网页抓取等）：先补上问题，
        // 否则这个会话只剩一条「失败」，用户看不出失败的是哪次任务。
        if (!userMessageWritten) await appendRunUserMessage(targetSessionId, task, null, runStartedAt);
        const failContent = t('sched.failed') + ': ' + failMsg
          + (modelFallbackNote ? String.fromCharCode(10, 10) + modelFallbackNote : '');
        await appendMessageToSession(targetSessionId, {
          role: 'assistant',
          content: failContent,
          timestamp: new Date().toISOString(),
          callId: callId || undefined,
        });
        // 同步终态：面板镜像要收尾，否则气泡停「生成中」（同一 callId 落库会自动合并）
        if (callId) {
          chrome.runtime.sendMessage({
            type: 'API_ERROR',
            sessionId: targetSessionId,
            callId,
            error: failContent,
            executionLog: [],
          }).catch(() => {});
        }
      }
    } catch { /* 写失败说明不影响主流程 */ }
    // 失败通知：后台执行失败用户无感知，主动弹系统通知（受 scheduledNotificationEnabled 开关控制）
    notifyTaskFeedback({ success: false, sessionId: task.sessionId, name: task.name, error: failMsg, source: 'scheduled' }).catch(() => {});
  } finally {
    RUNNING.delete(taskId);
    const skipped = task.lastStatus === 'skipped';
    if (!skipped) {
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
    } else {
      // 跳过的这一拍不算真实执行：不写运行历史、不消耗 maxRuns/一次性任务的执行机会，
      // 只把下一次触发推迟到 SKIP_RETRY_MS 之后（避免用已过去的 nextRunAt 立刻重触发）
      task.nextRunAt = task.enabled ? Date.now() + SKIP_RETRY_MS : null;
    }
    task.updatedAt = Date.now();
    await putScheduledTask(task);
    if (skipped && task.enabled) {
      chrome.alarms.create(alarmNameOf(task.id), { when: task.nextRunAt });
    } else {
      scheduleTaskAlarm(task);
    }
    if (createdTabId) {
      try { await chrome.tabs.remove(createdTabId); } catch { /* 忽略 */ }
    }
    // 通知侧边栏刷新会话（后台写入 IndexedDB 无法被侧边栏感知：可能新建了专属会话或追加了执行结果）
    // 跳过的这一拍没有写会话，不需要重载
    if (task.sessionId && !skipped) {
      chrome.runtime.sendMessage({ type: 'SCHEDULED_SESSION_UPDATED', sessionId: task.sessionId, taskId }).catch(() => {});
    }
    // 通知侧边栏：任务执行结束（入口图标停止「运行中」动效 + 停靠条收起该会话的定时来源）
    chrome.runtime.sendMessage({
      type: 'SCHEDULED_TASK_RUN_STATE',
      taskId,
      sessionId: task.sessionId,
      running: false,
    }).catch(() => {});
  }
  return ok;
}

/**
 * 终态广播用的日志截断：超长时保留尾部，但 subtask_plan 条目必须留下
 * （它是「计划了哪些子任务」的唯一载体且位于最前端，纯尾部切片会丢）
 */
function truncateRunLog(log, limit = 1000) {
  if (!Array.isArray(log) || log.length <= limit) return log || [];
  const tail = log.slice(-limit);
  const tailIds = new Set(tail.map((e) => e && e.id));
  const plans = log.filter((e) => e && e.nodeType === 'subtask_plan' && !tailIds.has(e.id));
  return plans.length ? [...plans, ...tail] : tail;
}

function buildUserContent(task, pageContext) {
  let content = `[${t('sched.userMsgPrefix')}: ${task.name || ''}]\n${task.prompt || ''}`;
  if (pageContext) content += '\n\n' + pageContext;
  return content;
}

async function appendRunUserMessage(sessionId, task, pageMeta, startedAt) {
  // 展示用用户消息只含任务指令；网页正文仅在本次模型调用的 messages 中传给模型，不铺进对话。
  // 网页以「引用」气泡（contextBubbles: page）呈现在问题上方，与手动选择网页的效果一致。
  // 时间戳用本轮开始时刻：用户问的是「任务什么时候触发」，不是「任务什么时候跑完」。
  const userMessage = {
    role: 'user',
    content: buildUserContent(task, ''),
    timestamp: new Date(startedAt || Date.now()).toISOString(),
  };
  if (pageMeta && pageMeta.url) {
    userMessage.contextBubbles = [{ type: 'page', title: pageMeta.title || pageMeta.url, url: pageMeta.url }];
  }
  await appendMessageToSession(sessionId, userMessage);
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