// 问题②：第一次关面板会弹桌面提醒，第二次关却不弹。
// 根因：提醒挂在 keepalive-<sessionId> 端口的 onDisconnect 上，而这个端口只在
// callApi 内部建立。重开面板靠 reattach 接管，接管实例没有 callApi → 没有端口 →
// 再次关闭时 SW 根本收不到「面板脱离」这件事，自然一声不响。
// 修法：接管实例为会话开一条 panel-observer-<sessionId> 观察端口，SW 侧断开时
// 走与 keepalive 完全相同的「延迟复核 → shouldNotifyPanelDetached → 通知」链路。
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const REATTACH_SRC = readFileSync(
  new URL('../../src/side_panel/chat-reattach.js', import.meta.url), 'utf8'
);
const INDEX_SRC = readFileSync(
  new URL('../../src/background/index.js', import.meta.url), 'utf8'
);
const STATE_SRC = readFileSync(
  new URL('../../src/background/state.js', import.meta.url), 'utf8'
);
const PERSIST_SRC = readFileSync(
  new URL('../../src/background/panel-absent-persist.js', import.meta.url), 'utf8'
);

/** 取 SW 里 panel-observer 那条分支的函数体（到 return 为止），守卫只针对这一条分支 */
function observerBranch(src) {
  const anchor = src.indexOf("startsWith('panel-observer-')");
  expect(anchor, 'index.js 里没有 panel-observer 分支').toBeGreaterThan(-1);
  const ret = src.indexOf('return;', anchor);
  expect(ret).toBeGreaterThan(anchor);
  return src.slice(anchor, ret + 'return;'.length);
}

const makePort = (name) => ({
  name,
  postMessage: vi.fn(),
  disconnect: vi.fn(),
  onMessage: { addListener: vi.fn(), removeListener: vi.fn() },
  onDisconnect: { addListener: vi.fn(), removeListener: vi.fn() },
});

// ==================== 面板侧：观察端口 ====================

