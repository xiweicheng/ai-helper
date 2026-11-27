# 首次使用引导与大模型配置向导 实现计划

> **给执行者：** 按任务顺序逐个执行，每个任务结束时必须运行 `npm run build:silent`；涉及单测的任务先看测试失败再写实现。不要跳步，不要合并任务。

**目标：** 新用户首次打开侧边栏且未配置模型时，弹出 2 步配置向导；可跳过；未配置时发送不再抛 401；完成后给出示例任务与官方文档入口。

**架构：** 拆成纯逻辑层 `onboarding-core.js`（无 DOM、无网络、可单测）与展示层 `onboarding-wizard.js`（状态机 + DOM + 请求）。配置读写统一复用 `shared/model-profiles.js`，拉模型复用 `options/model-fetcher.js`。发送拦截放在 `chat-manager.js` 前置检查，动态 import 向导避免循环依赖。

**技术栈：** 原生 ES Module、Vite、vitest（node 环境 + 按文件头切 jsdom）、chrome.storage.local、项目自研 i18n。

**设计依据：** [2026-11-27-onboarding-model-wizard-design.md](file:///Users/xiweicheng/Documents/trae_projects/ai-helper/docs/superpowers/specs/2026-11-27-onboarding-model-wizard-design.md)

---

## 文件结构

| 文件 | 动作 | 职责 |
|---|---|---|
| `src/side_panel/onboarding-core.js` | 新建 | 常量（服务商、示例任务、文档地址）、未配置判定、默认模型选择、错误归类 |
| `src/side_panel/onboarding-wizard.js` | 新建 | 四屏状态机、DOM 渲染、Key 校验、保存、跳过、状态条、首页示例胶囊 |
| `src/side_panel/styles.css` | 修改 | 向导、遮罩、状态条、示例胶囊样式 |
| `side_panel.html` | 修改 | 新增 `#onboardingRoot`、`#onboardingStatusBar`、`#welcomeExamples` 三个空容器 |
| `src/side_panel/index.js` | 修改 | 初始化挂载两处调用 |
| `src/side_panel/chat-manager.js` | 修改 | `sendMessage()` 增加未配置拦截 |
| `test/unit/onboarding-core.unit.test.js` | 新建 | 纯逻辑单测 |
| `test/unit/onboarding-wizard-dom.unit.test.js` | 新建 | 跳过/挂载 DOM 冒烟测试 |

---

### Task 1: 纯逻辑核心 `onboarding-core.js`

**Files:**
- Create: `src/side_panel/onboarding-core.js`
- Test: `test/unit/onboarding-core.unit.test.js`

- [ ] **Step 1: 先写失败测试**

```js
// test/unit/onboarding-core.unit.test.js
import { describe, it, expect } from 'vitest';
import {
  DOCS_URL, PROVIDERS, providerById, isModelConfigured,
  shouldAutoShow, pickDefaultModel, classifyFetchError, EXAMPLE_TASKS,
} from '../../src/side_panel/onboarding-core.js';

describe('onboarding-core 服务商', () => {
  it('包含六个服务商且 DeepSeek 为推荐项、默认 API Base', () => {
    expect(PROVIDERS).toHaveLength(6);
    const ds = providerById('deepseek');
    expect(ds.apiBase).toBe('https://api.deepseek.com');
    expect(ds.recommended).toBe(true);
  });

  it('未知 id 回退到 DeepSeek', () => {
    expect(providerById('nope').id).toBe('deepseek');
  });

  it('自定义服务商没有预设 apiBase', () => {
    expect(providerById('custom').apiBase).toBe('');
  });
});

describe('isModelConfigured', () => {
  it('Key 与模型都非空才算已配置', () => {
    expect(isModelConfigured({ apiKey: 'sk-1', modelName: 'm' })).toBe(true);
    expect(isModelConfigured({ apiKey: 'sk-1', modelName: '' })).toBe(false);
    expect(isModelConfigured({ apiKey: '', modelName: 'm' })).toBe(false);
    expect(isModelConfigured({})).toBe(false);
  });

  it('空白字符不算已配置', () => {
    expect(isModelConfigured({ apiKey: '   ', modelName: '  ' })).toBe(false);
  });
});

describe('shouldAutoShow', () => {
  it('未配置且未提示过才自动弹', () => {
    expect(shouldAutoShow({ configured: false, dismissedAt: 0 })).toBe(true);
    expect(shouldAutoShow({ configured: true, dismissedAt: 0 })).toBe(false);
    expect(shouldAutoShow({ configured: false, dismissedAt: 1700000000000 })).toBe(false);
  });
});

describe('pickDefaultModel', () => {
  it('DeepSeek 地址优先 deepseek-v4-pro', () => {
    const models = ['deepseek-chat', 'deepseek-v4-pro', 'deepseek-reasoner'];
    expect(pickDefaultModel(models, 'https://api.deepseek.com')).toBe('deepseek-v4-pro');
  });

  it('DeepSeek 地址没有该模型时取第一个', () => {
    expect(pickDefaultModel(['a', 'b'], 'https://api.deepseek.com')).toBe('a');
  });

  it('非 DeepSeek 地址取第一个；空列表返回空串', () => {
    expect(pickDefaultModel(['qwen-max'], 'https://dashscope.aliyuncs.com')).toBe('qwen-max');
    expect(pickDefaultModel([], 'https://x')).toBe('');
    expect(pickDefaultModel(null, 'https://x')).toBe('');
  });
});

describe('classifyFetchError', () => {
  it('按状态码与原因归类', () => {
    expect(classifyFetchError({ status: 401 })).toBe('auth');
    expect(classifyFetchError({ status: 403 })).toBe('auth');
    expect(classifyFetchError({ reason: 'timeout' })).toBe('timeout');
    expect(classifyFetchError({ reason: 'network' })).toBe('network');
    expect(classifyFetchError({ reason: 'invalid-config' })).toBe('invalidConfig');
    expect(classifyFetchError({ reason: 'parse' })).toBe('noModels');
    expect(classifyFetchError({ status: 500 })).toBe('http');
    expect(classifyFetchError(null)).toBe('http');
  });
});

describe('常量', () => {
  it('文档地址与示例任务', () => {
    expect(DOCS_URL).toBe('https://xiweicheng.github.io/ai-helper/');
    expect(EXAMPLE_TASKS.map(x => x.id)).toEqual(['summary', 'table', 'watch']);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run test/unit/onboarding-core.unit.test.js`
Expected: FAIL，报找不到模块 `onboarding-core.js`。

- [ ] **Step 3: 写实现**

```js
// src/side_panel/onboarding-core.js
// 纯逻辑层：无 DOM、无网络、无 chrome 依赖，便于单测。
// DOM、请求、存储分别由 onboarding-wizard.js 负责。

export const DOCS_URL = 'https://xiweicheng.github.io/ai-helper/';
export const ONBOARDING_DONE_KEY = 'onboardingWizardDismissedAt';

/** 服务商预设：apiBase 为空表示需要用户手填（自定义/中转） */
export const PROVIDERS = [
  { id: 'deepseek', labelKey: 'onboarding.providerDeepseek', hintKey: 'onboarding.providerDeepseekHint', apiBase: 'https://api.deepseek.com', recommended: true },
  { id: 'qwen', labelKey: 'onboarding.providerQwen', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'kimi', labelKey: 'onboarding.providerKimi', apiBase: 'https://api.moonshot.cn/v1' },
  { id: 'doubao', labelKey: 'onboarding.providerDoubao', apiBase: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'global', labelKey: 'onboarding.providerGlobal', apiBase: 'https://api.openai.com/v1' },
  { id: 'custom', labelKey: 'onboarding.providerCustom', apiBase: '', custom: true },
];

/** 完成页示例任务：promptKey 指向 i18n 文案 */
export const EXAMPLE_TASKS = [
  { id: 'summary', icon: '📄', promptKey: 'onboarding.exampleSummary' },
  { id: 'table', icon: '📊', promptKey: 'onboarding.exampleTable' },
  { id: 'watch', icon: '⏰', promptKey: 'onboarding.exampleWatch' },
];

export function providerById(id) {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

/** 已配置判定：Key 与模型名都非空（apiBase 缺省视为默认，不参与判定） */
export function isModelConfigured(cfg = {}) {
  const key = String(cfg.apiKey || '').trim();
  const model = String(cfg.modelName || '').trim();
  return Boolean(key && model);
}

/** 是否自动弹向导：未配置且从未提示过 */
export function shouldAutoShow({ configured, dismissedAt } = {}) {
  return !configured && !dismissedAt;
}

/** 默认选中模型：DeepSeek 优先 v4-pro，其余取第一个 */
export function pickDefaultModel(models, apiBase) {
  const list = Array.isArray(models) ? models.filter(Boolean) : [];
  if (!list.length) return '';
  if (/deepseek\.com/i.test(String(apiBase || ''))) {
    const preferred = list.find(m => m === 'deepseek-v4-pro');
    if (preferred) return preferred;
  }
  return list[0];
}

/** 把 FetchModelsError 归类为稳定的错误码，供 UI 映射文案 */
export function classifyFetchError(err) {
  const status = err && err.status;
  const reason = err && err.reason;
  if (status === 401 || status === 403) return 'auth';
  if (reason === 'timeout') return 'timeout';
  if (reason === 'network') return 'network';
  if (reason === 'invalid-config') return 'invalidConfig';
  if (reason === 'parse') return 'noModels';
  return 'http';
}
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run test/unit/onboarding-core.unit.test.js`
Expected: PASS，9 个用例全绿。

- [ ] **Step 5: 构建校验**

Run: `npm run build:silent`
Expected: 无错误输出。

---

### Task 2: 文案与错误映射

**Files:**
- Modify: `src/side_panel/onboarding-wizard.js`（本任务只写文件头部的翻译注册，其余内容在 Task 3 追加）
- Test: `test/unit/onboarding-core.unit.test.js`（追加 i18n 断言）

- [ ] **Step 1: 追加失败测试**

在 `test/unit/onboarding-core.unit.test.js` 末尾追加：

```js
describe('onboarding 文案', () => {
  it('中英文都注册了关键文案，且无占位符残留', async () => {
    await import('../../src/side_panel/onboarding-wizard.js');
    const { t, setLanguage, getLanguage } = await import('../../src/shared/i18n.js');
    const original = getLanguage();
    setLanguage('zh', false);
    expect(t('onboarding.step0Title')).not.toBe('onboarding.step0Title');
    expect(t('onboarding.docsIntroLink')).toBe('看看官方介绍');
    setLanguage('en', false);
    expect(t('onboarding.step0Title')).not.toBe('onboarding.step0Title');
    setLanguage(original, false);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

Run: `npx vitest run test/unit/onboarding-core.unit.test.js`
Expected: FAIL —— 模块不存在或 `t()` 返回 key 本身。

- [ ] **Step 3: 写翻译注册（文件头部）**

```js
// src/side_panel/onboarding-wizard.js
// 首次使用引导：四屏配置向导 + 未配置状态条 + 首页示例胶囊。
// 只负责展示与交互；判定/选择逻辑在 onboarding-core.js。

import { t, registerTranslations, subscribe } from '../shared/i18n.js';
import { decodeSecret } from '../shared/secret.js';
import { createProfile, getState, updateActiveProfile, ensureProfilesMigrated } from '../shared/model-profiles.js';
import { fetchModelList } from '../options/model-fetcher.js';
import { showToast } from './utils.js';
import logger from '../shared/logger.js';
import {
  DOCS_URL, ONBOARDING_DONE_KEY, PROVIDERS, EXAMPLE_TASKS,
  providerById, isModelConfigured, shouldAutoShow, pickDefaultModel, classifyFetchError,
} from './onboarding-core.js';

registerTranslations('zh', {
  onboarding: {
    step0Title: '先接上你的大模型，1 分钟就能用',
    step0Subtitle: '支持 DeepSeek、通义、Kimi、OpenAI 等任意 OpenAI 兼容接口',
    startConfig: '开始配置',
    skip: '跳过，先看看功能',
    docsIntro: '不了解这是什么？',
    docsIntroLink: '看看官方介绍',
    docsFull: '完整功能文档与示例',
    stepsLabel: '选服务商 → 填 Key → 开始用',
    next: '下一步',
    prev: '上一步',
    saveAndStart: '保存并开始',
    saving: '保存中…',
    providerTitle: '你用的是哪家模型服务？',
    providerDeepseek: 'DeepSeek',
    providerDeepseekHint: '推荐 · 便宜且够用',
    providerQwen: '阿里云百炼（通义）',
    providerKimi: '月之暗面（Kimi）',
    providerDoubao: '火山方舟（豆包）',
    providerGlobal: 'OpenAI / Claude / Gemini',
    providerCustom: '其他 / 自建中转',
    customBasePlaceholder: 'API Base URL，如 https://api.example.com/v1',
    keyTitle: '粘贴 API Key',
    keyHint: '在服务商控制台创建 API Key 后粘贴到这里',
    keyPlaceholder: 'sk-...',
    keyOpenSite: '去创建',
    verify: '验证',
    verifying: '验证中…',
    verifyOk: '连接成功 · 已获取 {count} 个模型',
    verifyFailAuth: 'Key 无效或已失效',
    verifyFailTimeout: '请求超时，请重试',
    verifyFailNetwork: '网络异常，请检查网络或 API 地址',
    verifyFailNoModels: '该接口没有返回模型列表，可手动填写模型名',
    verifyFailHttp: '接口返回异常，请检查 API 地址',
    modelLabel: '使用模型',
    modelManualPlaceholder: '手动输入模型名',
    doneTitle: '准备好了，试试让它干活',
    doneSubtitle: '点击任意一条，自动填入输入框',
    exampleSummary: '总结当前页面，并导出成 Word',
    exampleTable: '把这页的表格整理成 CSV',
    exampleWatch: '每天早上 9 点盯这个网页并汇报',
    agentCardTitle: '想让 AI 读写本地文件和终端？需要安装代理端',
    agentCardLink: '了解',
    statusUnconfigured: '未配置模型',
    statusConfigure: '去配置',
    welcomeTagline: '一句话，让 AI 替你在网页上干活',
    close: '关闭',
  },
});

registerTranslations('en', {
  onboarding: {
    step0Title: 'Connect your LLM first — takes about a minute',
    step0Subtitle: 'Works with DeepSeek, Qwen, Kimi, OpenAI, or any OpenAI-compatible endpoint',
    startConfig: 'Start setup',
    skip: 'Skip and look around',
    docsIntro: 'New here?',
    docsIntroLink: 'Read the intro',
    docsFull: 'Full documentation and examples',
    stepsLabel: 'Provider → API key → Ready',
    next: 'Next',
    prev: 'Back',
    saveAndStart: 'Save and start',
    saving: 'Saving…',
    providerTitle: 'Which model provider do you use?',
    providerDeepseek: 'DeepSeek',
    providerDeepseekHint: 'Recommended · cheap and capable',
    providerQwen: 'Alibaba DashScope (Qwen)',
    providerKimi: 'Moonshot (Kimi)',
    providerDoubao: 'Volcengine Ark (Doubao)',
    providerGlobal: 'OpenAI / Claude / Gemini',
    providerCustom: 'Other / self-hosted proxy',
    customBasePlaceholder: 'API base URL, e.g. https://api.example.com/v1',
    keyTitle: 'Paste your API key',
    keyHint: 'Create an API key in your provider console and paste it here',
    keyPlaceholder: 'sk-...',
    keyOpenSite: 'Open console',
    verify: 'Verify',
    verifying: 'Verifying…',
    verifyOk: 'Connected · {count} models found',
    verifyFailAuth: 'Invalid or expired API key',
    verifyFailTimeout: 'Request timed out, please retry',
    verifyFailNetwork: 'Network error, check your connection or API base',
    verifyFailNoModels: 'No model list returned; you can type a model name manually',
    verifyFailHttp: 'Unexpected response, check the API base',
    modelLabel: 'Model',
    modelManualPlaceholder: 'Enter model name',
    doneTitle: 'Ready — try it on something real',
    doneSubtitle: 'Click any example to fill the input box',
    exampleSummary: 'Summarize this page and export to Word',
    exampleTable: 'Turn this page\'s table into CSV',
    exampleWatch: 'Watch this page every day at 9am and report',
    agentCardTitle: 'Want the AI to read local files and run commands? Install the Agent',
    agentCardLink: 'Learn more',
    statusUnconfigured: 'No model configured',
    statusConfigure: 'Set up',
    welcomeTagline: 'One sentence, and the AI works the page for you',
    close: 'Close',
  },
});
```

- [ ] **Step 4: 运行测试，确认通过**

Run: `npx vitest run test/unit/onboarding-core.unit.test.js`
Expected: PASS。

- [ ] **Step 5: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 3: 向导 DOM 与四屏状态机

**Files:**
- Modify: `src/side_panel/onboarding-wizard.js`（追加在翻译注册之后）

- [ ] **Step 1: 追加状态与工具函数**

```js
const ERROR_TEXT_KEYS = {
  auth: 'onboarding.verifyFailAuth',
  timeout: 'onboarding.verifyFailTimeout',
  network: 'onboarding.verifyFailNetwork',
  noModels: 'onboarding.verifyFailNoModels',
  http: 'onboarding.verifyFailHttp',
  invalidConfig: 'onboarding.verifyFailAuth',
};

const view = {
  root: null,
  open: false,
  step: 0,              // 0 介绍 / 1 选服务商 / 2 填 Key / 3 完成
  providerId: 'deepseek',
  apiBase: 'https://api.deepseek.com',
  apiKey: '',
  models: [],
  modelName: '',
  verifying: false,
  verifyError: '',
  saving: false,
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function docsLink(extraClass = '') {
  return `<a class="onboarding-doc-link ${extraClass}" href="${DOCS_URL}" target="_blank" rel="noopener noreferrer">${esc(t('onboarding.docsFull'))} ↗</a>`;
}
```

- [ ] **Step 2: 追加四屏渲染函数**

```js
function renderStep0() {
  const chips = PROVIDERS.slice(0, 3).map(p =>
    `<span class="onboarding-chip">${esc(t(p.labelKey))}</span>`).join('');
  return `
    <div class="onboarding-dialog" role="dialog" aria-modal="true">
      <div class="onboarding-title">${esc(t('onboarding.step0Title'))}</div>
      <div class="onboarding-subtitle">${esc(t('onboarding.step0Subtitle'))}</div>
      <div class="onboarding-chips">${chips}</div>
      <button class="onboarding-primary" data-action="start">${esc(t('onboarding.startConfig'))}</button>
      <button class="onboarding-link" data-action="skip">${esc(t('onboarding.skip'))}</button>
      <div class="onboarding-doc">${esc(t('onboarding.docsIntro'))}
        <a href="${DOCS_URL}" target="_blank" rel="noopener noreferrer">${esc(t('onboarding.docsIntroLink'))} ↗</a>
      </div>
    </div>`;
}

function renderStep1() {
  const cards = PROVIDERS.map(p => `
    <button class="onboarding-provider${p.id === view.providerId ? ' is-active' : ''}" data-provider="${p.id}">
      <span class="onboarding-provider-name">${esc(t(p.labelKey))}</span>
      ${p.hintKey ? `<span class="onboarding-provider-hint">${esc(t(p.hintKey))}</span>` : ''}
    </button>`).join('');
  const custom = providerById(view.providerId).custom
    ? `<input class="onboarding-input" id="onboardingCustomBase" placeholder="${esc(t('onboarding.customBasePlaceholder'))}" value="${esc(view.apiBase)}">`
    : '';
  return `
    <div class="onboarding-dialog" role="dialog" aria-modal="true">
      <div class="onboarding-steps">${esc(t('onboarding.stepsLabel'))}</div>
      <div class="onboarding-title">${esc(t('onboarding.providerTitle'))}</div>
      <div class="onboarding-provider-list">${cards}</div>
      ${custom}
      <div class="onboarding-actions">
        <button class="onboarding-link" data-action="skip">${esc(t('onboarding.skip'))}</button>
        <button class="onboarding-primary" data-action="next">${esc(t('onboarding.next'))}</button>
      </div>
    </div>`;
}

function renderStep2() {
  const ok = view.models.length > 0;
  const status = view.verifying
    ? `<div class="onboarding-status is-loading">${esc(t('onboarding.verifying'))}</div>`
    : view.verifyError
      ? `<div class="onboarding-status is-error">${esc(t(ERROR_TEXT_KEYS[view.verifyError] || 'onboarding.verifyFailHttp'))}</div>`
      : ok
        ? `<div class="onboarding-status is-ok">✓ ${esc(t('onboarding.verifyOk', { count: view.models.length }))}</div>`
        : '';
  const modelField = ok
    ? `<select class="onboarding-input" id="onboardingModel">${view.models.map(m =>
        `<option value="${esc(m)}"${m === view.modelName ? ' selected' : ''}>${esc(m)}</option>`).join('')}</select>`
    : `<input class="onboarding-input" id="onboardingModelManual" placeholder="${esc(t('onboarding.modelManualPlaceholder'))}" value="${esc(view.modelName)}">`;
  return `
    <div class="onboarding-dialog" role="dialog" aria-modal="true">
      <div class="onboarding-steps">${esc(t('onboarding.stepsLabel'))}</div>
      <div class="onboarding-title">${esc(t('onboarding.keyTitle'))}</div>
      <div class="onboarding-subtitle">${esc(t('onboarding.keyHint'))}</div>
      <div class="onboarding-key-row">
        <input class="onboarding-input" id="onboardingKey" type="password" placeholder="${esc(t('onboarding.keyPlaceholder'))}" value="${esc(view.apiKey)}">
        <button class="onboarding-ghost" data-action="verify">${esc(view.verifying ? t('onboarding.verifying') : t('onboarding.verify'))}</button>
      </div>
      ${status}
      <div class="onboarding-model-label">${esc(t('onboarding.modelLabel'))}</div>
      ${modelField}
      <div class="onboarding-actions">
        <button class="onboarding-link" data-action="prev">${esc(t('onboarding.prev'))}</button>
        <button class="onboarding-primary" data-action="save"${view.verifying || view.saving ? ' disabled' : ''}>
          ${esc(view.saving ? t('onboarding.saving') : t('onboarding.saveAndStart'))}
        </button>
      </div>
    </div>`;
}

function renderStep3() {
  const cards = EXAMPLE_TASKS.map(x =>
    `<button class="onboarding-example" data-example="${esc(t(x.promptKey))}">
       <span class="onboarding-example-icon">${x.icon}</span>${esc(t(x.promptKey))}
     </button>`).join('');
  return `
    <div class="onboarding-dialog" role="dialog" aria-modal="true">
      <div class="onboarding-title">${esc(t('onboarding.doneTitle'))}</div>
      <div class="onboarding-subtitle">${esc(t('onboarding.doneSubtitle'))}</div>
      <div class="onboarding-examples">${cards}</div>
      <button class="onboarding-agent-card" data-action="agent">
        ${esc(t('onboarding.agentCardTitle'))} <span class="onboarding-agent-link">${esc(t('onboarding.agentCardLink'))} →</span>
      </button>
      ${docsLink()}
      <button class="onboarding-link" data-action="close">${esc(t('onboarding.close'))}</button>
    </div>`;
}

function render() {
  if (!view.root) return;
  if (!view.open) {
    view.root.innerHTML = '';
    view.root.classList.remove('is-open');
    return;
  }
  view.root.classList.add('is-open');
  const body = [renderStep0, renderStep1, renderStep2, renderStep3][view.step]();
  view.root.innerHTML = `
    <div class="onboarding-mask" data-action="skip"></div>
    ${body}`;
  bindActions();
}
```

- [ ] **Step 4: 追加事件绑定（先只支持导航与关闭）**

```js
function bindActions() {
  view.root.querySelectorAll('[data-provider]').forEach(el => {
    el.addEventListener('click', () => {
      const p = providerById(el.dataset.provider);
      view.providerId = p.id;
      view.apiBase = p.apiBase;
      view.apiKey = '';
      view.models = [];
      view.modelName = '';
      view.verifyError = '';
      render();
    });
  });
  view.root.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    view.step = 1; render();
  });
  view.root.querySelectorAll('[data-action="next"]').forEach(el => {
    el.addEventListener('click', () => {
      const customInput = document.getElementById('onboardingCustomBase');
      if (customInput) view.apiBase = customInput.value.trim();
      view.step = 2; render();
    });
  });
  view.root.querySelectorAll('[data-action="prev"]').forEach(el => {
    el.addEventListener('click', () => { view.step = 1; render(); });
  });
  view.root.querySelectorAll('[data-action="skip"]').forEach(el => {
    el.addEventListener('click', () => closeWizard({ markDone: true }));
  });
  view.root.querySelectorAll('[data-action="close"]').forEach(el => {
    el.addEventListener('click', () => closeWizard({ markDone: true }));
  });
  view.root.querySelectorAll('[data-example]').forEach(el => {
    el.addEventListener('click', () => fillInput(el.dataset.example));
  });
  view.root.querySelector('[data-action="agent"]')?.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'agent' });
    closeWizard({ markDone: true });
  });
}
```

- [ ] **Step 5: 构建校验**

Run: `npm run build:silent`
Expected: 无错误（此时 `closeWizard`/`fillInput` 尚未定义会被 ESLint 提示，但它们在下个任务定义，本步只要求构建通过；若 lint 报未定义则先跳到 Task 4 再统一校验）。

---

### Task 4: 校验、保存与输入回填

**Files:**
- Modify: `src/side_panel/onboarding-wizard.js`

- [ ] **Step 1: 追加校验与保存**

```js
let verifyTimer = null;

