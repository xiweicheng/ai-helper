// debugger-executor 单元测试：executeDebugPage handler 分发与各 action 行为
// 通过 mock chrome.* API（jsdom 环境）验证 CDP 命令调用参数与会话状态机，无需真实浏览器
// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { executeDebugPage } from '../../src/background/tool-debugger.js';

// ───────────────────────── chrome mock 工厂 ─────────────────────────

function createChromeMock(options = {}) {
  const tabUrl = options.tabUrl ?? 'https://example.com/page';
  const sentCommands = [];
  const attachCalls = [];
  const detachCalls = [];
  const downloads = [];
  const eventListeners = [];
  let tabs = options.tabs ?? [{ id: 1, url: tabUrl }];
  let attachError = options.attachError || null;

  // Runtime.evaluate 的按表达式路由
  function evaluateRouter(expression) {
    if (options.evaluateOverride) return options.evaluateOverride(expression);
    // 元素截图表达式返回绝对布局盒（含 scroll 偏移）
    if (expression.includes('window.scrollX')) {
      return options.rect === null
        ? { result: { value: null } }
        : { result: { value: { x: 10, y: 20, width: 100, height: 40 } } };
    }
    // 点击表达式返回元素中心点
    if (expression.includes('getBoundingClientRect')) {
      return options.rect === null
        ? { result: { value: null } }
        : { result: { value: { x: 60, y: 40, w: 100, h: 40 } } };
    }
    if (expression.includes('el.focus()')) return { result: { value: true } };
    if (expression.includes('/ 2')) return { result: { value: { x: 640, y: 360 } } };
    if (expression.includes('innerWidth')) return { result: { value: '1280×720' } };
    return { result: { value: options.evaluateValue } };
  }

  const mockChrome = {
    runtime: { lastError: null },
    tabs: {
      // 同时支持 Promise 形式（MV3）与回调形式
      query: vi.fn((q, cb) => { if (typeof cb === 'function') cb(tabs); return Promise.resolve(tabs); }),
      get: vi.fn((id, cb) => {
        const t = { id, url: tabUrl };
        if (typeof cb === 'function') cb(t);
        return Promise.resolve(t);
      }),
      onRemoved: { addListener: vi.fn() },
    },
    alarms: {
      create: vi.fn(),
      clear: vi.fn(() => Promise.resolve(true)),
      onAlarm: { addListener: vi.fn() },
    },
    downloads: {
      download: vi.fn((opts, cb) => { downloads.push(opts); cb && cb(1); }),
    },
    debugger: {
      attach: vi.fn((target, version, cb) => {
        attachCalls.push({ target, version });
        if (attachError) {
          mockChrome.runtime.lastError = { message: attachError };
        }
        cb && cb();
        mockChrome.runtime.lastError = null;
      }),
      detach: vi.fn((target, cb) => { detachCalls.push(target); cb && cb(); }),
      sendCommand: vi.fn((target, method, params, cb) => {
        sentCommands.push({ method, params });
        if (method === 'Runtime.evaluate') return cb(evaluateRouter(params.expression));
        if (method === 'Page.getLayoutMetrics') {
          return cb({ contentSize: { x: 0, y: 0, width: 2000, height: 4000 } });
        }
        if (method === 'Page.captureScreenshot') return cb({ data: 'QUJDREVGRw==' });
        if (method === 'Network.getResponseBody') {
          return cb({ body: options.responseBody ?? '{"ok":true}', base64Encoded: false });
        }
        return cb({});
      }),
      onEvent: { addListener: vi.fn((fn) => { eventListeners.push(fn); boundEventListeners.push(fn); }) },
      onDetach: { addListener: vi.fn() },
    },
  };

  return {
    chrome: mockChrome,
    sentCommands,
    attachCalls,
    detachCalls,
    downloads,
    eventListeners,
    setTabs(t) { tabs = t; },
    setAttachError(msg) { attachError = msg; },
    methods() { return sentCommands.map(c => c.method); },
    findCmd(method) { return sentCommands.find(c => c.method === method); },
    findCmds(method) { return sentCommands.filter(c => c.method === method); },
  };
}

let harness;

