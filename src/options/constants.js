// options/constants.js - 常量定义

import { DEFAULT_REFLECTION_CONFIG, DEFAULT_REACT_CONFIG as _DEFAULT_REACT_CONFIG, DEFAULT_CHAT_CONFIG as _DEFAULT_CHAT_CONFIG } from '../background/constants.js';

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

export const DEFAULT_SYSTEM_PROMPT = `AI Helper：IT技术助手。

## 能力
编程开发与调试（Java/Python/JavaScript/Go/C++）、架构优化、性能调优、代码审查、文档编写、浏览器工具调用

## 要求
精准技术术语，代码示例可运行，Markdown格式，方案可落地，不生成安全违规代码`;

export const DEFAULT_REACT_CONFIG = _DEFAULT_REACT_CONFIG;

export const DEFAULT_TOOLBAR_TOOLS = [
  { id: 'ai-search',  name: 'AI搜索', systemPrompt: '你正在处理用户在网页上选中的内容。使用ReAct Agent模式，通过多轮思考、搜索和推理来回答选中的问题。', builtin: true, order: 0 },
  { id: 'explain',   name: '解释',   systemPrompt: '你正在处理用户在网页上选中的内容。用1-3句简洁解释选中内容，必要时补充一个简短示例。不要展开长篇论述。', builtin: true, order: 1 },
  { id: 'translate', name: '翻译',   systemPrompt: '你正在处理用户在网页上选中的内容。自动检测语言：中文→英文，英文→中文，其他语言→同时给出中英文。只输出翻译结果，不添加额外说明。', builtin: true, order: 2 },
  { id: 'summary',   name: '总结',   systemPrompt: '你正在处理用户在网页上选中的内容。用3-5个要点总结选中内容，每条要点一句话，提炼核心信息即可。', builtin: true, order: 3 },
  { id: 'copy',      name: '复制',   systemPrompt: '将选中内容复制到剪贴板。', builtin: true, order: 99 }
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
