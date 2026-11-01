// side_panel/chat-reattach.js - 面板重启后重新接入「后台仍在跑」的任务
//
// 问题现场：MV3 SW 被系统回收 → 面板页面连带卸载 → 点桌面通知重新打开的是一个
// 全新实例。后台任务被 30s 闹钟唤醒后继续跑（左侧状态条在动、界面在跳），但会话区
// 一个字都没有 —— 因为所有流式渲染都挂在 callApi 的监听闭包里，新实例既没有那个
// 闭包，也没有对应的 callId。
//
// 本模块是纯增量旁路：
// - 启动/切回会话时向后台确认「哪些会话真的在跑 + 各自的活跃 callId」；
// - 对「后台在跑 + 本地没有 listener」的会话创建独立镜像，接管该 callId 的
//   STREAM_* / EXECUTION_STATUS_UPDATE，复用 chat-streaming 的既有渲染函数；
// - 收终态时渲染 + 落库一次（消息带 callId 标记，与 SW 侧兜底写入按 callId 去重）。
//
// 不碰的东西：callApi 主监听、sendMessage 主链路、会话切换/队列接力逻辑。
import logger from '../shared/logger.js';
import { t } from '../shared/i18n.js';
import state from './state.js';
import { notifyGenerationEnded } from './generation-lifecycle.js';
import {
  addStreamingMessage,
  updateStreamingMessage,
  appendThinkingIndicator,
  markStreamingRetrying,
  appendToolCallItems,
  appendToolResult,
  createAgentStreamOutput,
  createPreSelectCard,
  finalizeStreamingMessage,
  createStreamingElementAccessor,
  setStreamedContent,
  setReasoningContent,
  deleteStreamingState,
  setThinkingStartTime,
  setProcessStartTime,
  mountStreamingElement,
  scrollStreamingToBottom,
  applyStreamSnapshot,
} from './chat-streaming.js';
import { addCodeCopyButtons } from './markdown-render.js';
import { readStreamSnapshot } from './stream-snapshot.js';
import { openPanelObserverPort, closePanelObserverPort } from './panel-observer-port.js';
// 注意：会话落库（session-manager → 存储层）依赖较重的浏览器侧模块链，改为使用时
// 动态导入：既避免面板初始化时的无意义加载，也让本模块的纯逻辑可独立单测。

/**
 * 单会话流式镜像（纯状态机，渲染/落库通过注入完成，便于单测）
 * @param {Object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.callId 本轮活跃 callId（后台注册表下发的同一个值）
 * @param {Object} opts.renderer 生产渲染回调（与 callApi 监听同口径，缺项自动跳过）
 * @param {(payload:Object)=>Promise<any>} opts.persist 终态落库
 * @param {()=>void} [opts.onFinished] 终态收尾（清理挂账、移除监听）
 * @param {string} [opts.emptyFallback] 空内容兜底文案
 * @param {boolean} [opts.awaitSnapshot] 先等一次气泡快照读盘：窗口内到达的消息按
 *   到达顺序积压，还原完再回放（先渲染再被覆盖等于白渲染，见 preQueue 注释）
 */
