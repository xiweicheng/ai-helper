// src/background/checkpoint-state.js - checkpoint → 续跑入参的唯一构造函数
//
// 为什么要单独一层：checkpoint 的写侧（react-loop 的 writeCheckpointSnapshot）与读侧
// （resumeReactLoopFromCheckpoint 组装的 resumeState）分处两个函数，字段漂移没有任何类型
// 检查兜底，而两侧的守卫测试各自只看自己那一半的字符串。
// 曾经真实发生过：goalState 写进了 checkpoint 却没被读回来 —— 于是「用户已暂停的目标」
// 在恢复时回退到发送那一刻的快照，重新被授予无人值守放行。两侧共用本函数后，这类漂移
// 会直接挂在字段级单测上。
export const RESUME_STATE_KEYS = Object.freeze([
  'taskState',
  'subtaskPlan',
  'subtaskProgress',
  'notesState',
  'goalState',
]);

/**
 * checkpoint → reactLoop 的 resumeState 入参。
 * 全部字段做防御性归一：checkpoint 可能是旧版本写的、也可能被存储层截断。
 * @param {object|null} checkpoint
 * @returns {{taskState:object|null, subtaskPlan:object|null, subtaskProgress:object|null, notesState:Array, goalState:object|null}}
 */
export function buildResumeState(checkpoint) {
  const c = checkpoint || {};
  return {
    // 计划锚点：恢复后据此防重放
    taskState: c.taskState || null,
    subtaskPlan: c.subtaskPlan || null,
    // 子任务完成进度
    subtaskProgress: c.subtaskProgress || null,
    // scratchpad 便签：恢复后仍然存活
    notesState: Array.isArray(c.notesState) ? c.notesState : [],
    // 目标现场（轮次 / 预算 / 暂停态 / 放行授权都挂在它上面）
    goalState: c.goalState || null,
  };
}
