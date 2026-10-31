// 目标评估器（src/background/goal-evaluator.js）的行为锁。
//
// 这个模块只做一件事：把「目标 + 本轮痕迹」变成一次短问询，再把回答解析成三态结论。
// 因此测试分四组：
//   1. 给了什么（prompt 内容：目标/标准/约束/证据/工具摘要/上一轮理由）；
//   2. 没给什么（不塞整段对话、UNVERIFIED 绝不渲染成 FAIL——继承 completion-verifier 红线）；
//   3. 异常怎么收场（解析失败 / 网络失败 / 无目标 → evaluatorError，绝不默认判达成）；
//   4. 生产请求的真实形状（model 回落、temperature=0、json_object、token 记账）。
import { describe, it, expect, vi, beforeEach } from 'vitest';

const callChatCompletion = vi.fn();
const recordTokenUsage = vi.fn(() => Promise.resolve());
const fetchWithRetry = vi.fn();

vi.mock('../../src/shared/chat-client.js', () => ({
  callChatCompletion: (...args) => callChatCompletion(...args),
  resolveUseStream: () => false,
}));
vi.mock('../../src/background/tool-executor.js', () => ({
  fetchWithRetry: (...args) => fetchWithRetry(...args),
}));
vi.mock('../../src/background/token-recorder.js', () => ({
  recordTokenUsage: (...args) => recordTokenUsage(...args),
}));

const {
  GOAL_EVALUATION_DEFAULTS,
  summarizeExecutionLog,
  formatObjectiveEvidence,
  buildGoalEvaluationPrompt,
  evaluateGoal,
  isTerminalVerdict,
} = await import('../../src/background/goal-evaluator.js');
const { createGoal, GOAL_VERDICTS } = await import('../../src/shared/goal.js');

const T0 = 1_700_000_000_000;

function makeGoal(extra = {}) {
  return {
    ...createGoal({
      objective: '把首页 LCP 降到 2.5s 以内',
      criteria: ['Lighthouse 性能分 ≥ 90', 'LCP ≤ 2.5s'],
      constraints: ['不要引入新的第三方库'],
      now: T0,
    }),
    ...extra,
  };
}

function fakeRequest(returns) {
  return vi.fn(async () => returns);
}

beforeEach(() => {
  callChatCompletion.mockReset();
  recordTokenUsage.mockReset();
  recordTokenUsage.mockResolvedValue(undefined);
  fetchWithRetry.mockReset();
});

describe('prompt 里给了什么', () => {
  it('包含目标、验收标准、追加约束与轮次进度', () => {
    const prompt = buildGoalEvaluationPrompt(makeGoal({ turnsUsed: 2 }), { digest: '- [OK] read_file' });
    expect(prompt).toContain('把首页 LCP 降到 2.5s 以内');
    expect(prompt).toContain('Lighthouse 性能分 ≥ 90');
    expect(prompt).toContain('不要引入新的第三方库');
    expect(prompt).toContain('attempt 3/20');
    expect(prompt).toContain('- [OK] read_file');
  });

  it('包含机检断言清单，让评估器知道哪些是硬判据', () => {
    const goal = makeGoal({
      doneCriteria: [
        { id: 'c1', check: 'element_exists', target: '#hero', expected: '' },
        { id: 'c2', check: 'command_exit_zero', target: 'npm test', expected: '0' },
      ],
    });
    const prompt = buildGoalEvaluationPrompt(goal, {});
    expect(prompt).toContain('element_exists target=#hero');
    expect(prompt).toContain('command_exit_zero target=npm test');
  });

  it('把上一轮理由作为「连续性参考」，同时提醒不要盲抄', () => {
    const goal = makeGoal({
      lastVerdict: { verdict: GOAL_VERDICTS.UNMET, reason: '仍是 3.1s', missing: [], at: T0 },
    });
    const prompt = buildGoalEvaluationPrompt(goal, {});
    expect(prompt).toContain('仍是 3.1s');
    expect(prompt).toContain('do not copy blindly');
  });

  it('本轮最终回答被截断，并标明「只是声明、不是证据」', () => {
    const answer = 'x'.repeat(GOAL_EVALUATION_DEFAULTS.answerChars + 100);
    const prompt = buildGoalEvaluationPrompt(makeGoal(), { answer });
    expect(prompt).toContain('a claim, not evidence');
    expect(prompt).toContain('[truncated]');
    expect(prompt).not.toContain('x'.repeat(GOAL_EVALUATION_DEFAULTS.answerChars + 50));
  });

  it('无目标时返回空串（调用方据此跳过）', () => {
    expect(buildGoalEvaluationPrompt(null, {})).toBe('');
  });
});

