// shared/context-usage.js - 上下文占用计算与发送历史选择
// 指示器预览与实际发送共用本模块，保证"显示值"与"发送的消息"完全同源。
import {
  estimateTokens,
  estimateMessagesTokens,
  getContextWindow,
  assessContextPressure,
  stripImagesFromContent,
  generateMessagesSummary,
  OUTPUT_BUDGET,
} from './token-counter.js';
import { t, registerTranslations } from './i18n.js';

registerTranslations('zh', {
  contextUsage: {
    compactionInjection: '[上下文摘要｜压缩了{count}条历史]',
  },
});
registerTranslations('en', {
  contextUsage: {
    compactionInjection: '[Context Summary | {count} messages compacted]',
  },
});

// 安全余量（与发送路径现行口径一致）
export const SAFETY_MARGIN = 2000;
// 历史预算占消息预算比例（与发送路径现行口径一致）
export const HISTORY_BUDGET_RATIO = 0.7;
// 被裁消息规则摘要的注入上限（与 chat-manager.js 现行实现一致：1000 tokens ≈ 4000 字符）
const SUMMARY_MAX_TOKENS = 1000;

/**
 * 选择发送用历史消息（记忆层 → 窗口层 → 压缩层 → 预算层）
 *
 * 约定：history 为"历史部分"（不含当前待发送消息）；currentMessage 单独传入。
 * 发送路径：history = state.messageHistory.slice(0, -1)，currentMessage = 最后一条
 * 预览路径：history = state.messageHistory，currentMessage = { role:'user', content: inputText }
 */
export function selectHistoryForSend(history, {
  isolateChat = true,
  maxMemoryMessages = null,
  compaction = null,
  historyBudget = Number.POSITIVE_INFINITY,
  currentMessage = null,
} = {}) {
  const current = currentMessage || { role: 'user', content: '' };

  // 记忆层：不携带历史
  if (!isolateChat) {
    return { messages: [current], keptHistory: [], compactionApplied: false, trimmedCount: 0, historySummaryText: null };
  }

  const all = Array.isArray(history) ? history : [];

  // 压缩层定位：upToMessageId 必须能在历史中找到，否则本次忽略压缩（不自动删数据）
  let compactionApplied = false;
  let compactionIdx = -1;
  if (compaction && compaction.summary && compaction.upToMessageId) {
    compactionIdx = all.findIndex(m => m.messageId === compaction.upToMessageId);
    compactionApplied = compactionIdx >= 0;
  }

  // 窗口层：maxMemoryMessages 决定携带范围（最近 N 条；null/0 = 全部）
  let candidates = all;
  let candidateIndexes = all.map((_, i) => i);
  if (maxMemoryMessages && maxMemoryMessages > 0 && all.length > maxMemoryMessages) {
    candidates = all.slice(all.length - maxMemoryMessages);
    candidateIndexes = candidateIndexes.slice(all.length - maxMemoryMessages);
  }

  // 压缩层过滤：窗口内仅在压缩点之后的消息参与发送（压缩点及之前由摘要 S 替代）
  const historyWithoutCurrent = [];
  for (let k = 0; k < candidates.length; k++) {
    if (compactionApplied && candidateIndexes[k] <= compactionIdx) continue;
    historyWithoutCurrent.push(candidates[k]);
  }

  // 预算层：从后往前保留至 historyBudget（与现有发送路径实现一致）
  const keptHistory = [];
  let keptTokens = estimateMessagesTokens([current]);
  for (let i = historyWithoutCurrent.length - 1; i >= 0; i--) {
    const msg = historyWithoutCurrent[i];
    // 剥离图片后估算，避免图片 token 导致过度裁剪
    const strippedMsg = { ...msg, content: stripImagesFromContent(msg.content) };
    const msgTokens = estimateMessagesTokens([strippedMsg]);
    if (keptTokens + msgTokens <= historyBudget) {
      keptHistory.unshift(msg);
      keptTokens += msgTokens;
    } else {
      break;
    }
  }

  // 被预算裁掉的消息 → 规则摘要（调用方注入 system prompt，现有兜底逻辑）
  let historySummaryText = null;
  const trimmedCount = historyWithoutCurrent.length - keptHistory.length;
  if (trimmedCount > 0) {
    const summary = generateMessagesSummary(historyWithoutCurrent.slice(0, trimmedCount));
    if (summary) {
      const summaryTokens = estimateTokens(summary);
      historySummaryText = summaryTokens > SUMMARY_MAX_TOKENS
        ? summary.substring(0, SUMMARY_MAX_TOKENS * 4) + '\n...[历史摘要已截断]'
        : summary;
    }
  }

  return {
    messages: [...keptHistory, current],
    keptHistory,
    compactionApplied,
    trimmedCount,
    historySummaryText,
  };
}

