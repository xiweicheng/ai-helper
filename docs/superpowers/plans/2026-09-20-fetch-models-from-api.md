# 从厂商 API 一键获取模型列表 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在配置页选择厂商并填好 API Key 后，一键（或选定厂商时自动）拉取该厂商的模型列表，合并追加进现有模型下拉框。

**Architecture:** 选项页内直接 `fetch`（`<all_urls>` host 权限，无 CORS 限制），新增单一职责模块 `src/options/model-fetcher.js`（请求 + 容错解析），`index.js` 负责按钮事件、自动拉取防抖与 toast 反馈，写入复用现有 `addCustomModelToDropdown` / `addCustomImageModelToDropdown`。失败静默兜底为手动添加。

**Tech Stack:** 原生 ES Module、Chrome Extension MV3、vitest（jsdom）、项目自有 `t()` i18n。

**Spec:** `docs/superpowers/specs/2026-09-20-fetch-models-from-api-design.md`

---

## File Structure

- `src/options/model-fetcher.js`（新增）：`parseModelsPayload(json)` 纯函数 + `fetchModelList({apiBase,apiKey,timeoutMs})` + `FetchModelsError`。
- `test/unit/model-fetcher.unit.test.js`（新增）：解析与请求单测。
- `src/shared/locales/zh.js` / `en.js`（改动）：`settings` 内新增 7 条文案。
- `options.html`（改动）：主模型区与视觉模型区各加一个获取按钮。
- `src/options/index.js`（改动）：按钮点击处理、自动拉取防抖去重、toast。
- `styles/styles.css`（改动）：获取按钮样式（复用 `.add-model-toggle-btn` 基础上微调）。

---

## Task 1: 容错解析纯函数 parseModelsPayload

**Files:**
- Create: `src/options/model-fetcher.js`
- Test: `test/unit/model-fetcher.unit.test.js`

- [ ] **Step 1: Write the failing test**

创建 `test/unit/model-fetcher.unit.test.js`：

```js
// @vitest-environment jsdom
import { describe, test, expect } from 'vitest';
import { parseModelsPayload } from '../../src/options/model-fetcher.js';

describe('parseModelsPayload', () => {
  test('OpenAI 标准 data[].id', () => {
    const json = { object: 'list', data: [{ id: 'gpt-4o', object: 'model' }, { id: 'gpt-3.5' }] };
    expect(parseModelsPayload(json)).toEqual(['gpt-4o', 'gpt-3.5']);
  });

  test('data[] 为字符串数组', () => {
    expect(parseModelsPayload({ data: ['a', 'b'] })).toEqual(['a', 'b']);
  });

  test('models[] 字符串 / .id / .name', () => {
    expect(parseModelsPayload({ models: ['x', 'y'] })).toEqual(['x', 'y']);
    expect(parseModelsPayload({ models: [{ id: 'm1' }, { name: 'm2' }] })).toEqual(['m1', 'm2']);
  });

  test('Anthropic data[].id', () => {
    const json = { data: [{ type: 'model', id: 'claude-3-5-sonnet' }] };
    expect(parseModelsPayload(json)).toEqual(['claude-3-5-sonnet']);
  });

  test('去重与过滤空字符串', () => {
    const json = { data: [{ id: 'a' }, { id: 'a' }, { id: '' }, { id: '  b ' }] };
    expect(parseModelsPayload(json)).toEqual(['a', 'b']);
  });

  test('非法/空/缺字段返回空数组', () => {
    expect(parseModelsPayload(null)).toEqual([]);
    expect(parseModelsPayload({})).toEqual([]);
    expect(parseModelsPayload({ data: 'not-array' })).toEqual([]);
    expect(parseModelsPayload([])).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/model-fetcher.unit.test.js`
Expected: FAIL（无法解析模块 / `parseModelsPayload is not a function`）

- [ ] **Step 3: Write minimal implementation**

创建 `src/options/model-fetcher.js`：

```js
// options/model-fetcher.js - 从厂商 API 拉取模型列表
// 单一职责：请求 + 容错解析。写入下拉与 toast 由 index.js 负责。

/**
 * 容错解析厂商返回的模型列表，兼容多种格式。
 * 依次尝试 data[] / models[]，元素可为字符串或含 id/name/model 的对象。
 * @param {any} json
 * @returns {string[]} 去重、过滤空后的模型名数组
 */
export function parseModelsPayload(json) {
  if (!json || typeof json !== 'object') return [];
  const arr = Array.isArray(json.data) ? json.data
    : Array.isArray(json.models) ? json.models
    : null;
  if (!arr) return [];

  const seen = new Set();
  const result = [];
  for (const item of arr) {
    let name = '';
    if (typeof item === 'string') {
      name = item;
    } else if (item && typeof item === 'object') {
      const id = item.id || item.name || item.model;
      if (typeof id === 'string') name = id;
    }
    name = (name || '').trim();
    if (!name || seen.has(name)) continue;
    seen.add(name);
    result.push(name);
  }
  return result;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/model-fetcher.unit.test.js`
