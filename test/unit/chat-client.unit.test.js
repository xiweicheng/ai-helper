// @vitest-environment jsdom
// chat-client.unit.test.js - 统一聊天补全客户端单测
//
// 背景回归：辅助调用（反思/预筛选/压缩/视觉）曾硬编码 stream:false，
// 企业网关在非流式请求上追加 stream_options 导致 stream/stream_options 不匹配报错。
// 约定：这些调用统一跟随 streamEnabled 总开关；流式时静默聚合 SSE，
// 返回与非流式同形状的 { choices, usage } 数据。
import { describe, test, expect } from 'vitest';
import {
  resolveUseStream,
  readStreamEnabledFromStorage,
  applyStreamToBody,
  readChatSSE,
  callChatCompletion,
} from '../../src/shared/chat-client.js';

const encoder = new TextEncoder();

/** 构造 SSE Response 替身：按块吐出，带 event-stream Content-Type */
function makeSseResponse(chunks) {
  const encoded = chunks.map((c) => (typeof c === 'string' ? encoder.encode(c) : c));
  let idx = 0;
  return {
    ok: true,
    status: 200,
    headers: { get: (k) => (k.toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
    body: {
      getReader: () => ({
        read: async () => (idx < encoded.length
          ? { done: false, value: encoded[idx++] }
          : { done: true, value: undefined }),
        releaseLock: () => {},
      }),
    },
  };
}

describe('resolveUseStream', () => {
  test('未设置视为开启（与全局默认一致）', () => {
    expect(resolveUseStream(undefined)).toBe(true);
    expect(resolveUseStream({})).toBe(true);
    expect(resolveUseStream({ streamConfig: {} })).toBe(true);
  });
  test('streamConfig.streamEnabled 优先于裸 streamEnabled', () => {
    expect(resolveUseStream({ streamConfig: { streamEnabled: false }, streamEnabled: true })).toBe(false);
    expect(resolveUseStream({ streamConfig: { streamEnabled: true }, streamEnabled: false })).toBe(true);
  });
  test('裸配置 streamEnabled:false 关闭', () => {
    expect(resolveUseStream({ streamEnabled: false })).toBe(false);
  });
});

describe('readStreamEnabledFromStorage', () => {
  test('chrome 不可用时回落开启', async () => {
    const saved = globalThis.chrome;
    globalThis.chrome = undefined;
    expect(await readStreamEnabledFromStorage()).toBe(true);
    globalThis.chrome = saved;
  });
});

describe('applyStreamToBody', () => {
  test('流式：补 stream 与 stream_options.include_usage，不修改入参', () => {
    const body = { model: 'm', messages: [] };
    const out = applyStreamToBody(body, true);
    expect(out.stream).toBe(true);
    expect(out.stream_options).toEqual({ include_usage: true });
    expect(body.stream).toBeUndefined();
  });
  test('非流式：显式 stream:false 且移除 stream_options', () => {
    const out = applyStreamToBody({ model: 'm', stream: false, stream_options: { include_usage: true } }, false);
    expect(out.stream).toBe(false);
    expect(out.stream_options).toBeUndefined();
  });
});

describe('readChatSSE', () => {
  test('多块 delta 拼接 + 最终 usage 独立 chunk 提取', async () => {
    const resp = makeSseResponse([
      'data: {"choices":[{"delta":{"content":"你好"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"，世界"}}]}\n\n',
      'data: {"choices":[],"usage":{"total_tokens":7}}\n\n',
      'data: [DONE]\n\n',
    ]);
    const data = await readChatSSE(resp);
    expect(data.choices[0].message.content).toBe('你好，世界');
    expect(data.usage).toEqual({ total_tokens: 7 });
  });

  test('无尾换行的残行不丢失（done 时补换行）', async () => {
    const resp = makeSseResponse([
      'data: {"choices":[{"delta":{"content":"A"}}]}\n\n',
      'data: {"choices":[{"delta":{"content":"B"}}]}',
    ]);
    const data = await readChatSSE(resp);
    expect(data.choices[0].message.content).toBe('AB');
  });

  test('非法行容错，跨块行拼接', async () => {
    const resp = makeSseResponse([
      'data: not-json\n',
      'data: {"choices":[{"del',
      'ta":{"content":"拼"}}]}\n\n',
      '\n',
    ]);
    const data = await readChatSSE(resp);
    expect(data.choices[0].message.content).toBe('拼');
    expect(data.usage).toBeNull();
  });
});

describe('callChatCompletion', () => {
  test('流式：请求体带 stream+stream_options，SSE 聚合为 OpenAI 形状', async () => {
    let sentBody;
    const fetchImpl = async (url, init) => {
      sentBody = JSON.parse(init.body);
      return makeSseResponse(['data: {"choices":[{"delta":{"content":"ok"}}]}\ndata: [DONE]\n']);
    };
    const res = await callChatCompletion('https://x/v1/chat/completions', {
      headers: { 'Content-Type': 'application/json' },
      body: { model: 'm', messages: [{ role: 'user', content: 'hi' }] },
      useStream: true,
      fetchImpl,
    });
    expect(sentBody.stream).toBe(true);
    expect(sentBody.stream_options).toEqual({ include_usage: true });
    expect(res.ok).toBe(true);
    expect(res.data.choices[0].message.content).toBe('ok');
  });

  test('非流式：请求体 stream:false 且无 stream_options，走 JSON 解析', async () => {
    let sentBody;
    const fetchImpl = async (url, init) => {
      sentBody = JSON.parse(init.body);
      return {
        ok: true,
        status: 200,
        json: async () => ({ choices: [{ message: { content: 'plain' } }], usage: { total_tokens: 3 } }),
      };
    };
    const res = await callChatCompletion('https://x/v1/chat/completions', {
      headers: {},
      body: { model: 'm', messages: [], stream: false },
      useStream: false,
      fetchImpl,
    });
    expect(sentBody.stream).toBe(false);
    expect(sentBody.stream_options).toBeUndefined();
    expect(res.data.choices[0].message.content).toBe('plain');
    expect(res.data.usage).toEqual({ total_tokens: 3 });
  });

  test('请求流式但网关返回 JSON（忽略 stream）时回落 JSON 解析不报错', async () => {
    const fetchImpl = async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'application/json' },
      body: {},
      json: async () => ({ choices: [{ message: { content: 'ignored-stream' } }] }),
    });
    const res = await callChatCompletion('https://x/v1/chat/completions', {
      headers: {}, body: { messages: [] }, useStream: true, fetchImpl,
    });
    expect(res.ok).toBe(true);
    expect(res.data.choices[0].message.content).toBe('ignored-stream');
  });

  test('HTTP 非 ok 返回 { ok:false, status }，不解析 body', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429 });
    const res = await callChatCompletion('https://x/v1/chat/completions', {
      headers: {}, body: {}, useStream: true, fetchImpl,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.data).toBeNull();
  });

  test('fetchImpl 透传 signal（取消语义保留）', async () => {
    const controller = new AbortController();
    let seenSignal;
    const fetchImpl = async (url, init) => {
      seenSignal = init.signal;
      return { ok: true, status: 200, json: async () => ({ choices: [] }) };
    };
    await callChatCompletion('https://x/v1/chat/completions', {
      headers: {}, body: {}, useStream: false, signal: controller.signal, fetchImpl,
    });
    expect(seenSignal).toBe(controller.signal);
  });
});
