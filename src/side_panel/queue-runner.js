// queue-runner.js - 队列的生产端（把输入变成排队项）与消费端（会话空闲后 FIFO 接力）
//
// 通道说明（对应方案 A 通道）：
//   排队接力 = 会话空闲时把队首当作独立一轮发送（业界 enqueue 语义）。
//   Phase 1 只在**当前激活会话**上接力；跨会话派发在 Phase 2 打开（需要 sendMessage/callApi 参数化）。
//
// 关键约束：
// 1. 派发必须串行：同一会话不允许两个条目同时进入发送流程。
// 2. 派发前抢租约（多面板实例防双发），派发后无条件结算，条目只会"进归档"，不会凭空消失。
// 3. 用户点停止 → 该会话队列暂停，否则下一条会立刻把刚停下的任务重新拉起来。
// 4. 入队时把上下文（引用/选中/技能/MCP/知识库/网页/附件）整体接管并从输入区清空，
//    派发时再原样还给 state，让 sendMessage 走完全相同的装配路径（气泡、finalText 都一致）。

import state from './state.js';
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';
import { showToast } from './utils.js';
import * as store from './queue-store.js';
import { QUEUE_STATUS, MAX_DISPATCH_ATTEMPTS, INJECT_DEADLINE_MS } from './queue-store.js';
import { onGenerationEnded } from './generation-lifecycle.js';
import { evaluateAutoCarry, peakIteration } from './queue-auto-carry.js';
import * as attachmentStore from './queue-attachment-store.js';
import { loadSessions } from './session-manager.js';

/** 本面板实例标识，用于派发租约 */
const INSTANCE_ID = 'panel_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);

/** 正在 drain 的会话（串行守卫） */
const draining = new Set();
/** drain 期间又被要求接力：标记后由当前循环再跑一轮 */
const rerunRequested = new Set();

/** 发送器（由 index.js 注入 sendMessage，避免 chat-manager ↔ queue-runner 循环依赖） */
let dispatcher = null;

/**
 * 图片/文件这类大对象落 IndexedDB（见 queue-attachment-store）。
 * 这个 Map 只是 IndexedDB 写失败时的**同一实例内兜底**，面板重载后即失效。
 */
const volatileContext = new Map();

/**
 * UI 同步事件：上下文被接管 / 复位后，由入口层（index.js）调用各选择器模块的 clear/render
 * 统一更新指示器。
 * 为什么不在本文件直接 import 那些模块：page-selector → chat-manager → queue-runner 会成环，
 * 而入口层谁都不依赖，是唯一安全的接线点。
 */
const EVENT_CONTEXT_CLEARED = 'queue-context-cleared';
const EVENT_CONTEXT_RESTORED = 'queue-context-restored';

/**
 * 注入真正的发送实现。
 * @param {(opts: {text: string, fromQueue?: boolean, sessionId?: string}) => Promise<{ok: boolean, reason?: string}>} fn
 */
export function bindDispatcher(fn) {
  dispatcher = fn;
}

function isGenerating(sessionId) {
  return state.generatingSessionIds.has(sessionId || state.activeSessionId);
}

// ============================================================
// 上下文快照：入队时接管，派发时归还
// ============================================================

/** 读取当前输入区已挂载的上下文（只取轻量可持久化部分） */
function captureContext() {
  return {
    quotedContextText: state.quotedContextText || '',
    selectedContextText: state.selectedContextText || '',
    selectedSkills: (state.selectedSkills || []).slice(),
    selectedMcpServices: (state.selectedMcpServices || []).slice(),
    knowledgeRefs: (state.knowledgeRefs || []).slice(),
    selectedPage: state.selectedPage ? { ...state.selectedPage } : null,
    attachedImages: (state.attachedImages || []).slice(),
    attachedFiles: (state.attachedFiles || []).slice(),
  };
}

/** 上下文是否非空（决定 chip 上是否显示“带上下文”标记） */
export function hasContext(snapshot) {
  if (!snapshot) return false;
  // 附件摘要也算上下文：只带图片/文件的条目同样需要打标记
  if (snapshot.attachmentSummary) return true;
  if ((snapshot.attachedImages || []).length) return true;
  if ((snapshot.attachedFiles || []).length) return true;
  return !!(
    (snapshot.quotedContextText && snapshot.quotedContextText.trim()) ||
    (snapshot.selectedContextText && snapshot.selectedContextText.trim()) ||
    (snapshot.selectedSkills || []).length ||
    (snapshot.selectedMcpServices || []).length ||
    (snapshot.knowledgeRefs || []).length ||
    snapshot.selectedPage
  );
}

/** 当前输入区是否挂着任何上下文（引用/技能/MCP/知识库/网页/图片/文件） */
export function currentInputHasContext() {
  return hasContext(captureContext());
}

/** 入队时把上下文从输入区取走（清空 state 与对应指示器），避免下一条消息重复携带 */
function detachContextFromInput() {
  const snapshot = captureContext();
  if (!hasContext(snapshot)) return snapshot;
  resetInputContext();
  return snapshot;
}