describe('openPanelObserverPort 面板侧观察端口', () => {
  let openPanelObserverPort, closePanelObserverPort, isPanelObserverOpen;
  let connectSpy;

  beforeEach(async () => {
    connectSpy = vi.fn(() => makePort('panel-observer-s1'));
    vi.stubGlobal('chrome', { runtime: { connect: connectSpy, lastError: null } });
    const m = await import('../../src/side_panel/panel-observer-port.js');
    openPanelObserverPort = m.openPanelObserverPort;
    closePanelObserverPort = m.closePanelObserverPort;
    isPanelObserverOpen = m.isPanelObserverOpen;
    m.__resetPanelObserverPortsForTest();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('接管会话时按 panel-observer-<sessionId> 命名建立端口', () => {
    openPanelObserverPort('s1');
    expect(connectSpy).toHaveBeenCalledTimes(1);
    expect(connectSpy).toHaveBeenCalledWith({ name: 'panel-observer-s1' });
    expect(isPanelObserverOpen('s1')).toBe(true);
  });

  test('同一会话重复接管只保留一条端口（不会越关越多）', () => {
    openPanelObserverPort('s1');
    openPanelObserverPort('s1');
    expect(connectSpy).toHaveBeenCalledTimes(1);
  });

  test('不同会话各自一条端口', () => {
    openPanelObserverPort('s1');
    openPanelObserverPort('s2');
    expect(connectSpy).toHaveBeenCalledTimes(2);
    expect(isPanelObserverOpen('s1')).toBe(true);
    expect(isPanelObserverOpen('s2')).toBe(true);
  });

  test('缺 sessionId 不建端口', () => {
    openPanelObserverPort('');
    openPanelObserverPort(undefined);
    expect(connectSpy).not.toHaveBeenCalled();
  });

  test('SW 已死 / 上下文失效时 connect 抛错只静默降级，绝不影响接管', () => {
    connectSpy.mockImplementation(() => { throw new Error('Extension context invalidated.'); });
    expect(() => openPanelObserverPort('s1')).not.toThrow();
    expect(isPanelObserverOpen('s1')).toBe(false);
  });

  test('收终态后关闭端口并摘掉引用（不留挂着不放的长连接）', () => {
    const port = openPanelObserverPort('s1');
    closePanelObserverPort('s1');
    expect(port.disconnect).toHaveBeenCalledTimes(1);
    expect(isPanelObserverOpen('s1')).toBe(false);
    // 关掉之后可以重新建（下一次接管）
    openPanelObserverPort('s1');
    expect(connectSpy).toHaveBeenCalledTimes(2);
  });

  test('端口被 Chrome 自己拆掉（onDisconnect）后本地引用一并清掉', () => {
    const port = openPanelObserverPort('s1');
    port.onDisconnect.addListener.mock.calls[0][0]();
    expect(isPanelObserverOpen('s1')).toBe(false);
  });

  test('disconnect 抛错不影响关闭流程', () => {
    const port = openPanelObserverPort('s1');
    port.disconnect.mockImplementation(() => { throw new Error('port gone'); });
    expect(() => closePanelObserverPort('s1')).not.toThrow();
    expect(isPanelObserverOpen('s1')).toBe(false);
  });
});

// ==================== SW 侧：观察端口注册表 ====================

describe('background/state.js observer 端口注册表', () => {
  let bgState;

  beforeEach(async () => {
    vi.stubGlobal('chrome', {
      storage: {
        session: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}), remove: vi.fn(async () => {}) },
        local: { get: vi.fn(async () => ({})), set: vi.fn(async () => {}) },
      },
      runtime: { lastError: null, sendMessage: vi.fn(), getURL: (p) => p },
    });
    bgState = await import('../../src/background/state.js');
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('注册 / 查询 / 注销观察端口', () => {
    const port = makePort('panel-observer-reg-sess');
    expect(bgState.hasPanelObserverPort('reg-sess')).toBe(false);
    bgState.registerPanelObserverPort('reg-sess', port);
    expect(bgState.hasPanelObserverPort('reg-sess')).toBe(true);
    expect(bgState.getPanelObserverPort('reg-sess')).toBe(port);
    bgState.unregisterPanelObserverPort('reg-sess', port);
    expect(bgState.hasPanelObserverPort('reg-sess')).toBe(false);
  });

  test('缺参不入表、注销不抛错', () => {
    bgState.registerPanelObserverPort(null, makePort('x'));
    bgState.registerPanelObserverPort('reg-null', null);
    expect(bgState.hasPanelObserverPort('reg-null')).toBe(false);
    expect(() => bgState.unregisterPanelObserverPort(undefined, undefined)).not.toThrow();
  });

  test('只注销自己那条端口：旧端口的断开不能把新端口从表里摘掉', () => {
    const older = makePort('panel-observer-s1');
    const newer = makePort('panel-observer-s1');
    bgState.registerPanelObserverPort('s1', older);
    bgState.registerPanelObserverPort('s1', newer);
    bgState.unregisterPanelObserverPort('s1', older);
    expect(bgState.hasPanelObserverPort('s1')).toBe(true);
    expect(bgState.getPanelObserverPort('s1')).toBe(newer);
    bgState.unregisterPanelObserverPort('s1', newer);
    expect(bgState.hasPanelObserverPort('s1')).toBe(false);
  });

  test('面板在场判定 hasLivePanel：发起端口或观察端口任一存活都算在场', () => {
    // 「还有没有面板看着这个任务」在断开复核上必须两类端口都算：只认 keepalive 的话，
    // 用户重开面板并接管了仍会被判成「面板没重开」，于是一声不响弹个多余的提醒。
    expect(bgState.hasLivePanel('live-sess')).toBe(false);

    const observer = makePort('panel-observer-live-sess');
    bgState.registerPanelObserverPort('live-sess', observer);
    expect(bgState.hasLivePanel('live-sess')).toBe(true);
    bgState.unregisterPanelObserverPort('live-sess', observer);
    expect(bgState.hasLivePanel('live-sess')).toBe(false);

    const keepalive = makePort('keepalive-live-sess');
    bgState.registerKeepalivePort('live-sess', keepalive);
    expect(bgState.hasLivePanel('live-sess')).toBe(true);
    bgState.unregisterKeepalivePort('live-sess', keepalive);
    expect(bgState.hasLivePanel('live-sess')).toBe(false);
  });

  test('观察端口不进 keepalivePorts（否则会把澄清/工具确认这类定向消息抢离发起实例）', () => {
    const port = makePort('panel-observer-s1');
    bgState.registerPanelObserverPort('s1', port);
    expect(bgState.hasKeepalivePort('s1')).toBe(false);
    expect(bgState.getKeepalivePort('s1')).toBe(null);
  });
});

// ==================== 接线守卫（源码正则） ====================

describe('接线守卫：接管实例的观察端口与断开复核', () => {
  test('chat-reattach 接管时开观察端口，收终态/拆镜像时关掉', () => {
    expect(REATTACH_SRC).toMatch(/import\s*\{[^}]*openPanelObserverPort[^}]*\}\s*from\s*'\.\/panel-observer-port\.js'/);
    expect(REATTACH_SRC).toMatch(/openPanelObserverPort\(sessionId\)/);
    expect(REATTACH_SRC).toMatch(/closePanelObserverPort\(sessionId\)/);
  });

  test('index.js 认得 panel-observer- 前缀，并登记进 observer 注册表', () => {
    expect(INDEX_SRC).toMatch(/panel-observer-/);
    expect(INDEX_SRC).toMatch(/import\s*\{[^}]*registerPanelObserverPort[^}]*\}\s*from\s*'\.\/state\.js'/);
    // (?<!un) 是必须的：unregisterPanelObserverPort( 里同样含 registerPanelObserverPort( 子串
    expect(INDEX_SRC).toMatch(/(?<!un)registerPanelObserverPort\(/);
  });

  test('观察端口断开也走同一条延迟复核（不复制第二份判定逻辑）', () => {
    const seg = observerBranch(INDEX_SRC);
    expect(seg).toMatch(/(?<!un)registerPanelObserverPort\(/);
    expect(seg).toMatch(/onDisconnect\.addListener/);
    // 与 keepalive 共用同一个复核入口
    expect(seg).toMatch(/checkPanelDetached\(/);
    expect(INDEX_SRC).toMatch(/PANEL_DETACH_NOTIFY_DELAY_MS/);
    expect(INDEX_SRC).toMatch(/shouldNotifyPanelDetached\(\{/);
  });

  test('复核时「面板是否还在」只看一个合并口径的实现（不在调用点各自拼 OR）', () => {
    const checkIdx = INDEX_SRC.indexOf('function checkPanelDetached');
    expect(checkIdx).toBeGreaterThan(-1);
    const seg = INDEX_SRC.slice(checkIdx, checkIdx + 900);
    expect(seg).toMatch(/hasLivePanel\(sessionId\)/);
    expect(seg).toMatch(/notifyPanelDetached\(\{ sessionId \}\)/);
  });

  test('后台落库兜底刻意只看 keepalive：观察端口不得把它关掉（真机回归过）', () => {
    // 提醒抑制要的是「有没有面板在看」（hasLivePanel）；落库兜底要的是「有没有人一定写得住」。
    // 把两个口径合并过一次：接管实例自己也会落库，但那一次异步写会被刷新/关面板打断，
    // 而后台这笔在广播终态前就写完了 —— 门控一关，真机 verify 探针的「刷新后仍在」直接变 0 次。
    expect(PERSIST_SRC).toMatch(/hasPanel:\s*hasKeepalivePort/);
    expect(PERSIST_SRC).not.toMatch(/hasPanel:\s*hasLivePanel/);
  });

  test('observer 分支不得复用 keepalive 注册（避免抢走定向消息与实例身份上报）', () => {
    const seg = observerBranch(INDEX_SRC);
    expect(seg).not.toMatch(/registerKeepalivePort\(/);
    expect(seg).not.toMatch(/setKeepaliveIdentity\(/);
  });

  test('state.js 的 observer 注册表与 keepalive 注册表是两张表', () => {
    expect(STATE_SRC).toMatch(/const observerPorts\s*=\s*new Map\(\)/);
    expect(STATE_SRC).toMatch(/export function registerPanelObserverPort/);
    expect(STATE_SRC).toMatch(/export function hasPanelObserverPort/);
    expect(STATE_SRC).toMatch(/export function unregisterPanelObserverPort/);
  });
});
