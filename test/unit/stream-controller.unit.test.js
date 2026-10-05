// 流式 tool_calls 稀疏数组回归测试
// 背景：服务商 SSE 的 tool_calls index 可能跳号（如直接从 1 开始），StreamController.toolCalls
// 会形成稀疏数组；.map 保留空洞，经 chrome.runtime.sendMessage 的 JSON 序列化后空洞变成 null，
// 导致侧边栏 appendToolCallItems 渲染工具卡片时抛 "Cannot read properties of null (reading 'function')"
import { describe, test, expect } from 'vitest';
import { StreamController, readSSEStream, normalizeToolCalls } from '../../src/background/stream-controller.js';

const TOOL_CALL_CHUNK = (idx, id, name, args) =>
  `data: ${JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: idx, id, type: 'function', function: { name, arguments: args } }] } }] })}`;

const FINISH_TOOL_CALLS_CHUNK = 'data: {"choices":[{"delta":{},"finish_reason":"tool_calls"}]}';

function makeController(sent) {
  return new StreamController('s1', { streamEnabled: true }, {
    callId: 'c1',
    sendFn: (msg) => { sent.push(msg); return Promise.resolve(); },
  });
}

function makeStream(sseText) {
  const bytes = new TextEncoder().encode(sseText);
  return new ReadableStream({
    start(c) { c.enqueue(bytes); c.close(); },
  });
}

describe('stream-controller tool_calls 稀疏数组防御', () => {
  test('normalizeToolCalls 过滤空洞与 null/undefined 元素并补齐 id', () => {
    const sparse = [];
    sparse[1] = { id: 'call_b', type: 'function', function: { name: 'agent_file', arguments: '{}' } };
    const normalized = normalizeToolCalls(sparse);
    expect(normalized).toHaveLength(1);
    expect(normalized[0].function.name).toBe('agent_file');

    const withNulls = normalizeToolCalls([null, undefined, { id: '', function: { name: 'x', arguments: '' } }]);
    expect(withNulls).toHaveLength(1);
    expect(withNulls[0].id).toMatch(/^tc_fb_/);

    // 模拟消息 JSON 序列化往返后保持稠密（无 null）
    expect(JSON.parse(JSON.stringify(normalized)).every(tc => tc && typeof tc === 'object')).toBe(true);
    // 非数组输入兜底
    expect(normalizeToolCalls(null)).toEqual([]);
  });

  test('index 跳号（从 1 开始）时 STREAM_TOOL_CALL 消息不含 null 空洞', async () => {
    const sent = [];
    const controller = makeController(sent);
    const sse = [
      TOOL_CALL_CHUNK(1, 'call_b', 'agent_file', '{}'),
      '',
      FINISH_TOOL_CALLS_CHUNK,
      '',
      'data: [DONE]',
      '',
    ].join('\n');

    const result = await readSSEStream(makeStream(sse).getReader(), controller, null);
    expect(result.status).toBe('tool_calls');

    const toolCallMsg = sent.find(m => m.type === 'STREAM_TOOL_CALL');
    expect(toolCallMsg).toBeTruthy();

    // 模拟 chrome.runtime.sendMessage 的 JSON 序列化往返后仍无 null（修复前空洞会变成 null）
    const roundTrip = JSON.parse(JSON.stringify(toolCallMsg.toolCalls));
    expect(roundTrip).toHaveLength(1);
    expect(roundTrip.every(tc => tc && typeof tc === 'object')).toBe(true);
    expect(roundTrip[0].function.name).toBe('agent_file');

    // getResult 返回值同样稠密（react-loop 依赖它构造 API 的 assistant tool_calls）
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls.every(tc => tc && typeof tc === 'object')).toBe(true);
  });

  test('正常连续 index（0、1）不受影响且顺序保留', async () => {
    const sent = [];
    const controller = makeController(sent);
    const sse = [
      TOOL_CALL_CHUNK(0, 'call_a', 'execute_command', '{"command":"ls"}'),
      '',
      TOOL_CALL_CHUNK(1, 'call_b', 'agent_file', '{"file_path":"a.txt"}'),
      '',
      FINISH_TOOL_CALLS_CHUNK,
      '',
    ].join('\n');

    const result = await readSSEStream(makeStream(sse).getReader(), controller, null);
    expect(result.status).toBe('tool_calls');
    expect(result.toolCalls.map(tc => tc.function.name)).toEqual(['execute_command', 'agent_file']);

    const toolCallMsg = sent.find(m => m.type === 'STREAM_TOOL_CALL');
    expect(toolCallMsg.toolCalls).toHaveLength(2);
  });
});
