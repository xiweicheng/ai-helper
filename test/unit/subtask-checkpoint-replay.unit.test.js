// 子任务级 checkpoint 防重放回归测试（问题③）
// 背景：checkpoint 粒度是"父循环轮次"。中断发生在 executeSubtasks 中途时，
// 父 checkpoint 停在 plan_task 那轮（assistant+tool 已入消息、汇总未生成），
// 恢复后模型只能重新调用 plan_task → 所有子任务从头重跑，已完成子任务的
// 写操作（填表/点击/提交）二次执行。
// 修复：每个子任务成功完成即把结果记入 subtaskProgress 并强制落 checkpoint；
// executeSubtasks 命中进度的子任务直接跳过执行返回记录结果（防重放）；
// plan_task 整轮完成后清空进度，防止污染后续新一轮 plan_task。
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

let executeSubtasks;

beforeAll(async () => {
  // chrome stub：storage 必须同时支持回调与 Promise 形态（getStoredConfig 为回调式，
  // 漏调回调会导致 Promise 永不 resolve、测试挂起）
  const makeStore = () => ({
    get: (keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
    set: (obj, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); },
  });
  vi.stubGlobal('chrome', {
    storage: { local: makeStore(), session: makeStore(), onChanged: { addListener: () => {} } },
    runtime: {
      lastError: null, id: 'test-ext',
      sendMessage: () => Promise.resolve(),
      getManifest: () => ({ version: '0.0.0' }),
    },
  });
  const rl = await import('../../src/background/react-loop.js');
  executeSubtasks = rl.executeSubtasks;
});

afterAll(() => {
  vi.unstubAllGlobals();
});

/** 构造命中进度：两个子任务均已有成功记录 */
function makeProgress() {
  return new Map([
    ['s1', { success: true, subtaskId: 's1', subtaskName: '任务一', result: 'RESULT_1', retryCount: 0 }],
    ['s2', { success: true, subtaskId: 's2', subtaskName: '任务二', result: 'RESULT_2', retryCount: 1 }],
  ]);
}

const TOOLS = [{ id: 'page_content', function: { name: 'page_content' } }];

function makePlan(strategy, extras = {}) {
  return {
    subtasks: [
      { id: 's1', name: '任务一', description: '做第一件事', ...extras.d1 },
      { id: 's2', name: '任务二', description: '做第二件事', ...extras.d2 },
    ],
    strategy,
    taskDescription: '父任务',
  };
}

describe('executeSubtasks 恢复跳过（行为回归）', () => {
  test('sequential：全部命中进度 → 直接返回记录结果，不执行、不触发 onDone', async () => {
    const progress = makeProgress();
    const onDone = vi.fn();
    const parentLog = [];

    const results = await executeSubtasks(
      makePlan('sequential'), 'model', TOOLS, null, {}, null, parentLog,
      { value: 0 }, null, null, new Map(), null, null, null,
      { progress, onDone }
    );

    expect(results.length).toBe(2);
    expect(results.map(r => r.result)).toEqual(['RESULT_1', 'RESULT_2']);
    expect(results.every(r => r.success && r.skippedReplay === true)).toBe(true);
    expect(onDone).not.toHaveBeenCalled(); // 跳过项不得重复上报进度
  });

  test('parallel：全部命中进度 → 并发池立即完成，结果按原始顺序返回', async () => {
    const progress = makeProgress();
    const onDone = vi.fn();

    const results = await executeSubtasks(
      makePlan('parallel'), 'model', TOOLS, null, {}, null, [],
      { value: 0 }, null, null, new Map(), null, null, null,
      { progress, onDone }
    );

    expect(results.map(r => r.subtaskId)).toEqual(['s1', 's2']);
    expect(results.map(r => r.result)).toEqual(['RESULT_1', 'RESULT_2']);
    expect(results.every(r => r.skippedReplay === true)).toBe(true);
    expect(onDone).not.toHaveBeenCalled();
  });

  test('dependency：全部命中进度 → 同样跳过（拓扑序执行路径共享跳过分支）', async () => {
    const progress = makeProgress();
    const results = await executeSubtasks(
      makePlan('dependency'), 'model', TOOLS, null, {}, null, [],
      { value: 0 }, null, null, new Map(), null, null, null,
      { progress, onDone: vi.fn() }
    );
    expect(results.length).toBe(2);
    expect(results.every(r => r.skippedReplay === true)).toBe(true);
  });

  test('子任务 id 为数字时也能命中进度（键归一化为字符串，checkpoint 回灌后键必为字符串）', async () => {
    // checkpoint 经 JSON 序列化后 Object.entries 键恒为字符串，而模型生成的子任务 id 可能是数字
    const progress = new Map([
      ['1', { success: true, subtaskId: 1, subtaskName: '任务一', result: 'RESULT_1' }],
      ['2', { success: true, subtaskId: 2, subtaskName: '任务二', result: 'RESULT_2' }],
    ]);
    const plan = {
      subtasks: [
        { id: 1, name: '任务一', description: '做第一件事' },
        { id: 2, name: '任务二', description: '做第二件事' },
      ],
      strategy: 'sequential',
      taskDescription: '父任务',
    };
    const results = await executeSubtasks(
      plan, 'model', TOOLS, null, {}, null, [],
      { value: 0 }, null, null, new Map(), null, null, null,
      { progress, onDone: vi.fn() }
    );
    expect(results.length).toBe(2);
    expect(results.every(r => r.skippedReplay === true)).toBe(true);
    // 失败记录不跳过（真正重跑）由接线守卫正则 `recorded && recorded.success` 断言保障，
    // 避免行为测试走真实 reactLoop 网络路径
  });

  test('跳过项写入父执行日志（状态 success + 防重放节点名），前端可见', async () => {
    const parentLog = [];
    await executeSubtasks(
      makePlan('sequential'), 'model', TOOLS, null, {}, null, parentLog,
      { value: 0 }, null, null, new Map(), null, null, null,
      { progress: makeProgress(), onDone: vi.fn() }
    );
    const skippedEntries = parentLog.filter(e => e.subtaskId === 's1' || e.subtaskId === 's2');
    expect(skippedEntries.length).toBeGreaterThanOrEqual(2);
    expect(skippedEntries.every(e => e.nodeType === 'subtask' && e.status === 'success')).toBe(true);
  });
});

