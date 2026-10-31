// background/goal-store.js - 会话级目标注册表（内存权威 + chrome.storage.local 镜像）
//
// 为什么需要它：ReAct 引擎是权威，但它是短命的（MV3 Service Worker 随时被回收），
// 面板刷新后也要能立刻画出 goal bar。所以这里做一层很薄的注册表：
//   内存 Map = 运行时权威（引擎读写零 IO）；chrome.storage.local 镜像 = 冷启动恢复用。
// 真正的恢复权威仍然是 checkpoint 里的 goalState（现场 > 快照），这里只保证「面板有东西可画」。
//
// 纪律：
//   ① 任何存储异常都不上抛——目标状态坏了不能把整个循环搞崩，最坏情况退化成「无目标」；
//   ② 写入走防抖合并（MV3 下逐次 set 会被写放大放大到几十倍，项目里已有 PERF-08 的教训）；
//   ③ 会话数上限淘汰最久未更新的，避免 storage.local 被历史目标撑爆；
//   ④ 面板删除会话时经 DROP_GOAL 清掉这里的镜像（否则条目按已删会话 id 永久留着，用户再也看不见）。
// 状态变更的推送由引擎直接发 GOAL_UPDATE（带 callId，且每次迁移都同步写这里），
// 这层不再开第二条订阅通道——同一事件两条推送路径迟早会走样。
import {
  normalizeGoal,
  goalIsFinished,
  createGoal,
  appendGoalConstraint,
  pauseGoal,
  resumeGoal,
  clearGoal,
} from '../shared/goal.js';
import logger from '../shared/logger.js';

export const GOAL_STORAGE_KEY = 'sessionGoals';
// 只保留最近活跃的 N 个会话的目标：目标本身很小，但历史会话会无限增长。
export const GOAL_MAX_SESSIONS = 50;
const SAVE_DEBOUNCE_MS = 300;

/** @type {Map<string, object>} sessionId -> normalized goal */
let memory = new Map();
let hydrated = false;
let hydrating = null;
let saveTimer = null;
let savePending = false;

// 存储实现可注入（单测用 fake storage；生产用 chrome.storage.local）
let storage = null;
function getStorage() {
  if (storage) return storage;
  if (typeof chrome !== 'undefined' && chrome?.storage?.local) return chrome.storage.local;
  return null;
}

/** 单测隔离：重置内存态与注入的存储实现。 */
export function __resetGoalStoreForTests(nextStorage = null) {
  memory = new Map();
  hydrated = false;
  hydrating = null;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  savePending = false;
  storage = nextStorage;
}

async function loadFromStorage() {
  const s = getStorage();
  if (!s) return {};
  try {
    const data = await s.get(GOAL_STORAGE_KEY);
    const raw = data?.[GOAL_STORAGE_KEY];
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    logger.warn('[goal-store] hydrate failed:', e?.message);
    return {};
  }
}

async function hydrateOnce() {
  const raw = await loadFromStorage();
  for (const [sid, value] of Object.entries(raw)) {
    if (!sid) continue;
    const goal = normalizeGoal({ ...value, sessionId: value?.sessionId || sid });
    if (goal) memory.set(sid, goal);
  }
  hydrated = true;
}

/** 保证已从 storage 水合（首次读写前调用；并发调用共享同一次水合）。 */
export function ensureGoalStoreReady() {
  if (hydrated) return Promise.resolve();
  if (!hydrating) {
    hydrating = hydrateOnce().catch((e) => {
      logger.warn('[goal-store] hydrate error:', e?.message);
      hydrated = true;
    }).finally(() => { hydrating = null; });
  }
  return hydrating;
}

function snapshotForStorage() {
  const entries = [...memory.entries()]
    .filter(([, g]) => g && g.objective)
    .sort((a, b) => (b[1].updatedAt || 0) - (a[1].updatedAt || 0))
    .slice(0, GOAL_MAX_SESSIONS);
  const out = {};
  for (const [sid, goal] of entries) out[sid] = goal;
  return out;
}