/** 派发前把上下文还回 state，让 sendMessage 走完全相同的气泡/拼接路径 */
function restoreContextToInput(snapshot) {
  if (!snapshot) return;
  if (snapshot.quotedContextText) state.quotedContextText = snapshot.quotedContextText;
  if (snapshot.selectedContextText) state.selectedContextText = snapshot.selectedContextText;
  if ((snapshot.selectedSkills || []).length) state.selectedSkills = snapshot.selectedSkills.slice();
  if ((snapshot.selectedMcpServices || []).length) state.selectedMcpServices = snapshot.selectedMcpServices.slice();
  if ((snapshot.knowledgeRefs || []).length) state.knowledgeRefs = snapshot.knowledgeRefs.slice();
  if (snapshot.selectedPage) state.selectedPage = { ...snapshot.selectedPage };
  if ((snapshot.attachedImages || []).length) state.attachedImages = snapshot.attachedImages.slice();
  if ((snapshot.attachedFiles || []).length) state.attachedFiles = snapshot.attachedFiles.slice();
}

/**
 * 彻底复位输入区上下文。
 * 派发前必做：否则上一条残留的引用/图片/网页会串到下一条（用户看到的“带上下文”就会错乱）。
 */
function resetInputContext() {
  const hadImages = (state.attachedImages || []).length > 0;

  state.quotedContextText = '';
  state.selectedContextText = '';
  state.selectedSkills = [];
  state.selectedMcpServices = [];
  state.knowledgeRefs = [];
  state.selectedPage = null;
  state.attachedImages = [];
  state.attachedFiles = [];

  if (hadImages) {
    const previewBar = document.getElementById('imagePreviewBar');
    if (previewBar) {
      previewBar.innerHTML = '';
      previewBar.style.display = 'none';
    }
  }

  // 让输入区指示器跟着清空：否则界面还显示“技能已选”“网页已选”，
  // 而实际上下文已被队列接管 → 用户误以为下一条还带着，是典型的静默丢上下文
  document.dispatchEvent(new CustomEvent(EVENT_CONTEXT_CLEARED));
}

/** 附件文件的中间态：正文还没抽取完 */
const UNREADY_FILE_STATUS = new Set(['pending', 'extracting']);

/**
 * 是否有文件仍在解析中。
 * 为什么入队前必须挡：文件正文由 processFile 异步回写到**对象引用**上，
 * 一旦入队把 state.attachedFiles 清空，抽取结果会写进没有归属的孤儿对象，
 * 条目快照里的 text 永远是空串 → 文件内容真的丢了（而且不可重抽）。
 */
export function hasUnreadyFiles() {
  return (state.attachedFiles || []).some((f) => UNREADY_FILE_STATUS.has(f && f.status));
}

/**
 * 拆分快照：轻量上下文随队列状态落 chrome.storage.local，
 * 图片/文件交给 queue-attachment-store（IndexedDB），条目里只留摘要。
 * @returns {{light: Object, heavy: {images: Array, files: Array}|null}}
 */
function splitSnapshot(snapshot) {
  const images = (snapshot && snapshot.attachedImages) || [];
  // 文件里的 dataUrl 是 URL.createObjectURL 产生的 blob: 句柄，只在本面板实例内有效，
  // 跨刷新/崩溃必然失效，存它等于存垃圾。直接剥离：文件语义（text / agentPath）不受影响，
  // 恢复后预览自动退化为文件图标，而不是裂图。
  const files = ((snapshot && snapshot.attachedFiles) || []).map((f) => {
    if (!f || typeof f.dataUrl !== 'string' || !f.dataUrl.startsWith('blob:')) return f;
    const rest = { ...f };
    delete rest.dataUrl;
    return rest;
  });
  const light = { ...(snapshot || {}) };
  delete light.attachedImages;
  delete light.attachedFiles;
  light.attachmentSummary = attachmentStore.summarizeAttachments({ attachedImages: images, attachedFiles: files });
  const heavy = (images.length || files.length) ? { images, files } : null;
  return { light, heavy };
}

/**
 * 把条目携带的**完整上下文**还原到输入区（供面板“✎ 回填”使用）。
 * 不只附件：引用 / 划词选中 / 技能 / MCP / 知识库 / 网页也必须一起回去，
 * 否则用户拿回草稿却发现上下文没了，等于隐形丢内容。
 * @param {Object} item 队列条目
 * @returns {Promise<{ok: boolean, attachments: boolean, wantsAttachments: boolean}>}
 *   attachments=false 且 wantsAttachments=true 表示条目声称带附件、但数据已被释放
 */
export async function restoreContextForItem(item) {
  if (!item) return { ok: false, attachments: false, wantsAttachments: false };

  const heavy = (await attachmentStore.loadAttachments(item.id)) || volatileContext.get(item.id) || null;
  const wantsAttachments = !!(item.attachmentSummary || (item.contextSnapshot && item.contextSnapshot.attachmentSummary));

  resetInputContext();
  restoreContextToInput({
    ...(item.contextSnapshot || {}),
    attachedImages: (heavy && heavy.images) || [],
    attachedFiles: (heavy && heavy.files) || [],
  });

  // 指示器重绘：state 已经还原，但 DOM 还停在清空后的样子
  document.dispatchEvent(new CustomEvent(EVENT_CONTEXT_RESTORED, {
    detail: { snapshot: item.contextSnapshot || {} },
  }));

  return { ok: true, attachments: !!heavy, wantsAttachments };
}

/** 释放条目的重附件（条目被删除 / 被回填取出后调用，避免索引库泄漏） */
export async function releaseAttachments(itemId) {
  if (!itemId) return false;
  volatileContext.delete(itemId);
  return attachmentStore.deleteAttachments(itemId);
}