function scheduleVerify() {
  clearTimeout(verifyTimer);
  verifyTimer = setTimeout(() => { runVerify(); }, 600);
}

async function runVerify() {
  const keyEl = document.getElementById('onboardingKey');
  const baseEl = document.getElementById('onboardingCustomBase');
  if (keyEl) view.apiKey = keyEl.value.trim();
  if (baseEl) view.apiBase = baseEl.value.trim();
  if (!view.apiKey || !view.apiBase) return;

  view.verifying = true;
  view.verifyError = '';
  render();
  try {
    const models = await fetchModelList({ apiBase: view.apiBase, apiKey: view.apiKey });
    view.models = models;
    view.modelName = pickDefaultModel(models, view.apiBase);
  } catch (err) {
    view.models = [];
    view.verifyError = classifyFetchError(err);
    logger.warn('[Onboarding] verify failed:', err && err.message);
  } finally {
    view.verifying = false;
    render();
  }
}

async function persistConfig() {
  const payload = {
    apiBase: view.apiBase,
    apiKey: view.apiKey,
    modelName: view.modelName,
    models: view.models,
  };
  await ensureProfilesMigrated({});
  const { activeProfileId } = await getState();
  if (activeProfileId) return updateActiveProfile(payload);
  return createProfile({ name: t(providerById(view.providerId).labelKey), ...payload }, { activate: true });
}