export function createSessionStreamMirror({
  sessionId,
  callId,
  renderer,
  persist,
  onFinished = () => {},
  emptyFallback = '',
  awaitSnapshot = false,
}) {
  let buffered = '';
  let finished = false;
  let awaiting = awaitSnapshot;
  // 等待窗口内到达的消息按到达顺序积压，收窗时再回放。
  // 只挡增量不够用：工具卡片先渲染出去，随后 restore() 的 innerHTML 一盖就抹掉了；
  // 命令输出更惨 —— 渲染器按 execId 缓存的 entry.element 成了脱离文档的孤儿节点，
  // 之后每条增量都写进那个看不见的节点，这个 execId 的显示永久冻结。
  let preQueue = [];

  const matches = (message) =>
    !!message && message.sessionId === sessionId && message.callId === callId;

  /** 连续 chunk 合成一条：窗口里攒了几十条增量时回放只落一次 DOM，与不攒时的量级一致 */
  const coalesceChunks = (list) => {
    const out = [];
    for (const m of list) {
      const prev = out[out.length - 1];
      if (m.type === 'STREAM_CHUNK' && prev && prev.type === 'STREAM_CHUNK') {
        out[out.length - 1] = { ...m, delta: (prev.delta || '') + (m.delta || '') };
      } else {
        out.push(m);
      }
    }
    return out;
  };

  /** 收掉等待窗口并放弃还原（快照已落后于这一轮的真实状态），只把积压按序补渲染 */
  const closeWindowWithoutRestore = () => {
    awaiting = false;
    const queued = coalesceChunks(preQueue);
    preQueue = [];
    for (const m of queued) dispatch(m);
  };

  const finish = (payload) => {
    finished = true;
    // 落库失败绝不能卡住收尾：界面已渲染完，收尾回调必须无条件执行
    Promise.resolve()
      .then(() => persist(payload))
      .catch((err) => logger.warn('[ChatReattach] 终态落库失败（忽略）:', err?.message || err))
      .then(() => { try { onFinished(); } catch { /* 收尾异常忽略 */ } });
  };

  return {
    sessionId,
    callId,
    get finished() { return finished; },
    /** 作废本镜像（后台把这一轮换成了新 callId / 本实例要重新接管）：此后不再消费任何消息，也不落库 */
    dispose() {
      finished = true;
    },
    /**
     * 结束等待窗口：先用快照把「脱落期间已经输出的内容」补进气泡，
     * 再把窗口内积压的消息按到达顺序回放。
     * @param {{callId:string,html:string,accumulated:string}|null} snapshot
     *   读不到 / callId 不是本轮 → 什么都不还原，只回放积压
     */
    restore(snapshot) {
      if (!awaiting) return;
      awaiting = false;
      const sameRound = !!snapshot && snapshot.callId === callId;
      const accumulated = sameRound && typeof snapshot.accumulated === 'string' ? snapshot.accumulated : '';
      const painted = sameRound && !!snapshot.html;
      if (painted) renderer.restore?.({ html: snapshot.html });
      buffered = accumulated;
      // html 还原成功时那段正文已经在 DOM 里，再 chunk 一遍就是把同一段文字写两份；
      // 只有「超限降级成只存正文」的快照才靠 chunk 把文字补出来。
      if (accumulated && !painted) renderer.chunk?.(accumulated);
      const queued = coalesceChunks(preQueue);
      preQueue = [];
      for (const m of queued) dispatch(m);
    },
    /**
     * @param {Object} message 后台广播消息
     * @returns {boolean} 是否被本镜像消费
     */
    handleMessage(message) {
      if (finished || !matches(message)) return false;

      if (awaiting) {
        if (message.type === 'STREAM_CHUNK') {
          preQueue.push(message);
          return true;
        }
        // 终态收口等不得（不能让收尾被一次读盘拖住）：立即收窗、放弃还原，
        // 先把积压按序补渲染出去再处理这一条。其余消息（含新一轮 STREAM_START：
        // 同一个 callId 里每轮 ReAct 都是一次 start）一律积压，还原后按真实顺序回放。
        if (message.type === 'API_COMPLETE' || message.type === 'API_ERROR') {
          closeWindowWithoutRestore();
          return dispatch(message);
        }
        preQueue.push(message);
        return true;
      }
      return dispatch(message);
    },
  };

  function dispatch(message) {
    switch (message.type) {
      case 'STREAM_START':
        buffered = '';
        renderer.start?.();
        return true;
      case 'STREAM_CHUNK':
        // 字段是 delta（stream-controller 的增量协议），不是 content：
        // 读错字段会让接管后的正文永远是空的，只剩一个转圈的「思考中」气泡
        buffered += message.delta || '';
        renderer.chunk?.(buffered);
        return true;
      case 'STREAM_TOOL_CALL':
        renderer.toolCalls?.(message.toolCalls || []);
        return true;
      case 'STREAM_TOOL_RESULT':
        // 工具执行结果：不接就只剩「工具卡片永远转圈」
        if (message.result) renderer.toolResult?.(message.result);
        return true;
      case 'AGENT_STREAM':
        // 命令的实时 stdout/stderr：只带增量 data，由渲染器按 execId 攒整段
        if (message.execId) renderer.agentStream?.(message);
        return true;
      case 'AGENT_STREAM_DONE':
        if (message.execId) renderer.agentStreamDone?.(message);
        return true;
      case 'API_RETRYING':
        renderer.retrying?.(message.attempt, message.maxRetries);
        return true;
      case 'STREAM_PRESELECT':
        renderer.preselect?.(message.preselectLog || []);
        return true;
      case 'EXECUTION_STATUS_UPDATE':
        // 只消费、不渲染进气泡：正常流程把 nodeName 交给 loading 消息里的执行状态区
        // （updateExecutionStatus），气泡内的 .stream-status 只在 STREAM_DONE 清空、
        // finalize 时移除。接管侧照抄进 .stream-status 就会出现「输出中」下面
        // 常驻一行「🔧 API调用 (第2次)」—— 一条永远不清的假状态。
        return true;
      case 'API_COMPLETE': {
        const finalContent = (message.content && String(message.content).trim())
          ? message.content
          : (emptyFallback || buffered);
        const executionLog = message.executionLog || [];
        const extras = {
          reflectionScore: message.reflectionScore,
          reasoningContent: message.reasoningContent || null,
          wasRevised: message.wasRevised || false,
          budgetEnded: message.budgetEnded === true,
        };
        renderer.final?.(finalContent, executionLog, extras);
        finish({ sessionId, callId, content: finalContent, executionLog, ...extras });
        return true;
      }
      case 'API_ERROR':
        renderer.error?.(message.error || '', message.executionLog || []);
        finish({ sessionId, callId, error: message.error || '', executionLog: message.executionLog || [] });
        return true;
      default:
        return false;
    }
  }
}