describe('客观取证的渲染红线', () => {
  it('available:false 渲染成 UNVERIFIED，绝不写成 FAIL', () => {
    const text = formatObjectiveEvidence([
      { id: 'c1', check: 'element_exists', pass: true, available: true },
      { id: 'c2', check: 'command_exit_zero', pass: false, available: true },
      { id: 'c3', check: 'url_matches', pass: false, available: false, reason: 'channel_unavailable' },
    ]);
    expect(text).toContain('[PASS] c1');
    expect(text).toContain('[FAIL] c2');
    expect(text).toContain('[UNVERIFIED] c3');
    expect(text).toContain('channel_unavailable');
    expect(text).not.toContain('[FAIL] c3');
  });

  it('没有取证结果时明确说明「没跑」，而不是留空让模型自由发挥', () => {
    expect(formatObjectiveEvidence([])).toContain('no objective checks');
    expect(formatObjectiveEvidence(null)).toContain('no objective checks');
  });

  it('prompt 里显式写明「取不到证不是失败证据」', () => {
    const prompt = buildGoalEvaluationPrompt(makeGoal(), {
      evidence: [{ id: 'c3', check: 'url_matches', pass: false, available: false, reason: 'timeout' }],
    });
    expect(prompt).toContain('UNVERIFIED');
    expect(prompt).toContain('could not evaluate: timeout');
  });
});

describe('summarizeExecutionLog', () => {
  const log = [
    { nodeType: 'api_call' },
    { nodeType: 'tool_exec', status: 'success', action: { name: 'read_file', params: { path: 'a.js' } }, observation: 'ok' },
    { nodeType: 'tool_exec', status: 'failed', action: { name: 'run_command', params: { cmd: 'npm test' } }, observation: 'boom' },
    { nodeType: 'reflection' },
    { nodeType: 'tool_exec', status: 'success', action: { name: 'edit_file' }, observation: 'y'.repeat(500) },
  ];

  it('统计成功/总工具数（失败工具不算进展）', () => {
    const r = summarizeExecutionLog(log);
    expect(r.toolCallsSucceeded).toBe(2);
    expect(r.toolCallsTotal).toBe(3);
  });

  it('摘要含工具名/参数/状态标记，观测结果被压缩截断', () => {
    const r = summarizeExecutionLog(log, { toolObservationChars: 20 });
    expect(r.digest).toContain('[OK] read_file');
    expect(r.digest).toContain('[FAIL] run_command');
    expect(r.digest).toContain('a.js');
    expect(r.digest).not.toContain('y'.repeat(50));
  });

  it('只保留最近 N 条（最近的动作才是本轮结论的依据）', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({
      nodeType: 'tool_exec', status: 'success', action: { name: `tool${i}` }, observation: '',
    }));
    const r = summarizeExecutionLog(many, { maxToolEntries: 3 });
    expect(r.digest).toContain('tool19');
    expect(r.digest).toContain('tool17');
    expect(r.digest).not.toContain('tool16');
    expect(r.toolCallsSucceeded).toBe(20);
  });

  it('空日志给出占位文案而不是空串', () => {
    expect(summarizeExecutionLog([]).digest).toContain('no tool calls');
    expect(summarizeExecutionLog(undefined).toolCallsSucceeded).toBe(0);
  });
});

