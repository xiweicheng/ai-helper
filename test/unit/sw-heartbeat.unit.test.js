// SW 任务级保活心跳（方案 A）回归测试
// 背景：MV3 SW 约 30 秒闲置即被终止；任务执行期存在"静默间隙"（等首 token、
// 澄清等待用户、超长 fetch），期间可能没有任何扩展 API 调用，纯 port 连接的
// 保活语义在不同 Chrome 版本上松紧不一。修复：任务执行期间每 20s 主动调用
// 一次轻量扩展 API（chrome.runtime.getPlatformInfo）重置闲置计时器——
// 这是 Chrome 官方博客针对长时间任务给出的标准 waitUntil/heartbeat 模式。
// 引用计数设计：plan 子任务 / dispatch 子代理各自嵌套调用 reactLoop，
// 每层 start/stop 成对出现，只有最外层 stop 才真正停跳。
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

let startSwHeartbeat, stopSwHeartbeat, isSwHeartbeatRunning, __resetSwHeartbeat, SW_HEARTBEAT_INTERVAL_MS;
let pulseSpy;

beforeEach(async () => {
  vi.useFakeTimers();
  pulseSpy = vi.fn((cb) => { if (typeof cb === 'function') cb({ os: 'mac' }); });
  vi.stubGlobal('chrome', {
    runtime: { lastError: null, getPlatformInfo: pulseSpy },
  });
  const hb = await import('../../src/background/sw-heartbeat.js');
  startSwHeartbeat = hb.startSwHeartbeat;
  stopSwHeartbeat = hb.stopSwHeartbeat;
  isSwHeartbeatRunning = hb.isSwHeartbeatRunning;
  __resetSwHeartbeat = hb.__resetSwHeartbeat;
  SW_HEARTBEAT_INTERVAL_MS = hb.SW_HEARTBEAT_INTERVAL_MS;
  __resetSwHeartbeat();
  pulseSpy.mockClear();
});

afterEach(() => {
  __resetSwHeartbeat();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('sw-heartbeat 行为', () => {
  test('心跳间隔必须小于 30 秒闲置阈值并留出余量', () => {
    expect(SW_HEARTBEAT_INTERVAL_MS).toBeLessThan(30 * 1000);
    expect(SW_HEARTBEAT_INTERVAL_MS).toBeGreaterThanOrEqual(20 * 1000);
  });

  test('start 立即跳一拍，之后每个间隔跳一拍；stop 后停止', () => {
    startSwHeartbeat();
    expect(pulseSpy).toHaveBeenCalledTimes(1);
    expect(isSwHeartbeatRunning()).toBe(true);

    vi.advanceTimersByTime(SW_HEARTBEAT_INTERVAL_MS);
    expect(pulseSpy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(SW_HEARTBEAT_INTERVAL_MS);
    expect(pulseSpy).toHaveBeenCalledTimes(3);

    stopSwHeartbeat();
    expect(isSwHeartbeatRunning()).toBe(false);
    vi.advanceTimersByTime(SW_HEARTBEAT_INTERVAL_MS * 3);
    expect(pulseSpy).toHaveBeenCalledTimes(3);
  });

  test('引用计数：嵌套 start 两次，stop 一次仍保持跳动，stop 两次才停', () => {
    startSwHeartbeat(); // 主任务
    startSwHeartbeat(); // 子任务嵌套 reactLoop
    stopSwHeartbeat();  // 子任务先结束
    expect(isSwHeartbeatRunning()).toBe(true);

    vi.advanceTimersByTime(SW_HEARTBEAT_INTERVAL_MS);
    const before = pulseSpy.mock.calls.length;
    expect(before).toBeGreaterThan(0);

    stopSwHeartbeat();  // 主任务结束
    expect(isSwHeartbeatRunning()).toBe(false);
    vi.advanceTimersByTime(SW_HEARTBEAT_INTERVAL_MS * 2);
    expect(pulseSpy.mock.calls.length).toBe(before);
  });

  test('多余 stop 不出负数、不崩溃；stop 归零后可再次 start', () => {
    stopSwHeartbeat(); // 未 start 直接 stop
    stopSwHeartbeat();
    expect(isSwHeartbeatRunning()).toBe(false);

    startSwHeartbeat();
    expect(isSwHeartbeatRunning()).toBe(true);
    expect(pulseSpy).toHaveBeenCalledTimes(1);
    stopSwHeartbeat();
  });

  test('API 抛异常时静默容错，心跳定时器不被打断继续跳', () => {
    pulseSpy.mockImplementationOnce(() => { throw new Error('No SW'); });
    startSwHeartbeat(); // 首次 pulse 抛错被吞掉，interval 仍建立
    expect(isSwHeartbeatRunning()).toBe(true);

    vi.advanceTimersByTime(SW_HEARTBEAT_INTERVAL_MS);
    expect(pulseSpy.mock.calls.length).toBe(2); // 第二拍照常
  });
});

describe('react-loop.js 心跳接线守卫', () => {
  test('react-loop 导入共享心跳模块', () => {
    expect(REACT_LOOP_SRC).toMatch(
      /import\s*\{[^}]*startSwHeartbeat[^}]*stopSwHeartbeat[^}]*\}\s*from\s*'\.\/sw-heartbeat\.js'/
    );
  });

  test('导出 reactLoop 为心跳包装器：start → await reactLoopImpl → finally stop', () => {
    expect(REACT_LOOP_SRC).toMatch(/export async function reactLoop\(\.\.\.args\)/);
    expect(REACT_LOOP_SRC).toMatch(
      /export async function reactLoop\(\.\.\.args\)\s*\{[\s\S]{0,200}?startSwHeartbeat\(\);[\s\S]{0,200}?try\s*\{[\s\S]{0,120}?await reactLoopImpl\(\.\.\.args\)[\s\S]{0,200}?finally\s*\{[\s\S]{0,120}?stopSwHeartbeat\(\);/
    );
  });

  test('原实现改名 reactLoopImpl 且保留完整参数签名（仅内部调用经包装器）', () => {
    expect(REACT_LOOP_SRC).toMatch(
      /async function reactLoopImpl\(messages, model, tools, tabId, apiParams = \{\}, sessionId = null/
    );
    // 不允许残留旧的直接导出形态
    expect(REACT_LOOP_SRC).not.toMatch(/export async function reactLoop\(messages/);
  });

  test('内部递归调用（resume / 子任务）保持调用包装器 reactLoop 而非 Impl', () => {
    // 两处内部调用：resumeReactLoopFromCheckpoint 与 executeSingleSubtask
    const innerCalls = REACT_LOOP_SRC.match(/await reactLoop\(/g) || [];
    expect(innerCalls.length).toBeGreaterThanOrEqual(2);
    // reactLoopImpl 的调用点有且仅有包装器内那一处（另一次出现是函数定义）
    const implCalls = REACT_LOOP_SRC.match(/reactLoopImpl\(/g) || [];
    expect(implCalls.length).toBe(2);
  });
});
