// 反思机制优化守卫：
// 1) 评估调用不再要求模型输出完整修订答案（refinedAnswer），低分时才发起独立修订调用
// 2) 超时/重试来自代码内默认常量（不开放 UI 配置），旧 storage 残缺配置需回落默认值
// 3) 修订失败降级为不修订而非整条反思失败；失败条目 overallScore 显式为 null
// 4) 执行日志面板头部得分块对空分数有判空守卫（修复 undefined/10）
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';

const fetchWithRetry = vi.fn();
vi.mock('../../src/background/tool-executor.js', () => ({
  fetchWithRetry: (...args) => fetchWithRetry(...args),
}));
vi.mock('../../src/background/token-recorder.js', () => ({
  recordTokenUsage: vi.fn(() => Promise.resolve()),
}));

const {
  reflectOnResult,
  buildReflectionPrompt,
  buildRevisionPrompt,
  parseReflectionResult,
  REFLECTION_FETCH_DEFAULTS,
} = await import('../../src/background/react-reflection.js');

const { DEFAULT_REFLECTION_CONFIG } = await import('../../src/background/constants.js');

function jsonResponse(score) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(score) } }],
    }),
  };
}

const evaluationJson = {
  overallScore: 8,
  dimensions: { completeness: 8, accuracy: 8 },
  issues: [],
  suggestions: [],
};

const revisionJson = { refinedAnswer: 'REVISED' };

function fullPostConfig(overrides = {}) {
  return Object.assign({
    enabled: true,
    maxRounds: 1,
    qualityThreshold: 7,
    refineThreshold: 5,
    model: null,
    temperature: 0.3,
    maxTokens: 2048,
    timeoutMs: 90000,
    reviseTimeoutMs: 120000,
    maxRetries: 2,
  }, overrides);
}

function reflectionConfig(postOverrides = {}) {
  return { enabled: true, postReflection: fullPostConfig(postOverrides) };
}

const baseMessages = [{ role: 'user', content: '问题' }];
const baseLog = [];

let calls;
beforeEach(() => {
  fetchWithRetry.mockReset();
  fetchWithRetry.mockImplementation(async (url, options) => {
    calls.push(JSON.parse(options.body));
    if (calls.length === 1) return jsonResponse(evaluationJson);
    return jsonResponse(revisionJson);
  });
});

describe('评估/修订拆分', () => {
  test('高分通过：只发起一次评估调用，不发起修订调用', async () => {
    calls = [];
    const result = await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      reflectionConfig(), null, () => {}, {}, null, 's1',
    );
    expect(calls.length).toBe(1);
    expect(result.status).toBe('passed');
    expect(result.content).toBe('ANSWER');
    expect(result.overallScore).toBe(8);
    expect(result.reflectionLog[0].overallScore).toBe(8);
  });

  test('评估请求的 prompt 不再要求模型输出 refinedAnswer', async () => {
    calls = [];
    await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      reflectionConfig(), null, () => {}, {}, null, 's1',
    );
    const userPrompt = calls[0].messages.find(m => m.role === 'user').content;
    expect(userPrompt).not.toContain('refinedAnswer');
  });

  test('低分（>=refineThreshold 且 <qualityThreshold）：第二次调用为修订请求并采用修订答案', async () => {
    calls = [];
    fetchWithRetry.mockImplementation(async (url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) {
        return jsonResponse({ ...evaluationJson, overallScore: 6 });
      }
      return jsonResponse(revisionJson);
    });
    const result = await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      reflectionConfig(), null, () => {}, {}, null, 's1',
    );
    expect(calls.length).toBe(2);
    expect(result.status).toBe('revised');
    expect(result.content).toBe('REVISED');
    expect(result.wasRevised).toBe(true);
    // 修订请求 prompt 应包含原答案与评估问题点，且要求输出完整修订答案
    const revisePrompt = calls[1].messages.find(m => m.role === 'user').content;
    expect(revisePrompt).toContain('ANSWER');
    expect(revisePrompt).toContain('refinedAnswer');
  });

  test('buildRevisionPrompt 包含原答案与 issues', () => {
    const prompt = buildRevisionPrompt(
      baseMessages, 'ORIGINAL_ANSWER',
      { issues: ['缺少示例'], suggestions: ['补充说明'] }, baseLog,
    );
    expect(prompt).toContain('ORIGINAL_ANSWER');
    expect(prompt).toContain('缺少示例');
  });

  test('修订调用失败：降级为 needs_improvement 保留原答案，整条反思不算失败', async () => {
    calls = [];
    fetchWithRetry.mockImplementation(async (url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) {
        return jsonResponse({ ...evaluationJson, overallScore: 6 });
      }
      throw new Error('请求超时 (120000ms)');
    });
    const result = await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      reflectionConfig(), null, () => {}, {}, null, 's1',
    );
    expect(result.status).toBe('needs_improvement');
    expect(result.content).toBe('ANSWER');
    expect(result.overallScore).toBe(6);
    // 时间序：修订子节点（failed）在前，主评估条目仍为 success
    expect(result.reflectionLog[0].reflectionType).toBe('revise');
    expect(result.reflectionLog[0].status).toBe('failed');
    const postEntry = result.reflectionLog.find(e => e.reflectionType === 'post');
    expect(postEntry.status).toBe('success');
    expect(postEntry.overallScore).toBe(6);
  });
});