/**
 * 接管决策（bookkeeping 与 IO 分离，便于单测）
 * @param {Object} opts
 * @param {()=>Promise<{activeSessionIds?:string[],activeCallIds?:Object}>} opts.queryRunning
 * @param {(sessionId:string)=>boolean} opts.hasLocalListener 本实例是否已有该会话的 callApi 监听
 * @param {(sessionId:string,callId:string)=>boolean} opts.isAttached
 * @param {(sessionId:string,callId:string)=>void} opts.attach
 */
export function createReattachManager({ queryRunning, hasLocalListener, isAttached, attach }) {
  return {
    /** 与后台对齐一次：只接管「后台说在跑 + 有活跃 callId + 本地无 listener」的会话 */
    async syncFromBackground() {
      try {
        const res = await queryRunning();
        const callIds = res && res.activeCallIds ? res.activeCallIds : {};
        for (const [sessionId, callId] of Object.entries(callIds)) {
          if (!sessionId || !callId) continue;
          if (hasLocalListener(sessionId)) continue;
          if (isAttached(sessionId, callId)) continue;
          attach(sessionId, callId);
        }
      } catch (err) {
        // SW 未就绪 / 端口未建立：静默降级，下次切换会话或启动再来
        logger.debug('[ChatReattach] 查询后台运行状态失败（忽略）:', err?.message || err);
      }
    },
  };
}

// ==================== 生产接线 ====================

let _inited = false;
/** sessionId -> 镜像 */
const _mirrors = new Map();
let _manager = null;
let _listenerBound = false;
let _hydratedHandler = null;
let _historyRenderedHandler = null;
let _syncTimer = null;

// 对齐节流：一条流每秒能来几十条广播，不能每条都去问后台；
// 但必须保证「trailing」一定发生——面板先开、任务后到时，全靠这一下把自己叫醒。
const SYNC_THROTTLE_MS = 250;

// 能证明「某会话正在产出」的广播类型（只认带 callId 的流式事件，
// 会话列表刷新之类的被动消息不触发对齐，避免无谓查询）
const STREAMING_MESSAGE_TYPES = new Set([
  'STREAM_START',
  'STREAM_CHUNK',
  'STREAM_TOOL_CALL',
  'STREAM_TOOL_RESULT',
  'AGENT_STREAM',
  'AGENT_STREAM_DONE',
  'API_RETRYING',
  'STREAM_PRESELECT',
  'EXECUTION_STATUS_UPDATE',
  'API_COMPLETE',
  'API_ERROR',
]);

function _queryRunning(timeoutMs = 0) {
  return new Promise((resolve, reject) => {
    let settled = false;
    let timer = null;
    const finish = (fn, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      fn(value);
    };
    // 回执可能永远不来（SW 未就绪）：调用方要能等到一个结论，不能把会话卡在「核对中」
    if (timeoutMs > 0) timer = setTimeout(() => finish(resolve, {}), timeoutMs);
    try {
      chrome.runtime.sendMessage({ type: 'QUERY_SESSION_RUNNING' }, (res) => {
        if (chrome.runtime.lastError) { finish(reject, new Error(chrome.runtime.lastError.message)); return; }
        finish(resolve, res || {});
      });
    } catch (err) {
      finish(reject, err);
    }
  });
}

