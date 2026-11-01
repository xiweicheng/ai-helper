// ① 自动续跑 callId 对齐（「面板重启后看不到运行中输出」的根因修复之一）
//
// 背景：自动续跑入口原来只传 sessionId，resumeReactLoopFromCheckpoint 回落到
// checkpoint.callId —— 那是已经死掉的面板实例的 callId。面板新实例没有对应
// listener，且 chat-manager 的消息监听按 myCallId 过滤，于是 STREAM_* /
// EXECUTION_STATUS_UPDATE 全被丢弃，形成「后台在跑、会话区无输出」。
//
// 修法（与手动 RESUME_REACT 路径同构）：
// 1. 自动续跑生成 auto_ 前缀的新 callId 并透传给 resumeReactLoopFromCheckpoint；
// 2. SW 内存登记 sessionId → 活跃 callId，随 QUERY_SESSION_RUNNING 下发，
//    供面板 reattach 用正确的 callId 重新接入实时流。
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const INDEX_SRC = readFileSync(
  new URL('../../src/background/index.js', import.meta.url), 'utf8'
);
const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url), 'utf8'
);
const SCHEDULER_SRC = readFileSync(
  new URL('../../src/background/scheduler.js', import.meta.url), 'utf8'
);

// ==================== 注册表（纯内存，不依赖 chrome） ====================

describe('active-call-registry 会话级活跃 callId 注册表', () => {
  let reg;

  beforeEach(async () => {
    vi.resetModules();
    reg = await import('../../src/background/active-call-registry.js');
    reg.__resetActiveCallsForTest();
  });

  test('set 后可读回；clear 后读回 null', () => {
    reg.setActiveCall('s1', 'call_a');
    expect(reg.getActiveCallId('s1')).toBe('call_a');
    reg.clearActiveCall('s1', 'call_a');
    expect(reg.getActiveCallId('s1')).toBeNull();
  });

  test('clear 带 callId 时只删匹配项：旧循环迟到的 finally 不误删新循环的登记', () => {
    reg.setActiveCall('s1', 'call_old');
    // 同会话连续调用：新循环先登记
    reg.setActiveCall('s1', 'call_new');
    // 旧循环的 finally 迟到
    reg.clearActiveCall('s1', 'call_old');
    expect(reg.getActiveCallId('s1')).toBe('call_new');
  });

  test('getActiveCallMap 返回快照对象，外部改动不回流注册表', () => {
    reg.setActiveCall('s1', 'call_a');
    reg.setActiveCall('s2', 'call_b');
    const snapshot = reg.getActiveCallMap();
    expect(snapshot).toEqual({ s1: 'call_a', s2: 'call_b' });
    snapshot.s1 = 'tampered';
    delete snapshot.s2;
    expect(reg.getActiveCallId('s1')).toBe('call_a');
    expect(reg.getActiveCallId('s2')).toBe('call_b');
  });

  test('sessionId 缺失时静默忽略（防御异常调用）', () => {
    expect(() => reg.setActiveCall(null, 'call_a')).not.toThrow();
    expect(() => reg.clearActiveCall(null)).not.toThrow();
    expect(reg.getActiveCallId(null)).toBeNull();
  });

  // 定时任务（scheduler，callId 前缀 st_）也是顶层 reactLoop：它跑完只写库 + 发
  // SCHEDULED_TASK_RUN_STATE，从不广播 API_COMPLETE/API_ERROR。若照常登记，面板
  // reattach 会为它建镜像并永久停在「生成中」（气泡挂着、pending 不清、归档/继续执行被挡）。
  test('reattachable:false 的调用不登记（定时任务没有面板消费者）', () => {
    reg.setActiveCall('s1', 'st_1', { reattachable: false });
    expect(reg.getActiveCallId('s1')).toBeNull();
    // 不影响既有登记，也不影响后续正常登记
    reg.setActiveCall('s1', 'call_a');
    reg.setActiveCall('s1', 'st_2', { reattachable: false });
    expect(reg.getActiveCallId('s1')).toBe('call_a');
  });
});

// ==================== 自动续跑 callId 生成 ====================

describe('createAutoResumeCallId 自动续跑 callId 生成', () => {
  let createAutoResumeCallId;

  beforeEach(async () => {
    vi.resetModules();
    ({ createAutoResumeCallId } = await import('../../src/background/auto-resume.js'));
  });

  test('auto_ 前缀（与面板 call_/resume_ 前缀可区分，日志可辨识）', () => {
    expect(createAutoResumeCallId()).toMatch(/^auto_/);
  });

  test('连续生成不重复（同毫秒也不会撞车）', () => {
    const ids = new Set(Array.from({ length: 50 }, () => createAutoResumeCallId()));
    expect(ids.size).toBe(50);
  });
});

