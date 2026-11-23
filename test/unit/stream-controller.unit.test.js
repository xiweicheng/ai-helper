// 流式 tool_calls 稀疏数组回归测试
// 背景：服务商 SSE 的 tool_calls index 可能跳号（如直接从 1 开始），StreamController.toolCalls
// 会形成稀疏数组；.map 保留空洞，经 chrome.runtime.sendMessage 的 JSON 序列化后空洞变成 null，
// 导致侧边栏 appendToolCallItems 渲染工具卡片时抛 "Cannot read properties of null (reading 'function')"
import { describe, test, expect } from 'vitest';
import { StreamController, readSSEStream, normalizeToolCalls, sendAgentStream, sendAgentStreamDone, sendStreamMessage } from '../../src/background/stream-controller.js';
import { registerKeepalivePort, unregisterKeepalivePort } from '../../src/background/state.js';

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

  // 回归：流式出口改为「有面板端口定向、无端口广播」后，默认 _sendFn 变成同步函数（返回 undefined）。
  // readSSEStream 曾在 _sendFn(...) 上链 .catch()，导致每条 tool_calls 都抛
  // "Cannot read properties of undefined (reading 'catch')" 并把整条流打断。
  test('默认出口（未注入 sendFn）时 tool_calls 流程不中断', async () => {
    const sent = [];
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (msg) => { sent.push(msg); return Promise.resolve(); };
    try {
      const controller = new StreamController('s1', { streamEnabled: true }, { callId: 'c1' });
      const sse = [
        TOOL_CALL_CHUNK(0, 'call_a', 'execute_command', '{}'),
        '',
        FINISH_TOOL_CALLS_CHUNK,
        '',
      ].join('\n');

      const result = await readSSEStream(makeStream(sse).getReader(), controller, null);
      expect(result.status).toBe('tool_calls');
      expect(sent.some(m => m.type === 'STREAM_TOOL_CALL')).toBe(true);
    } finally {
      globalThis.chrome.runtime.sendMessage = original;
    }
  });
});

describe('Agent 命令输出合流', () => {
  test('同一 execId 的连续输出合并成一条，DONE 前强制冲刷且顺序不乱', () => {
    const sent = [];
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (msg) => { sent.push(msg); return Promise.resolve(); };
    try {
      sendAgentStream('s2', 'e1', 'tc1', 'stdout', 'line-a\n');
      sendAgentStream('s2', 'e1', 'tc1', 'stdout', 'line-b\n');
      // 合流窗口未到：此刻不应有 AGENT_STREAM 消息
      expect(sent.filter(m => m.type === 'AGENT_STREAM')).toHaveLength(0);

      sendAgentStreamDone('s2', 'e1', 'tc1', 0);

      const chunks = sent.filter(m => m.type === 'AGENT_STREAM');
      expect(chunks).toHaveLength(1);
      expect(chunks[0].data).toBe('line-a\nline-b\n');
      expect(chunks[0].streamType).toBe('stdout');
      // 终态必须排在输出之后
      const doneIdx = sent.findIndex(m => m.type === 'AGENT_STREAM_DONE');
      expect(doneIdx).toBeGreaterThan(sent.indexOf(chunks[0]));
    } finally {
      globalThis.chrome.runtime.sendMessage = original;
    }
  });

  test('stdout 与 stderr 分开发送，保持前端按类型分隔着色', () => {
    const sent = [];
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (msg) => { sent.push(msg); return Promise.resolve(); };
    try {
      sendAgentStream('s3', 'e2', 'tc2', 'stdout', 'out');
      sendAgentStream('s3', 'e2', 'tc2', 'stderr', 'err');
      sendAgentStreamDone('s3', 'e2', 'tc2', 1);
      const chunks = sent.filter(m => m.type === 'AGENT_STREAM');
      expect(chunks.map(m => m.streamType).sort()).toEqual(['stderr', 'stdout']);
    } finally {
      globalThis.chrome.runtime.sendMessage = original;
    }
  });
});

// 流式出口的核心契约：有面板端口 → 只投端口不广播；无端口 → 回退广播。
// 这条路径此前没有单测覆盖（旧测试都直接注入 sendFn，绕过了默认出口）。
describe('sendStreamMessage - 端口优先、无端口回退广播', () => {
  test('会话有在线端口时只投端口，不再广播', () => {
    const portMessages = [];
    const port = { postMessage: (msg) => portMessages.push(msg) };
    const broadcast = [];
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (msg) => { broadcast.push(msg); return Promise.resolve(); };
    try {
      registerKeepalivePort('sess-port', port);
      sendStreamMessage('sess-port', { type: 'STREAM_CHUNK', sessionId: 'sess-port', content: 'x' });

      expect(portMessages).toHaveLength(1);
      expect(portMessages[0].content).toBe('x');
      expect(broadcast).toHaveLength(0);
    } finally {
      unregisterKeepalivePort('sess-port', port);
      globalThis.chrome.runtime.sendMessage = original;
    }
  });

  test('端口全部投递失败时回退广播（面板刚好关闭的竞态）', () => {
    const port = { postMessage: () => { throw new Error('port disconnected'); } };
    const broadcast = [];
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (msg) => { broadcast.push(msg); return Promise.resolve(); };
    try {
      registerKeepalivePort('sess-dead-port', port);
      sendStreamMessage('sess-dead-port', { type: 'STREAM_DONE', sessionId: 'sess-dead-port' });

      expect(broadcast).toHaveLength(1);
      expect(broadcast[0].type).toBe('STREAM_DONE');
    } finally {
      unregisterKeepalivePort('sess-dead-port', port);
      globalThis.chrome.runtime.sendMessage = original;
    }
  });

  test('没有端口时直接广播', () => {
    const broadcast = [];
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = (msg) => { broadcast.push(msg); return Promise.resolve(); };
    try {
      sendStreamMessage('sess-no-port', { type: 'STREAM_START', sessionId: 'sess-no-port' });
      expect(broadcast).toHaveLength(1);
    } finally {
      globalThis.chrome.runtime.sendMessage = original;
    }
  });
});