// ============================================================
// 入队
// ============================================================

/**
 * 把当前输入框内容转为排队项。
 * 空内容 / 队列已满 / 无会话时给出明确反馈，绝不静默丢内容。
 * @param {{autoDrain?: boolean}} [options] autoDrain=false 用于“只想暂存、不立即派发”的场景（如✎回填时安置草稿）
 * @returns {Promise<{ok: boolean, item?: Object, error?: string}>}
 */
export async function enqueueFromInput({ autoDrain = true } = {}) {
  const userInput = document.getElementById('userInput');
  const text = (userInput?.value || '').trim();
  if (!text) return { ok: false, error: 'empty' };

  const sessionId = state.activeSessionId;
  if (!sessionId) {
    showToast(t('queue.noSession'), 'error');
    return { ok: false, error: 'missing_session' };
  }

  // 文件还在解析：此时入队会丢正文，必须挡住（绝不能先接管再丢）
  if (hasUnreadyFiles()) {
    showToast(t('queue.filesStillExtracting'), 'warning', 4000);
    return { ok: false, error: 'files_extracting' };
  }

  const snapshot = detachContextFromInput();
  const { light, heavy } = splitSnapshot(snapshot);
  const result = await store.enqueue({
    sessionId,
    text,
    contextSnapshot: light,
    hasContext: hasContext(light),
    attachmentSummary: light.attachmentSummary,
    source: 'manual',
  });

  if (!result.ok) {
    // 入队失败必须把上下文还回去，否则用户的内容被吞了
    restoreContextToInput(snapshot);
    if (result.error === 'queue_full') {
      showToast(t('queue.queueFull', { limit: result.limit }), 'warning');
    } else {
      showToast(t('queue.enqueueFailed'), 'error');
    }
    return result;
  }

  // 图片/文件单独落 IndexedDB：失败不影响入队（内容不会丢），
  // 但必须如实告知“面板重载后会丢附件”，绝不假装成功。
  if (heavy) {
    const saved = await attachmentStore.saveAttachments(result.item.id, sessionId, heavy);
    if (!saved.ok) {
      volatileContext.set(result.item.id, heavy);
      showToast(t('queue.attachmentsVolatile'), 'warning', 5000);
    }
  }

  if (userInput) {
    userInput.value = '';
    userInput.style.height = 'auto';
    userInput.dispatchEvent(new Event('input'));
    userInput.focus();
  }

  showToast(t('queue.enqueued', { position: result.position }), 'success');
  document.dispatchEvent(new CustomEvent('queue-enqueued', { detail: { sessionId, item: result.item } }));

  // 会话已经空着（例如后台直发与手动发送撞车、或用户在生成结束瞬间入队）：
  // 没人会再发 generation-ended，这里主动拉一把，保证条目不会永远躺着不动
  if (autoDrain && !isGenerating(sessionId) && !store.isPaused(sessionId)) {
    void drainQueue(sessionId);
  }

  return result;
}

// ============================================================
// 接力派发
// ============================================================

/**
 * 取目标会话快照（跨会话派发用）。
 * 非激活会话不能读 state（那是面板当前会话），历史/模型/工具配置只能从会话记录里拿。
 * @param {string} sid
 * @returns {Promise<Object|null>} 会话不存在（已被删）时返回 null
 */
async function loadSessionStateForDispatch(sid) {
  try {
    const { list } = await loadSessions();
    const found = (list || []).find((s) => s.id === sid);
    if (!found) return null;
    return {
      // 复制一份：sendMessage 会往里 push 本轮消息，不能改到共享引用
      messageHistory: Array.isArray(found.messageHistory) ? found.messageHistory.slice() : [],
      model: found.model,
      useTools: found.useTools,
      enabledTools: Array.isArray(found.enabledTools) ? found.enabledTools.slice() : found.enabledTools,
      agentId: found.agentId,
      temperature: found.temperature,
      topP: found.topP,
      contextCompaction: found.contextCompaction,
    };
  } catch (err) {
    logger.warn('[QueueRunner] load session state failed:', err?.message || err);
    return null;
  }
}

/**
 * 触发接力：会话空闲且有 queued 条目时派发队首。
 * 可重复调用（drain 期间会置重跑标记），不会产生并发派发。
 * @param {string} sessionId
 */
export async function drainQueue(sessionId) {
  const sid = sessionId || state.activeSessionId;
  if (!sid || !dispatcher) return;
  if (draining.has(sid)) {
    rerunRequested.add(sid);
    return;
  }
  draining.add(sid);
  try {
    do {
      rerunRequested.delete(sid);
      await drainOnce(sid);
    } while (rerunRequested.has(sid) && !store.isPaused(sid));
  } finally {
    draining.delete(sid);
  }
}

