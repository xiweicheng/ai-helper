// 批量压缩（P1-6）回归测试：summarizeRoundsBatch 结构化模板与降级行为
import { describe, test, expect, vi } from 'vitest';
import { summarizeRoundsBatch, extractAllRounds } from '../../src/background/context-summarizer.js';

// mock fetchWithRetry（context-summarizer 的唯一外部依赖），捕获请求体并控制响应
const fetchWithRetryMock = vi.fn();
vi.mock('../../src/background/tool-executor.js', () => ({
  fetchWithRetry: (...args) => fetchWithRetryMock(...args),
}));

const config = { apiBase: 'https://api.test/v1', apiKey: 'sk-test', modelName: 'm1' };

function okResponse(content) {
  return { ok: true, json: () => Promise.resolve({ choices: [{ message: { content } }] }) };
}

const sampleMessages = [
  {
    role: 'assistant',
    content: 'I will search first',
    tool_calls: [
      { id: 'tc1', function: { name: 'web_search', arguments: JSON.stringify({ query: 'react loop best practices' }) } },
      { id: 'tc2', function: { name: 'page_content', arguments: '{}' } },
    ],
  },
  { role: 'tool', tool_call_id: 'tc1', content: 'Found 3 relevant articles about agent harness design.' },
  { role: 'tool', tool_call_id: 'tc2', content: 'Page body text...' },
  {
    role: 'assistant',
    tool_calls: [
      { id: 'tc3', function: { name: 'fetch_url', arguments: JSON.stringify({ url: 'https://example.com/a' }) } },
    ],
  },
  { role: 'tool', tool_call_id: 'tc3', content: 'Fetched content of article A' },
];

describe('summarizeRoundsBatch 批量压缩', () => {
  // 注：不在 beforeEach 中对工厂内引用的顶层 spy 做 reset/clear（vitest 4.1 在钩子存在时
  // 会将 mock 内抛出的错误误归为测试失败），改为每个用例开头自行 mockClear + 设置实现

  test('一次调用压缩多轮，prompt 使用结构化模板并携带 prior 摘要', async () => {
    fetchWithRetryMock.mockClear();
    fetchWithRetryMock.mockResolvedValue(okResponse('## Task goal\ngoal\n## Completed\ndone'));

    const result = await summarizeRoundsBatch(sampleMessages, 'Round 1: earlier work', config, 'm1');

    expect(result).toContain('## Task goal');
    expect(fetchWithRetryMock).toHaveBeenCalledTimes(1); // 批量：仅一次 LLM 调用
    const [, opts] = fetchWithRetryMock.mock.calls[0];
    const body = JSON.parse(opts.body);
    expect(body.stream).toBe(false);
    const prompt = body.messages[0].content;
    // 结构化模板四段
    for (const section of ['## Task goal', '## Completed', '## Key facts', '## Open issues']) {
      expect(prompt).toContain(section);
    }
    // transcript 覆盖两轮工具调用与 prior 摘要
    expect(prompt).toContain('[Earlier summary]');
    expect(prompt).toContain('Round 1: earlier work');
    expect(prompt).toContain('[Round 1]');
    expect(prompt).toContain('web_search');
    expect(prompt).toContain('fetch_url');
  });

  test('API 非 ok 响应 → 返回 null（调用方降级权重裁剪）', async () => {
    fetchWithRetryMock.mockClear();
    fetchWithRetryMock.mockResolvedValue({ ok: false, status: 500 });
    await expect(summarizeRoundsBatch(sampleMessages, '', config, 'm1')).resolves.toBeNull();
  });

  test('API 异常 → 返回 null 快速降级', async () => {
    fetchWithRetryMock.mockClear();
    fetchWithRetryMock.mockRejectedValue(new Error('network down'));
    await expect(summarizeRoundsBatch(sampleMessages, '', config, 'm1')).resolves.toBeNull();
  });

  test('空消息数组 → 不发起调用直接 null', async () => {
    fetchWithRetryMock.mockClear();
    await expect(summarizeRoundsBatch([], '', config, 'm1')).resolves.toBeNull();
    expect(fetchWithRetryMock).not.toHaveBeenCalled();
  });

  test('超时参数默认传入 fetchWithRetry（30s 批量压缩窗口）', async () => {
    fetchWithRetryMock.mockClear();
    fetchWithRetryMock.mockResolvedValue(okResponse('summary'));
    await summarizeRoundsBatch(sampleMessages, '', config, 'm1');
    expect(fetchWithRetryMock.mock.calls[0][2]).toBe(30000);
    // 摘要类请求只重试 1 次
    expect(fetchWithRetryMock.mock.calls[0][3]).toBe(1);
  });
});

describe('extractAllRounds 轮次提取（压缩范围计算基础）', () => {
  test('按顺序提取完整 assistant(tool_calls)+tool 轮次', () => {
    const rounds = extractAllRounds(sampleMessages);
    expect(rounds).toHaveLength(2);
    expect(rounds[0].roundMessages).toHaveLength(3); // assistant + 2 tool
    expect(rounds[0].startIdx).toBe(0);
    expect(rounds[0].endIdx).toBe(3);
    expect(rounds[1].roundMessages).toHaveLength(2);
    // slice 保留最近 N 轮语义：rounds.slice(0, len-2) 为空 → 不压缩
    expect(rounds.slice(0, Math.max(0, rounds.length - 2))).toHaveLength(0);
    expect(rounds.slice(0, Math.max(0, rounds.length - 1))).toHaveLength(1);
  });
});
