# 上下文占用指示器与手动压缩 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在侧边栏输入框下方展示会话上下文占用百分比（可点开详情），并支持用户手动触发 AI 上下文压缩（会话级持久化、覆盖式单摘要、可撤销）。

**Architecture:** 新增共享纯函数模块 `src/shared/context-usage.js` 统一"发送历史选择 + 占用计算"（指示器预览与发送路径同源，杜绝显示漂移）；三处发送路径（chat-manager / prompt-manager / index）改用该模块；UI 由 `src/side_panel/context-indicator.js` 驱动（指示器渲染、详情弹窗、压缩流程、分隔条）；AI 摘要经 background `COMPACT_CONTEXT_SUMMARY` 消息由 `src/background/context-compactor.js` 生成（复用 fetchWithRetry 模式）；压缩记录存于会话对象 `contextCompaction` 字段（IndexedDB 整对象存储，无需 schema 迁移）。

**Tech Stack:** Chrome MV3、Vite + crxjs、Vitest（`npm run test:unit`，node 环境 + chrome-mock/jsdom-globals setup）、原生 JS/CSS、i18n（`registerTranslations('zh'|'en', ...)` + `t()`）

**Spec:** `docs/superpowers/specs/2026-10-05-context-usage-indicator-design.md`（执行前必读，重点关注"计算模型""压缩模型""发送集成""与现有自动机制的关系"四节）

## Global Constraints

- 构建验证命令：`npm run build:silent`（项目规范：代码修改完成后必须执行并通过）
- 单元测试命令：`npm run test:unit`（= `vitest run`，globals: true，环境 node；`test/unit/**/*.test.js`）
- 所有新增用户可见文案必须同时注册 zh/en（`registerTranslations`），命名空间 `contextUsage.*`
- **不修改现有自动机制的行为逻辑**（发送前预算裁剪、critical 裁剪、ReAct 循环内摘要与裁剪），只做协同（见 spec 专节）
- 摘要 S 必须注入 system prompt（拼接方式与现有规则摘要注入一致），使其受 `trimMessagesByBudget` 的 `preserveSystem=true` 保护
- 所有任务不自动 git commit；全部任务完成后由用户决定提交时机
- 现有共享常量从 `src/shared/token-counter.js` 导入：`OUTPUT_BUDGET`(=4096)、`SYSTEM_PROMPT_BUDGET`(=2000)、`estimateToolsTokens`、`assessContextPressure`、`getContextWindow`、`stripImagesFromContent`、`generateMessagesSummary`
- 记忆开关/条数来源：`state.isolateChat`（全局）、`state.chatConfig.maxMemoryMessages`（null/0=全部）
- 关键数据约定：`state.messageHistory` 每条含 `messageId`；发送路径约定 `history = state.messageHistory.slice(0, -1)`、`currentMessage = 最后一条`

---

### Task 1: 共享核心模块 `context-usage.js`（TDD）

**Files:**
- Create: `src/shared/context-usage.js`
- Test: `test/unit/context-usage.unit.test.js`

**Interfaces:**
- Consumes: `token-counter.js` 的 `estimateTokens / estimateMessagesTokens / getContextWindow / assessContextPressure / stripImagesFromContent / generateMessagesSummary / OUTPUT_BUDGET`；`i18n.js` 的 `t / registerTranslations`
- Produces（后续所有任务依赖）:
  - `selectHistoryForSend(history, { isolateChat, maxMemoryMessages, compaction, historyBudget, currentMessage })` → `{ messages, keptHistory, compactionApplied, trimmedCount, historySummaryText }`
  - `computeContextUsage({ model, customModelMap, systemPromptText, toolCount, history, inputText, maxMemoryMessages, compaction, isolateChat, userConfiguredWindow })` → `{ usedTokens, contextWindow, ratio, level, breakdown }`
  - `appendCompactionToSystemPrompt(systemContent, compaction)` → `string`
  - 常量 `HISTORY_BUDGET_RATIO`(=0.7)、`SAFETY_MARGIN`(=2000)

- [ ] **Step 1: 写失败测试**

创建 `test/unit/context-usage.unit.test.js`：

```js
// context-usage 单元测试：发送历史选择 / 占用计算 / 摘要注入（纯函数，node 环境）
import { describe, test, expect } from 'vitest';
import {
  selectHistoryForSend,
  computeContextUsage,
  appendCompactionToSystemPrompt,
  HISTORY_BUDGET_RATIO,
  SAFETY_MARGIN,
} from '../../src/shared/context-usage.js';

// 构造 n 条历史消息（id 从 startId 递增）
function makeHistory(n, startId = 1) {
  const arr = [];
  for (let i = 0; i < n; i++) {
    const idNum = startId + i;
    arr.push({
      role: i % 2 === 0 ? 'user' : 'assistant',
      content: `这是第${idNum}条消息的内容，用于测试`,
      messageId: `m${idNum}`,
    });
  }
  return arr;
}

const current = { role: 'user', content: '当前输入' };
const compactionAt50 = { summary: 'S1旧摘要内容', upToMessageId: 'm50', compressedCount: 50 };

describe('selectHistoryForSend - 记忆层', () => {
  test('记忆关闭时仅返回当前消息', () => {
    const r = selectHistoryForSend(makeHistory(5), { isolateChat: false, currentMessage: current });
    expect(r.messages).toEqual([current]);
    expect(r.keptHistory).toEqual([]);
    expect(r.compactionApplied).toBe(false);
    expect(r.trimmedCount).toBe(0);
    expect(r.historySummaryText).toBeNull();
  });
});

describe('selectHistoryForSend - 窗口层', () => {
  test('无限制时全部保留', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, currentMessage: current });
    expect(r.keptHistory.length).toBe(76);
    expect(r.keptHistory[0].messageId).toBe('m1');
  });

  test('条数限制取最近 N 条（spec 示例：76 条带 10）', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, maxMemoryMessages: 10, currentMessage: current });
    expect(r.keptHistory.length).toBe(10);
    expect(r.keptHistory[0].messageId).toBe('m67');
    expect(r.keptHistory[9].messageId).toBe('m76');
  });
});

describe('selectHistoryForSend - 压缩层', () => {
  test('压缩生效（全部携带）：压缩点后的消息才参与发送', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, compaction: compactionAt50, currentMessage: current });
    expect(r.compactionApplied).toBe(true);
    expect(r.keptHistory.length).toBe(26);
    expect(r.keptHistory[0].messageId).toBe('m51');
    expect(r.keptHistory[25].messageId).toBe('m76');
  });

  test('压缩生效 + 条数 10：窗口已在压缩点后（spec 示例：窗口滑过压缩点）', () => {
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, maxMemoryMessages: 10, compaction: compactionAt50, currentMessage: current });
    expect(r.compactionApplied).toBe(true);
    expect(r.keptHistory.length).toBe(10);
    expect(r.keptHistory[0].messageId).toBe('m67');
  });

  test('压缩点失效（upToMessageId 不存在）：忽略压缩，正常返回', () => {
    const invalid = { summary: 'S', upToMessageId: 'm999', compressedCount: 50 };
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, compaction: invalid, currentMessage: current });
    expect(r.compactionApplied).toBe(false);
    expect(r.keptHistory.length).toBe(76);
  });

  test('窗口完全位于压缩点之前：历史为空，仅当前消息', () => {
    const compactionAt76 = { summary: 'S', upToMessageId: 'm76', compressedCount: 76 };
    const r = selectHistoryForSend(makeHistory(76), { isolateChat: true, compaction: compactionAt76, currentMessage: current });
    expect(r.compactionApplied).toBe(true);
    expect(r.keptHistory.length).toBe(0);
    expect(r.messages).toEqual([current]);
  });
});

describe('selectHistoryForSend - 预算层', () => {
  test('预算不足时从后往前保留并生成规则摘要', () => {
    const r = selectHistoryForSend(makeHistory(30), {
      isolateChat: true,
      historyBudget: 120,
      currentMessage: current,
    });
    expect(r.keptHistory.length).toBeGreaterThan(0);
    expect(r.keptHistory.length).toBeLessThan(30);
    expect(r.trimmedCount).toBe(30 - r.keptHistory.length);
    expect(typeof r.historySummaryText).toBe('string');
    expect(r.historySummaryText.length).toBeGreaterThan(0);
    // 保留的必须是最近的（尾部）
    expect(r.keptHistory[r.keptHistory.length - 1].messageId).toBe('m30');
    expect(r.messages[r.messages.length - 1]).toEqual(current);
  });

  test('预算充足时不裁剪、无摘要', () => {
    const r = selectHistoryForSend(makeHistory(5), { isolateChat: true, historyBudget: 100000, currentMessage: current });
    expect(r.trimmedCount).toBe(0);
    expect(r.historySummaryText).toBeNull();
  });
});

describe('appendCompactionToSystemPrompt', () => {
  test('无压缩对象时原样返回', () => {
    expect(appendCompactionToSystemPrompt('SYS', null)).toBe('SYS');
    expect(appendCompactionToSystemPrompt('SYS', {})).toBe('SYS');
  });

  test('有效压缩时追加摘要段', () => {
    const out = appendCompactionToSystemPrompt('SYS', compactionAt50);
    expect(out.startsWith('SYS')).toBe(true);
    expect(out).toContain('S1旧摘要内容');
  });
});

describe('computeContextUsage', () => {
  test('分解字段与合计一致、安全档位', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: '这是一个测试系统提示词',
      toolCount: 3,
      history: makeHistory(10),
      inputText: '你好',
      maxMemoryMessages: null,
      compaction: null,
      isolateChat: true,
    });
    expect(usage.contextWindow).toBeGreaterThan(0);
    expect(usage.breakdown.tools).toBe(600);
    expect(usage.breakdown.system).toBeGreaterThan(0);
    expect(usage.breakdown.history).toBeGreaterThan(0);
    expect(usage.breakdown.input).toBeGreaterThan(0);
    expect(usage.usedTokens).toBe(
      usage.breakdown.system + usage.breakdown.tools + usage.breakdown.history + usage.breakdown.input
    );
    expect(usage.level).toBe('safe');
    expect(usage.ratio).toBeCloseTo(usage.usedTokens / usage.contextWindow, 8);
  });

  test('预算口径与发送路径一致（窗口 - system - 4096 - 2000，再 ×0.7）', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: [],
      inputText: '',
      isolateChat: true,
    });
    const expectedBudget = Math.floor(
      Math.max(usage.contextWindow - usage.breakdown.system - 4096 - SAFETY_MARGIN, 0) * HISTORY_BUDGET_RATIO
    );
    expect(usage.breakdown.historyBudget).toBe(expectedBudget);
  });

  test('记忆关闭时历史不计入（即使有历史）', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(50),
      inputText: 'hi',
      isolateChat: false,
    });
    expect(usage.breakdown.history).toBe(0);
    expect(usage.breakdown.selectedCount).toBe(0);
  });

  test('高占用时进入 critical 档位', () => {
    // 用一个极大 systemPromptText 撑高超限（中文约 1.5 字符/token）
    const huge = '压'.repeat(600000);
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: huge,
      toolCount: 0,
      history: [],
      inputText: '',
      isolateChat: true,
    });
    expect(usage.level).toBe('critical');
    expect(usage.ratio).toBeGreaterThanOrEqual(0.9);
  });

  test('压缩摘要计入 system 分解且标记 compactionApplied', () => {
    const withCompaction = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(76),
      inputText: 'hi',
      compaction: compactionAt50,
      isolateChat: true,
    });
    expect(withCompaction.breakdown.compactionApplied).toBe(true);
    expect(withCompaction.breakdown.selectedCount).toBe(26);
    // system 分解包含注入段 → 大于纯提示词的估算
    const without = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(76),
      inputText: 'hi',
      compaction: null,
      isolateChat: true,
    });
    expect(withCompaction.breakdown.system).toBeGreaterThan(without.breakdown.system);
  });

  test('压缩失效时标记 compactionInvalid 且不过滤历史', () => {
    const usage = computeContextUsage({
      model: 'test-model',
      systemPromptText: 'SYS',
      toolCount: 0,
      history: makeHistory(10),
      inputText: 'hi',
      compaction: { summary: 'S', upToMessageId: 'm999', compressedCount: 1 },
      isolateChat: true,
    });
    expect(usage.breakdown.compactionApplied).toBe(false);
    expect(usage.breakdown.compactionInvalid).toBe(true);
    expect(usage.breakdown.selectedCount).toBe(10);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/context-usage.unit.test.js`
