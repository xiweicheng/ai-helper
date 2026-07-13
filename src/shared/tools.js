// shared/tools.js - 从主定义派生，单一数据源
import { BUILTIN_TOOLS_UI, CATEGORY_ORDER } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };

// 从 CATEGORY_ORDER 动态派生 TOOL_CATEGORIES（单一数据源）
export const TOOL_CATEGORIES = [
  { id: 'all', label: '全部工具' },
  ...CATEGORY_ORDER.map(id => ({
    id,
    label: ({
      page_interaction: '页面交互',
      form_operation: '表单操作',
      content_extraction: '内容提取',
      tab_management: '标签页管理',
      bookmark_history: '书签历史',
      storage_management: '存储管理',
      network_request: '网络请求',
      media_output: '媒体与输出',
      debug_dev: '调试开发',
      ai_collaboration: 'AI协作',
      local_agent: '代理',
    })[id] || id
  }))
];

export const PRESET_MODES = [
  { label: '精准严谨', temp: 0.2, topP: 1.0, tip: '改错、调试、要准确答案（低随机性，适合修 bug）' },
  { label: '日常通用', temp: 0.45, topP: 0.9, tip: '多数场景都好用（平衡稳定与灵活，适合写脚本）' },
  { label: '思路发散', temp: 0.65, topP: 0.9, tip: '要多种方案做对比（适合重构、方案对比）' },
  { label: '创意脑暴', temp: 0.9, topP: 0.9, tip: '写文案、起名、头脑风暴（高随机性，不建议正式代码）' },
];

export const DEFAULT_CHAT_CONFIG = {
  maxMemoryMessages: 20,
};

export const DEFAULT_REACT_CONFIG = {
  maxIterations: 100,
  apiTimeout: 300000,
  loopTimeout: 7200000,
  toolTimeout: 600000,
  clarifyTimeout: 300000,
};

export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';
