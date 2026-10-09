// @vitest-environment jsdom
// @ 选择器搜索合并列表（renderMergedAtList）默认选中全局第一项（对齐 / 弹窗行为）：
// 1) 无论命中的首类为助手/网页/知识库/代理，首项都带 selected class 且 state 索引为 0（可直接回车）
// 2) 多类命中时仅全局第一项选中，不会每类各选一个
// 3) 过滤词变更后重新渲染，选中回到新的第一项
// 4) 无命中时显示空态且索引重置为 -1
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};

// 可变数据源：各用例按需覆盖（customAgents / pairedAgents / knowledgeCollections / tabs）
const storeData = {};
let tabsData = [];

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
        list.forEach((k) => {
          if (k in storeData) result[k] = storeData[k];
        });
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      set: noop,
      remove: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg, cb) => {
      // renderMergedAtList 经 background 转发 RAG_LIST_COLLECTIONS
      if (msg && msg.type === 'RAG_LIST_COLLECTIONS' && typeof cb === 'function') {
        cb({ success: true, collections: storeData.knowledgeCollections || [] });
        return Promise.resolve({});
      }
      if (typeof cb === 'function') cb({});
      return Promise.resolve({});
    },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: (q, cb) => {
      if (typeof cb === 'function') {
        cb(tabsData);
        return undefined;
      }
      return Promise.resolve(tabsData);
    },
    get: noop, sendMessage: noop, create: noop, update: noop,
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

// 代理在线探测（pingAgent）在 jsdom 中无真实网络：统一拒绝，避免真实请求
globalThis.fetch = () => Promise.reject(new Error('no-network-in-test'));

let selector;
let state;

beforeAll(async () => {
  selector = await import('../../src/side_panel/agent-at-selector.js');
  state = (await import('../../src/side_panel/state.js')).default;
});

beforeEach(async () => {
  storeData.ragEnabled = true;
  storeData.customAgents = [{ id: 'ag-writer', name: '写作助手', description: '文案写作' }];
  storeData.knowledgeCollections = [{ id: 'kb-1', name: '知识库一', documentCount: 1, chunkCount: 2 }];
  storeData.pairedAgents = [{ id: 'px-1', name: '本地代理一', url: 'http://127.0.0.1:8001' }];
  tabsData = [{ id: 1, title: '示例页面', url: 'https://example.com/', active: true }];

  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div id="agentAtSelector" style="display: none;">
      <div class="prompt-dropdown" id="agentAtDropdown">
        <div id="agentAtList"></div>
        <div id="agentPageList" style="display: none;"></div>
        <div id="agentProxyList" style="display: none;"></div>
        <div id="agentKnowledgeList" style="display: none;"></div>
      </div>
    </div>
  `;
  state.knowledgeRefs = [];

  // 刷新模块级知识库缓存到本用例数据（renderMergedAtList 内部走缓存）
  await selector.fetchKnowledgeCollections(true);
});

const mergedItems = () => [...document.querySelectorAll('#agentAtList .prompt-item')];
const selectedItems = () => [...document.querySelectorAll('#agentAtList .prompt-item.selected')];

describe('@ 搜索合并列表：默认选中全局第一项', () => {
  test('命中助手为首类：助手项默认选中，索引为 0', async () => {
    await selector.showAgentAtSelector('写作');
    const items = mergedItems();
    expect(items).toHaveLength(1);
    expect(items[0].dataset.type).toBe('agent');
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(state.selectedAgentAtIndex).toBe(0);
  });

  test('命中网页为首类：网页项默认选中（此前无 selected 的回归点）', async () => {
    await selector.showAgentAtSelector('示例页面');
    const items = mergedItems();
    expect(items).toHaveLength(1);
    expect(items[0].dataset.type).toBe('page');
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(state.selectedAgentAtIndex).toBe(0);
  });

  test('命中知识库为首类：知识库项默认选中（此前无 selected 的回归点）', async () => {
    await selector.showAgentAtSelector('知识库');
    const items = mergedItems();
    expect(items).toHaveLength(1);
    expect(items[0].dataset.type).toBe('knowledge');
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(state.selectedAgentAtIndex).toBe(0);
  });

  test('命中代理为首类：代理项默认选中', async () => {
    await selector.showAgentAtSelector('本地代理');
    const items = mergedItems();
    expect(items).toHaveLength(1);
    expect(items[0].dataset.type).toBe('proxy');
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(state.selectedAgentAtIndex).toBe(0);
  });

  test('多类命中：仅全局第一项选中，不会每类各选一个', async () => {
    storeData.customAgents = [{ id: 'ag-a', name: '共词助手', description: '' }];
    tabsData = [{ id: 1, title: '共词页面', url: 'https://a.example/', active: true }];

    await selector.showAgentAtSelector('共词');
    const items = mergedItems();
    expect(items).toHaveLength(2);
    expect(items[0].dataset.type).toBe('agent');
    expect(items[1].dataset.type).toBe('page');

    const selected = selectedItems();
    expect(selected).toHaveLength(1);
    expect(selected[0]).toBe(items[0]);
    expect(state.selectedAgentAtIndex).toBe(0);
  });

  test('过滤词从命中助手切到命中网页：选中回到新的第一项', async () => {
    storeData.customAgents = [{ id: 'ag-a', name: '共词助手', description: '' }];
    tabsData = [{ id: 1, title: '共词页面', url: 'https://a.example/', active: true }];

    await selector.showAgentAtSelector('共词');
    expect(mergedItems()).toHaveLength(2);

    await selector.showAgentAtSelector('页面');
    const items = mergedItems();
    expect(items).toHaveLength(1);
    expect(items[0].dataset.type).toBe('page');
    expect(items[0].classList.contains('selected')).toBe(true);
    expect(state.selectedAgentAtIndex).toBe(0);
  });

  test('无命中：显示空态且索引重置为 -1', async () => {
    await selector.showAgentAtSelector('zzz-不存在');
    expect(document.querySelector('#agentAtList .prompt-empty')).toBeTruthy();
    expect(state.selectedAgentAtIndex).toBe(-1);
  });
});
