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
let nextStatus = null;   // 非 null 时接管状态接口响应（带 httpStatus），用来测失败态
let statusThrows = false; // true 时状态请求直接报错，用来测网络异常
let nextReindex = { success: true, indexed: 41, total: 41, failedBatches: 0 };
let nextSave = null;   // 非 null 时接管保存响应，用来模拟接口失败
let nextRagStatus = null; // 非 null 时接管代理连接态，用来测门控是否锁住总开关

vi.mock('../../src/options/toolbox-shared.js', () => ({
  agentApi: vi.fn(async (method, path, body) => {
    apiCalls.push({ method, path, body });
    if (method === 'GET' && path === '/api/memory/embedding-config') return { success: true, config: CONFIG };
    if (method === 'GET' && path === '/api/memory/vector-status') {
      if (statusThrows) throw new Error('net::ERR_CONNECTION_REFUSED');
      return nextStatus || { success: true, ...STATUS };
    }
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
  loadRagStatus: vi.fn(async () => nextRagStatus || { connected: true, ragAvailable: true, nodeVersion: 'v22.0.0' }),
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
  nextStatus = null;
  statusThrows = false;
  nextReindex = { success: true, indexed: 41, total: 41, failedBatches: 0 };
  nextSave = null;
  nextRagStatus = null;
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

// 本案的真实事故：状态接口报错时被当成「还没读到」，页面永远转圈。
describe('记忆面板：状态卡必须分得清加载中与读失败', () => {
  const statusText = () => document.getElementById('memoryStatus').textContent;

  test('404（代理版本没有此端点）要提示重启代理，不得仍是「读取中」', async () => {
    nextStatus = { success: false, httpStatus: 404, error: '未知的 API 路径' };
    mod.refreshMemoryPanel();
    await vi.waitFor(() => expect(statusText()).toContain(t('memoryPanel.statusOldAgent')));
    expect(statusText()).not.toContain(t('memoryPanel.statusLoading'));
  });

  test('其他失败把代理返回的真实错误显示出来', async () => {
    nextStatus = { success: false, httpStatus: 400, error: 'memory_read_failed' };
    mod.refreshMemoryPanel();
    await vi.waitFor(() => expect(statusText()).toContain('memory_read_failed'));
    expect(statusText()).toContain(t('memoryPanel.statusFail'));
    expect(statusText()).not.toContain(t('memoryPanel.statusLoading'));
  });

  test('请求抛错（网络断）也是失败态，且不能谎报成加载中', async () => {
    statusThrows = true;
    mod.refreshMemoryPanel();
    await vi.waitFor(() => {
      expect(statusText()).toContain(t('memoryPanel.statusFail'));
      expect(statusText()).toContain('net::ERR_CONNECTION_REFUSED');
    });
    expect(statusText()).not.toContain(t('memoryPanel.statusLoading'));
  });

  test('拉状态失败不影响配置回填（两条请求各自独立降级）', async () => {
    nextStatus = { success: false, httpStatus: 404, error: 'unknown' };
    mod.refreshMemoryPanel();
    await vi.waitFor(() => expect(document.getElementById('memoryModelInput').value).toBe('BAAI/bge-m3'));
  });

  test('成功态照常给出条数与指纹（回归护栏）', async () => {
    expect(statusText()).toContain('41');
    expect(statusText()).toContain('openai-compat|BAAI/bge-m3|1024');
  });
});


// 本案的真实缺陷：总开关是「表单制」——切换只改文案、不落盘，而每次切 Tab/刷新都会 GET 配置回填，
// 未保存的关闭态被代理里的真值盖回去，用户看到的就是「开关控制不了」。
// 收口到仓库既有惯例：change 即持久化，且只发开关那一个字段。
describe('记忆面板：总开关切换即持久化', () => {
  const toggle = () => document.getElementById('memoryEnabled');

  test('关掉开关 → 恰好一次 POST，请求体严格只有 enabled:false（不动其它字段）', async () => {
    expect(toggle().checked).toBe(true, '夹具配置是启用态');
    toggle().click();
    await vi.waitFor(() => {
      const posts = apiCalls.filter(c => c.method === 'POST' && c.path === '/api/memory/embedding-config');
      expect(posts).toHaveLength(1);
    });
    const post = apiCalls.filter(c => c.method === 'POST' && c.path === '/api/memory/embedding-config')[0];
    expect(post.body).toEqual({ enabled: false });
  });

  test('开关落盘不得顺带全量回填配置（会把用户未保存的地址/模型草稿盖掉）', async () => {
    document.getElementById('memoryBaseUrlInput').value = 'https://draft.example.com/v1';
    toggle().click();
    await vi.waitFor(() => expect(toggle().checked).toBe(false));
    const configGets = apiCalls.filter(c => c.method === 'GET' && c.path === '/api/memory/embedding-config');
    expect(configGets).toHaveLength(1, '开关路径只能有 beforeEach 那一次回填，切换后不得再拉');
    expect(document.getElementById('memoryBaseUrlInput').value).toBe('https://draft.example.com/v1');
  });

  test('开关切换后只重拉状态卡（档位会从 remote 变 none，必须跟着收敛）', async () => {
    const before = apiCalls.filter(c => c.method === 'GET' && c.path === '/api/memory/vector-status').length;
    toggle().click();
    await vi.waitFor(() => expect(
      apiCalls.filter(c => c.method === 'GET' && c.path === '/api/memory/vector-status').length).toBeGreaterThan(before
    ));
  });

  test('打开开关对称：发 {enabled:true}，文案切到「已启用」', async () => {
    toggle().click();   // 先关
    await vi.waitFor(() => expect(toggle().disabled).toBe(false));   // 等上一笔写完：在途时开关是锁住的
    toggle().click();   // 再开
    await vi.waitFor(() => expect(document.getElementById('memoryEnabledLabel').textContent).toBe(t('memoryPanel.enabled')));
    const posts = apiCalls.filter(c => c.method === 'POST' && c.path === '/api/memory/embedding-config');
    expect(posts[posts.length - 1].body).toEqual({ enabled: true });
  });

  test('接口失败必须回滚勾选框并报错，不能留下「界面关了、代理还开着」', async () => {
    nextSave = { success: false, error: 'memory_config_write_failed' };
    toggle().click();
    await vi.waitFor(() => {
      expect(toastCalls.some(([m, kind]) => kind === 'error' && m.includes('memory_config_write_failed'))).toBe(true);
    });
    expect(toggle().checked).toBe(true, '失败要回滚到代理里的真值');
    expect(document.getElementById('memoryEnabledLabel').textContent).toBe(t('memoryPanel.enabled'));
  });

  test('写入进行中锁住开关，结束后解锁', async () => {
    toggle().click();
    await vi.waitFor(() => expect(toggle().disabled).toBe(true, '请求在途必须锁住开关'));
    toggle().click();   // 禁用态下的点击不产生第二次请求
    await vi.waitFor(() => expect(toggle().disabled).toBe(false, '写完要解锁，否则用户再也关不掉'));
    expect(apiCalls.filter(c => c.method === 'POST' && c.path === '/api/memory/embedding-config')).toHaveLength(1);
  });

  test('代理未连接时开关本身禁用（原来只锁了三个按钮，开关照样能点）', async () => {
    nextRagStatus = { connected: false, ragAvailable: true, nodeVersion: 'v22.0.0' };
    mod.refreshMemoryPanel();
    await vi.waitFor(() => expect(toggle().disabled).toBe(true));
  });
});
