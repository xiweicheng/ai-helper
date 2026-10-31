// background/constants.js - 默认配置和内置工具定义

// 默认配置
export const DEFAULT_API_BASE = 'https://api.deepseek.com';
export const DEFAULT_MODEL = 'deepseek-v4-pro';

// ReAct 循环配置默认值
export const DEFAULT_REACT_CONFIG = {
  // 轮数上限已撤出设置页，只作内部确定性保险丝：时间上限抓「慢而卡」，轮数抓「快而空转」
  // （每轮秒级失败的病态循环在 24h 时限下可跑上万轮，loop-detector 漏检时唯一硬保证）。
  // 取 2000：24h 满负荷正常推进（轮均 1~3 分钟）约 500~1500 轮，留一倍余量 → 正常任务绝碰不到。
  // 撞线不再抛错终止，而是走软着陆（见 gracefulConverge）。
  maxIterations: 2000,        // 内部轮数保险丝 (1-10000)，不在设置页暴露
  // API 请求超时：已撤出设置页（内部固定值）。只覆盖建连 + 等响应头，流式读正文由
  // readSSEStream 的空闲超时单独保护 → 5 分钟足够；拉到 10 分钟只会让「死 API」场景
  // （1 次 + 3 次重试）从 20 分钟变 40 分钟才报错。
  apiTimeout: 300000,         // API 请求超时 (ms)，不在设置页暴露
  // 整体循环超时：默认 4h、上限 24h（旧 2h 已被真实长任务撞到过，且它现在是唯一会咬到
  // 正常任务的限制）。多小时以上、要脱离浏览器生命周期的任务应走 agent/ 原生进程，
  // 扩展侧的目标是「覆盖过夜跑」而非无限。
  loopTimeout: 14400000,      // 整体循环超时 (ms) (60000-86400000)，默认 4 小时
  // 工具执行超时：已撤出设置页（内部固定值）。只作为「未登记工具」的兜底，与 Agent 端
  // TOTAL_BUDGET_CAP_MS（同样是 600000）封顶对齐；agent_exec 走 TOOL_TIMEOUT_MS 登记值，
  // 长命令由「无输出自动 detach 托管」兜住，与本项无关。
  toolTimeout: 600000,        // 工具执行超时 (ms)，不在设置页暴露
  // 澄清工具超时：从未在设置页暴露。等待期间走 pauseLoopTimer 不计入循环预算，
  // 5 分钟 + 弹窗内手动延长已足够，不值得为它单开一个配置项。
  clarifyTimeout: 300000,     // 澄清工具超时 (ms)，不在设置页暴露
  apiRetryCount: 3,           // API 调用失败重试次数 (0-10)
  apiRetryBaseDelay: 1000,    // API 重试基础延迟 (ms) (500-30000)，指数退避
  // 预算撞线软着陆：撞时间/轮数上限时先禁用工具做有界收尾轮，产出「部分完成 + 缺项」
  // 并保留 checkpoint 供续跑，而不是裸抛错终止任务。关掉即回退旧的抛错语义。
  gracefulConverge: true,
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
  rerunEnabled: false,          // Phase B 子开关：关=仅取证标注（=Phase A 行为，四闸门全 false、命令仅只读硬拦）；开=接通重跑 + agent 三档命令门
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
  persistSummaryToMemory: true,  // 压缩摘要自动沉淀为长期记忆（不新增 LLM 调用）
  // 队列「自动顺带」：运行中的任务在迭代边界自动带上队首一条（不打断原任务）
  queueAutoCarry: true,               // 总开关，默认开；关掉只剩手动 ⚡
  queueAutoCarryEveryNIterations: 3   // 至少间隔 N 轮才再带一条（防一口气把队列倒进上下文）
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
// 语义：显式列出的工具使用「本表值」作为权威超时（不再被全局 toolTimeout 压缩），
// 未列出的工具沿用全局 toolTimeout。本表是用来「对齐」而非「收紧」的——
// 详见 agent_exec 条目注释：外层 wrapper 早于内层预算到点会静默废掉内层的延长机制。
// 格式：{ 工具id: 超时毫秒数 }
export const TOOL_TIMEOUT_MS = {
  // agent_exec 的决策权威在 Agent 端（初始超时 → 最多延长 5 次 → 总预算封顶 10 分钟，
  // 插件端外层保险 computeExecGuardMs = 10.5 分钟）。全局 toolTimeout 默认恰好是 10 分钟，
  // 会在内层还有预算时先掐死调用并丢弃已收集输出，使延长机制形同虚设 → 覆盖为 12 分钟，
  // 严格大于最坏 guard（10.5 分钟）。真正的小时级命令不该靠放大同步超时解决：
  // 静默超阈已由 tool-executor 的 detachCommand 转交 Agent 端托管，调用本身即时返回。
  agent_exec: 720000,
};

// ==================== 用户交互弹窗（确认 / 澄清）计时约定 ====================
// 后台发出 SHOW_CONFIRM_DIALOG / SHOW_CLARIFY_DIALOG 时不立即启动倒计时：
// 面板侧两类弹窗共用单模态闸门，请求可能在排队，未被用户看到的弹窗不该消耗时间，
// 否则会出现「澄清压住确认，用户在答澄清时确认已被无声判拒」。
// 倒计时只在面板回发 INTERACTION_DISPLAYED（这一条真正呈现）之后启动。
// 未呈现期间用 Side Panel 存活性轮询兜底：面板已关闭则尽快 fail-closed，任务不悬挂。
export const INTERACTION_CONFIRM_TIMEOUT_MS = 300000; // 敏感操作确认：5 分钟
export const INTERACTION_PANEL_POLL_MS = 5000;        // Side Panel 存活性轮询间隔