describe('evaluateGoal 结论解析', () => {
  it('met：原样透传结论/理由/缺项与 token', async () => {
    const request = fakeRequest({ content: '{"verdict":"met","reason":"实测 2.1s"}', usage: { total_tokens: 123 } });
    const r = await evaluateGoal(makeGoal(), { executionLog: [] }, { request });
    expect(r.verdict).toBe(GOAL_VERDICTS.MET);
    expect(r.reason).toBe('实测 2.1s');
    expect(r.evaluatorError).toBe(false);
    expect(r.tokensUsed).toBe(123);
    expect(r.durationMs).toBeGreaterThanOrEqual(0);
  });

  it('unmet：带上缺项列表与工具进展计数（状态机据此判停滞）', async () => {
    const request = fakeRequest({
      content: '{"verdict":"unmet","reason":"还没跑测试","missing":["npm test 未执行"]}',
      usage: { total_tokens: 200 },
    });
    const log = [
      { nodeType: 'tool_exec', status: 'success', action: { name: 'edit_file' } },
      { nodeType: 'tool_exec', status: 'failed', action: { name: 'run_command' } },
    ];
    const r = await evaluateGoal(makeGoal(), { executionLog: log }, { request });
    expect(r.verdict).toBe(GOAL_VERDICTS.UNMET);
    expect(r.missing).toEqual(['npm test 未执行']);
    expect(r.toolCallsSucceeded).toBe(1);
    expect(r.toolCallsTotal).toBe(2);
  });

  it('impossible：不折叠成 unmet（react-loop 要据它如实上报）', async () => {
    const request = fakeRequest({ content: '{"verdict":"impossible","reason":"依赖服务已下线"}' });
    const r = await evaluateGoal(makeGoal(), {}, { request });
    expect(r.verdict).toBe(GOAL_VERDICTS.IMPOSSIBLE);
    expect(isTerminalVerdict(r.verdict)).toBe(true);
    expect(isTerminalVerdict(GOAL_VERDICTS.UNMET)).toBe(false);
  });

  it('模型带 ```json 围栏也能解析', async () => {
    const request = fakeRequest({ content: '```json\n{"verdict":"met","reason":"ok"}\n```' });
    const r = await evaluateGoal(makeGoal(), {}, { request });
    expect(r.verdict).toBe(GOAL_VERDICTS.MET);
  });

  it('结论无法解析 → evaluatorError，verdict 必须为 null（绝不默认达成）', async () => {
    const request = fakeRequest({ content: '我觉得应该做完了' });
    const r = await evaluateGoal(makeGoal(), {}, { request });
    expect(r.evaluatorError).toBe(true);
    expect(r.verdict).toBeNull();
    expect(r.error).toBe('unparsable_verdict');
  });

  it('请求抛错 → evaluatorError，且不把异常折成任何结论', async () => {
    const request = vi.fn(async () => { throw new Error('network down'); });
    const r = await evaluateGoal(makeGoal(), {}, { request });
    expect(r.evaluatorError).toBe(true);
    expect(r.verdict).toBeNull();
    expect(r.error).toBe('network down');
  });

  it('AbortError 单独标注（取消不该被记成评估器故障）', async () => {
    const err = new Error('aborted');
    err.name = 'AbortError';
    const request = vi.fn(async () => { throw err; });
    const r = await evaluateGoal(makeGoal(), {}, { request });
    expect(r.error).toBe('aborted');
    expect(r.evaluatorError).toBe(true);
  });

  it('无目标时短路返回 no_goal，不发请求', async () => {
    const request = vi.fn();
    const r = await evaluateGoal(null, {}, { request });
    expect(r.error).toBe('no_goal');
    expect(request).not.toHaveBeenCalled();
  });

  it('usage 缺失时 tokensUsed 记 0，不产生 NaN', async () => {
    const request = fakeRequest({ content: '{"verdict":"met"}' });
    const r = await evaluateGoal(makeGoal(), {}, { request });
    expect(r.tokensUsed).toBe(0);
  });
});

