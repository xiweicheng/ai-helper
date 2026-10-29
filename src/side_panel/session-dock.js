/**
 * session-dock.js - 执行中会话停靠条
 *
 * 背景：会话一多，正在跑的任务就被埋在标签栏深处。用户要点开好几个会话才能确认
 * 「哪个在跑、跑到哪了、有没有跑完」，切来切去很费劲。
 *
 * 方案：在左侧边缘竖着排一列状态芯片，只放「不是当前会话」的执行条目：
 *   - 执行中：会话标题首字符 + 呼吸光晕，悬停显示当前任务的用户问题 + ReAct 节点 / 子任务进度
 *   - 排队中：右下角条数徽标（会话还没开始跑，但用户需要知道它在等）
 *   - 已完成：✓ + 一次性高亮脉冲，点进去自动移除，也可手动 × 移除
 *
 * 悬停提示的主行是「用户问题」而不是会话标题：标题由首条用户消息截断前 50 字得来，
 * 一个会话跑到第五轮时，标题还挂在第一个问题上，用户据此根本对不上是哪个任务。
 * 标题只在「和问题不是同一句话」时降为副行小字。
 *
 * 两个必须留意的边界（都源自「一次可能同时跑十几个会话」）：
 *   1. 位置有限：整条只占 MAX_CHIPS 个位置，放不下时末位换成 +N 聚合芯片，
 *      悬停/点击展开正常宽度的溢出面板。26px 宽的芯片列里塞滚动条是没法用的，
 *      所以滚动放在溢出面板里。同阶段按时间倒序，被折叠的一定是最老的。
 *   2. 状态会脏：「执行中」是后台权威集合与面板本地集合的并集，本地那两路
 *      （generatingSessionIds / pendingCallApiSessionIds）只要有一条异常分支没走
 *      notifyGenerationEnded 就会永久留着，此时后台早就说「不在跑」了。所以加陈旧
 *      降级：后台不再报告 + 超时没有执行更新 → 转灰、停动效、允许 × 掉。
 *
 * 数据源全部复用现有信号，本模块不新建「运行状态」：
 *   后台 QUERY_SESSION_RUNNING（权威）、state.generatingSessionIds /
 *   pendingCallApiSessionIds（面板本地的跨会话派发记账）、state.completedSessionIds
 *   （完成待查看，已持久化）、queue-store（排队条数）、EXECUTION_STATUS_UPDATE
 *   （当前节点名/子任务进度）、SCHEDULED_TASK_RUN_STATE（定时任务来源）。
 */

import state from './state.js';
import * as queueStore from './queue-store.js';
import { getSession } from '../storage/db.js';
import { extractTextFromContent } from '../shared/token-counter.js';
import { handleSessionSwitch } from './session-manager-ui.js';
import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  dock: {
    ariaLabel: '执行中会话',
    running: '正在执行',
    node: '正在执行：{node}',
    subtask: '子任务 {index}/{total}',
    queued: '排队 {count} 条',
    done: '已完成，点击查看结果',
    doneAt: '已完成 {time}',
    scheduled: '定时任务',
    dismiss: '从停靠条移除',
    dismissStale: '移除失效条目',
    stale: '状态可能已失效 · 未在限定时间内收到执行更新',
    more: '还有 {count} 个',
    moreAria: '还有 {count} 个未显示的执行条目',
    overflowTitle: '其他执行中的会话',
    openSession: '点击进入该会话',
    unknownSession: '未知会话',
  },
});
registerTranslations('en', {
  dock: {
    ariaLabel: 'Running sessions',
    running: 'Running',
    node: 'Running: {node}',
    subtask: 'Subtask {index}/{total}',
    queued: '{count} queued',
    done: 'Finished — click to review',
    doneAt: 'Finished {time}',
    scheduled: 'Scheduled task',
    dismiss: 'Remove from dock',
    dismissStale: 'Remove stale entry',
    stale: 'Status may be stale · no execution update in time',
    more: '+{count} more',
    moreAria: '{count} more running entries not shown',
    overflowTitle: 'Other active sessions',
    openSession: 'Click to open this session',
    unknownSession: 'Unknown session',
  },
});

/** 关闭条目后记住的存储键（刷新后不再复活，该会话下次开跑时自动解除） */
const DISMISSED_KEY = 'sessionDockDismissed';
/** 轮询后台运行集合的间隔（仅面板可见时） */
const POLL_MS = 5000;
/** 渲染去抖（EXECUTION_STATUS_UPDATE 高频到达） */
const RENDER_DEBOUNCE_MS = 250;
/** 完成态高亮脉冲的类名保留时长（与 CSS 动画时长对齐） */
const DONE_FLASH_MS = 1200;
/**
 * 停靠条整条最多占用的位置数。
 * 条目放得下就全放条目；放不下时最后 1 个位置给 +N 聚合芯片。
 */
const MAX_CHIPS = 8;
/** 溢出时真实条目占的位数（剩下 1 位是聚合芯片） */
const MAX_INLINE_ENTRIES = MAX_CHIPS - 1;
/**
 * 「执行中」多久没有任何动静就判为状态可能已失效（毫秒）。
 * 只在后台权威集合已经不认这个会话时才起作用，真在跑的永远不会被判陈旧。
 */
