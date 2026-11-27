// 纯逻辑层：无 DOM、无网络、无 chrome 依赖，便于单测。
// DOM、请求、存储分别由 onboarding-wizard.js 负责。

export const DOCS_URL = 'https://xiweicheng.github.io/ai-helper/';
export const ONBOARDING_DONE_KEY = 'onboardingWizardDismissedAt';
export const ONBOARDING_REQUEST_KEY = 'onboardingOpenRequestedAt';

/** 服务商预设：needsBase 表示 apiBase 需要用户手填（自建中转 / 官方协议不兼容的厂商） */
export const PROVIDERS = [
  { id: 'deepseek', labelKey: 'onboarding.providerDeepseek', hintKey: 'onboarding.providerDeepseekHint', apiBase: 'https://api.deepseek.com', recommended: true },
  { id: 'qwen', labelKey: 'onboarding.providerQwen', apiBase: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'kimi', labelKey: 'onboarding.providerKimi', apiBase: 'https://api.moonshot.cn/v1' },
  { id: 'doubao', labelKey: 'onboarding.providerDoubao', apiBase: 'https://ark.cn-beijing.volces.com/api/v3' },
  { id: 'openai', labelKey: 'onboarding.providerOpenai', apiBase: 'https://api.openai.com/v1' },
  { id: 'gemini', labelKey: 'onboarding.providerGemini', apiBase: 'https://generativelanguage.googleapis.com/v1beta/openai' },
  // Anthropic 官方 API 不是 OpenAI 协议（x-api-key 头），只能走中转，因此必须手填 Base
  { id: 'claude', labelKey: 'onboarding.providerClaude', hintKey: 'onboarding.providerClaudeHint', apiBase: '', needsBase: true },
  { id: 'custom', labelKey: 'onboarding.providerCustom', apiBase: '', needsBase: true, custom: true },
];

const INTL_PROVIDER_IDS = new Set(['openai', 'gemini', 'claude']);

/** 完成页示例任务：promptKey 指向 i18n 文案 */
export const EXAMPLE_TASKS = [
  { id: 'summary', icon: '📄', promptKey: 'onboarding.exampleSummary' },
  { id: 'table', icon: '📊', promptKey: 'onboarding.exampleTable' },
  { id: 'watch', icon: '⏰', promptKey: 'onboarding.exampleWatch' },
];

export function providerById(id) {
  return PROVIDERS.find(p => p.id === id) || PROVIDERS[0];
}

/**
 * 首屏展示用的厂商列表（只展示，不含「其他/自建」）。
 * 中文环境国内厂商优先，英文环境把国际厂商排在最前，避免国外用户第一眼看到陌生品牌。
 * @param {'zh'|'en'} [lang]
 * @returns {Array<object>}
 */
export function getProviderShowcase(lang = 'zh') {
  const vendors = PROVIDERS.filter(p => !p.custom);
  if (lang === 'en') {
    return [
      ...vendors.filter(p => INTL_PROVIDER_IDS.has(p.id)),
      ...vendors.filter(p => !INTL_PROVIDER_IDS.has(p.id)),
    ];
  }
  return vendors;
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
