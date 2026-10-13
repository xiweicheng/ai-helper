# Context Compaction Effectiveness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让会话上下文压缩从「纯手动 + 中文硬编码 + 产物不沉淀」升级为「阈值半自动触发 + 结构化双语摘要 + 自动沉淀为跨会话长期记忆」。

**Architecture:** 压缩的三个关注点分层收口——提示词模板与结构（`src/shared/compaction-prompt.js` 纯函数）、触发策略（新增 `src/side_panel/auto-compaction.js` 纯决策函数 + 发送链路前置钩子）、产物沉淀（`src/background/index.js` 在摘要成功后调用 Agent 的 `/api/memory/store`）。窗口/压缩/预算的选取逻辑继续由 `src/shared/context-usage.js` 单一出口负责，本计划只把两条发送链路重复的注入尾部收成一个函数，不改变选取语义。

**Tech Stack:** 扩展端 ES modules + Vitest（`npx vitest run`）；Agent 端 `agent/src/memory/*`（已完成逻辑下推，见 Spec）+ `node --test`；chrome.storage.local 配置持久化；i18n 由各模块内 `registerTranslations(lang, dict)` 注册。

**Spec:** `docs/superpowers/plans/2026-10-13-agent-memory-pushdown.md`（前置：记忆逻辑已在 Agent 端，`/api/memory/store` 可直接调用）

## Global Constraints

- 不做新旧版本兼容：插件与 Agent 对应发布；Agent 未连接时记忆能力整体不可用，**不回退** `/api/fs` 读写记忆。
- 自动压缩开关**默认关闭**（会额外产生一次 LLM 调用与 token 费用，不默认改变用户花钱行为）。
- 摘要沉淀长期记忆开关**默认开启**（不新增 LLM 调用，只是把已有摘要写一条记忆）。
- 自动压缩阈值默认 **85%**（`usage.ratio >= 0.85`），与上下文指示器同一口径（`computeContextUsage` 返回的 `ratio`）。
- 压缩摘要的语言必须跟随 UI 语言：`zh` 用中文模板，`en` 用英文模板，未知语言回落 `zh`。
- 任何压缩失败都不得阻断本次发送：自动压缩失败即降级为「按现有窗口/预算链路继续发送」。
- 修改完成后必须执行 `npm run build:silent`（项目规范），Agent 侧改动跑 `node --test test/unit/*.unit.test.js`。
- 不手动改版本号（由 `npm run release:agent` 统一同步）。

---

### Task 1: 压缩提示词结构化与双语化

**Files:**
- Modify: `src/shared/compaction-prompt.js`（`buildCompactionPrompt` 全文重写，`sanitizeMaterialContent` 与两个限量常量不动）
- Modify: `src/background/context-compactor.js:32`（传入语言）
- Test: `test/unit/compaction-prompt.unit.test.js`（追加用例，现有 5 组断言保持不变）

**Interfaces:**
- Consumes: 无
- Produces: `buildCompactionPrompt(material, lang = 'zh') => string`（新增第二个参数，向后兼容）；`export const COMPACTION_SECTION_HEADINGS = { zh: [...], en: [...] }`

现有测试只断言 `[User]` / `[Assistant]` / `【已有摘要】` / 限量，不锁定指令文案，因此指令块可安全重写——但素材渲染部分（`lines` 拼接与从新到旧保留）必须逐字保留。

- [ ] **Step 1: 追加失败测试**

在 `test/unit/compaction-prompt.unit.test.js` 的 `describe('buildCompactionPrompt')` 内追加：

```js
  it('zh 输出要求固定小节结构', () => {
    const prompt = buildCompactionPrompt([{ role: 'user', content: 'x' }], 'zh');
    expect(prompt).toContain('任务目标');
    expect(prompt).toContain('已完成与关键结论');
    expect(prompt).toContain('关键标识符');
    expect(prompt).toContain('未决问题与下一步');
  });

  it('en 输出为英文模板且不含中文小节标题', () => {
    const prompt = buildCompactionPrompt([{ role: 'user', content: 'x' }], 'en');
    expect(prompt).toContain('Task goal');
    expect(prompt).toContain('Key identifiers');
    expect(prompt).not.toContain('任务目标');
  });

  it('未知语言回落中文模板', () => {
    expect(buildCompactionPrompt([{ role: 'user', content: 'x' }], 'fr')).toContain('任务目标');
  });

  it('默认调用与显式 zh 完全一致（向后兼容）', () => {
    const m = [{ role: 'user', content: 'x' }];
    expect(buildCompactionPrompt(m)).toBe(buildCompactionPrompt(m, 'zh'));
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/compaction-prompt.unit.test.js`
Expected: 4 条新用例 FAIL（断言字符串不存在 / undefined 参数），旧 5 条 PASS。

- [ ] **Step 3: 实现结构化双语模板**

把 `buildCompactionPrompt` 替换为（`lines` 与总长保留循环保持原样，只是把末尾的中文指令块换成模板表）：

```js
// 结构化摘要的小节标题：固定四节，供后续注入与长期记忆切分复用
export const COMPACTION_SECTION_HEADINGS = {
  zh: ['任务目标', '已完成与关键结论', '关键标识符', '未决问题与下一步'],
  en: ['Task goal', 'Completed & key conclusions', 'Key identifiers', 'Open questions & next steps']
};

const INSTRUCTIONS = {
  zh: `你是一个对话上下文压缩助手。下面是用户与 AI 助手之前的对话内容，请将其压缩为一份结构化中文摘要，供后续对话继续使用。