const STALE_MS = 90000;

const PHASE_RANK = { running: 0, queued: 1, done: 2 };

/** sessionId -> { nodeName, subtaskIndex, subtaskTotal } */
const nodeInfo = new Map();
/** sessionId -> 首次观测到执行的时间戳 */
const startedAt = new Map();
/** sessionId -> 观测到完成的时间戳 */
const doneAt = new Map();
/** sessionId -> 最后一次收到 EXECUTION_STATUS_UPDATE 的时间戳（陈旧判定基准） */
const lastUpdateAt = new Map();
/** 定时任务发起的会话 */
const scheduledIds = new Set();
/** 用户手动 × 掉的会话（完成态与失效条目生效） */
const dismissedIds = new Set();
/** sessionId -> 标题缓存（会话刚被后台创建、state.sessions 还没刷新时兜底） */
const titleCache = new Map();
/**
 * sessionId -> { text, stamp }：当前这一轮执行的用户问题。
 * stamp 取该轮的 startedAt / doneAt，所以「同一会话又开了一轮新任务」会自动失效重取。
 */
const questionCache = new Map();
/** 正在补标题/问题的会话，避免重复查库 */
const labelPending = new Set();
/** 后台权威运行集合 */
let runningIds = new Set();
/** 当前已渲染条目（供调度判断是否需要重绘） */
let currentEntries = [];
/** 刚进入完成态的会话：加一次性高亮脉冲 */
let flashIds = new Set();

let dockEl = null;
let tipEl = null;
/** 溢出面板（+N 芯片展开的那个正常宽度列表） */
let overflowEl = null;
/** 当前被折叠进溢出面板的条目 */
let overflowEntries = [];
/** 溢出面板是否处于展开状态（点击钉住，鼠标移开也不收） */
let overflowPinned = false;
let renderTimer = null;
let pollTimer = null;
let inited = false;
let doneFlashTimer = null;
let overflowCloseTimer = null;

function toArray(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  if (value instanceof Set) return Array.from(value);
  return [];
}

/**
 * 判断一个「执行中」条目是不是已经失效（纯函数）。
 *
 * 为什么需要：面板本地集合只要有一条异常分支漏收尾就会永久留着「还在跑」，
 * 而停靠条取的是并集，本地脏数据会盖过后台的权威「不在跑」——条目会一直转圈且删不掉。
 *
 * 三个条件必须同时成立才算陈旧，避开误伤：
 *   ① 只对 running 生效：queued 来自 queue-store 的持久数据，done 本来就是终态
 *   ② 后台权威集合已经不认这个会话（还在报告的一律不判）
 *   ③ 距最后一次执行更新 / 首次观测到运行超过 staleMs
 * 没有任何时间基准（两个时间戳都是 0）时也不判，宁可少报不可误报。
 *
 * @param {Object} input
 * @returns {boolean}
 */
export function isEntryStale({
  phase = '',
  sessionId = null,
  backendRunningIds = [],
  startedAt: started = 0,
  lastUpdateAt: lastUpdate = 0,
  now = Date.now(),
  staleMs = STALE_MS,
} = {}) {
  if (phase !== 'running' || !sessionId) return false;
  if (toArray(backendRunningIds).includes(sessionId)) return false;
  const anchor = Math.max(Number(started) || 0, Number(lastUpdate) || 0);
  if (!anchor) return false;
  return now - anchor >= staleMs;
}

/**
 * 主行最多保留的字符数。tooltip 只有 220px 宽，再长就靠 CSS 截断；
 * 这里先截一道是为了不把整段几千字的提问原样塞进 DOM。
 */
const MAX_LABEL_CHARS = 160;

/**
 * 把用户消息压成一行可显示的文本（纯函数）。
 * 换行/连续空白全部压成单空格：tooltip 靠 CSS 做两行截断，原文里的换行只会把布局顶乱。
 *
 * @param {string} raw
 * @returns {string}
 */
export function normalizeLabel(raw) {
  const text = String(raw ?? '').replace(/\s+/g, ' ').trim();
  if (!text) return '';
  const chars = Array.from(text);
  if (chars.length <= MAX_LABEL_CHARS) return text;
  return `${chars.slice(0, MAX_LABEL_CHARS).join('').trimEnd()}…`;
}

/**
 * 标题和主行是不是「同一句话」（纯函数）。
 *
 * 会话标题就是首条用户消息的前 50 字（session-store 里 substring(0, 50)），
 * 所以单轮会话里两者必然后一个包含前一个，副行只会是重复信息。
 * 比对前先去掉末尾省略号，并且**丢掉全部空白**：标题里的空格是原文换行被
 * `replace(/\n/g, ' ')` 换出来的，而截断也可能落在词中，不忽略空白就会漏判，
 * 结果就是副行把同一句话重播一遍。
 *
 * @returns {boolean}
 */
export function isSameLabel(title, primary) {
  const strip = (s) => String(s ?? '').trim().replace(/[…\s.]+$/, '').replace(/\s+/g, '');
  const a = strip(title);
  const b = strip(primary);
  if (!a || !b) return false;
  return a === b || b.startsWith(a) || a.startsWith(b);
}