/** 生产渲染器：复用 chat-streaming 的既有函数，不另造一套 DOM */
function _buildRenderer(sessionId, el) {
  // 命令流式输出按 execId 保活（对应 callApi 闭包里的 _agentStreams）：
  // AGENT_STREAM 每条只带一段增量，必须自己攒完整段再整块写进 <code>。
  // 挂在渲染器上随镜像一起生灭，不留全局脏映射。
  const agentStreams = new Map();
  return {
    start() {
      setStreamedContent(sessionId, '');
      setReasoningContent('');
      setThinkingStartTime(Date.now());
      // 后续轮次：上一轮指示器已被 appendToolCallItems 移除，不补就是
      // 「工具跑完到下一段输出之间界面是死的」
      appendThinkingIndicator(el);
      scrollStreamingToBottom(el);
    },
    chunk(full) {
      setStreamedContent(sessionId, full);
      updateStreamingMessage(el, full);
    },
    restore({ html }) {
      // 整段换回脱落期的 DOM：innerHTML 一盖，事件重挂（停止按钮/卡片折叠）
      applyStreamSnapshot(el, html);
    },
    toolCalls(tcs) {
      appendToolCallItems(el, tcs);
    },
    toolResult(result) {
      appendToolResult(result, el);
    },
    agentStream(message) {
      let entry = agentStreams.get(message.execId);
      if (!entry) {
        // 挂载位置由查找结果决定，不能用 outputDiv.isConnected：
        // 用户切换会话期间整个流式元素都脱离文档，判定会误把输出搬出卡片
        const card = message.toolCallId
          ? el.querySelector(`.tool-call-item[data-tool-call-id="${message.toolCallId}"]`)
          : null;
        const outputDiv = createAgentStreamOutput(card, el.querySelector('.stream-content'));
        entry = { element: outputDiv, stdout: '', stderr: '' };
        agentStreams.set(message.execId, entry);
        addCodeCopyButtons();
      }
      const codeEl = entry.element.querySelector('code');
      if (!codeEl) return;
      if (message.streamType === 'stderr') {
        entry.stderr += message.data || '';
      } else {
        entry.stdout += message.data || '';
      }
      codeEl.textContent = entry.stdout + (entry.stderr ? '\n' + entry.stderr : '');
      codeEl.parentElement.scrollTop = codeEl.parentElement.scrollHeight;
    },
    agentStreamDone(message) {
      const entry = agentStreams.get(message.execId);
      if (entry && message.exitCode !== 0) {
        entry.element.classList.add('agent-stream-error');
      }
    },
    retrying(attempt, maxRetries) {
      markStreamingRetrying(el, attempt, maxRetries);
    },
    preselect(entries) {
      const mc = el.querySelector('.message-content');
      if (!mc || !entries.length) return;
      // 与正常路径同样插在 message-content 最前面（视觉上先于「思考中」）
      entries.forEach((entry) => mc.insertBefore(createPreSelectCard(entry), mc.firstChild));
    },
    final(content, executionLog, extras = {}) {
      // 与 callApi 的 API_COMPLETE 分支保持同参：反思徽标/推理过程/已修订标记都要还原
      finalizeStreamingMessage(
        el, content, executionLog,
        extras.reflectionScore, extras.reasoningContent, extras.wasRevised,
      );
    },
    error(text, executionLog) {
      // 与完成同样就地收口：把气泡转成错误文案。
      // 直接删掉气泡等于「会话区什么都没有」—— 错误只进了 state.messageHistory 与 DB，
      // 要切走再切回（走 DOM 重建）才看得到，而这正是本次要修的故障表现。
      finalizeStreamingMessage(el, text, executionLog || []);
    },
  };
}

/** 生产落库：消息带 callId，SW 侧兜底写入按同一 callId 去重 */
async function _persistFinal(payload, sessionId, el) {
  const isError = !!payload.error;
  const entry = {
    role: 'assistant',
    content: isError ? payload.error : (payload.content || ''),
    executionLog: payload.executionLog || [],
    reflectionScore: payload.reflectionScore,
    wasRevised: payload.wasRevised || false,
    callId: payload.callId,
    resumed: true,
    resumable: payload.budgetEnded ? 'budget' : false,
  };
  if (!isError && el) {
    entry.messageId = el.dataset.messageId || undefined;
    entry.htmlContent = el.dataset.htmlContent || el.outerHTML;
  }

  if (state.activeSessionId === sessionId) {
    // 活动会话：同步进内存历史（刷新/切换回都会按它重建），DB 写入照常
    state.messageHistory.push(entry);
    try {
      document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId } }));
    } catch { /* 非浏览器环境 */ }
  }
  const { appendMessageToSession } = await import('./session-manager.js');
  await appendMessageToSession(sessionId, entry);
}