Expected: PASS（6 个 test 全绿）

- [ ] **Step 5: Commit**

```bash
git add src/options/model-fetcher.js test/unit/model-fetcher.unit.test.js
git commit -m "feat(options): 新增模型列表容错解析 parseModelsPayload"
```

---

## Task 2: fetchModelList 请求、URL 拼接、请求头、超时与错误

**Files:**
- Modify: `src/options/model-fetcher.js`（在 Task 1 内容基础上追加）
- Test: `test/unit/model-fetcher.unit.test.js`（追加 describe 块）

- [ ] **Step 1: Write the failing test**

在 `test/unit/model-fetcher.unit.test.js` 顶部 import 追加，并在文件末尾追加：

```js
import { fetchModelList, FetchModelsError } from '../../src/options/model-fetcher.js';
import { vi, afterEach } from 'vitest';

describe('fetchModelList', () => {
  afterEach(() => { vi.unstubAllGlobals(); });

  function stubFetch(impl) { vi.stubGlobal('fetch', vi.fn(impl)); }

  test('缺少 apiBase/apiKey 抛 invalid-config', async () => {
    await expect(fetchModelList({ apiBase: '', apiKey: 'k' }))
      .rejects.toMatchObject({ reason: 'invalid-config' });
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: '' }))
      .rejects.toMatchObject({ reason: 'invalid-config' });
  });

  test('拼接 /models 并去除尾部斜杠', async () => {
    let calledUrl = '';
    stubFetch(async (url) => { calledUrl = url; return { ok: true, json: async () => ({ data: [{ id: 'm' }] }) }; });
    await fetchModelList({ apiBase: 'https://api.deepseek.com/', apiKey: 'k' });
    expect(calledUrl).toBe('https://api.deepseek.com/models');
  });

  test('通用请求头 Authorization Bearer', async () => {
    let headers = null;
    stubFetch(async (_url, opts) => { headers = opts.headers; return { ok: true, json: async () => ({ data: [{ id: 'm' }] }) }; });
    await fetchModelList({ apiBase: 'https://api.siliconflow.cn/v1', apiKey: 'sk-1' });
    expect(headers['Authorization']).toBe('Bearer sk-1');
    expect(headers['x-api-key']).toBeUndefined();
  });

  test('anthropic.com 追加 x-api-key 与 anthropic-version', async () => {
    let headers = null;
    stubFetch(async (_url, opts) => { headers = opts.headers; return { ok: true, json: async () => ({ data: [{ id: 'claude' }] }) }; });
    await fetchModelList({ apiBase: 'https://api.anthropic.com/v1', apiKey: 'ak' });
    expect(headers['x-api-key']).toBe('ak');
    expect(headers['anthropic-version']).toBe('2023-06-01');
  });

  test('HTTP 非 2xx 抛错并保留 status', async () => {
    stubFetch(async () => ({ ok: false, status: 401 }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k' }))
      .rejects.toMatchObject({ status: 401, reason: 'http' });
  });

  test('解析为空抛 parse 错误', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ foo: 'bar' }) }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k' }))
      .rejects.toMatchObject({ reason: 'parse' });
  });

  test('超时抛 timeout 错误', async () => {
    stubFetch(async (_url, opts) => new Promise((_res, rej) => {
      opts.signal.addEventListener('abort', () => { const e = new Error('aborted'); e.name = 'AbortError'; rej(e); });
    }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k', timeoutMs: 10 }))
      .rejects.toMatchObject({ reason: 'timeout' });
  });

  test('成功返回模型名数组', async () => {
    stubFetch(async () => ({ ok: true, json: async () => ({ data: [{ id: 'a' }, { id: 'b' }] }) }));
    await expect(fetchModelList({ apiBase: 'https://x', apiKey: 'k' })).resolves.toEqual(['a', 'b']);
  });

  test('FetchModelsError 是 Error 实例', () => {
    expect(new FetchModelsError('x', { reason: 'network' })).toBeInstanceOf(Error);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run test/unit/model-fetcher.unit.test.js`
