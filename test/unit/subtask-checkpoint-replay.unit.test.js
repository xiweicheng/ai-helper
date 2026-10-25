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

// 测试工具：按花括号配平取「从 header 起的真实函数体」。
// 取代替旧的「indexOf(header) 到下一个 async function」窗口（评审 L-d），理由见下方合成用例：
// 体内出现 async 辅助函数会悄悄截短窗口；紧随其后的是非 async function 时窗口会越界
// 吞并后一个函数的内容；header 改名后旧写法会退化成「文件尾巴」仍可能凑出命中。
function sliceFunctionBody(src, header) {
  const start = src.indexOf(header);
  if (start < 0) return null;
  const open = src.indexOf('{', start);
  if (open < 0) return null;
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const ch = src[i];
    if (ch === '/' && (src[i + 1] === '/' || src[i + 1] === '*')) {
      if (src[i + 1] === '/') {
        const nl = src.indexOf('\n', i);
        if (nl < 0) return null;
        i = nl;
      } else {
        const end = src.indexOf('*/', i + 2);
        if (end < 0) return null;
        i = end + 1;
      }
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
      i++;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') i++;
        i++;
      }
      continue;
    }
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  return null;
}

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
    // 失败/进行中记录不跳过由 shouldSkipSubtaskReplay 行为断言与
    // `if (shouldSkipSubtaskReplay(recorded))` 接线守卫共同保障（避开真实 reactLoop 网络路径）
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
    // 进度钩子对象新增了 onPartial（现场落盘），故不再要求 progress 紧邻 onDone，
    // 只锁「同一个对象里带 progress 且 onDone 仍在此对象内」
    expect(REACT_LOOP_SRC).toMatch(/\{\s*progress:\s*subtaskProgress,/);
    expect(REACT_LOOP_SRC).toMatch(/progress:\s*subtaskProgress,[\s\S]{0,300}?onDone: async/);
    expect(REACT_LOOP_SRC).toMatch(/saveCheckpointNow\('subtask_completed',\s*true\)/);
    // onDone 内更新 taskState 锚点为 done（恢复提示可见）
    expect(REACT_LOOP_SRC).toMatch(/st\.status\s*=\s*'done'/);
  });

  test('plan_task 整轮收尾：先判取消再收尾，且收尾在保存 plan_task_completed checkpoint 之前', () => {
    // 旧断言只查 subtaskProgress.clear() 的位置；清空已移到 finalizePlanRound 内部，
    // 本守卫改锚「取消判定必须早于收尾」——真机回归就是 clear 跑在取消判定前面，
    // 把留给续跑的防重放记录抹掉了
    const finalIdx = REACT_LOOP_SRC.indexOf('finalizePlanRound(subtaskProgress,');
    const callIdx = REACT_LOOP_SRC.indexOf('const subtaskResults = await executeSubtasks(');
    const cancelIdx = REACT_LOOP_SRC.indexOf('const planRoundCancelled = isCancelled(tabId)');
    const saveIdx = REACT_LOOP_SRC.indexOf("await saveCheckpointNow('plan_task_completed')");
    expect(finalIdx).toBeGreaterThan(-1);
    expect(cancelIdx).toBeGreaterThan(callIdx);
    expect(cancelIdx).toBeLessThan(finalIdx);
    expect(finalIdx).toBeLessThan(saveIdx);
  });

  test('resume 入口把 checkpoint.subtaskProgress 回灌进 reactLoop 的 resumeState', () => {
    expect(REACT_LOOP_SRC).toMatch(/subtaskProgress:\s*checkpoint\.subtaskProgress\s*\|\|\s*null/);
  });

  test('executeSubtasks 内跳过分支：命中进度且 success 才跳过（失败记录不跳过）', () => {
    expect(REACT_LOOP_SRC).toMatch(/progress\?\.get\(String\(subtask\.id\)\)/);
    // 评审 L1：旧正则 /recorded\s*&&\s*recorded\.success/ 现在只命中纯函数定义体，
    // 把跳过判定改回 `if (recorded)`（会误跳过进行中记录）也不会红 → 改锚真实调用点
    expect(REACT_LOOP_SRC).toMatch(/if \(shouldSkipSubtaskReplay\(recorded\)\)/);
    expect(REACT_LOOP_SRC).toMatch(/skippedReplay:\s*true/);
  });

  test('shouldSkipSubtaskReplay 行为：进行中（success:false）记录必须重跑', async () => {
    const { shouldSkipSubtaskReplay } = await import('../../src/background/react-loop.js');
    expect(shouldSkipSubtaskReplay({ success: true })).toBe(true);
    expect(shouldSkipSubtaskReplay({ success: false, partialSummary: '- 工具1: 产出-1' })).toBe(false);
    expect(shouldSkipSubtaskReplay(undefined)).toBe(false);
  });

  test('跳过分支不得触发 onDone（避免恢复循环中重复持久化）', () => {
    // 跳过 return 位于 onDone 调用点之前：断言跳过分支返回在 executeSingleSubtask 顶部
    const body = sliceFunctionBody(REACT_LOOP_SRC, 'async function executeSingleSubtask');
    expect(body).not.toBeNull(); // header 改名/被拆分会退化成“文件尾巴”式假命中，先钉住存在
    const skipReturn = body.indexOf('skippedReplay: true');
    const onDoneCall = body.indexOf('onDone');
    expect(skipReturn).toBeGreaterThan(-1);
    expect(onDoneCall).toBeGreaterThan(-1);
    expect(skipReturn).toBeLessThan(onDoneCall);
    // 窗口必须是真函数体：不得把下一个顶层函数的内容也算进来
    expect(body.endsWith('}')).toBe(true);
    expect(body).not.toMatch(/\n(?:export )?(?:async )?function /);
  });

  // 评审 L-d：下面三例是窗口取法本身的拟合记录——它们不测生产代码，测的是
  // 「本守卫用的窗口能不能担起上面的断言」，并留下旧写法确实会错的证据。
  describe('窗口取法本身：花括号配平 vs 旧的下一个 async function', () => {
    test('体内有 async 辅助函数时旧窗口会被截短，配平不会', () => {
      const src = 'async function target() {\n  const h = async function inner() { return 1; };\n  return ok;\n}\nasync function after() {}\n';
      const body = sliceFunctionBody(src, 'async function target()');
      expect(body).toContain('return ok');
      expect(body).not.toContain('async function after');
    });

    test('旧写法在「紧随其后是非 async function」时确实越界（证明本守卫不是空转）', () => {
      const src = 'async function target() {\n  return early;\n}\nfunction helper() {\n  call(onDone);\n}\nasync function later() {}\n';
      const s = src.indexOf('async function target');
      const n = src.indexOf('async function', s + 10);
      const oldWindow = src.slice(s, n > s ? n : undefined);
      // 旧窗口把 helper 的内容也算了进来：onDone 被搬出 executeSingleSubtask 仍会绿
      expect(oldWindow).toContain('call(onDone)');
      expect(sliceFunctionBody(src, 'async function target()')).not.toContain('call(onDone)');
    });

    test('header 不存在时返回 null，不得退化成文件尾巴', () => {
      expect(sliceFunctionBody('async function a() {}\n', 'async function missing')).toBe(null);
    });
  });

  test('防重放节点文案 i18n 中英文均已注册', () => {
    const zh = REACT_LOOP_SRC.match(/registerTranslations\('zh'[\s\S]*?\n\}\);/);
    const en = REACT_LOOP_SRC.match(/registerTranslations\('en'[\s\S]*?\n\}\);/);
    expect(zh && zh[0]).toMatch(/subtaskSkippedReplay:/);
    expect(en && en[0]).toMatch(/subtaskSkippedReplay:/);
  });
});