Expected: FAIL（`Failed to resolve import "../../src/shared/context-usage.js"`）

- [ ] **Step 3: 实现 `src/shared/context-usage.js`**

```js
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
  const inputTokens = estimateMessagesTokens([current]);
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/context-usage.unit.test.js`
Expected: PASS（全部用例）。若"预算不足时从后往前保留并生成规则摘要"用例的 `historySummaryText` 为 null，检查 `generateMessagesSummary` 对 user/assistant 消息的返回契约，必要时在测试中使用内容更长的消息。

- [ ] **Step 5: 运行全量单测确认无回归**

Run: `npm run test:unit`
Expected: 全部 PASS（现有 26 个测试文件 + 新增 1 个）

---

### Task 2: 会话级持久化（state.js + session-store.js）

**Files:**
- Modify: `src/side_panel/state.js`（新增 `activeCompaction` 状态）
- Modify: `src/storage/session-store.js`（保存/恢复 `contextCompaction` 字段）

**Interfaces:**
- Consumes: Task 1 无依赖（纯字段贯通）
- Produces: `state.activeCompaction`（`null` 或 `{ summary, upToMessageId, compressedCount, summaryTokens, savedTokens, model, createdAt, revision }`）；会话对象新增字段 `contextCompaction`（持久化到 IndexedDB）

- [ ] **Step 1: state.js 新增字段**

在 `src/side_panel/state.js` 的 `export let isolateChat = true;` 之后新增：

```js
// 当前会话的上下文压缩记录（会话级，随会话持久化；null 表示未压缩）
export let activeCompaction = null;
```

在 getter/setter 对象中（`set isolateChat(v) { isolateChat = v; },` 同行之后）新增：

```js
  get activeCompaction() { return activeCompaction; },
  set activeCompaction(v) { activeCompaction = v; },
```

- [ ] **Step 2: session-store.js 保存与恢复**

用 `grep -n "currentSession" src/storage/session-store.js` 定位 `saveCurrentSession()` 中构建 `currentSession` 对象的位置，在该对象字面量中加入：

```js
    contextCompaction: state.activeCompaction || undefined,
```

定位所有"将会话对象恢复到 state"的位置（`switchToSession()` 及相关加载/恢复函数，搜索 `state.messageHistory =`），在恢复 `messageHistory` 附近加入：

```js
    state.activeCompaction = targetSession.contextCompaction || null;
```

- [ ] **Step 3: 清理路径检查**

Run: `grep -n "messageHistory = \[\]" src/side_panel/*.js src/storage/*.js`
对每个"清空/新建会话"路径（新建会话、删除会话后的重置），在其附近加入：

```js
    state.activeCompaction = null;
```

（遗漏此步的兜底：`selectHistoryForSend` 对失效 `upToMessageId` 自动忽略压缩、不崩溃；但需在 Step 5 中核对无遗漏确保 UI 状态正确。）

- [ ] **Step 4: 构建验证**

Run: `npm run build:silent`
Expected: 构建成功，无报错

- [ ] **Step 5: 全量单测无回归**

Run: `npm run test:unit`
Expected: 全部 PASS

> 说明：本任务为字段贯通（无独立逻辑分支），不写单独单测；持久化行为的端到端验证在 Task 7 的"压缩→切换会话→切回"手动场景中覆盖。

---

### Task 3: background AI 摘要通道

**Files:**
- Create: `src/shared/compaction-prompt.js`（纯函数：素材限量 + 提示词构建）
- Create: `src/background/context-compactor.js`（AI 请求）
- Modify: `src/background/index.js`（消息路由 `COMPACT_CONTEXT_SUMMARY` + 路由表注释）
- Test: `test/unit/compaction-prompt.unit.test.js`

**Interfaces:**
- Consumes: `tool-executor.js` 的 `fetchWithRetry(url, options, timeoutMs, retries, backoffMs)`；`config.js` 的 `getStoredConfig()`；`token-recorder.js` 的 `recordTokenUsage({ sessionId, model, usage, callType })`
- Produces（Task 7 依赖）:
  - `generateCompactionSummary({ material, model, sessionId })` → `Promise<{ success: boolean, summary?: string, error?: string }>`
  - `MATERIAL_MAX_CHARS`(=4000)、`MATERIAL_TOTAL_MAX_CHARS`(=80000)、`sanitizeMaterialContent(content)`、`buildCompactionPrompt(material)`

- [ ] **Step 1: 写失败测试**

创建 `test/unit/compaction-prompt.unit.test.js`：

```js
// compaction-prompt 单元测试：素材限量 / 提示词构建（纯函数，node 环境）
import { describe, test, expect } from 'vitest';
import {
  buildCompactionPrompt,
  sanitizeMaterialContent,
  MATERIAL_MAX_CHARS,
  MATERIAL_TOTAL_MAX_CHARS,
} from '../../src/shared/compaction-prompt.js';

describe('sanitizeMaterialContent', () => {
  test('短内容原样返回', () => {
    expect(sanitizeMaterialContent('hello')).toBe('hello');
  });

  test('超长内容截断并追加标记', () => {
    const long = 'x'.repeat(MATERIAL_MAX_CHARS + 100);
    const out = sanitizeMaterialContent(long);
    expect(out.length).toBeLessThanOrEqual(MATERIAL_MAX_CHARS + 10);
    expect(out.endsWith('[已截断]')).toBe(true);
  });

  test('非字符串内容 JSON 序列化', () => {
    expect(sanitizeMaterialContent({ a: 1 })).toBe('{"a":1}');
    expect(sanitizeMaterialContent(null)).toBe('');
  });
});

describe('buildCompactionPrompt', () => {
  test('包含角色标签与素材内容', () => {
    const prompt = buildCompactionPrompt([
      { role: 'user', content: '帮我写个函数' },
      { role: 'assistant', content: '好的，函数如下' },
    ]);
    expect(prompt).toContain('[User]');
    expect(prompt).toContain('[Assistant]');
    expect(prompt).toContain('帮我写个函数');
    expect(prompt).toContain('好的，函数如下');
  });

  test('包含已有摘要合并要求（提示词规则）', () => {
    const prompt = buildCompactionPrompt([{ role: 'user', content: 'x' }]);
    expect(prompt).toContain('【已有摘要】');
  });

  test('总长超限时保留最近素材、丢弃最早素材', () => {
    const chunk = 'y'.repeat(MATERIAL_MAX_CHARS);
    const material = [];
    for (let i = 0; i < 30; i++) material.push({ role: 'user', content: `标签${i}-` + chunk });
    const prompt = buildCompactionPrompt(material);
    // 最新一条必须在，最早一条必须被丢弃
    expect(prompt).toContain('标签29-');
    expect(prompt).not.toContain('标签0-');
    // 总长受控（含提示词模板余量）
    expect(prompt.length).toBeLessThan(MATERIAL_TOTAL_MAX_CHARS + 2000);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/compaction-prompt.unit.test.js`
