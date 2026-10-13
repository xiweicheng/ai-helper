// @vitest-environment jsdom
// 记忆面板行为钉：显隐规则、提交体的「缺席」语义、陈旧标红、重建走确认。
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { t } from '../../src/shared/i18n.js';

const { apiCalls, toastCalls, confirmCalls } = vi.hoisted(() => ({
  apiCalls: [], toastCalls: [], confirmCalls: []
}));

const CONFIG = {
  enabled: true, mode: 'openai-compat', baseUrl: 'https://api.example.com/v1',
  modelName: 'BAAI/bge-m3', apiKey: '', hasApiKey: true, dimensions: 1024, queryPrefix: ''
};
let STATUS = { indexed: 41, total: 41, storedModelKey: 'openai-compat|BAAI/bge-m3|1024', currentModelKey: 'openai-compat|BAAI/bge-m3|1024', stale: false, tier: 'remote' };
let nextReindex = { success: true, indexed: 41, total: 41, failedBatches: 0 };
let nextSave = null;   // 非 null 时接管保存响应，用来模拟接口失败

vi.mock('../../src/options/toolbox-shared.js', () => ({
  agentApi: vi.fn(async (method, path, body) => {
    apiCalls.push({ method, path, body });
    if (method === 'GET' && path === '/api/memory/embedding-config') return { success: true, config: CONFIG };
    if (method === 'GET' && path === '/api/memory/vector-status') return { success: true, ...STATUS };
    if (method === 'POST' && path === '/api/memory/test-embedding') return { success: true, dimensions: 512 };
    if (method === 'POST' && path === '/api/memory/embedding-config') return nextSave || { success: true, config: { ...CONFIG, ...(body || {}) } };
    if (method === 'POST' && path === '/api/memory/reindex') return nextReindex;
    return { success: false, error: 'unexpected api call' };
  }),
  escapeHtml: (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'),
  showToast: (m, k) => toastCalls.push([m, k]),
  showCustomConfirm: vi.fn(async (m) => { confirmCalls.push(m); return true; })
}));

vi.mock('../../src/options/toolbox-rag.js', () => ({
  loadRagStatus: vi.fn(async () => ({ connected: true, ragAvailable: true, nodeVersion: 'v22.0.0' })),
  refreshRagSection: vi.fn(async () => {}),
  initRagEvents: () => {},
  setRagAvailabilityChangeHandler: () => {}
}));

globalThis.chrome = {
  storage: { local: { get: (k, cb) => { cb({}); }, set: async () => {} }, onChanged: { addListener: () => {} } }
};

const DOM = `<div class="knowledge-header"><input type="checkbox" id="memoryEnabled"><span id="memoryEnabledLabel"></span></div>
<div id="memoryGate" style="display:none;"></div><div id="memoryMain">
<div id="memoryStatus" class="memory-status"></div>
<input type="radio" name="memoryEmbeddingMode" value="openai-compat" id="memModeRemote" checked>
<input type="radio" name="memoryEmbeddingMode" value="local" id="memModeLocal">
<div id="memoryRemoteGroup"><input type="text" id="memoryBaseUrlInput"></div>
<input type="text" id="memoryModelInput">
<div id="memoryApiKeyGroup"><input type="password" id="memoryApiKeyInput"></div>
<div id="memoryDimsGroup"><div id="memoryTestRow"><input type="number" id="memoryDimsInput">
<button id="memoryTestBtn" type="button"></button><span id="memoryTestResult"></span></div></div>
<div id="memoryPrefixGroup"><input type="text" id="memoryPrefixInput"></div>
<div id="memoryLocalNotice" style="display:none;"></div>
<button id="memorySaveBtn" type="button"></button><button id="memoryReindexBtn" type="button"></button>
<div id="memoryResult" style="display:none;"></div></div>`;

let mod;
beforeEach(async () => {
  vi.resetModules();
  apiCalls.length = 0; toastCalls.length = 0; confirmCalls.length = 0;
  STATUS = { ...STATUS, stale: false, storedModelKey: STATUS.currentModelKey };
  nextReindex = { success: true, indexed: 41, total: 41, failedBatches: 0 };
  nextSave = null;
  document.body.innerHTML = DOM;
  mod = await import('../../src/options/memory-panel.js');
  mod.initMemoryPanel();
  mod.refreshMemoryPanel();
  await vi.waitFor(() => expect(apiCalls.filter(c => c.path === '/api/memory/vector-status')).toHaveLength(1));
});

describe('记忆面板：加载与显隐', () => {
  test('进面板并行拉配置与状态，并回填表单', async () => {
    await vi.waitFor(() => expect(document.getElementById('memoryModelInput').value).toBe('BAAI/bge-m3'));
    expect(apiCalls.some(c => c.method === 'GET' && c.path === '/api/memory/embedding-config')).toBe(true);
    expect(document.getElementById('memoryDimsInput').value).toBe('1024');
    expect(document.getElementById('memoryApiKeyInput').value).toBe('', '明文 key 永不回填');
    expect(document.getElementById('memoryEnabled').checked).toBe(true);
  });

  test('切到本地档：隐藏服务地址/key/维度/探活，显示本地说明', async () => {
    document.getElementById('memModeLocal').click();
    await vi.waitFor(() => {
      expect(document.getElementById('memoryTestRow').style.display).toBe('none');
      expect(document.getElementById('memoryRemoteGroup').style.display).toBe('none');
      expect(document.getElementById('memoryApiKeyGroup').style.display).toBe('none');
      expect(document.getElementById('memoryDimsGroup').style.display).toBe('none');
      expect(document.getElementById('memoryLocalNotice').style.display).toBe('');
    });
  });
});

describe('记忆面板：提交体的「缺席」语义', () => {
  test('apiKey 留空 → 请求体里根本没有 apiKey 字段（留空 = 不修改）', async () => {
    document.getElementById('memorySaveBtn').click();
    await vi.waitFor(() => {
      const post = apiCalls.find(c => c.method === 'POST' && c.path === '/api/memory/embedding-config');
      expect(post).toBeTruthy();
      expect('apiKey' in post.body).toBe(false);
    });
  });

  test('本地档保存：隐藏字段一个都不提交，绝不把维度写成 0 污染 modelKey', async () => {
    document.getElementById('memModeLocal').click();
    await vi.waitFor(() => expect(document.getElementById('memoryTestRow').style.display).toBe('none'));
    document.getElementById('memoryModelInput').value = 'Xenova/bge-small-zh-v1.5';
    document.getElementById('memorySaveBtn').click();
    await vi.waitFor(() => {
      const post = apiCalls.find(c => c.method === 'POST' && c.path === '/api/memory/embedding-config');
      expect(post.body).toEqual({ enabled: true, mode: 'local', modelName: 'Xenova/bge-small-zh-v1.5' });
      expect('dimensions' in post.body).toBe(false, '提交 dimensions:0 会让指纹改变并冒报 stale');
      expect('baseUrl' in post.body).toBe(false);
    });
  });

  test('本地档不显示探活按钮，也不发 test-embedding 请求', async () => {
    document.getElementById('memModeLocal').click();
    await vi.waitFor(() => expect(document.getElementById('memoryTestRow').style.display).toBe('none'));
    expect(apiCalls.some(c => c.path === '/api/memory/test-embedding')).toBe(false);
  });

  test('探活成功自动回填维度并提示', async () => {
    document.getElementById('memoryDimsInput').value = '';
    document.getElementById('memoryTestBtn').click();
    await vi.waitFor(() => expect(document.getElementById('memoryDimsInput').value).toBe('512'));
    expect(toastCalls.some(([m]) => m.includes('512'))).toBe(true);
  });
});

describe('记忆面板：陈旧与重建', () => {
  test('stale 为真时状态卡标红并给出重建引导', async () => {
    STATUS = { ...STATUS, stale: true, storedModelKey: 'local|old|512' };
    mod.refreshMemoryPanel();
    await vi.waitFor(() => expect(document.querySelector('#memoryStatus .memory-status-badge.stale')).toBeTruthy());
    expect(document.querySelector('#memoryStatus .memory-status-hint').textContent)
      .toBe(t('memoryPanel.staleHint'));
  });

  test('重建走确认弹窗，结果含超窗与批失败如实展示，并刷新状态', async () => {
    nextReindex = { success: true, indexed: 40, total: 41, failedBatches: 1, overWindow: { count: 13, window: 512, ids: ['fact_a'] } };
    document.getElementById('memoryReindexBtn').click();
    await vi.waitFor(() => expect(confirmCalls).toHaveLength(1));
    expect(confirmCalls[0]).toContain('23');            // 实测耗时必须写进提示，不许含糊
    await vi.waitFor(() => {
      const txt = document.getElementById('memoryResult').textContent;
      expect(txt).toContain('40');
      expect(txt).toContain('13');
      expect(txt).toContain('512');
    });
    expect(apiCalls.some(c => c.method === 'POST' && c.path === '/api/memory/reindex')).toBe(true);
    expect(document.getElementById('memoryReindexBtn').disabled).toBe(false, '结束后恢复按钮');
  });

  test('重建被跳过（向量档未启用）时说明原因而不是报失败', async () => {
    nextReindex = { success: true, skipped: true, reason: 'embedding_disabled' };
    document.getElementById('memoryReindexBtn').click();
    await vi.waitFor(() => expect(document.getElementById('memoryResult').textContent)
      .toContain(t('memoryPanel.reindexSkipped')));
  });

  test('接口失败走 error toast，不清空已填表单', async () => {
    nextSave = { success: false, error: 'invalid_embedding_mode' };
    document.getElementById('memorySaveBtn').click();
    await vi.waitFor(() => {
      expect(toastCalls.some(([m, kind]) => kind === 'error' && m.includes('invalid_embedding_mode'))).toBe(true);
    });
    expect(document.getElementById('memoryModelInput').value).toBe('BAAI/bge-m3', '保存失败不得把表单抹掉');
  });
});
