// background/constants.js - 默认配置和内置工具定义

// 默认配置
export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';

// ReAct 循环配置默认值
export const DEFAULT_REACT_CONFIG = {
  maxIterations: 100,         // 最大循环次数 (1-1000)
  apiTimeout: 300000,         // API 请求超时 (ms) (10000-600000)
  loopTimeout: 7200000,       // 整体循环超时 (ms) (60000-7200000)
  toolTimeout: 600000,        // 工具执行超时 (ms) (5000-600000)
  clarifyTimeout: 300000,     // 澄清工具超时 (ms) (60000-600000)，默认5分钟
  apiRetryCount: 3,           // API 调用失败重试次数 (0-10)
  apiRetryBaseDelay: 1000,    // API 重试基础延迟 (ms) (500-30000)，指数退避
  enableToolPreselect: false, // 是否启用工具预筛选（默认关闭）
  toolConfirmationEnabled: true,  // 是否启用敏感操作确认（关闭后敏感操作直接放行）
  // 内网地址访问（SEC-03）：B2 语义 —— 默认关，且允许列表默认为空；
  // 开启总闸但列表为空时仍拒绝全部内网，必须逐台主机加白名单
  networkAccessEnabled: false,
  allowedNetworkHosts: []
};

// 工具预筛选最小触发数量：工具数超过此值才启动预筛选。固定阈值常量，
// 不再是可配置项（不暴露 UI、不进 storage），所有消费点统一引用此唯一来源。
export const PRESELECT_MIN_TOOL_COUNT = 10;

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
    maxTokens: 2048,          // 修订响应最大 token（评估响应为小 JSON，同值仅作上限保护）
    // 超时/重试为代码内配置，不开放 UI：评估调用只输出小 JSON 评分，默认 90s；
    // 修订调用需生成完整答案，默认 150s；旧 storage 残缺配置在 react-reflection 内回落默认值
    timeoutMs: 90000,         // 评估调用单次超时
    reviseTimeoutMs: 150000,  // 修订调用单次超时
    maxRetries: 2             // 评估/修订调用重试次数
  },
  subtaskReflection: {
    enabled: false,           // 子任务反思（默认关闭）
    onlyForComplexSubtasks: true, // 仅标记为 complex 的子任务
    maxRounds: 1,
    dimensions: ['completeness', 'relevance'], // 简化维度
    model: null,
    temperature: 0.3,
    maxTokens: 1024
  }
};

// 完成度校验器配置默认值（AUDIT_STATUS 第四节 line 85 长线项 · Phase 1 地基）。
// 默认 enabled:false —— 关闭时 react-loop 完全不进入校验分支，现有行为逐字节不变。
// 消费点（回炉四闸门、critic 兜底）在 Phase 2 接入，本处仅提供唯一配置来源。
export const DEFAULT_COMPLETION_VERIFICATION_CONFIG = {
  enabled: false,               // 总开关：关闭时短路所有新逻辑
  objectiveChecksEnabled: true, // 有 doneCriteria 时优先用确定性取证
  maxRetryAttempts: 1,          // 回炉次数上限（闸门 4）
  perSubtaskTokenBudget: 0,     // 子任务 token 预算，0=不设限（闸门 3）
  lowConfidence: 0.6,           // critic 置信下限，低于则回落 indeterminate 转用户
  model: null,                  // critic 用模型，null=当前模型
  temperature: 0.2,
  maxTokens: 1024
};

// 流式输出配置默认值
export const DEFAULT_STREAM_CONFIG = {
  streamEnabled: true,           // LLM 流式输出默认开启
  streamChunkDelay: 30,          // Side Panel 渲染字符间延迟 (ms)，0=瞬间渲染
  agentStreamEnabled: true       // Agent 命令流式输出默认开启
};

// 对话配置默认值
export const DEFAULT_CHAT_CONFIG = {
  maxMemoryMessages: 20,      // 记忆历史限制条数，默认20条
  enableExecutionLog: true,   // 执行日志默认开启
  autoCompaction: false,      // 阈值驱动的自动压缩默认关闭（会额外产生一次摘要调用）
  autoCompactionThreshold: 0.85, // 上下文占用达到 85% 时发送前自动压缩一次
  persistSummaryToMemory: true   // 压缩摘要自动沉淀为长期记忆（不新增 LLM 调用）
};

// ==================== 工具定义（按类别拆分到 tools/ 目录） ====================

import { BROWSER_TOOLS } from './tools/browser-tools.js';
import { TAB_TOOLS } from './tools/tab-tools.js';
import { STORAGE_TOOLS } from './tools/storage-tools.js';
import { MEDIA_TOOLS } from './tools/media-tools.js';
import { AI_TOOLS } from './tools/ai-tools.js';
import { AGENT_TOOLS } from './tools/agent-tools.js';
import { MEMORY_TOOLS } from './tools/memory-tools.js';
import { DEBUGGER_TOOLS } from './tools/debugger-tools.js';

export const RAW_TOOLS = [
  ...BROWSER_TOOLS,
  ...TAB_TOOLS,
  ...STORAGE_TOOLS,
  ...MEDIA_TOOLS,
  ...AI_TOOLS,
  ...AGENT_TOOLS,
  ...MEMORY_TOOLS,
  ...DEBUGGER_TOOLS,
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
  knowledge: 13,
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
// 合并工具的 action 级别确认映射（如 manage_tab 的 close action 需要确认）
// 派生结果示例：{ manage_tab: ['close'] }
export const CONFIRMATION_ACTION_MAP = Object.fromEntries(
  RAW_TOOLS.filter(t => Array.isArray(t.confirmationActions) && t.confirmationActions.length > 0)
    .map(t => [t.id, t.confirmationActions])
);
export const BUILTIN_TOOLS_UI = RAW_TOOLS.map(t => ({
  id: t.id, name: t.function.name, description: t.function.description,
  category: t.category, execution: t.execution,
  parallelizable: t.parallelizable, requiresConfirmation: t.requiresConfirmation,
  enabled: true
}));

// ==================== 工具自定义超时配置 ====================
// 各工具的超时时间（ms），未配置的工具默认使用 toolTimeout（600000ms = 10分钟）
// 格式：{ 工具id: 超时毫秒数 }
// 示例：将快速工具设为较短超时以减少卡死等待时间：
//   list_tabs: 15000,           // 获取标签页列表，15s
//   manage_tab: 10000,          // 标签页操作，10s
//   download_file: 600000,     // 下载文件，10分钟（覆盖默认值）
// 注意：当前所有工具沿用全局 toolTimeout，此配置仅提供扩展能力
export const TOOL_TIMEOUT_MS = {
  // 预留扩展：按需为各工具配置独立超时
};

// ==================== 用户交互弹窗（确认 / 澄清）计时约定 ====================
// 后台发出 SHOW_CONFIRM_DIALOG / SHOW_CLARIFY_DIALOG 时不立即启动倒计时：
// 面板侧两类弹窗共用单模态闸门，请求可能在排队，未被用户看到的弹窗不该消耗时间，
// 否则会出现「澄清压住确认，用户在答澄清时确认已被无声判拒」。
// 倒计时只在面板回发 INTERACTION_DISPLAYED（这一条真正呈现）之后启动。
// 未呈现期间用 Side Panel 存活性轮询兜底：面板已关闭则尽快 fail-closed，任务不悬挂。
export const INTERACTION_CONFIRM_TIMEOUT_MS = 300000; // 敏感操作确认：5 分钟
export const INTERACTION_PANEL_POLL_MS = 5000;        // Side Panel 存活性轮询间隔
