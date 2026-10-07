// @vitest-environment jsdom
// 厂商下拉（provider-selector）排序渲染 + 搜索框单测
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';
import { initProviderSelector } from '../../src/side_panel/provider-selector.js';

let store = {};

function mockChrome(initial = {}) {
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
        set: (obj) => {
          Object.assign(store, obj);
          return Promise.resolve();
        },
      },
      onChanged: { addListener: () => {} },
    },
    runtime: { getURL: (p) => p },
    tabs: { query: () => Promise.resolve([]), create: () => Promise.resolve(), update: () => Promise.resolve() },
  });
}

function setupDom() {
  document.body.innerHTML = `
    <div class="provider-section">
      <div class="section-select" id="providerSelect">
        <div class="section-select-row" id="providerSelectRow">
          <span class="section-select-value" id="providerSelectValue"></span>
          <span class="section-select-host" id="providerSelectHost"></span>
        </div>
        <div class="section-select-list" id="providerList"></div>
      </div>
    </div>`;
}

beforeEach(() => {
  mockChrome({
    modelProfiles: [
      { id: 'p-oa', name: 'OpenAI', apiBase: 'https://api.openai.com/v1', models: [] },
      { id: 'p-hy', name: '腾讯混元', apiBase: 'https://api.hunyuan.cloud.tencent.com/v1', models: [] },
      { id: 'p-ds', name: 'DeepSeek', apiBase: 'https://api.deepseek.com', models: [] },
    ],
    activeProfileId: 'p-ds',
  });
  setupDom();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('renderProviderList（排序 + 搜索框）', () => {
  test('选项按名称排序渲染（汉字组优先，不改变存储顺序）', async () => {
    await initProviderSelector();

    // 排序规则：汉字组整体排在拉丁字母前（组内拼音），拉丁字母按字母序
    const names = [...document.querySelectorAll('#providerList .provider-option .provider-option-left')]
      .map(el => el.textContent);
    expect(names).toEqual(['腾讯混元', 'DeepSeek', 'OpenAI']);
    // 存储中的配置顺序保持原样（OpenAI → 腾讯混元 → DeepSeek）
    expect(store.modelProfiles.map(p => p.name)).toEqual(['OpenAI', '腾讯混元', 'DeepSeek']);
  });

  test('列表首个子元素为过滤搜索框，选项数量完整', async () => {
    await initProviderSelector();

    const list = document.getElementById('providerList');
    expect(list.firstElementChild.classList.contains('section-select-search')).toBe(true);
    expect(list.querySelectorAll('.provider-option')).toHaveLength(3);
  });

  test('选择行仍显示激活配置（排序不改变激活标记）', async () => {
    await initProviderSelector();

    expect(document.getElementById('providerSelectValue').textContent).toBe('DeepSeek');
    const selected = document.querySelector('#providerList .provider-option.selected');
    expect(selected.dataset.value).toBe('p-ds');
  });
});
