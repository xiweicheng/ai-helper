// 深度统一 + 上下文自愈阶梯多次 回归测试
// 对应两处优化：
//   1) plan_task 子任务与 dispatch_task 子代理共享同一嵌套深度计数器，
//      杜绝"plan 子任务内再 dispatch 从 0 起算"导致的最坏 3~4 层失控；
//   2) 400 上下文超限自愈从"仅一次性"改为"阶梯多次、逐档更激进"，
//      防止长任务第二次超限直接抛错猝死。
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);
const DISPATCHER_SRC = readFileSync(
  new URL('../../src/background/agent-dispatcher.js', import.meta.url),
  'utf8'
);

let getSubagentDepth, setSubagentDepth, clearSubagentDepth, MAX_SUBAGENT_DEPTH;

beforeAll(async () => {
  const m = await import('../../src/background/subagent-depth.js');
  getSubagentDepth = m.getSubagentDepth;
  setSubagentDepth = m.setSubagentDepth;
  clearSubagentDepth = m.clearSubagentDepth;
  MAX_SUBAGENT_DEPTH = m.MAX_SUBAGENT_DEPTH;
});

describe('subagent-depth 共享深度计数器行为', () => {
  test('未登记的 sessionId 深度为 0（主任务默认）', () => {
    expect(getSubagentDepth('main-session-unique')).toBe(0);
  });

  test('空/未定义 sessionId 安全返回 0，登记/清理为空操作', () => {
    expect(getSubagentDepth(null)).toBe(0);
    expect(getSubagentDepth(undefined)).toBe(0);
    expect(getSubagentDepth('')).toBe(0);
    // 不抛错即可
    setSubagentDepth(null, 5);
    clearSubagentDepth(undefined);
  });

  test('set 后 get 命中，clear 后回落 0', () => {
    const sid = 'sub_depth_case_1';
    setSubagentDepth(sid, 2);
    expect(getSubagentDepth(sid)).toBe(2);
    clearSubagentDepth(sid);
    expect(getSubagentDepth(sid)).toBe(0);
  });

  test('深度上限常量为 2（与原 MAX_DISPATCH_DEPTH 语义一致）', () => {
    expect(MAX_SUBAGENT_DEPTH).toBe(2);
  });
});

describe('上下文自愈：阶梯多次（计数器 + 递减裁剪比例）', () => {
  test('一次性布尔标记已移除，改为次数计数器', () => {
    expect(REACT_LOOP_SRC).not.toMatch(/let contextOverflowHealed = false/);
    expect(REACT_LOOP_SRC).toMatch(/let contextHealAttempts = 0/);
    expect(REACT_LOOP_SRC).toMatch(/contextHealAttempts < CONTEXT_HEAL_MAX_ATTEMPTS/);
    expect(REACT_LOOP_SRC).toMatch(/contextHealAttempts\+\+/);
  });

  test('裁剪比例逐档递减（比原单次 60% 更激进的兜底档位）', () => {
    expect(REACT_LOOP_SRC).toMatch(/const CONTEXT_HEAL_MAX_ATTEMPTS = \d+;/);
    expect(REACT_LOOP_SRC).toMatch(/CONTEXT_HEAL_RATIOS\s*=\s*\[0\.6,\s*0\.45,\s*0\.3\]/);
    // 按当前次数选取比例，末档兜底不越界
    expect(REACT_LOOP_SRC).toMatch(/CONTEXT_HEAL_RATIOS\[Math\.min\(contextHealAttempts,\s*CONTEXT_HEAL_RATIOS\.length - 1\)\]/);
  });

  test('保留 trimMessagesByBudget 与 selfHeal 标记（供前端日志识别）', () => {
    expect(REACT_LOOP_SRC).toMatch(/trimMessagesByBudget/);
    expect(REACT_LOOP_SRC).toMatch(/context_overflow_trim/);
  });
});

describe('深度统一接线：dispatch 与 plan 子任务共用共享计数器', () => {
  test('agent-dispatcher 不再维护本地 Map/本地常量，改用共享模块', () => {
    expect(DISPATCHER_SRC).not.toMatch(/const sessionDepthMap = new Map\(\)/);
    expect(DISPATCHER_SRC).not.toMatch(/const MAX_DISPATCH_DEPTH = 2/);
    expect(DISPATCHER_SRC).toMatch(/from '\.\/subagent-depth\.js'/);
    expect(DISPATCHER_SRC).toMatch(/getSubagentDepth\(sessionId\)/);
    expect(DISPATCHER_SRC).toMatch(/currentDepth >= MAX_SUBAGENT_DEPTH/);
    expect(DISPATCHER_SRC).toMatch(/setSubagentDepth\(subSessionId, currentDepth \+ 1\)/);
    expect(DISPATCHER_SRC).toMatch(/clearSubagentDepth\(subSessionId\)/);
  });

  test('react-loop 为 plan 子任务登记深度（父深度+1）并在收尾清理', () => {
    expect(REACT_LOOP_SRC).toMatch(/from '\.\/subagent-depth\.js'/);
    expect(REACT_LOOP_SRC).toMatch(/setSubagentDepth\(subtaskSessionId, getSubagentDepth\(sessionId\) \+ 1\)/);
    expect(REACT_LOOP_SRC).toMatch(/clearSubagentDepth\(subtaskSessionId\)/);
    // 登记必须在子任务 reactLoop 调用之前，清理在 finally 中保证不泄漏
    const setIdx = REACT_LOOP_SRC.indexOf('setSubagentDepth(subtaskSessionId');
    const callIdx = REACT_LOOP_SRC.indexOf('const subtaskResult = await reactLoop(');
    expect(setIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(setIdx);
    expect(REACT_LOOP_SRC).toMatch(/finally\s*\{[^}]*clearSubagentDepth\(subtaskSessionId\)/s);
  });
});