输出必须且只包含以下四个小节，逐节使用给定标题作为行首：
1. 任务目标：用户的当前目标与最新诉求（一句话）。
2. 已完成与关键结论：已达成的结论与决策，条目化。
3. 关键标识符：必须原样保留的文件路径、代码符号、数据值、实体名称、URL，条目化。
4. 未决问题与下一步：未完成事项与建议的下一步，条目化。

要求：
- 省略：寒暄、重复表述、中间推理过程、已被推翻的方案。
- 若素材中包含【已有摘要】条目，它是对更早历史的既有摘要，请把其中仍然有效的信息合并进新摘要，不得丢弃。
- 全文控制在 600 字以内。
- 直接输出四个小节，不要任何前缀说明（如"以下是摘要"）。`,
  en: `You are a context compaction assistant. Compact the following conversation between the user and an AI assistant into a structured English summary for continued use.

The output must contain exactly these four sections, each starting with the given heading:
1. Task goal: the user's current objective and latest request (one sentence).
2. Completed & key conclusions: decisions and outcomes reached, as bullets.
3. Key identifiers: file paths, code symbols, data values, entity names, URLs that must be kept verbatim, as bullets.
4. Open questions & next steps: unfinished items and the suggested next step, as bullets.

Rules:
- Omit: small talk, repetition, intermediate reasoning, and superseded approaches.
- If the material contains an 【已有摘要】 entry, it is an existing summary of earlier history; merge every still-valid fact into the new summary instead of dropping it.
- Keep the summary under 400 words.
- Output only the four sections, with no preamble such as "Here is the summary".`
};

/**
 * 构建压缩提示词
 * @param {Array<{role: string, content: string}>} material - 素材（若含【已有摘要】条目应置于最前）
 * @param {'zh'|'en'} [lang] - 摘要目标语言，未知值回落 zh
 * @returns {string}
 */
export function buildCompactionPrompt(material, lang = 'zh') {
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

  const instructions = INSTRUCTIONS[lang] || INSTRUCTIONS.zh;
  return `${instructions}

对话内容：
${kept.join('\n\n')}`;
}
```

- [ ] **Step 4: 运行确认通过**

Run: `npx vitest run test/unit/compaction-prompt.unit.test.js`
Expected: 9 条全 PASS。

- [ ] **Step 5: 调用方传入语言**

`src/background/context-compactor.js`：文件头已有 i18n 语言来源；若无则新增 import。把第 32 行的 `const prompt = buildCompactionPrompt(material);` 改为：

```js
  const prompt = buildCompactionPrompt(material, resolveSummaryLang(config));
```

并在模块内定义（放在 `COMPACT_TIMEOUT_MS` 之后）：

```js
/**
 * 摘要语言：优先用户显式配置，其次 UI 语言，未知回落 zh
 * @param {{summaryLang?: string}} config
 */
function resolveSummaryLang(config) {
  const lang = config?.summaryLang || getUiLang();
  return lang === 'en' ? 'en' : 'zh';
}
```

`getUiLang()` 用项目现有的语言读取出口（`src/shared/` 下的语言模块，若该模块未导出则用 `chrome.i18n.getUILanguage()` 取前两位）。实施时以现有导出为准，不要新建第二套语言判断。

- [ ] **Step 6: 跑全量扩展测试 + 构建**

Run: `npx vitest run && npm run build:silent`
Expected: 无新增失败（与改动前基线一致），输出 `BUILD_SUCCESS`。

- [ ] **Step 7: Commit**

```bash
git add src/shared/compaction-prompt.js src/background/context-compactor.js test/unit/compaction-prompt.unit.test.js
git commit -m "feat(compaction): 压缩摘要改为固定四小节结构化模板并支持中英双语"
```

---

### Task 2: 收敛两条发送链路的压缩注入

**Files:**
- Modify: `src/shared/context-usage.js`（新增导出）
- Modify: `src/side_panel/chat-manager.js:1082-1088`
- Modify: `src/side_panel/index.js:821-827`
- Modify: `src/side_panel/prompt-manager.js:825-831`
- Test: `test/unit/context-usage.unit.test.js`（追加）+ 新建 `test/unit/compaction-injection-wiring.unit.test.js`

**Interfaces:**
- Consumes: `selectHistoryForSend` 返回的 `{ compactionApplied }`；`appendCompactionToSystemPrompt(systemContent, compaction)`
- Produces: `applyCompactionInjection(messages, selection, compaction, logger?) => messages`（就地返回同一数组引用，方便调用方一行接管）

现状：`chat-manager.js`、`index.js`、`prompt-manager.js` 各有一段完全相同的 5 行注入 + 告警逻辑（执行计划时核实为三处，原计划漏记 chat-manager 主链路）。这是「多发送链路上下文注入必须对齐」的已知陷阱面——将来任一侧改动都会静默漂移。

- [ ] **Step 1: 写转发层的接线守卫（先失败）**

新建 `test/unit/compaction-injection-wiring.unit.test.js`：