/** 单轮：派发队首并等待其整轮结束 */
async function drainOnce(sid) {
  if (isGenerating(sid)) return;
  if (store.isPaused(sid)) return;

  const item = store.peekNext(sid);
  if (!item) return;

  // 尝试次数到顶：不再自动重跑（任何未预料的重复路径都在这里止损）。
  // 入归档置 failed，用户仍能从「最近处理」手动重新入队，不会“一直循环且删不掉”。
  if ((item.attempts || 0) >= MAX_DISPATCH_ATTEMPTS) {
    await store.settle(sid, item.id, { status: QUEUE_STATUS.FAILED, note: 'too_many_attempts' });
    showToast(t('queue.tooManyAttempts', { count: MAX_DISPATCH_ATTEMPTS }), 'error', 5000);
    return;
  }

  if (!(await store.acquireLease(sid, item.id, INSTANCE_ID))) {
    logger.debug('[QueueRunner] lease held by another panel, skip:', item.id);
    return;
  }

  await store.setStatus(sid, item.id, QUEUE_STATUS.DISPATCHING, {
    attempts: (item.attempts || 0) + 1,
    lastError: null,
  });

  // 重附件：优先 IndexedDB（面板重载 / 插件崩溃后照样取回），退化到本实例内存副本
  const heavy = (await attachmentStore.loadAttachments(item.id)) || volatileContext.get(item.id) || null;
  volatileContext.delete(item.id);
  // 只有“条目声称带附件、但数据确实取不到”才算真丢；不能把“内存副本不在”误报成丢失
  const lostAttachments = !!item.attachmentSummary && !heavy;
  if (lostAttachments) {
    showToast(t('queue.attachmentsMissing'), 'warning', 5000);
  }

  // 上下文快照：本条目入队时接管的那一份 + 重附件
  const contextSnapshot = {
    ...(item.contextSnapshot || {}),
    attachedImages: (heavy && heavy.images) || [],
    attachedFiles: (heavy && heavy.files) || [],
  };

  // 队列是会话维度的，目标会话可能不是面板当前显示的那个。
  // 非激活时绝不能把上下文写进 state（那是别人的输入区），也不能广播 UI 事件。
  const onActiveSession = sid === state.activeSessionId;
  let userBackup = null;
  let userHadContext = false;
  let sessionState = null;

  if (onActiveSession) {
    // 先存档用户现场：自动接力是后台行为，用户可能刚挂上图片/引用准备下一条。
    // 派发必须先复位再换成本条的上下文，但**用户自己挂的东西不能因此被悄悄清掉**。
    userBackup = captureContext();
    userHadContext = hasContext(userBackup);

    // 先彻底复位再还原：否则上一条残留的引用 / 图片 / 网页会串到这一条
    resetInputContext();
    restoreContextToInput(contextSnapshot);
  } else {
    sessionState = await loadSessionStateForDispatch(sid);
    if (!sessionState) {
      // 会话已被删除：条目整体转孤儿（不静默丢），后面用户的队列面板能看到并迁回
      await store.moveSessionToOrphans(sid);
      return;
    }
  }

  let result = { ok: true };
  try {
    const payload = { text: item.text, fromQueue: true, sessionId: sid };
    if (!onActiveSession) {
      // 非激活：上下文与会话态全部随载荷传入，sendMessage 不读也不写 state
      payload.context = contextSnapshot;
      payload.sessionState = sessionState;
    }
    result = (await dispatcher(payload)) || { ok: true };
  } catch (err) {
    result = { ok: false, reason: err?.message || 'dispatch_error' };
    logger.error('[QueueRunner] dispatch failed:', err?.message || err);
  }

  const still = store.findItem(sid, item.id);
  if (!still) {
    // 派发期间被用户删除（或会话已转移）：结果丢弃即可，**绝不复活**
    logger.debug('[QueueRunner] item removed during dispatch, drop result:', item.id);
  } else if (result.ok === false) {
    // 派发没真正发出去（例如会话刚好又开始生成）：回队并置顶，绝不静默丢弃
    await store.rollbackInjecting(sid, item.id, 'dispatch_failed', result.reason || 'dispatch_failed');
    // 附件已经还原到 state，但这条没发出去 → 清掉，避免下一次手动发送误带别的条目的附件
    if (onActiveSession) resetInputContext();
  } else {
    // 不看当前 status：不管它被外部同步改成了什么都不重要，**执行过就必须出队**。
    // （旧实现在 status 不是 dispatching 时什么都不做，这正是“同一任务无限重跑”的帮凶）
    await store.settle(sid, item.id, { status: QUEUE_STATUS.DONE, note: lostAttachments ? 'relayed_no_attachments' : 'relayed' });
    // 条目已进入归档（只保留文本与附件摘要），释放重附件
    await attachmentStore.deleteAttachments(item.id);
  }

  // 本条上下文已被发送流程消费（或已回滚），把用户自己挂的现场还回去
  if (onActiveSession && userHadContext) {
    restoreContextToInput(userBackup);
    document.dispatchEvent(new CustomEvent(EVENT_CONTEXT_RESTORED, { detail: { snapshot: userBackup } }));
  }
}

/** 「停止并发送」待办：这一次停止的目的就是让队列立刻接上 */
const drainAfterStop = new Set();

/**
 * 声明「下一次停止是停止并发送」。
 * 必须在真正触发停止**之前**调用：停止流程会广播 task-stop-requested，
 * 而该事件的默认语义是“暂停本会话接力”——那样用户刚下的决心会当场作废。
 * @returns {string|null} 实际生效的会话 id
 */
export function markStopAndSend(sessionId) {
  const sid = sessionId || state.activeSessionId;
  if (!sid) return null;
  drainAfterStop.add(sid);
  return sid;
}

