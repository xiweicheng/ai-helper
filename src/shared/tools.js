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
      local_agent: '本地代理',
    })[id] || id
  }))
];

export const PRESET_MODES = [
  { label: '精准编码', temp: 0.2, topP: 1.0, tip: '较低随机性，适合业务开发、调试、纠错' },
  { label: '均衡开发', temp: 0.45, topP: 0.9, tip: '兼顾稳定性，用于封装工具类、常规脚本' },
  { label: '架构探索', temp: 0.65, topP: 0.9, tip: '提供多种实现思路，用于组件重构、方案对比' },
  { label: '创意发散', temp: 0.9, topP: 0.9, tip: '随机性较高，仅用于原型探索，不建议生产代码' },
];

export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,
  maxHistoryMessages: 50,
  maxMessageLength: 100000,
  maxMemoryMessages: 20,
  contextWindow: 0,
};

export const DEFAULT_REACT_CONFIG = {
  maxIterations: 5,
  apiTimeout: 60000,
  loopTimeout: 300000,
  toolTimeout: 30000,
  clarifyTimeout: 180000,
};

export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';