Expected: FAIL（无法解析 `src/shared/compaction-prompt.js`）

- [ ] **Step 3: 实现 `src/shared/compaction-prompt.js`**

```js
// shared/compaction-prompt.js - 压缩摘要的素材限量与提示词构建（纯函数，无外部依赖）
// 侧边栏收集素材与 background 构建请求共用同一套限量口径。

// 单条素材消息在提示词中保留的最大字符数
const MATERIAL_MAX_CHARS = 4000;
// 素材总字符上限（超出时从最早素材开始丢弃，保留最近内容）
const MATERIAL_TOTAL_MAX_CHARS = 80000;

export { MATERIAL_MAX_CHARS, MATERIAL_TOTAL_MAX_CHARS };

/**
 * 清洗单条素材消息内容为受控长度字符串
 */
export function sanitizeMaterialContent(content) {
  if (content === null || content === undefined) return '';
  const text = typeof content === 'string' ? content : JSON.stringify(content) ?? '';
  if (text.length <= MATERIAL_MAX_CHARS) return text;
  return text.substring(0, MATERIAL_MAX_CHARS) + '…[已截断]';
}

/**
 * 构建压缩提示词
 * @param {Array<{role: string, content: string}>} material - 素材（若含【已有摘要】条目应置于最前）
 * @returns {string}
 */
export function buildCompactionPrompt(material) {
  const lines = (material || []).map(m => {
    const roleLabel = m.role === 'user' ? 'User' : m.role === 'assistant' ? 'Assistant' : (m.role || 'Unknown');
    return `[${roleLabel}]\n${sanitizeMaterialContent(m.content)}`;
  });

  // 总长控制：从最新往旧保留，保证最近内容优先进入提示词
  let total = 0;
  const kept = [];
  for (let i = lines.length - 1; i >= 0; i--) {
    total += lines[i].length;
    if (total > MATERIAL_TOTAL_MAX_CHARS && kept.length > 0) break;
    kept.unshift(lines[i]);
  }

  return `你是一个对话上下文压缩助手。下面是用户与 AI 助手之前的对话内容，请将其压缩为一份结构化中文摘要，供后续对话继续使用。

要求：
1. 保留：用户的当前任务目标与最新诉求、已达成的关键结论与决策、重要的文件路径/代码/数据/实体名称、未完成事项与下一步。
2. 省略：寒暄、重复表述、中间推理过程、已被推翻的方案。
3. 若素材中包含【已有摘要】条目，它是对更早历史的既有摘要，请将其内容与后续对话合并为一份新摘要（不要丢弃其中仍然有效的信息）。
4. 直接输出摘要正文，不要任何前缀说明（如"以下是摘要"）。

对话内容：
${kept.join('\n\n')}`;
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/compaction-prompt.unit.test.js`
Expected: PASS（全部用例）

- [ ] **Step 5: 实现 `src/background/context-compactor.js`**

```js
// background/context-compactor.js - 会话上下文压缩摘要生成
// 用户手动触发"压缩上下文"时，将由侧边栏清洗后的对话素材交给当前模型生成结构化摘要；
// 失败不静默降级（用户显式操作，需明确反馈）。
import { fetchWithRetry } from './tool-executor.js';
import { getStoredConfig } from './config.js';
import { recordTokenUsage } from './token-recorder.js';
import { buildCompactionPrompt } from '../shared/compaction-prompt.js';
import logger from '../shared/logger.js';

// 摘要生成的最大输出 token 数（结构化摘要通常数百字）
const COMPACT_MAX_TOKENS = 2048;
// 超时（用户手动触发，允许比 ReAct 摘要更长）
const COMPACT_TIMEOUT_MS = 60000;

/**
 * 生成压缩摘要
 * @param {Object} params
 * @param {Array<{role: string, content: string}>} params.material - 已清洗素材
 * @param {string} [params.model] - 模型名（默认取配置）
 * @param {string} [params.sessionId] - 会话 ID（token 统计用）
 * @returns {Promise<{ success: boolean, summary?: string, error?: string }>}
 */
export async function generateCompactionSummary({ material, model, sessionId } = {}) {
  if (!Array.isArray(material) || material.length === 0) {
    return { success: false, error: 'material_empty' };
  }
  const config = await getStoredConfig();
  if (!config?.apiBase || !config?.apiKey) {
    return { success: false, error: 'config_missing' };
  }

  const prompt = buildCompactionPrompt(material);
  const apiUrl = `${config.apiBase}/chat/completions`;
  const useModel = model || config.modelName;

  try {
    const response = await fetchWithRetry(apiUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: useModel,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        max_tokens: COMPACT_MAX_TOKENS,
        temperature: 0.2
      })
    }, COMPACT_TIMEOUT_MS, 1, 1000); // 用户手动触发，快速失败并明确报错

    if (!response.ok) {
      logger.warn(`[ContextCompactor] request failed: ${response.status}`);
      return { success: false, error: `http_${response.status}` };
    }
    const data = await response.json();
    const summary = (data.choices?.[0]?.message?.content || '').trim();
    if (!summary) {
      return { success: false, error: 'empty_summary' };
    }

    // token 统计（内部静默失败）
    recordTokenUsage({ sessionId, model: useModel, usage: data.usage, callType: 'context_compaction' }).catch(() => {});

    logger.debug(`[ContextCompactor] summary done, ${summary.length} chars`);
    return { success: true, summary };
  } catch (error) {
    logger.warn('[ContextCompactor] exception:', error.message);
    return { success: false, error: error.message || 'request_failed' };
  }
}
```

- [ ] **Step 6: 注册 background 消息路由**

在 `src/background/index.js` 顶部 import 区加入：

```js
import { generateCompactionSummary } from './context-compactor.js';
```

在消息监听链中（建议放在 `GET_CHECKPOINT` 处理块之前）加入：

```js
  // 生成会话上下文压缩摘要（用户手动触发"压缩上下文"）
  if (message.type === 'COMPACT_CONTEXT_SUMMARY') {
    const { material, model, sessionId } = message;
    generateCompactionSummary({ material, model, sessionId })
      .then(result => {
        sendResponse(result);
      })
      .catch(err => {
        logger.warn('[Background] COMPACT_CONTEXT_SUMMARY failed:', err);
        sendResponse({ success: false, error: err?.message || 'unknown' });
      });
    return true;  // 异步响应
  }
```

在路由表注释（`// | 消息类型 ...` 表格）中追加一行：

```
// | COMPACT_CONTEXT_SUMMARY       | side_panel  | 手动压缩上下文摘要生成       | 是   |
```

- [ ] **Step 7: 运行测试 + 构建验证**

Run: `npx vitest run test/unit/compaction-prompt.unit.test.js && npm run build:silent`
Expected: 测试 PASS、构建成功

---

### Task 4: 三处发送路径改造（统一共享函数）

**Files:**
- Modify: `src/side_panel/chat-manager.js`（`sendMessage` 内历史组装块，约 L900-966）
- Modify: `src/side_panel/prompt-manager.js`（提示词发送路径历史组装块，约 L803-854）
- Modify: `src/side_panel/index.js`（划词/直接发送路径历史组装块，约 L758-809）

**Interfaces:**
- Consumes: Task 1 的 `selectHistoryForSend` / `appendCompactionToSystemPrompt`；Task 2 的 `state.activeCompaction`
- Produces: 三处发送路径行为等价可验证（无压缩时与改造前一致，有压缩时按 spec 发送公式组装）

- [ ] **Step 1: 改造 chat-manager.js**

在 import 区加入：

```js
import { selectHistoryForSend, appendCompactionToSystemPrompt } from '../shared/context-usage.js';
```

将 `sendMessage` 内 `if (state.isolateChat) {` 块（自该行起至配对的 `} else {` 之前的整块，约 66 行）替换为：