/** 该会话是否还有待执行的条目（“停止并发送”的前置判断） */
export function hasQueuedItems(sessionId) {
  const sid = sessionId || state.activeSessionId;
  return !!(sid && store.peekNext(sid));
}

/** 会话空闲时自动接力（由 generation-lifecycle 统一回调触发） */
function handleGenerationEnded(sessionId) {
  // 用户点了停止 → 该会话已暂停，不再自动接力
  if (store.isPaused(sessionId)) return;
  void drainQueue(sessionId);
}

// ============================================================
// 见缝插针（steer）：把一条排队项并入正在运行的任务
// ============================================================
//
// 两段式提交，两个半段缺一不可：
//   ① 条目 queued → injecting 并**同步落盘**，它仍然显示在队列里；
//   ② 收到后台 INJECT_ABSORBED（确实 push 进了 currentMessages）才移入归档。
// 任何未走完链路的路径（拒绝 / 15s 无回执 / 页面重载）一律回退 queued 并置顶。
// 铁律：
//   “任务刚好结束”只影响能不能插，绝不影响条目去留 —— 用户点了 ⚡ 不可能凭空消失。

/** 回执超时句柄：`${sessionId}\0${itemId}` -> timer */
const injectTimers = new Map();
/** 正在发请求的条目（防连点重复投递） */
const injectInFlight = new Set();
/**
 * 临时插话（Alt+Enter，不进队列）：itemId -> {text, timer}
 * 为什么不用队列条目：用户只是想补一句，不想在队列里多一条；
 * 但正文必须留到“确认吸收”才清输入框 —— 否则被拒时内容就真的没了。
 */
const adhocInjections = new Map();
/**
 * 「自动顺带」记账：sessionId -> {callId, carried, lastIteration}。
 * 只活在内存里：面板重载后重新数轮次即可，不影响任何条目去留（判断错了也不会丢东西）。
 */
const autoCarryTrackers = new Map();

/** 带图片/文件的条目插不进运行中的任务（插话只能插文本） */
function hasBlockingAttachments(item) {
  const summary = item && item.attachmentSummary;
  if (!summary) return false;
  return (summary.imageCount || 0) > 0 || (summary.fileCount || 0) > 0;
}

function injectKey(sid, itemId) {
  return `${sid}\u0000${itemId}`;
}

function clearInjectTimer(sid, itemId) {
  const key = injectKey(sid, itemId);
  const timer = injectTimers.get(key);
  if (timer) {
    clearTimeout(timer);
    injectTimers.delete(key);
  }
}

/**
 * 把条目退回队列（并置顶）并告知用户。
 * 只在条目真的还处于 injecting 时动作：已被回填/删除的不应被“复活”。
 */
async function rollbackInjected(sid, itemId, reason, message) {
  clearInjectTimer(sid, itemId);
  const item = store.findItem(sid, itemId);
  if (!item || item.status !== QUEUE_STATUS.INJECTING) return;
  await store.rollbackInjecting(sid, itemId, reason, reason);
  if (message) showToast(message, 'warning', 4000);
}

/**
 * 向后台投递一条插话并等受理回执。
 * 返回 null 表示没问出结果（SW 未就醒 / 回调超时），调用方必须走“不确认即回退”路径。
 */
function sendInjectRequest(sid, itemId, text) {
  return new Promise((resolve) => {
    let done = false;
    const finish = (v) => { if (!done) { done = true; resolve(v); } };
    // 回执超时远短于 15s 兜底：后台 SW 未就醒时回调可能永远不来，
    // 此时不猜结果，交给 injectDeadlineAt 兜底退回队列。
    const guard = setTimeout(() => finish(null), 2000);
    try {
      chrome.runtime.sendMessage({ type: 'INJECT_MESSAGE', sessionId: sid, itemId, text }, (r) => {
        clearTimeout(guard);
        if (chrome.runtime.lastError) { finish(null); return; }
        finish(r || null);
      });
    } catch {
      clearTimeout(guard);
      finish(null);
    }
  });
}

/**
 * 把一条排队项插入当前正在执行的任务。
 * @param {string} itemId
 * @param {string} [sessionId] 默认当前会话
 * @param {{auto?: boolean, iteration?: number}} [options] auto=true 表示由「自动顺带」触发（提示语不同）
 * @returns {Promise<{ok: boolean, error?: string, pending?: boolean}>} pending=true 表示已投递、在等吸收回执
 */