/**
 * 算出一个条目该显示什么名字（纯函数）。
 *
 * 优先级：排队中用队列条目原文 > 当前这一轮的用户问题 > 会话标题 > 空（由调用方兜底）。
 * 排队条目为什么单独取：它还没变成用户消息，库里查不到，但 queue-store 里有现成 text。
 *
 * @param {Object} input
 * @returns {{ primary: string, sub: string, isQuestion: boolean, from: string }}
 */
export function pickEntryLabel({ phase = '', queuedText = '', questionText = '', title = '' } = {}) {
  const queued = phase === 'queued' ? normalizeLabel(queuedText) : '';
  const question = queued || normalizeLabel(questionText);
  const titleLabel = normalizeLabel(title);
  const primary = question || titleLabel;
  // from 记下主行到底来自哪一手，用来判定能不能定位：
  // 排队原文与回落的标题在会话里没有对应消息节点。
  // 叫 from 而不叫 source：条目上的 entry.source 已被「定时任务 / 普通聊天」占用，同名不义
  const from = queued ? 'queued' : (question ? 'question' : (primary ? 'title' : ''));
  return {
    primary,
    // 副行只在「主行确实是问题、且标题不是同一句话」时出现
    sub: question && !isSameLabel(titleLabel, question) ? titleLabel : '',
    isQuestion: Boolean(question),
    from,
  };
}

/**
 * 从会话记录里取最后一条用户消息的文本与 messageId。
 *
 * 必须走 extractTextFromContent：带图提问时 content 是多模态 parts 数组，
 * 直接拿它当文本会得到一坨 base64 data URL（[object Object] 都算好的）。
 * messageId 也得一起拿：点芯片不能只「打开会话」，要滚到这一轮问题那行；
 * 而回答会随执行日志与流式输出不断变高，只有问题是稳定锚。
 */
function lastUserMessageFrom(record) {
  const history = Array.isArray(record?.messageHistory) ? record.messageHistory : [];
  for (let i = history.length - 1; i >= 0; i -= 1) {
    const msg = history[i];
    if (!msg || msg.role !== 'user') continue;
    const text = extractTextFromContent(msg.content);
    if (text && String(text).trim()) {
      return { text: String(text), messageId: msg.messageId ? String(msg.messageId) : '' };
    }
  }
  return { text: '', messageId: '' };
}

/**
 * 由各路信号算出停靠条目（纯函数，便于单测）。
 *
 * 规则：
 * - 当前会话永不出现（用户正看着它，提示是干扰）
 * - 执行中 > 排队中 > 已完成 的优先级；排队数是会话维度，排队但没开跑的要出现
 * - 「× 掉」对已完成和已失效的执行中条目生效：真在跑的给 × 会被误读成「取消任务」
 *
 * @param {Object} input
 * @returns {Array<Object>} 条目数组（按阶段、再按时间倒序）
 */
export function buildDockEntries({
  activeSessionId = null,
  titles = {},
  questions = {},
  anchors = {},
  queuedTexts = {},
  generatingIds = [],
  pendingIds = [],
  runningIds: backendRunningIds = [],
  completedIds = [],
  queuedCounts = {},
  scheduledIds: scheduledIdList = [],
  dismissedIds: dismissedIdList = [],
  nodeInfo: nodeInfoMap = {},
  startedAt: startedAtMap = {},
  doneAt: doneAtMap = {},
  lastUpdateAt: lastUpdateMap = {},
  now = Date.now(),
  staleMs = STALE_MS,
} = {}) {
  const backendRunning = toArray(backendRunningIds);
  const executing = new Set([...toArray(generatingIds), ...toArray(pendingIds), ...backendRunning]);
  const completed = new Set(toArray(completedIds));
  const dismissed = new Set(toArray(dismissedIdList));
  const scheduled = new Set(toArray(scheduledIdList));
  const queuedMap = queuedCounts || {};

  const candidates = new Set([
    ...executing,
    ...completed,
    ...Object.keys(queuedMap),
  ]);

  const entries = [];
  for (const sid of candidates) {
    if (!sid || sid === activeSessionId) continue;

    const queuedCount = Number(queuedMap[sid]) || 0;
    let phase;
    if (executing.has(sid)) phase = 'running';
    else if (queuedCount > 0) phase = 'queued';
    else if (completed.has(sid)) phase = 'done';
    else continue;

    const stale = isEntryStale({
      phase,
      sessionId: sid,
      backendRunningIds: backendRunning,
      startedAt: startedAtMap?.[sid],
      lastUpdateAt: lastUpdateMap?.[sid],
      now,
      staleMs,
    });

    if (dismissed.has(sid) && (phase === 'done' || stale)) continue;

    const info = nodeInfoMap?.[sid] || {};
    const label = pickEntryLabel({
      phase,
      queuedText: queuedTexts?.[sid] || '',
      questionText: questions?.[sid] || '',
      title: titles?.[sid] || '',
    });
    entries.push({
      sessionId: sid,
      title: titles?.[sid] || '',
      primary: label.primary,
      sub: label.sub,
      isQuestion: label.isQuestion,
      // 定位锚点只在「主行就是会话里那条真实用户消息」时成立：
      // 排队原文还没入库、标题回落没有对应消息，拿上一轮的 id 去定位只能算骗人
      anchorMessageId: label.from === 'question' ? String(anchors?.[sid] || '') : '',
      phase,
      stale,
      source: scheduled.has(sid) ? 'scheduled' : 'chat',
      queuedCount,
      nodeName: info.nodeName || '',
      subtaskIndex: info.subtaskIndex || 0,
      subtaskTotal: info.subtaskTotal || 0,
      startedAt: startedAtMap?.[sid] || 0,
      doneAt: doneAtMap?.[sid] || 0,
      lastUpdateAt: lastUpdateMap?.[sid] || 0,
    });
  }

  entries.sort((a, b) => {
    const rank = PHASE_RANK[a.phase] - PHASE_RANK[b.phase];
    if (rank !== 0) return rank;
    // 已失效的排在同组真实条目之后，别挤占刚点下去的新任务的位置
    if (a.stale !== b.stale) return a.stale ? 1 : -1;
    const ta = a.phase === 'done' ? a.doneAt : a.startedAt;
    const tb = b.phase === 'done' ? b.doneAt : b.startedAt;
    // 倒序：最新的排最前，被折叠的一定是最老的
    if (ta !== tb) return tb - ta;
    return String(a.sessionId).localeCompare(String(b.sessionId));
  });

  return entries;
}