```js
    if (state.isolateChat) {
      // Token 预算驱动：使用实际系统提示词 token 数而非固定估算值
      const configuredWindow = 0;
      const actualSystemTokens = estimateTokens(messages[0]?.content || '');
      const contextWindow = getContextWindow(model, configuredWindow, state.customModelMap);
      // 消息预算 = 上下文窗口 - 实际系统提示词 - 输出预留(4096) - 安全余量(2000)
      const messageBudget = contextWindow - actualSystemTokens - 4096 - 2000;
      // 历史消息占用预算的 70%（预留给工具结果和模型输出）
      const historyBudget = Math.floor(messageBudget * 0.7);

      // 记忆层 / 窗口层 / 压缩层 / 预算层统一由共享函数处理（与指示器预览同源）
      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      const selection = selectHistoryForSend(state.messageHistory.slice(0, -1), {
        isolateChat: true,
        maxMemoryMessages: state.chatConfig.maxMemoryMessages,
        compaction: state.activeCompaction,
        historyBudget,
        currentMessage: currentMsg,
      });

      // 压缩摘要注入 system prompt（S 受 preserveSystem 保护，不会被自动裁剪丢弃）
      if (selection.compactionApplied) {
        messages[0] = { ...messages[0], content: appendCompactionToSystemPrompt(messages[0].content, state.activeCompaction) };
      } else if (state.activeCompaction) {
        logger.warn('[SidePanel] contextCompaction invalid (upToMessageId not found), ignored this send');
      }
      // 被预算裁剪消息的规则摘要注入 system prompt（现有兜底逻辑保留）
      if (selection.historySummaryText) {
        messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + selection.historySummaryText };
      }
      logger.debug(`[SidePanel] history selection: keep ${selection.keptHistory.length}/${state.messageHistory.length - 1}, trimmed ${selection.trimmedCount}, compactionApplied: ${selection.compactionApplied}`);

      messages = [...messages, ...selection.messages];
      // 剥离历史消息中的旧图片数据，只保留当前最新消息的图片
      for (let i = 0; i < messages.length - 1; i++) {
        messages[i] = { ...messages[i], content: stripImagesFromContent(messages[i].content) };
      }
    } else {
      // 构建用户消息 content（支持图片附件）
      const userContent = buildUserContent(finalText);
      messages.push({ role: 'user', content: userContent });
    }
```

要点：`else` 分支原文照抄（`buildUserContent(finalText)`）；替换后原有的"从后往前保留/被裁消息摘要/memory count limit 日志"逻辑全部由共享函数接管。

- [ ] **Step 2: 改造 prompt-manager.js**

在 import 区加入同样一行 import（`../shared/context-usage.js`）。

将历史组装块（自 `if (state.isolateChat) {` 起，含 `const configuredWindow = 0;` … 至 `} else {` 之前，约 L803-854）替换为：

```js
    // 如果记忆对话，则发送历史对话；否则只发送当前最新消息
    if (state.isolateChat) {
      // Token 预算驱动：根据模型上下文窗口动态裁剪（沿用本路径原有口径）
      const configuredWindow = 0;
      const toolCount = state.enabledTools.length || 50;
      const messageBudget = getMessageBudget(model, toolCount, configuredWindow, state.customModelMap);
      const historyBudget = Math.floor(messageBudget * 0.7);

      // 记忆层 / 窗口层 / 压缩层 / 预算层统一由共享函数处理（与指示器预览同源）
      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      const selection = selectHistoryForSend(state.messageHistory.slice(0, -1), {
        isolateChat: true,
        maxMemoryMessages: state.chatConfig.maxMemoryMessages,
        compaction: state.activeCompaction,
        historyBudget,
        currentMessage: currentMsg,
      });

      // 压缩摘要注入 system prompt（S 受 preserveSystem 保护，不会被自动裁剪丢弃）
      if (selection.compactionApplied) {
        messages[0] = { ...messages[0], content: appendCompactionToSystemPrompt(messages[0].content, state.activeCompaction) };
      } else if (state.activeCompaction) {
        logger.warn('[SidePanel] contextCompaction invalid (upToMessageId not found), ignored this send');
      }
      // 被预算裁剪消息的规则摘要注入 system prompt（现有兜底逻辑保留）
      if (selection.historySummaryText) {
        messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + selection.historySummaryText };
      }

      messages = [...messages, ...selection.messages];
      // 剥离历史消息中的旧图片数据，只保留当前最新消息的图片
      for (let i = 0; i < messages.length - 1; i++) {
        messages[i] = { ...messages[i], content: stripImagesFromContent(messages[i].content) };
      }
    } else {
      // 无记忆模式：只发送当前用户消息
      messages.push({ role: 'user', content: userContent });
    }
```

要点：本路径预算口径（`getMessageBudget` + `state.enabledTools.length || 50`）与 `else` 分支原文**保持不变**；仅历史选择与注入逻辑替换为共享函数。

- [ ] **Step 3: 改造 index.js**

在 import 区加入同样一行 import（`../shared/context-usage.js`）。

将历史组装块（自 `if (state.isolateChat) {` 起至 `} else {` 之前，约 L758-809）替换为：

```js
    if (state.isolateChat) {
      // Token 预算驱动：使用实际系统提示词 token 数而非固定估算值
      const configuredWindow = 0;
      const actualSystemTokens = estimateTokens(messages[0]?.content || '');
      const contextWindow = getContextWindow(model, configuredWindow, state.customModelMap);
      // 消息预算 = 上下文窗口 - 实际系统提示词 - 输出预留(4096) - 安全余量(2000)
      // 非工具模式下不发送工具定义，故工具开销为 0
      const messageBudget = contextWindow - actualSystemTokens - 4096 - 2000;
      const historyBudget = Math.floor(messageBudget * 0.7);

      // 记忆层 / 窗口层 / 压缩层 / 预算层统一由共享函数处理（与指示器预览同源）
      const currentMsg = state.messageHistory[state.messageHistory.length - 1];
      const selection = selectHistoryForSend(state.messageHistory.slice(0, -1), {
        isolateChat: true,
        maxMemoryMessages: state.chatConfig.maxMemoryMessages,
        compaction: state.activeCompaction,
        historyBudget,
        currentMessage: currentMsg,
      });

      // 压缩摘要注入 system prompt（S 受 preserveSystem 保护，不会被自动裁剪丢弃）
      if (selection.compactionApplied) {
        messages[0] = { ...messages[0], content: appendCompactionToSystemPrompt(messages[0].content, state.activeCompaction) };
      } else if (state.activeCompaction) {
        logger.warn('[SidePanel] contextCompaction invalid (upToMessageId not found), ignored this send');
      }
      // 被预算裁剪消息的规则摘要注入 system prompt（现有兜底逻辑保留）
      if (selection.historySummaryText) {
        messages[0] = { ...messages[0], content: messages[0].content + '\n\n' + selection.historySummaryText };
      }

      messages = [...messages, ...selection.messages];
      // 剥离历史消息中的旧图片数据，只保留当前最新消息的图片
      for (let i = 0; i < messages.length - 1; i++) {
        messages[i] = { ...messages[i], content: stripImagesFromContent(messages[i].content) };
      }
    } else {
      messages.push({ role: 'user', content: userMessage });
    }
```

要点：本路径原有裁剪循环**不剥图片**，共享函数统一为剥图片后估算（更精确，属有意统一）；`else` 分支原文（`userMessage` 变量）保持不变。

- [ ] **Step 4: 清理未使用导入（eslint）**

Run: `npx eslint src/side_panel/chat-manager.js src/side_panel/prompt-manager.js src/side_panel/index.js`
按提示删除因替换而不再使用的导入（典型：`generateMessagesSummary`；注意 `stripImagesFromContent`、`estimateMessagesTokens`、`getMessageBudget` 可能仍被文件内其他位置使用，需 grep 确认后再删）。

- [ ] **Step 5: 构建 + 全量单测**

Run: `npm run build:silent && npm run test:unit`
Expected: 构建成功、全部测试 PASS

---

### Task 5: 指示器 UI（HTML + CSS + 渲染调度 + 初始化）

**Files:**
- Modify: `side_panel.html`（`.input-disclaimer` 前插入指示器按钮，约 L603）
- Modify: `src/side_panel/styles.css`（`.input-disclaimer` 样式块后追加指示器样式，约 L4629-4645）
- Create: `src/side_panel/context-indicator.js`（渲染 + 调度 + 缓存；本任务先做基础版）
- Modify: `src/side_panel/index.js`（DOMContentLoaded 初始化挂载）

**Interfaces:**
- Consumes: Task 1 的 `computeContextUsage`；`utils.js` 的 `getSystemPrompt` / `formatTokenCount`；`agent-manager.js` 的 `getCurrentAgentPrompt`；`state`（`currentModel` / `customModelMap` / `useTools` / `enabledTools` / `chatConfig.maxMemoryMessages` / `isolateChat` / `activeCompaction` / `mcpClosedServers` / `activeAgentMcpExcludedServerIds` / `messageHistory`）
- Produces（Task 6/7 依赖）:
  - `initContextIndicator()` / `updateContextIndicator()` / `scheduleContextUpdate()` / `refreshContextCaches()`
  - `computeCurrentUsage()` → `{ usage, inputText }`
  - DOM: `#contextUsageIndicator[data-level]`（level: safe/warning/critical）、CSS 变量 `--usage-ratio`(0-1)

- [ ] **Step 1: side_panel.html 插入指示器 DOM**

在 `<div class="input-disclaimer" data-i18n="input.aiDisclaimer">内容由 AI 生成，仅供参考</div>`（L603）之前插入：

```html
    <button id="contextUsageIndicator" class="context-usage-indicator" type="button" data-level="safe">
      <span class="context-usage-ring" aria-hidden="true"></span>
      <span class="context-usage-percent">--%</span>
    </button>
```

- [ ] **Step 2: styles.css 追加样式**

在 `.input-disclaimer` 样式块（约 L4629-4645）之后追加：

