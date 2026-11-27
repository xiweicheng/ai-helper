// src/side_panel/onboarding-wizard.js
// 首次使用引导：四屏配置向导 + 未配置状态条 + 首页示例胶囊。
// 只负责展示与交互；判定/选择逻辑在 onboarding-core.js。

import { t, registerTranslations, subscribe, getLanguage } from '../shared/i18n.js';
import { decodeSecret } from '../shared/secret.js';
import { createProfile, getState, updateActiveProfile, applyProfile, ensureProfilesMigrated } from '../shared/model-profiles.js';
import { fetchModelList } from '../options/model-fetcher.js';
import { showToast } from './utils.js';
import state from './state.js';
import logger from '../shared/logger.js';
import {
  DOCS_URL, ONBOARDING_DONE_KEY, ONBOARDING_REQUEST_KEY, PROVIDERS, EXAMPLE_TASKS,
  providerById, isModelConfigured, shouldAutoShow, pickDefaultModel, classifyFetchError,
  getProviderShowcase,
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
    providerOpenai: 'OpenAI',
    providerGemini: 'Google Gemini',
    providerClaude: 'Anthropic Claude',
    providerClaudeHint: '需中转，暂不支持官方直连',
    providerCustom: '其他 / 自建中转',
    customBasePlaceholder: 'API Base URL，如 https://api.example.com/v1',
    baseRequired: '请先填写服务商提供的 API Base 地址',
    baseLabel: 'API Base 地址',
    baseHint: '已按所选厂商自动带入，如与服务商文档不一致可手动修改',
    keyTitle: '粘贴 API Key',
    keyHint: '在服务商控制台创建 API Key 后粘贴到这里',
    keyPlaceholder: 'sk-...',
    keyShow: '显示明文',
    keyHide: '隐藏明文',
    keyOpenSite: '去创建',
    verify: '验证',
    verifying: '验证中…',
    verifyOk: '连接成功 · 已获取 {count} 个模型',
    verifyFailAuth: 'Key 无效或已失效',
    verifyFailTimeout: '请求超时，请重试',
    verifyFailNetwork: '网络异常，请检查网络或 API 地址',
    verifyFailNoModels: '该接口没有返回模型列表，可手动填写模型名',
    verifyFailHttp: '接口返回异常，请检查 API 地址',
    verifyFailInvalidConfig: 'API 地址不完整，请补全后重试',
    saveFailed: '保存失败，请重试',
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
    step0Subtitle: 'Works with OpenAI, Claude, Gemini, DeepSeek, Qwen, or any OpenAI-compatible endpoint',
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
    providerOpenai: 'OpenAI',
    providerGemini: 'Google Gemini',
    providerClaude: 'Anthropic Claude',
    providerClaudeHint: 'Needs a relay; direct API not supported yet',
    providerCustom: 'Other / self-hosted proxy',
    customBasePlaceholder: 'API base URL, e.g. https://api.example.com/v1',
    baseRequired: 'Enter the API base URL from your provider first',
    baseLabel: 'API base URL',
    baseHint: 'Filled in from the selected provider; edit it if it differs from the docs',
    keyTitle: 'Paste your API key',
    keyHint: 'Create an API key in your provider console and paste it here',
    keyPlaceholder: 'sk-...',
    keyShow: 'Show key',
    keyHide: 'Hide key',
    keyOpenSite: 'Open console',
    verify: 'Verify',
    verifying: 'Verifying…',
    verifyOk: 'Connected · {count} models found',
    verifyFailAuth: 'Invalid or expired API key',
    verifyFailTimeout: 'Request timed out, please retry',
    verifyFailNetwork: 'Network error, check your connection or API base',
    verifyFailNoModels: 'No model list returned; you can type a model name manually',
    verifyFailHttp: 'Unexpected response, check the API base',
    verifyFailInvalidConfig: 'API base URL is incomplete',
    saveFailed: 'Save failed, please try again',
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

const ERROR_TEXT_KEYS = {
  auth: 'onboarding.verifyFailAuth',
  timeout: 'onboarding.verifyFailTimeout',
  network: 'onboarding.verifyFailNetwork',
  noModels: 'onboarding.verifyFailNoModels',
  http: 'onboarding.verifyFailHttp',
  invalidConfig: 'onboarding.verifyFailInvalidConfig',
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
  keyVisible: false,
  baseError: false,
};

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function docsLink(extraClass = '') {
  return `<a class="onboarding-doc-link ${extraClass}" href="${DOCS_URL}" target="_blank" rel="noopener noreferrer">${esc(t('onboarding.docsFull'))} ↗</a>`;
}

function renderStep0() {
  // 走马灯：两组相同内容首尾相接，轨道位移 50% 即无缝循环；顺序随界面语言切换
  const chips = getProviderShowcase(getLanguage())
    .map(p => `<span class="onboarding-chip">${esc(t(p.labelKey))}</span>`).join('');
  const group = `<div class="onboarding-marquee-group">${chips}</div>`;
  return `
    <div class="onboarding-dialog" role="dialog" aria-modal="true">
      <div class="onboarding-title">${esc(t('onboarding.step0Title'))}</div>
      <div class="onboarding-subtitle">${esc(t('onboarding.step0Subtitle'))}</div>
      <div class="onboarding-marquee" aria-hidden="true">
        <div class="onboarding-marquee-track">${group}${group}</div>
      </div>
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
  return `
    <div class="onboarding-dialog" role="dialog" aria-modal="true" tabindex="-1">
      <div class="onboarding-steps">${esc(t('onboarding.stepsLabel'))}</div>
      <div class="onboarding-title">${esc(t('onboarding.providerTitle'))}</div>
      <div class="onboarding-provider-list">${cards}</div>
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
        <input class="onboarding-input" id="onboardingKey" type="${view.keyVisible ? 'text' : 'password'}" placeholder="${esc(t('onboarding.keyPlaceholder'))}" value="${esc(view.apiKey)}">
        <button class="onboarding-ghost onboarding-eye" data-action="toggle-key" title="${esc(t(view.keyVisible ? 'onboarding.keyHide' : 'onboarding.keyShow'))}" aria-label="${esc(t(view.keyVisible ? 'onboarding.keyHide' : 'onboarding.keyShow'))}">${view.keyVisible ? '🙈' : '👁'}</button>
        <button class="onboarding-ghost" data-action="verify">${esc(view.verifying ? t('onboarding.verifying') : t('onboarding.verify'))}</button>
      </div>
      <div class="onboarding-model-label">${esc(t('onboarding.baseLabel'))}</div>
      <input class="onboarding-input" id="onboardingBase" placeholder="${esc(t('onboarding.customBasePlaceholder'))}" value="${esc(view.apiBase)}">
      <div class="onboarding-base-hint">${esc(t('onboarding.baseHint'))}</div>
      ${view.baseError ? `<div class="onboarding-status is-error onboarding-base-error">${esc(t('onboarding.baseRequired'))}</div>` : ''}
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
  // 弹层打开/切步骤时把焦点移入，避免键盘用户仍在背景页面里操作
  const dlg = view.root.querySelector('.onboarding-dialog');
  if (dlg) {
    dlg.setAttribute('tabindex', '-1');
    if (view.step !== lastFocusedStep) {
      lastFocusedStep = view.step;
      dlg.focus();
    }
  }
  bindActions();
}

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
      view.baseError = false;
      verifySeq++;
      render();
    });
  });
  view.root.querySelector('[data-action="start"]')?.addEventListener('click', () => {
    view.step = 1; render();
  });
  view.root.querySelectorAll('[data-action="next"]').forEach(el => {
    el.addEventListener('click', () => {
      // API Base 统一在第 2 步展示并允许修改，这里只做步骤切换
      view.baseError = false;
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

  const keyEl = document.getElementById('onboardingKey');
  if (keyEl) {
    keyEl.addEventListener('input', () => { view.apiKey = keyEl.value.trim(); scheduleVerify(); });
    // blur 往往由点击「验证 / 保存 / 明文切换」触发；同步 render 会把点击目标节点换掉，
    // 导致那次点击落空，所以延后校验。
    keyEl.addEventListener('blur', () => {
      view.apiKey = keyEl.value.trim();
      if (!view.apiKey) return;
      setTimeout(() => { if (view.open && view.step === 2) runVerify(); }, 300);
    });
  }
  const baseEl = document.getElementById('onboardingBase');
  if (baseEl) {
    baseEl.addEventListener('input', () => {
      view.apiBase = baseEl.value.trim();
      if (view.baseError && view.apiBase) {
        view.baseError = false;
        view.root.querySelector('.onboarding-base-error')?.remove();
      }
      // Base 改了需要重新校验，否则会沿用旧地址拉到的模型列表
      if (view.apiKey) scheduleVerify();
    });
  }

  const modelSel = document.getElementById('onboardingModel');
  if (modelSel) modelSel.addEventListener('change', () => { view.modelName = modelSel.value; });
  const modelManual = document.getElementById('onboardingModelManual');
  if (modelManual) modelManual.addEventListener('input', () => { view.modelName = modelManual.value.trim(); });

  view.root.querySelector('[data-action="verify"]')?.addEventListener('click', runVerify);
  view.root.querySelector('[data-action="save"]')?.addEventListener('click', saveAndFinish);

  // 明文切换：直接改 input.type，不重渲染，避免输入焦点与光标位置丢失
  const toggleKeyBtn = view.root.querySelector('[data-action="toggle-key"]');
  if (toggleKeyBtn) {
    // 按下时阻止默认，避免输入框先 blur 触发校验把按钮重渲染掉
    toggleKeyBtn.addEventListener('mousedown', (e) => e.preventDefault());
    toggleKeyBtn.addEventListener('click', () => {
      view.keyVisible = !view.keyVisible;
      const keyInput = document.getElementById('onboardingKey');
      if (keyInput) keyInput.type = view.keyVisible ? 'text' : 'password';
      toggleKeyBtn.textContent = view.keyVisible ? '🙈' : '👁';
      toggleKeyBtn.title = t(view.keyVisible ? 'onboarding.keyHide' : 'onboarding.keyShow');
      toggleKeyBtn.setAttribute('aria-label', toggleKeyBtn.title);
    });
  }
}

let verifyTimer = null;
let verifySeq = 0;
let lastFocusedStep = -1;

function scheduleVerify() {
  clearTimeout(verifyTimer);
  verifyTimer = setTimeout(() => {
    verifyTimer = null;
    if (!view.open || view.step !== 2) return;
    runVerify();
  }, 600);
}

async function runVerify() {
  const keyEl = document.getElementById('onboardingKey');
  const baseEl = document.getElementById('onboardingCustomBase');
  if (keyEl) view.apiKey = keyEl.value.trim();
  if (baseEl) view.apiBase = baseEl.value.trim();
  if (!view.apiKey) return;
  if (!view.apiBase) {
    view.baseError = true;
    render();
    return;
  }

  // 只有最后一次校验可以写回结果：切服务商/改 Key 时旧响应晚到不会覆盖新结果
  const seq = ++verifySeq;
  view.verifying = true;
  view.verifyError = '';
  render();
  try {
    const models = await fetchModelList({ apiBase: view.apiBase, apiKey: view.apiKey });
    if (seq !== verifySeq) return;
    view.models = models;
    view.modelName = pickDefaultModel(models, view.apiBase);
  } catch (err) {
    if (seq !== verifySeq) return;
    view.models = [];
    view.verifyError = classifyFetchError(err);
    logger.warn('[Onboarding] verify failed:', err && err.message);
  } finally {
    if (seq === verifySeq) {
      view.verifying = false;
      render();
    }
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
  if (activeProfileId) {
    await updateActiveProfile(payload);
    // updateActiveProfile 只写 profiles，不回写扁平键；不 applyProfile 的话
    // 状态条/发送拦截/后台请求读到的仍是旧 Key，等于没配置成功。
    return applyProfile(activeProfileId);
  }
  return createProfile({ name: t(providerById(view.providerId).labelKey), ...payload }, { activate: true });
}

async function saveAndFinish() {
  if (view.saving) return;
  if (!view.apiKey || !view.modelName) return;
  if (!view.apiBase) {
    view.baseError = true;
    render();
    return;
  }
  view.saving = true;
  render();
  try {
    await persistConfig();
    view.saving = false;
    view.step = 3;
    render();
    refreshStatusBar();
    markDone().catch(() => {});
    document.dispatchEvent(new CustomEvent('ai-helper:model-configured'));
  } catch (err) {
    view.saving = false;
    render();
    logger.warn('[Onboarding] save failed:', err && err.message);
    showToast(t('onboarding.saveFailed'), 'error');
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

async function markDone() {
  await chrome.storage.local.set({ [ONBOARDING_DONE_KEY]: Date.now() });
}

function closeWizard({ markDone: shouldMark = false } = {}) {
  view.open = false;
  view.verifying = false;
  verifySeq++;
  clearTimeout(verifyTimer);
  verifyTimer = null;
  lastFocusedStep = -1;
  render();
  if (shouldMark) markDone().catch(() => {});
}

export function openOnboardingWizard() {
  view.open = true;
  view.step = 0;
  view.verifying = false;
  view.saving = false;
  view.verifyError = '';
  view.baseError = false;
  verifySeq++;
  lastFocusedStep = -1;
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
  box.innerHTML = `<div class="welcome-tagline">${esc(t('onboarding.welcomeTagline'))}</div>`
    + EXAMPLE_TASKS.map(x =>
      `<button class="welcome-example" data-example="${esc(t(x.promptKey))}">${x.icon} ${esc(t(x.promptKey))}</button>`
    ).join('');
  box.querySelectorAll('[data-example]').forEach(el => {
    el.addEventListener('click', () => fillInput(el.dataset.example));
  });
}

export async function maybeShowOnboardingWizard() {
  // 正在生成时不弹，避免打断当前回答
  if (state.generatingSessionIds && state.generatingSessionIds.size > 0) return;
  const cfg = await chrome.storage.local.get(['apiKey', 'modelName', ONBOARDING_DONE_KEY]);
  const configured = isModelConfigured({ apiKey: decodeSecret(cfg.apiKey), modelName: cfg.modelName });
  if (shouldAutoShow({ configured, dismissedAt: cfg[ONBOARDING_DONE_KEY] })) openOnboardingWizard();
}

export function initOnboardingWizard() {
  view.root = document.getElementById('onboardingRoot');
  if (!view.root) return;
  refreshStatusBar();
  decorateWelcome();
  // 设置页点击「重新打开配置向导」时侧边栏可能刚开始加载，这里补消费一次请求标记
  chrome.storage.local.get(ONBOARDING_REQUEST_KEY).then(({ onboardingOpenRequestedAt }) => {
    if (onboardingOpenRequestedAt && Date.now() - onboardingOpenRequestedAt < 60000) {
      chrome.storage.local.remove(ONBOARDING_REQUEST_KEY).catch(() => {});
      openOnboardingWizard();
    }
  }).catch(() => {});
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && view.open) closeWizard({ markDone: true });
  });
  document.addEventListener('ai-helper:model-configured', () => { refreshStatusBar(); });
  // 弹层内 Tab 循环，不跑到遮罩后的背景控件
  view.root.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab' || !view.open) return;
    const nodes = Array.from(view.root.querySelectorAll(
      'button:not([disabled]), input:not([disabled]), select:not([disabled]), a[href]'
    ));
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    const active = document.activeElement;
    if (e.shiftKey && (active === first || active === view.root.querySelector('.onboarding-dialog'))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && active === last) {
      e.preventDefault();
      first.focus();
    }
  });
  // 设置页写入请求标记后立即弹向导；配置/Profile 变化时同步状态条
  chrome.storage.onChanged?.addListener((changes, area) => {
    if (area !== 'local') return;
    if (changes[ONBOARDING_REQUEST_KEY]?.newValue) openOnboardingWizard();
    if (changes.apiKey || changes.modelName || changes.modelProfiles || changes.activeProfileId) {
      refreshStatusBar();
    }
  });
  document.getElementById('onboardingStatusBar')?.addEventListener('click', () => openOnboardingWizard());
  subscribe(() => { if (view.open) render(); decorateWelcome(); });
}
