// ReAct 循环工程优化（P0~P2）回归测试
// 对应计划：任务状态锚点、收敛提示与子任务预算、Retry-After/jitter、
// 400 超限自愈、子任务上下文交接、批量压缩、工具结果卸载、轮内部分并行、
// 工具级反思内联提示、clarify 后工具集稳定、plan_task 策略对齐
import { describe, test, expect, vi, beforeEach, afterEach, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { filterApiMessages } from '../../src/shared/token-counter.js';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);
const TOOL_EXECUTOR_SRC = readFileSync(
  new URL('../../src/background/tool-executor.js', import.meta.url),
  'utf8'
);
const AI_TOOLS_SRC = readFileSync(
  new URL('../../src/background/tools/ai-tools.js', import.meta.url),
  'utf8'
);
const DISPATCHER_SRC = readFileSync(
  new URL('../../src/background/agent-dispatcher.js', import.meta.url),
  'utf8'
);
const CONTEXT_SUMMARIZER_SRC = readFileSync(
  new URL('../../src/background/context-summarizer.js', import.meta.url),
  'utf8'
);

let executePlanTask;
let fetchWithRetry;
let parseRetryAfterMs;
let getToolObservationHint;
let computeSubtaskLoopTimeoutMs;

beforeAll(async () => {
  const te = await import('../../src/background/tool-executor.js');
  executePlanTask = te.executePlanTask;
  fetchWithRetry = te.fetchWithRetry;
  parseRetryAfterMs = te.parseRetryAfterMs;
  const rl = await import('../../src/background/react-loop.js');
  getToolObservationHint = rl.getToolObservationHint;
  computeSubtaskLoopTimeoutMs = rl.computeSubtaskLoopTimeoutMs;
});

const validSubtasks = [
  { id: 's1', name: '任务一', description: '做第一件事' },
  { id: 's2', name: '任务二', description: '做第二件事', dependencies: ['s1'] },
];