async function saveAndFinish() {
  if (view.saving) return;
  if (!view.apiKey || !view.modelName) return;
  view.saving = true;
  render();
  try {
    await persistConfig();
    view.saving = false;
    view.step = 3;
    render();
    refreshStatusBar();
    document.dispatchEvent(new CustomEvent('ai-helper:model-configured'));
  } catch (err) {
    view.saving = false;
    render();
    logger.warn('[Onboarding] save failed:', err && err.message);
    showToast(t('onboarding.verifyFailHttp'), 'error');
  }
}

function fillInput(text) {
  const input = document.getElementById('userInput');
  if (input) {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.focus();
  }
  closeWizard({ markDone: true });
}
```

- [ ] **Step 2: 在 `bindActions()` 中接入 Key 输入与保存**

在 `bindActions()` 末尾追加：

```js
  const keyEl = document.getElementById('onboardingKey');
  if (keyEl) {
    keyEl.addEventListener('input', () => { view.apiKey = keyEl.value.trim(); scheduleVerify(); });
    keyEl.addEventListener('blur', () => { view.apiKey = keyEl.value.trim(); if (view.apiKey) runVerify(); });
  }
  const baseEl = document.getElementById('onboardingCustomBase');
  if (baseEl) baseEl.addEventListener('input', () => { view.apiBase = baseEl.value.trim(); });

  const modelSel = document.getElementById('onboardingModel');
  if (modelSel) modelSel.addEventListener('change', () => { view.modelName = modelSel.value; });
  const modelManual = document.getElementById('onboardingModelManual');
  if (modelManual) modelManual.addEventListener('input', () => { view.modelName = modelManual.value.trim(); });

  view.root.querySelector('[data-action="verify"]')?.addEventListener('click', runVerify);
  view.root.querySelector('[data-action="save"]')?.addEventListener('click', saveAndFinish);