```css
/* ========== 上下文占用指示器（input-container 内左下角，disclaimer 左侧空白区） ========== */
.context-usage-indicator {
  position: absolute;
  left: 16px;
  bottom: 2px;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 4px;
  background: none;
  border: none;
  cursor: pointer;
  font-size: 10px;
  line-height: 1;
  color: #b0b0b0;
  border-radius: 4px;
  z-index: 2;
  transition: color 0.15s ease, opacity 0.15s ease;
}

.context-usage-indicator:hover { opacity: 0.8; }

.context-usage-indicator[data-level="safe"] { color: #4caf50; }
.context-usage-indicator[data-level="warning"] { color: #ff9800; }
.context-usage-indicator[data-level="critical"] { color: #f44336; }

.context-usage-ring {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  flex: none;
  background: conic-gradient(currentColor calc(var(--usage-ratio, 0) * 1turn), rgba(128, 128, 128, 0.25) 0);
  -webkit-mask: radial-gradient(circle, transparent 3px, #000 3.5px);
  mask: radial-gradient(circle, transparent 3px, #000 3.5px);
}

.context-usage-percent { font-variant-numeric: tabular-nums; }

/* 窄屏：隐藏百分比文字，仅保留环形 */
@media (max-width: 420px) {
  .context-usage-percent { display: none; }
}
```

- [ ] **Step 3: 创建 `src/side_panel/context-indicator.js`（基础版）**

```js
// side_panel/context-indicator.js - 上下文占用指示器（输入框下方百分比；详情与手动压缩后续任务扩展）
import state from './state.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { computeContextUsage } from '../shared/context-usage.js';
import { getSystemPrompt, formatTokenCount } from './utils.js';
import { getCurrentAgentPrompt } from './agent-manager.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  contextUsage: {
    indicatorTitle: '上下文占用 {percent}%（{used} / {total} tokens）· 点击查看详情',
  },
});
registerTranslations('en', {
  contextUsage: {
    indicatorTitle: 'Context usage {percent}% ({used} / {total} tokens) · Click for details',
  },
});

const DEBOUNCE_MS = 300;

// system prompt 缓存（含 agent 服务网络查询，不能在防抖计算里直调）
let systemPromptCache = '';
// 有效 MCP 工具数缓存（发送/配置变化时刷新）
let mcpToolCountCache = 0;
let debounceTimer = null;

/** 有效 MCP 工具数（独立轻量实现，与 chat-manager 的 countEffectiveMcpTools 口径一致） */
async function getEffectiveMcpToolCount() {
  try {
    const { mcpTools } = await chrome.storage.local.get(['mcpTools']);
    const tools = mcpTools || [];
    const closedSet = new Set(Array.isArray(state.mcpClosedServers) ? state.mcpClosedServers : []);
    const excludedSet = new Set(Array.isArray(state.activeAgentMcpExcludedServerIds) ? state.activeAgentMcpExcludedServerIds : []);
    return tools.filter(item => {
      const sid = item.serverId || 'unknown';
      return !closedSet.has(sid) && !excludedSet.has(sid);
    }).length;
  } catch {
    return 0;
  }
}

/** 计算当前占用（指示器与详情弹窗共用） */
export function computeCurrentUsage() {
  const inputEl = document.getElementById('userInput');
  const inputText = inputEl?.value || '';
  const usage = computeContextUsage({
    model: state.currentModel,
    customModelMap: state.customModelMap,
    systemPromptText: systemPromptCache,
    toolCount: (state.useTools ? state.enabledTools.length : 0) + mcpToolCountCache,
    history: state.messageHistory,
    inputText,
    maxMemoryMessages: state.chatConfig?.maxMemoryMessages ?? null,
    compaction: state.activeCompaction,
    isolateChat: state.isolateChat,
  });
  return { usage, inputText };
}

function renderIndicator(usage) {
  const el = document.getElementById('contextUsageIndicator');
  if (!el) return;
  el._lastUsage = usage;
  el.dataset.level = usage.level;
  const percent = Math.round(usage.ratio * 100);
  const percentEl = el.querySelector('.context-usage-percent');
  if (percentEl) percentEl.textContent = `${percent}%`;
  el.style.setProperty('--usage-ratio', String(Math.min(Math.max(usage.ratio, 0), 1)));
  el.title = t('contextUsage.indicatorTitle', {
    percent,
    used: formatTokenCount(usage.usedTokens),
    total: formatTokenCount(usage.contextWindow),
  });
}

/** 立即重算并渲染；返回 usage 供调用方使用 */
export function updateContextIndicator() {
  try {
    const { usage } = computeCurrentUsage();
    renderIndicator(usage);
    return usage;
  } catch (err) {
    logger.warn('[ContextIndicator] update failed:', err?.message);
    return null;
  }
}

/** 防抖重算（输入框打字等高频场景） */
export function scheduleContextUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => updateContextIndicator(), DEBOUNCE_MS);
}

/** 刷新缓存（system prompt 文本 + 有效 MCP 工具数）后重算 */
export async function refreshContextCaches() {
  try {
    const agent = await getCurrentAgentPrompt();
    systemPromptCache = await getSystemPrompt(agent);
  } catch (err) {
    logger.warn('[ContextIndicator] refresh system prompt failed:', err?.message);
  }
  try {
    mcpToolCountCache = await getEffectiveMcpToolCount();
  } catch {
    mcpToolCountCache = 0;
  }
  updateContextIndicator();
}

export function initContextIndicator() {
  const el = document.getElementById('contextUsageIndicator');
  if (!el) return;

  // 输入变化：防抖重算（含当前输入 token）
  const inputEl = document.getElementById('userInput');
  inputEl?.addEventListener('input', scheduleContextUpdate);

  // 发送/接收完成：刷新缓存并重算（更新时机表：发送完成/接收完成）
  document.addEventListener('generating-state-changed', () => { refreshContextCaches(); });
  // 模型/助手切换：system prompt 与工具集可能变化
  document.addEventListener('agent-model-changed', () => { refreshContextCaches(); });
  // 会话切换：state.activeCompaction 已由 switchToSession 恢复，直接重算
  document.addEventListener('session-switched', () => { scheduleContextUpdate(); });
  // 记忆开关 / 条数 / MCP / 工具变化
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.chatMaxMemoryMessages || changes.isolateChat) {
      scheduleContextUpdate();
    }
    if (changes.isolateChat || changes.mcpTools || changes.mcpEnabled || changes.enabledTools || changes.enableTools) {
      refreshContextCaches();
    }
  });

  refreshContextCaches();
}
```

- [ ] **Step 4: index.js 挂载初始化**

在 `src/side_panel/index.js` import 区加入：

```js
import { initContextIndicator } from './context-indicator.js';
```

在 DOMContentLoaded 初始化列表区（`document.addEventListener('DOMContentLoaded', initMessageToc);` 附近，约 L4263）追加：

```js
 document.addEventListener('DOMContentLoaded', initContextIndicator);
```

- [ ] **Step 5: 构建 + 手动初步验证**

Run: `npm run build:silent`
Expected: 构建成功

手动验证（重新加载扩展后打开侧边栏）：
1. 输入框下方左侧出现指示器（如 `◔ 8%`），颜色随占用变化（安全=绿）
2. 输入文字时百分比防抖更新（300ms）
3. 切换记忆开关/条数，百分比随之变化
4. 窄窗口（<420px）百分比文字隐藏、仅留环形

---

### Task 6: 压缩流程核心与分隔条

**Files:**
- Modify: `src/shared/context-usage.js`（新增 `assembleCompactionMaterial`）
- Modify: `test/unit/context-usage.unit.test.js`（新增用例）
- Modify: `src/side_panel/context-indicator.js`（压缩触发/确认弹窗/执行/撤销/分隔条）
- Modify: `src/side_panel/chat-manager.js`（三个恢复路径调用 `renderCompactionDivider()`）
- Modify: `src/side_panel/styles.css`（分隔条样式）

**Interfaces:**
- Consumes: Task 3 的 `COMPACT_CONTEXT_SUMMARY` 消息；Task 2 的 `state.activeCompaction` + `saveCurrentSession()`；`token-counter.js` 的 `estimateTokens` / `estimateMessagesTokens`；`utils.js` 的 `showToast` / `formatTokenCount`
- Produces（Task 7 依赖）:
  - `triggerCompaction()` → `Promise<void>`（含确认弹窗；会话数据不变直到成功）
  - `undoCompaction(skipConfirm = false)` → `Promise<void>`
  - `renderCompactionDivider()` / `removeCompactionDivider()`
  - `assembleCompactionMaterial(history, { maxMemoryMessages, compaction })` → `{ material, includedCount, hasOldSummary }`

- [ ] **Step 1: 为 `assembleCompactionMaterial` 写失败测试**

在 `test/unit/context-usage.unit.test.js` 的 import 中追加 `assembleCompactionMaterial`，并新增：