export async function injectQueueItem(itemId, sessionId, options = {}) {
  const sid = sessionId || state.activeSessionId;
  const auto = options.auto === true;
  if (!sid || !itemId) return { ok: false, error: 'missing_session' };

  const item = store.findItem(sid, itemId);
  if (!item) return { ok: false, error: 'not_found' };
  if (item.status !== QUEUE_STATUS.QUEUED) return { ok: false, error: 'not_queued' };

  // 插进上下文的是**一条文本消息**，图片/文件没有落脚点。
  // 不挡就会变成“看起来插进去了，实际图没带上”——静默丢内容，比直接拒绝恶劣得多。
  if (hasBlockingAttachments(item)) {
    // 自动顺带不弹提示：它会留在队首按队列顺序执行，不是用户操作失败
    if (!auto) showToast(t('queue.injectNoAttachments'), 'warning', 4000);
    return { ok: false, error: 'has_attachments' };
  }

  const key = injectKey(sid, itemId);
  if (injectInFlight.has(key)) return { ok: false, error: 'in_flight' };
  injectInFlight.add(key);

  try {
    // ① 先落盘再发请求：若请求途中面板被杀，重载时读到的 injecting 会被降级回 queued
    await store.markInjecting(sid, itemId);
    injectTimers.set(key, setTimeout(() => {
      void rollbackInjected(sid, itemId, 'timeout', t('queue.injectTimeout'));
    }, INJECT_DEADLINE_MS));

    const res = await sendInjectRequest(sid, itemId, item.text);

    if (!res) return { ok: true, pending: true };  // 问不出来：等 15s 兜底

    if (!res.accepted) {
      const reason = res.reason || 'rejected';
      await rollbackInjected(
        sid, itemId, reason,
        reason === 'no_running_task' ? t('queue.injectNoTask') : t('queue.injectFailed'),
      );
      return { ok: false, error: reason };
    }

    if (auto) {
      // 自动触发必须留一份可追溯的凭据：否则用户只会看到队列条目默默变了状态
      if (sid === state.activeSessionId) {
        showToast(t('queue.autoCarried', { iteration: options.iteration ?? '?' }), 'success', 2500);
      }
    } else {
      showToast(t('queue.injectAccepted'), 'success', 2500);
    }
    return { ok: true, pending: true };
  } finally {
    injectInFlight.delete(key);
  }
}

/** 输入框内容没被改过才清空：用户可能已经开始写下一句了 */
function clearAdhocInput(text) {
  const userInput = document.getElementById('userInput');
  if (!userInput) return;
  if (userInput.value.trim() !== text) return;
  userInput.value = '';
  userInput.style.height = 'auto';
  userInput.dispatchEvent(new Event('input'));
  userInput.focus();
}

/**
 * Alt+Enter：把输入框这段话直接当插话送进正在跑的任务（不进队列）。
 * 输入框只有收到 INJECT_ABSORBED 才清空 —— 没确认就不动用户写的东西。
 */
export async function injectAdHocText(text) {
  const sid = state.activeSessionId;
  const content = String(text || '').trim();
  if (!sid || !content) return { ok: false, error: 'empty' };
  if (!isGenerating(sid)) {
    showToast(t('queue.injectNoTask'), 'warning', 3000);
    return { ok: false, error: 'no_running_task' };
  }

  const itemId = 'adhoc_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7);
  const timer = setTimeout(() => {
    if (!adhocInjections.has(itemId)) return;
    adhocInjections.delete(itemId);
    // 没确认不代表没插入，所以不替用户做决定：原文仍在输入框，他自己看着办
    showToast(t('queue.injectTimeoutAdhoc'), 'warning', 4000);
  }, INJECT_DEADLINE_MS);
  adhocInjections.set(itemId, { text: content, timer });

  const res = await sendInjectRequest(sid, itemId, content);
  if (res && !res.accepted) {
    clearTimeout(timer);
    adhocInjections.delete(itemId);
    showToast(
      res.reason === 'no_running_task' ? t('queue.injectNoTask') : t('queue.injectFailed'),
      'warning', 4000,
    );
    return { ok: false, error: res.reason };
  }
  if (res && res.accepted) showToast(t('queue.injectAccepted'), 'success', 2500);
  return { ok: true, pending: true };
}

/** 后台确认吸收：这是唯一允许把条目移出队列的信号 */
function handleInjectAbsorbed(message) {
  const sid = message?.sessionId;
  const ids = Array.isArray(message?.items) ? message.items : [];
  if (!sid || ids.length === 0) return;

  let absorbedQueued = 0;
  for (const itemId of ids) {
    // 临时插话（Alt+Enter）：没有队列条目，只需释放输入框
    const adhoc = adhocInjections.get(itemId);
    if (adhoc) {
      clearTimeout(adhoc.timer);
      adhocInjections.delete(itemId);
      clearAdhocInput(adhoc.text);
      continue;
    }

    clearInjectTimer(sid, itemId);
    if (!store.findItem(sid, itemId)) continue; // 用户已手动删掉
    absorbedQueued++;
    void store.settle(sid, itemId, {
      status: QUEUE_STATUS.INJECTED,
      note: 'injected',
      callId: message.callId || null,
      iteration: message.iteration ?? null,
    });
  }

  // 只有还在看这个会话时才提示，否则切走也会跳 toast（干扰）
  if (absorbedQueued > 0 && sid === state.activeSessionId) {
    showToast(t('queue.injected'), 'success', 2500);
  }
  document.dispatchEvent(new CustomEvent('queue-injected', {
    detail: { sessionId: sid, items: ids, iteration: message.iteration ?? null },
  }));
}

/** 后台没来得及注入（任务恰好结束 / 缓冲满）：立刻退回队列，不让用户干等 15s */
function handleInjectRejected(message) {
  const sid = message?.sessionId;
  const ids = Array.isArray(message?.items) ? message.items : [];
  if (!sid || ids.length === 0) return;
  const reason = message.reason || 'rejected';
  const text = reason === 'task_ended' ? t('queue.injectNoTask') : t('queue.injectFailed');
  for (const itemId of ids) {
    const adhoc = adhocInjections.get(itemId);
    if (adhoc) {
      // 原文一直留在输入框，这里只释放计时器，不弹第二条提示
      clearTimeout(adhoc.timer);
      adhocInjections.delete(itemId);
      continue;
    }
    void rollbackInjected(sid, itemId, reason, itemId === ids[0] ? text : null);
  }
}