/** 该会话是否已经在跑（用于判定 startedAt / 清理 dismiss 标记） */
function isExecutingNow(sessionId) {
  return runningIds.has(sessionId)
    || state.generatingSessionIds.has(sessionId)
    || state.pendingCallApiSessionIds.has(sessionId);
}

/** 读取所有会话的排队条数 */
function readQueuedCounts() {
  const counts = {};
  try {
    const sessionIds = queueStore.listSessionIdsWithItems();
    for (const sid of sessionIds) {
      const count = queueStore.getQueuedCount(sid);
      if (count > 0) counts[sid] = count;
    }
  } catch (e) {
    logger.debug('[SessionDock] read queue counts failed:', e?.message || e);
  }
  return counts;
}

/** 标题：优先 state.sessions，缺失时异步补一次（后台新建的定时任务会话可能还没进缓存） */
function readTitles() {
  const titles = {};
  for (const session of state.sessions || []) {
    titles[session.id] = session.title || '';
  }
  for (const [sid, title] of titleCache) {
    if (!titles[sid]) titles[sid] = title;
  }
  return titles;
}

/**
 * 当前这一轮执行的用户问题。
 *
 * 为什么不能只信 state.sessions：它是上一次 loadSessions 的快照，而跨会话派发
 * 明确「绝不回写 state」（chat-manager sendMessage 的 sess 快照分支），内存里那份
 * messageHistory 很可能还停在上一轮问题——拿它当「正在执行哪个任务」恰好是要避免的错。
 * 所以内存值只当首帧占位，真值靠下面的 hydrate 从库里拿（每轮只查一次）。
 */
function readQuestions() {
  const questions = {};
  const anchors = {};
  const snapshot = new Map();
  for (const session of state.sessions || []) snapshot.set(session.id, session);
  for (const sid of new Set([
    ...runningIds,
    ...state.generatingSessionIds,
    ...state.pendingCallApiSessionIds,
    ...state.completedSessionIds,
  ])) {
    const stamp = startedAt.get(sid) || doneAt.get(sid) || 0;
    const cached = questionCache.get(sid);
    if (stamp && cached && cached.stamp === stamp) {
      if (cached.text) {
        questions[sid] = cached.text;
        anchors[sid] = cached.messageId || '';
      }
      continue;
    }
    const found = lastUserMessageFrom(snapshot.get(sid));
    if (found.text) {
      questions[sid] = found.text;
      anchors[sid] = found.messageId;
    }
  }
  return { questions, anchors };
}

/** 排队条目的原文：它还没变成用户消息，库里查不到，只有 queue-store 有 */
function readQueuedTexts() {
  const texts = {};
  try {
    for (const sid of queueStore.listSessionIdsWithItems()) {
      const item = queueStore.peekNext(sid);
      if (item?.text) texts[sid] = String(item.text);
    }
  } catch (e) {
    logger.debug('[SessionDock] read queued texts failed:', e?.message || e);
  }
  return texts;
}

/**
 * 补齐标题与当前问题：同一会话同一轮执行只查一次库（一次 getSession 填两样）。
 * 只查可见条目（最多 MAX_CHIPS 个）且仅在 stamp 变了之后查，不会每帧读库。
 */
function hydrateSessionLabels(entries) {
  for (const entry of entries || []) {
    const sid = entry.sessionId;
    if (!sid) continue;
    const stamp = entry.startedAt || entry.doneAt || 0;
    const cached = questionCache.get(sid);
    const needQuestion = !cached || cached.stamp !== stamp;
    const needTitle = !entry.title;
    if ((!needQuestion && !needTitle) || labelPending.has(sid)) continue;
    labelPending.add(sid);
    getSession(sid).then((session) => {
      if (!session) return;
      if (needTitle || !titleCache.has(sid)) titleCache.set(sid, session.title || '');
      if (needQuestion) {
        const found = lastUserMessageFrom(session);
        questionCache.set(sid, { text: found.text, messageId: found.messageId, stamp });
      }
    }).catch((e) => {
      logger.debug('[SessionDock] hydrate label failed:', e?.message || e);
    }).finally(() => {
      labelPending.delete(sid);
      scheduleRender();
    });
  }
}

