// @vitest-environment jsdom
// test/unit/stream-snapshot.unit.test.js
// 面板侧流式气泡快照（修复「关闭再打开后，脱落期间已输出的内容看不到」）
//
// 现场：接管气泡只能从接管那一刻开始累积正文，之前那半截流（文字 + 工具卡片）
// 在新实例里彻底不存在 —— 用户看到的就是「只剩之后的内容」。
//
// 修法：流式过程中把「气泡 HTML + 本轮累积正文」按 sessionId 节流写进
// chrome.storage.session，新实例接管时读回，并按 callId 确认还是同一轮才还原。
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const KEY = (sessionId) => `streamSnap|${sessionId}`;

// 可控的 chrome.storage.session 假实现：写入即落内存，便于断言「到底写了什么」
function installStorageStub() {
  const store = new Map();
  global.chrome.storage = {
    session: {
      set: vi.fn(async (obj) => {
        for (const [k, v] of Object.entries(obj)) {
          if (v === null || v === undefined) store.delete(k); else store.set(k, v);
        }
      }),
      get: vi.fn(async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of list) if (store.has(k)) out[k] = store.get(k);
        return out;
      }),
      remove: vi.fn(async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) store.delete(k);
      }),
    },
    local: { get: async () => ({}), set: async () => {}, remove: async () => {} },
    onChanged: { addListener: () => {} },
  };
  return store;
}

async function importModule() {
  vi.resetModules();
  return import('../../src/side_panel/stream-snapshot.js');
}