// ==================== 接线守卫 ====================

describe('接线：自动续跑透传新 callId + SW 登记/下发', () => {
  test('自动续跑处理器生成新 callId 并作为第三个参数传入 resumeReactLoopFromCheckpoint', () => {
    expect(INDEX_SRC).toMatch(/createAutoResumeCallId/);
    expect(INDEX_SRC).toMatch(
      /resumeReactLoopFromCheckpoint\(\s*checkpoint\.sessionId\s*,\s*''\s*,\s*autoCallId\s*\)/
    );
    // 生成必须发生在调用之前（否则传进去的是 undefined）
    const genIdx = INDEX_SRC.indexOf('createAutoResumeCallId(');
    const callIdx = INDEX_SRC.indexOf('resumeReactLoopFromCheckpoint(checkpoint.sessionId');
    expect(genIdx).toBeGreaterThan(-1);
    expect(callIdx).toBeGreaterThan(genIdx);
  });

  test('QUERY_SESSION_RUNNING 回传 activeCallIds（面板 reattach 的唯一可靠来源）', () => {
    const idx = INDEX_SRC.indexOf("message.type === 'QUERY_SESSION_RUNNING'");
    expect(idx).toBeGreaterThan(-1);
    const block = INDEX_SRC.slice(idx, idx + 600);
    expect(block).toContain('activeCallIds');
    expect(block).toContain('getActiveCallMap');
  });

  test('react-loop 在顶层任务开始时登记、结束（finally）时清理，且不覆盖子任务的登记', () => {
    expect(REACT_LOOP_SRC).toMatch(/from '\.\/active-call-registry\.js'/);
    expect(REACT_LOOP_SRC).toMatch(/setActiveCall\(\s*sessionId\s*,\s*callId/);
    expect(REACT_LOOP_SRC).toMatch(/clearActiveCall\(\s*sessionId\s*,\s*callId\s*\)/);
    // 子任务（taskContext 非空）与父任务共用 callId/sessionId，退出时不能把父任务的登记清掉
    const setIdx = REACT_LOOP_SRC.indexOf('setActiveCall(sessionId, callId');
    expect(setIdx).toBeGreaterThan(-1);
    const guard = REACT_LOOP_SRC.slice(Math.max(0, setIdx - 300), setIdx);
    expect(guard).toMatch(/!taskContext/);
  });

  test('finally 清理带 callId 存在性守卫：callId 为空的调用不能无条件清掉别人的登记', () => {
    // clearActiveCall(sessionId, null) 会无条件删除；若某轮 callId 为 null 且与另一次调用
    // 并发结束，会把对方的登记删掉 → QUERY_SESSION_RUNNING 漏报在跑 → reattach 失效。
    const finallyIdx = REACT_LOOP_SRC.indexOf('clearActiveCall(sessionId, callId)');
    expect(finallyIdx).toBeGreaterThan(-1);
    const guard = REACT_LOOP_SRC.slice(Math.max(0, finallyIdx - 160), finallyIdx);
    expect(guard).toMatch(/callId\s*&&/);
  });

  test('定时任务调用 reactLoop 时显式关掉可重连登记（scheduler 侧传入）', () => {
    // 两个执行入口（有工具走 reactLoop、无工具走 callApiNonStream）都会登记活跃 callId，
    // 定时任务必须在自己这一侧申明“无人消费”，不能靠 callId 前缀在注册表里猜
    expect(SCHEDULER_SRC).toMatch(/reattachable:\s*false/);
    const constIdx = SCHEDULER_SRC.indexOf('reattachable: false');
    const loopIdx = SCHEDULER_SRC.indexOf('await reactLoop(');
    expect(loopIdx).toBeGreaterThan(constIdx); // 先定义后使用
    expect(SCHEDULER_SRC.slice(loopIdx, loopIdx + 400)).toMatch(/noReattach/);

    const nonStreamIdx = SCHEDULER_SRC.indexOf('await callApiNonStream(');
    expect(nonStreamIdx).toBeGreaterThan(constIdx);
    expect(SCHEDULER_SRC.slice(nonStreamIdx, nonStreamIdx + 300)).toMatch(/noReattach/);
  });
});