/**
 * 将压缩摘要拼入 system prompt（与规则摘要注入方式一致）。
 * S 在 system 中，天然受 trimMessagesByBudget 的 preserveSystem 保护，不会被自动裁剪丢弃。
 */
export function appendCompactionToSystemPrompt(systemContent, compaction) {
  if (!compaction || !compaction.summary) return systemContent;
  const header = t('contextUsage.compactionInjection', { count: compaction.compressedCount || 0 });
  return `${systemContent}\n\n${header}\n${compaction.summary}`;
}

/**
 * 计算上下文占用（指示器预览；与发送路径同源）
 *
 * 与发送路径同序：先用原始 system 算预算 → 选择历史 → 注入摘要后再算最终 system 分解。
 */
export function computeContextUsage({
  model,
  customModelMap = null,
  systemPromptText = '',
  toolCount = 0,
  history = [],
  inputText = '',
  maxMemoryMessages = null,
  compaction = null,
  isolateChat = true,
  userConfiguredWindow = 0,
} = {}) {
  const contextWindow = getContextWindow(model, userConfiguredWindow, customModelMap);

  // 主发送路径现行口径：messageBudget = 窗口 - system - 输出预留 - 安全余量；historyBudget = 70%
  const rawSystemTokens = estimateTokens(systemPromptText);
  const messageBudget = contextWindow - rawSystemTokens - OUTPUT_BUDGET - SAFETY_MARGIN;
  const historyBudget = Math.floor(Math.max(messageBudget, 0) * HISTORY_BUDGET_RATIO);

  const current = { role: 'user', content: inputText };
  const effectiveCompaction = isolateChat ? compaction : null;
  const selection = selectHistoryForSend(history, {
    isolateChat,
    maxMemoryMessages,
    compaction: effectiveCompaction,
    historyBudget,
    currentMessage: current,
  });

  // 注入后 system（含压缩摘要段）——与发送路径最终消息一致
  const injectedSystem = selection.compactionApplied
    ? appendCompactionToSystemPrompt(systemPromptText, effectiveCompaction)
    : systemPromptText;
  const systemTokens = estimateTokens(injectedSystem);
  const toolTokens = toolCount * 200;
  const historyTokens = estimateMessagesTokens(selection.keptHistory);
  const inputTokens = inputText && inputText.trim() ? estimateMessagesTokens([current]) : 0;
  const usedTokens = systemTokens + toolTokens + historyTokens + inputTokens;
  const pressure = assessContextPressure(usedTokens, contextWindow);

  return {
    usedTokens,
    contextWindow,
    ratio: contextWindow > 0 ? usedTokens / contextWindow : 0,
    level: pressure.level,
    breakdown: {
      system: systemTokens,
      tools: toolTokens,
      history: historyTokens,
      input: inputTokens,
      outputReserve: OUTPUT_BUDGET,
      safetyMargin: SAFETY_MARGIN,
      selectedCount: selection.keptHistory.length,
      totalCount: history.length,
      trimmedCount: selection.trimmedCount,
      compactionApplied: selection.compactionApplied,
      compactionInvalid: !!(effectiveCompaction && effectiveCompaction.summary && !selection.compactionApplied),
      historyBudget,
    },
  };
}

/**
 * 组装压缩素材（点击"压缩上下文"那一刻，按记忆设置窗口选出的全部携带内容）
 * - 素材 = 【已有摘要】条目（若有）+ 窗口内压缩点之后的消息
 * - 不经发送时预算裁剪（超长由提示词构建环节逐条截断），避免"被裁头部永久丢失"
 * - 当前输入框未发送的内容不参与压缩素材
 */
export function assembleCompactionMaterial(history, { maxMemoryMessages = null, compaction = null } = {}) {
  const selection = selectHistoryForSend(history, {
    isolateChat: true,
    maxMemoryMessages,
    compaction,
    historyBudget: Number.POSITIVE_INFINITY,
    currentMessage: null,
  });

  const material = [];
  const hasOldSummary = !!(selection.compactionApplied && compaction?.summary);
  if (hasOldSummary) {
    material.push({ role: 'user', content: `【已有摘要】\n${compaction.summary}` });
  }
  for (const m of selection.keptHistory) {
    const raw = stripImagesFromContent(m.content);
    material.push({ role: m.role, content: typeof raw === 'string' ? raw : (JSON.stringify(raw ?? '') || '') });
  }
  return { material, includedCount: selection.keptHistory.length, hasOldSummary };
}