describe('P0-1 plan_task schema 与执行策略对齐', () => {
  test('schema strategy 枚举暴露 dependency、移除未实现的 conditional，并暴露执行侧参数', () => {
    const planTool = AI_TOOLS_SRC.match(/id: 'plan_task'[\s\S]*?failureStrategy:[\s\S]*?maxParallel: \{ type: 'integer'/);
    expect(planTool).not.toBeNull();
    expect(AI_TOOLS_SRC).toMatch(/strategy: \{ type: 'string', enum: \['sequential', 'parallel', 'dependency'\]/);
    expect(AI_TOOLS_SRC).not.toMatch(/'conditional'/);
  });

  test('未知 strategy 返回明确错误而非静默降级，错误信息引导 conditional 意图表达', async () => {
    for (const bad of ['conditional', 'round-robin']) {
      const res = await executePlanTask(
        { taskDescription: 't', subtasks: validSubtasks, strategy: bad },
        'tc-bad'
      );
      expect(res.success).toBe(false);
      expect(res.error).toContain(`Unknown execution strategy "${bad}"`);
      expect(res.error).toContain('sequential / parallel / dependency');
    }
  });

  test('dependency 策略通过校验并在结果中标注依赖拓扑执行', async () => {
    const res = await executePlanTask(
      { taskDescription: 't', subtasks: validSubtasks, strategy: 'dependency' },
      'tc-dep'
    );
    expect(res.success).toBe(true);
    expect(res.message).toContain('依赖拓扑执行');
    expect(res.data.strategy).toBe('dependency');
  });

  test('failureStrategy/maxRetries/maxParallel clamp 后透传进 planSummary', async () => {
    const res = await executePlanTask(
      {
        taskDescription: 't', subtasks: validSubtasks, strategy: 'parallel',
        failureStrategy: 'nuke', maxRetries: 99, maxParallel: 100,
      },
      'tc-clamp'
    );
    expect(res.success).toBe(true);
    expect(res.data.failureStrategy).toBe('continue'); // 非法值回落默认
    expect(res.data.maxRetries).toBe(3);               // clamp 上限 3
    expect(res.data.maxParallel).toBe(8);              // clamp 上限 8

    const ok = await executePlanTask(
      {
        taskDescription: 't', subtasks: validSubtasks, strategy: 'sequential',
        failureStrategy: 'stop', maxRetries: 2, maxParallel: 4,
      },
      'tc-ok'
    );
    expect(ok.data.failureStrategy).toBe('stop');
    expect(ok.data.maxRetries).toBe(2);
    expect(ok.data.maxParallel).toBe(4);
  });

  test('executeSubtasks 未知策略抛错（不再静默顺序执行）', () => {
    expect(REACT_LOOP_SRC).toMatch(/throw createErrorWithLog\(t\('reactLoop\.unknownStrategy'/);
    expect(REACT_LOOP_SRC).toMatch(/unknownStrategy:/); // zh/en i18n key 均已注册
  });
});

describe('P0-4 fetchWithRetry：Retry-After / jitter / parseRetryAfterMs', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.5); // jitter 因子 = 0.8 + 0.5*0.4 = 1.0
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  test('parseRetryAfterMs：秒数 / HTTP-date / 非法值', () => {
    expect(parseRetryAfterMs('7')).toBe(7000);
    expect(parseRetryAfterMs('0')).toBe(0);
    expect(parseRetryAfterMs('-5')).toBeNull();
    expect(parseRetryAfterMs(null)).toBeNull();
    expect(parseRetryAfterMs('garbage')).toBeNull();
    const future = new Date(Date.now() + 3000).toUTCString();
    const ms = parseRetryAfterMs(future);
    expect(ms).not.toBeNull();
    expect(ms).toBeLessThanOrEqual(3000);
    expect(ms).toBeGreaterThanOrEqual(0);
    // 过去时间 → 0（不为负）
    expect(parseRetryAfterMs(new Date(Date.now() - 5000).toUTCString())).toBe(0);
  });

  function mock429(retryAfter) {
    const headers = { get: vi.fn((name) => (name === 'Retry-After' ? retryAfter : null)) };
    return vi.fn().mockResolvedValue({ status: 429, headers, text: () => Promise.resolve('rate limited') });
  }

  test('429 无 Retry-After：指数退避叠加 ±20% jitter', async () => {
    globalThis.fetch = mock429(null);
    const onRetry = vi.fn();
    const p = fetchWithRetry('https://x/api', {}, 1000, 1, 1000, onRetry);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toMatchObject({ status: 429 });
    expect(onRetry).toHaveBeenCalledTimes(1);
    const jittered = onRetry.mock.calls[0][2];
    expect(jittered).toBeGreaterThanOrEqual(800);
    expect(jittered).toBeLessThanOrEqual(1200);
  });

  test('429 Retry-After 小于退避下限时不缩短已有退避', async () => {
    globalThis.fetch = mock429('1'); // 1000ms < jittered(1000) 
    const onRetry = vi.fn();
    const p = fetchWithRetry('https://x/api', {}, 1000, 1, 1000, onRetry);
    await vi.advanceTimersByTimeAsync(1200);
    await expect(p).resolves.toMatchObject({ status: 429 });
    expect(onRetry.mock.calls[0][2]).toBeGreaterThanOrEqual(800);
  });

  test('429 Retry-After 作为下限并封顶 60s', async () => {
    globalThis.fetch = mock429('120');
    const onRetry = vi.fn();
    const p = fetchWithRetry('https://x/api', {}, 1000, 1, 1000, onRetry);
    await vi.advanceTimersByTimeAsync(60000);
    await expect(p).resolves.toMatchObject({ status: 429 });
    expect(onRetry.mock.calls[0][2]).toBe(60000);
  });

  test('429 HTTP-date 格式 Retry-After 同样生效', async () => {
    globalThis.fetch = mock429(new Date(Date.now() + 90000).toUTCString());
    const onRetry = vi.fn();
    const p = fetchWithRetry('https://x/api', {}, 1000, 1, 1000, onRetry);
    await vi.advanceTimersByTimeAsync(60000);
    await expect(p).resolves.toMatchObject({ status: 429 });
    expect(onRetry.mock.calls[0][2]).toBe(60000); // 90s > 60s 封顶
  });
});

describe('P2-9 getToolObservationHint 规则内联提示', () => {
  test('成功且非空非超大结果 → 无提示', () => {
    expect(getToolObservationHint({ success: true, resultStr: 'normal output', resultTokens: 100 })).toBe('');
  });

  test('失败 → 提示不要原样重试；本轮已有失败时附计数', () => {
    const hint = getToolObservationHint({ success: false, resultStr: '', roundFailCount: 0 });
    expect(hint).toContain('[Observation Hint]');
    expect(hint).toContain('Do NOT retry the exact same call');
    expect(hint).not.toContain('failure #');
    const hint2 = getToolObservationHint({ success: false, resultStr: '', roundFailCount: 2 });
    expect(hint2).toContain('this is failure #3 in this round');
  });

  test('空结果 → 提示换关键词或数据源', () => {
    const hint = getToolObservationHint({ success: true, resultStr: '   ', resultTokens: 1 });
    expect(hint).toContain('the result is empty');
  });

  test('超大结果（截断前 >MAX_TOOL_RESULT_TOKENS=6000 且被截断）→ 提示收窄查询或读卸载文件', () => {
    expect(getToolObservationHint({ success: true, resultStr: 'x', truncated: true, resultTokens: 30000 }))
      .toContain('very large (30000 tokens)');
    // #11：旧 24000 硬编码会让 6000~24000 区间被截断的结果拿不到提示，阈值必须与截断同源
    expect(getToolObservationHint({ success: true, resultStr: 'x', truncated: true, resultTokens: 8000 }))
      .toContain('very large (8000 tokens)');
    // 未达阈值（≤6000 必然未被截断）不提示
    expect(getToolObservationHint({ success: true, resultStr: 'x', truncated: true, resultTokens: 6000 })).toBe('');
  });
});

describe('#10/#11 修复回归：压缩输入封顶与提示阈值同源', () => {
  test('#11 观察提示接线：roundFailCount 口径 + 阈值同源，旧硬编码与回溯计数已移除', () => {
    expect(REACT_LOOP_SRC).toMatch(/truncated && resultTokens > MAX_TOOL_RESULT_TOKENS/);
    expect(REACT_LOOP_SRC).not.toMatch(/resultTokens > 24000/);
    // 模块级共享常量（截断/卸载与提示同源），函数内局部定义已上提
    expect(REACT_LOOP_SRC).toMatch(/^const MAX_TOOL_RESULT_TOKENS = 6000;$/m);
    // 本轮失败总数口径（并行下不受 processing 尾元素提前 break 影响）
    expect(REACT_LOOP_SRC).toMatch(/status === 'failed'\)\s*\.length;/);
    expect(REACT_LOOP_SRC).toMatch(/roundFailCount,/); // 调用点传参
    expect(REACT_LOOP_SRC).not.toMatch(/consecutiveFailCount/);
  });

  test('#10 批量压缩 transcript 超上限时截为头 70%+尾 30%，不丢任务目标与最近轮次', async () => {
    // stub 全局 fetch，走真实 fetchWithRetry → context-summarizer 链路（本文件未 mock tool-executor）
    const cap = 2000;
    const captured = [];
    vi.stubGlobal('fetch', async (url, opts) => {
      captured.push(opts);
      return {
        ok: true, status: 200,
        json: async () => ({ choices: [{ message: { content: '## Task goal\ngoal' } }] }),
        text: async () => '',
        headers: { get: () => null },
      };
    });
    try {
      const bigCall = {
        id: 'tcbig',
        function: { name: 'read_file', arguments: JSON.stringify({ path: '/tmp/f.txt', note: 'x'.repeat(4000) }) },
      };
      const bigMessages = [
        { role: 'assistant', content: '', tool_calls: [bigCall] },
        { role: 'tool', tool_call_id: 'tcbig', content: 'middle detail '.repeat(1000) },
      ];
      const tokenCounter = await import('../../src/shared/token-counter.js');
      const { summarizeRoundsBatch: batchFresh } = await import('../../src/background/context-summarizer.js');
      const apiConfig = { apiBase: 'https://api.test/v1', apiKey: 'sk-test', modelName: 'm1' };

      await batchFresh(bigMessages, 'PRIOR SUMMARY HEAD', apiConfig, 'm1', { transcriptMaxTokens: cap });

      expect(captured.length).toBe(1);
      const prompt = JSON.parse(captured[0].body).messages[0].content;
      expect(tokenCounter.estimateTokens(prompt)).toBeLessThanOrEqual(cap + 600); // 预留输出模板尾部余量
      expect(prompt).toContain('PRIOR SUMMARY HEAD'); // 头部保留（含早期摘要/任务目标）
      expect(prompt).toContain('middle detail'); // 尾部 30% 保留（最近的可压轮次）
    } finally {
      vi.unstubAllGlobals();
    }
  });

  test('#10 context-summarizer 接线：默认封顶常量与选项透传', () => {
    const CS_SRC = readFileSync(
      new URL('../../src/background/context-summarizer.js', import.meta.url),
      'utf8'
    );
    expect(CS_SRC).toMatch(/const BATCH_TRANSCRIPT_MAX_TOKENS = 30000;/);
    expect(CS_SRC).toMatch(/options\.transcriptMaxTokens \|\| BATCH_TRANSCRIPT_MAX_TOKENS/);
    expect(CS_SRC).toMatch(/truncateByTokens\(transcript, transcriptCap\)/);
  });
});

describe('P0-2/P0-3 锚点与预算接线守卫', () => {
  test('任务锚点瞬态注入 filteredMessages（不写入 currentMessages）', () => {
    expect(REACT_LOOP_SRC).toMatch(/buildPlanAnchorMessage/);
    expect(REACT_LOOP_SRC).toMatch(/\[\.\.\.filteredMessages,\s*anchorMsg\]/); // 经判空后注入（#8：防损坏 taskState 抛错）
    expect(REACT_LOOP_SRC).toMatch(/let taskState = resumeState\?\.taskState \|\| null/);
  });
  test('checkpoint 保存与恢复链路携带 taskState', () => {
    expect(REACT_LOOP_SRC).toMatch(/taskState,\n/); // saveCheckpointNow payload
    expect(REACT_LOOP_SRC).toMatch(/taskState: checkpoint\.taskState/); // resume 回灌
  });
  test('收敛提示按 80% 预算触发', () => {
    expect(REACT_LOOP_SRC).toMatch(/Math\.ceil\(maxIterations \* 0\.8\)/);
  });
  test('子任务迭代预算取 min(默认 20, 父剩余轮次)，超时 15 分钟封顶', () => {
    expect(REACT_LOOP_SRC).toMatch(/subtaskMaxIterations/);
    expect(REACT_LOOP_SRC).toMatch(/SUBTASK_LOOP_TIMEOUT_MS = 900000/);
    expect(REACT_LOOP_SRC).toMatch(/DEFAULT_MAX_ITERATIONS: 20/);
  });
  test('400 上下文超限单次自愈：trim 到预算 60% 后重试本轮', () => {
    expect(REACT_LOOP_SRC).toMatch(/contextOverflowHealed/);
    expect(REACT_LOOP_SRC).toMatch(/trimMessagesByBudget/);
    expect(REACT_LOOP_SRC).toMatch(/context_overflow_trim/);
  });
});

describe('P1-5/P1-6/P1-7/P1-8/P2-10 接线守卫', () => {
  test('子任务 system prompt 注入 Inherited Context，parallel 策略不带前序结果', () => {
    expect(REACT_LOOP_SRC).toMatch(/## Inherited Context/);
    expect(REACT_LOOP_SRC).toMatch(/historySummary: summarizedAccumulator \|\| ''/);
    expect(REACT_LOOP_SRC).toMatch(/strategy !== 'parallel'/);
    expect(REACT_LOOP_SRC).toMatch(/Completed preceding subtasks/);
  });
  test('dispatch_task 结构化 brief 与 token 预算截断', () => {
    expect(DISPATCHER_SRC).toMatch(/\*\*Conclusion\*\*[\s\S]*\*\*Key evidence\*\*[\s\S]*\*\*Unfinished items\*\*/);
    expect(DISPATCHER_SRC).toMatch(/truncateByTokens\(result, MAX_RESULT_TOKENS\)/);
    expect(DISPATCHER_SRC).not.toMatch(/maxResultLen = 4000/);
  });
  test('trimMessages 阈值触发批量压缩（80% 阈值 + 单次批量调用 + 权重裁剪兜底）', () => {
    expect(REACT_LOOP_SRC).toMatch(/const compactionThreshold = Math\.floor\(budget \* 0\.8\)/);
    expect(REACT_LOOP_SRC).toMatch(/summarizeRoundsBatch\(toCompress, priorSummary/);
    expect(REACT_LOOP_SRC).toMatch(/rounds\.slice\(0, Math\.max\(0, rounds\.length - 2\)\)/);
    expect(REACT_LOOP_SRC).not.toMatch(/SUMMARY_MAX_ROUNDS_PER_CALL/); // 旧逐轮串行摘要已移除
  });
  test('大工具结果优先卸载到 Agent workspace，失败回退截断', () => {
    expect(REACT_LOOP_SRC).toMatch(/offloadLargeToolResult/);
    expect(REACT_LOOP_SRC).toMatch(/isAgentPaired/);
    // 路径同时清洗 toolName 与模型可控的 toolCallId，防 ../ 越出 tool-results/ 目录
    expect(REACT_LOOP_SRC).toMatch(/tool-results\/\$\{safeToolName\}_\$\{safeCallId\}\.txt/);
    expect(REACT_LOOP_SRC).toMatch(/const safeCallId = String\(toolCallId \|\| crypto\.randomUUID\(\)\)\.replace/);
    expect(REACT_LOOP_SRC).not.toMatch(/tool-results\/\$\{safeToolName\}_\$\{toolCallId\}\.txt/);
  });
  test('轮内工具部分并行：分组执行 + 按 tool_calls 声明顺序重排', () => {
    expect(REACT_LOOP_SRC).toMatch(/const tcGroups = \[\]/);
    expect(REACT_LOOP_SRC).toMatch(/group\.parallel && group\.calls\.length > 1/);
    expect(REACT_LOOP_SRC).toMatch(/toolMessages\.sort/);
    expect(REACT_LOOP_SRC).not.toMatch(/allParallelizable/); // 全有或全无路径已替换
  });
  test('工具级反思 LLM 队列已移除，改为规则内联', () => {
    expect(REACT_LOOP_SRC).not.toMatch(/pendingReflections/);
    expect(REACT_LOOP_SRC).not.toMatch(/processPendingReflections/);
    expect(REACT_LOOP_SRC).toMatch(/getToolObservationHint\(\{/);
    expect(REACT_LOOP_SRC).toMatch(/wrapUntrusted\(toolName, toolResultStr, sessionId\) \+ observationHint/);
  });
  test('clarify 后不再重新预筛选工具集（KV cache 稳定），失效导入已清理', () => {
    expect(REACT_LOOP_SRC).not.toMatch(/preselectTools/);
    expect(REACT_LOOP_SRC).toMatch(/P2-10：clarify 后不再重新预筛选/);
  });
  test('TOOL_EXECUTOR 未知策略错误文案引导 conditional 意图进子任务描述', () => {
    expect(TOOL_EXECUTOR_SRC).toMatch(/"conditional" is not supported/);
  });
});

describe('P1-8 修复回归：轮内重排后的 assistant(tool_calls)+tool 配对（真实 filterApiMessages 行为）', () => {
  // 覆盖此前纯文本守卫的盲区：plan_task 轮次在 tool 消息之后追加了 role:user 子任务汇总，
  // 若把非 tool 消息提到 tool 之前，filterApiMessages 遇非 tool 即 break → 误判无匹配清除 tool_calls
  // 并留下孤儿 tool 消息 → 下一请求 400。本组用例锁定“先 tool 后非 tool”的正确形态。
  const asst = (ids) => ({
    role: 'assistant',
    content: '',
    tool_calls: ids.map(id => ({ id, type: 'function', function: { name: 'plan_task', arguments: '{}' } })),
  });
  const tool = (id) => ({ role: 'tool', tool_call_id: id, content: 'ok' });
  const user = (content) => ({ role: 'user', content });

  test('正确顺序（tool 后接非 tool）：tool_calls 保留、tool 消息成对', () => {
    const out = filterApiMessages([
      { role: 'system', content: 's' },
      user('原始问题'),
      asst(['a', 'b']),
      tool('a'),
      tool('b'),
      user('[System Context] 子任务结果汇总'),
    ]);
    const assistant = out.find(m => m.role === 'assistant');
    expect(assistant.tool_calls).toBeDefined();
    expect(assistant.tool_calls.map(tc => tc.id)).toEqual(['a', 'b']);
    // assistant 之后紧跟的都是 tool 消息（相邻性）
    const idxA = out.findIndex(m => m === assistant);
    expect(out[idxA + 1].role).toBe('tool');
    expect(out[idxA + 2].role).toBe('tool');
    expect(out.filter(m => m.role === 'tool').length).toBe(2);
  });

  test('错误顺序（非 tool 插在 assistant 与 tool 之间）：复现配对断裂——正是修复前的回归', () => {
    const out = filterApiMessages([
      { role: 'system', content: 's' },
      user('原始问题'),
      asst(['a', 'b']),
      user('[System Context] 子任务结果汇总'),
      tool('a'),
      tool('b'),
    ]);
    // assistant 后紧跟 user → followingToolIds 为空 → tool_calls 被清除（空 content 时整条 assistant 被移除）
    expect(out.find(m => m.role === 'assistant' && m.tool_calls)).toBeUndefined();
    // 危险点：两条 tool 消息仍作为“孤儿”保留（无对应 tool_calls）→ OpenAI 兼容端会报 400
    expect(out.filter(m => m.role === 'tool').length).toBe(2);
  });

  test('源码接线：react-loop 采用先 push toolMessages 后 nonToolMessages 的正确形态', () => {
    expect(REACT_LOOP_SRC).toMatch(/currentMessages\.push\(\.\.\.toolMessages, \.\.\.nonToolMessages\)/);
    expect(REACT_LOOP_SRC).not.toMatch(/currentMessages\.push\(\.\.\.nonToolMessages, \.\.\.toolMessages\)/);
    // trimMessages 原地改写保持数组引用恒定（消除形参遮蔽消息丢失）
    expect(REACT_LOOP_SRC).toMatch(/currentMessages\.splice\(0, currentMessages\.length, \.\.\.systemMsg, \.\.\.rest\)/);
    expect(REACT_LOOP_SRC).not.toMatch(/^\s*currentMessages = \[\.\.\.systemMsg, \.\.\.rest\];/m);
    // msgCountBefore 收缩守卫
    expect(REACT_LOOP_SRC).toMatch(/if \(msgCountBefore <= currentMessages\.length\)/);
    // 锚点/收敛注入位于压力裁剪之后
    const clipIdx = REACT_LOOP_SRC.indexOf('const trimmed = trimMessagesByBudget(currentMessages');
    const anchorIdx = REACT_LOOP_SRC.indexOf('const anchorMsg = buildPlanAnchorMessage();');
    expect(clipIdx).toBeGreaterThan(-1);
    expect(anchorIdx).toBeGreaterThan(clipIdx);
  });
});

describe('P1-8 #7 修复回归：子任务超时受父任务实时剩余时间约束', () => {
  test('父剩余充足时取 SUBTASK 上限（不早于旧行为）', () => {
    // 2h → 仍被 15min 上限封顶
    expect(computeSubtaskLoopTimeoutMs(2 * 3600 * 1000)).toBe(900000);
  });

  test('父剩余紧时按 min(上限, 剩余-10s缓冲) 收紧', () => {
    expect(computeSubtaskLoopTimeoutMs(120000)).toBe(110000); // 2min → 110s
    expect(computeSubtaskLoopTimeoutMs(90000)).toBe(80000);   // 90s → 80s
  });

  test('父剩余过小或无效时回退到下限/默认，不至即刻杀停', () => {
    expect(computeSubtaskLoopTimeoutMs(30000)).toBe(60000);      // 30s → 下限 60s
    expect(computeSubtaskLoopTimeoutMs(undefined)).toBe(890000); // 无父预算 → 默认上限内
  });

  test('react-loop 接线：loopTimeout 纳入 subtaskLoopTimeoutMs，父传实时 getter', () => {
    expect(REACT_LOOP_SRC).toMatch(/Math\.min\(reactConfig\.loopTimeout, SUBTASK_LOOP_TIMEOUT_MS, apiParams\.subtaskLoopTimeoutMs \|\| SUBTASK_LOOP_TIMEOUT_MS\)/);
    expect(REACT_LOOP_SRC).toMatch(/getRemainingTimeMs: \(\) => getRemainingTime\(\)/);
    expect(REACT_LOOP_SRC).toMatch(/subtaskMaxIterations, subtaskLoopTimeoutMs/);
    // 旧的静态快照字段已移除（改为 getter）
    expect(REACT_LOOP_SRC).not.toMatch(/remainingTimeMs: getRemainingTime\(\)/);
  });
});

describe('#8/#9 修复回归：锚点结构守卫与死导入/死导出清理', () => {
  test('#8 锚点对回灌 taskState 做结构校验，调用处判空跳过注入', () => {
    expect(REACT_LOOP_SRC).toMatch(/if \(!taskState \|\| !Array\.isArray\(taskState\.subtasks\) \|\| taskState\.subtasks\.length === 0\) return null;/);
    expect(REACT_LOOP_SRC).toMatch(/if \(anchorMsg\) filteredMessages = \[\.\.\.filteredMessages, anchorMsg\];/);
    // 旧形态（无守卫直接解引用）已移除
    expect(REACT_LOOP_SRC).not.toMatch(/filteredMessages = \[\.\.\.filteredMessages, buildPlanAnchorMessage\(\)\];/);
  });

  test('#9 react-loop 死导入已清理', () => {
    expect(REACT_LOOP_SRC).not.toMatch(/import \{[^}]*fetchWithTimeout[^}]*\} from '\.\/tool-executor\.js'/);
    expect(REACT_LOOP_SRC).not.toMatch(/import \{[^}]*estimateToolsTokens[^}]*\} from '\.\.\/shared\/token-counter\.js'/);
    expect(REACT_LOOP_SRC).not.toMatch(/import \{[^}]*getMessageBudget[^}]*\} from '\.\.\/shared\/token-counter\.js'/);
    // 仍在使用的导入不受影响
    expect(REACT_LOOP_SRC).toMatch(/import \{[^}]*fetchWithRetry[^}]*\} from '\.\/tool-executor\.js'/);
    expect(REACT_LOOP_SRC).toMatch(/import \{[^}]*truncateByTokens[^}]*\} from '\.\.\/shared\/token-counter\.js'/);
  });

  test('#9 死导出 summarizeRound 已从 context-summarizer 移除，批量压缩保留', () => {
    expect(CONTEXT_SUMMARIZER_SRC).not.toMatch(/export async function summarizeRound\b/);
    expect(CONTEXT_SUMMARIZER_SRC).toMatch(/export async function summarizeRoundsBatch/);
    expect(CONTEXT_SUMMARIZER_SRC).not.toMatch(/const SUMMARY_MAX_TOKENS/);
  });
});