```

- [ ] **Step 3: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 5: 跳过、状态条、首页示例与对外接口

**Files:**
- Modify: `src/side_panel/onboarding-wizard.js`

- [ ] **Step 1: 追加对外接口与状态条**

```js
async function markDone() {
  await chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: Date.now() });
}

function closeWizard({ markDone: shouldMark = false } = {}) {
  view.open = false;
  render();
  if (shouldMark) markDone().catch(() => {});
}

export function openOnboardingWizard() {
  view.open = true;
  view.step = 0;
  view.verifying = false;
  view.saving = false;
  view.verifyError = '';
  render();
}

async function refreshStatusBar() {
  const bar = document.getElementById('onboardingStatusBar');
  if (!bar) return;
  const cfg = await chrome.storage.local.get(['apiKey', 'modelName']);
  const configured = isModelConfigured({ apiKey: decodeSecret(cfg.apiKey), modelName: cfg.modelName });
  bar.style.display = configured ? 'none' : '';
}

function decorateWelcome() {
  const box = document.getElementById('welcomeExamples');
  if (!box) return;
  box.innerHTML = EXAMPLE_TASKS.map(x =>
    `<button class="welcome-example" data-example="${esc(t(x.promptKey))}">${x.icon} ${esc(t(x.promptKey))}</button>`
  ).join('');
  box.querySelectorAll('[data-example]').forEach(el => {
    el.addEventListener('click', () => fillInput(el.dataset.example));
  });
}