```js
describe('assembleCompactionMaterial', () => {
  test('无压缩：素材为全部历史（不含当前输入的占位）', () => {
    const r = assembleCompactionMaterial(makeHistory(5), { maxMemoryMessages: null, compaction: null });
    expect(r.includedCount).toBe(5);
    expect(r.hasOldSummary).toBe(false);
    expect(r.material.length).toBe(5);
    expect(r.material[0].content).toContain('这是第1条');
  });

  test('条数限制：素材为最近 N 条', () => {
    const r = assembleCompactionMaterial(makeHistory(76), { maxMemoryMessages: 10 });
    expect(r.includedCount).toBe(10);
    expect(r.material[0].content).toContain('这是第67条');
  });

  test('已有压缩：素材含【已有摘要】+ 压缩点后消息', () => {
    const r = assembleCompactionMaterial(makeHistory(76), { maxMemoryMessages: null, compaction: compactionAt50 });
    expect(r.hasOldSummary).toBe(true);
    expect(r.material[0].content).toContain('【已有摘要】');
    expect(r.material[0].content).toContain('S1旧摘要内容');
    expect(r.includedCount).toBe(26);
    expect(r.material[1].content).toContain('这是第51条');
  });

  test('压缩点失效：忽略压缩，素材为全部历史且无已有摘要', () => {
    const r = assembleCompactionMaterial(makeHistory(76), {
      compaction: { summary: 'S', upToMessageId: 'm999' },
    });
    expect(r.hasOldSummary).toBe(false);
    expect(r.includedCount).toBe(76);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx vitest run test/unit/context-usage.unit.test.js`
Expected: FAIL（`assembleCompactionMaterial is not a function`）

- [ ] **Step 3: 在 context-usage.js 实现 `assembleCompactionMaterial`**

在 `computeContextUsage` 之后追加：

```js
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
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/context-usage.unit.test.js`
Expected: PASS

- [ ] **Step 5: context-indicator.js 追加压缩流程**

在文件顶部 import 区追加：

```js
import { assembleCompactionMaterial } from '../shared/context-usage.js';
import { estimateTokens, estimateMessagesTokens } from '../shared/token-counter.js';
import { saveCurrentSession } from './session-manager.js';
import { showToast } from './utils.js';
```

（合并到已有的 `../shared/context-usage.js` / `./utils.js` import 行中，避免重复导入同一模块。）

在 i18n 注册块中追加文案（zh/en 同步）：

```js
    // zh
    memoryOffToast: '记忆已关闭，无可压缩内容',
    generatingToast: '正在生成回复，请稍后再试',
    nothingToCompactToast: '没有新的消息可压缩',
    confirmTitle: '压缩上下文',
    confirmMessage: '将压缩 {count} 条历史消息（约 {tokens} tokens）为一份摘要{summaryHint}。原始消息仍保留在会话中，可随时撤销。',
    confirmWithOldSummary: '（含已有摘要，将合并为新摘要）',
    confirmOk: '开始压缩',
    compactDone: '压缩完成，节约约 {saved} tokens',
    compactErrConfig: '无法压缩：API 配置缺失',
    compactErrFailed: '压缩失败，请稍后重试',
    undoTitle: '撤销压缩',
    undoMessage: '撤销后，发送将恢复携带完整历史。确定撤销吗？',
    undoOk: '撤销',
    undoDone: '已撤销压缩',
    dividerText: '⬆ 上方 {count} 条消息已压缩为摘要',
    dividerView: '查看',
    dividerUndo: '撤销',
```

在文件末尾追加压缩流程函数：

```js
// ==================== 手动压缩流程 ====================

/** 通用确认框（复用项目 modal 样式类） */
function showConfirmDialog({ title, message, okText }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.style.zIndex = '10200';
    overlay.innerHTML = `
      <div class="modal-container">
        <div class="modal-title"></div>
        <div class="modal-message"></div>
        <div class="modal-actions">
          <button class="modal-btn cancel">${t('common.cancel')}</button>
        </div>
      </div>
    `;
    overlay.querySelector('.modal-title').textContent = title;
    overlay.querySelector('.modal-message').textContent = message;
    const actions = overlay.querySelector('.modal-actions');
    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn confirm';
    okBtn.textContent = okText;
    actions.appendChild(okBtn);
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.modal-btn.cancel').addEventListener('click', () => cleanup(false));
    okBtn.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
  });
}

/** 入口：收集素材 → 确认 → 调 background 生成摘要 → 持久化 */
export async function triggerCompaction() {
  if (!state.isolateChat) {
    showToast(t('contextUsage.memoryOffToast'), 'warning');
    return;
  }
  if (state.isGenerating) {
    showToast(t('contextUsage.generatingToast'), 'warning');
    return;
  }
  const history = state.messageHistory;
  if (!history.length) {
    showToast(t('contextUsage.nothingToCompactToast'), 'warning');
    return;
  }

  const old = state.activeCompaction;
  const { material, includedCount, hasOldSummary } = assembleCompactionMaterial(history, {
    maxMemoryMessages: state.chatConfig?.maxMemoryMessages ?? null,
    compaction: old,
  });
  if (includedCount === 0) {
    showToast(t('contextUsage.nothingToCompactToast'), 'warning');
    return;
  }

  const materialTokens = estimateMessagesTokens(material.map(m => ({ role: m.role, content: m.content })));
  const confirmed = await showConfirmDialog({
    title: t('contextUsage.confirmTitle'),
    message: t('contextUsage.confirmMessage', {
      count: includedCount,
      tokens: formatTokenCount(materialTokens),
      summaryHint: hasOldSummary ? t('contextUsage.confirmWithOldSummary') : '',
    }),
    okText: t('contextUsage.confirmOk'),
  });
  if (!confirmed) return;

  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'COMPACT_CONTEXT_SUMMARY',
      material,
      model: state.currentModel,
      sessionId: state.activeSessionId,
    });
    if (!resp?.success || !resp.summary) {
      const errKey = resp?.error === 'config_missing' ? 'contextUsage.compactErrConfig' : 'contextUsage.compactErrFailed';
      showToast(t(errKey), 'error');
      return;
    }

    // 压缩点 = 被压缩素材的最后一条消息（历史最后一条）
    const lastMsg = history[history.length - 1];
    const summaryTokens = estimateTokens(resp.summary);
    state.activeCompaction = {
      summary: resp.summary,
      upToMessageId: lastMsg?.messageId,
      compressedCount: (old?.compressedCount || 0) + includedCount,
      summaryTokens,
      savedTokens: Math.max(materialTokens - summaryTokens, 0),
      model: state.currentModel,
      createdAt: Date.now(),
      revision: (old?.revision || 0) + 1,
    };

    await saveCurrentSession();
    renderCompactionDivider();
    updateContextIndicator();
    showToast(t('contextUsage.compactDone', { saved: formatTokenCount(state.activeCompaction.savedTokens) }), 'success');
  } catch (err) {
    logger.warn('[ContextIndicator] compaction failed:', err?.message);
    showToast(t('contextUsage.compactErrFailed'), 'error');
  }
}

/** 撤销压缩（分隔条按钮：含确认；弹窗/详情按钮：skipConfirm=true） */
export async function undoCompaction(skipConfirm = false) {
  if (!state.activeCompaction) return;
  if (!skipConfirm) {
    const ok = await showConfirmDialog({
      title: t('contextUsage.undoTitle'),
      message: t('contextUsage.undoMessage'),
      okText: t('contextUsage.undoOk'),
    });
    if (!ok) return;
  }
  state.activeCompaction = null;
  await saveCurrentSession();
  removeCompactionDivider();
  updateContextIndicator();
  showToast(t('contextUsage.undoDone'), 'success');
}

/** 移除分隔条 */
export function removeCompactionDivider() {
  document.querySelectorAll('.compaction-divider').forEach(el => el.remove());
}

/** 渲染分隔条（恢复渲染后调用；找不到锚点/无压缩时静默跳过） */
export function renderCompactionDivider() {
  removeCompactionDivider();
  const compaction = state.activeCompaction;
  if (!compaction?.upToMessageId) return;
  const container = document.getElementById('chatContainer');
  if (!container) return;
  const anchor = container.querySelector(`[data-message-id="${CSS.escape(compaction.upToMessageId)}"]`);
  if (!anchor) return;

  const divider = document.createElement('div');
  divider.className = 'compaction-divider';
  divider.innerHTML = `
    <span class="compaction-divider-text">${t('contextUsage.dividerText', { count: compaction.compressedCount })}</span>
    <button class="compaction-divider-btn" data-action="undo">${t('contextUsage.dividerUndo')}</button>
  `;
  divider.querySelector('[data-action="undo"]').addEventListener('click', () => undoCompaction());
  anchor.after(divider);
}
```

> 说明：分隔条的"查看"按钮在 Task 7 详情弹窗实现后接入（本任务先只保留"撤销"按钮，避免引用尚不存在的函数）；Task 7 Step 4 会补上"查看"按钮。

- [ ] **Step 6: chat-manager.js 恢复路径调用**

在 `src/side_panel/chat-manager.js` import 区加入：

```js
import { renderCompactionDivider } from './context-indicator.js';
```

定位三个历史恢复渲染函数（Run: `grep -n "function _loadChatHistoryImpl\|function rebindAllMessages\|export function restoreMessageFromHtml" src/side_panel/chat-manager.js`），在每个函数**消息 DOM 渲染完成之后的返回点前**加入：

```js
  renderCompactionDivider();
```

> 实施补充：执行中发现 Task 2 的“所有恢复位置”（`state.messageHistory =`）遗漏两处——`_loadChatHistoryImpl`（chat-manager.js，页面加载恢复）与 `reloadAfterDelete`（session-manager-ui.js，删除会话后重载），已在本次一并补上 `state.activeCompaction = ... || null`；否则页面刷新 / 删除会话后压缩状态丢失（指示器偏高、分隔条丢失、发送携带完整历史）。修复经 Node 脚本通道完成（chat-manager.js 禁用 SearchReplace），esc-n 计数保护校验通过。

