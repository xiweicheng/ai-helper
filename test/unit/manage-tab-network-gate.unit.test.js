// manage-tab-network-gate.unit.test.js - manage_tab(open) 内网拦截接线的回归测试（SEC-03 残余）
//
// 回归背景：fetch_url 已按 B2 语义封了内网闸门，但 manage_tab action=open 把模型的 url
// 直接送进 chrome.tabs.create() —— 带用户 cookie、带窗口、执行 JS，光封 fetch_url 被旁路。
// 本文件钉住四件事（口径与 fetch-url-network-scope.unit.test.js 完全对齐）：
//   1. 公网 http/https 照常开 tab（总闸两档），正常网页任务零回归；
//   2. 内网目标按 B2 四档决策，拒绝时 tabs.create 一次都没调（区别于 fetch 版：
//      开 tab 不可"发了才发现被拦"，必须在 create 之前闸住）；
//   3. 非 http/https scheme（file/chrome/javascript）一律拒绝——本条同时收紧了
//      旧实现"chrome:// 页可直接打开"的既有行为，与 systemPageNotAllowed 意图一致；
//   4. 拒绝文案复用 fetch_url 同一组 i18n 键，含开关位置指引且档位可区分。
import { describe, test, expect, beforeEach, beforeAll, vi } from 'vitest';

const noop = () => {};
let storageValues = {};
let createCalls;
let createLastError;

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        for (const k of Array.isArray(keys) ? keys : [keys]) {
          if (storageValues[k] !== undefined) result[k] = storageValues[k];
        }
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: (obj, cb) => { Object.assign(storageValues, obj); if (cb) cb(); },
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: noop,
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: () => Promise.resolve([{ contextType: 'SIDE_PANEL' }]),
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop,
    // create 必须回调（被测代码是回调风格）；记录调用并可注入 lastError
    create: (opts, cb) => {
      createCalls.push(opts);
      chrome.runtime.lastError = createLastError;
      if (cb) cb({ id: 42, url: opts.url });
      chrome.runtime.lastError = null;
      createLastError = null;
    },
    update: noop, remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop, removeListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

vi.mock('../../src/background/local-agent-client.js', () => ({
  execCommand: vi.fn(),
  execCommandWait: vi.fn(),
  createExecWebSocket: vi.fn(),
  stopCommand: vi.fn(),
  isAgentPaired: vi.fn(() => Promise.resolve(false)),
  writeFile: vi.fn(),
  queryAuditLogs: vi.fn(),
  AgentClient: { setAgentReachable: noop },
}));

vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => ({})),
}));

vi.mock('../../src/background/stream-controller.js', () => ({
  sendAgentStream: vi.fn(),
  sendAgentStreamDone: vi.fn(),
}));

let executeOpenTab;
let configModule;

const setNetworkConfig = ({ enabled, hosts }) => {
  configModule.getStoredConfig.mockResolvedValue({
    reactConfig: {
      toolConfirmationEnabled: true,
      toolTimeout: 600000,
      networkAccessEnabled: enabled,
      allowedNetworkHosts: hosts || [],
    },
    streamConfig: { streamEnabled: false },
  });
};

beforeAll(async () => {
  const mod = await import('../../src/background/tool-executor.js');
  executeOpenTab = mod.executeOpenTab;
  configModule = await import('../../src/background/config.js');
});

beforeEach(() => {
  storageValues = {};
  createCalls = [];
  createLastError = null;
});

describe('公网目标不因新增闸门误伤（正常网页任务回归面为零的证据）', () => {
  test('总闸关闭（默认）时公网 https 照常开 tab，url 原样透传', async () => {
    setNetworkConfig({ enabled: false, hosts: [] });
    const r = await executeOpenTab({ url: 'https://example.com/page' }, 'call-1');
    expect(r.success).toBe(true);
    expect(createCalls).toHaveLength(1);
    expect(createCalls[0].url).toBe('https://example.com/page');
  });

  test('总闸开启时公网目标同样放行，且不要求出现在白名单里', async () => {
    setNetworkConfig({ enabled: true, hosts: ['intranet.corp.com'] });
    const r = await executeOpenTab({ url: 'http://example.com' }, 'call-2');
    expect(r.success).toBe(true);
    expect(createCalls).toHaveLength(1);
  });
});

