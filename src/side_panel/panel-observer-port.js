// side_panel/panel-observer-port.js - 接管实例的「面板观察端口」
//
// 现场：面板关掉 → 后台任务还在跑 → SW 靠 keepalive-<sessionId> 端口断开这件事
// 知情并弹桌面提醒。但那个端口只在 callApi 内部建立；重开面板走 reattach 接管时
// 本实例并没有 callApi 闭包，也就没有端口。于是第二次关闭面板时 SW 完全收不到
// 「面板脱离」，提醒一声不响 —— 用户看到的就是「第一次有关闭提醒，第二次没有」。
//
// 修法：接管成功即为该会话挂一条 panel-observer-<sessionId> 端口，只承担一件事：
// 让 SW 知道「看着这个任务的面板已经不在了」。它刻意不进 keepalivePorts，因为
// keepalive 端口还是澄清弹框 / 工具确认这类「只发给发起实例」的定向消息通道，
// 以及实例身份（窗口/宿主 tab）上报通道 —— 接管实例不是发起实例，抢过来会把
// 这些消息投给答不了的那一侧。
//
// 端口是尽力而为的旁路：建不起来（SW 正在重启、扩展上下文已失效）只记日志，
// 绝不影响接管本身。
import logger from '../shared/logger.js';

const PORT_PREFIX = 'panel-observer-';

// 与 background 的 _sendControl 共用同一 seq 通道的流式消息类型。
// 控制消息必须和 chunk 一起转发，否则端口通道上的先后顺序会被广播副本打断。
const STREAMING_TYPES = new Set([
  'STREAM_START',
  'STREAM_CHUNK',
  'STREAM_TOOL_CALL',
  'STREAM_DONE',
]);

/** sessionId -> Port：端口对象必须被引用住，否则会被 GC 掉，SW 侧立刻当成断开 */
const _ports = new Map();

/**
 * 观察端口上的消息消费者：background 的流式增量旁路镜像会从这条端口投递过来。
 * 用 Set 而非单个回调，避免以后接入方互相覆盖；目前只有接管实例注册。
 */
const _messageHandlers = new Set();

/**
 * 注册观察端口消息处理器（幂等：同一函数重复注册只保留一份）。
 * 端口创建早于/晚于注册都能收到消息——端口上的转发函数每次都会遍历当前集合。
 * @param {(message: Object) => void} handler
 */
export function onPanelObserverMessage(handler) {
  if (typeof handler === 'function') _messageHandlers.add(handler);
}

/**
 * 为某会话建立观察端口（幂等：已有则直接复用，不重复连）。
 * @param {string} sessionId
 * @returns {chrome.runtime.Port|null} 端口，失败返回 null
 */
export function openPanelObserverPort(sessionId) {
  if (!sessionId) return null;
  const existing = _ports.get(sessionId);
  if (existing) return existing;

  let port;
  try {
    port = chrome.runtime.connect({ name: `${PORT_PREFIX}${sessionId}` });
  } catch (err) {
    logger.debug('[PanelObserver] 建立观察端口失败（忽略）:', err?.message || err);
    return null;
  }

  _ports.set(sessionId, port);
  // 流式增量镜像：background 会同时发端口和广播，接收端按 (callId, seq) 去重。
  // 处理器异常绝不能打断端口本身，否则会连带丢失「面板断开」这条唯一职责。
  try {
    port.onMessage.addListener((message) => {
      // 只转发流式消息：这条端口的主职责仍是「面板断开通知」。控制消息与 chunk 共用
      // 同一序号通道，必须一起转发，否则端口上的先后顺序会被打断。
      // 没有消费者时不能 ACK：ACK 的语义是「这条已经被本实例处理」，
      // 空集合说明接管实例还没挂好处理器，误确认会让 background 提前跳过广播。
      if (!message || !STREAMING_TYPES.has(message.type) || _messageHandlers.size === 0) return;
      let consumed = true;
      for (const handler of _messageHandlers) {
        try {
          handler(message);
        } catch (err) {
          consumed = false;
          logger.debug('[PanelObserver] 消息处理异常（忽略）:', err?.message || err);
        }
      }
      // 只有确实被消费才确认：处理失败时必须让 background 继续广播，
      // 否则后续 chunk 会只走这条已经坏掉的通道。
      if (consumed && message.seq) {
        try {
          port.postMessage({ type: 'STREAM_CHUNK_ACK', sessionId: message.sessionId, callId: message.callId, seq: message.seq });
        } catch (err) {
          logger.debug('[PanelObserver] ACK 回发失败（忽略）:', err?.message || err);
        }
      }
    });
  } catch (err) {
    logger.debug('[PanelObserver] 消息监听挂不上（忽略）:', err?.message || err);
  }
  // Chrome 自己拆掉端口（扩展上下文失效等）时把本地引用一起摘掉，否则下次接管
  // 会复用一个已经死掉的端口，SW 那边再也等不到断开。
  try {
    port.onDisconnect.addListener(() => {
      if (_ports.get(sessionId) === port) _ports.delete(sessionId);
    });
  } catch (err) {
    logger.debug('[PanelObserver] 观察端口断开监听挂不上（忽略）:', err?.message || err);
  }
  return port;
}

/**
 * 关闭某会话的观察端口（收终态、或镜像被拆掉时）。
 * @param {string} sessionId
 */
export function closePanelObserverPort(sessionId) {
  if (!sessionId) return;
  const port = _ports.get(sessionId);
  if (!port) return;
  _ports.delete(sessionId);
  try {
    port.disconnect();
  } catch (err) {
    // 端口早被 Chrome 拆掉时 disconnect 会抛，属于正常竞态
    logger.debug('[PanelObserver] 关闭观察端口异常（忽略）:', err?.message || err);
  }
}

/** 某会话当前是否已挂着观察端口 */
export function isPanelObserverOpen(sessionId) {
  return Boolean(sessionId && _ports.get(sessionId));
}

/** 仅测试使用：重置模块内部状态（不主动断开，避免干扰真实端口） */
export function __resetPanelObserverPortsForTest() {
  _ports.clear();
}