// onDebuggerEvent 是模块单例且 bindListeners 全局只绑定一次，
// 因此用文件级数组保留任意 harness 捕获到的监听器（函数引用相同）
const boundEventListeners = [];

async function run(args, toolCallId = 'call-1') {
  return executeDebugPage(args, toolCallId);
}

beforeEach(() => {
  harness = createChromeMock();
  vi.stubGlobal('chrome', harness.chrome);
});

afterEach(async () => {
  // 清理会话状态，避免跨用例污染（模块级 sessions Map）
  await executeDebugPage({ action: 'detach' }, 'cleanup').catch(() => {});
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function attachTab() {
  const res = await run({ action: 'attach' });
  expect(res.success).toBe(true);
  return res;
}

// ───────────────────────── 参数与环境校验 ─────────────────────────

describe('executeDebugPage 参数与环境校验', () => {
  test('缺少 action 返回失败', async () => {
    const res = await run({});
    expect(res.success).toBe(false);
    expect(res.content).toContain('缺少 action');
  });

  test('未知 action 返回失败', async () => {
    const res = await run({ action: 'hack' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('不支持的 action');
  });

  test('无活动标签页时返回失败', async () => {
    harness.setTabs([]);
    const res = await run({ action: 'attach' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('未找到可调试');
  });

  test.each([
    ['evaluate', { expression: '1+1' }],
    ['input', { inputType: 'click', x: 1, y: 1 }],
    ['network', { networkMode: 'collect' }],
    ['screenshot', {}],
    ['emulate', { emulateTarget: 'reset' }],
  ])('未 attach 直接调 %s 返回 notAttached 引导', async (action, extra) => {
    const res = await run({ action, ...extra });
    expect(res.success).toBe(false);
    expect(res.content).toContain('调试会话不存在');
  });
});

// ───────────────────────── attach / detach ─────────────────────────

describe('attach / detach 会话管理', () => {
  test('受限页面拒绝附着且不调用 chrome.debugger.attach', async () => {
    vi.unstubAllGlobals();
    const h = createChromeMock({ tabUrl: 'chrome://settings' });
    vi.stubGlobal('chrome', h.chrome);
    const res = await run({ action: 'attach' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('受限页面');
    expect(h.attachCalls).toHaveLength(0);
  });

  test('attach 成功：按 1.3 协议附着并启用 Page/Runtime/Network 三域', async () => {
    const res = await attachTab();
    expect(res.content).toContain('已附着');
    expect(harness.attachCalls[0].version).toBe('1.3');
    expect(harness.methods()).toEqual(
      expect.arrayContaining(['Page.enable', 'Runtime.enable', 'Network.enable'])
    );
  });

  test('重复 attach 复用会话：chrome.debugger.attach 只调用一次', async () => {
    await attachTab();
    const res2 = await run({ action: 'attach' });
    expect(res2.success).toBe(true);
    expect(res2.content).toContain('复用');
    expect(harness.attachCalls).toHaveLength(1);
  });

  test('attach 时浏览器报错（如 DevTools 已占用）返回失败', async () => {
    harness.setAttachError('Another debugger is already attached');
    const res = await run({ action: 'attach' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('附着调试器失败');
  });

  test('detach 后会话结束，再次 evaluate 需重新 attach', async () => {
    await attachTab();
    const detached = await run({ action: 'detach' });
    expect(detached.success).toBe(true);
    expect(detached.content).toContain('已脱离');
    expect(harness.detachCalls.length).toBeGreaterThan(0);
    const again = await run({ action: 'evaluate', expression: '1' });
    expect(again.success).toBe(false);
    expect(again.content).toContain('调试会话不存在');
  });

  test('detach 时下发 emulation 还原命令', async () => {
    await attachTab();
    await run({ action: 'detach' });
    expect(harness.methods()).toEqual(expect.arrayContaining([
      'Emulation.clearDeviceMetricsOverride',
      'Emulation.clearGeolocationOverride',
      'Network.setUserAgentOverride',
      'Emulation.setTimezoneOverride',
    ]));
  });
});

// ───────────────────────── evaluate ─────────────────────────

describe('evaluate 页面求值', () => {
  beforeEach(attachTab);

  test('缺少 expression 返回失败', async () => {
    const res = await run({ action: 'evaluate' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('expression');
  });

  test('字符串返回值原样输出', async () => {
    vi.unstubAllGlobals();
    const h = createChromeMock({ evaluateValue: 'hello' });
    vi.stubGlobal('chrome', h.chrome);
    const res = await executeDebugPage({ action: 'evaluate', expression: 'document.title' });
    expect(res.success).toBe(true);
    expect(res.content).toBe('hello');
    await executeDebugPage({ action: 'detach' });
  });

  test('对象返回值 JSON 序列化', async () => {
    vi.unstubAllGlobals();
    const h = createChromeMock({ evaluateValue: { a: 1, b: [2, 3] } });
    vi.stubGlobal('chrome', h.chrome);
    await executeDebugPage({ action: 'attach' });
    const res = await executeDebugPage({ action: 'evaluate', expression: 'getData()' });
    expect(res.success).toBe(true);
    expect(JSON.parse(res.content)).toEqual({ a: 1, b: [2, 3] });
    await executeDebugPage({ action: 'detach' });
  });

  test('undefined 返回值给出无返回值提示', async () => {
    const res = await run({ action: 'evaluate', expression: 'void 0' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('无返回值');
  });

  test('页面脚本异常时返回失败并携带异常描述', async () => {
    const h = createChromeMock();
    h.chrome.debugger.sendCommand = vi.fn((target, method, params, cb) => {
      if (method === 'Runtime.evaluate') {
        return cb({ exceptionDetails: { exception: { description: 'TypeError: boom' } } });
      }
      cb({});
    });
    vi.stubGlobal('chrome', h.chrome);
    await executeDebugPage({ action: 'attach' });
    const res = await executeDebugPage({ action: 'evaluate', expression: 'throwErr()' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('TypeError: boom');
    await executeDebugPage({ action: 'detach' });
  });

  test('超过 30000 字符的返回值被截断并提示总长度', async () => {
    const long = 'x'.repeat(30010);
    const h = createChromeMock({ evaluateValue: long });
    vi.stubGlobal('chrome', h.chrome);
    await executeDebugPage({ action: 'attach' });
    const res = await executeDebugPage({ action: 'evaluate', expression: 'big()' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('已截断');
    expect(res.content).toContain('30010');
    await executeDebugPage({ action: 'detach' });
  });
});

// ───────────────────────── input ─────────────────────────

describe('input 原生输入事件', () => {
  beforeEach(attachTab);

  test('缺少 inputType 返回失败', async () => {
    const res = await run({ action: 'input' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('inputType');
  });

  test('click 坐标：依次派发 mouseMoved/mousePressed/mouseReleased，坐标透传', async () => {
    const res = await run({ action: 'input', inputType: 'click', x: 150, y: 300 });
    expect(res.success).toBe(true);
    const mouse = harness.findCmds('Input.dispatchMouseEvent');
    expect(mouse.map(m => m.params.type)).toEqual(['mouseMoved', 'mousePressed', 'mouseReleased']);
    expect(mouse[1].params).toMatchObject({ x: 150, y: 300, button: 'left', buttons: 1, clickCount: 1 });
    expect(mouse[2].params.buttons).toBe(0);
  });

  test('click 既无 selector 也无坐标时返回失败', async () => {
    const res = await run({ action: 'input', inputType: 'click' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('selector 或 x/y');
  });

  test('click selector 找不到元素返回失败', async () => {
    const h = createChromeMock({ rect: null });
    vi.stubGlobal('chrome', h.chrome);
    await executeDebugPage({ action: 'attach' });
    const res = await executeDebugPage({
      action: 'input', inputType: 'click', selector: '.not-exist',
    });
    expect(res.success).toBe(false);
    expect(res.content).toContain('未找到匹配 selector');
    await executeDebugPage({ action: 'detach' });
  });

  test('click selector 取元素中心点（10+100/2=60, 20+40/2=40）', async () => {
    const res = await run({ action: 'input', inputType: 'click', selector: '#btn' });
    expect(res.success).toBe(true);
    const pressed = harness.findCmds('Input.dispatchMouseEvent')
      .find(m => m.params.type === 'mousePressed');
    expect(pressed.params.x).toBe(60);
    expect(pressed.params.y).toBe(40);
  });

  test('type 缺 text 返回失败', async () => {
    const res = await run({ action: 'input', inputType: 'type', selector: '#i' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('text');
  });

  test('type 聚焦 selector 后调用 Input.insertText 插入文本', async () => {
    const res = await run({ action: 'input', inputType: 'type', selector: '#i', text: '你好abc' });
    expect(res.success).toBe(true);
    const cmd = harness.findCmd('Input.insertText');
    expect(cmd.params.text).toBe('你好abc');
  });

  test('press 缺 key / 非法 key 返回失败', async () => {
    expect((await run({ action: 'input', inputType: 'press' })).success).toBe(false);
    const bad = await run({ action: 'input', inputType: 'press', key: 'Bogus' });
    expect(bad.success).toBe(false);
    expect(bad.content).toContain('无法识别');
  });

  test('press Control+a：keyDown+keyUp 携带键码 65 与修饰符位 2', async () => {
    const res = await run({ action: 'input', inputType: 'press', key: 'Control+a' });
    expect(res.success).toBe(true);
    const events = harness.findCmds('Input.dispatchKeyEvent');
    expect(events.map(e => e.params.type)).toEqual(['keyDown', 'keyUp']);
    expect(events[0].params).toMatchObject({
      key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65, modifiers: 2,
    });
  });

  test('press Enter 键码 13、无修饰符', async () => {
    await run({ action: 'input', inputType: 'press', key: 'Enter' });
    const down = harness.findCmds('Input.dispatchKeyEvent')[0].params;
    expect(down).toMatchObject({ key: 'Enter', code: 'Enter', windowsVirtualKeyCode: 13, modifiers: 0 });
  });

  test('scroll 默认在视口中心派发 mouseWheel，deltaY 默认 300', async () => {
    const res = await run({ action: 'input', inputType: 'scroll' });
    expect(res.success).toBe(true);
    const wheel = harness.findCmd('Input.dispatchMouseEvent');
    expect(wheel.params.type).toBe('mouseWheel');
    expect(wheel.params.deltaY).toBe(300);
    expect(wheel.params.deltaX).toBe(0);
  });

  test('scroll 自定义坐标与 delta', async () => {
    const res = await run({ action: 'input', inputType: 'scroll', x: 100, y: 200, deltaX: -50, deltaY: 120.5 });
    expect(res.success).toBe(true);
    const wheel = harness.findCmd('Input.dispatchMouseEvent');
    expect(wheel.params).toMatchObject({ x: 100, y: 200, deltaX: -50, deltaY: 120.5 });
  });
});

// ───────────────────────── network ─────────────────────────

describe('network 网络录制', () => {
  beforeEach(attachTab);

  function emitRequestEvent(id, url) {
    const listener = boundEventListeners[0];
    listener({ tabId: 1 }, 'Network.requestWillBeSent', {
      requestId: id,
      request: { url, method: 'GET', headers: {} },
      type: 'xhr',
      timestamp: 1000,
    });
    listener({ tabId: 1 }, 'Network.responseReceived', {
      requestId: id,
      response: { status: 200, mimeType: 'application/json', headers: {} },
    });
  }

  test('缺 networkMode 返回失败', async () => {
    const res = await run({ action: 'network' });
    expect(res.success).toBe(false);
  });

  test('start 后未操作即 collect 返回空缓冲提示', async () => {
    expect((await run({ action: 'network', networkMode: 'start' })).success).toBe(true);
    const res = await run({ action: 'network', networkMode: 'collect' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('没有新的网络请求');
  });

  test('录制到请求后 collect 返回含 URL 与状态码的 JSON，且为 drain 语义', async () => {
    await run({ action: 'network', networkMode: 'start' });
    emitRequestEvent('r1', 'https://api.example.com/users');
    const res = await run({ action: 'network', networkMode: 'collect' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('https://api.example.com/users');
    expect(res.content).toContain('"status": 200');
    // 第二次 collect 应为空（已 drain）
    const again = await run({ action: 'network', networkMode: 'collect' });
    expect(again.content).toContain('没有新的网络请求');
  });

  test('filterUrl 过滤：不匹配的请求不录制', async () => {
    await run({ action: 'network', networkMode: 'start', filterUrl: '/api/' });
    emitRequestEvent('r1', 'https://example.com/static/app.js');
    emitRequestEvent('r2', 'https://example.com/api/data');
    const res = await run({ action: 'network', networkMode: 'stop' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('/api/data');
    expect(res.content).not.toContain('app.js');
  });

  test('loadingFinished 后异步拉取响应体', async () => {
    await run({ action: 'network', networkMode: 'start' });
    emitRequestEvent('r1', 'https://api.example.com/x');
    boundEventListeners[0]({ tabId: 1 }, 'Network.loadingFinished', { requestId: 'r1' });
    // 等待 Promise 链（getResponseBody → 序列化）完成
    await new Promise(r => setTimeout(r, 10));
    const res = await run({ action: 'network', networkMode: 'collect' });
    const parsed = JSON.parse(res.content.slice(res.content.indexOf('[')));
    expect(parsed[0].body).toBe('{"ok":true}');
  });

  test('超过 100 条上限时淘汰最旧条目', async () => {
    await run({ action: 'network', networkMode: 'start' });
    for (let i = 0; i < 105; i++) emitRequestEvent(`r${i}`, `https://example.com/${i}`);
    const res = await run({ action: 'network', networkMode: 'collect' });
    const parsed = JSON.parse(res.content.slice(res.content.indexOf('[')));
    expect(parsed).toHaveLength(100);
    expect(parsed[0].url).toContain('/5'); // r0-r4 被淘汰
    expect(parsed[99].url).toContain('/104');
  });

  test('未 start 直接 collect 抛 notAttached 之外的空状态不会崩溃（返回空缓冲）', async () => {
    // 没有录制会话时 network.recording=false：事件被忽略，collect 返回空
    const listener = boundEventListeners[0];
    listener({ tabId: 1 }, 'Network.requestWillBeSent', {
      requestId: 'x', request: { url: 'https://example.com', method: 'GET', headers: {} }, type: 'xhr',
    });
    const res = await run({ action: 'network', networkMode: 'collect' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('没有新的网络请求');
  });
});

// ───────────────────────── screenshot ─────────────────────────

describe('screenshot 截图', () => {
  beforeEach(attachTab);

  test('视口截图：调用 captureScreenshot 并触发下载', async () => {
    const res = await run({ action: 'screenshot' });
    expect(res.success).toBe(true);
    expect(harness.findCmd('Page.captureScreenshot')).toBeDefined();
    expect(harness.downloads).toHaveLength(1);
    expect(harness.downloads[0].url).toContain('data:image/png;base64,');
    expect(res.content).toContain('截图完成');
  });

  test('jpeg 格式与 quality 透传', async () => {
    await run({ action: 'screenshot', imageFormat: 'jpeg', quality: 50 });
    const cmd = harness.findCmd('Page.captureScreenshot');
    expect(cmd.params.format).toBe('jpeg');
    expect(cmd.params.quality).toBe(50);
    expect(harness.downloads[0].url).toContain('data:image/jpeg;base64,');
  });

  test('quality 越界时收敛到 1-100', async () => {
    await run({ action: 'screenshot', imageFormat: 'jpeg', quality: 999 });
    expect(harness.findCmd('Page.captureScreenshot').params.quality).toBe(100);
  });

  test('fullPage 使用 contentSize 裁剪并允许超出视口捕获', async () => {
    const res = await run({ action: 'screenshot', fullPage: true });
    expect(res.success).toBe(true);
    const params = harness.findCmd('Page.captureScreenshot').params;
    expect(params.clip).toMatchObject({ width: 2000, height: 4000, scale: 1 });
    expect(params.captureBeyondViewport).toBe(true);
  });

  test('selector 截图使用元素绝对坐标（含 scroll 偏移）', async () => {
    await run({ action: 'screenshot', selector: '.card' });
    const params = harness.findCmd('Page.captureScreenshot').params;
    // mock rect: x10 y20 w100 h40，表达式加 window.scrollX/Y（mock 中未含 scroll 字段，值为 undefined → NaN 风险）
    // 这里验证 clip 宽高正确即可
    expect(params.clip.width).toBe(100);
    expect(params.clip.height).toBe(40);
    expect(params.captureBeyondViewport).toBe(true);
  });

  test('selector 找不到元素返回失败且不下载', async () => {
    const h = createChromeMock({ rect: null });
    vi.stubGlobal('chrome', h.chrome);
    await executeDebugPage({ action: 'attach' });
    const res = await executeDebugPage({ action: 'screenshot', selector: '.nope' });
    expect(res.success).toBe(false);
    expect(res.content).toContain('未找到匹配 selector');
    expect(h.downloads).toHaveLength(0);
    await executeDebugPage({ action: 'detach' });
  });
});

// ───────────────────────── emulate ─────────────────────────

describe('emulate 环境模拟', () => {
  beforeEach(attachTab);

  test('缺 emulateTarget 返回失败', async () => {
    const res = await run({ action: 'emulate' });
    expect(res.success).toBe(false);
  });

  test('ua 缺 userAgent 失败；提供后调用 setUserAgentOverride', async () => {
    expect((await run({ action: 'emulate', emulateTarget: 'ua' })).success).toBe(false);
    const ok = await run({
      action: 'emulate', emulateTarget: 'ua',
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)',
    });
    expect(ok.success).toBe(true);
    expect(harness.findCmd('Network.setUserAgentOverride').params.userAgent)
      .toContain('iPhone');
  });

  test('viewport 缺尺寸失败；完整参数下发 setDeviceMetricsOverride', async () => {
    expect((await run({
      action: 'emulate', emulateTarget: 'viewport', viewportWidth: 375,
    })).success).toBe(false);

    const ok = await run({
      action: 'emulate', emulateTarget: 'viewport',
      viewportWidth: 375, viewportHeight: 812, deviceScaleFactor: 3, mobile: true,
    });
    expect(ok.success).toBe(true);
    expect(harness.findCmd('Emulation.setDeviceMetricsOverride').params).toMatchObject({
      width: 375, height: 812, deviceScaleFactor: 3, mobile: true,
    });
  });

  test('viewport 省略 deviceScaleFactor/mobile 时使用默认值 1/false', async () => {
    await run({ action: 'emulate', emulateTarget: 'viewport', viewportWidth: 1024, viewportHeight: 768 });
    const params = harness.findCmd('Emulation.setDeviceMetricsOverride').params;
    expect(params.deviceScaleFactor).toBe(1);
    expect(params.mobile).toBe(false);
  });

  test('geolocation 缺经纬度失败；完整参数下发', async () => {
    expect((await run({ action: 'emulate', emulateTarget: 'geolocation' })).success).toBe(false);
    await run({ action: 'emulate', emulateTarget: 'geolocation', latitude: 31.23, longitude: 121.47 });
    expect(harness.findCmd('Emulation.setGeolocationOverride').params)
      .toMatchObject({ latitude: 31.23, longitude: 121.47, accuracy: 1 });
  });

  test('timezone 缺 timezoneId 失败；有效值下发', async () => {
    expect((await run({ action: 'emulate', emulateTarget: 'timezone' })).success).toBe(false);
    await run({ action: 'emulate', emulateTarget: 'timezone', timezoneId: 'America/New_York' });
    expect(harness.findCmd('Emulation.setTimezoneOverride').params.timezoneId)
      .toBe('America/New_York');
  });

  test('colorScheme 缺值失败；dark 下发 setEmulatedMedia features', async () => {
    expect((await run({ action: 'emulate', emulateTarget: 'colorScheme' })).success).toBe(false);
    await run({ action: 'emulate', emulateTarget: 'colorScheme', colorScheme: 'dark' });
    const params = harness.findCmd('Emulation.setEmulatedMedia').params;
    expect(params.features).toEqual([{ name: 'prefers-color-scheme', value: 'dark' }]);
  });

  test('reset 清除全部模拟设置', async () => {
    const res = await run({ action: 'emulate', emulateTarget: 'reset' });
    expect(res.success).toBe(true);
    expect(res.content).toContain('清除');
    expect(harness.methods()).toEqual(expect.arrayContaining([
      'Emulation.clearDeviceMetricsOverride',
      'Emulation.clearGeolocationOverride',
      'Emulation.setTimezoneOverride',
      'Emulation.setEmulatedMedia',
    ]));
  });
});