export async function maybeShowOnboardingWizard() {
  const cfg = await chrome.storage.local.get(['apiKey', 'modelName', ONBOARDING_DONE_KEY]);
  const configured = isModelConfigured({ apiKey: decodeSecret(cfg.apiKey), modelName: cfg.modelName });
  if (shouldAutoShow({ configured, dismissedAt: cfg[ONBOARDING_DONE_KEY] })) openOnboardingWizard();
}

export function initOnboardingWizard() {
  view.root = document.getElementById('onboardingRoot');
  if (!view.root) return;
  refreshStatusBar();
  decorateWelcome();
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view.open) closeWizard({ markDone: true });
  });
  document.addEventListener('ai-helper:model-configured', () => { refreshStatusBar(); });
  document.getElementById('onboardingStatusBar')?.addEventListener('click', () => openOnboardingWizard());
  subscribe(() => { if (view.open) render(); decorateWelcome(); });
}
```

- [ ] **Step 2: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 6: 侧边栏接线（HTML 容器 + index.js）

**Files:**
- Modify: `side_panel.html:291-297`、`side_panel.html:579-580`
- Modify: `src/side_panel/index.js`（import 区与 `DOMContentLoaded` 注册区）

- [ ] **Step 1: 在 `.welcome-message` 内新增示例容器**

把 `side_panel.html` 的欢迎区改为：

```html
    <div class="welcome-message">
      <div class="icon-wrapper">
        <div class="icon">💬</div>
      </div>
      <h2 data-i18n="chat.welcomeTitle">开始对话</h2>
      <p data-i18n="chat.welcomeSubtitle">输入您的问题，AI 助手将为您解答</p>
      <div class="welcome-examples" id="welcomeExamples"></div>
    </div>