```js
import { readFileSync } from 'fs';
import { join } from 'path';
import { describe, it, expect } from 'vitest';

const root = join(__dirname, '..', '..');
const read = p => readFileSync(join(root, p), 'utf-8');

describe('压缩注入单点收敛', () => {
  it('shared 导出 applyCompactionInjection', () => {
    expect(read('src/shared/context-usage.js')).toContain('export function applyCompactionInjection');
  });

  it('两条发送链路都改为调用共享函数，不再内联 appendCompactionToSystemPrompt', () => {
    for (const file of ['src/side_panel/index.js', 'src/side_panel/prompt-manager.js']) {
      const src = read(file);
      expect(src, file).toContain('applyCompactionInjection(');
      expect(src, file).not.toContain('appendCompactionToSystemPrompt(');
    }
  });

  it('共享函数内部仍复用 appendCompactionToSystemPrompt', () => {
    const src = read('src/shared/context-usage.js');
    expect(src).toContain('appendCompactionToSystemPrompt(messages[0].content, compaction)');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/compaction-injection-wiring.unit.test.js`
Expected: 3 条 FAIL。

- [ ] **Step 3: 实现共享注入函数**

`src/shared/context-usage.js` 在 `appendCompactionToSystemPrompt` 定义之后追加：

```js
/**
 * 把压缩摘要注入 system prompt（两条发送链路共用，避免各自内联漂移）
 * @param {Array<{role: string, content: string}>} messages 已含 system prompt 的消息数组（就地改 messages[0]）
 * @param {{compactionApplied: boolean}} selection selectHistoryForSend 的结果
 * @param {object|null} compaction state.activeCompaction
 * @param {{warn?: (msg: string, ...args: any[]) => void}} [logger]
 * @returns {Array} 同一 messages 引用
 */
export function applyCompactionInjection(messages, selection, compaction, logger) {
  if (selection?.compactionApplied && compaction?.summary) {
    messages[0] = { ...messages[0], content: appendCompactionToSystemPrompt(messages[0].content, compaction) };
  } else if (compaction?.summary) {
    logger?.warn('[SidePanel] contextCompaction invalid (upToMessageId not found), ignored this send');
  }
  return messages;
}
```

- [ ] **Step 4: 两条链路改为调用**

`src/side_panel/index.js` 与 `src/side_panel/prompt-manager.js` 中，把原有的 5 行 `if (selection.compactionApplied) { ... } else if (state.activeCompaction) { ... }` 整块替换为：

```js
      applyCompactionInjection(messages, selection, state.activeCompaction, logger);
```

并把两处 import 中的 `appendCompactionToSystemPrompt` 换成 `applyCompactionInjection`（同一 from 子句，保留其余导入项）。

- [ ] **Step 5: 追加行为单测**

`test/unit/context-usage.unit.test.js` 追加：

```js
  describe('applyCompactionInjection', () => {
    const c = { summary: 'S', upToMessageId: 'm5' };
    it('applied 时把摘要并入 system prompt 并返回同一数组', () => {
      const messages = [{ role: 'system', content: 'SYS' }];
      const out = applyCompactionInjection(messages, { compactionApplied: true }, c);
      expect(out).toBe(messages);
      expect(out[0].content).toContain('SYS');
      expect(out[0].content).toContain('S');
    });
    it('未 applied 时不改消息但告警', () => {
      const warn = vi.fn();
      const messages = [{ role: 'system', content: 'SYS' }];
      applyCompactionInjection(messages, { compactionApplied: false }, c, { warn });
      expect(messages[0].content).toBe('SYS');
      expect(warn).toHaveBeenCalled();
    });
    it('无摘要时静默返回（不告警）', () => {
      const warn = vi.fn();
      const messages = [{ role: 'system', content: 'SYS' }];
      applyCompactionInjection(messages, { compactionApplied: false }, null, { warn });
      expect(messages[0].content).toBe('SYS');
      expect(warn).not.toHaveBeenCalled();
    });
  });
```

- [ ] **Step 6: 运行两组测试**

Run: `npx vitest run test/unit/compaction-injection-wiring.unit.test.js test/unit/context-usage.unit.test.js`
Expected: 全 PASS。

- [ ] **Step 7: Commit**

```bash
git add src/shared/context-usage.js src/side_panel/index.js src/side_panel/prompt-manager.js test/unit/context-usage.unit.test.js test/unit/compaction-injection-wiring.unit.test.js
git commit -m "refactor(side-panel): 压缩摘要注入收敛为单点函数，消除双发送链路漂移风险"
```

---

### Task 3: 阈值驱动的半自动压缩

**Files:**
- Create: `src/side_panel/auto-compaction.js`
- Modify: `src/background/constants.js`（`DEFAULT_CHAT_CONFIG`）
- Modify: `src/background/config.js:55-70`（`getChatConfig` 读取新键）
- Modify: `src/side_panel/index.js:272` 附近（storage 变更监听）+ 发送链路前置钩子
- Modify: `side_panel.html`（`#memoryLimitDropdown` 内新增开关与阈值选项）
- Modify: `src/side_panel/context-indicator.js`（把 `triggerCompaction` 拆出可复用内核 + 新增文案）
- Test: `test/unit/auto-compaction.unit.test.js`

**Interfaces:**
- Consumes: `computeContextUsage(...) => { ratio }`、`assembleCompactionMaterial(history, { maxMemoryMessages, compaction })`、`generateCompactionSummary`（经 `chrome.runtime.sendMessage({ type: 'COMPACT_CONTEXT_SUMMARY' })`）、`state.activeCompaction`
- Produces: `shouldAutoCompact({ enabled, ratio, thresholdRatio, pendingCount, isGenerating, isolateChat }) => boolean`（纯函数）；`runCompaction(options?) => Promise<{ success: boolean, reason?: string, savedTokens?: number }>`（从 `triggerCompaction` 抽出的无 UI 内核，手动入口与自动入口共用）

