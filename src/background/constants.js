// background/constants.js - 默认配置和内置工具定义

// 默认配置
export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';

// ReAct 循环配置默认值
export const DEFAULT_REACT_CONFIG = {
  maxIterations: 100,         // 最大循环次数 (1-100)
  apiTimeout: 300000,         // API 请求超时 (ms) (10000-600000)
  loopTimeout: 1800000,       // 整体循环超时 (ms) (60000-3600000)
  toolTimeout: 600000,        // 工具执行超时 (ms) (5000-600000)
  clarifyTimeout: 180000,     // 澄清工具超时 (ms) (60000-600000)，独立配置
  apiRetryCount: 3,           // API 调用失败重试次数 (0-10)
  apiRetryBaseDelay: 1000,    // API 重试基础延迟 (ms) (500-30000)，指数退避
  enableToolPreselect: true,  // 是否启用工具预筛选（默认开启）
  preselectMinToolCount: 3,   // 工具预筛选最小触发数量（工具数超过此值才启动预筛选）
  toolConfirmationEnabled: true  // 是否启用敏感工具操作确认（关闭后敏感工具直接放行）
};

// 反思配置默认值
export const DEFAULT_REFLECTION_CONFIG = {
  enabled: false,             // 是否启用反思（可整体关闭）
  postReflection: {
    enabled: true,            // 主循环后置反思
    maxRounds: 1,             // 最大反思轮数（0=不反思）
    qualityThreshold: 7,      // 质量评分阈值（1-10），低于此值重新执行
    refineThreshold: 5,       // 修订阈值（1-10），低于此值直接修订而非重新执行
    model: null,              // 反思用模型，null=使用当前模型
    temperature: 0.3,         // 反思时 temperature
    maxTokens: 2048           // 反思响应最大 token
  },
  subtaskReflection: {
    enabled: false,           // 子任务反思（默认关闭）
    onlyForComplexSubtasks: true, // 仅标记为 complex 的子任务
    maxRounds: 1,
    dimensions: ['completeness', 'relevance'], // 简化维度
    model: null,
    temperature: 0.3,
    maxTokens: 1024
  },
  toolReflection: {
    enabled: true,            // 工具级反思
    triggerOnError: true,     // 工具返回错误时触发
    triggerOnEmpty: true,     // 工具返回空结果时触发
    triggerOnOversized: true, // 工具返回结果过大时触发
    oversizeThreshold: 50000, // 结果大小阈值（字符）
    triggerOnConsecutiveFails: 3, // 连续 N 次工具失败触发
    maxPerIteration: 2        // 每轮迭代最多触发工具反思次数
  }
};

// 流式输出配置默认值
export const DEFAULT_STREAM_CONFIG = {
  streamEnabled: true,           // LLM 流式输出默认开启
  streamChunkDelay: 30,          // Side Panel 渲染字符间延迟 (ms)，0=瞬间渲染
  agentStreamEnabled: true       // Agent 命令流式输出默认开启
};

// 对话配置默认值
export const DEFAULT_CHAT_CONFIG = {
  maxInputHistory: 20,        // 最大输入历史记录数 (10-100)
  maxHistoryMessages: 50,     // 最大保留对话轮数 (10-200)
  maxMemoryMessages: 20       // 记忆历史限制条数，默认20条
};

// ==================== 工具定义（按类别拆分到 tools/ 目录） ====================

import { BROWSER_TOOLS } from './tools/browser-tools.js';
import { TAB_TOOLS } from './tools/tab-tools.js';
import { STORAGE_TOOLS } from './tools/storage-tools.js';
import { MEDIA_TOOLS } from './tools/media-tools.js';
import { AI_TOOLS } from './tools/ai-tools.js';
import { AGENT_TOOLS } from './tools/agent-tools.js';
import { MEMORY_TOOLS } from './tools/memory-tools.js';

export const RAW_TOOLS = [
  ...BROWSER_TOOLS,
  ...TAB_TOOLS,
  ...STORAGE_TOOLS,
  ...MEDIA_TOOLS,
  ...AI_TOOLS,
  ...AGENT_TOOLS,
  ...MEMORY_TOOLS,
];

// ==================== 工具类别映射（单一数据源） ====================

// 类别权重：用于确定分类显示顺序（数字越小越靠前）
export const CATEGORY_WEIGHT = {
  page_interaction: 1,
  form_operation: 2,
  content_extraction: 3,
  tab_management: 4,
  bookmark_history: 5,
  storage_management: 6,
  network_request: 7,
  media_output: 8,
  debug_dev: 9,
  ai_collaboration: 10,
  local_agent: 11,
  mcp: 12,
};

// 从 RAW_TOOLS 动态派生分类顺序列表（单一数据源，无需手动维护）
export const CATEGORY_ORDER = [...new Set(RAW_TOOLS.map(t => t.category))]
  .sort((a, b) => (CATEGORY_WEIGHT[a] || 99) - (CATEGORY_WEIGHT[b] || 99));

// 从 RAW_TOOLS 自动派生所有映射表
export const BUILTIN_TOOLS = RAW_TOOLS.map(t => ({ id: t.id, type: t.type, function: t.function }));
export const TOOL_CATEGORY_MAP = Object.fromEntries(RAW_TOOLS.map(t => [t.id, t.category]));
export const TOOL_EXECUTION_MAP = Object.fromEntries(RAW_TOOLS.map(t => [t.id, t.execution]));
export const PARALLELIZABLE_TOOLS = new Set(RAW_TOOLS.filter(t => t.parallelizable).map(t => t.id));
export const CONFIRMATION_REQUIRED_TOOLS = new Set(RAW_TOOLS.filter(t => t.requiresConfirmation).map(t => t.id));
export const BUILTIN_TOOLS_UI = RAW_TOOLS.map(t => ({
  id: t.id, name: t.function.name, description: t.function.description,
  category: t.category, execution: t.execution,
  parallelizable: t.parallelizable, requiresConfirmation: t.requiresConfirmation,
  enabled: true
}));