```

- [ ] **Step 2: 在输入区之前新增未配置状态条**

在 `side_panel.html` 的 `<div class="input-container">` 之前插入：

```html
  <!-- 未配置模型时的常驻提示条（配置完成后由 onboarding-wizard.js 隐藏） -->
  <button class="onboarding-status-bar" id="onboardingStatusBar" type="button" style="display: none;">
    <span class="onboarding-status-dot" aria-hidden="true">⚠</span>
    <span data-i18n="onboarding.statusUnconfigured">未配置模型</span>
    <span class="onboarding-status-action" data-i18n="onboarding.statusConfigure">去配置</span>
  </button>
```

- [ ] **Step 3: 在 body 末尾新增向导挂载点**

在 `side_panel.html` 的 `</body>` 之前插入：

```html
  <!-- 首次使用配置向导挂载点：DOM 由 onboarding-wizard.js 构建 -->
  <div id="onboardingRoot"></div>
```

- [ ] **Step 4: 在 index.js 中导入并初始化**

在 `import { initUsageTips } from './usage-tips.js';` 之后加一行：

```js
import { initOnboardingWizard, maybeShowOnboardingWizard } from './onboarding-wizard.js';
```

在 `document.addEventListener('DOMContentLoaded', initUsageTips);` 之后加：

```js
// 首次使用引导：未配置模型时自动弹配置向导（用户可跳过，之后仅通过状态条手动唤起）
document.addEventListener('DOMContentLoaded', async () => {
  initOnboardingWizard();
  try { await maybeShowOnboardingWizard(); } catch (e) { /* 引导失败不阻塞侧边栏 */ }
});
```

- [ ] **Step 5: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 7: 发送拦截

**Files:**
- Modify: `src/side_panel/chat-manager.js`（`sendMessage()` 内，约 1205 行 `const text = ...` 之后）

- [ ] **Step 1: 顶部补 import**

在 `chat-manager.js` 的 import 区加：

```js
import { decodeSecret } from '../shared/secret.js';
import { isModelConfigured } from './onboarding-core.js';
```

- [ ] **Step 2: 在发送前插入拦截**

在 `if (!text) return { ok: false, reason: 'empty' };` 之后插入：

```js
  // 未配置模型时不发请求：直接唤起配置向导，避免新用户只看到一条 401
  const cfgSnapshot = await chrome.storage.local.get(['apiKey', 'modelName']);
  if (!isModelConfigured({ apiKey: decodeSecret(cfgSnapshot.apiKey), modelName: cfgSnapshot.modelName })) {
    const { openOnboardingWizard } = await import('./onboarding-wizard.js');
    openOnboardingWizard();
    return { ok: false, reason: 'no_model_config' };
  }
