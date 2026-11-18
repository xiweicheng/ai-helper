// background/panel-bus.js - 面板定向流式通道（镜像 + 广播收敛）
//
// 背景：STREAM_CHUNK 走 chrome.runtime.sendMessage 会被投递到「所有标签页的所有 frame」。
// content script 与页面共享主线程，长任务里每秒几十条广播会把无关页面拖到掉帧。
//
// 策略分两级：
// 1) 镜像：每条 chunk 额外定向投递到该会话的**全部**面板端口（keepalive / observer，
//    detach 窗口与侧边栏可能同时在线，所以是端口集合而非单值）；
// 2) 收敛：接收端每消费一条就回一条 ACK。当「上一条」在所有端口上都确认过，这条就不
//    再广播；任何一个端口没确认，立刻恢复广播。当前条发出时不可能收到自己的 ACK，
//    所以判定基准永远是 seq-1。
//
// 安全边界：ACK 缺失、端口不存在、端口刚断开、前端是旧版本（不回 ACK），全部只会让
// 我们继续广播——也就是退回改造前的行为，不会丢字。
import { getStreamPorts } from './state.js';
import logger from '../shared/logger.js';

/**
 * 同一 callId 内 chunk 序号单调递增：接收端靠它去重，这里靠它判断上一条是否被确认。
 * 不设淘汰——一个 callId 只占一个整数，淘汰到活跃 callId 会让去重和 ACK 判定同时失效。
 */
const chunkSeqByCall = new Map();

/**
 * 取下一个 chunk 序号
 * @param {string} callId
 * @returns {number}
 */
export function nextChunkSeq(callId) {
  if (!callId) return 0;
  const next = (chunkSeqByCall.get(callId) || 0) + 1;
  chunkSeqByCall.set(callId, next);
  return next;
}

/** port → Map<callId, 已确认的最大 seq>。必须按 callId 分开记：同一端口会收到父会话、
 *  子会话、并行任务的 chunk，共用一个计数器会让小序号的任务被大序号「顺带确认」，
 *  从而在没真正送达时提前跳过广播。 */
const ackSeqByPort = new WeakMap();
/** 已挂过 ACK 监听的端口（弱引用，端口回收后自动释放） */
const ackBoundPorts = new WeakSet();

function bindAckListener(port) {
  if (ackBoundPorts.has(port)) return;
  ackBoundPorts.add(port);
  try {
    port.onMessage.addListener((msg) => {
      if (!msg || msg.type !== 'STREAM_CHUNK_ACK' || !msg.callId) return;
      const seq = Number(msg.seq) || 0;
      let byCall = ackSeqByPort.get(port);
      if (!byCall) {
        byCall = new Map();
        ackSeqByPort.set(port, byCall);
      }
      if (seq > (byCall.get(msg.callId) || 0)) byCall.set(msg.callId, seq);
    });
  } catch (err) {
    // 端口已经断开：不挂监听即可，调用方会继续广播兜底
    logger.debug('[PanelBus] bind ack listener failed:', err?.message || err);
  }
}

/** 旁路命中统计：真机可通过日志确认端口通道是否真的接上了 */
const stats = { sent: 0, delivered: 0, missed: 0, skipped: 0 };

/**
 * 把一条流式 chunk 镜像到面板端口，并给出「是否还需要广播」的结论
 * @param {Object} message 完整的 STREAM_CHUNK 消息（必须带 sessionId 与 seq）
 * @returns {{ delivered: number, skipBroadcast: boolean }}
 */
export function mirrorStreamChunk(message) {
  if (!message || !message.sessionId || !message.seq) {
    return { delivered: 0, skipBroadcast: false };
  }

  const ports = getStreamPorts(message.sessionId);
  const targets = [];
  for (const port of ports) {
    bindAckListener(port);
    try {
      port.postMessage(message);
      targets.push(port);
    } catch {
      // 端口刚好断开（面板关闭竞态）：跳过，广播兜底
    }
  }

  const prev = message.seq - 1;
  const skipBroadcast = targets.length > 0
    && prev > 0
    && targets.every(port => {
      const byCall = ackSeqByPort.get(port);
      return (byCall?.get(message.callId) || 0) >= prev;
    });

  stats.sent++;
  if (targets.length > 0) stats.delivered++;
  else stats.missed++;
  if (skipBroadcast) stats.skipped++;
  if (stats.sent % 200 === 0) {
    logger.debug(`[PanelBus] stream chunk mirror: sent=${stats.sent}, delivered=${stats.delivered}, missed=${stats.missed}, skippedBroadcast=${stats.skipped}`);
  }

  return { delivered: targets.length, skipBroadcast };
}

/** 仅测试使用 */
export function __getPanelBusStatsForTest() {
  return { ...stats };
}

export function __resetPanelBusForTest() {
  chunkSeqByCall.clear();
  stats.sent = 0;
  stats.delivered = 0;
  stats.missed = 0;
  stats.skipped = 0;
}