Expected: FAIL（`fetchModelList`/`FetchModelsError` 未导出）

- [ ] **Step 3: Write minimal implementation**

在 `src/options/model-fetcher.js` 末尾追加：

```js
/** 拉取模型失败错误，保留 HTTP 状态码与失败原因 */
export class FetchModelsError extends Error {
  constructor(message, { status, reason } = {}) {
    super(message);
    this.name = 'FetchModelsError';
    this.status = status;   // HTTP 状态码（若有）
    this.reason = reason;   // 'timeout'|'network'|'http'|'parse'|'invalid-config'
  }
}

function buildModelsUrl(apiBase) {
  return `${String(apiBase).trim().replace(/\/+$/, '')}/models`;
}

function isAnthropic(apiBase) {
  return /anthropic\.com/i.test(String(apiBase || ''));
}

/**
 * 请求厂商 /models 接口并解析模型名列表。
 * @param {{apiBase:string, apiKey:string, timeoutMs?:number}} opts
 * @returns {Promise<string[]>}
 * @throws {FetchModelsError}
 */
export async function fetchModelList({ apiBase, apiKey, timeoutMs = 15000 } = {}) {
  const base = (apiBase || '').trim();
  const key = (apiKey || '').trim();
  if (!base || !key) {
    throw new FetchModelsError('missing apiBase or apiKey', { reason: 'invalid-config' });
  }

  const headers = { 'Authorization': `Bearer ${key}` };
  if (isAnthropic(base)) {
    headers['x-api-key'] = key;
    headers['anthropic-version'] = '2023-06-01';
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let resp;
  try {
    resp = await fetch(buildModelsUrl(base), { method: 'GET', headers, signal: controller.signal });
  } catch (err) {
    clearTimeout(timer);
    if (err && err.name === 'AbortError') {
      throw new FetchModelsError('request timeout', { reason: 'timeout' });
    }
    throw new FetchModelsError((err && err.message) || 'network error', { reason: 'network' });
  }
  clearTimeout(timer);

  if (!resp.ok) {
    throw new FetchModelsError(`HTTP ${resp.status}`, { status: resp.status, reason: 'http' });
  }

  let json;
  try {
    json = await resp.json();
  } catch (_e) {
    throw new FetchModelsError('invalid JSON', { reason: 'parse' });
  }

  const models = parseModelsPayload(json);
  if (!models.length) {
    throw new FetchModelsError('no models parsed', { reason: 'parse' });
  }
  return models;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run test/unit/model-fetcher.unit.test.js`
Expected: PASS（Task 1 + Task 2 全部 test 绿）

- [ ] **Step 5: Commit**

```bash
git add src/options/model-fetcher.js test/unit/model-fetcher.unit.test.js
git commit -m "feat(options): 新增 fetchModelList 拉取厂商模型列表（URL/头/超时/错误）"
```

---

## Task 3: i18n 文案

**Files:**
- Modify: `src/shared/locales/zh.js`（`settings` 对象内，`addModel` 附近）
- Modify: `src/shared/locales/en.js`（对应位置）

- [ ] **Step 1: 在 zh.js 的 settings 对象内新增文案**

在 `src/shared/locales/zh.js` 中 `addModel: '+ 添加模型',` 一行之后插入：

```js
    fetchModels: '⟳ 从 API 获取',
    fetchModelsTitle: '从当前厂商 API 拉取可用模型列表',
    fetchModelsLoading: '获取中…',
    fetchModelsNeedConfig: '请先填写 API Base URL 和 API Key',
    fetchModelsSuccess: '✅ 已获取 {total} 个模型（新增 {added} 个）',
    fetchModelsEmpty: '未获取到模型，请手动添加',
    fetchModelsFailed: '❌ 获取失败，请检查配置或手动添加模型',
    fetchModelsAuthFailed: '❌ 认证失败，请检查 API Key',
```

- [ ] **Step 2: 在 en.js 的 settings 对象内新增对应文案**

在 `src/shared/locales/en.js` 中 `addModel: '+ Add model',` 一行之后插入：

```js
    fetchModels: '⟳ Fetch from API',
    fetchModelsTitle: 'Fetch available models from the current provider API',
    fetchModelsLoading: 'Fetching…',
    fetchModelsNeedConfig: 'Please fill in API Base URL and API Key first',
    fetchModelsSuccess: '✅ Fetched {total} models ({added} new)',
    fetchModelsEmpty: 'No models returned, please add manually',
    fetchModelsFailed: '❌ Fetch failed, check config or add manually',
    fetchModelsAuthFailed: '❌ Authentication failed, check API Key',
```

