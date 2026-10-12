// 并行子任务并发节流修复回归测试
// Bug：executeSubtasks parallel 分支用 `executing.indexOf(Promise.race 的结果值)` 定位待移除元素，
// 数组存的是 Promise 对象、race 解出的是结果值，引用永不相等 → indexOf 恒 -1 → splice 从不执行
// → 首个子任务完成后并发上限彻底失效，剩余子任务瞬间全量并发（同 tab 互相踩踏 + API 429 风暴）。
// 修复：导出 dispatchSubtasksParallel（Set + 完成自移除池），行为级断言峰值并发 ≤ maxParallel。
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

let dispatchSubtasksParallel;

beforeAll(async () => {
  const rl = await import('../../src/background/react-loop.js');
  dispatchSubtasksParallel = rl.dispatchSubtasksParallel;
});

describe('dispatchSubtasksParallel 并发节流（修复行为回归）', () => {
  test('6 个任务、上限 3：峰值并发恒 ≤ 3，且池被用满（=3），全部执行且顺序正确', async () => {
    let running = 0;
    let peak = 0;
    const started = [];
    const items = Array.from({ length: 6 }, (_, i) => ({ id: 's' + i }));

    const stopped = await dispatchSubtasksParallel(items, 3, async (item, idx) => {
      running++;
      if (running > peak) peak = running;
      started.push([item.id, idx]);
      await new Promise(r => setTimeout(r, 10));
      running--;
    });

    expect(stopped).toBe(false);
    expect(peak).toBe(3);              // 用满并发度
    expect(started.length).toBe(6);    // 全部执行
    expect(started.map(s => s[1])).toEqual([0, 1, 2, 3, 4, 5]); // 按序派发
  });

  test('修复对照：并发上限严格成立（旧 indexOf 失效模式在 6 任务上限 3 下峰值为 5）', async () => {
    // 照抄旧实现做同场景对照，证明本用例的行为断言确实能区分新旧逻辑
    const items = Array.from({ length: 6 }, (_, i) => ({ id: 's' + i }));
    let running = 0; let peakOld = 0;
    const executingOld = [];
    const runOne = (item) => new Promise(resolve => {
      running++; if (running > peakOld) peakOld = running;
      setTimeout(() => { running--; resolve({ id: item.id }); }, 10);
    });
    for (let i = 0; i < items.length; i++) {
      if (executingOld.length >= 3) {
        const completed = await Promise.race(executingOld);
        const idx = executingOld.indexOf(completed); // 恒 -1：旧 Bug 复现
        if (idx > -1) executingOld.splice(idx, 1);
      }
      executingOld.push(runOne(items[i]));
    }
    await Promise.all(executingOld);
    expect(peakOld).toBeGreaterThan(3); // 旧模式必然超限（对照证据）

    // 新模式同场景不超限
    let running2 = 0; let peakNew = 0;
    await dispatchSubtasksParallel(items, 3, async () => {
      running2++; if (running2 > peakNew) peakNew = running2;
      await new Promise(r => setTimeout(r, 10));
      running2--;
    });
    expect(peakNew).toBeLessThanOrEqual(3);
  });

  test('beforeDispatch 命中（如用户取消）：停止派发并返回 true，不再启动新任务', async () => {
    let started = 0;
    const items = Array.from({ length: 5 }, (_, i) => ({ id: 's' + i }));
    const stopped = await dispatchSubtasksParallel(
      items,
      2,
      async () => { started++; await new Promise(r => setTimeout(r, 10)); },
      () => started >= 2
    );
    expect(stopped).toBe(true);
    expect(started).toBe(2); // 检查在每次派发前：第 3 个不会启动
  });

  test('任务 rejection 向调用方传播（保留取消/AbortError 直传语义）', async () => {
    const err = new Error('boom');
    err.name = 'AbortError';
    await expect(
      dispatchSubtasksParallel([{ id: 'a' }, { id: 'b' }], 1, async (item) => {
        if (item.id === 'a') { await new Promise(r => setTimeout(r, 5)); throw err; }
      })
    ).rejects.toThrow('boom');
  });

  test('maxParallel 非法值兜底为 1（旧实现 Promise.race([]) 会永久挂起）', async () => {
    let running = 0; let peak = 0;
    await dispatchSubtasksParallel([{ id: 'x' }, { id: 'y' }], 0, async () => {
      running++; if (running > peak) peak = running;
      await new Promise(r => setTimeout(r, 5));
      running--;
    });
    expect(peak).toBe(1);
  });
});

describe('executeSubtasks parallel 分支接线守卫', () => {
  test('改用修复后的并发池，broken 的 indexOf(completed) 模式已移除', () => {
    expect(REACT_LOOP_SRC).toMatch(/const stoppedEarly = await dispatchSubtasksParallel\(/);
    expect(REACT_LOOP_SRC).not.toMatch(/executing\.indexOf\(completed\)/);
    expect(REACT_LOOP_SRC).toMatch(/export async function dispatchSubtasksParallel\(/);
    // 完成自移除：tracked promise 在 finally 中从 Set 删除
    expect(REACT_LOOP_SRC).toMatch(/tracked = executeOne\(items\[i\], i\)\.finally\(\(\) => inFlight\.delete\(tracked\)\)/);
    // 取消检查在每次派发前（保持旧语义）
    expect(REACT_LOOP_SRC).toMatch(/if \(beforeDispatch && beforeDispatch\(\)\) return true/);
    // 调用方保留早退返回 results 的旧语义
    expect(REACT_LOOP_SRC).toMatch(/if \(stoppedEarly\) \{\n\s*logger\.debug\('\[Background\] subtaskparallel execby usercancel'\);\n\s*return results;\n\s*\}/);
  });
});
