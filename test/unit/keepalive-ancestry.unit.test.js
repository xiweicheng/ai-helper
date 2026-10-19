// @vitest-environment jsdom
// keepalive-ancestry.unit.test.js - 派生会话（子任务/子代理）的 keepalive 身份与端口祖先解析回归测试
//
// 缺陷背景：plan_task 子任务用派生 sessionId（`${root}_subtask_${i}`）、dispatch_task
// 子代理用 `${root}_sub_${agentId}` 执行；而面板 callApi 注册 keepalive 端口与实例身份
// （windowId）用的是根会话 id。确认/澄清路径拿派生 id 直查：
//   - getKeepalivePort(派生id) 为 null → 定向发送退化为广播（面板仍能弹框）；
//   - getKeepaliveIdentity(派生id) 为 null → isPanelVisibleToUser 走「信息缺失保守
//     按不可见」→ 用户明明看着面板，桌面提醒照弹不误。
// 修复约定：端口/身份查找逐层剥离派生后缀回退到最近已注册祖先（与 hasLoopApproval
// 已采纳的 getSessionAncestry 语义一致）；注册/注销仍按精确 key，不改写。
import { describe, test, expect, beforeEach, vi } from 'vitest';

let bgState;
let pv;
let notifier;

const createMock = vi.fn();
let storageData = {};

beforeEach(async () => {
  vi.resetModules();
  bgState = await import('../../src/background/state.js');
  pv = await import('../../src/background/panel-visibility.js');
  storageData = {};
  createMock.mockReset();
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
      onChanged: { addListener: () => {} },
    },
    runtime: { lastError: null, getURL: (p) => p },
    notifications: {
      create: createMock,
      clear: (id, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(true); },
      onClicked: { addListener: () => {} },
    },
  };
  notifier = await import('../../src/background/notifier.js');
});

function makePort() {
  return { postMessage: vi.fn(), onDisconnect: { addListener: () => {} } };
}

describe('keepalive 端口查找的祖先解析（派生会话定向路由）', () => {
  test('子任务派生 id（_subtask_N）查到根会话注册的 port', () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-root', port);
    expect(bgState.getKeepalivePort('sess-root_subtask_0')).toBe(port);
    expect(bgState.hasKeepalivePort('sess-root_subtask_2')).toBe(true);
  });

  test('dispatch 子代理派生 id（_sub_agentId）查到根会话注册的 port', () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-root', port);
    expect(bgState.getKeepalivePort('sess-root_sub_fetcher')).toBe(port);
  });

  test('多层派生链逐层回退（子任务内再派发子代理）', () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-root', port);
    expect(bgState.getKeepalivePort('sess-root_subtask_0_sub_worker')).toBe(port);
    expect(bgState.getKeepalivePort('sess-root_subtask_0_subtask_1')).toBe(port);
  });

  test('自身有注册时优先返回自身（不回退覆盖语义）', () => {
    const rootPort = makePort();
    const subPort = makePort();
    bgState.registerKeepalivePort('sess-root', rootPort);
    bgState.registerKeepalivePort('sess-root_subtask_0', subPort);
    expect(bgState.getKeepalivePort('sess-root_subtask_0')).toBe(subPort);
  });

  test('无任何祖先注册：仍返回 null（定时任务等无面板场景保守语义不变）', () => {
    expect(bgState.getKeepalivePort('unknown_subtask_0')).toBeNull();
    expect(bgState.hasKeepalivePort('unknown_subtask_0')).toBe(false);
    expect(bgState.getKeepaliveIdentity('unknown_subtask_0')).toBeNull();
  });

  test('注销根会话后派生 id 一并失效（面板任务结束清理）', () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-root', port);
    bgState.setKeepaliveIdentity('sess-root', { windowId: 1, hostTabId: 10 });
    bgState.unregisterKeepalivePort('sess-root', port);
    expect(bgState.getKeepalivePort('sess-root_subtask_0')).toBeNull();
    expect(bgState.getKeepaliveIdentity('sess-root_subtask_0')).toBeNull();
  });
});

describe('keepalive 身份查找的祖先解析（可见性判定数据源）', () => {
  test('派生 id 查到根会话上报的实例身份', () => {
    bgState.setKeepaliveIdentity('sess-root', { windowId: 1, hostTabId: 10 });
    expect(bgState.getKeepaliveIdentity('sess-root_subtask_0')).toEqual({ windowId: 1, hostTabId: 10 });
    expect(bgState.getKeepaliveIdentity('sess-root_sub_worker')).toEqual({ windowId: 1, hostTabId: 10 });
  });
});

// 端到端链路：index.js 的接线形态（isPanelVisible → isPanelVisibleToUser →
// getKeepaliveIdentity）下，子任务确认提醒在面板可见时必须被抑制。
describe('子任务确认的桌面提醒抑制（缺陷复现链路）', () => {
  /** 注入一组默认全“可见”的镜像读取器（窗口 1 聚焦、全局模式） */
  function wireVisibility() {
    pv.initPanelVisibility({
      isBrowserFocused: () => true,
      getFocusedWindowId: () => 1,
      getActiveTabId: () => 10,
      getScope: () => 'global',
    });
    notifier.initNotifier({
      isPanelVisible: (sessionId, snapshot) => pv.isPanelVisibleToUser(sessionId, snapshot),
      revealPanel: () => {},
    });
  }

  test('面板可见（身份注册在根会话）：子任务确认不弹桌面提醒', async () => {
    wireVisibility();
    bgState.setKeepaliveIdentity('sess-root', { windowId: 1, hostTabId: 10 });
    await notifier.notifyInteractionRequired({
      kind: 'confirm', sessionId: 'sess-root_subtask_0', detail: 'agent_exec',
    });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('面板不可见（浏览器失焦）：子任务确认仍要弹提醒（不漏弹）', async () => {
    pv.initPanelVisibility({
      isBrowserFocused: () => false,
      getFocusedWindowId: () => 1,
      getActiveTabId: () => 10,
      getScope: () => 'global',
    });
    notifier.initNotifier({
      isPanelVisible: (sessionId, snapshot) => pv.isPanelVisibleToUser(sessionId, snapshot),
      revealPanel: () => {},
    });
    bgState.setKeepaliveIdentity('sess-root', { windowId: 1, hostTabId: 10 });
    await notifier.notifyInteractionRequired({
      kind: 'confirm', sessionId: 'sess-root_subtask_0', detail: 'agent_exec',
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test('根会话无身份（定时任务派生会话）：保守弹，行为不变', async () => {
    wireVisibility();
    await notifier.notifyInteractionRequired({
      kind: 'confirm', sessionId: 'scheduled-task_subtask_0', detail: 'agent_exec',
    });
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});
