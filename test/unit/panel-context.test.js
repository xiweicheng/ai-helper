// @vitest-environment jsdom
// panel-context 单元测试：面板实例上下文镜像（窗口 id / 作用域 / 会话宿主 tab / 反馈快照）
//
// 快照是桌面通知可见性判定的「数据源优先级①」（随 TASK_FEEDBACK_NOTIFY 消息携带），
// 必须全部来自同步可读的缓存/镜像，不依赖任何异步查询回调的时序。
import { describe, test, expect, beforeEach, vi } from 'vitest';

// ============ Mock chrome 环境 ============

let scopeValue; // chrome.storage.local.get(['sidePanelScope']) 返回的原始值
let windowImpl; // chrome.windows.getCurrent 的实现（可替换为抛错/无返回）
let onChangedHandler = null;

beforeEach(async () => {
  scopeValue = undefined;
  windowImpl = () => Promise.resolve({ id: 5 });
  onChangedHandler = null;
  globalThis.chrome = {
    windows: {
      getCurrent: () => windowImpl(),
    },
    storage: {
      local: {
        get: (keys, cb) => {
          const result = { sidePanelScope: scopeValue };
          if (typeof cb === 'function') cb(result);
          return Promise.resolve(result);
        },
      },
      onChanged: {
        addListener: (fn) => { onChangedHandler = fn; },
      },
    },
  };
  vi.resetModules();
  pc = await import('../../src/side_panel/panel-context.js');
});

let pc;

/** 推进微任务队列（等待 getCurrent 的 promise 回调） */
const flush = () => new Promise((r) => setTimeout(r, 0));

// ============ 窗口 id 镜像 ============

describe('initPanelContext / getPanelWindowId', () => {
  test('未 init：窗口 id 为 null', () => {
    expect(pc.getPanelWindowId()).toBeNull();
  });

  test('init 后异步补水窗口 id', async () => {
    pc.initPanelContext();
    await flush();
    expect(pc.getPanelWindowId()).toBe(5);
  });

  test('getCurrent 失败（reject）：不崩，窗口 id 保持 null', async () => {
    windowImpl = () => Promise.reject(new Error('boom'));
    pc.initPanelContext();
    await flush();
    expect(pc.getPanelWindowId()).toBeNull();
  });

  test('windows API 缺失：不崩（try/catch 兜底）', () => {
    delete chrome.windows;
    expect(() => pc.initPanelContext()).not.toThrow();
    expect(pc.getPanelWindowId()).toBeNull();
  });
});

// ============ 作用域镜像 ============

describe('作用域镜像（sidePanelScope）', () => {
  test('init 读取 sidePanelScope=tab-specific（同步回调，无需 await）', () => {
    scopeValue = 'tab-specific';
    pc.initPanelContext();
    expect(pc.getFeedbackSnapshot(null).scope).toBe('tab-specific');
  });

  test('未设置/非法值：回退 global（与 background normalize 语义一致）', () => {
    scopeValue = 'bogus';
    pc.initPanelContext();
    expect(pc.getFeedbackSnapshot(null).scope).toBe('global');
  });

  test('onChanged（local 区域）：实时更新作用域', () => {
    pc.initPanelContext();
    expect(typeof onChangedHandler).toBe('function');
    onChangedHandler({ sidePanelScope: { newValue: 'tab-specific' } }, 'local');
    expect(pc.getFeedbackSnapshot(null).scope).toBe('tab-specific');
    onChangedHandler({ sidePanelScope: { newValue: 'global' } }, 'local');
    expect(pc.getFeedbackSnapshot(null).scope).toBe('global');
  });

  test('非 local 区域 / 无关键变更：忽略', () => {
    pc.initPanelContext();
    onChangedHandler({ sidePanelScope: { newValue: 'tab-specific' } }, 'sync');
    expect(pc.getFeedbackSnapshot(null).scope).toBe('global');
    onChangedHandler({ otherKey: { newValue: 1 } }, 'local');
    expect(pc.getFeedbackSnapshot(null).scope).toBe('global');
  });
});

// ============ 会话宿主 tab 记录 ============

describe('markSessionHostTab / getSessionHostTab', () => {
  test('记录发起时刻的活跃 tab（同步读 state 镜像）', async () => {
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = 42;
    pc.markSessionHostTab('s1');
    expect(pc.getSessionHostTab('s1')).toBe(42);
  });

  test('currentTabId 未初始化（非 number）：不记录', async () => {
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = null;
    pc.markSessionHostTab('s2');
    expect(pc.getSessionHostTab('s2')).toBeNull();
  });

  test('无 sessionId：不记录；未知会话：返回 null', () => {
    pc.markSessionHostTab(null);
    pc.markSessionHostTab('');
    expect(pc.getSessionHostTab(null)).toBeNull();
    expect(pc.getSessionHostTab('unknown')).toBeNull();
  });

  test('同会话多次发起：后一次记录覆盖前一次', async () => {
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = 10;
    pc.markSessionHostTab('s3');
    stateMod.default.currentTabId = 20;
    pc.markSessionHostTab('s3');
    expect(pc.getSessionHostTab('s3')).toBe(20);
  });
});

// ============ 反馈快照组装 ============

describe('getFeedbackSnapshot 组装', () => {
  test('完整快照：窗口 id + 宿主 tab + 作用域 + panelHidden', async () => {
    scopeValue = 'tab-specific';
    pc.initPanelContext();
    await flush();
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = 7;
    pc.markSessionHostTab('s1');
    expect(pc.getFeedbackSnapshot('s1')).toEqual({
      windowId: 5,
      hostTabId: 7,
      scope: 'tab-specific',
      panelHidden: false,
    });
  });

  test('会话无宿主 tab 记录 / 未 init：字段均为保守空值', () => {
    expect(pc.getFeedbackSnapshot('unknown')).toEqual({
      windowId: null,
      hostTabId: null,
      scope: 'global',
      panelHidden: false,
    });
  });

  test('无 sessionId：hostTabId 为 null，其余字段照常', () => {
    const snap = pc.getFeedbackSnapshot(null);
    expect(snap.hostTabId).toBeNull();
    expect(snap).toHaveProperty('windowId');
    expect(snap).toHaveProperty('scope');
    expect(snap).toHaveProperty('panelHidden');
  });
});

// ============ 权威回填宿主 tab（HOST_TAB_RESOLVED） ============

describe('setSessionHostTab 权威回填', () => {
  test('number tabId：覆盖发起时的乐观值', async () => {
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = 100;
    pc.markSessionHostTab('s1');
    pc.setSessionHostTab('s1', 200);
    expect(pc.getSessionHostTab('s1')).toBe(200);
  });

  test('非 number（权威源暂无值）：删除乐观值 → 判定方保守弹', async () => {
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = 100;
    pc.markSessionHostTab('s1');
    pc.setSessionHostTab('s1', null);
    expect(pc.getSessionHostTab('s1')).toBeNull();
  });

  test('无 sessionId：忽略（不崩、不误伤其他会话）', async () => {
    const stateMod = await import('../../src/side_panel/state.js');
    stateMod.default.currentTabId = 100;
    pc.markSessionHostTab('s2');
    pc.setSessionHostTab(null, 1);
    pc.setSessionHostTab('', 1);
    expect(pc.getSessionHostTab('s2')).toBe(100);
  });
});