describe('内网/本机目标按 B2 决策，且拒绝时 tabs.create 一次都没调', () => {
  test.each([
    ['IPv4 环回', 'http://127.0.0.1:8080/admin'],
    ['localhost', 'http://localhost:3000/x'],
    ['IPv6 环回', 'http://[::1]:18910/api/shutdown'],
    ['RFC1918', 'http://192.168.1.10/router'],
    ['云元数据', 'http://169.254.169.254/latest/meta-data/'],
    ['CGNAT', 'http://100.64.1.1/x'],
    ['内网约定后缀', 'http://nas.internal/x'],
    ['无点主机名', 'http://router/x'],
  ])('总闸关闭（默认）拒绝任何内网目标：%s', async (_name, url) => {
    setNetworkConfig({ enabled: false, hosts: [] });
    const r = await executeOpenTab({ url }, 'call-off');
    expect(r.success).toBe(false);
    expect(createCalls).toHaveLength(0);
    expect(r.error).toContain('内网地址访问');
  });

  test('总闸关闭 + 白名单非空：仍然拒绝，白名单不生效', async () => {
    setNetworkConfig({ enabled: false, hosts: ['127.0.0.1', 'intranet.corp.com'] });
    const r = await executeOpenTab({ url: 'http://127.0.0.1:18910/api/shutdown' }, 'call-gate');
    expect(r.success).toBe(false);
    expect(createCalls).toHaveLength(0);
    expect(r.error).toContain('未开启');
    expect(r.error).toContain('127.0.0.1');
  });

  test('总闸开启 + 白名单为空：依然拒绝，杜绝"整个内网敞开"的状态', async () => {
    setNetworkConfig({ enabled: true, hosts: [] });
    const r = await executeOpenTab({ url: 'http://127.0.0.1:8080/admin' }, 'call-empty');
    expect(r.success).toBe(false);
    expect(createCalls).toHaveLength(0);
    expect(r.error).toContain('为空');
  });

  test('总闸开启 + 命中白名单：放行开 tab', async () => {
    setNetworkConfig({ enabled: true, hosts: ['127.0.0.1'] });
    const r = await executeOpenTab({ url: 'http://127.0.0.1:18910/api/status' }, 'call-allow');
    expect(r.success).toBe(true);
    expect(createCalls).toHaveLength(1);
  });

  test('总闸开启 + 未命中：拒绝并提示加入允许列表', async () => {
    setNetworkConfig({ enabled: true, hosts: ['192.168.1.10'] });
    const r = await executeOpenTab({ url: 'http://10.0.0.5/x' }, 'call-miss');
    expect(r.success).toBe(false);
    expect(createCalls).toHaveLength(0);
    expect(r.error).toContain('10.0.0.5');
    expect(r.error).toContain('允许列表');
  });

  test('子域通配与条目归一化与 fetch_url 同口径（判定唯一源不另开）', async () => {
    setNetworkConfig({ enabled: true, hosts: ['http://Nas.Corp.Internal:8443/path'] });
    const hit = await executeOpenTab({ url: 'http://nas.corp.internal/api' }, 'call-norm');
    expect(hit.success).toBe(true);
    const bare = await executeOpenTab({ url: 'http://sub.nas.corp.internal/api' }, 'call-norm2');
    expect(bare.success).toBe(false);
  });
});

describe('scheme 收紧（超出"内网"字面范围的附带档，须与 fetch_url 一致）', () => {
  test.each(['file:///etc/passwd', 'chrome://settings', 'javascript:alert(1)', 'ftp://192.168.1.1/x'])(
    '非 http(s) 一律拒绝（即使总闸开启）且不开 tab：%s', async (url) => {
      setNetworkConfig({ enabled: true, hosts: ['127.0.0.1'] });
      const r = await executeOpenTab({ url }, 'call-scheme');
      expect(r.success).toBe(false);
      expect(createCalls).toHaveLength(0);
    });

  test('非 http(s) 的拒绝文案指名被拦协议', async () => {
    setNetworkConfig({ enabled: true, hosts: ['127.0.0.1'] });
    const r = await executeOpenTab({ url: 'file:///etc/passwd' }, 'call-scheme-text');
    expect(r.error).toContain('http/https');
    expect(r.error).toContain('file');
  });

  test('缺失 url 与非法 url 给出明确错误而非静默开空白页', async () => {
    setNetworkConfig({ enabled: false, hosts: [] });
    const missing = await executeOpenTab({}, 'call-no-url');
    expect(missing.success).toBe(false);
    expect(missing.error).toContain('URL');
    expect(createCalls).toHaveLength(0);
    const bad = await executeOpenTab({ url: 'not a url' }, 'call-bad-url');
    expect(bad.success).toBe(false);
    expect(bad.error).toContain('not a url');
    expect(createCalls).toHaveLength(0);
  });
});

describe('接线守卫：闸门必须在 tabs.create 之前', () => {
  test('executeOpenTab 复用 decideNetworkAccess 与 fetch_url 同一判定源', async () => {
    const src = (await import('node:fs')).readFileSync(
      new URL('../../src/background/tool-executor.js', import.meta.url), 'utf8'
    );
    const fnBody = src.slice(src.indexOf('export async function executeOpenTab'));
    const createIdx = fnBody.indexOf('chrome.tabs.create');
    expect(createIdx).toBeGreaterThan(-1);
    const gateIdx = fnBody.indexOf('decideNetworkAccess');
    expect(gateIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeLessThan(createIdx, '闸门判定必须位于 tabs.create 之前');
  });
});
