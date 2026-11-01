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
  updateStreamingStatus,
  appendToolCallItems,
  finalizeStreamingMessage,
  createStreamingElementAccessor,
  setStreamedContent,
  deleteStreamingState,
  setThinkingStartTime,
  setProcessStartTime,
  reconnectStreamingElement,
} from './chat-streaming.js';
// 注意：会话落库（session-manager → 存储层）依赖较重的浏览器侧模块链，改为使用时
// 动态导入：既避免面板初始化时的无意义加载，也让本模块的纯逻辑可独立单测。

/**
 * 单会话流式镜像（纯状态机，渲染/落库通过注入完成，便于单测）
 * @param {Object} opts
 * @param {string} opts.sessionId
 * @param {string} opts.callId 本轮活跃 callId（后台注册表下发的同一个值）
 * @param {{start:Function,chunk:Function,toolCalls:Function,status:Function,final:Function,error:Function}} opts.renderer
 * @param {(payload:Object)=>Promise<any>} opts.persist 终态落库
 * @param {()=>void} [opts.onFinished] 终态收尾（清理挂账、移除监听）
 * @param {string} [opts.emptyFallback] 空内容兜底文案
 */
export function createSessionStreamMirror({
  sessionId,
  callId,
  renderer,
  persist,
  onFinished = () => {},
  emptyFallback = '',
}) {
  let buffered = '';
  let finished = false;

  const matches = (message) =>
    !!message && message.sessionId === sessionId && message.callId === callId;

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
     * @param {Object} message 后台广播消息
     * @returns {boolean} 是否被本镜像消费
     */
    handleMessage(message) {
      if (finished || !matches(message)) return false;

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
        case 'EXECUTION_STATUS_UPDATE':
          if (message.nodeName) renderer.status?.(message.nodeName);
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
    },
  };
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
  return {
    start() {
      setStreamedContent(sessionId, '');
    },
    chunk(full) {
      setStreamedContent(sessionId, full);
      updateStreamingMessage(el, full);
    },
    toolCalls(tcs) {
      appendToolCallItems(el, tcs);
    },
    status(text) {
      updateStreamingStatus(el, text);
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

function _attach(sessionId, callId) {
  const accessor = createStreamingElementAccessor(sessionId);
  // 已有流式元素（原发起实例 / 本实例此前已接管）：绝不抢它的流
  if (accessor()) return false;

  const el = addStreamingMessage(sessionId);
  accessor(el);
  setStreamedContent(sessionId, '');
  setThinkingStartTime(Date.now());
  setProcessStartTime(Date.now());

  // 复用既有「生成中」记账：切回会话走 reconnectStreamingElement 即可看到实时内容。
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
    renderer: _buildRenderer(sessionId, el),
    persist: (payload) => _persistFinal(payload, sessionId, el),
    emptyFallback: t('chatMsg.emptyModelReply'),
    onFinished: () => {
      // 落库是异步的：这段时间里后台可能已换轮、同一会话建出了新镜像。
      // 此时旧收尾若继续执行，会把新镜像的映射/流式元素登记一起清掉，
      // 新镜像就成孤儿（广播查不到它）→ 气泡永久停在生成中。
      if (_mirrors.get(sessionId) !== mirror) return;
      _mirrors.delete(sessionId);
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
  // 目标会话当前可见才挂载：addStreamingMessage 对非活动会话返回游离元素（已登记在
  // _streamingElements 里），不挂进当前会话的 DOM，避免把别人的气泡塞进正在看的会话。
  // 等用户切回来时由 syncReattachForSession 补挂。
  if (state.activeSessionId === sessionId) reconnectStreamingElement(sessionId);
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
    if (sessionId && _mirrors.has(sessionId)) reconnectStreamingElement(sessionId);
    _scheduleSync();
  };
  document.addEventListener('session-hydrated', _hydratedHandler);

  // 会话历史渲染完成后把接管气泡移回末尾。
  // 启动期接管往往早于历史渲染：气泡先 appendChild 进当时还空的容器，历史消息
  // 随后才 append —— 结果气泡停在用户提问上面（真机与探针均复现）。reconnect 内部
  // 就是 appendChild，等于重新排到末尾，并顺带补回脱落期间累积的正文。
  _historyRenderedHandler = (e) => {
    const sessionId = e?.detail?.sessionId;
    if (sessionId && _mirrors.has(sessionId)) reconnectStreamingElement(sessionId);
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
    isAttached: (sessionId, callId) => _mirrors.get(sessionId)?.callId === callId,
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
  // 切回该会话：上次接管时它不可见（气泡是游离的），现在必须挂回来并回填已累积内容。
  // 不能指望 index.js 的 hasPendingTask 分支：它要求本实例持有 pendingCancelApi，
  // 而 reattach 没有活着的 callApi 闭包，那条分支不会走。
  if (sessionId && state.activeSessionId === sessionId) reconnectStreamingElement(sessionId);
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