- [ ] **Step 7: styles.css 追加分隔条样式**

在 Task 5 的指示器样式之后追加：

```css
/* ========== 压缩分隔条（聊天区内） ========== */
.compaction-divider {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  margin: 4px 12px;
  padding: 4px 8px;
  font-size: 11px;
  color: #8f8f8f;
  background: rgba(128, 128, 128, 0.08);
  border-radius: 6px;
  border: 1px dashed rgba(128, 128, 128, 0.3);
}

.compaction-divider-btn {
  background: none;
  border: none;
  color: #4a90d9;
  cursor: pointer;
  font-size: 11px;
  padding: 0 2px;
}

.compaction-divider-btn:hover { text-decoration: underline; }
```

- [ ] **Step 8: 全量单测 + 构建**

Run: `npm run test:unit && npm run build:silent`
Expected: 全部 PASS、构建成功

---

### Task 7: 详情弹窗与交互收口

**Files:**
- Modify: `src/side_panel/context-indicator.js`（弹窗实现 + 指示器 click 绑定 + 分隔条"查看"接入）
- Modify: `src/side_panel/styles.css`（弹窗样式）

**Interfaces:**
- Consumes: Task 6 的 `triggerCompaction` / `undoCompaction` / `removeCompactionDivider`；Task 5 的 `computeCurrentUsage`；`utils.js` 的 `formatTokenFull`
- Produces: `showContextUsagePopup()` / `closeContextUsagePopup()` / `showCompactionSummaryPopup(compaction)`；指示器点击 → 详情弹窗（唯一交互入口）

- [ ] **Step 1: context-indicator.js 追加弹窗实现**

在 import 行补充 `formatTokenFull`（与 `formatTokenCount` 同一行从 `./utils.js` 导入）。

i18n 注册块追加（zh/en 同步）：

```js
    // zh
    popupTitle: '上下文占用明细',
    rowSystem: '系统提示词',
    rowTools: '工具定义',
    rowHistory: '历史消息',
    rowInput: '当前输入',
    historyMeta: '选中 {selected} 条 / 共 {total} 条',
    historyTrimmed: '为控制预算裁剪了 {count} 条（以规则摘要替代）',
    refInfo: '输出预留 {output} · 安全余量 {safety}（不计入上方占用）',
    memoryLabel: '记忆设置',
    memoryAll: '携带全部历史',
    memoryLimited: '携带最近 {n} 条',
    memoryOff: '不携带历史（仅当前消息）',
    compactionActive: '已压缩 {count} 条历史 · 摘要约 {tokens} tokens',
    compactionInvalidHint: '压缩点已失效（对应消息已被删除），本次发送未使用压缩',
    removeInvalid: '移除失效的压缩记录',
    btnCompact: '压缩上下文',
    btnUndoCompact: '撤销压缩',
    summaryTitle: '上下文摘要（压缩 {count} 条历史）',
```

文件末尾追加：

```js
// ==================== 详情弹窗 ====================

let popupDocClickHandler = null;

export function closeContextUsagePopup() {
  document.querySelectorAll('.context-usage-popup').forEach(el => el.remove());
  const el = document.getElementById('contextUsageIndicator');
  if (el) el._ctxPopupOpen = false;
  if (popupDocClickHandler) {
    document.removeEventListener('click', popupDocClickHandler);
    popupDocClickHandler = null;
  }
}

export function showContextUsagePopup() {
  const anchorEl = document.getElementById('contextUsageIndicator');
  if (!anchorEl) return;
  if (anchorEl._ctxPopupOpen) { closeContextUsagePopup(); return; }
  closeContextUsagePopup();
  anchorEl._ctxPopupOpen = true;

  const { usage } = computeCurrentUsage();
  const b = usage.breakdown;
  const percent = Math.round(usage.ratio * 100);

  // 记忆状态
  let memoryText;
  if (!state.isolateChat) memoryText = t('contextUsage.memoryOff');
  else if (state.chatConfig?.maxMemoryMessages > 0) memoryText = t('contextUsage.memoryLimited', { n: state.chatConfig.maxMemoryMessages });
  else memoryText = t('contextUsage.memoryAll');

  // 压缩状态区
  const compaction = state.activeCompaction;
  let compactionSection;
  if (compaction && b.compactionApplied) {
    compactionSection = `
      <div class="context-usage-compaction">
        <div class="context-usage-dim">${t('contextUsage.compactionActive', { count: compaction.compressedCount, tokens: formatTokenCount(compaction.summaryTokens) })}</div>
        <button class="context-usage-btn danger-ghost" data-action="undo">${t('contextUsage.btnUndoCompact')}</button>
      </div>`;
  } else if (b.compactionInvalid) {
    compactionSection = `
      <div class="context-usage-compaction">
        <div class="context-usage-warn">${t('contextUsage.compactionInvalidHint')}</div>
        <button class="context-usage-btn danger-ghost" data-action="remove-invalid">${t('contextUsage.removeInvalid')}</button>
      </div>`;
  } else {
    compactionSection = `
      <div class="context-usage-compaction">
        <button class="context-usage-btn primary" data-action="compact">${t('contextUsage.btnCompact')}</button>
      </div>`;
  }

  const historyMeta = t('contextUsage.historyMeta', { selected: b.selectedCount, total: b.totalCount });
  const trimmedLine = b.trimmedCount > 0
    ? `<div class="context-usage-dim">${t('contextUsage.historyTrimmed', { count: b.trimmedCount })}</div>` : '';

  const popup = document.createElement('div');
  popup.className = 'context-usage-popup';
  popup.dataset.level = usage.level;
  popup.innerHTML = `
    <div class="context-usage-popup-header">
      <span class="context-usage-popup-title">${t('contextUsage.popupTitle')}</span>
      <button class="context-usage-popup-close" aria-label="${t('common.close')}">×</button>
    </div>
    <div class="context-usage-popup-body">
      <div class="context-usage-total">
        <span class="context-usage-total-percent">${percent}%</span>
        <span class="context-usage-total-detail">${formatTokenFull(usage.usedTokens)} / ${formatTokenFull(usage.contextWindow)}</span>
      </div>
      <div class="context-usage-bar"><div class="context-usage-bar-fill" style="width:${Math.min(percent, 100)}%"></div></div>
      <div class="context-usage-section">
        <div class="context-usage-row"><span>${t('contextUsage.rowSystem')}</span><span>${formatTokenFull(b.system)}</span></div>
        <div class="context-usage-row"><span>${t('contextUsage.rowTools')}</span><span>${formatTokenFull(b.tools)}</span></div>
        <div class="context-usage-row"><span>${t('contextUsage.rowHistory')}</span><span>${formatTokenFull(b.history)}</span></div>
        <div class="context-usage-dim">${historyMeta}</div>
        ${trimmedLine}
        <div class="context-usage-row"><span>${t('contextUsage.rowInput')}</span><span>${formatTokenFull(b.input)}</span></div>
      </div>
      <div class="context-usage-section context-usage-dim">${t('contextUsage.refInfo', { output: formatTokenFull(b.outputReserve), safety: formatTokenFull(b.safetyMargin) })}</div>
      <div class="context-usage-section">
        <div class="context-usage-row"><span>${t('contextUsage.memoryLabel')}</span><span>${memoryText}</span></div>
      </div>
      ${compactionSection}
    </div>
  `;

  document.body.appendChild(popup);

  // 定位：指示器上方左对齐（fixed 定位，参照 token-detail-popup 模式）
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${Math.max(rect.left, 8)}px`;
  popup.style.bottom = `${window.innerHeight - rect.top + 6}px`;

  // 事件绑定
  popup.querySelector('.context-usage-popup-close').addEventListener('click', () => closeContextUsagePopup());
  popup.querySelector('[data-action="compact"]')?.addEventListener('click', () => { closeContextUsagePopup(); triggerCompaction(); });
  popup.querySelector('[data-action="undo"]')?.addEventListener('click', () => { closeContextUsagePopup(); undoCompaction(true); });
  popup.querySelector('[data-action="remove-invalid"]')?.addEventListener('click', async () => {
    closeContextUsagePopup();
    state.activeCompaction = null;
    await saveCurrentSession();
    removeCompactionDivider();
    updateContextIndicator();
  });

  // 点击外部关闭
  popupDocClickHandler = (e) => {
    if (e.target.closest('.context-usage-popup, #contextUsageIndicator')) return;
    closeContextUsagePopup();
  };
  setTimeout(() => document.addEventListener('click', popupDocClickHandler), 0);
}