/**
 * 生成态记账同步到 storage.session（chat-manager 的动态导入，避免顶层重依赖）。
 * 不同步的后果：重开面板时 restorePendingSessionsFromStorage 会恢复出陈旧的「生成中」。
 */
function _syncPendingStorage() {
  import('./chat-manager.js')
    .then((m) => m.syncPendingSessionsToStorage())
    .catch((err) => logger.debug('[ChatReattach] 同步生成态失败（忽略）:', err?.message || err));
}

/** 快照读盘上限：超时按「没有快照」放行攒下来的增量，不阻塞接管 */
const SNAPSHOT_READ_TIMEOUT_MS = 1000;

function _readSnapshotWithTimeout(sessionId) {
  return Promise.race([
    readStreamSnapshot(sessionId),
    new Promise((resolve) => setTimeout(() => resolve(null), SNAPSHOT_READ_TIMEOUT_MS)),
  ]);
}

function _attach(sessionId, callId) {
  const accessor = createStreamingElementAccessor(sessionId);
  // 已有流式元素（原发起实例 / 本实例此前已接管）：绝不抢它的流
  if (accessor()) return false;

  const el = addStreamingMessage(sessionId);
  // 气泡自己带上本轮 callId：流式期间的快照抓拍靠它判定「还是不是同一轮」
  el.dataset.callId = callId;
  accessor(el);
  setStreamedContent(sessionId, '');
  setThinkingStartTime(Date.now());
  setProcessStartTime(Date.now());

  // 复用既有「生成中」记账：切回会话走 mountStreamingElement 即可看到实时内容。
  // generatingSessionIds 必须一起登记：停止按钮、sendMessage 的并发早退、队列接力
  // 全部只看它（state.isGenerating）。只记 pending 等于告诉界面「我闲着」——
  // 用户一点发送就会在后台起第二个顶层 reactLoop（checkpoint 互相覆盖、双流式气泡）。
  state.pendingCallApiSessionIds.add(sessionId);
  state.generatingSessionIds.add(sessionId);
  _syncPendingStorage();
  try {
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
  } catch { /* 非浏览器环境 */ }

  const mirror = createSessionStreamMirror({
    sessionId,
    callId,
    awaitSnapshot: true,
    renderer: _buildRenderer(sessionId, el),
    persist: (payload) => _persistFinal(payload, sessionId, el),
    emptyFallback: t('chatMsg.emptyModelReply'),
    onFinished: () => {
      // 落库是异步的：这段时间里后台可能已换轮、同一会话建出了新镜像。
      // 此时旧收尾若继续执行，会把新镜像的映射/流式元素登记一起清掉，
      // 新镜像就成孤儿（广播查不到它）→ 气泡永久停在生成中。
      if (_mirrors.get(sessionId) !== mirror) return;
      _mirrors.delete(sessionId);
      closePanelObserverPort(sessionId);
      state.pendingCallApiSessionIds.delete(sessionId);
      _syncPendingStorage();
      deleteStreamingState(sessionId);
      try {
        document.dispatchEvent(new CustomEvent('session-cache-invalidate', { detail: { sessionId } }));
      } catch { /* 非浏览器环境 */ }
      // 收尾必须走统一入口：完成标记（markSessionCompleted）、generating-state-changed、
      // generation-ended 与队列接力全挂在这一处。镜像自己再手写一遍必然漏掉后面的接线。
      notifyGenerationEnded(sessionId);
    },
  });

  _mirrors.set(sessionId, mirror);
  // 让 SW 知道「是这个面板在看这个任务」：端口断开才会走关闭提醒的复核链路
  openPanelObserverPort(sessionId);
  // 还原脱落期间已输出的内容：读盘是异步的，窗口内的新消息由镜像先攒着（见 awaitSnapshot）。
  // 带超时兜底 —— 宁可这一次不还原，也不能把这条流的渲染永久卡在一次 IO 上。
  _readSnapshotWithTimeout(sessionId)
    .then((snap) => {
      if (mirror.finished || _mirrors.get(sessionId) !== mirror) return;
      mirror.restore(snap);
    })
    .catch(() => mirror.restore(null));
  // 目标会话当前可见才挂载：addStreamingMessage 对非活动会话返回游离元素（已登记在
  // _streamingElements 里），不挂进当前会话的 DOM，避免把别人的气泡塞进正在看的会话。
  // 等用户切回来时由 syncReattachForSession 补挂。
  if (state.activeSessionId === sessionId) mountStreamingElement(sessionId);
  logger.info(`[ChatReattach] 已接管运行中的任务: sessionId=${sessionId}, callId=${callId}`);
  return true;
}

