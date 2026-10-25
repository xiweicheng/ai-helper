// background/injection.js - 「见缝插针」的待注入缓冲
//
// 语义（对应方案 B 通道 steer）：用户在当前任务执行中补的话，不另起一轮，
// 而是在**下一个迭代边界**作为 role:'user' 追加进本轮的 currentMessages。
//
// 为什么单独成模块：
// 1. react-loop.js 已近 4000 行，注入那里只该多一个 drain 调用点；
// 2. 缓冲必须能脱离 chrome / 网络单测（本文件零副作用、零外部依赖）；
// 3. 注入文案是模型契约，集中一处改，不会散落在循环里。
//
// 本模块**不判断**"当前有没有任务在跑"——那是调用方（index.js 查 activeReactLoops）的事，
// 因为这里一旦反过来 import react-loop.js 就会成环。

/** 单会话最多同时挂起的插话条数（防一口气灌满上下文） */
export const MAX_PENDING_PER_SESSION = 5;
/** 单次迭代边界最多并入几条：多了会把一次请求塞爆，剩下的留到下一轮 */
export const MAX_CARRY_PER_ITERATION = 3;
/** 单条插话正文上限（字符）：超长粘贴在插话场景里没有价值，只会挤爆上下文 */
export const MAX_INJECT_TEXT_CHARS = 4000;

/** sessionId -> Array<{itemId, text, requestedAt}> */
const pendingBySession = new Map();

/**
 * 登记一条待注入插话。
 * 同 itemId 幂等：面板重复点击 / 重发不会灌出两条一样的插话。
 * @param {string} sessionId
 * @param {{itemId: string, text: string}} entry
 * @returns {{ok: boolean, error?: string, duplicate?: boolean, pending?: number}}
 */
export function enqueueInjection(sessionId, { itemId, text } = {}) {
  if (!sessionId || !itemId) return { ok: false, error: 'missing_fields' };
  const content = String(text || '').trim();
  if (!content) return { ok: false, error: 'empty' };

  const list = pendingBySession.get(sessionId) || [];
  if (list.some((it) => it.itemId === itemId)) {
    return { ok: true, duplicate: true, pending: list.length };
  }
  if (list.length >= MAX_PENDING_PER_SESSION) {
    return { ok: false, error: 'too_many_pending' };
  }
  list.push({ itemId, text: content, requestedAt: Date.now() });
  pendingBySession.set(sessionId, list);
  return { ok: true, pending: list.length };
}

/**
 * 在迭代边界取走待注入项（取走即出缓冲，不重复注入）。
 * @param {string} sessionId
 * @param {number} [limit]
 * @returns {Array<{itemId: string, text: string, requestedAt: number}>}
 */
export function drainPendingInjections(sessionId, limit = MAX_CARRY_PER_ITERATION) {
  const list = pendingBySession.get(sessionId);
  if (!sessionId || !list || list.length === 0) return [];
  const taken = list.splice(0, limit);
  if (list.length === 0) pendingBySession.delete(sessionId);
  return taken;
}

/**
 * 丢弃该会话全部待注入项（任务已结束 / 循环未走到边界）。
 * 返回值交给调用方广播 INJECT_REJECTED，让面板立刻把条目退回队列，
 * 而不是干等 15s 超时——用户点了 ⚡ 却半天没反应，比直接告诉他没插进去更糟。
 * @param {string} sessionId
 */
export function dropPendingInjections(sessionId) {
  const list = pendingBySession.get(sessionId);
  if (!list || list.length === 0) return [];
  pendingBySession.delete(sessionId);
  return list;
}

/** 仅供测试：清空缓冲 */
export function __resetInjectionForTest() {
  pendingBySession.clear();
}

function pad2(n) {
  return String(n).padStart(2, '0');
}

/**
 * 构造注入消息正文。
 *
 * 为什么要英文 + 硬性规则：这是**模型侧契约**，与 buildPlanAnchorMessage 等同构
 * （模型能读中文，但混在英文系统提示里容易被当成另一段用户闲聊）。
 * 三条规则分别防三种翻车：
 * 1. 别放弃原任务——否则插话会把正在做的事整个掀翻；
 * 2. 冲突时以本条为准但要说原因——用户后说的话优先级更高，但必须可见；
 * 3. 不用单独汇报——它是一次补充，不是新任务。
 *
 * @param {{text: string, requestedAt?: number}} injection
 * @param {Date} [now] 仅测试注入固定时间
 */
export function buildInjectionContent(injection, now = new Date()) {
  const raw = String(injection?.text || '').trim();
  const text = raw.length > MAX_INJECT_TEXT_CHARS
    ? raw.slice(0, MAX_INJECT_TEXT_CHARS) + '\n…(truncated)'
    : raw;
  const ts = injection?.requestedAt ? new Date(injection.requestedAt) : now;
  const hhmm = `${pad2(ts.getHours())}:${pad2(ts.getMinutes())}`;

  return [
    `[User interjection while you were working · ${hhmm}]`,
    text,
    '',
    'Rules: This is an extra requirement the user added while you were working.',
    'Do NOT abandon the original task. If this conflicts with the original task, follow this one and state why.',
    'Fold it into the current step where possible; once handled, continue the original task.',
    'No separate report on this message is needed.',
  ].join('\n');
}