describe('stream-snapshot 面板侧流式气泡快照', () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    store = installStorageStub();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  test('连续多次调度只按节流写一次盘，且落的是最后一次的最新内容', async () => {
    const { scheduleStreamSnapshot, flushStreamSnapshot } = await importModule();
    for (let i = 1; i <= 5; i += 1) {
      const text = `第${i}段`;
      scheduleStreamSnapshot('s1', 'call_1', () => ({ html: `<div class="stream-content">${text}</div>`, accumulated: `累积${i}` }));
    }
    expect(chrome.storage.session.set).not.toHaveBeenCalled();

    await flushStreamSnapshot('s1');
    expect(chrome.storage.session.set).toHaveBeenCalledTimes(1);
    const snap = store.get(KEY('s1'));
    expect(snap.accumulated).toBe('累积5');
    expect(snap.html).toContain('第5段');
    expect(snap.callId).toBe('call_1');
  });

  test('节流窗口到期自动落盘，无需显式 flush', async () => {
    const { scheduleStreamSnapshot, FLUSH_MS } = await importModule();
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>正文</p>', accumulated: '正文' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 10);
    expect(store.get(KEY('s1')).accumulated).toBe('正文');
  });

  test('页面卸载前必须把待落盘快照刷出去（pagehide）', async () => {
    const { scheduleStreamSnapshot } = await importModule();
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>卸载前最后一段</p>', accumulated: '卸载前最后一段' }));
    expect(store.has(KEY('s1'))).toBe(false);

    window.dispatchEvent(new Event('pagehide'));
    await vi.advanceTimersByTimeAsync(0);
    expect(store.get(KEY('s1')).accumulated).toContain('卸载前最后一段');
  });

  test('快照带着 callId 落盘，读回方据此判断是不是同一轮', async () => {
    const { scheduleStreamSnapshot, readStreamSnapshot, FLUSH_MS } = await importModule();
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>旧轮</p>', accumulated: '旧轮' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 10);

    const hit = await readStreamSnapshot('s1');
    expect(hit).toMatchObject({ sessionId: 's1', callId: 'call_1', accumulated: '旧轮' });

    // 会话从来没有过快照
    expect(await readStreamSnapshot('s2')).toBe(null);
  });

  test('超过 TTL 的快照丢弃（隔天再开面板不还原昨天的半截流）', async () => {
    const { scheduleStreamSnapshot, readStreamSnapshot, FLUSH_MS } = await importModule();
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>半截</p>', accumulated: '半截' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 10);
    store.set(KEY('s1'), { ...store.get(KEY('s1')), ts: Date.now() - 31 * 60 * 1000 });
    expect(await readStreamSnapshot('s1')).toBe(null);
  });

  test('HTML 超限时降级为只存正文（不能撑爆 storage.session 配额）', async () => {
    const { scheduleStreamSnapshot, MAX_HTML_BYTES } = await importModule();
    const big = 'x'.repeat(MAX_HTML_BYTES + 1024);
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: big, accumulated: '正文还在' }));
    await vi.advanceTimersByTimeAsync(2000);
    const snap = store.get(KEY('s1'));
    expect(snap.html).toBe('');
    expect(snap.accumulated).toBe('正文还在');
  });

  test('页面切到后台（visibilitychange → hidden）也要立刻刷盘，不能只等 pagehide', async () => {
    // MV3 侧边栏被收起时不保证还能走完 pagehide + 一次异步 storage 写入：
    // 页面一旦进入后台就可能被冻结，节流窗口里那份抓拍就此丢掉。
    // 而「收起面板」正是用户最常做的动作 —— 丢了它等于丢了整个脱落期。
    const { scheduleStreamSnapshot } = await importModule();
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>收起前最后一段</p>', accumulated: '收起前最后一段' }));
    expect(store.has(KEY('s1'))).toBe(false);

    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
    try {
      document.dispatchEvent(new Event('visibilitychange'));
      await vi.advanceTimersByTimeAsync(0);
      expect(store.get(KEY('s1')).accumulated).toContain('收起前最后一段');
    } finally {
      Reflect.deleteProperty(document, 'visibilityState');
    }
  });

  test('上限按 UTF-8 字节算：拿 UTF-16 长度当字节会漏判（中文一个字 3 字节）', async () => {
    const { scheduleStreamSnapshot, flushStreamSnapshot, MAX_HTML_BYTES } = await importModule();
    // 同一个字符串：UTF-16 长度未超限、UTF-8 字节已翻倍超限
    const html = '汉'.repeat(Math.floor(MAX_HTML_BYTES / 2));
    expect(html.length).toBeLessThan(MAX_HTML_BYTES);
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html, accumulated: '中文正文' }));
    await flushStreamSnapshot('s1');

    const snap = store.get(KEY('s1'));
    expect(snap.html).toBe('');
    expect(snap.accumulated).toBe('中文正文');
  });

  test('降级丢掉 HTML 时要留一行日志（工具卡片凭空消失得有个可查的线索）', async () => {
    const mod = await importModule();
    const { logger } = await import('../../src/shared/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const big = 'x'.repeat(mod.MAX_HTML_BYTES + 1024);
    mod.scheduleStreamSnapshot('s1', 'call_1', () => ({ html: big, accumulated: '正文' }));
    await mod.flushStreamSnapshot('s1');

    expect(store.get(KEY('s1')).html).toBe('');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('同一轮流式超限只 warn 一次（节流落盘每 700ms 一次，不刷屏）；新一轮重新计', async () => {
    const mod = await importModule();
    const { logger } = await import('../../src/shared/logger.js');
    const warnSpy = vi.spyOn(logger, 'warn').mockImplementation(() => {});
    const big = 'x'.repeat(mod.MAX_HTML_BYTES + 1024);

    // 同一轮 call_1：连续多次落盘（模拟长流式里的一次次节流抓拍），只留一行日志
    for (let i = 0; i < 5; i += 1) {
      mod.scheduleStreamSnapshot('s1', 'call_1', () => ({ html: big, accumulated: '正文' }));
      await mod.flushStreamSnapshot('s1');
    }
    expect(warnSpy).toHaveBeenCalledTimes(1);

    // 新一轮 call_2：重新计，再留一行
    mod.scheduleStreamSnapshot('s1', 'call_2', () => ({ html: big, accumulated: '正文' }));
    await mod.flushStreamSnapshot('s1');
    expect(warnSpy).toHaveBeenCalledTimes(2);
    warnSpy.mockRestore();
  });

  test('终态清除后读不到（正常会话不留脏快照）', async () => {
    const { scheduleStreamSnapshot, clearStreamSnapshot, readStreamSnapshot, FLUSH_MS } = await importModule();
    scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>done</p>', accumulated: 'done' }));
    await vi.advanceTimersByTimeAsync(FLUSH_MS + 10);
    expect(await readStreamSnapshot('s1')).toBeTruthy();

    await clearStreamSnapshot('s1');
    expect(await readStreamSnapshot('s1')).toBe(null);
  });

  test('没有 storage.session（异常环境）时不得抛错，流式照常跑', async () => {
    const { scheduleStreamSnapshot, readStreamSnapshot } = await importModule();
    delete chrome.storage.session;
    expect(() => scheduleStreamSnapshot('s1', 'call_1', () => ({ html: '<p>x</p>', accumulated: 'x' }))).not.toThrow();
    await vi.advanceTimersByTimeAsync(2000);
    expect(await readStreamSnapshot('s1')).toBe(null);
  });
});

// ==================== 生产接线：流式函数自动抓拍 ====================

describe('chat-streaming 流式函数自动抓拍快照（正常路径与接管路径共用一处）', () => {
  let store;

  beforeEach(() => {
    vi.useFakeTimers();
    store = installStorageStub();
    document.body.innerHTML = '<div id="chatContainer"></div>';
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const buildEl = () => {
    const el = document.createElement('div');
    el.className = 'message-wrapper assistant streaming';
    el.dataset.sessionId = 's1';
    el.dataset.callId = 'call_1';
    el.innerHTML = '<div class="message-content"><div class="stream-content"></div></div>';
    return el;
  };

  test('updateStreamingMessage 写正文后按 sessionId+callId 排一次快照', async () => {
    vi.resetModules();
    const streaming = await import('../../src/side_panel/chat-streaming.js');
    const el = buildEl();

    streaming.setStreamedContent('s1', '脱落期间已经输出的正文');
    streaming.updateStreamingMessage(el, '脱落期间已经输出的正文');
    await vi.advanceTimersByTimeAsync(2000);

    const snap = store.get(KEY('s1'));
    expect(snap.accumulated).toBe('脱落期间已经输出的正文');
    expect(snap.html).toContain('脱落期间已经输出的正文');
    expect(snap.callId).toBe('call_1');
  });

  test('finalizeStreamingMessage 收口即清除快照', async () => {
    vi.resetModules();
    const streaming = await import('../../src/side_panel/chat-streaming.js');
    const el = buildEl();

    streaming.setStreamedContent('s1', '已完成');
    streaming.updateStreamingMessage(el, '已完成');
    await vi.advanceTimersByTimeAsync(2000);
    expect(store.get(KEY('s1'))).toBeTruthy();

    streaming.finalizeStreamingMessage(el, '已完成', []);
    await vi.advanceTimersByTimeAsync(0);
    expect(store.has(KEY('s1'))).toBe(false);
  });
});
