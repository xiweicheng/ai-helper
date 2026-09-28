// @vitest-environment jsdom
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

// 隔离重依赖：配置管理器与工具栏模块（confirmImport 内仅做页面刷新，测试不关心）
vi.mock('../../src/options/config-manager.js', () => ({
  loadConfig: (cb) => { if (cb) cb(); },
}));
vi.mock('../../src/options/toolbar-config.js', () => ({
  loadToolbarTools: () => Promise.resolve(),
  loadBlockedDomainsUI: () => {},
}));

import { confirmImport } from '../../src/options/config-io.js';

// ===== chrome.storage.local 内存 mock =====
let store = {};

function mockStorage(initial = {}) {
  store = { ...initial };
  vi.stubGlobal('chrome', {
    storage: {
      local: {
        get: (keys) => {
          const list = Array.isArray(keys) ? keys : Object.keys(store);
          const result = {};
          for (const k of list) {
            if (store[k] !== undefined) result[k] = store[k];
          }
          return Promise.resolve(result);
        },
        set: (obj, cb) => {
          Object.assign(store, obj);
          if (typeof cb === 'function') cb();
          return Promise.resolve();
        },
      },
    },
  });
}

function setupDom(importData, { replace = false } = {}) {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    <div id="importConfigModal"></div>
    <input type="radio" name="importStrategy" id="importStrategyReplace"${replace ? ' checked' : ''}>
    <input type="radio" name="importStrategy" id="importStrategyMerge"${replace ? '' : ' checked'}>
  `;
  document.getElementById('importConfigModal').dataset.importData = JSON.stringify(importData);
}

beforeEach(() => {
  mockStorage();
  // showToast 依赖 rAF：改为同步执行，避免时序不确定性
  vi.stubGlobal('requestAnimationFrame', (cb) => { cb(); return 0; });
});

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

const localProfiles = [
  { id: 'a', name: 'A', apiBase: 'https://a.example.com', apiKey: 'sk-a', modelName: 'm-a', models: [{ name: 'm-a', contextWindow: 0 }], createdAt: 1, updatedAt: 100 },
  { id: 'b', name: 'B', apiBase: 'https://b.example.com', apiKey: 'sk-b', modelName: 'm-b', models: [{ name: 'm-b', contextWindow: 0 }], createdAt: 1, updatedAt: 200 },
];

function mockLocal() {
  mockStorage({
    modelProfiles: localProfiles,
    activeProfileId: 'b',
    apiBase: 'https://b.example.com',
    apiKey: 'sk-b',
    modelName: 'm-b',
    customModels: [{ name: 'm-b', contextWindow: 0 }],
  });
}

describe('confirmImport（厂商配置合并导入）', () => {
  test('merge：新 ID 追加、同 ID 较新覆盖、较旧忽略，并重投影扁平键', async () => {
    mockLocal();
    setupDom({
      version: 1,
      includeSecrets: true,
      config: {
        modelProfiles: [
          { id: 'b', name: 'B-new', apiBase: 'https://b2.example.com', apiKey: 'sk-b2', modelName: 'm-b2', models: [{ name: 'm-b2', contextWindow: 0 }], updatedAt: 300 },
          { id: 'a', name: 'A-old', apiBase: 'https://a-old.example.com', apiKey: 'sk-a-old', modelName: 'm-a-old', models: [], updatedAt: 50 },
          { id: 'c', name: 'C', apiBase: 'https://c.example.com', apiKey: 'sk-c', modelName: 'm-c', models: [{ name: 'm-c', contextWindow: 5 }], updatedAt: 10 },
        ],
        activeProfileId: 'c',
        apiBase: 'https://c.example.com',
        apiKey: 'sk-c',
        modelName: 'm-c',
        customModels: [{ name: 'm-c', contextWindow: 5 }],
      },
    });

    await confirmImport();

    expect(store.modelProfiles.map(p => p.name)).toEqual(['A', 'B-new', 'C']);
    expect(store.activeProfileId).toBe('c');
    // 重投影：扁平键 = 合并后激活配置（文件新增的 C）
    expect(store.apiBase).toBe('https://c.example.com');
    expect(store.modelName).toBe('m-c');
    expect(store.customModels).toEqual([{ name: 'm-c', contextWindow: 5 }]);
  });

  test('merge：本机激活条被忽略时，扁平键重投影回本机内容而非文件旧值', async () => {
    mockLocal();
    setupDom({
      version: 1,
      includeSecrets: true,
      config: {
        modelProfiles: [
          { id: 'a', name: 'A-old', apiBase: 'https://a-old.example.com', apiKey: 'sk-a-old', modelName: 'm-a-old', models: [], updatedAt: 50 },
        ],
        activeProfileId: 'a',
        apiBase: 'https://a-old.example.com',
        apiKey: 'sk-a-old',
        modelName: 'm-a-old',
        customModels: [],
      },
    });

    await confirmImport();

    expect(store.modelProfiles.map(p => p.name)).toEqual(['A', 'B']);
    expect(store.activeProfileId).toBe('a');
    expect(store.apiBase).toBe('https://a.example.com');
    expect(store.apiKey).toBe('sk-a');
    expect(store.modelName).toBe('m-a');
  });

  test('merge：同 ID 覆盖且文件不含密钥时，继承本机 apiKey', async () => {
    mockLocal();
    setupDom({
      version: 1,
      includeSecrets: false,
      config: {
        modelProfiles: [
          { id: 'b', name: 'B-new', apiBase: 'https://b2.example.com', apiKey: '', modelName: 'm-b2', models: [{ name: 'm-b2', contextWindow: 0 }], updatedAt: 300 },
        ],
        activeProfileId: 'b',
        apiBase: 'https://b2.example.com',
        apiKey: '',
        modelName: 'm-b2',
        customModels: [{ name: 'm-b2', contextWindow: 0 }],
      },
    });

    await confirmImport();

    expect(store.modelProfiles.find(p => p.id === 'b').apiKey).toBe('sk-b');
    expect(store.modelProfiles.find(p => p.id === 'b').name).toBe('B-new');
  });

  test('无 modelProfiles 的老格式：用扁平键回写激活配置（兼容路径）', async () => {
    mockLocal();
    setupDom({
      apiBase: 'https://legacy.example.com',
      apiKey: 'sk-legacy',
      modelName: 'm-legacy',
      customModels: ['m-legacy'],
    });

    await confirmImport();

    const active = store.modelProfiles.find(p => p.id === 'b');
    expect(active.apiBase).toBe('https://legacy.example.com');
    expect(active.apiKey).toBe('sk-legacy');
    expect(active.models).toEqual([{ name: 'm-legacy', contextWindow: 0 }]);
  });

  test('replace：整体替换厂商配置（不走按 ID 合并）', async () => {
    mockLocal();
    setupDom({
      version: 1,
      includeSecrets: true,
      config: {
        modelProfiles: [
          { id: 'x', name: 'X', apiBase: 'https://x.example.com', apiKey: 'sk-x', modelName: 'm-x', models: [], updatedAt: 1 },
        ],
        activeProfileId: 'x',
        apiBase: 'https://x.example.com',
        apiKey: 'sk-x',
        modelName: 'm-x',
        customModels: [],
      },
    }, { replace: true });

    await confirmImport();

    expect(store.modelProfiles.map(p => p.name)).toEqual(['X']);
    expect(store.activeProfileId).toBe('x');
  });
});
