// @vitest-environment jsdom
// network-access-config.unit.test.js - 内网允许列表设置逻辑的回归测试（SEC-03）
//
// 钉住三条约定：
//   1. 条目在进入 storage 前按拦截侧同一份规则清洗（协议/端口/路径都要能粘）；
//   2. 任何列表操作都不写 networkAccessEnabled —— 用户关开关时列表必须原样留着，
//      再打开时不必重新录入；
//   3. 总开关关闭时列表控件只读，但已录入条目仍然可见。
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

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
          if (typeof cb === 'function') cb(result);
          return Promise.resolve(result);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
      onChanged: { addListener: () => {} },
    },
  });
}

import {
  loadNetworkAllowlistUI,
  addNetworkHost,
  removeNetworkHost,
  setNetworkAllowlistVisible,
} from '../../src/options/network-access-config.js';

function setupDom() {
  document.body.innerHTML = `
    <input type="checkbox" id="networkAccessEnabled">
    <input type="text" id="networkHostAddInput">
    <button id="networkHostAddBtn"></button>
    <div id="networkAllowlistWrap" style="display: none;">
      <div id="networkAllowlistList"></div>
    </div>
  `;
}

const listedHosts = () =>
  [...document.querySelectorAll('#networkAllowlistList .domain-blocklist-item-name')].map((el) => el.textContent);

beforeEach(() => {
  mockStorage();
  setupDom();
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

describe('addNetworkHost 条目清洗', () => {
  test('粘贴完整 URL 时归一为小写主机名（与拦截侧同一份清洗规则）', async () => {
    const done = vi.fn();
    addNetworkHost('http://Intranet.Corp.com:8443/some/path', done);
    await Promise.resolve();
    expect(store.allowedNetworkHosts).toEqual(['intranet.corp.com']);
    expect(done).toHaveBeenCalledWith({});
  });

  test('IP 与子域通配条目允许（不沿用域名屏蔽的"必须含点"校验）', async () => {
    addNetworkHost('127.0.0.1', () => {});
    await Promise.resolve();
    addNetworkHost('*.lab.internal', () => {});
    await Promise.resolve();
    expect(store.allowedNetworkHosts).toEqual(['127.0.0.1', '*.lab.internal']);
  });

  test('空条目与含空格条目被拒绝，且不写入 storage', async () => {
    const done = vi.fn();
    addNetworkHost('   ', done);
    await Promise.resolve();
    expect(done.mock.calls[0][0].error).toBeTruthy();
    expect(store.allowedNetworkHosts).toBeUndefined();
  });

  test('重复条目被拒绝，列表不出现两份', async () => {
    mockStorage({ allowedNetworkHosts: ['nas.corp.internal'] });
    const done = vi.fn();
    addNetworkHost('NAS.corp.internal/', done);
    await Promise.resolve();
    expect(done.mock.calls[0][0].error).toBeTruthy();
    expect(store.allowedNetworkHosts).toEqual(['nas.corp.internal']);
  });
});

describe('列表操作不动总开关（关闸不清空、再开不用重写）', () => {
  test('移除主机只写 allowedNetworkHosts，networkAccessEnabled 保持原值', async () => {
    mockStorage({
      networkAccessEnabled: false,
      allowedNetworkHosts: ['127.0.0.1', 'nas.corp.internal'],
    });
    removeNetworkHost('127.0.0.1');
    await Promise.resolve();
    expect(store.allowedNetworkHosts).toEqual(['nas.corp.internal']);
    expect(store.networkAccessEnabled).toBe(false);
  });

  test('添加主机同样不触碰总开关', async () => {
    mockStorage({ networkAccessEnabled: false, allowedNetworkHosts: [] });
    addNetworkHost('10.1.2.3', () => {});
    await Promise.resolve();
    expect(store.networkAccessEnabled).toBe(false);
    expect(store.allowedNetworkHosts).toEqual(['10.1.2.3']);
  });

  test('关闸时整块收起，条目仍保留在库中；开闸后立即可见（不是只读）', async () => {
    mockStorage({ networkAccessEnabled: false, allowedNetworkHosts: ['127.0.0.1', 'nas.corp.internal'] });
    loadNetworkAllowlistUI();
    await Promise.resolve();

    const wrap = document.getElementById('networkAllowlistWrap');
    setNetworkAllowlistVisible(false);
    expect(wrap.style.display).toBe('none');
    // 隐藏不影响数据：开闸后无需重录
    setNetworkAllowlistVisible(true);
    expect(wrap.style.display).toBe('block');
    expect(listedHosts()).toEqual(['127.0.0.1', 'nas.corp.internal']);
    // 隐藏也不是禁用：控件本身始终可用
    expect(document.getElementById('networkHostAddInput').disabled).toBe(false);
    expect(document.getElementById('networkHostAddBtn').disabled).toBe(false);
  });

  test('收起/展开只动 wrap 的 display，不写 storage', async () => {
    mockStorage({ networkAccessEnabled: true, allowedNetworkHosts: ['127.0.0.1'] });
    loadNetworkAllowlistUI();
    await Promise.resolve();
    const before = JSON.stringify(store);

    setNetworkAllowlistVisible(false);
    setNetworkAllowlistVisible(true);
    expect(JSON.stringify(store)).toBe(before);
  });

  test('空列表渲染空态提示而不是空白', async () => {
    loadNetworkAllowlistUI();
    await Promise.resolve();
    expect(document.querySelector('#networkAllowlistList .domain-blocklist-empty')).toBeTruthy();
  });

  test('条目内容做 HTML 转义，避免把录入值当标记执行', async () => {
    mockStorage({ allowedNetworkHosts: ['<img src=x onerror=alert(1)>'] });
    loadNetworkAllowlistUI();
    await Promise.resolve();
    expect(document.querySelector('#networkAllowlistList img')).toBeNull();
    expect(listedHosts()).toEqual(['<img src=x onerror=alert(1)>']);
  });
});