/** 分隔条"查看"：展示当前摘要全文 */
export function showCompactionSummaryPopup(compaction = state.activeCompaction) {
  if (!compaction?.summary) return;
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.style.zIndex = '10200';
  overlay.innerHTML = `
    <div class="modal-container context-usage-summary-modal">
      <div class="modal-title">${t('contextUsage.summaryTitle', { count: compaction.compressedCount })}
      </div>
      <div class="context-usage-summary-body"></div>
      <div class="modal-actions">
        <button class="modal-btn cancel">${t('common.close')}</button>
      </div>
    </div>
  `;
  overlay.querySelector('.context-usage-summary-body').textContent = compaction.summary;
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-btn.cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
```

- [ ] **Step 2: 指示器 click 绑定 + 分隔条"查看"接入**

在 `initContextIndicator()` 内（`if (!el) return;` 之后）加入：

```js
  // 点击指示器：打开/关闭详情弹窗
  el.addEventListener('click', () => showContextUsagePopup());
```

修改 Task 6 的 `renderCompactionDivider()`，在 innerHTML 中为"查看"按钮解禁（在撤销按钮前添加）：

```js
    <button class="compaction-divider-btn" data-action="view">${t('contextUsage.dividerView')}</button>
```

并追加事件绑定（在 undo 绑定语句旁）：

```js
  divider.querySelector('[data-action="view"]').addEventListener('click', () => showCompactionSummaryPopup(compaction));
```

- [ ] **Step 3: styles.css 追加弹窗样式**

在分隔条样式后追加（配色沿用 token-detail-popup 风格）：

```css
/* ========== 上下文占用详情弹窗 ========== */
.context-usage-popup {
  position: fixed;
  z-index: 10000;
  width: 280px;
  max-height: 60vh;
  overflow-y: auto;
  background: #fff;
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.18), 0 2px 8px rgba(0, 0, 0, 0.08);
  font-size: 12px;
  color: #1f2937;
  animation: tokenPopupFadeIn 0.15s ease-out;
}
.context-usage-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 10px 14px 8px;
  border-bottom: 1px solid #f0f0f0;
}
.context-usage-popup-title { font-size: 13px; font-weight: 600; color: #1f2937; }
.context-usage-popup-close { background: none; border: none; font-size: 18px; line-height: 1; color: #999; cursor: pointer; padding: 0 2px; }
.context-usage-popup-close:hover { color: #666; }
.context-usage-popup-body { padding: 10px 14px 14px; }
.context-usage-total { display: flex; align-items: baseline; justify-content: space-between; margin-bottom: 6px; }
.context-usage-total-percent { font-size: 20px; font-weight: 600; }
.context-usage-popup[data-level="safe"] .context-usage-total-percent { color: #4caf50; }
.context-usage-popup[data-level="warning"] .context-usage-total-percent { color: #ff9800; }
.context-usage-popup[data-level="critical"] .context-usage-total-percent { color: #f44336; }
.context-usage-total-detail { font-size: 11px; color: #999; }
.context-usage-bar { height: 6px; border-radius: 3px; background: #f0f0f0; overflow: hidden; margin-bottom: 10px; }
.context-usage-bar-fill { height: 100%; border-radius: 3px; transition: width 0.2s ease; }
.context-usage-popup[data-level="safe"] .context-usage-bar-fill { background: #4caf50; }
.context-usage-popup[data-level="warning"] .context-usage-bar-fill { background: #ff9800; }
.context-usage-popup[data-level="critical"] .context-usage-bar-fill { background: #f44336; }
.context-usage-section { padding: 8px 0; border-top: 1px solid #f5f5f5; }
.context-usage-row { display: flex; align-items: center; justify-content: space-between; padding: 2px 0; color: #333; }
.context-usage-dim { font-size: 11px; color: #999; line-height: 1.5; }
.context-usage-warn { font-size: 11px; color: #d97706; line-height: 1.5; margin-bottom: 6px; }
.context-usage-compaction { padding: 8px 0 0; border-top: 1px solid #f5f5f5; display: flex; flex-direction: column; gap: 6px; }
.context-usage-btn { border: none; border-radius: 6px; cursor: pointer; font-size: 12px; padding: 6px 10px; }
.context-usage-btn.primary { background: #4a90d9; color: #fff; }
.context-usage-btn.primary:hover { background: #3d7fc4; }
.context-usage-btn.danger-ghost { background: none; color: #d9534f; padding: 2px 0; text-align: left; }
.context-usage-btn.danger-ghost:hover { text-decoration: underline; }
.context-usage-summary-modal { max-width: 420px; }
.context-usage-summary-body {
  max-height: 50vh;
  overflow-y: auto;
  font-size: 12px;
  line-height: 1.6;
  white-space: pre-wrap;
  word-break: break-word;
  color: #444;
  padding: 4px 0 12px;
}
```

- [ ] **Step 4: 构建 + 手动全流程验证**

Run: `npm run build:silent`
Expected: 构建成功

手动验证（重新加载扩展）：
1. 点击指示器 → 弹窗展示总占用+分解+记忆状态；再点/点外部 → 关闭
2. 弹窗数据与指示器一致；修改记忆条数后重开弹窗数据跟随变化
3. 点击"压缩上下文"→ 确认弹窗 → 开始压缩 → toast 成功、分隔条出现在压缩点后、指示器百分比下降
4. 发送一条消息 → 回复正常（system 已含摘要；可在 background 日志确认 prompt 不含被压缩的原文）
5. 分隔条"查看"→ 摘要全文弹窗；"撤销"→ 确认后恢复、指示器回升
6. 会话切换（新建/切走再切回）→ 分隔条与指示器状态正确恢复

---

### Task 8: 收尾验证

**Files:**
- Modify（按需）: `CHANGELOG.md`

- [ ] **Step 1: 全量单测 + lint + 构建**

Run: `npm run test:unit && npx eslint src/ && npm run build:silent`
Expected: 全部 PASS、无 lint 错误、构建成功

- [ ] **Step 2: spec 测试计划手动回归清单**

在浏览器中逐项验证（对照 spec "测试计划"节）：
1. 三场景百分比：记忆关闭（仅当前输入≈个位数） / 携带全部（随历史增长） / 携带 N 条（稳定低位）
2. 压缩 → 发送 → 再压缩：验证覆盖式更新（S_new = 旧摘要+新消息合并；详情弹窗压缩计数累加）
3. 压缩点失效场景：删除压缩点消息（或手动构造）→ 弹窗提示失效、发送时忽略压缩且无报错
4. 自动机制协同：手动压缩后发送，日志中 pressure 回落为 safe（A/B 不触发）
5. 窄屏（<420px）指示器简化显示
6. 英文环境：切换语言后所有新文案为英文

- [ ] **Step 3: CHANGELOG**

检查 `CHANGELOG.md` 结构，若有 Unreleased 或最新版本区块，追加本次功能条目：

```markdown
- 新增：输入框下方上下文占用百分比指示器（点击查看占用明细）
- 新增：手动压缩上下文（AI 摘要会话级持久化、可撤销、与自动裁剪机制分层协同）
```

无合适区块则跳过（由用户决定是否补充）。

- [ ] **Step 4: 待办汇报**

向用户汇报：完成项清单、手动验证结果、遗留事项（自动压缩策略/会话级记忆开关按 spec 标记为非本期）。

---

## Self-Review（对照 spec）

**1. Spec 覆盖检查**

| Spec 要求 | 覆盖任务 |
|---|---|
| 计算模型（占完整窗口、四层分解） | Task 1（computeContextUsage + 测试） |
| 历史选择流水线（与发送同源） | Task 1（selectHistoryForSend）+ Task 4（三路径接入） |
| 压缩模型（覆盖式单摘要） | Task 6（assembleCompactionMaterial + triggerCompaction）+ Task 1 示例表测试 |
| 发送公式（S 注入 system） | Task 1（appendCompactionToSystemPrompt）+ Task 4 |
| 缓存策略（手动触发、会话级、零发送 API） | Task 3（仅手动消息）+ Task 6（仅点击时调用） |
| 数据模型（contextCompaction 字段） | Task 2（持久化）+ Task 6（写入） |
| 失效兜底（upToMessageId 找不到） | Task 1（compactionApplied=false）+ Task 7（compactionInvalid 提示） |
| UI（指示器/弹窗/分隔条/确认框） | Task 5 / 6 / 7 |
| 摘要注入 system prompt | Task 1 + Task 4 |
| AI 摘要通道（COMPACT_CONTEXT_SUMMARY） | Task 3 |
| 与自动机制关系（不冲突、S 受保护） | Global Constraints + Task 1（注入方式）+ Task 4（不触碰 A/B/C/D 逻辑） |
| 边界情况表 | Task 6/7 实现 + Task 8 回归清单 |
| 文件改动清单（3 新增 + 9 修改 + 测试） | 全部任务 Files 列表覆盖 |

**2. Placeholder scan：** 无 TBD/TODO；所有代码步骤均含完整目标代码；仅有的"以 grep 定位"步骤（Task 2 Step 2/3、Task 4、Task 6 Step 6）均给出了精确的搜索命令与目标代码。

**3. Type consistency 检查：**
- `selectHistoryForSend` 返回 `{ messages, keptHistory, compactionApplied, trimmedCount, historySummaryText }`——Task 4/6 使用一致；
- `computeContextUsage` 返回 `breakdown.{compactionApplied, compactionInvalid, selectedCount, totalCount, trimmedCount, historyBudget}`——Task 5/7 使用一致；
- `assembleCompactionMaterial` 返回 `{ material, includedCount, hasOldSummary }`——Task 6/7 使用一致；
- `generateCompactionSummary` 返回 `{ success, summary, error }`——Task 6 响应校验一致；
- `state.activeCompaction` 字段（`summary/upToMessageId/compressedCount/summaryTokens/savedTokens/model/createdAt/revision`）——Task 2/6 写入一致，Task 1/5/7 读取一致。

## 执行方式说明

本环境不支持通用子代理执行（仅有浏览器/代码审查/桌面操作子代理），故采用 **Inline Execution**：在本会话中按 Task 顺序执行，采用 executing-plans 流程，每完成一个 Task 构建验证后继续下一个，关键节点向用户汇报。

