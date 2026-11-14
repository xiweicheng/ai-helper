// active-call-registry.js - 会话级「活跃 callId」注册表（SW 内存，冷启动即空）
//
// 解决的问题：面板实例重启后（SW 被回收连带页面卸载 / 用户关掉面板再点通知打开），
// 新实例既不知道自己该听哪个 callId，而自动续跑原来又沿用 checkpoint 里旧实例的
// callId —— 两边对不上，STREAM_* / EXECUTION_STATUS_UPDATE 被前端 myCallId 过滤
// 全部丢弃，形成「后台在跑、会话区无输出」。
//
// 本模块是面板 reattach 的唯一可靠数据源：随 QUERY_SESSION_RUNNING 下发
// { sessionId: callId }，面板据此用正确 callId 重新挂监听。
//
// 纪律：
// - 只由 react-loop 顶层任务（无 taskContext）登记/清理，子任务与父任务共用
//   sessionId+callId，子任务退出不能把父任务的登记清掉；
// - clear 带 callId 期望值（同 unregisterKeepalivePort 的模式）：同会话连续调用时，
//   旧循环迟到的 finally 不会误删新循环的登记；
// - 纯叶子模块（零依赖），便于单测与循环依赖规避。
const activeCallIds = new Map(); // sessionId → callId

/**
 * 登记会话当前正在跑的 callId
 * @param {string|null} sessionId
 * @param {string|null} callId
 * @param {{reattachable?: boolean}} [options] reattachable=false 表示这次运行的产物
 *   没有任何面板消费者（跑完不广播 API_COMPLETE / API_ERROR）。登记了它，面板 reattach
 *   会建镜像并永久停在「生成中」——气泡挂着、pending 不清、归档/继续执行全被挡。
 *   定时任务必须显式传 reattachable=true，并在结束时广播终态，才能复用普通会话的镜像。
 */
export function setActiveCall(sessionId, callId, options = {}) {
  if (!sessionId || !callId) return;
  if (options && options.reattachable === false) return;
  activeCallIds.set(sessionId, callId);
}

/**
 * 清除登记；传 expectedCallId 时仅当当前登记值匹配才删（防迟到 finally 误删）
 * @param {string|null} sessionId
 * @param {string|null} [expectedCallId]
 */
export function clearActiveCall(sessionId, expectedCallId = null) {
  if (!sessionId) return;
  if (expectedCallId && activeCallIds.get(sessionId) !== expectedCallId) return;
  activeCallIds.delete(sessionId);
}

/**
 * 读取会话当前活跃 callId
 * @param {string|null} sessionId
 * @returns {string|null}
 */
export function getActiveCallId(sessionId) {
  if (!sessionId) return null;
  return activeCallIds.get(sessionId) || null;
}

/**
 * 全量快照（供 QUERY_SESSION_RUNNING 下发；独立对象，调用方改动不回流）
 * @returns {Object<string,string>}
 */
export function getActiveCallMap() {
  return Object.fromEntries(activeCallIds);
}

/** 仅测试使用：重置注册表 */
export function __resetActiveCallsForTest() {
  activeCallIds.clear();
}
