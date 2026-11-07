// @vitest-environment jsdom
// 配置导出：白名单补齐的用户配置必须随文件带出；
// 「Agent 连接信息」（代理地址 + 配对令牌）必须受「包含 API 密钥」勾选控制，
// 与导出弹窗文案保持一致
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// 隔离重依赖：仅测 collectConfig/落文件链路，页面刷新不在本测试关心范围
vi.mock('../../src/options/config-manager.js', () => ({
  loadConfig: (cb) => { if (cb) cb(); },
}));
vi.mock('../../src/options/toolbar-config.js', () => ({
  loadToolbarTools: () => Promise.resolve(),
  loadBlockedDomainsUI: () => {},
  renderToolbarToolsList: () => {},
}));

import { exportConfig } from '../../src/options/config-io.js';

// ===== chrome.storage.local 内存 mock =====
let store = {};

function mockStorage(initial = {}) {
  store = { ...initial };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (keys, cb) => {
          const list = Array.isArray(keys) ? keys : Object.keys(store);
          const result = {};
          for (const k of list) {
            if (store[k] !== undefined) result[k] = store[k];
          }
          // 兼容回调风格（collectConfig 用 chrome.storage.local.get(null, cb)）
          if (typeof cb === 'function') { cb(result); return; }
          return Promise.resolve(result);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
    },
    runtime: { id: 'test' },
  });
}

// 捕获导出文件内容：拦截 a.click，从 href 反查 createObjectURL 登记的 blob
let captured = null;

function stubDownload() {
  captured = null;
  const blobs = new Map();
  let seq = 0;
  vi.stubGlobal('Blob', class {
    constructor(parts) { this._parts = parts; }
    text() { return Promise.resolve(this._parts.join('')); }
  });
  vi.stubGlobal('URL', Object.assign(Object.create(URL), {
    createObjectURL: (blob) => {
      const url = `blob:export-${++seq}`;
      blobs.set(url, blob);
      return url;
    },
    revokeObjectURL: (url) => { blobs.delete(url); },
  }));
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(async function () {
    const blob = blobs.get(this.href);
    captured = JSON.parse(await blob.text());
  });
}

function setupDom(includeSecrets) {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    <div id="exportConfigModal"></div>
    <input type="checkbox" id="exportIncludeSecrets"${includeSecrets ? ' checked' : ''}>
  `;
}

const FULL_STORE = {
  language: 'en',
  voiceShortcutConfig: { rightAlt: true, rightCtrl: false },
  voiceInputDevice: 'mic-123',
  chatAutoCompaction: true,
  chatPersistSummaryToMemory: false,
  chatMaxMemoryMessages: 12,
  pairedAgents: [
    { id: 'pa_1', name: '家里代理', url: 'ws://192.168.1.10:8787', token: 'tok', pairedAt: 1, disabled: false },
  ],
  activeAgentId: 'pa_1',
  networkAccessEnabled: true,
  allowedNetworkHosts: ['10.0.0.1'],
};

beforeEach(() => {
  mockStorage(FULL_STORE);
  stubDownload();
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('exportConfig（补齐遗漏的用户配置）', () => {
  test('语言 / 语音快捷键 / 语音设备 / 会话压缩与记忆配置随导出带出', async () => {
    setupDom(false);
    await exportConfig();

    expect(captured).toBeTruthy();
    const c = captured.config;
    expect(c.language).toBe('en');
    expect(c.voiceShortcutConfig).toEqual({ rightAlt: true, rightCtrl: false });
    expect(c.voiceInputDevice).toBe('mic-123');
    expect(c.chatAutoCompaction).toBe(true);
    expect(c.chatPersistSummaryToMemory).toBe(false);
    expect(c.chatMaxMemoryMessages).toBe(12);
  });

  test('未勾选密钥时，pairedAgents 的代理地址与令牌一并剥离（与弹窗文案一致）', async () => {
    setupDom(false);
    await exportConfig();

    const agent = captured.config.pairedAgents[0];
    expect(agent.url).toBe('');
    expect(agent.token).toBe('');
    // 非敏感字段保留：配对名/ID 不受影响
    expect(agent.id).toBe('pa_1');
    expect(agent.name).toBe('家里代理');
  });

  test('勾选密钥时，代理地址与令牌原样带出', async () => {
    setupDom(true);
    await exportConfig();

    const agent = captured.config.pairedAgents[0];
    expect(agent.url).toBe('ws://192.168.1.10:8787');
    expect(agent.token).toBe('tok');
  });

  test('内网访问策略仍不参与导出（安全闸门不随文件飘移）', async () => {
    setupDom(true);
    await exportConfig();

    expect('networkAccessEnabled' in captured.config).toBe(false);
    expect('allowedNetworkHosts' in captured.config).toBe(false);
  });
});
