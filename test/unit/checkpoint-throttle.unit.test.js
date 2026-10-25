// checkpoint 节流的「尾随落盘」回归测试
//
// 背景（真机凭据，不是推断）：探针 _subtask-interrupt-resume-e2e.mjs 单轮实录 6 次
// 节流跳过，其中 2 次是 subtask_partial_progress（间隔 31ms / 45ms）。而
// createSubtaskPartialProgressWriter 只在「摘要内容真的变了」时才回调 onPartial
// （react-loop.js 内 summary === lastSummary 直接 return），所以被吃掉的那一次携带的是
// 新数据，不是冗余写。
//
// 危害不是"丢 1500ms"这么简单：跳过后要等到**下一次保存尝试**才落盘，而下一次可能是
// 本个子任务结束（subtask_completed）。SW 在此期间被硬杀（浏览器关闭/进程回收），
// 这一段已完成工具节点就整段丢失 → 续跑时这些写操作二次执行。
// 尾随 flush 把暴露窗口从「到下一次保存尝试」压到 ≤throttleMs。
//
// 同时必须防住修复本身的新 bug：任务正常完成时 final_answer 之后紧跟 clearCheckpoint，
// 若挂着的尾随定时器随后又把 checkpoint 写回去，就复活了一个「已完成任务」的现场，
// 而 interruptedReason 不在 TERMINAL_REASONS 里 → alarms 会自动重跑已完成任务。
// 所以 cancel 的接线（force 落盘后 / clearCheckpoint 后 / finally）与调度逻辑同等重要。
import { describe, test, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { createCheckpointThrottle } from '../../src/background/react-loop.js';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

/** 造一个时间/定时器全可控的节流器 */
function makeHarness({ throttleMs = 1500, persistImpl = vi.fn(async () => {}) } = {}) {
  let clock = 10_000;
  const timers = [];
  const throttled = createCheckpointThrottle({
    throttleMs,
    persist: persistImpl,
    now: () => clock,
    schedule: (fn, ms) => {
      const timer = { fn, ms, fired: false, cleared: false };
      timers.push(timer);
      return timer;
    },
    unschedule: (timer) => { if (timer) timer.cleared = true; },
  });
  const advance = (ms) => { clock += ms; };
  // 触发第 n 个已排定的尾随定时器（模拟真实定时器回调）
  const fire = async (n = 0) => {
    const timer = timers[n];
    if (!timer) throw new Error(`没有第 ${n} 个定时器，实际排定 ${timers.length} 个`);
    timer.fired = true;
    await timer.fn();
  };
  return { throttled, timers, advance, fire, persistImpl, pendingCount: () => timers.filter((t) => !t.cleared).length };
}

describe('createCheckpointThrottle 调度语义', () => {
  test('距上次落盘已超过节流窗口 → 立即落盘并带原原因', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('tools_completed');
    expect(h.persistImpl).toHaveBeenCalledTimes(1);
    expect(h.persistImpl).toHaveBeenCalledWith('tools_completed');
    expect(h.timers.length).toBe(0);
  });

  test('窗口内的调用被挡下，不落盘但排定一次尾随落盘', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('a');          // 建立 last
    h.advance(10);                            // 距上次 10ms < 1500ms
    await h.throttled.request('subtask_partial_progress');
    expect(h.persistImpl).toHaveBeenCalledTimes(1);
    expect(h.timers.length).toBe(1);
    expect(h.timers[0].ms).toBe(1500 - 10);
    await h.fire(0);
    expect(h.persistImpl).toHaveBeenCalledTimes(2);
    expect(h.persistImpl).toHaveBeenLastCalledWith('subtask_partial_progress');
  });

  test('窗口内多次调用合并成一个尾随落盘，且带的是最新原因（不排队、不饿死）', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('a');
    h.advance(5);
    await h.throttled.request('partial#1');
    h.advance(5);
    await h.throttled.request('partial#2');
    h.advance(5);
    await h.throttled.request('partial#3');
    expect(h.timers.length).toBe(1);          // 合并：只排一次
    await h.fire(0);
    // 尾随落盘写的是「当时的最新现场」，原因取最后一次，便于日志对齐真机时序
    expect(h.persistImpl.mock.calls.map((c) => c[0])).toEqual(['a', 'partial#3']);
  });

  test('已排定的尾随定时器不随后续调用无限推后（防饿死：窗口内新调用不得重挂定时器）', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('a');
    const delays = [];
    for (let i = 0; i < 40; i++) {
      h.advance(30);                          // 每次都仍在窗口内
      await h.throttled.request(`p${i}`);
      delays.push(h.timers[0].ms);
    }
    expect(h.timers.length).toBe(1);
    expect(delays[delays.length - 1]).toBe(delays[0]); // 首次排定的到期时间不被推后
  });

  test('尾随落盘完成后重置计时基准，下一次窗口重新计算', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('a');
    h.advance(100);
    await h.throttled.request('b');
    await h.fire(0);                          // 尾随在 1400ms 后落盘
    expect(h.throttled.getLastSaveTime()).toBe(10_000 + 2000 + 100);
    h.advance(2000);
    await h.throttled.request('c');
    expect(h.persistImpl).toHaveBeenLastCalledWith('c');
  });

  test('force 落盘：立即写、取消已排定的尾随（同一现场不该写两遍）', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('partial');
    h.advance(5);
    await h.throttled.request('partial2');    // 排定尾随
    await h.throttled.request('user_cancelled', true);
    expect(h.persistImpl).toHaveBeenLastCalledWith('user_cancelled');
    expect(h.timers[0].cleared).toBe(true);
    // 即便回调因竞态已经进来，也不得再写一次
    await h.fire(0);
    expect(h.persistImpl).toHaveBeenCalledTimes(2);
  });

  test('cancel() 撤掉尾随并让陈旧回调哑火（完成路径 clearCheckpoint 后不得复活 checkpoint）', async () => {
    const h = makeHarness();
    h.advance(2000);
    await h.throttled.request('a');
    h.advance(5);
    await h.throttled.request('final_answer');
    expect(h.timers.length).toBe(1);
    h.throttled.cancel();
    await h.fire(0);
    expect(h.persistImpl).toHaveBeenCalledTimes(1);
    expect(h.throttled.isPending()).toBe(false);
  });

  test('尾随落盘抛错不得变成未处理拒绝（定时器回调里没有 catch 就是 SW 崩）', async () => {
    const persistImpl = vi.fn(async (reason) => { if (reason !== 'a') throw new Error('IndexedDB 写失败'); });
    const h = makeHarness({ persistImpl });
    h.advance(2000);
    await h.throttled.request('a');
    h.advance(10);
    await h.throttled.request('partial');
    await expect(h.fire(0)).resolves.toBeUndefined();
  });

  test('非法入参不得让节流器崩：persist 缺失时 request 直接落空但不动时间基准', async () => {
    const throttled = createCheckpointThrottle({ throttleMs: 1500, now: () => 5000 });
    await expect(throttled.request('a')).resolves.toBeUndefined();
    expect(throttled.getLastSaveTime()).toBe(0);
    expect(throttled.isPending()).toBe(false);
  });
});