**默认值决策：** `autoCompaction: false`、`autoCompactionThreshold: 0.85`、`autoCompactionMinPending: 4`（少于 4 条新消息不值得为省 token 花一次调用）。

- [ ] **Step 1: 写失败测试（决策纯函数 + 配置默认值）**

新建 `test/unit/auto-compaction.unit.test.js`：

```js
import { describe, it, expect } from 'vitest';
import { shouldAutoCompact, DEFAULT_AUTO_COMPACTION } from '../../src/side_panel/auto-compaction.js';

const base = {
  enabled: true,
  ratio: 0.9,
  thresholdRatio: DEFAULT_AUTO_COMPACTION.thresholdRatio,
  pendingCount: 10,
  isGenerating: false,
  isolateChat: true
};

describe('shouldAutoCompact', () => {
  it('开关关闭时永不触发', () => {
    expect(shouldAutoCompact({ ...base, enabled: false })).toBe(false);
  });
  it('未达阈值不触发（阈值边界 0.85 触发）', () => {
    expect(shouldAutoCompact({ ...base, ratio: 0.84 })).toBe(false);
    expect(shouldAutoCompact({ ...base, ratio: 0.85 })).toBe(true);
  });
  it('待压缩消息不足 minPending 时不触发', () => {
    expect(shouldAutoCompact({ ...base, pendingCount: DEFAULT_AUTO_COMPACTION.minPending - 1 })).toBe(false);
  });
  it('正在生成 / 记忆关闭 / 无有效摘要能力时不触发', () => {
    expect(shouldAutoCompact({ ...base, isGenerating: true })).toBe(false);
    expect(shouldAutoCompact({ ...base, isolateChat: false })).toBe(false);
  });
  it('阈值越界时回落默认值', () => {
    expect(shouldAutoCompact({ ...base, thresholdRatio: 3 })).toBe(true);   // 回落 0.85，ratio 0.9 仍触发
    expect(shouldAutoCompact({ ...base, ratio: 0.5, thresholdRatio: NaN })).toBe(false);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/auto-compaction.unit.test.js`
Expected: 模块不存在 → 文件级 FAIL。

- [ ] **Step 3: 实现 auto-compaction.js**

```js
// side_panel/auto-compaction.js - 会话上下文自动压缩的决策与执行入口
// 决策与执行分离：shouldAutoCompact 为纯函数（可单测），runAutoCompaction 复用手动压缩内核。
import { computeContextUsage } from '../shared/context-usage.js';
import logger from '../shared/logger.js';

export const DEFAULT_AUTO_COMPACTION = {
  enabled: false,        // 默认关闭：自动压缩会额外产生一次 LLM 调用
  thresholdRatio: 0.85,  // 上下文占用达到 85% 触发
  minPending: 4          // 少于 4 条新消息不值得压缩
};

/** 是否应当自动压缩（纯函数，不做任何副作用） */
export function shouldAutoCompact({ enabled, ratio, thresholdRatio, pendingCount, isGenerating, isolateChat } = {}) {
  if (!enabled || isGenerating || !isolateChat) return false;
  const threshold = Number.isFinite(thresholdRatio) && thresholdRatio > 0 && thresholdRatio <= 1
    ? thresholdRatio
    : DEFAULT_AUTO_COMPACTION.thresholdRatio;
  const minPending = Number.isFinite(thresholdRatio) && Number.isFinite(pendingCount) && pendingCount < 0
    ? DEFAULT_AUTO_COMPACTION.minPending
    : (DEFAULT_AUTO_COMPACTION.minPending);
  if (!Number.isFinite(ratio) || ratio < threshold) return false;
  return (pendingCount ?? 0) >= minPending;
}

/**
 * 发送前尝试自动压缩：失败/异常一律放行发送
 * @param {object} deps - { getState, chatConfig, compact: () => Promise<{success:boolean}> }
 * @returns {Promise<{ attempted: boolean, success: boolean, reason?: string }>}
 */
export async function maybeAutoCompactBeforeSend(deps) {
  const { getState, chatConfig } = deps;
  const state = getState();
  const pendingCount = countPendingSinceCompaction(state);
  const usage = computeUsageSafe(state);

  if (!shouldAutoCompact({
    enabled: chatConfig?.autoCompaction === true,
    ratio: usage?.ratio ?? 0,
    thresholdRatio: chatConfig?.autoCompactionThreshold ?? DEFAULT_AUTO_COMPACTION.thresholdRatio,
    pendingCount,
    isGenerating: !!state.isGenerating,
    isolateChat: !!state.isolateChat
  })) {
    return { attempted: false, success: false, reason: 'not_needed' };
  }

  logger.debug('[AutoCompaction] triggered', { ratio: usage?.ratio, pendingCount });
  const result = await deps.compact({ silent: true });
  return { attempted: true, success: !!result?.success, reason: result?.reason };
}

/** 压缩点之后的新消息条数（无压缩点则为全部历史） */
export function countPendingSinceCompaction(state) {
  const history = state.messageHistory || [];
  const upTo = state.activeCompaction?.upToMessageId;
  if (!upTo) return history.length;
  const idx = history.findIndex(m => m.messageId === upTo);
  return idx === -1 ? history.length : history.length - idx - 1;
}

function computeUsageSafe(state) {
  try {
    return computeContextUsage({
      messages: state.messagesForUsage?.() ?? state.messageHistory ?? [],
      model: state.currentModel,
      toolCount: state.toolCount ?? 0,
      configuredWindow: state.configuredWindow,
      customModelMap: state.chatConfig?.customModelMap,
      maxMemoryMessages: state.chatConfig?.maxMemoryMessages ?? null,
      isolateChat: !!state.isolateChat,
      compaction: state.activeCompaction,
      currentMessage: null
    });
  } catch (err) {
    logger.warn('[AutoCompaction] usage compute failed:', err?.message);
    return null;
  }
}
```

