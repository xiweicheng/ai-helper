// @vitest-environment jsdom
// panel-visibility 单元测试：isPanelVisibleToUser 按「发起实例」判定的各分支
//
// 判定数据 = 实例身份（keepalive 上报的 {windowId, hostTabId}）+ index.js 注入的
// 内存镜像（浏览器焦点 / 聚焦窗口 / 各窗口活跃 tab / 作用域）。
// 信息缺失、陈旧或未接线时一律按“不可见”处理（宁可多弹不漏弹）。
import { describe, test, expect, beforeEach, vi } from 'vitest';

// 身份数据由测试直接控制（state.js 的 getKeepaliveIdentity 读取真实 Map，mock 掉更可控）
let identity = null;
vi.mock('../../src/background/state.js', () => ({
  getKeepaliveIdentity: vi.fn(() => identity),
}));

let pv;
beforeEach(async () => {
  identity = null;
  vi.resetModules();
  pv = await import('../../src/background/panel-visibility.js');
});

/** 注入一组默认全“可见”的镜像读取器，按用例覆盖单项 */
function init(overrides = {}) {
  pv.initPanelVisibility({
    isBrowserFocused: () => true,
    getFocusedWindowId: () => 1,
    getActiveTabId: () => 10,
    getScope: () => 'global',
    ...overrides,
  });
}

describe('isPanelVisibleToUser', () => {
  test('未接线（initPanelVisibility 未调用）：一律不可见（保守弹）', () => {
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('无 sessionId：不可见', () => {
    init();
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser(null)).toBe(false);
    expect(pv.isPanelVisibleToUser(undefined)).toBe(false);
  });

  test('无身份记录（定时任务无面板连接 / SW 重启竞态）：不可见', () => {
    init();
    identity = null;
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('身份 windowId 缺失（上报查询失败）：不可见', () => {
    init();
    identity = { hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('浏览器未处于 OS 焦点（用户在别的应用）：不可见', () => {
    init({ isBrowserFocused: () => false });
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('发起实例窗口 != 当前聚焦窗口（多窗口互不误判）：不可见', () => {
    init({ getFocusedWindowId: () => 2 });
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('全局模式 + 实例窗口聚焦：可见（无需匹配 tab）', () => {
    init({ getScope: () => 'global', getActiveTabId: () => 99 });
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(true);
  });

  test('tab 绑定模式 + 宿主 tab 仍是该窗口活跃 tab：可见', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 10 });
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(true);
  });

  test('tab 绑定模式 + 用户已切到其他 tab：不可见', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 99 });
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('tab 绑定模式 + hostTabId 为 null（结构变化后身份半缺失）：不可见', () => {
    init({ getScope: () => 'tab-specific' });
    identity = { windowId: 1, hostTabId: null };
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });

  test('tab 绑定模式 + 活跃 tab 查询不到（镜像缺失）：不可见', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => null });
    identity = { windowId: 1, hostTabId: 10 };
    expect(pv.isPanelVisibleToUser('s1')).toBe(false);
  });
});

describe('isPanelVisibleToUser 快照路径（与 keepalive 身份删除竞速解耦）', () => {
  test('身份已删（端口先断）但快照存在：按快照判定（修复的核心竞速场景）', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 99 });
    identity = null; // cleanupCallApi 已删除身份，notification 消息后到
    const snap = { windowId: 1, hostTabId: 10, scope: 'tab-specific', panelHidden: false };
    // 用户已切到 tab 99 → 面板不可见 → false（弹通知）
    expect(pv.isPanelVisibleToUser('s1', snap)).toBe(false);
  });

  test('身份已删 + 快照宿主 tab 仍活跃：可见（不打扰）', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 10 });
    identity = null;
    const snap = { windowId: 1, hostTabId: 10, scope: 'tab-specific', panelHidden: false };
    expect(pv.isPanelVisibleToUser('s1', snap)).toBe(true);
  });

  test('身份在/不在：同一快照判定结果一致（消除“有时弹有时不弹”）', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 99 });
    const snap = { windowId: 1, hostTabId: 10, scope: 'tab-specific', panelHidden: false };
    identity = null;
    const whenDeleted = pv.isPanelVisibleToUser('s1', snap);
    identity = { windowId: 1, hostTabId: 10 };
    const whenAlive = pv.isPanelVisibleToUser('s1', snap);
    expect(whenDeleted).toBe(whenAlive);
    expect(whenDeleted).toBe(false);
  });

  test('快照 panelHidden=true：强制不可见（保守弹）', () => {
    init(); // 默认全域可见镜像
    const snap = { windowId: 1, hostTabId: 10, scope: 'global', panelHidden: true };
    expect(pv.isPanelVisibleToUser('s1', snap)).toBe(false);
  });

  test('快照 scope 优先于实时镜像（发起时刻语义）', () => {
    // 实时镜像为 tab-specific 且活跃 tab 不匹配；快照说发起时是 global → 按 global 判可见
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 99 });
    const snap = { windowId: 1, hostTabId: 10, scope: 'global', panelHidden: false };
    expect(pv.isPanelVisibleToUser('s1', snap)).toBe(true);
  });

  test('快照 scope 非法值：回退实时镜像', () => {
    init({ getScope: () => 'tab-specific', getActiveTabId: () => 99 });
    const snap = { windowId: 1, hostTabId: 10, scope: 'bogus', panelHidden: false };
    expect(pv.isPanelVisibleToUser('s1', snap)).toBe(false); // tab-specific：host 10 != 99
  });

  test('快照 windowId 缺失：不可见（保守弹）', () => {
    init();
    expect(pv.isPanelVisibleToUser('s1', { hostTabId: 10, scope: 'global' })).toBe(false);
  });

  test('快照与身份都缺：不可见', () => {
    init();
    identity = null;
    expect(pv.isPanelVisibleToUser('s1', null)).toBe(false);
  });

  test('快照窗口 != 聚焦窗口：不可见（多窗口互不误判）', () => {
    init({ getFocusedWindowId: () => 2 });
    const snap = { windowId: 1, hostTabId: 10, scope: 'global', panelHidden: false };
    expect(pv.isPanelVisibleToUser('s1', snap)).toBe(false);
  });
});
