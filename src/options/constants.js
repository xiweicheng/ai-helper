// options/constants.js - 常量定义

import { DEFAULT_REFLECTION_CONFIG, DEFAULT_REACT_CONFIG as _DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG as _DEFAULT_CHAT_CONFIG } from '../background/constants.js';
import { t, registerTranslations } from '../shared/i18n.js';

// 自注册本模块翻译（optionsConst 命名空间）
registerTranslations('zh', {
  optionsConst: {
    aiSearch: 'AI搜索',
    explain: '解释',
    translate: '翻译',
    summary: '总结',
    copy: '复制',
  },
});

registerTranslations('en', {
  optionsConst: {
    aiSearch: 'AI Search',
    explain: 'Explain',
    translate: 'Translate',
    summary: 'Summarize',
    copy: 'Copy',
  },
});

export const PRESET_MODELS = [
  'deepseek-v4-pro',
  'deepseek-v4-flash'
];

export const PRESET_IMAGE_MODELS = [];

export const PRESET_API_BASES = [
  'https://api.deepseek.com',
  'https://api.openai.com/v1',
  'https://api.anthropic.com/v1',
  'https://api.moonshot.cn/v1',
  'https://dashscope.aliyuncs.com/compatible-mode/v1',
  'https://api.baichuan-ai.com/v1',
  'https://open.bigmodel.cn/api/paas/v4',
  'https://api.siliconflow.cn/v1',
  'https://api.lingyiwanwu.com/v1',
  'https://ark.cn-beijing.volces.com/api/v3',
];

export const DEFAULT_SYSTEM_PROMPT = `AI Helper: IT Technical Assistant.

## Capabilities
Programming development and debugging (Java/Python/JavaScript/Go/C++), architecture optimization, performance tuning, code review, documentation writing, browser tool invocation

## Requirements
Precise technical terminology, runnable code examples, Markdown format, actionable solutions, no security-violating code`;

export const DEFAULT_REACT_CONFIG = _DEFAULT_REACT_CONFIG;

export const DEFAULT_TOOLBAR_TOOLS = [
  { id: 'ai-search',  name: t('optionsConst.aiSearch'), systemPrompt: 'You are processing content selected by the user on a web page. Use ReAct Agent mode to answer the selected question through multiple rounds of thinking, searching, and reasoning.', builtin: true, order: 0 },
  { id: 'explain',   name: t('optionsConst.explain'),   systemPrompt: 'You are processing content selected by the user on a web page. Explain the selected content in 1-3 concise sentences, adding a brief example if necessary. Do not elaborate at length.', builtin: true, order: 1 },
  { id: 'translate', name: t('optionsConst.translate'), systemPrompt: 'You are processing content selected by the user on a web page. Auto-detect language: Chinese to English, English to Chinese, other languages provide both Chinese and English. Output only the translation result without additional explanations.', builtin: true, order: 2 },
  { id: 'summary',   name: t('optionsConst.summary'),   systemPrompt: 'You are processing content selected by the user on a web page. Summarize the selected content in 3-5 key points, one sentence per point, distilling the core information.', builtin: true, order: 3 },
  { id: 'copy',      name: t('optionsConst.copy'),      systemPrompt: 'Copy the selected content to the clipboard.', builtin: true, order: 99 }
];

export const DEFAULT_TOOLBAR_MAX_VISIBLE = 5;
export const DEFAULT_TOOLBAR_ICON_ONLY = false;
export const DEFAULT_ENABLE_SELECTION_TOOLBAR = true;

export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  ..._DEFAULT_CHAT_CONFIG
};

export { DEFAULT_REFLECTION_CONFIG };
