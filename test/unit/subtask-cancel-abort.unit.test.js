// @vitest-environment jsdom
// subtask-cancel-abort.unit.test.js - 用户取消必须联动派生会话在途请求的回归测试
//
// 缺陷背景（真机端到端探针实测，非推断）：侧边栏点「停止」后，
// index.js 只调 cancelReactLoop(根sessionId)，而 state.js 里 abort 只按**精确 key**
// 取 controller。可 plan_task 子任务的 LLM 请求注册在派生会话
// `${root}_subtask_${i}`（dispatch_task 子代理为 `${root}_sub_${agentId}`）上，
// 于是取消那一刻：
//   - 子任务在途请求一个都没被中断，父循环 await 在 executeSubtasks 上永不返回；
//   - isCancelled 的检查点全在轮次之间（那里根本轮不到），父循环不抛错；
//   - 外层 catch 的 saveCheckpointNow('user_cancelled', true) 因此从不执行，
//     落盘的中断原因停在 subtask_completed —— 而 auto-resume.js 的 TERMINAL_REASONS
//     只挡 user_cancelled / error，属于"蒸发型"原因，SW 一旦被回收，alarms 会把
//     用户明确取消过的任务自动捞回重跑（上限 3 次）。
// 注：isCancelled 早已认派生会话（父取消则子视为取消），唯独 abort 联动漏了，
// 因此本修复沿用 isCancelled 的同一判定口径（k === root || k.startsWith(root + '_')），
// 不另造一套派生规则。
import { describe, test, expect, beforeEach, vi } from 'vitest';

let bgState;

const storageData = {};

beforeEach(async () => {
  vi.resetModules();
  globalThis.chrome = {
    storage: {
      local: {
        get: (key, cb) => {
          const k = Array.isArray(key) ? key[0] : key;
          const result = k in storageData ? { [k]: storageData[k] } : {};
          if (typeof cb === 'function') cb(result);
          return Promise.resolve(result);
        },
        set: (obj, cb) => {
          Object.assign(storageData, obj);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
    },
    runtime: { lastError: undefined, id: 'test' },
  };
  bgState = await import('../../src/background/state.js');
});

describe('取消联动派生会话的在途请求', () => {
  test('取消根会话时，子任务派生会话的在途 fetch controller 一并被 abort', () => {
    const root = 'sess_root1_abcd';
    const parentCtrl = bgState.getOrCreateAbortController(root);
    const subtaskCtrl = bgState.getOrCreateAbortController(`${root}_subtask_0`);
    const subtaskCtrl2 = bgState.getOrCreateAbortController(`${root}_subtask_2`);

    bgState.cancelReactLoop(root);

    expect(parentCtrl.signal.aborted).toBe(true);
    expect(subtaskCtrl.signal.aborted).toBe(true, '子任务在途请求必须随父取消一起中断');
    expect(subtaskCtrl2.signal.aborted).toBe(true);
  });

  test('取消根会话时，dispatch_task 子代理与嵌套派生会话也被 abort', () => {
    const root = 'sess_root2_efgh';
    const subAgentCtrl = bgState.getOrCreateAbortController(`${root}_sub_agentA`);
    const nestedCtrl = bgState.getOrCreateAbortController(`${root}_subtask_1_subtask_0`);

    bgState.cancelReactLoop(root);

    expect(subAgentCtrl.signal.aborted).toBe(true);
    expect(nestedCtrl.signal.aborted).toBe(true);
  });

  test('取消根会话不得波及无关会话（多会话并行隔离）', () => {
    const root = 'sess_root3_ijkl';
    const other = 'sess_other3_mnop';
    const targetCtrl = bgState.getOrCreateAbortController(root);
    const otherCtrl = bgState.getOrCreateAbortController(other);
    const otherSubCtrl = bgState.getOrCreateAbortController(`${other}_subtask_0`);

    bgState.cancelReactLoop(root);

    expect(targetCtrl.signal.aborted).toBe(true);
    expect(otherCtrl.signal.aborted).toBe(false, '无关会话的请求不能被误中断');
    expect(otherSubCtrl.signal.aborted).toBe(false);
  });

  test('取消根会话时，派生会话正在等待的工具也被终止', () => {
    const root = 'sess_root4_qrst';
    const toolCtrl = bgState.getOrCreateToolAbortController(`${root}_subtask_1`);

    bgState.cancelReactLoop(root);

    expect(toolCtrl.signal.aborted).toBe(true, '子任务卡在工具等待（含确认弹窗）时点停止应真正停下');
  });

  test('tabId 形式的旧版取消仍然可用（不抛错）', () => {
    expect(() => bgState.cancelReactLoop(42)).not.toThrow();
    expect(bgState.isCancelled(42)).toBe(true);
  });

  // 真机探针实测到的根因：reactLoopImpl 先 getOrCreateAbortController 拿到将在
  // fetch 上使用的 signal，随后又调一次 resetReactCancel 清标志；而该函数顺手把
  // controller 登记也删了，于是取消时 map 里一个 key 都扫不到（探针打出
  // 「cancel scope ... fetchKeys: (none)」），父任务自己的在途请求也中断不了。
  test('清取消标志不得抹掉在途请求的 controller 登记', () => {
    const root = 'sess_flag1_uvwx';
    const ctrl = bgState.getOrCreateAbortController(root);

    bgState.resetReactCancel(root);
    bgState.cancelReactLoop(root);

    expect(ctrl.signal.aborted).toBe(true, '发起请求前重清标志不能把取消能力拆掉');
  });

  test('resetReactCancel 确实清掉了取消标志本身', () => {
    const root = 'sess_flag2_yz';
    bgState.cancelReactLoop(root);
    expect(bgState.isCancelled(root)).toBe(true);

    bgState.resetReactCancel(root);
    expect(bgState.isCancelled(root)).toBe(false);
  });
});

describe('取消范围判定纯函数', () => {
  test('命中自身与派生会话，按 key 稳定排序且父在前', () => {
    const root = 'sess_p_1';
    const keys = [`${root}_subtask_2`, 'sess_other_x', `${root}`, `${root}_subtask_0`, `${root}_sub_a`];
    const hit = bgState.collectSessionCancelKeys(root, keys);

    expect(hit[0]).toBe(root);
    expect(hit).toContain(`${root}_subtask_0`);
    expect(hit).toContain(`${root}_subtask_2`);
    expect(hit).toContain(`${root}_sub_a`);
    expect(hit).not.toContain('sess_other_x');
  });

  test('同前缀但不同会话的 id 不误伤（sess_a 与 sess_ab_ 类边界）', () => {
    const root = 'sess_a';
    const hit = bgState.collectSessionCancelKeys(root, ['sess_a', 'sess_ab_subtask_0', 'sess_ab', 'sess_a_subtask_0']);

    expect(hit).toEqual(expect.arrayContaining(['sess_a', 'sess_a_subtask_0']));
    expect(hit).not.toContain('sess_ab_subtask_0');
    expect(hit).not.toContain('sess_ab');
  });

  test('空会话标识返回空集合（全局取消走另一条分支）', () => {
    expect(bgState.collectSessionCancelKeys(null, ['sess_x', 'sess_x_subtask_0'])).toEqual([]);
    expect(bgState.collectSessionCancelKeys('sess_y', null)).toEqual([]);
  });
});