// 真机探针实测到的回归：取消联动修好之后，父循环第一次真的跑到了 plan_task 收尾，
// 而那段收尾是「先无条件 subtaskProgress.clear() 再查 isCancelled」——于是
// user_cancelled 落盘的 checkpoint 里 s1/s2 记录全被清掉，续跑时已完成子任务
// 被重放（SUB1+1 SUB2+1、skipping replay 命中 0 次）。修好前这个 bug 碰不到：
// 取消压根中断不了在途请求，循环卡在子任务上，最后一拍永远是 subtask_completed。
describe('plan_task 整轮收尾：中断不得清空防重放进度', () => {
  test('被取消时收尾保留进度记录，锚点状态照常更新', async () => {
    const rl = await import('../../src/background/react-loop.js');
    const progress = makeProgress();
    const taskState = {
      subtasks: [
        { id: 's1', name: '任务一', status: 'pending' },
        { id: 's2', name: '任务二', status: 'pending' },
      ],
    };
    const subtaskResults = [
      { subtaskId: 's1', subtaskName: '任务一', success: true },
      { subtaskId: 's2', subtaskName: '任务二', success: false },
    ];

    const cleared = rl.finalizePlanRound(progress, { cancelled: true, taskState, subtaskResults });

    expect(cleared).toBe(false);
    expect(progress.size).toBe(2, '中断收尾必须把已完成子任务的记录留给续跑');
    expect(taskState.subtasks[0].status).toBe('done');
    expect(taskState.subtasks[1].status).toBe('failed');
  });

  test('整轮正常完成时清空进度（后续新一轮 plan_task 不误复用旧结果）', async () => {
    const rl = await import('../../src/background/react-loop.js');
    const progress = makeProgress();

    const cleared = rl.finalizePlanRound(progress, { cancelled: false, taskState: null, subtaskResults: [] });

    expect(cleared).toBe(true);
    expect(progress.size).toBe(0);
  });

  test('接线：收尾走 finalizePlanRound，不得再残留旧的无条件 clear', () => {
    expect(REACT_LOOP_SRC).toContain('finalizePlanRound(subtaskProgress,');
    expect(REACT_LOOP_SRC).not.toMatch(/subtaskProgress\.clear\(\)/);
  });
});