- [ ] **Step 3: 验证 key 可解析（无自动化断言，快速冒烟）**

Run: `node -e "import('./src/shared/locales/zh.js').then(m=>console.log(Object.keys(m.default.settings).filter(k=>k.startsWith('fetchModels')).length))"`
Expected: 输出 `8`

> 注：若该文件默认导出结构不同导致上面命令报错，改用 `npx vitest run` 确认无语法错误即可，文案 key 在 Task 5 手动验证时最终确认。

- [ ] **Step 4: Commit**

```bash
git add src/shared/locales/zh.js src/shared/locales/en.js
git commit -m "feat(i18n): 新增从 API 获取模型列表相关中英文文案"
```

---

## Task 4: options.html 新增获取按钮

**Files:**
- Modify: `options.html`（主模型区 `addModelToggleBtn` 旁；视觉模型区 `addImageModelToggleBtn` 旁）

- [ ] **Step 1: 主模型区新增按钮**

在 `options.html` 中找到主模型区这一行（约 line 99）：

```html
        <button type="button" class="add-model-toggle-btn" id="addModelToggleBtn" data-i18n-title="settings.addModelTitle" title="添加自定义模型" data-i18n="settings.addModel">+ 添加模型</button>
```

在它**后面同一层级**插入获取按钮：

```html
        <button type="button" class="add-model-toggle-btn fetch-models-btn" id="fetchModelsBtn" data-i18n-title="settings.fetchModelsTitle" title="从当前厂商 API 拉取可用模型列表" data-i18n="settings.fetchModels">⟳ 从 API 获取</button>
```

- [ ] **Step 2: 视觉模型区新增按钮**

在 `options.html` 中找到视觉模型区的 `id="addImageModelToggleBtn"` 按钮行，在其**后面同一层级**插入：

```html
        <button type="button" class="add-model-toggle-btn fetch-models-btn" id="fetchImageModelsBtn" data-i18n-title="settings.fetchModelsTitle" title="从当前厂商 API 拉取可用模型列表" data-i18n="settings.fetchModels">⟳ 从 API 获取</button>
```

- [ ] **Step 3: 校验 HTML 结构**

Run: `grep -n "fetchModelsBtn\|fetchImageModelsBtn" options.html`
Expected: 两行匹配（各一个 id）

- [ ] **Step 4: Commit**

```bash
git add options.html
git commit -m "feat(options): 主模型与视觉模型区新增「从 API 获取」按钮"
```

---

## Task 5: index.js 按钮点击处理（手动获取 + 合并追加 + toast）

**Files:**
- Modify: `src/options/index.js`（顶部 import；`addModelToggleBtn` 事件绑定附近新增处理函数与监听）

- [ ] **Step 1: 顶部新增 import**

在 `src/options/index.js` 现有从 `./config-manager.js` 的 import 之后新增一行：

```js
import { fetchModelList } from './model-fetcher.js';
```

确认文件已从 config-manager 引入了 `addCustomModelToDropdown`、`addCustomImageModelToDropdown`、`showToast`（现有 import 已包含 `addCustomModelToDropdown`/`showToast`；`addCustomImageModelToDropdown` 现有 import 已包含）。若缺失则补入对应 import。

- [ ] **Step 2: 新增通用处理函数**

在 `src/options/index.js` 内、`setupEventListeners`（或等价初始化函数）作用域中，`// ==================== API Base URL 选择器事件 ====================`（约 line 416）**之前**插入：