async function persistNow() {
  const s = getStorage();
  if (!s) return;
  try {
    await s.set({ [GOAL_STORAGE_KEY]: snapshotForStorage() });
    savePending = false;
  } catch (e) {
    // 保留脏标：下一次变更会再试。目标丢了最多是面板少一条横幅，不影响执行。
    savePending = true;
    logger.warn('[goal-store] persist failed:', e?.message);
  }
}

function schedulePersist() {
  savePending = true;
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    persistNow().catch(() => {});
  }, SAVE_DEBOUNCE_MS);
}

/** 立即落盘（SW 挂起前 / 单测里需要确定性时调用）。 */
export async function flushGoalStore() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (!hydrated && !savePending) return;
  await persistNow();
}

/**
 * 读取某会话的当前目标。
 * @param {string} sessionId
 * @returns {Promise<object|null>}
 */
export async function getGoal(sessionId) {
  if (!sessionId) return null;
  await ensureGoalStoreReady();
  return memory.get(sessionId) || null;
}

/**
 * 写入/替换某会话的目标（会先归一化；非法数据视为清除）。
 * @param {string} sessionId
 * @param {object|null} goal
 * @returns {Promise<object|null>} 归一化后的 goal
 */
export async function setGoal(sessionId, goal) {
  if (!sessionId) return null;
  await ensureGoalStoreReady();
  const normalized = goal ? normalizeGoal({ ...goal, sessionId }) : null;
  if (!normalized) {
    if (memory.delete(sessionId)) schedulePersist();
    return null;
  }
  memory.set(sessionId, normalized);
  schedulePersist();
  return normalized;
}

/**
 * 以「读-改-写」方式更新目标（updater 返回新对象）。
 * updater 抛错或返回 undefined 时保持原值不变——状态机异常不该把目标清空。
 * @param {string} sessionId
 * @param {(goal:object|null)=>(object|null|undefined)} updater
 * @returns {Promise<object|null>}
 */
export async function updateGoal(sessionId, updater) {
  const current = await getGoal(sessionId);
  let next;
  try {
    next = typeof updater === 'function' ? updater(current) : current;
  } catch (e) {
    logger.warn('[goal-store] updater threw, keeping current goal:', e?.message);
    return current;
  }
  if (next === undefined) return current;
  return setGoal(sessionId, next);
}

/**
 * 物理删除某会话的目标镜像。
 * 用户「清除」不走这里（那是落 cleared 终态、留下可回看的记录）；
 * 只有会话本身被删掉时才调——宿主都没了，镜像才真的该跟着消失。
 * @param {string} sessionId
 */
export async function removeGoal(sessionId) {
  if (!sessionId) return;
  await ensureGoalStoreReady();
  if (memory.delete(sessionId)) schedulePersist();
}

/**
 * 执行一条来自面板的目标指令。把「语义」收在后台（引擎是权威），
 * 面板只表达意图，避免多个面板实例各自维护一份走样的状态。
 *
 * 语义表（与方案里「累加不替换」的约定一一对应）：
 *   set        —— 新建/替换目标（用户显式改目标）
 *   constraint —— 追加约束，不替换目标（会话内继续发消息的默认语义）
 *   pause      —— 用户手动暂停
 *   resume     —— 从 paused / budget_limited 恢复（预算耗尽时补一档轮预算）
 *   clear      —— 用户清除目标
 *
 * @param {string} sessionId
 * @param {{action?:string, objective?:string, criteria?:string[], constraints?:string[],
 *   turnBudget?:number, timeBudgetMs?:number, doneCriteria?:Array, createdBy?:string,
 *   text?:string, limits?:object}} cmd
 * @returns {Promise<object|null>}
 */