```

- [ ] **Step 3: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 8: 样式

**Files:**
- Modify: `src/side_panel/styles.css`（文件末尾追加）

- [ ] **Step 1: 追加样式**

```css
/* ==================== 首次使用引导 ==================== */
#onboardingRoot { display: none; }
#onboardingRoot.is-open { display: block; }

.onboarding-mask {
  position: fixed; inset: 0; z-index: 4800;
  background: rgba(15, 18, 24, .32);
}
.onboarding-dialog {
  position: fixed; z-index: 4801;
  left: 10px; right: 10px; top: 56px;
  max-height: calc(100vh - 120px); overflow-y: auto;
  display: flex; flex-direction: column; gap: 8px;
  padding: 16px; border-radius: 14px;
  background: var(--bg-elevated, var(--bg-primary));
  border: 1px solid var(--border-default);
  box-shadow: 0 16px 40px rgba(0, 0, 0, .18);
}
.onboarding-title { font-size: 15px; font-weight: 700; color: var(--text-primary); }
.onboarding-subtitle { font-size: 12px; color: var(--text-secondary); line-height: 1.5; }
.onboarding-steps { font-size: 11px; color: var(--text-tertiary); }

.onboarding-primary {
  width: 100%; padding: 9px; border: none; border-radius: 9px; cursor: pointer;
  background: var(--brand-500); color: var(--text-on-brand); font-size: 13px; font-weight: 600;
}
.onboarding-primary:disabled { opacity: .55; cursor: not-allowed; }
.onboarding-link {
  width: 100%; padding: 6px; border: none; background: transparent; cursor: pointer;
  color: var(--text-tertiary); font-size: 12px;
}
.onboarding-doc { text-align: center; font-size: 11px; color: var(--text-tertiary); }
.onboarding-doc a, .onboarding-doc-link { color: var(--brand-500); text-decoration: none; }

.onboarding-chips { display: flex; gap: 6px; }
.onboarding-chip {
  flex: 1; text-align: center; padding: 5px; border-radius: 8px;
  border: 1px solid var(--border-default); font-size: 11px; color: var(--text-secondary);
}

.onboarding-provider-list { display: flex; flex-direction: column; gap: 6px; }
.onboarding-provider {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 9px 10px; border-radius: 9px; cursor: pointer; text-align: left;
  border: 1px solid var(--border-default); background: transparent;
  color: var(--text-primary); font-size: 12px;
}
.onboarding-provider.is-active { border-color: var(--brand-500); background: var(--brand-50, rgba(59,110,246,.08)); }
.onboarding-provider-hint { font-size: 10px; color: var(--brand-500); }