describe('react-loop 接线守卫（调度对了但没接上等于没修）', () => {
  const saveFn = REACT_LOOP_SRC.slice(
    REACT_LOOP_SRC.indexOf('async function saveCheckpointNow')
  );

  test('saveCheckpointNow 改用节流器，不再自己判时间差', () => {
    expect(saveFn).toContain('checkpointThrottle.request(reason, force)');
  });

  test('正常完成清理 checkpoint 后必须撤掉尾随（否则复活已完成任务的现场）', () => {
    // 必须限窗：用不限长度的 indexOf(needle, clearIdx) 时，删掉这处的 cancel
    // 它会匹配到后面 finally 里那一处，守卫变成永远绿（变异复验 N6 就是这么存活的）
    const clearIdx = REACT_LOOP_SRC.indexOf('await clearCheckpoint(sessionId);',
      REACT_LOOP_SRC.indexOf('// 任务正常完成后清理 checkpoint'));
    expect(clearIdx).toBeGreaterThan(0);
    const cancelIdx = REACT_LOOP_SRC.indexOf('checkpointThrottle.cancel();', clearIdx);
    expect(cancelIdx - clearIdx).toBeGreaterThan(0);
    expect(cancelIdx - clearIdx).toBeLessThan(600);   // 实测 141；跳到 finally 那处是 2029
  });

  test('循环退出的 finally 里兜底撤掉尾随', () => {
    // 同上：锚在 finally 体内独有的语句上并限窗，不用全文第一个 '} finally {'
    // （文件里有四处，早期函数的 finally 会把搜索基准带到本次修复之前，N7 以存活的代价验出了这点）
    const deleteIdx = REACT_LOOP_SRC.indexOf('activeReactLoops.delete(sessionId);');
    expect(deleteIdx).toBeGreaterThan(0);
    const cancelIdx = REACT_LOOP_SRC.lastIndexOf('checkpointThrottle.cancel();', deleteIdx);
    expect(deleteIdx - cancelIdx).toBeLessThan(600);  // 实测 100；退到完成路径那处是 1988
    expect(deleteIdx - cancelIdx).toBeGreaterThan(0);
  });
});
