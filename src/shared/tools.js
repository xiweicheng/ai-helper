// shared/tools.js - 从主定义派生，单一数据源
import { BUILTIN_TOOLS_UI } from '../background/constants.js';

export { BUILTIN_TOOLS_UI as BUILTIN_TOOLS };

export const TOOL_CATEGORIES = [
  { id: 'all', label: '全部工具' },
  { id: 'page_interaction', label: '页面交互' },
  { id: 'form_operation', label: '表单操作' },
  { id: 'info_extract', label: '信息提取' },
  { id: 'page_analysis', label: '页面分析' },
  { id: 'tab_management', label: '标签页管理' },
  { id: 'bookmark_history', label: '书签历史' },
  { id: 'storage_management', label: '存储管理' },
  { id: 'network_request', label: '网络请求' },
  { id: 'media_process', label: '媒体处理' },
  { id: 'debug_dev', label: '调试开发' },
  { id: 'ai_collaboration', label: 'AI协作' },
  { id: 'system_integration', label: '系统集成' },
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