function formatClock(timestamp) {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

/** 条目状态文案（tooltip 第二行） */
function describeEntry(entry) {
  if (entry.phase === 'running') {
    // 失效条目不再报「正在执行」：用户据此判断该不该去等这个会话，说谎比不显示更糟
    if (entry.stale) return t('dock.stale');
    const base = entry.nodeName ? t('dock.node', { node: entry.nodeName }) : t('dock.running');
    return entry.subtaskTotal > 1
      ? `${base} · ${t('dock.subtask', { index: entry.subtaskIndex, total: entry.subtaskTotal })}`
      : base;
  }
  if (entry.phase === 'queued') return t('dock.queued', { count: entry.queuedCount });
  return entry.doneAt ? t('dock.doneAt', { time: formatClock(entry.doneAt) }) : t('dock.done');
}

/** 计算当前应该显示的条目，并维护 startedAt / doneAt / dismiss 标记 */
function collectEntries() {
  const completionSet = state.completedSessionIds;

  // 维护时间戳：首次观测到运行 → startedAt；离开运行且被标记完成 → doneAt
  for (const sid of new Set([
    ...runningIds,
    ...state.generatingSessionIds,
    ...state.pendingCallApiSessionIds,
  ])) {
    if (!startedAt.has(sid)) startedAt.set(sid, Date.now());
    doneAt.delete(sid);
  }
  // 只有后台权威集合认定「真的重新开跑」才解除 × 标记。
  // 不能按三路并集解除：陈旧条目本身就是脏在面板本地集合里，按并集解除会让
  // 用户刚点掉的条目下一帧又复活，等于根本没有 × 可用。
  for (const sid of runningIds) dismissedIds.delete(sid);
  for (const sid of completionSet) {
    if (!doneAt.has(sid) && !isExecutingNow(sid)) doneAt.set(sid, Date.now());
  }

  const { questions, anchors } = readQuestions();
  const entries = buildDockEntries({
    activeSessionId: state.activeSessionId,
    titles: readTitles(),
    questions,
    anchors,
    queuedTexts: readQueuedTexts(),
    generatingIds: state.generatingSessionIds,
    pendingIds: state.pendingCallApiSessionIds,
    runningIds,
    completedIds: completionSet,
    queuedCounts: readQueuedCounts(),
    scheduledIds,
    dismissedIds,
    nodeInfo: Object.fromEntries(nodeInfo),
    startedAt: Object.fromEntries(startedAt),
    doneAt: Object.fromEntries(doneAt),
    lastUpdateAt: Object.fromEntries(lastUpdateAt),
    now: Date.now(),
  });

  hydrateSessionLabels(entries);
  return entries;
}

/** 首次进入完成态的会话打一次高亮脉冲 */
function trackFlashes(entries) {
  const previousDone = new Set(currentEntries.filter((e) => e.phase === 'done').map((e) => e.sessionId));
  const fresh = entries
    .filter((e) => e.phase === 'done' && !previousDone.has(e.sessionId))
    .map((e) => e.sessionId);
  if (fresh.length === 0) return;
  flashIds = new Set(fresh);
  if (doneFlashTimer) clearTimeout(doneFlashTimer);
  doneFlashTimer = setTimeout(() => {
    doneFlashTimer = null;
    flashIds = new Set();
    scheduleRender();
  }, DONE_FLASH_MS);
}

function ensureDock() {
  if (dockEl || typeof document === 'undefined') return dockEl;
  dockEl = document.createElement('div');
  dockEl.className = 'session-dock';
  dockEl.id = 'sessionDock';
  dockEl.setAttribute('role', 'navigation');
  document.body.appendChild(dockEl);

  tipEl = document.createElement('div');
  tipEl.className = 'session-dock-tip';
  document.body.appendChild(tipEl);

  syncDockBounds();
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncDockBounds).observe(chatContainer);
  }
  window.addEventListener('resize', syncDockBounds);
  return dockEl;
}

/**
 * 停靠条上边界与聊天区可视区对齐。
 * 只占顶部一段、向下堆叠：左侧垂直中心已经被「消息跳转热区」(.chat-nav-hotzone) 占住，
 * 停在那里会互相遮挡。
 */
function syncDockBounds() {
  if (!dockEl) return;
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  const rect = chatContainer.getBoundingClientRect();
  dockEl.style.top = `${Math.max(0, Math.round(rect.top + 8))}px`;
}

/**
 * 点开一个停靠条目：切到该会话，带得上锚点时一并定位到那一轮用户问题。
 * 锚点为空（主行是排队原文或回落的标题）时只是开会话，回到原有的恢复滚动行为。
 */
function openDockEntry(entry) {
  void handleSessionSwitch(entry.sessionId, { focusMessageId: entry.anchorMessageId || null });
}

