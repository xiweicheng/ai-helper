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
    defaultSystemPrompt: 'AI Helper：IT技术助手。\n\n## 能力\n编程开发与调试（Java/Python/JavaScript/Go/C++）、架构优化、性能调优、代码审查、文档编写、浏览器工具调用\n\n## 要求\n精准的技术术语、可运行的代码示例、Markdown格式、可操作的解决方案、不生成违反安全规定的代码',
  },
});

registerTranslations('en', {
  optionsConst: {
    aiSearch: 'AI Search',
    explain: 'Explain',
    translate: 'Translate',
    summary: 'Summarize',
    copy: 'Copy',
    defaultSystemPrompt: 'AI Helper: IT Technical Assistant.\n\n## Capabilities\nProgramming development and debugging (Java/Python/JavaScript/Go/C++), architecture optimization, performance tuning, code review, documentation writing, browser tool invocation\n\n## Requirements\nPrecise technical terminology, runnable code examples, Markdown format, actionable solutions, no security-violating code',
  },
});

// 内置工具 systemPrompt 多语言文案（与 content/selection-toolbar.js 保持一致）
registerTranslations('zh', {
  selToolbar: {
    sysPromptAisearch: '你正在处理用户在网页上选中的内容。使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。',
    sysPromptExplain: '你正在处理用户在网页上选中的内容。用1-3句简洁解释选中内容，必要时补充一个简短示例。不要展开长篇论述。',
    sysPromptTranslate: '你正在处理用户在网页上选中的内容。自动检测语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加额外说明。',
    sysPromptSummary: '你正在处理用户在网页上选中的内容。用3-5个要点总结选中内容，每条要点一句话，提炼核心信息即可。',
    sysPromptCopy: '将选中内容复制到剪贴板。',
  },
});

registerTranslations('en', {
  selToolbar: {
    sysPromptAisearch: 'You are processing content selected by the user on a web page. Use ReAct Agent mode to answer selected questions through multiple rounds of thinking, searching, and reasoning.',
    sysPromptExplain: 'You are processing content selected by the user on a web page. Explain the selected content in 1-3 concise sentences, supplementing with a brief example if necessary. Do not expand into lengthy discussions.',
    sysPromptTranslate: 'You are processing content selected by the user on a web page. Auto-detect language: Chinese→English, English→Chinese, other languages→provide both Chinese and English. Output only the translation result, no additional explanations.',
    sysPromptSummary: 'You are processing content selected by the user on a web page. Summarize the selected content in 3-5 bullet points, one sentence per point, distilling the core information.',
    sysPromptCopy: 'Copy the selected content to the clipboard.',
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

// 内置工具名称 i18n key 映射（用于运行时动态获取当前语言的名称）
const BUILTIN_TOOL_NAME_KEYS = {
  'ai-search': 'optionsConst.aiSearch',
  'explain': 'optionsConst.explain',
  'translate': 'optionsConst.translate',
  'summary': 'optionsConst.summary',
  'copy': 'optionsConst.copy',
};

/**
 * 获取内置工具的当前语言名称（每次调用都从 i18n 字典实时查找）
 * @param {string} toolId - 工具 ID
 * @returns {string|undefined} 当前语言的工具名称
 */
export function getBuiltinToolName(toolId) {
  const key = BUILTIN_TOOL_NAME_KEYS[toolId];
  return key ? t(key) : undefined;
}

// 内置工具 systemPrompt i18n key 映射（用于运行时动态获取当前语言的提示词）
const BUILTIN_TOOL_PROMPT_KEYS = {
  'ai-search': 'selToolbar.sysPromptAisearch',
  'explain': 'selToolbar.sysPromptExplain',
  'translate': 'selToolbar.sysPromptTranslate',
  'summary': 'selToolbar.sysPromptSummary',
  'copy': 'selToolbar.sysPromptCopy',
};

/**
 * 获取内置工具的当前语言 systemPrompt（每次调用都从 i18n 字典实时查找）
 * @param {string} toolId - 工具 ID
 * @returns {string|undefined} 当前语言的系统提示词
 */
export function getBuiltinToolPrompt(toolId) {
  const key = BUILTIN_TOOL_PROMPT_KEYS[toolId];
  return key ? t(key) : undefined;
}

/**
 * 获取当前语言对应的默认系统提示词
 * @returns {string}
 */
export function getDefaultSystemPrompt() {
  return t('optionsConst.defaultSystemPrompt');
}

export const DEFAULT_TOOLBAR_MAX_VISIBLE = 5;
export const DEFAULT_TOOLBAR_ICON_ONLY = false;
export const DEFAULT_ENABLE_SELECTION_TOOLBAR = true;

export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  ..._DEFAULT_CHAT_CONFIG
};

export { DEFAULT_REFLECTION_CONFIG };