describe('防重放接线守卫（源码正则）', () => {
  test('reactLoopImpl 从 resumeState 回灌 subtaskProgress，checkpoint 载荷包含它', () => {
    expect(REACT_LOOP_SRC).toMatch(/subtaskProgress\s*=\s*new Map\(Object\.entries\(resumeState\?\.subtaskProgress\s*\|\|\s*\{\}\)\)/);
    expect(REACT_LOOP_SRC).toMatch(/subtaskProgress:\s*Object\.fromEntries\(subtaskProgress\)/);
  });

  test('executeSubtasks 调用点传入进度钩子：onDone 记录成功子任务并强制落 checkpoint', () => {
    expect(REACT_LOOP_SRC).toMatch(/\{\s*progress:\s*subtaskProgress,\s*onDone/);
    expect(REACT_LOOP_SRC).toMatch(/saveCheckpointNow\('subtask_completed',\s*true\)/);
    // onDone 内更新 taskState 锚点为 done（恢复提示可见）
    expect(REACT_LOOP_SRC).toMatch(/st\.status\s*=\s*'done'/);
  });

  test('plan_task 整轮完成后清空进度（防污染后续新一轮 plan_task），且在保存 plan_task_completed checkpoint 之前', () => {
    const clearIdx = REACT_LOOP_SRC.indexOf('subtaskProgress.clear()');
    const callIdx = REACT_LOOP_SRC.indexOf('const subtaskResults = await executeSubtasks(');
    const saveIdx = REACT_LOOP_SRC.indexOf("await saveCheckpointNow('plan_task_completed')");
    expect(clearIdx).toBeGreaterThan(-1);
    expect(clearIdx).toBeGreaterThan(callIdx);
    expect(clearIdx).toBeLessThan(saveIdx);
  });

  test('resume 入口把 checkpoint.subtaskProgress 回灌进 reactLoop 的 resumeState', () => {
    expect(REACT_LOOP_SRC).toMatch(/subtaskProgress:\s*checkpoint\.subtaskProgress\s*\|\|\s*null/);
  });

  test('executeSubtasks 内跳过分支：命中进度且 success 才跳过（失败记录不跳过）', () => {
    expect(REACT_LOOP_SRC).toMatch(/progress\?\.get\(String\(subtask\.id\)\)/);
    expect(REACT_LOOP_SRC).toMatch(/recorded\s*&&\s*recorded\.success/);
    expect(REACT_LOOP_SRC).toMatch(/skippedReplay:\s*true/);
  });

  test('跳过分支不得触发 onDone（避免恢复循环中重复持久化）', () => {
    // 跳过 return 位于 onDone 调用点之前：断言跳过分支返回在 executeSingleSubtask 顶部
    const fnBody = REACT_LOOP_SRC.slice(
      REACT_LOOP_SRC.indexOf('async function executeSingleSubtask'),
      REACT_LOOP_SRC.indexOf('async function executeSingleSubtask') + 12000
    );
    const skipReturn = fnBody.indexOf('skippedReplay: true');
    const onDoneCall = fnBody.indexOf('onDone');
    expect(skipReturn).toBeGreaterThan(-1);
    expect(onDoneCall).toBeGreaterThan(-1);
    expect(skipReturn).toBeLessThan(onDoneCall);
  });

  test('防重放节点文案 i18n 中英文均已注册', () => {
    const zh = REACT_LOOP_SRC.match(/registerTranslations\('zh'[\s\S]*?\n\}\);/);
    const en = REACT_LOOP_SRC.match(/registerTranslations\('en'[\s\S]*?\n\}\);/);
    expect(zh && zh[0]).toMatch(/subtaskSkippedReplay:/);
    expect(en && en[0]).toMatch(/subtaskSkippedReplay:/);
  });
});