function buildChip(entry) {
  const wrapper = document.createElement('div');
  wrapper.className = 'session-dock-item';
  wrapper.dataset.sessionId = entry.sessionId;
  wrapper.dataset.phase = entry.phase;
  if (entry.stale) wrapper.dataset.stale = 'true';
  if (flashIds.has(entry.sessionId)) wrapper.classList.add('is-flash');

  const title = entry.title || t('dock.unknownSession');
  // 芯片上的字仍取标题首字符（不随问题变而跳字），但悬停主行是用户问题
  const primary = entry.primary || title;
  const status = describeEntry(entry);
  const face = entry.phase === 'done'
    ? '✓'
    : (Array.from(title)[0] || '?');

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'session-dock-chip';
  chip.setAttribute('aria-label', `${primary} · ${status}`);
  chip.title = '';
  chip.textContent = face;
  chip.addEventListener('click', () => {
    openDockEntry(entry);
  });
  wrapper.appendChild(chip);

  if (entry.queuedCount > 0 && entry.phase !== 'done') {
    const badge = document.createElement('span');
    badge.className = 'session-dock-badge';
    badge.textContent = String(entry.queuedCount > 99 ? '99+' : entry.queuedCount);
    wrapper.appendChild(badge);
  }

  if (entry.source === 'scheduled') {
    const clock = document.createElement('span');
    clock.className = 'session-dock-clock';
    wrapper.appendChild(clock);
  }

  // × 只给完成态和已失效条目：真在跑的给 × 会被误读成「取消任务」，
  // 但已失效的本来就不该再装成「执行中」，必须留一个手动清掉的出口
  if (entry.phase === 'done' || entry.stale) {
    const closeBtn = document.createElement('button');
    closeBtn.type = 'button';
    closeBtn.className = 'session-dock-dismiss';
    const dismissLabel = entry.stale ? t('dock.dismissStale') : t('dock.dismiss');
    closeBtn.setAttribute('aria-label', dismissLabel);
    closeBtn.title = dismissLabel;
    closeBtn.textContent = '×';
    closeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dismissEntry(entry.sessionId);
    });
    wrapper.appendChild(closeBtn);
  }

  wrapper.addEventListener('mouseenter', () => showTip(wrapper, entry, status));
  wrapper.addEventListener('mouseleave', hideTip);
  wrapper.addEventListener('focusin', () => showTip(wrapper, entry, status));
  wrapper.addEventListener('focusout', hideTip);

  return wrapper;
}

function showTip(anchor, entry, status) {
  if (!tipEl) return;
  tipEl.innerHTML = '';
  const titleEl = document.createElement('div');
  titleEl.className = 'session-dock-tip-title';
  // 主行：用户问题；拿不到时 pickEntryLabel 已经回落到会话标题
  titleEl.textContent = entry.primary || entry.title || t('dock.unknownSession');
  const statusEl = document.createElement('div');
  statusEl.className = 'session-dock-tip-status';
  statusEl.textContent = status;
  tipEl.appendChild(titleEl);
  // 副行：会话标题，只在它与问题不是同一句话时才有（否则单轮会话会重复一遍）
  if (entry.sub) {
    const subEl = document.createElement('div');
    subEl.className = 'session-dock-tip-sub';
    subEl.textContent = entry.sub;
    tipEl.appendChild(subEl);
  }
  tipEl.appendChild(statusEl);

  const rect = anchor.getBoundingClientRect();
  tipEl.style.top = `${Math.round(rect.top)}px`;
  tipEl.style.left = `${Math.round(rect.right + 8)}px`;
  tipEl.classList.add('show');
}

function hideTip() {
  if (tipEl) tipEl.classList.remove('show');
}

/**
 * 溢出面板：被 +N 芯片折叠掉的会话列表。
 * 做成正常宽度的浮层而不是在 26px 芯片列里加滚动条——后者根本没法用。
 */
function ensureOverflow() {
  if (overflowEl || typeof document === 'undefined') return overflowEl;
  overflowEl = document.createElement('div');
  overflowEl.className = 'session-dock-overflow';
  overflowEl.setAttribute('role', 'menu');
  overflowEl.addEventListener('mouseenter', cancelOverflowClose);
  overflowEl.addEventListener('mouseleave', scheduleCloseOverflow);
  overflowEl.addEventListener('focusin', cancelOverflowClose);
  overflowEl.addEventListener('focusout', scheduleCloseOverflow);
  document.body.appendChild(overflowEl);
  return overflowEl;
}

function cancelOverflowClose() {
  if (overflowCloseTimer) {
    clearTimeout(overflowCloseTimer);
    overflowCloseTimer = null;
  }
}

/** 鼠标从芯片移到面板要穿过一段空隙，不能一到就收 */
function scheduleCloseOverflow() {
  if (overflowPinned) return;
  cancelOverflowClose();
  overflowCloseTimer = setTimeout(() => {
    overflowCloseTimer = null;
    closeOverflow();
  }, 220);
}

function syncMoreChipExpanded() {
  const chip = dockEl ? dockEl.querySelector('.session-dock-more') : null;
  if (!chip) return;
  chip.setAttribute('aria-expanded', overflowPinned ? 'true' : 'false');
  // 钉住态由 JS 打类：溢出面板在 DOM 里排在停靠条之后，CSS 兄弟选择器够不到它
  chip.classList.toggle('is-open', overflowPinned);
}