/**
 * 作废并拆掉某会话的镜像（气泡、挂账、累积内容一并收掉）。
 * 与 onFinished 的区别：这里没有终态可落库，只是让位给新的 callId。
 */
function _disposeMirror(sessionId) {
  const prev = _mirrors.get(sessionId);
  if (!prev) return;
  _mirrors.delete(sessionId);
  closePanelObserverPort(sessionId);
  try { prev.dispose?.(); } catch { /* 已结束的镜像 */ }

  const accessor = createStreamingElementAccessor(sessionId);
  const el = accessor();
  try { el?.remove(); } catch { /* 已脱离文档 */ }
  accessor(null);
  deleteStreamingState(sessionId);

  state.pendingCallApiSessionIds.delete(sessionId);
  _syncPendingStorage();
  try {
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
  } catch { /* 非浏览器环境 */ }
}

function _runSync() {
  const manager = _manager;
  if (!manager) return;
  Promise.resolve()
    .then(() => manager.syncFromBackground())
    .catch((err) => logger.debug('[ChatReattach] 对齐后台状态失败（忽略）:', err?.message || err));
}

/**
 * 延后一次「与后台对齐」（节流，合并同一波消息）。
 * 用于两种「启动时对齐不到」的时序：面板先开、任务后到（SW 被闹钟唤醒续跑），
 * 以及补水完成后当前会话才真正可见。
 */
function _scheduleSync() {
  if (!_inited || !_manager || _syncTimer) return;
  _syncTimer = setTimeout(() => {
    _syncTimer = null;
    _runSync();
  }, SYNC_THROTTLE_MS);
}

/**
 * 镜像的 callId 与后台不一致时重新接管。
 * 必须以后台登记为准再动手：旧实例的迟到消息也可能带着别的 callId，
 * 信它会把镜像带去另一个死流，来回横跳。
 */
/** 正在核对让位的会话：sessionId -> { callId, messages }（同一波只核对一次，消息暂存回放） */
const _retargeting = new Map();
/** 让位核对的回执上限：SW 异常不能把这个会话的广播永久卡住 */
const RETARGET_QUERY_TIMEOUT_MS = 3000;
/** 已吸收终态键的上限（只需挡住短时间内的重复广播） */
const ABSORBED_TERMINALS_MAX = 100;
/** 已用「自带终态」收尾过的 `${sessionId}|${callId}`，防同一终态重复建气泡 */
const _absorbedTerminals = new Set();
/** 终态消息：这一轮的结局，必须有人渲染 + 落库 */
const TERMINAL_MESSAGE_TYPES = new Set(['API_COMPLETE', 'API_ERROR']);

/**
 * 用终态消息自身收尾。
 * 现场：SW 续跑（auto_2）很快失败，面板看到的第一个新 callId 消息就是 API_ERROR，
 * 而 reactLoop 的 finally 已经把活跃登记清掉。若只信 QUERY_SESSION_RUNNING，就会
 * 既不接管也不收尾 —— 旧气泡永久「生成中」，该会话的归档/继续执行全被挡。
 */
function _absorbTerminal(sessionId, message) {
  const key = `${sessionId}|${message.callId}`;
  if (_absorbedTerminals.has(key)) return;
  _absorbedTerminals.add(key);
  // 只挡短时重放：Set 按插入序淘汰最老的，别让它随面板常驻无限长大
  if (_absorbedTerminals.size > ABSORBED_TERMINALS_MAX) {
    _absorbedTerminals.delete(_absorbedTerminals.values().next().value);
  }
  // 旧镜像盯着的是死流，先让位（不落库）；再用终态消息自带 callId 建一次性镜像，
  // 走与正常接管完全相同的渲染 + 落库路径，收尾时由 onFinished 拆掉。
  _disposeMirror(sessionId);
  if (!_attach(sessionId, message.callId)) return;
  _mirrors.get(sessionId)?.handleMessage(message);
}