describe('生产请求形状（默认 makeDefaultRequest）', () => {
  const config = { apiBase: 'https://api.example.com/v1', apiKey: 'sk-test', modelName: 'cfg-model' };

  function okResponse(content, usage) {
    return {
      ok: true,
      status: 200,
      data: { choices: [{ message: { content } }], usage },
    };
  }

  it('goalConfig.model 为 null 时跟随当前会话模型', async () => {
    callChatCompletion.mockResolvedValue(okResponse('{"verdict":"met"}', { total_tokens: 10 }));
    await evaluateGoal(makeGoal(), { config, model: 'session-model', sessionId: 's1', goalConfig: { model: null } });
    const body = callChatCompletion.mock.calls[0][1].body;
    expect(body.model).toBe('session-model');
    expect(body.temperature).toBe(0);
    expect(body.max_tokens).toBe(GOAL_EVALUATION_DEFAULTS.maxTokens);
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.messages[0].role).toBe('system');
    expect(body.messages[0].content).toContain('untrusted DATA');
  });

  it('会话模型缺失时回落 config.modelName', async () => {
    callChatCompletion.mockResolvedValue(okResponse('{"verdict":"met"}'));
    await evaluateGoal(makeGoal(), { config });
    expect(callChatCompletion.mock.calls[0][1].body.model).toBe('cfg-model');
  });

  it('设置页显式指定评估模型时优先使用（高级项，不是必需品）', async () => {
    callChatCompletion.mockResolvedValue(okResponse('{"verdict":"met"}'));
    await evaluateGoal(makeGoal(), { config, model: 'session-model', goalConfig: { model: 'cheap-model' } });
    expect(callChatCompletion.mock.calls[0][1].body.model).toBe('cheap-model');
  });

  it('用 usage 记账到 goal_evaluation 类目', async () => {
    callChatCompletion.mockResolvedValue(okResponse('{"verdict":"met"}', { total_tokens: 77 }));
    const r = await evaluateGoal(makeGoal(), { config, sessionId: 'sess-9' });
    expect(r.tokensUsed).toBe(77);
    expect(recordTokenUsage).toHaveBeenCalledWith(expect.objectContaining({
      sessionId: 'sess-9',
      callType: 'goal_evaluation',
      usage: { total_tokens: 77 },
    }));
  });

  it('API 非 2xx → evaluatorError（不静默当达成）', async () => {
    callChatCompletion.mockResolvedValue({ ok: false, status: 500, data: null });
    const r = await evaluateGoal(makeGoal(), { config });
    expect(r.evaluatorError).toBe(true);
    expect(r.error).toContain('500');
  });

  it('缺 apiBase/apiKey → evaluatorError missing_api_config', async () => {
    const r = await evaluateGoal(makeGoal(), { config: {} });
    expect(r.evaluatorError).toBe(true);
    expect(r.error).toBe('missing_api_config');
  });

  it('请求带超时/重试参数（内部健壮性参数，不开放 UI）', async () => {
    callChatCompletion.mockResolvedValue(okResponse('{"verdict":"met"}'));
    await evaluateGoal(makeGoal(), { config });
    const opts = callChatCompletion.mock.calls[0][1];
    expect(typeof opts.fetchImpl).toBe('function');
    opts.fetchImpl('https://x', {});
    expect(fetchWithRetry).toHaveBeenCalledWith(
      'https://x', {}, GOAL_EVALUATION_DEFAULTS.timeoutMs, GOAL_EVALUATION_DEFAULTS.maxRetries, 1000
    );
  });
});