function renderOverflowRows() {
  const panel = ensureOverflow();
  if (!panel) return;
  panel.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'session-dock-overflow-header';
  header.textContent = t('dock.overflowTitle');
  panel.appendChild(header);

  const list = document.createElement('div');
  list.className = 'session-dock-overflow-list';
  for (const entry of overflowEntries) {
    const title = entry.primary || entry.title || t('dock.unknownSession');
    const status = describeEntry(entry);
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'session-dock-overflow-row';
    row.dataset.phase = entry.phase;
    if (entry.stale) row.dataset.stale = 'true';
    row.setAttribute('aria-label', `${title} · ${status}`);
    // 会话标题是用户内容，走 textContent 不拼 innerHTML
    const titleEl = document.createElement('span');
    titleEl.className = 'session-dock-overflow-title';
    titleEl.textContent = title;
    const statusEl = document.createElement('span');
    statusEl.className = 'session-dock-overflow-status';
    statusEl.textContent = status;
    row.appendChild(titleEl);
    row.appendChild(statusEl);
    row.addEventListener('click', () => {
      closeOverflow();
      openDockEntry(entry);
    });
    list.appendChild(row);
  }
  panel.appendChild(list);
}

/** 与聚合芯片顶对齐，但不超出视口底部 */
function positionOverflow() {
  if (!overflowEl || !dockEl) return;
  const anchor = dockEl.querySelector('.session-dock-item--more');
  if (!anchor) return;
  const rect = anchor.getBoundingClientRect();
  overflowEl.style.left = `${Math.round(rect.right + 8)}px`;
  const panelHeight = overflowEl.offsetHeight || 0;
  const maxTop = Math.max(8, window.innerHeight - panelHeight - 8);
  overflowEl.style.top = `${Math.round(Math.min(Math.max(8, rect.top), maxTop))}px`;
}

function openOverflow() {
  if (overflowEntries.length === 0) return;
  if (!ensureOverflow()) return;
  cancelOverflowClose();
  renderOverflowRows();
  positionOverflow();
  overflowEl.classList.add('show');
  syncMoreChipExpanded();
}

function closeOverflow() {
  cancelOverflowClose();
  overflowPinned = false;
  if (overflowEl) overflowEl.classList.remove('show');
  syncMoreChipExpanded();
}

function toggleOverflow() {
  const isOpen = Boolean(overflowEl && overflowEl.classList.contains('show'));
  if (isOpen && overflowPinned) {
    closeOverflow();
    return;
  }
  openOverflow();
  // 点击等于钉住：鼠标移开也不收，用户可以用面板选会话
  overflowPinned = true;
  syncMoreChipExpanded();
}

/** 聚合芯片：占用最后一个位置，代表被折叠掉的条目 */
function buildMoreChip(overflow) {
  const wrapper = document.createElement('div');
  wrapper.className = 'session-dock-item session-dock-item--more';
  wrapper.dataset.count = String(overflow.length);

  const chip = document.createElement('button');
  chip.type = 'button';
  chip.className = 'session-dock-chip session-dock-more';
  chip.setAttribute('aria-label', t('dock.moreAria', { count: overflow.length }));
  chip.setAttribute('aria-expanded', overflowPinned ? 'true' : 'false');
  chip.textContent = `+${overflow.length > 99 ? '99' : overflow.length}`;
  chip.addEventListener('click', () => toggleOverflow());
  wrapper.appendChild(chip);

  wrapper.addEventListener('mouseenter', () => openOverflow());
  wrapper.addEventListener('mouseleave', scheduleCloseOverflow);
  wrapper.addEventListener('focusin', () => openOverflow());
  wrapper.addEventListener('focusout', scheduleCloseOverflow);
  return wrapper;
}

function dismissEntry(sessionId) {
  if (!sessionId) return;
  dismissedIds.add(sessionId);
  persistDismissed();
  scheduleRender();
}

function persistDismissed() {
  try {
    chrome.storage.local.set({ [DISMISSED_KEY]: Array.from(dismissedIds) }).catch(() => {});
  } catch { /* 无 chrome 环境（测试）忽略 */ }
}

function restoreDismissed() {
  try {
    chrome.storage.local.get([DISMISSED_KEY], (result) => {
      const ids = result?.[DISMISSED_KEY];
      if (!Array.isArray(ids)) return;
      for (const sid of ids) dismissedIds.add(sid);
      scheduleRender();
    });
  } catch { /* 无 chrome 环境（测试）忽略 */ }
}

/** 渲染停靠条（无条目时整体移除类与节点，聊天区恢复原宽） */
export function renderDock() {
  if (!ensureDock()) return;
  const entries = collectEntries();
  trackFlashes(entries);
  currentEntries = entries;

  // 重绘先收溢出面板：条目集合变了，旧面板里的行可能已经点不到了
  closeOverflow();
  overflowEntries = [];

  dockEl.innerHTML = '';
  if (entries.length === 0) {
    dockEl.classList.remove('show');
    document.body.classList.remove('has-session-dock');
    hideTip();
    return;
  }

  // 放得下就全放条目；放不下时留 1 个位置给 +N 聚合芯片
  const inlineLimit = entries.length > MAX_CHIPS ? MAX_INLINE_ENTRIES : MAX_CHIPS;
  overflowEntries = entries.slice(inlineLimit);
  for (const entry of entries.slice(0, inlineLimit)) {
    dockEl.appendChild(buildChip(entry));
  }
  if (overflowEntries.length > 0) {
    dockEl.appendChild(buildMoreChip(overflowEntries));
  }

  dockEl.classList.add('show');
  // 预留左侧走廊，避免芯片压住消息正文（排版让位，不靠透明叠字）
  document.body.classList.add('has-session-dock');
}