function _maybeRetarget(sessionId, callId, message) {
  // 同一波消息（STREAM_START 紧跟若干 chunk，甚至终态）会各自带新 callId 进来。
  // 这里既不能重复核对（会把刚建好的气泡反复拆掉重建），也不能把后续消息丢掉：
  // 核对是一次跨进程往返，续跑很快失败时终态往往就落在这个窗口里 —— 丢了就再也没人收尾。
  let wave = _retargeting.get(sessionId);
  if (wave) {
    wave.messages.push(message);
    return;
  }
  wave = { callId, messages: [message] };
  _retargeting.set(sessionId, wave);
  _queryRunning(RETARGET_QUERY_TIMEOUT_MS)
    .then((res) => _settleRetarget(sessionId, (res && res.activeCallIds && res.activeCallIds[sessionId]) || null))
    // 查询失败（SW 未就绪 / 回执超时）按「后台已不认这个 callId」处理：
    // 终态消息自带 callId，用它收尾比让界面永久停在生成中安全
    .catch(() => _settleRetarget(sessionId, null))
    .finally(() => { _retargeting.delete(sessionId); });
}

/**
 * 让位核对的结论处理：按后台登记决定「重建镜像」还是「用自带终态收尾」，并回放窗口内的消息。
 * @param {string} sessionId
 * @param {string|null} active 后台当前登记给该会话的 callId（null = 已无登记）
 */
function _settleRetarget(sessionId, active) {
  const wave = _retargeting.get(sessionId);
  if (!wave) return;
  const { callId, messages } = wave;

  if (active === callId) {
    _disposeMirror(sessionId);
    _attach(sessionId, callId);
  } else if (active === null) {
    // 后台已没有任何登记：只有终态消息能证明这一轮结束了，用它收尾
    const terminal = messages.find((m) => TERMINAL_MESSAGE_TYPES.has(m.type));
    if (!terminal) return;
    _absorbTerminal(sessionId, terminal);
    return;
  } else {
    // 后台仍登记着别的 callId → 迟到/幽灵消息，忽略（信它会把镜像带去另一个死流）
    return;
  }

  // 回放本波消息：新镜像刚建好，窗口内的正文/工具/状态行都还没消费过
  const mirror = _mirrors.get(sessionId);
  if (!mirror || mirror.callId !== callId) return;
  for (const m of messages) {
    if (mirror.finished) break;
    mirror.handleMessage(m);
  }
}

function _bindListener() {
  if (_listenerBound) return;
  _listenerBound = true;
  chrome.runtime.onMessage.addListener((message) => {
    if (!message) return false;
    const mirror = message.sessionId ? _mirrors.get(message.sessionId) : null;
    if (!mirror) {
      // 面板先开、任务后到：启动时后台什么都没跑（SW 刚被杀、闹钟还没醒），
      // 10~30s 后才有续跑。这条流式广播是唯一能叫醒我们的信号——
      // 只对齐一次是不够的，必须边跑边补对齐。
      if (message.callId && STREAMING_MESSAGE_TYPES.has(message.type)) _scheduleSync();
      return false;
    }
    // 后台把这一轮换成了新 callId（典型：SW 被杀，闹钟续跑拿到 auto_ 新 callId）。
    // 旧镜像盯着的流已经死了，必须让位——否则气泡永远停在「生成中」，
    // 而新流的消息全被旧镜像的 callId 过滤丢掉，等于又回到「会话区无输出」。
    if (message.callId && message.callId !== mirror.callId) {
      _maybeRetarget(message.sessionId, message.callId, message);
      return false;
    }
    // handleMessage 的返回值只表示「是否被本镜像消费」，不能当作 listener 的应答标志：
    // 返回 true 会让后台的 sendMessage 一直等一个永远不会到来的异步 sendResponse。
    // 后台还能递消息过来 = SW 已经活着，顺手把观察端口补上（幂等，端口在就是空操作）：
    // 面板一直开着、既不切会话也不重开时，这是唯一的自愈时机。
    openPanelObserverPort(message.sessionId);
    mirror.handleMessage(message);
    return false;
  });

  // 启动期的挂载时机：chat-manager 补水完成后发 session-hydrated（不发 session-switched，
  // 那条会重建聊天区）。新面板启动时 activeSessionId 尚未就绪，接管时气泡只能是游离的，
  // 必须在这里挂回去——否则就是「库里有结果、会话区没有实时输出」。
  // 同理，hydration 只代表「会话数据就绪」，不代表后台没有新任务：
  // 启动时后台还没开始跑的情况，这里也要再对齐一次。
  _hydratedHandler = (e) => {
    const sessionId = e?.detail?.sessionId;
    if (sessionId && _mirrors.has(sessionId)) mountStreamingElement(sessionId);
    _scheduleSync();
  };
  document.addEventListener('session-hydrated', _hydratedHandler);

  // 会话历史渲染完成后把接管气泡移回末尾。
  // 启动期接管往往早于历史渲染：气泡先 appendChild 进当时还空的容器，历史消息
  // 随后才 append —— 结果气泡停在用户提问上面（真机与探针均复现）。reconnect 内部
  // 就是 appendChild，等于重新排到末尾。正文不需要在这里补：接管镜像每条增量都在
  // 原地更新气泡，挂载只挪位置，不能把可见指示器收成「思考结果」（那会吃掉「输出中」
  // 和停止按钮）。
  _historyRenderedHandler = (e) => {
    const sessionId = e?.detail?.sessionId;
    if (sessionId && _mirrors.has(sessionId)) mountStreamingElement(sessionId);
  };
  document.addEventListener('chat-history-rendered', _historyRenderedHandler);
}