`computeUsageSafe` 的入参必须与指示器同源：实施时以 `src/side_panel/context-indicator.js:135-145` 实际传给 `computeContextUsage` 的字段为准逐字对齐（那里是权威调用点），不要自创参数名。

- [ ] **Step 4: 从 triggerCompaction 抽出无 UI 内核**

`src/side_panel/context-indicator.js`：把现有 `triggerCompaction()` 改为薄壳，内核抽成导出函数：

```js
/**
 * 执行一次压缩。options.silent = true 时不弹确认框、不弹进行中模态，只用轻量 toast
 * @param {{ silent?: boolean }} [options]
 * @returns {Promise<{ success: boolean, reason?: string, savedTokens?: number }>}
 */
export async function runCompaction({ silent = false } = {}) {
  if (!state.isolateChat) {
    if (!silent) showToast(t('contextUsage.memoryOffToast'), 'warning');
    return { success: false, reason: 'memory_off' };
  }
  if (state.isGenerating) {
    if (!silent) showToast(t('contextUsage.generatingToast'), 'warning');
    return { success: false, reason: 'generating' };
  }
  const history = state.messageHistory;
  const old = state.activeCompaction;
  const { material, includedCount, hasOldSummary } = assembleCompactionMaterial(history, {
    maxMemoryMessages: state.chatConfig?.maxMemoryMessages ?? null,
    compaction: old,
  });
  if (includedCount === 0) {
    if (!silent) showToast(t('contextUsage.nothingToCompactToast'), 'warning');
    return { success: false, reason: 'nothing_to_compact' };
  }

  const materialTokens = estimateMessagesTokens(material.map(m => ({ role: m.role, content: m.content })));
  if (!silent) {
    const confirmed = await showConfirmDialog({ /* 保持现有标题/消息/按钮 */ });
    if (!confirmed) return { success: false, reason: 'cancelled' };
  }

  const loadingModal = silent ? null : showCompactingModal();
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'COMPACT_CONTEXT_SUMMARY',
      material,
      model: state.currentModel,
      sessionId: state.activeSessionId,
      persistSummaryToMemory: state.chatConfig?.persistSummaryToMemory !== false,
      compactedCount: (old?.compressedCount || 0) + includedCount
    });
    if (!resp?.success || !resp.summary) {
      if (!silent) {
        const errKey = resp?.error === 'config_missing' ? 'contextUsage.compactErrConfig' : 'contextUsage.compactErrFailed';
        showToast(t(errKey), 'error');
      }
      return { success: false, reason: resp?.error || 'failed' };
    }

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
      // 长期记忆去重锚点：首次沉淀由 background 回填 memoryId，后续 revision 走 update
      memoryId: resp.memoryId || old?.memoryId || null
    };

    await saveCurrentSession();
    renderCompactionDivider();
    updateContextIndicator();
    if (silent) {
      showToast(t('contextUsage.autoCompactedToast', { saved: formatTokenCount(state.activeCompaction.savedTokens) }), 'info');
    } else {
      showToast(t('contextUsage.compactDone', { saved: formatTokenCount(state.activeCompaction.savedTokens) }), 'success');
    }
    return { success: true, savedTokens: state.activeCompaction.savedTokens };
  } catch (err) {
    logger.warn('[ContextIndicator] compaction failed:', err?.message);
    if (!silent) showToast(t('contextUsage.compactErrFailed'), 'error');
    return { success: false, reason: 'exception' };
  } finally {
    loadingModal?.close();
  }
}

/** 入口：手动压缩（保留原语义：确认框 + 进行中模态） */
export async function triggerCompaction() {
  await runCompaction({ silent: false });
}
```

在 `context-indicator.js` 的 zh / en 两份 `registerTranslations` 字典里各加一条：

```js
    autoCompactedToast: '上下文接近上限，已自动压缩（预计省 {saved} tokens）',
    autoCompactLabel: '自动压缩',
    autoCompactHint: '上下文占用达到阈值时，发送前自动压缩一次（会额外产生一次摘要调用）。',
    autoCompactOff: '关闭',
    autoCompactOn: '开启',
```

```js
    autoCompactedToast: 'Context near limit; auto-compacted (est. {saved} tokens saved)',
    autoCompactLabel: 'Auto-compact',
    autoCompactHint: 'Compact once before sending when context usage reaches the threshold (adds one summarization call).',
    autoCompactOff: 'Off',
    autoCompactOn: 'On',
```

- [ ] **Step 5: 配置默认值、读取与实时监听**

`src/background/constants.js` 的 `DEFAULT_CHAT_CONFIG`：