export async function applyGoalCommand(sessionId, cmd = {}) {
  if (!sessionId) return null;
  const action = cmd.action || 'set';
  switch (action) {
    // set = 面板「目标模式」开关下每轮发送的意图：
    //   无目标 / 已是终态（达成/未达成/已清除）→ 以本轮文本为新目标；
    //   仍在推进（active/paused/budget_limited）→ 追加为约束，绝不替换 objective。
    // 会话级目标的累加语义就收在这里，面板永远不需要知道当前是什么状态。
    case 'set': {
      const text = cmd.objective ?? cmd.goal?.objective ?? '';
      const current = await getGoal(sessionId);
      if (current && !goalIsFinished(current)) {
        const next = appendGoalConstraint(current, text);
        // 面板重新点亮开关时需要把放行授权补上（之前可能被 pause 收回）
        const wantApprove = cmd.createdBy !== 'intent' && cmd.autoApprove === true;
        const withApproval = wantApprove && !next.autoApprove ? { ...next, autoApprove: true } : next;
        return withApproval === current ? current : setGoal(sessionId, withApproval);
      }
      const goal = createGoal({
        sessionId,
        objective: cmd.objective ?? cmd.goal?.objective,
        criteria: cmd.criteria ?? cmd.goal?.criteria,
        constraints: cmd.constraints ?? cmd.goal?.constraints,
        doneCriteria: cmd.doneCriteria ?? cmd.goal?.doneCriteria,
        createdBy: cmd.createdBy ?? cmd.goal?.createdBy,
        autoApprove: cmd.autoApprove ?? cmd.goal?.autoApprove,
        limits: {
          turnBudget: cmd.turnBudget ?? cmd.goal?.turnBudget,
          timeBudgetMs: cmd.timeBudgetMs ?? cmd.goal?.timeBudgetMs,
          ...(cmd.limits || {}),
        },
      });
      // createGoal 对空 objective 返回 null：等同于「没有目标」，不静默建一个空壳
      // （也不会反手清掉已有目标 —— 空白输入不该毁掉正在跑的任务）
      return goal ? setGoal(sessionId, goal) : (current || null);
    }
    // replace = 用户在目标条里显式编辑：无条件用新文本重建目标，重置轮次与停滞计数
    case 'replace': {
      const goal = createGoal({
        sessionId,
        objective: cmd.objective ?? cmd.goal?.objective,
        criteria: cmd.criteria ?? cmd.goal?.criteria,
        doneCriteria: cmd.doneCriteria ?? cmd.goal?.doneCriteria,
        createdBy: cmd.createdBy ?? 'toggle',
        autoApprove: cmd.autoApprove ?? cmd.goal?.autoApprove,
        limits: {
          turnBudget: cmd.turnBudget ?? cmd.goal?.turnBudget,
          timeBudgetMs: cmd.timeBudgetMs ?? cmd.goal?.timeBudgetMs,
          ...(cmd.limits || {}),
        },
      });
      return goal ? setGoal(sessionId, goal) : null;
    }
    case 'constraint': {
      const current = await getGoal(sessionId);
      if (!current) return null;
      const next = appendGoalConstraint(current, cmd.text ?? cmd.objective ?? '');
      // 约束去重/空串时 appendGoalConstraint 原样返回，不必白写一次存储
      return next === current ? current : setGoal(sessionId, next);
    }
    case 'pause':
      // 暂停即收回放行授权：目标不再自动推进，就没理由继续放行敏感操作。
      // 恢复靠用户点「继续」，面板会重新带 autoApprove 下发。
      return updateGoal(sessionId, (g) => pauseGoal({ ...g, autoApprove: false }));
    case 'resume':
      // 放行不自动恢复：必须由面板（用户此刻的显式开关状态）重新授予
      return updateGoal(sessionId, (g) => resumeGoal({ ...g, autoApprove: cmd.autoApprove === true }));
    case 'clear': {
      const current = await getGoal(sessionId);
      if (!current) return null;
      return setGoal(sessionId, clearGoal({ ...current, autoApprove: false }));
    }
    default:
      logger.warn('[goal-store] unknown goal action:', action);
      return getGoal(sessionId);
  }
}

// SW 被回收前尽力刷盘：写入走 300ms 防抖，而 MV3 下定时器会在 SW 挂起时被直接丢掉，
// 表现为「目标明明跑完了几轮，重开后面板又回到旧轮数」。onSuspend 并非保证送达，
// 所以只是尽力而为的兜底（与 activity-store 同一套路）。
if (typeof chrome !== 'undefined' && chrome.runtime?.onSuspend?.addListener) {
  chrome.runtime.onSuspend.addListener(() => { void flushGoalStore(); });
}
