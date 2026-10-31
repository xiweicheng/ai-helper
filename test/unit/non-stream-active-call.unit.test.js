// 简单路径（callApiNonStream）也要登记活跃 callId
//
// 现场：工具关闭（或工具开关打开但当前没有可用工具）时，后台 CALL_API 走
// callApiNonStream —— 流式照旧由 StreamController 广播，但它既不在 activeReactLoops、
// 也不在活跃 callId 注册表里。结果：面板关掉再开，QUERY_SESSION_RUNNING 什么都不报，
// reattach 无从接管，长回答期间用户只能看到空白（结果本身有后台兜底落库，不会丢）。
//
// 修法：与 ReAct 主循环同构——有 sessionId + callId 时登记，结束（含失败）后按
// callId 期望值清理，避免同会话下一次调用被上一轮迟到的 finally 误删。
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const INDEX_SRC = readFileSync(
  new URL('../../src/background/index.js', import.meta.url), 'utf8'
);

vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(async () => ({
    apiBase: 'http://127.0.0.1:1/v1',
    apiKey: 'unit-key',
    modelName: 'unit-model',
    streamConfig: { streamEnabled: false },
    reactConfig: { apiTimeout: 5000, apiRetryCount: 0, apiRetryBaseDelay: 0 },
  })),
}));

describe('callApiNonStream 登记活跃 callId', () => {
  let reg;
  let callApiNonStream;

  beforeEach(async () => {
    vi.resetModules();
    reg = await import('../../src/background/active-call-registry.js');
    reg.__resetActiveCallsForTest();
    ({ callApiNonStream } = await import('../../src/background/react-loop.js'));
  });

  afterEach(() => {
    delete global.fetch;
  });

  const jsonResponse = (content) => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({ choices: [{ message: { content } }] }),
  });

  test('调用期间可查到 callId，结束后清理干净', async () => {
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    global.fetch = vi.fn(async () => { await gate; return jsonResponse('回答'); });

    const pending = callApiNonStream(
      [{ role: 'user', content: '问题' }], 'unit-model', {}, 'sess_ns', {}, 'call_ns'
    );

    await vi.waitFor(() => expect(reg.getActiveCallId('sess_ns')).toBe('call_ns'));
    release();
    const result = await pending;

    expect(result.content).toBe('回答');
    expect(reg.getActiveCallId('sess_ns')).toBeNull();
  });

  test('失败也清理（否则会话永远显示「运行中」，reattach 反复接管死流）', async () => {
    global.fetch = vi.fn(async () => ({
      ok: false,
      status: 500,
      text: async () => 'boom',
    }));

    await expect(
      callApiNonStream([{ role: 'user', content: '问题' }], 'unit-model', {}, 'sess_err', {}, 'call_err')
    ).rejects.toThrow();

    expect(reg.getActiveCallId('sess_err')).toBeNull();
  });

  test('没有 callId 的内部调用不登记（不能污染会话的活跃状态）', async () => {
    global.fetch = vi.fn(async () => jsonResponse('ok'));

    const result = await callApiNonStream(
      [{ role: 'user', content: '问题' }], 'unit-model', {}, 'sess_inner'
    );

    expect(result.content).toBe('ok');
    expect(reg.getActiveCallId('sess_inner')).toBeNull();
  });

  test('接线：CALL_API 的非工具分支把面板 callId 透传给 callApiNonStream', () => {
    // 不透传时：既登记不了（callId 为 null），流式消息也不带 callId，镜像无从过滤。
    // 注意「无可用工具」分支早已透传 callId，所以只能断言「不存在裸调用」——
    // 若只断言「存在透传」会被那一处误绿。
    expect(INDEX_SRC).not.toMatch(/callApiNonStream\(messages, model, apiParams, sessionId\);/);
    const withCallId = INDEX_SRC.match(/callApiNonStream\(messages, model, apiParams, sessionId, \{\}, callId\)/g) || [];
    expect(withCallId.length).toBeGreaterThanOrEqual(2);
  });
});