describe('超时与重试（代码默认值，旧配置残缺时回落）', () => {
  test('评估与修订使用各自默认超时，重试次数取默认 2', async () => {
    calls = [];
    fetchWithRetry.mockImplementation(async (url, options) => {
      calls.push(JSON.parse(options.body));
      if (calls.length === 1) return jsonResponse({ ...evaluationJson, overallScore: 6 });
      return jsonResponse(revisionJson);
    });
    // 旧 storage 配置：没有 timeoutMs/reviseTimeoutMs/maxRetries 字段
    const legacy = {
      enabled: true,
      postReflection: {
        enabled: true, maxRounds: 1, qualityThreshold: 7, refineThreshold: 5,
        model: null, temperature: 0.3, maxTokens: 2048,
      },
    };
    await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      legacy, null, () => {}, {}, null, 's1',
    );
    expect(fetchWithRetry.mock.calls[0][2]).toBe(REFLECTION_FETCH_DEFAULTS.timeoutMs);
    expect(fetchWithRetry.mock.calls[0][3]).toBe(REFLECTION_FETCH_DEFAULTS.maxRetries);
    expect(fetchWithRetry.mock.calls[1][2]).toBe(REFLECTION_FETCH_DEFAULTS.reviseTimeoutMs);
    expect(REFLECTION_FETCH_DEFAULTS.timeoutMs).toBeGreaterThanOrEqual(60000);
    expect(REFLECTION_FETCH_DEFAULTS.reviseTimeoutMs).toBeGreaterThanOrEqual(90000);
  });

  test('显式配置 timeoutMs/maxRetries 时优先生效', async () => {
    calls = [];
    await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      reflectionConfig({ timeoutMs: 45000, maxRetries: 3 }), null, () => {}, {}, null, 's1',
    );
    expect(fetchWithRetry.mock.calls[0][2]).toBe(45000);
    expect(fetchWithRetry.mock.calls[0][3]).toBe(3);
  });

  test('默认常量已写入 DEFAULT_REFLECTION_CONFIG.postReflection', () => {
    expect(DEFAULT_REFLECTION_CONFIG.postReflection.timeoutMs).toBeDefined();
    expect(DEFAULT_REFLECTION_CONFIG.postReflection.reviseTimeoutMs).toBeDefined();
    expect(DEFAULT_REFLECTION_CONFIG.postReflection.maxRetries).toBeDefined();
  });
});

describe('失败条目与解析', () => {
  test('评估调用抛错：failed 条目 overallScore 显式为 null', async () => {
    calls = [];
    fetchWithRetry.mockRejectedValue(new Error('请求超时 (90000ms)'));
    const result = await reflectOnResult(
      baseMessages, 'ANSWER', baseLog, 'm1', { apiBase: 'http://x', apiKey: 'k' },
      reflectionConfig(), null, () => {}, {}, null, 's1',
    );
    expect(result.status).toBe('reflection_failed');
    expect(result.reflectionLog[0].status).toBe('failed');
    expect(result.reflectionLog[0].overallScore).toBeNull();
  });

  test('parseReflectionResult 兼容字符串数字分数', () => {
    const parsed = parseReflectionResult('{"overallScore":"9","issues":[],"suggestions":[]}');
    expect(parsed.overallScore).toBe(9);
  });
});

describe('面板得分守卫', () => {
  test('chat-panels 头部得分渲染对空分数有判空', () => {
    const src = readFileSync(
      new URL('../../src/side_panel/chat-panels.js', import.meta.url), 'utf8',
    );
    const start = src.indexOf('<div class="combo-stat reflection"');
    expect(start).toBeGreaterThan(-1);
    const scoreBlock = src.slice(start, start + 600);
    expect(scoreBlock).toMatch(/overallScore\s*[!=]==?\s*(null|undefined)|postScoreText|overallScore\s*\?\?/);
    expect(src).not.toMatch(/stat-value">\$\{postReflection\.overallScore\}\/10/);
  });
});
