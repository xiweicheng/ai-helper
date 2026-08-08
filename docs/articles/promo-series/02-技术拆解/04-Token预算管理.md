# Token 预算管理：长对话不崩溃的秘密

> 本文来自 AI Helper 项目的真实工程实践。AI Helper 是一个开源的 Chrome 智能助手扩展，采用 ReAct 推理循环架构，内置 44 个工具，支持多轮工具调用和复杂任务拆解。

## 问题：多轮推理的 Token 雪崩

ReAct 架构的核心是"推理-行动-观察"循环。每一轮循环，AI 调用工具、拿到结果、把结果追加到消息历史中。一个复杂任务可能跑十几轮甚至几十轮，每轮的工具结果（页面 HTML、搜索结果、文件内容）动辄几千 tokens。

问题来了：随着轮次增加，消息历史不断膨胀，总 Token 量逼近模型的上下文窗口上限。一旦超限，要么 API 直接报错，要么模型开始"遗忘"早期的对话内容——质量断崖式下跌。

AI Helper 用一套 Token 预算管理体系来解决这个问题。

## 预算模型

首先得搞清楚"还有多少 Token 可以用"。AI Helper 的计算方式：

```
消息预算 = 上下文窗口 - 系统提示词 - 工具定义 - 输出预留(4096) - 安全余量(2000)
```

实际代码中，系统提示词和工具定义的 Token 数是实时计算的，而非用固定值估算：

```js
const actualSystemTokens = estimateTokens(systemPrompt);
const actualToolDefTokens = estimateTokens(
  JSON.stringify(tools.map(t => { const { id, ...clean } = t; return clean; }))
);
const contextWindow = getContextWindow(modelName, 0, chatConfig.customModelMap);
reactTokenBudget = contextWindow - actualSystemTokens - actualToolDefTokens - 4096 - 2000;
```

预留 4096 tokens 给模型输出回答，再留 2000 tokens 安全余量。剩下的才是消息历史可以用的预算。这个预算大致相当于上下文窗口的 80%——所以也可以理解为"总预算 = 上下文窗口 × 0.8"。

## 三级压力监测

每次 API 调用前，系统会估算当前消息的总 Token 数，与上下文窗口对比，得出压力等级：

```js
export function assessContextPressure(usedTokens, budget) {
  const ratio = usedTokens / budget;
  if (ratio < 0.7) return { level: 'safe', ratio };       // 安全
  if (ratio < 0.9) return { level: 'warning', ratio };     // 警告
  return { level: 'critical', ratio };                      // 危险
}
```

- **safe（<70%）**：正常执行，无需干预。
- **warning（70-90%）**：记录日志，准备压缩。
- **critical（>90%）或总预估超过 85%**：立即触发动态裁剪，把消息裁到预算的 75%。

```js
const pressure = assessContextPressure(totalEstimate, contextWindow);
if (pressure.level === 'critical' || totalEstimate > contextWindow * 0.85) {
  const targetBudget = Math.floor(reactTokenBudget * 0.75);
  const trimmed = trimMessagesByBudget(currentMessages, Math.max(targetBudget, 2000));
  // 执行裁剪
}
```

## 压缩策略：不直接丢弃，先摘要

直接删除旧消息是最简单的做法，但会丢失上下文信息——AI 会忘记之前做了什么。AI Helper 的压缩策略是分阶段的：

### 策略一：引用内容自动压缩

用户在对话中引用的网页内容、选中文本，会占用大量 Token。AI Helper 限制引用内容的最大 Token 数为 2000：

```js
const MAX_QUOTED_CONTEXT_TOKENS = 2000;

export function compressQuotedContext(ctx) {
  const tokens = estimateTokens(ctx);
  if (tokens <= MAX_QUOTED_CONTEXT_TOKENS) {
    return { compressed: ctx, wasCompressed: false };
  }
  const truncated = truncateByTokens(ctx, MAX_QUOTED_CONTEXT_TOKENS);
  return { compressed: truncated, wasCompressed: true };
}
```

引用内容超过 2000 tokens 时自动截断，避免大段网页 HTML 永久占据上下文。

### 策略二：增量摘要

当 Token 超标时，系统会找到最旧的一轮"完整对话轮次"（assistant 的 tool_calls + 后续 tool 消息），调用轻量 API 将其压缩为一句话摘要：

```js
// context-summarizer.js
export async function summarizeRound(roundMessages, config, model, options = {}) {
  // 提取工具名称 + 关键参数 + 结果摘要
  const toolCallInfos = assistantMsg.tool_calls.map((tc, idx) => {
    const name = tc.function?.name || 'unknown';
    const argsStr = extractKeyParams(...);
    const resultSnippet = resultStr.substring(0, 500); // 结果截断到 500 字符
    return `Tool: ${name} (${argsStr})\nResult: ${resultSnippet}`;
  });

  const summaryPrompt = `Summarize the execution of the following tool calls in one sentence,
extracting key findings: ${toolCallInfos.join('\n\n')}
No more than 150 characters.`;
  // 调用轻量 API，max_tokens: 200，只重试 1 次
}
```

摘要生成后，原来的 assistant(tool_calls) + tool 消息被替换为一条注入摘要的 user 消息。信息没有丢失，只是被压缩了。单次裁剪最多摘要 3 轮，避免摘要 API 耗时过长。

### 策略三：Token 级截断