```js
export const DEFAULT_CHAT_CONFIG = {
  maxMemoryMessages: 20,      // 记忆历史限制条数，默认20条
  enableExecutionLog: true,   // 执行日志默认开启
  autoCompaction: false,      // 阈值驱动的自动压缩，默认关闭（额外调用）
  autoCompactionThreshold: 0.85,
  persistSummaryToMemory: true // 压缩摘要沉淀为长期记忆，默认开启
};
```

`src/background/config.js` 的 `getChatConfig`：`chrome.storage.local.get` 的 key 列表补 `'autoCompaction', 'autoCompactionThreshold', 'persistSummaryToMemory'`，返回对象补：

```js
        autoCompaction: result.autoCompaction === true,
        autoCompactionThreshold: typeof result.autoCompactionThreshold === 'number' && result.autoCompactionThreshold > 0 && result.autoCompactionThreshold <= 1
          ? result.autoCompactionThreshold
          : DEFAULT_CHAT_CONFIG.autoCompactionThreshold,
        persistSummaryToMemory: result.persistSummaryToMemory !== false,
```

`src/side_panel/index.js:272` 附近的 storage 监听，按现有 `changes.chatMaxMemoryMessages` 的写法为三个新键各补一条 `state.chatConfig.xxx = changes.xxx.newValue;`（遵循「开关切换立即持久化」规范：写入即生效，不需重开面板）。

- [ ] **Step 6: UI 开关**

`side_panel.html` 在 `#memoryLimitDropdown` 的选项区之后、下拉容器闭合之前插入（沿用项目既有的 `check-toggle` + 弹性换行开关样式，不新增布局范式）：

```html
          <div class="memory-limit-section auto-compact-section">
            <div class="memory-limit-dropdown-title">
              <span data-i18n="memory.autoCompactLabel">自动压缩</span>
              <span class="memory-limit-info-icon" data-i18n-title="memory.autoCompactHint" title="上下文占用达到阈值时，发送前自动压缩一次（会额外产生一次摘要调用）。">ⓘ</span>
            </div>
            <label class="check-toggle" for="autoCompactBtn">
              <input type="checkbox" id="autoCompactBtn" />
              <span class="tool-toggle-label" data-i18n="memory.autoCompactLabel">自动压缩</span>
            </label>
          </div>
```

在 `context-indicator.js` 的初始化处为该 checkbox 绑定：change 时 `chrome.storage.local.set({ autoCompaction: checked })` 并同步 `state.chatConfig.autoCompaction`，成功后 `showToast(t('sidePanel.configUpdated'), 'success')`——与 `src/side_panel/index.js:347` 的 `chatMaxMemoryMessages` 写法完全同构（不要另起一套持久化）。

- [ ] **Step 7: 发送链路前置钩子**

`src/side_panel/index.js` 的发送函数在「组装 messages 之前」插入一次尝试（位置：读取 `state.messageHistory` 之后、计算 budget 之前），并保证同一发送会话内不重复触发：

```js
  // 阈值驱动的半自动压缩：失败即放行，不阻断本次发送
  if (state.chatConfig?.autoCompaction && !state.autoCompactionAttemptedForSend) {
    state.autoCompactionAttemptedForSend = true;
    try {
      const r = await maybeAutoCompactBeforeSend({
        getState: () => state,
        chatConfig: state.chatConfig,
        compact: (opts) => runCompaction(opts)
      });
      if (r.attempted && !r.success) logger.debug('[SidePanel] auto-compaction skipped:', r.reason);
    } catch (err) {
      logger.warn('[SidePanel] auto-compaction error (send continues):', err?.message);
    }
  }
```

并在该次发送结束时（`finally` 或成功/失败收口处）重置 `state.autoCompactionAttemptedForSend = false;`；`state` 初始值补 `autoCompactionAttemptedForSend: false`。同文件补 import：`import { maybeAutoCompactBeforeSend } from './auto-compaction.js';` 与 `import { runCompaction } from './context-indicator.js';`（若 `index.js` 已 import 过 `context-indicator.js`，在同一 from 子句追加导出项即可）。

`prompt-manager.js` 的发送链路同样补这段（两条链路必须对齐，否则「提示词一键发送」会跳过压缩——这是既有陷阱）。

- [ ] **Step 8: 运行测试 + 构建**

Run: `npx vitest run test/unit/auto-compaction.unit.test.js && npx vitest run && npm run build:silent`
Expected: 新测试 PASS；全量与基线一致；`BUILD_SUCCESS`。

- [ ] **Step 9: Commit**

```bash
git add src/side_panel/auto-compaction.js src/side_panel/context-indicator.js src/side_panel/index.js src/side_panel/prompt-manager.js src/background/constants.js src/background/config.js side_panel.html test/unit/auto-compaction.unit.test.js
git commit -m "feat(compaction): 上下文占用阈值触发半自动压缩（开关默认关，阈值默认85%）"
```

---

### Task 4: 压缩摘要沉淀为长期记忆

**Files:**
- Modify: `src/background/index.js:948-961`（`COMPACT_CONTEXT_SUMMARY` 处理）
- Modify: `src/storage/session-store.js:146`（`memoryId` 随 `contextCompaction` 一起持久化——已包含在对象内，无需额外字段）
- Test: `test/unit/compaction-memory-persist.unit.test.js`

