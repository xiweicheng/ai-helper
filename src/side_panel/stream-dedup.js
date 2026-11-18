// side_panel/stream-dedup.js - 流式增量去重（端口副本 + 广播副本）
//
// background 对同一条 STREAM_CHUNK 会发两份：一次面板端口定向投递、一次 runtime 广播
// （广播是兜底，保证任何端口遗漏都不会丢字）。两份到达顺序不保证，这里按
// (消费方, callId, seq) 只接受一次——seq 由 background 侧按 callId 单调生成。
//
// 为什么去重范围必须按「消费方」隔离：同一份广播会被多个 listener 各自消费
// （发起实例的 callApi 闭包、接管实例的 mirror 镜像）。若共用一张表，先消费的一方
// 会把后一方的消息吃掉，等于凭空改变了既有渲染行为。scope 由调用方拼成
// 「通道类型 + 会话 + callId」，既能把同一消费方的两份副本收敛成一次，
// 又不会跨实例互相影响。
//
// 没有 seq 的消息（旧版本后台 / 其他通道）一律放行，兼容性优先。
const lastSeqByScope = new Map();

/**
 * 判断这条 chunk 是否应该被消费
 * @param {string} scope 消费方标识（同一消费方内共享去重表）
 * @param {number} seq
 * @returns {boolean} false = 重复副本，丢弃
 */
export function acceptStreamChunk(scope, seq) {
  if (!scope || !seq) return true;
  const last = lastSeqByScope.get(scope) || 0;
  if (seq <= last) return false;
  lastSeqByScope.set(scope, seq);
  return true;
}

/** 仅测试使用 */
export function __resetStreamDedupForTest() {
  lastSeqByScope.clear();
}
