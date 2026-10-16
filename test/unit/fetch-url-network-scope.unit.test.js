// fetch-url-network-scope.unit.test.js - fetch_url 内网拦截接线的回归测试（SEC-03）
//
// 回归背景：fetch_url 此前只做 `new URL()` 格式校验，模型可被提示词诱导直接打本机/内网。
// 实测确认扩展自身发起的 fetch 不受 Chrome PNA 预检约束，因此拦截只能落在扩展侧。
// 本文件钉住三件事：
//   1. 公网目标不受影响（不因新增判定而误伤正常联网）；
//   2. 内网目标按 B2 语义决策，其中「总闸关闭 + 白名单非空」必须拒绝
//      —— 这一档在代理端既有实现里正是因为没有用例才长期关不掉；
//   3. 拒绝时返回给模型的文案必须可执行（指向具体开关位置），且 fetch 一次都没发出。
import { describe, test, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';

const noop = () => {};
let storageValues = {};

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
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
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
}));

vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => Promise.resolve({ customModelMap: {} })),
}));

vi.mock('../../src/background/stream-controller.js', () => ({
  sendAgentStream: vi.fn(),
  sendAgentStreamDone: vi.fn(),
}));

let executeFetchUrl;
let configModule;
let fetchCalls;

const mockFetch = () => {
  globalThis.fetch = vi.fn(async (url) => {
    fetchCalls.push(url);
    return {
      status: 200,
      statusText: 'OK',
      url,
      text: async () => 'ok-body',
      json: async () => ({ ok: true }),
      headers: { get: () => null },
    };
  });
};

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
  executeFetchUrl = mod.executeFetchUrl;
  configModule = await import('../../src/background/config.js');
});

beforeEach(() => {
  storageValues = {};
  fetchCalls = [];
  mockFetch();
});

afterEach(() => {
  delete globalThis.fetch;
});

describe('公网目标不受内网闸门影响', () => {
  test('总闸关闭时公网 https 照常请求（默认配置不能误伤正常联网）', async () => {
    setNetworkConfig({ enabled: false, hosts: [] });
    const r = await executeFetchUrl({ url: 'https://example.com/api' }, 'call-1');
    expect(r.success).toBe(true);
    expect(fetchCalls).toEqual(['https://example.com/api']);
  });

  test('总闸开启时公网目标同样放行，且不要求出现在白名单里', async () => {
    setNetworkConfig({ enabled: true, hosts: ['intranet.corp.com'] });
    const r = await executeFetchUrl({ url: 'https://example.com/api' }, 'call-2');
    expect(r.success).toBe(true);
  });
});

describe('内网/本机目标的 B2 决策', () => {
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
    const r = await executeFetchUrl({ url }, 'call-off');
    expect(r.success).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(r.error).toContain('内网地址访问');
  });

  test('总闸关闭 + 白名单非空：仍然拒绝，白名单不生效（本档此前在代理端无用例）', async () => {
    setNetworkConfig({ enabled: false, hosts: ['127.0.0.1', 'intranet.corp.com'] });
    const r = await executeFetchUrl({ url: 'http://127.0.0.1:18910/api/shutdown' }, 'call-gate');
    expect(r.success).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(r.error).toContain('未开启');
    expect(r.error).toContain('127.0.0.1');
  });

  test('总闸开启 + 白名单为空：依然拒绝，杜绝存在"整个内网敞开"的状态', async () => {
    setNetworkConfig({ enabled: true, hosts: [] });
    const r = await executeFetchUrl({ url: 'http://127.0.0.1:8080/admin' }, 'call-empty');
    expect(r.success).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(r.error).toContain('为空');
  });

  test('总闸开启 + 命中白名单：放行', async () => {
    setNetworkConfig({ enabled: true, hosts: ['127.0.0.1'] });
    const r = await executeFetchUrl({ url: 'http://127.0.0.1:18910/api/status' }, 'call-allow');
    expect(r.success).toBe(true);
    expect(fetchCalls).toEqual(['http://127.0.0.1:18910/api/status']);
  });

  test('总闸开启 + 白名单里没有这台主机：拒绝并提示加入允许列表', async () => {
    setNetworkConfig({ enabled: true, hosts: ['192.168.1.10'] });
    const r = await executeFetchUrl({ url: 'http://10.0.0.5/x' }, 'call-miss');
    expect(r.success).toBe(false);
    expect(fetchCalls).toHaveLength(0);
    expect(r.error).toContain('10.0.0.5');
    expect(r.error).toContain('允许列表');
  });

  test('子域通配条目放行子域、不放行裸域', async () => {
    setNetworkConfig({ enabled: true, hosts: ['*.corp.internal'] });
    const hit = await executeFetchUrl({ url: 'http://a.corp.internal/x' }, 'call-wild-hit');
    expect(hit.success).toBe(true);
    const bare = await executeFetchUrl({ url: 'http://corp.internal/x' }, 'call-wild-bare');
    expect(bare.success).toBe(false);
  });

  test('白名单条目带协议/端口/路径时按主机名归一后仍能命中', async () => {
    setNetworkConfig({ enabled: true, hosts: ['http://Nas.Corp.Internal:8443/some/path'] });
    const r = await executeFetchUrl({ url: 'http://nas.corp.internal/api' }, 'call-normalize');
    expect(r.success).toBe(true);
  });

  test('POST 到已放行的内网主机不因方法不同而绕过判定（判定只看目标）', async () => {
    setNetworkConfig({ enabled: true, hosts: ['127.0.0.1'] });
    const r = await executeFetchUrl({ url: 'http://127.0.0.1:18910/api/shutdown', method: 'POST', body: '{}' }, 'call-post');
    expect(r.success).toBe(true);
  });
});

describe('协议限制', () => {
  test.each(['file:///etc/passwd', 'ftp://192.168.1.1/x', 'gopher://intranet.corp.com/x'])(
    '非 http(s) 协议一律拒绝（即使总闸开启）：%s', async (url) => {
      setNetworkConfig({ enabled: true, hosts: ['*.*'] });
      const r = await executeFetchUrl({ url }, 'call-scheme');
      expect(r.success).toBe(false);
      expect(fetchCalls).toHaveLength(0);
    });

  test('非 http(s) 的拒绝文案明确只允许 http/https，并指名被拦的协议', async () => {
    setNetworkConfig({ enabled: true, hosts: ['127.0.0.1'] });
    const r = await executeFetchUrl({ url: 'file:///etc/passwd' }, 'call-scheme-text');
    expect(r.error).toContain('http/https');
    expect(r.error).toContain('file');
  });

  test('缺失 url 与非法 url 的既有错误码保持不变', async () => {
    setNetworkConfig({ enabled: false, hosts: [] });
    expect((await executeFetchUrl({}, 'call-no-url')).error).toContain('URL');
    expect((await executeFetchUrl({ url: 'not a url' }, 'call-bad-url')).error).toContain('not a url');
  });
});