对于单个工具结果内容过大，`truncateByTokens` 保留头部 70% + 尾部 30%：

```js
export function truncateByTokens(content, maxTokens) {
  const headTokens = Math.floor(maxTokens * 0.7);
  const tailTokens = maxTokens - headTokens;
  const head = content.slice(0, headChars);
  const tail = content.slice(-tailChars);
  return head + '\n... [中间 N tokens 已截断] ...\n' + tail;
}
```

还有智能截断 `truncateContentSmart`，根据内容类型采用不同策略：HTML 优先保留 `<body>`，JSON 保留顶层 key 结构（值做摘要），代码/文本用 60%头 + 20%尾。

### 策略四：兜底权重裁剪

如果摘要后仍然超标，进入兜底阶段——按权重直接删除消息：

```js
// 消息权重：反思消息 > 工具结果 > 普通消息
const getWeight = (msg) => {
  if (msg.role === 'user' && msg.content?.includes('[历史摘要]')) return 30;
  if (msg.role === 'tool') return 20;
  if (msg.role === 'assistant' && msg.tool_calls) return 15;
  return 10;
};
```

从旧到新逐条移除高权重消息，直到 Token 量在预算内。

## 自适应 Token 估算

不依赖 tiktoken 等重量级库，AI Helper 用字符数估算 Token，中英文分别处理：

```js
const CHINESE_CHAR_REGEX = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/g;
const CHARS_PER_TOKEN_CN = 1.5;  // 中文约 1.5 字符/token
const CHARS_PER_TOKEN_EN = 4;   // 英文约 4 字符/token

export function estimateTokens(text) {
  const chineseChars = text.match(CHINESE_CHAR_REGEX)?.length || 0;
  const otherChars = text.length - chineseChars;
  return Math.ceil(chineseChars / CHARS_PER_TOKEN_CN + otherChars / CHARS_PER_TOKEN_EN);
}
```

图片 Token 也有专门估算——按分辨率 tile 计算（85 + 170 × tiles），而非按 Base64 字符串长度（那样会高估约 20 倍）。

更聪明的是实时校准机制。每次 API 调用返回实际的 `prompt_tokens` 后，系统会用 EWMA（指数加权移动平均）修正估算偏差：

```js
let calibrationFactor = 1.0;
const CALIBRATION_MIN_SAMPLES = 3;  // 至少 3 次采样后才启用

export function updateCalibration(estimated, actual) {
  const ratio = actual / estimated;
  if (ratio < 0.3 || ratio > 3.0) return;  // 过滤异常
  const alpha = Math.min(0.3, 1 / calibrationSamples);
  calibrationFactor = calibrationFactor * (1 - alpha) + ratio * alpha;
}
```

样本少时权重大（快速收敛），样本多时权重小（稳定）。这样即使用的是非标准 tokenizer 的模型，估算也会越来越准。

## 自动上下文窗口检测

不同模型的上下文窗口大小不同。AI Helper 内置了一张映射表，同时支持用户自定义：

```js
export const MODEL_CONTEXT_WINDOWS = {
  'deepseek-v4-pro': 128000,
  'deepseek-chat': 64000,
  'gpt-4o': 128000,
  'gpt-4': 8192,
  'claude-3.5-sonnet': 200000,
  default: 64000
};

export function getContextWindow(modelName, userConfiguredWindow, customModelMap) {
  // 优先级：自定义模型配置 > 全局覆盖 > 内置映射 > default
  if (customModelMap?.has(modelName)) return customModelMap.get(modelName);
  if (userConfiguredWindow > 0) return userConfiguredWindow;
  return MODEL_CONTEXT_WINDOWS[modelName] || MODEL_CONTEXT_WINDOWS.default;
}
```

接入了自定义模型？在配置里指定上下文窗口大小就行，不需要改代码。

## 关键设计：保护 tool_calls/tool 配对

OpenAI 格式的消息中，assistant 的 `tool_calls` 和后续的 `tool` 消息是配对关系——tool 消息通过 `tool_call_id` 引用 tool_calls 中的 id。如果裁剪时只删了 tool 消息但留下了 tool_calls（或反过来），API 会报错。

`trimMessagesByBudget` 在裁剪时保证了配对完整性：

```js
// 如果移除的是 assistant(tool_calls)，则后续的 tool 消息也要一并移除
if (removed?.role === 'assistant' && removed.tool_calls) {
  while (rest.length > 0 && rest[0]?.role === 'tool') {
    trimmedMessages.push(rest.shift());
  }
}
```

同时，`filterApiMessages` 在发送前会扫描整个消息数组，检查每个 `tool_calls` 是否都有对应的 tool 响应。没有响应的 tool_calls 会被清除，部分匹配的只保留有响应的那些。

## 总结

Token 预算管理的核心思路：**按 Token 数而非消息条数管理上下文**。通过实时估算、三级压力监测、增量摘要、智能截断和配对保护，让长对话在多轮推理循环中保持稳定，不会因为 Token 超限而崩溃。

关键设计决策是"先摘要后删除"——宁可花一次轻量 API 调用来压缩历史信息，也不直接丢弃，这样 AI 在后续轮次中仍然能参考早期操作的上下文。

---

**项目地址：**
- GitHub: https://github.com/xiweicheng/ai-helper
- Gitee: https://gitee.com/xiweicheng/ai-helper