```js
  // ==================== 从 API 获取模型列表 ====================

  /**
   * 拉取厂商模型并合并追加进指定下拉。
   * @param {object} cfg
   * @param {HTMLInputElement} cfg.apiBaseEl
   * @param {HTMLInputElement} cfg.apiKeyEl
   * @param {string} cfg.dropdownId 目标下拉容器 id
   * @param {(name:string, ctx:number)=>void} cfg.addFn 写入函数
   * @param {HTMLButtonElement|null} cfg.btn 触发按钮（用于 loading 态）
   * @param {boolean} cfg.silent 静默模式（自动拉取用，不弹 toast）
   */
  async function runFetchModels({ apiBaseEl, apiKeyEl, dropdownId, addFn, btn, silent }) {
    const apiBase = (apiBaseEl?.value || '').trim();
    const apiKey = (apiKeyEl?.value || '').trim();
    if (!apiBase || !apiKey) {
      if (!silent) showToast('⚠️ ' + t('settings.fetchModelsNeedConfig'), 'error');
      return;
    }
    const originalText = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = t('settings.fetchModelsLoading'); }
    try {
      const models = await fetchModelList({ apiBase, apiKey });
      let added = 0;
      const dropdown = document.getElementById(dropdownId);
      for (const name of models) {
        const exists = dropdown && dropdown.querySelector(`.model-option[data-value="${CSS.escape(name)}"]`);
        if (!exists) { addFn(name, 0); added++; }
      }
      if (!silent) {
        showToast(t('settings.fetchModelsSuccess', { total: models.length, added }), 'success');
      }
    } catch (err) {
      if (!silent) {
        if (err && (err.status === 401 || err.status === 403)) {
          showToast(t('settings.fetchModelsAuthFailed'), 'error');
        } else if (err && err.reason === 'parse') {
          showToast(t('settings.fetchModelsEmpty'), 'info');
        } else {
          showToast(t('settings.fetchModelsFailed'), 'error');
        }
      }
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = originalText || t('settings.fetchModels'); }
    }
  }

  // 主模型区「从 API 获取」按钮
  const fetchModelsBtn = document.getElementById('fetchModelsBtn');
  if (fetchModelsBtn) {
    fetchModelsBtn.addEventListener('click', () => {
      runFetchModels({
        apiBaseEl: document.getElementById('apiBase'),
        apiKeyEl: document.getElementById('apiKey'),
        dropdownId: 'modelDropdown',
        addFn: addCustomModelToDropdown,
        btn: fetchModelsBtn,
        silent: false,
      });
    });
  }

  // 视觉模型区「从 API 获取」按钮
  const fetchImageModelsBtn = document.getElementById('fetchImageModelsBtn');
  if (fetchImageModelsBtn) {
    fetchImageModelsBtn.addEventListener('click', () => {
      runFetchModels({
        apiBaseEl: document.getElementById('imageApiBase'),
        apiKeyEl: document.getElementById('imageApiKey'),
        dropdownId: 'imageModelDropdown',
        addFn: addCustomImageModelToDropdown,
        btn: fetchImageModelsBtn,
        silent: false,
      });
    });
  }
```

- [ ] **Step 3: 校验 import 与语法**

Run: `npx eslint src/options/index.js src/options/model-fetcher.js`
Expected: 无 error（warning 可接受）

- [ ] **Step 4: Commit**

```bash
git add src/options/index.js
git commit -m "feat(options): 绑定「从 API 获取」按钮，合并追加模型并 toast 反馈"
```

---

## Task 6: index.js 选定厂商时自动拉取（防抖 + 去重）

**Files:**
- Modify: `src/options/index.js`（`apiBaseDropdown` 点击选择处理内，约 line 440-450）

- [ ] **Step 1: 新增自动拉取防抖去重函数**

在 Task 5 插入的 `runFetchModels` 函数**之后**、`fetchModelsBtn` 声明之前（或之后均可，需在其引用前定义），插入：

```js
  // 选定厂商后自动拉取一次（防抖 + 去重，静默失败）
  let lastAutoFetchKey = '';
  let autoFetchTimer = null;
  function maybeAutoFetchModels(apiBase, apiKey) {
    const base = (apiBase || '').trim();
    const key = (apiKey || '').trim();
    if (!base || !key) return;
    const dedupeKey = `${base}|${key}`;
    if (dedupeKey === lastAutoFetchKey) return;
    clearTimeout(autoFetchTimer);
    autoFetchTimer = setTimeout(() => {
      lastAutoFetchKey = dedupeKey;
      runFetchModels({
        apiBaseEl: document.getElementById('apiBase'),
        apiKeyEl: document.getElementById('apiKey'),
        dropdownId: 'modelDropdown',
        addFn: addCustomModelToDropdown,
        btn: document.getElementById('fetchModelsBtn'),
        silent: true,
      });
    }, 500);
  }
```

- [ ] **Step 2: 在 apiBase 下拉选择处触发**

在 `src/options/index.js` 的 `apiBaseDropdown.addEventListener('click', ...)` 内，找到选定分支（约 line 440-450）：

```js
      const option = e.target.closest('.model-option');
      if (option) {
        e.stopPropagation();
        const value = option.dataset.value;
        apiBaseInput.value = value;
        updateApiBaseSelection(value);
        apiBaseDropdown.classList.remove('show');
        // 自动保存
        chrome.storage.local.set({ apiBase: value });
        showToast('✅ ' + t('settings.apiBaseSwitched'), 'info');
      }
```