/** 去抖渲染：EXECUTION_STATUS_UPDATE 一轮能来几十条 */
function scheduleRender() {
  if (renderTimer) return;
  renderTimer = setTimeout(() => {
    renderTimer = null;
    try {
      renderDock();
    } catch (e) {
      logger.warn('[SessionDock] render failed:', e?.message || e);
    }
  }, RENDER_DEBOUNCE_MS);
}

/** 向后台确认「哪些会话真的在跑」（面板自己启动时本地集合是空的） */
function refreshRunningFromBackground() {
  return new Promise((resolve) => {
    try {
      chrome.runtime.sendMessage({ type: 'QUERY_SESSION_RUNNING' }, (res) => {
        if (chrome.runtime.lastError || !res) { resolve(); return; }
        if (Array.isArray(res.activeSessionIds)) runningIds = new Set(res.activeSessionIds);
        resolve();
      });
    } catch {
      resolve();
    }
  });
}

function onExecutionStatus(message) {
  const sid = message?.sessionId;
  if (!sid) return;
  const prev = nodeInfo.get(sid) || {};
  nodeInfo.set(sid, {
    nodeName: message.nodeName || prev.nodeName || '',
    subtaskIndex: message.subtaskIndex || prev.subtaskIndex || 0,
    subtaskTotal: message.subtaskTotal || prev.subtaskTotal || 0,
  });
  // 这就是陈旧判定的「还活着」证据：只要还在推节点更新就不会被判失效
  lastUpdateAt.set(sid, Date.now());
  scheduleRender();
}

function clearEntry(sessionId) {
  if (!sessionId) return;
  nodeInfo.delete(sessionId);
  startedAt.delete(sessionId);
  doneAt.delete(sessionId);
  lastUpdateAt.delete(sessionId);
  dismissedIds.delete(sessionId);
  titleCache.delete(sessionId);
  questionCache.delete(sessionId);
  scheduleRender();
}

/** 初始化停靠条（幂等） */
export function initSessionDock() {
  if (inited || typeof document === 'undefined') return;
  if (!ensureDock()) return;
  inited = true;

  restoreDismissed();

  document.addEventListener('generating-state-changed', scheduleRender);
  document.addEventListener('session-switched', scheduleRender);
  document.addEventListener('generation-ended', (e) => {
    const sid = e?.detail?.sessionId;
    if (sid && !doneAt.has(sid)) doneAt.set(sid, Date.now());
    scheduleRender();
  });
  // 归档 / 彻底删除后，条目立即消失（含「彻底删除已被归档的会话」这条路径）
  document.addEventListener('session-archived', (e) => clearEntry(e?.detail?.sessionId));
  document.addEventListener('session-deleted', (e) => clearEntry(e?.detail?.sessionId));

  try {
    queueStore.subscribe(scheduleRender);
  } catch (e) {
    logger.debug('[SessionDock] subscribe queue failed:', e?.message || e);
  }

  try {
    chrome.runtime.onMessage.addListener((message) => {
      if (!message) return false;
      if (message.type === 'EXECUTION_STATUS_UPDATE') {
        onExecutionStatus(message);
        return false;
      }
      if (message.type === 'SCHEDULED_TASK_RUN_STATE' && message.sessionId) {
        if (message.running) scheduledIds.add(message.sessionId);
        else scheduledIds.delete(message.sessionId);
        scheduleRender();
        return false;
      }
      if (message.type === 'SCHEDULED_SESSION_UPDATED') {
        scheduleRender();
        return false;
      }
      return false;
    });
  } catch (e) {
    logger.debug('[SessionDock] register runtime listener failed:', e?.message || e);
  }

  // 面板可见时低频校准后台运行集合；切回页面立即补一次
  const startPolling = () => {
    if (pollTimer) return;
    pollTimer = setInterval(() => {
      if (document.hidden) return;
      void refreshRunningFromBackground().then(scheduleRender);
    }, POLL_MS);
  };
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      // 面板藏起来时溢出面板也一并收起（重新可见时条目集合可能已经变了）
      closeOverflow();
      return;
    }
    void refreshRunningFromBackground().then(scheduleRender);
  });
  // Esc 收溢出面板
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overflowPinned) closeOverflow();
  });
  startPolling();

  void refreshRunningFromBackground().then(() => {
    // 面板启动/重开后本地集合是空的，第一帧就要把后台在跑的会话补上
    for (const sid of runningIds) {
      if (!startedAt.has(sid)) startedAt.set(sid, Date.now());
    }
    renderDock();
  });
}

/** 仅供测试：清空模块内累积状态 */
export function __resetSessionDockForTest() {
  nodeInfo.clear();
  startedAt.clear();
  doneAt.clear();
  lastUpdateAt.clear();
  scheduledIds.clear();
  dismissedIds.clear();
  titleCache.clear();
  questionCache.clear();
  labelPending.clear();
  runningIds = new Set();
  currentEntries = [];
  flashIds = new Set();
  overflowEntries = [];
  overflowPinned = false;
  cancelOverflowClose();
  if (overflowEl) overflowEl.classList.remove('show');
}