/**
 * 「自动顺带」：运行中的任务在自然断点自动把队首一条并入本轮（不必等它跑完）。
 * 判定全在 queue-auto-carry.js（纯函数），这里只负责取现场 + 投递。
 *
 * 为什么由队列模块听执行日志：轮次记账、队首选取、投递都要碰队列状态；
 * 而 chat-manager 里那份监听是按“当前渲染的这条消息”过滤的，跨会话时看不到别的会话的轮次。
 */
function handleAutoCarryOnExecutionUpdate(message) {
  const sid = message?.sessionId;
  if (!sid) return;
  // 子任务有自己的迭代号，但它不取插话缓冲（只有顶层循环在迭代边界 drain），
  // 此时投递必须干等到 15s 超时回退 → 白弹一次“插入超时”。整段跳过。
  if (message.isSubtask === true) return;
  if (store.isPaused(sid)) return;

  const iteration = peakIteration(message.executionLog);
  if (!iteration) return;

  // 只带队首：顺序就是优先级。带附件的插不进去，静默跳过让它按队列顺序执行
  const head = store.peekNext(sid);
  const candidate = head && !hasBlockingAttachments(head) ? head : null;

  const cfg = state.chatConfig || {};
  const result = evaluateAutoCarry({
    tracker: autoCarryTrackers.get(sid),
    callId: message.callId || null,
    iteration,
    everyN: cfg.queueAutoCarryEveryNIterations,
    enabled: cfg.queueAutoCarry !== false,
    hasCandidate: !!candidate,
  });
  autoCarryTrackers.set(sid, result.tracker);

  if (!result.carry) return;
  logger.debug('[QueueRunner] auto carry item', candidate.id, 'at iteration', iteration, 'session', sid);
  void injectQueueItem(candidate.id, sid, { auto: true, iteration });
}

/** 面板侧接收后台的插话回执 */
function handleInjectionMessage(message) {
  if (!message || typeof message !== 'object') return;
  if (message.type === 'INJECT_ABSORBED') handleInjectAbsorbed(message);
  else if (message.type === 'INJECT_REJECTED') handleInjectRejected(message);
  else if (message.type === 'EXECUTION_STATUS_UPDATE') handleAutoCarryOnExecutionUpdate(message);
}

/**
 * 清理没有对应队列条目的附件记录（启动时跑一次）。
 * 崩溃 / 多实例竞争等路径可能漏删，这里兜底：只多占磁盘，绝不丢数据。
 */
async function pruneAttachmentOrphans() {
  try {
    const alive = new Set();
    for (const sid of store.listSessionIdsWithItems()) {
      for (const item of store.getItems(sid)) alive.add(item.id);
    }
    const removed = await attachmentStore.pruneOrphans(alive);
    if (removed) logger.debug('[QueueRunner] pruned orphan attachments:', removed);
  } catch (err) {
    logger.warn('[QueueRunner] prune orphan attachments failed:', err?.message || err);
  }
}

// ============================================================
// 初始化 / 暂停
// ============================================================

let inited = false;
/** 启动接力的轮询句柄 */
let resumeTimer = null;
/** init 里挂到 document 的监听（重置时摘掉，避免多轮 init 累积触发） */
const domBindings = [];

function onDocument(type, handler) {
  document.addEventListener(type, handler);
  domBindings.push([type, handler]);
}

/** 问后台「会话是否在跑」的回执超时 */
const QUERY_RUNNING_TIMEOUT_MS = 1500;

/** 向后台确认该会话是否真有任务在跑（面板刚启动时自己的 generatingSessionIds 是空的，不能作数） */
function querySessionRunning(sid) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };
    // 回执超时也要解开：后台 SW 未就醒时回调可能永远不来，不能把轮询阻塞死
    const timer = setTimeout(() => finish(null), QUERY_RUNNING_TIMEOUT_MS);
    try {
      chrome.runtime.sendMessage({ type: 'QUERY_SESSION_RUNNING', sessionId: sid }, (res) => {
        clearTimeout(timer);
        // 后台 SW 可能还没就绪 → 返回 null，表示“没问出来”，下一轮再问
        if (chrome.runtime.lastError) { finish(null); return; }
        finish(!!(res && res.running));
      });
    } catch {
      clearTimeout(timer);
      finish(null);
    }
  });
}

/**
 * 尝试接力一次。
 * 队列是会话维度的：面板停在 B 时，A 的队列也必须在自己空闲时跑完，所以这里扫描
 * **所有有队列的会话**，而不是只看 activeSessionId。
 * 一轮只推进一个会话：避免一次 tick 就把好几个会话的队首同时派出去，并发开多条流。
 * @returns {Promise<boolean>} true = 已有结论（或无需重试），可以停止轮询
 */
async function tryAutoResumeOnce() {
  if (!state.activeSessionId) return false; // 会话还没恢复完，继续等

  const sids = store.listSessionIdsWithItems();
  if (sids.length === 0) return true;       // 没有任何待执行的条目

  let needsRetry = false;
  for (const sid of sids) {
    if (store.isPaused(sid)) continue;   // 用户主动停的：UI 上有「继续队列」，不再替他决定
    if (isGenerating(sid)) continue;     // 正在生成：结束时会有人通知我们
    if (!store.peekNext(sid)) continue;

    const running = await querySessionRunning(sid);
    if (running === null) { needsRetry = true; continue; } // 没问出来后重试
    if (running) continue;                                 // 后台确实在跑
    if (store.isPaused(sid) || isGenerating(sid)) continue;

    await drainQueue(sid);
    return true;
  }
  return !needsRetry;
}