在 `showToast('✅ ' + t('settings.apiBaseSwitched'), 'info');` 之后插入一行：

```js
        maybeAutoFetchModels(value, (document.getElementById('apiKey')?.value || '').trim());
```

- [ ] **Step 3: 校验语法**

Run: `npx eslint src/options/index.js`
Expected: 无 error

- [ ] **Step 4: Commit**

```bash
git add src/options/index.js
git commit -m "feat(options): 选定厂商且已填 Key 时自动静默拉取模型列表"
```

---

## Task 7: 按钮样式 + 构建验证

**Files:**
- Modify: `styles/styles.css`（`.add-model-section` 相关区块）

- [ ] **Step 1: 新增获取按钮样式**

在 `styles/styles.css` 中 `.add-model-toggle-btn` 相关样式附近追加（让两个按钮并排且有间距，视觉区分于「添加模型」）：

```css
.fetch-models-btn {
  margin-left: 8px;
}
.add-model-section {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px;
}
```

> 注：若 `.add-model-section` 已有 `display` 定义，则只补充 `flex-wrap`/`align-items`/`gap`，避免与现有布局（含 `add-model-form` 展开）冲突；实现时先 grep 现有 `.add-model-section` 规则再决定合并方式。

- [ ] **Step 2: 确认现有样式无冲突**

Run: `grep -n "add-model-section" styles/styles.css`
Expected: 打印现有规则行号，据此调整 Step 1 的写法（不产生重复/覆盖冲突）。

- [ ] **Step 3: 运行全部单测**

Run: `npx vitest run`
Expected: 全部 PASS（含新增 model-fetcher 测试，且不破坏既有用例）

- [ ] **Step 4: 静默构建**

Run: `npm run build:silent`
Expected: 构建成功，无报错。

- [ ] **Step 5: 手动验证（加载 dist 到 Chrome）**

1. DeepSeek：填 `https://api.deepseek.com` + 有效 Key → 点「⟳ 从 API 获取」→ 下拉出现 deepseek 模型，toast 显示新增数量。
2. 重复点击：已存在模型被跳过，`added` 计数只统计新模型。
3. 智谱 bigmodel：点获取 → 走失败兜底 toast（`获取失败` 或 `未获取到模型`），页面不崩溃，仍可手动添加。
4. 视觉模型区：填 imageApiBase + imageApiKey → 点该区获取按钮 → 图片模型下拉合并追加。
5. 自动拉取：从 apiBase 下拉选定厂商且 apiKey 已填 → 约 0.5s 后自动拉取一次；重复选同一厂商不重复触发。

- [ ] **Step 6: Commit**

```bash
git add styles/styles.css
git commit -m "style(options): 获取模型按钮布局样式并验证构建"
```

---

## Self-Review

**Spec coverage：**
- 厂商调研 → spec 已含，无需实现任务。✅
- 合并追加融合 → Task 5 `runFetchModels` 用 `exists` 判断去重后 `addFn(name,0)`。✅
- 容错解析（data[]/models[]/字符串/对象/去重过滤） → Task 1。✅
- URL 拼接 `/models` + 去尾斜杠、Anthropic 头、超时、状态码 → Task 2。✅
- 双触发（按钮 + 自动拉取防抖去重） → Task 5 + Task 6。✅
- 主模型 + 视觉模型双覆盖 → Task 4 两按钮、Task 5 两 handler。✅
- contextWindow 留空 → `addFn(name, 0)`。✅
- 错误处理分级（need-config/auth/parse-empty/failed/success） → Task 5 catch 分支。✅
- i18n 7+1 条 → Task 3。✅
- 测试计划（解析 + 请求 + 手动验证） → Task 1/2 单测 + Task 7 手动验证。✅
- 交付物清单文件 → 全部覆盖（model-fetcher.js、index.js、options.html、styles.css、locales）。✅

**Placeholder scan：** 无 TBD/TODO，所有代码步骤含完整代码与命令。✅

**Type consistency：** `parseModelsPayload` / `fetchModelList` / `FetchModelsError` 命名跨 Task 1-2 一致；`runFetchModels` 参数对象在 Task 5 定义、Task 6 复用一致；`maybeAutoFetchModels` 在 Task 6 内定义并引用，均在其调用点（apiBase 选择处）之前定义。错误属性 `status` / `reason` 在 Task 2 抛出、Task 5 消费一致。✅
