// background/subagent-depth.js - 统一的子代理/子任务嵌套深度计数器
//
// 为什么需要共享：项目内有两条会产生嵌套 ReAct 的通道——
//   - plan_task 子任务（react-loop.js executeSingleSubtask）
//   - dispatch_task 子代理（agent-dispatcher.js executeDispatchSubAgent）
// 过去仅 dispatch 侧记录深度，plan 子任务的 sessionId 从不登记；于是
// "在 plan 子任务里再 dispatch_task" 会从深度 0 重新起算，最坏叠加出
// 3~4 层嵌套，突破预算/超时钳制。本模块把深度状态收敛到单一 Map，两条
// 通道登记/查询同一份数据，形成统一的全局深度闸。
//
// 沿用既有工程约定（见记忆）：派生 id 字符串不作为状态载体，跨递归层级
// 的状态用显式数据结构传递；SW 重启后 Map 清空无碍（子任务/子代理不落
// checkpoint，恢复语义仅作用于主任务侧）。

/**
 * 嵌套深度上限：主任务 = 0，每下钻一层子代理/子任务 +1。
 * 达到该深度的会话不再允许 dispatch_task 继续下钻（防止递归爆炸）。
 * 与原 dispatch 侧 MAX_DISPATCH_DEPTH 语义保持一致。
 */
export const MAX_SUBAGENT_DEPTH = 2;

/** sessionId -> 当前嵌套深度（仅在执行期间登记，结束须在 finally 清理） */
const depthMap = new Map();

/**
 * 读取某 sessionId 所处的嵌套深度；未登记（主任务）返回 0。
 * @param {string|null|undefined} sessionId
 * @returns {number}
 */
export function getSubagentDepth(sessionId) {
  if (!sessionId) return 0;
  return depthMap.get(sessionId) ?? 0;
}

/**
 * 登记/更新某 sessionId 的嵌套深度。空 sessionId 为空操作。
 * @param {string|null|undefined} sessionId
 * @param {number} depth
 */
export function setSubagentDepth(sessionId, depth) {
  if (!sessionId) return;
  depthMap.set(sessionId, depth);
}

/**
 * 清理某 sessionId 的深度记录，防止 Map 无限增长。空 sessionId 为空操作。
 * @param {string|null|undefined} sessionId
 */
export function clearSubagentDepth(sessionId) {
  if (!sessionId) return;
  depthMap.delete(sessionId);
}