/**
 * 启动接力：轮询到有结论为止（约 20 秒）。
 * 为什么不能只试一次：面板刷新后 activeSessionId 是异步恢复的，background SW 也可能
 * 尚未唤醒（sendMessage 直接 lastError）。任何一次提前放弃都会让队列「明明有任务却纹丝不动」。
 */
function scheduleAutoResume() {
  if (resumeTimer) return;
  let attempts = 0;
  const tick = async () => {
    resumeTimer = null;
    if (++attempts > 25) return; // 最多 ~20s，之后交给 generation-ended / 手动「继续队列」
    let done = false;
    try {
      done = await tryAutoResumeOnce();
    } catch (err) {
      logger.warn('[QueueRunner] auto-resume attempt failed:', err?.message || err);
    }
    if (done) return;
    resumeTimer = setTimeout(tick, 800);
  };
  resumeTimer = setTimeout(tick, 300);
}

/** 停止启动轮询（派发成功或会话已就绪时调用，避免无谓的定时器） */
function stopAutoResume() {
  if (!resumeTimer) return;
  clearTimeout(resumeTimer);
  resumeTimer = null;
}

/**
 * 初始化队列运行器（幂等）。
 * @param {{autoResume?: boolean}} [options] autoResume: 面板启动后是否尝试接力历史队列
 */
export async function initQueueRunner({ autoResume = true } = {}) {
  if (inited) return;
  inited = true;

  await store.init();
  store.watchExternalChanges();
  // 先清理孤儿附件（上一条崩溃可能留下没有归属的图片/文件记录）
  void pruneAttachmentOrphans();

  onGenerationEnded(handleGenerationEnded);

  // 插话回执在这里收口：INJECT_ABSORBED 是条目出队的**唯一**凭据，
  // 少了这条监听，条目会一直挂在 injecting 直到超时（表现就是“点了没反应”）。
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.addListener) {
    chrome.runtime.onMessage.addListener(handleInjectionMessage);
  }

  // 用户点"停止"：暂停该会话的自动接力（否则下一条会立刻把停掉的任务拉起来）
  onDocument('task-stop-requested', (e) => {
    const sid = e?.detail?.sessionId || state.activeSessionId;
    if (!sid) return;
    // 停止并发送：这次停下就是为了让队列接上，所以不暂停、直接把队列推一把。
    // （推这一把多半会因为“本会话还在生成中”被挡住，剩余靠 generation-ended 接手）
    if (drainAfterStop.delete(sid)) {
      void store.resumeSession(sid).then(() => drainQueue(sid));
      return;
    }
    void store.pauseSession(sid, 'user_stopped');
  });

  // 用户手动发新消息 = 明确想继续用这个会话，解除暂停（否则停一次就永远不再接力）
  onDocument('generating-state-changed', () => {
    const sid = state.activeSessionId;
    if (!sid) return;
    if (state.isGenerating && store.isPaused(sid)) {
      void store.resumeSession(sid);
      return;
    }
    // 有会话刚从生成态变空闲：把队列再推一把（兼底：万一 generation-ended 没广播到）
    for (const queued of store.listSessionIdsWithItems()) {
      if (store.isPaused(queued) || isGenerating(queued)) continue;
      if (!store.peekNext(queued)) continue;
      void drainQueue(queued);
      break;
    }
  });

  // 换会话 / 面板重新可见都是「新的机会」：队列是按会话存的，切回那个会话时必须能接着跑。
  // 没有这两条，刷新后若首轮轮询窗口（~20s）耗尽，就只能靠用户手动点「继续队列」。
  onDocument('session-switched', () => scheduleAutoResume());
  onDocument('visibilitychange', () => {
    if (document.visibilityState === 'visible') scheduleAutoResume();
  });

  // 不再有「只试一次就永久放弃」的路径：轮询到有结论（或超时）为止
  if (autoResume) scheduleAutoResume();
}

/** 手动继续队列（用户点"继续队列"按钮） */
export async function resumeQueue(sessionId) {
  const sid = sessionId || state.activeSessionId;
  if (!sid) return;
  await store.resumeSession(sid);
  await drainQueue(sid);
}

/** 仅供测试：重置运行器内部状态 */
export function __resetRunnerForTest() {
  draining.clear();
  rerunRequested.clear();
  volatileContext.clear();
  for (const timer of injectTimers.values()) clearTimeout(timer);
  injectTimers.clear();
  injectInFlight.clear();
  for (const entry of adhocInjections.values()) clearTimeout(entry.timer);
  adhocInjections.clear();
  autoCarryTrackers.clear();
  drainAfterStop.clear();
  if (typeof chrome !== 'undefined' && chrome.runtime?.onMessage?.removeListener) {
    chrome.runtime.onMessage.removeListener(handleInjectionMessage);
  }
  stopAutoResume();
  for (const [type, handler] of domBindings) document.removeEventListener(type, handler);
  domBindings.length = 0;
  dispatcher = null;
  inited = false;
}