**Interfaces:**
- Consumes: `AgentClient.agentRequest(path, body, method, timeoutMs)`；`POST /api/memory/store` 的 `{ action: 'add'|'update', type: 'summary', content, title, tags, importance, sourceSessionId, memoryId? }`；add 响应 `memory.id`
- Produces: `persistCompactionSummary({ summary, sessionId, memoryId, compressedCount, revision }) => Promise<{ memoryId: string|null, ok: boolean }>`

- [ ] **Step 1: 写失败测试**

新建 `test/unit/compaction-memory-persist.unit.test.js`：

```js
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/background/local-agent-client.js', () => ({ agentRequest: vi.fn() }));
vi.mock('../../src/shared/logger.js', () => ({ default: { debug: vi.fn(), warn: vi.fn(), info: vi.fn(), error: vi.fn() } }));

import { agentRequest } from '../../src/background/local-agent-client.js';
import { persistCompactionSummary } from '../../src/background/index.js';

const T = (s) => s;

describe('persistCompactionSummary', () => {
  beforeEach(() => agentRequest.mockReset());

  it('首次沉淀走 add，并回传新 memoryId', async () => {
    agentRequest.mockResolvedValue({ success: true, memory: { id: 'fact_a_1' } });
    const r = await persistCompactionSummary({ summary: 'S', sessionId: 's1', memoryId: null, compressedCount: 12, revision: 1 });
    expect(r).toEqual({ ok: true, memoryId: 'fact_a_1' });
    const [path, body, method] = agentRequest.mock.calls[0];
    expect(path).toBe('/api/memory/store');
    expect(method).toBe('POST');
    expect(body.action).toBe('add');
    expect(body.type).toBe('summary');
    expect(body.sourceSessionId).toBe('s1');
    expect(body.tags).toEqual(expect.arrayContaining(['compaction', 'session:s1']));
    expect(body.content).toContain('S');
  });

  it('重复压缩走 update（同 memoryId，不堆积条目）', async () => {
    agentRequest.mockResolvedValue({ success: true, memory: { id: 'fact_a_1' } });
    const r = await persistCompactionSummary({ summary: 'S2', sessionId: 's1', memoryId: 'fact_a_1', compressedCount: 20, revision: 2 });
    expect(agentRequest.mock.calls[0][1].action).toBe('update');
    expect(agentRequest.mock.calls[0][1].memoryId).toBe('fact_a_1');
    expect(r.memoryId).toBe('fact_a_1');
  });

  it('Agent 未连接时静默失败（不抛、ok=false、memoryId 保留原值）', async () => {
    agentRequest.mockRejectedValue(new Error('agent offline'));
    const r = await persistCompactionSummary({ summary: 'S', sessionId: 's1', memoryId: 'fact_old', revision: 3 });
    expect(r).toEqual({ ok: false, memoryId: 'fact_old' });
  });

  it('Agent 返回 404（旧版本）时不抛错', async () => {
    agentRequest.mockResolvedValue({ httpStatus: 404, success: false, error: 'unknown' });
    const r = await persistCompactionSummary({ summary: 'S', sessionId: 's1', memoryId: null, revision: 1 });
    expect(r.ok).toBe(false);
  });

  it('空摘要不发起请求', async () => {
    const r = await persistCompactionSummary({ summary: '   ', sessionId: 's1', revision: 1 });
    expect(r).toEqual({ ok: false, memoryId: null });
    expect(agentRequest).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/compaction-memory-persist.unit.test.js`
Expected: FAIL（`persistCompactionSummary` 未导出）。

- [ ] **Step 3: 实现沉淀函数**

`src/background/index.js` 在 `COMPACT_CONTEXT_SUMMARY` 处理块**之前**新增导出函数（放模块内合适位置，保持与既有工具函数一致的注释风格）：

```js
/**
 * 把会话压缩摘要沉淀为跨会话长期记忆（Agent 端存储）。
 * 同一会话重复压缩用同一 memoryId 走 update，避免每次 revision 堆一条摘要。
 * 任何失败都不抛出：压缩本身已成功，沉淀是增益。
 * @returns {Promise<{ ok: boolean, memoryId: string|null }>}
 */
export async function persistCompactionSummary({ summary, sessionId, memoryId = null, compressedCount = 0, revision = 1 } = {}) {
  const text = (summary || '').trim();
  if (!text) return { ok: false, memoryId: memoryId ?? null };

  const content = [
    `[会话压缩摘要 r${revision} · 已压缩 ${compressedCount} 条]`,
    text
  ].join('\n');

  const body = {
    action: memoryId ? 'update' : 'add',
    type: 'summary',
    category: 'decision',
    content,
    title: `会话摘要 ${new Date().toISOString().slice(0, 10)}`,
    tags: ['compaction', `session:${sessionId}`].filter(Boolean),
    importance: 6,
    sourceSessionId: sessionId || null
  };
  if (memoryId) body.memoryId = memoryId;

  try {
    const resp = await AgentClient.agentRequest('/api/memory/store', body, 'POST', 30000);
    if (!resp?.success) {
      logger.warn('[Background] persist compaction summary rejected:', resp?.error || resp?.httpStatus);
      return { ok: false, memoryId: memoryId ?? null };
    }
    return { ok: true, memoryId: resp.memory?.id || memoryId || null };
  } catch (err) {
    logger.warn('[Background] persist compaction summary failed:', err?.message);
    return { ok: false, memoryId: memoryId ?? null };
  }
}
```

- [ ] **Step 4: 接到消息处理里**