/**
 * 初始化 reattach（幂等）。生产接线只需在面板初始化时调用一次。
 * @returns {{syncFromBackground: ()=>Promise<void>}}
 */
export function initChatReattach() {
  if (_inited) return { syncFromBackground: () => _manager.syncFromBackground() };
  _inited = true;
  _bindListener();

  _manager = createReattachManager({
    queryRunning: _queryRunning,
    // 本实例「当前真的持有」该会话的 callApi 监听。
    // 不能用 pendingCallApiSessionIds：它会被 index.js 的 restorePendingSessionsFromStorage
    // 从 storage.session 灌回来（上个实例遗留），面板刚重开就会误判为本实例持有 →
    // 永不接管，修复失效。pendingCancelApiMap 只在 callApi 存活期存在且不落盘。
    hasLocalListener: (sessionId) => state.pendingCancelApiMap.has(sessionId),
    isAttached: (sessionId, callId) => {
      if (_mirrors.get(sessionId)?.callId !== callId) return false;
      // 已经接管着就不必重建镜像，但观察端口得顺手补一下：SW 被回收会把端口从两头
      // 拆掉，而面板侧只会自摘、不会自己重连。不补的话下一次关面板就没有断开事件
      // 可报，「第二次关闭不弹桌面提醒」在那个路径上又回来了。幂等：端口还在就是空操作。
      openPanelObserverPort(sessionId);
      return true;
    },
    attach: (sessionId, callId) => { _attach(sessionId, callId); },
  });

  // 启动即对齐一次；失败静默（SW 可能尚未就绪）
  _manager.syncFromBackground();
  return { syncFromBackground: () => _manager.syncFromBackground() };
}

/**
 * 切回会话时再对齐一次：面板启动时可能还没在跑，或活跃 callId 已被自动续跑换新。
 * @param {string} [_sessionId] 目标会话（当前实现为全量对齐，参数保留语义）
 */
export function syncReattachForSession(sessionId) {
  if (!_inited || !_manager) return;
  // 切回该会话：上次接管时它不可见（气泡是游离的），现在必须把它挂回末尾。
  // 内容不用回填 —— 游离期间镜像一直在原地更新这份气泡。
  // 不能指望 index.js 的 hasPendingTask 分支：它要求本实例持有 pendingCancelApi，
  // 而 reattach 没有活着的 callApi 闭包，那条分支不会走。
  if (sessionId && state.activeSessionId === sessionId) mountStreamingElement(sessionId);
  _manager.syncFromBackground();
}

/** 仅测试使用：重置模块状态 */
export function __resetChatReattachForTest() {
  _inited = false;
  _manager = null;
  _mirrors.clear();
  _listenerBound = false;
  // 挂起的节流定时器会跨用例继续用旧 manager 查询，必须一并取消
  if (_syncTimer) {
    clearTimeout(_syncTimer);
    _syncTimer = null;
  }
  _retargeting.clear();
  _absorbedTerminals.clear();
  if (_hydratedHandler) {
    document.removeEventListener('session-hydrated', _hydratedHandler);
    _hydratedHandler = null;
  }
  if (_historyRenderedHandler) {
    document.removeEventListener('chat-history-rendered', _historyRenderedHandler);
    _historyRenderedHandler = null;
  }
}