.onboarding-input {
  width: 100%; box-sizing: border-box; padding: 8px 10px; font-size: 12px;
  border-radius: 9px; border: 1px solid var(--border-default);
  background: var(--bg-primary); color: var(--text-primary);
}
.onboarding-key-row { display: flex; gap: 6px; }
.onboarding-ghost {
  flex: 0 0 auto; padding: 8px 12px; font-size: 12px; cursor: pointer;
  border-radius: 9px; border: 1px solid var(--border-default);
  background: transparent; color: var(--text-primary);
}
.onboarding-status { font-size: 11px; }
.onboarding-status.is-ok { color: var(--success-500, #1a8f5f); }
.onboarding-status.is-error { color: var(--danger-500, #d64545); }
.onboarding-status.is-loading { color: var(--text-tertiary); }
.onboarding-model-label { font-size: 11px; color: var(--text-tertiary); }
.onboarding-actions { display: flex; gap: 8px; align-items: center; }
.onboarding-actions .onboarding-primary { flex: 2; }
.onboarding-actions .onboarding-link { flex: 1; }

.onboarding-examples { display: flex; flex-direction: column; gap: 6px; }
.onboarding-example {
  display: flex; gap: 8px; align-items: center; padding: 9px 10px; cursor: pointer;
  border-radius: 9px; border: 1px solid var(--border-default); background: transparent;
  color: var(--text-primary); font-size: 12px; text-align: left;
}
.onboarding-agent-card {
  padding: 9px 10px; cursor: pointer; text-align: left; font-size: 11px;
  border-radius: 9px; border: 1px dashed var(--border-default);
  background: transparent; color: var(--text-tertiary);
}
.onboarding-agent-link { color: var(--brand-500); }

.onboarding-status-bar {
  display: flex; align-items: center; gap: 6px; width: calc(100% - 20px);
  margin: 0 10px 6px; padding: 6px 10px; cursor: pointer;
  border-radius: 8px; border: 1px solid var(--warning-border, #f3e3b3);
  background: var(--warning-bg, #fff8e6); color: var(--warning-text, #8a6a12);
  font-size: 11px; text-align: left;
}
.onboarding-status-action { margin-left: auto; font-weight: 600; text-decoration: underline; }

.welcome-examples { display: flex; flex-direction: column; gap: 6px; margin-top: 12px; width: 100%; }
.welcome-example {
  padding: 8px 10px; cursor: pointer; text-align: left; font-size: 12px;
  border-radius: 9px; border: 1px solid var(--border-default);
  background: transparent; color: var(--text-secondary);
}
.welcome-example:hover { border-color: var(--brand-500); color: var(--text-primary); }
```

- [ ] **Step 2: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 9: DOM 冒烟测试

**Files:**
- Create: `test/unit/onboarding-wizard-dom.unit.test.js`

- [ ] **Step 1: 写测试**

```js
// @vitest-environment jsdom
// onboarding-wizard-dom.unit.test.js - 首启向导挂载与跳过路径冒烟
import { describe, it, expect, beforeEach, vi } from 'vitest';

const store = {};
const setSpy = vi.fn(async (patch) => { Object.assign(store, patch); });

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async (keys) => {
        const out = {};
        for (const k of keys) out[k] = store[k];
        return out;
      }),
      set: setSpy,
    },
  },
  runtime: { sendMessage: vi.fn() },
};

const { initOnboardingWizard, maybeShowOnboardingWizard, openOnboardingWizard } =
  await import('../../src/side_panel/onboarding-wizard.js');

function setupDom() {
  document.body.innerHTML = `
    <div id="welcomeExamples"></div>
    <button id="onboardingStatusBar" style="display:none"></button>
    <textarea id="userInput"></textarea>
    <div id="onboardingRoot"></div>`;
}

describe('onboarding 向导', () => {
  beforeEach(() => {
    setupDom();
    Object.keys(store).forEach(k => delete store[k]);
    setSpy.mockClear();
    initOnboardingWizard();
  });

  it('未配置时自动弹出第一步', async () => {
    await maybeShowOnboardingWizard();
    expect(document.querySelector('.onboarding-dialog')).toBeTruthy();
    expect(document.body.textContent).toContain('先接上你的大模型');
  });

  it('已配置时不自动弹出', async () => {
    store.apiKey = 'sk-x';
    store.modelName = 'deepseek-chat';
    await maybeShowOnboardingWizard();
    expect(document.querySelector('.onboarding-dialog')).toBeFalsy();
  });

  it('点跳过关闭向导并写入已提示标记', async () => {
    openOnboardingWizard();
    const skip = [...document.querySelectorAll('[data-action="skip"]')][0];
    skip.click();
    await new Promise(r => setTimeout(r, 0));
    expect(document.querySelector('.onboarding-dialog')).toBeFalsy();
    expect(setSpy).toHaveBeenCalled();
    expect(store.onboardingWizardDismissedAt).toBeTruthy();
  });

  it('未配置时状态条可见', async () => {
    initOnboardingWizard();
    await new Promise(r => setTimeout(r, 0));
    expect(document.getElementById('onboardingStatusBar').style.display).not.toBe('none');
  });
});
```

- [ ] **Step 2: 运行测试**

Run: `npx vitest run test/unit/onboarding-wizard-dom.unit.test.js`
Expected: PASS。若找不到文案，先确认 Task 2 的翻译已注册。

- [ ] **Step 3: 构建校验**

Run: `npm run build:silent`
Expected: 无错误。

---

### Task 10: 全量校验与人工验收

- [ ] **Step 1: 跑单测与 lint**

Run: `npm run test:unit`
Expected: 全部通过（含既有用例）。

Run: `npx eslint src/side_panel/onboarding-core.js src/side_panel/onboarding-wizard.js src/side_panel/chat-manager.js`
Expected: 无 error。

- [ ] **Step 2: 构建**

Run: `npm run build`
Expected: 构建成功。

- [ ] **Step 3: 人工验收（加载 dist/ 到 chrome://extensions）**

逐条确认：

1. 清空 `chrome.storage.local`（DevTools → Application → Storage）后重开侧边栏 → 自动弹向导。
2. 选「通义」，粘贴有效 Key → 自动出现「✓ 连接成功 · 已获取 N 个模型」。
3. 点「保存并开始」→ 进入完成页 → 点示例卡片 → 输入框被填入且未发送。
4. 刷新侧边栏 → 不再自动弹，状态条消失。
5. 清空存储重开 → 点「跳过」→ 向导关闭，界面可正常操作，底部出现状态条。
6. 跳过后直接发消息 → 不发请求，向导重新弹出，Network 面板无 401。
7. 点状态条 → 可重新打开向导。
8. 切到英文 → 向导文案全英文，无中文残留。

- [ ] **Step 4: 收尾**

确认 `docs/superpowers/specs/2026-11-27-onboarding-model-wizard-design.md` 的实现差异（如有）已同步，例如 i18n 采用模块内自注册而非改 `locales/zh.js`。

---

## 自查记录

- **规格覆盖**：触发规则（Task 5/6）、四屏流程（Task 3）、校验与保存（Task 4）、跳过与状态条（Task 5）、发送拦截（Task 7）、文档入口（Task 3/4）、中英文案（Task 2）、首页示例（Task 5/6）、验收（Task 10）均有对应任务。
- **与规格的偏差**：i18n 文案改为在 `onboarding-wizard.js` 内 `registerTranslations` 自注册，沿用 `usage-tips.js` 的既有模式，不改动 `src/shared/locales/*.js` 两个大文件。
- **命名一致性**：`isModelConfigured` / `shouldAutoShow` / `pickDefaultModel` / `classifyFetchError` / `ONBOARDING_DONE_KEY` / `openOnboardingWizard` / `maybeShowOnboardingWizard` / `initOnboardingWizard` 在各任务中一致。
- **无占位符**：所有代码步骤均给出可直接写入的实现。