把 `COMPACT_CONTEXT_SUMMARY` 分支改为在摘要成功后按开关沉淀，并把 `memoryId` 一并回给侧边栏：

```js
  if (message.type === 'COMPACT_CONTEXT_SUMMARY') {
    const { material, model, sessionId, persistSummaryToMemory, memoryId, compressedCount, revision } = message;
    generateCompactionSummary({ material, model, sessionId })
      .then(async result => {
        if (result.success && persistSummaryToMemory !== false) {
          const persisted = await persistCompactionSummary({
            summary: result.summary,
            sessionId,
            memoryId: memoryId || null,
            compressedCount,
            revision
          });
          result.memoryId = persisted.memoryId;
        }
        sendResponse(result);
      })
      .catch(err => {
        logger.warn('[Background] COMPACT_CONTEXT_SUMMARY failed:', err);
        sendResponse({ success: false, error: err?.message || 'unknown' });
      });
    return true;  // 异步响应
  }
```

`src/side_panel/context-indicator.js` 的 `runCompaction` 请求体已在 Task 3 补了 `persistSummaryToMemory`，此处再补 `memoryId: old?.memoryId || null` 与 `revision: (old?.revision || 0) + 1`，形成闭环去重。

- [ ] **Step 5: 运行测试 + 全量 + 构建**

Run: `npx vitest run test/unit/compaction-memory-persist.unit.test.js && npx vitest run && npm run build:silent`
Expected: 5 条 PASS；全量与基线一致；`BUILD_SUCCESS`。

- [ ] **Step 6: Commit**

```bash
git add src/background/index.js src/side_panel/context-indicator.js test/unit/compaction-memory-persist.unit.test.js
git commit -m "feat(memory): 会话压缩摘要按 memoryId 去重沉淀为跨会话长期记忆"
```

---

### Task 5: 回归、文档与收尾

**Files:**
- Modify: `CHANGELOG.md`
- Modify: `agent/README.md` / `agent/README.zh-CN.md`（在「长期记忆」章节补一句摘要沉淀来源）
- Modify: wiki `Core-Features` / `Agent-Service` 中英（自动压缩开关与沉淀行为）

- [ ] **Step 1: Agent 侧回归（本计划不改 Agent 代码，仅确认未破）**

Run: `cd agent && node --test test/unit/*.unit.test.js`
Expected: `pass 220 / fail 0`。

- [ ] **Step 2: 扩展侧全量回归**

Run: `npx vitest run`
Expected: 与基线一致（78 文件全绿，2 个既有 `document is not defined` 噪音不变），新增 4 个测试文件计入。

- [ ] **Step 3: 端到端冒烟扩展**

在 `agent/test/smoke/memory-pushdown.smoke.mjs` 的断言序列里追加一步：以 `type: 'summary'`、`tags: ['compaction']` 走 `/api/memory/store` add → `/api/memory/inject` 应能看到该条按价值参与注入（importance=6 不进 Tier1，应落在 Tier2/3），再 `update` 同一 id 断言不新增条目。

Run: `node agent/test/smoke/memory-pushdown.smoke.mjs`
Expected: 全部 PASS（新增 2 项断言）。

- [ ] **Step 4: 真机验证（人工）**

Chrome 重载 `dist/`，在侧边栏：开关「自动压缩」→ 长会话把占用推到 85% 以上 → 发送一条消息，应看到「已自动压缩」toast 且压缩分隔线出现；关闭开关后不再自动触发；压缩后检查 `~/.ai-helper-agent/memory/global-memory.json` 出现一条 `type: summary` 且 `tags` 含 `compaction`；连续两次压缩后该记忆**仍只有一条**（`update` 生效）。

- [ ] **Step 5: 文档同步**

CHANGELOG 新增小节（`### 变更（会话上下文压缩增强）`）记录：结构化双语摘要模板、半自动阈值压缩（默认关、85%）、摘要按 memoryId 去重沉淀长期记忆（默认开）、注入链路单点收敛。README 的「长期记忆」章节补一句：`summary` 记忆可来自会话压缩（自动沉淀，带 `compaction` 标签）。wiki 同步并跑 `bash scripts/sync-wiki-to-gitee.sh`。

- [ ] **Step 6: Commit**

```bash
git add CHANGELOG.md agent/README.md agent/README.zh-CN.md agent/test/smoke/memory-pushdown.smoke.mjs docs/superpowers/plans/2026-10-13-context-compaction-effectiveness.md
git commit -m "docs(compaction): changelog、README 与冒烟覆盖摘要沉淀链路"
```

## Self-Review 检查点

- 覆盖度：四项决策（半自动 / 阈值+开关 / 摘要沉淀 / 注入单点）分别落在 Task 3、3、4、2；提示词双语是核实到的既有缺陷，落在 Task 1。
- 类型一致性：`runCompaction` 返回 `{ success, reason, savedTokens }`，`maybeAutoCompactBeforeSend` 只消费 `success`；`persistCompactionSummary` 返回 `{ ok, memoryId }`，调用方读 `memoryId` 写回 `state.activeCompaction.memoryId`，`/api/memory/store` 的 `add` 响应字段是 `memory.id`（已在 Task 4 测试锁定）。
- 无占位：每步都给出可编译代码与确定命令。
- 风险：`computeUsageSafe` 的入参必须与 `context-indicator.js:135-145` 实际调用逐字对齐——实施时先读那段代码再抄参数，别照抄本计划里可能的字段名差异。
