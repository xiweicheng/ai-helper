// @vitest-environment jsdom
// chat-client.unit.test.js - 统一聊天补全客户端单测
//
// 背景回归：辅助调用（反思/预筛选/压缩/视觉）曾硬编码 stream:false，
// 企业网关在非流式请求上追加 stream_options 导致 stream/stream_options 不匹配报错。
// 约定：这些调用统一跟随 streamEnabled 总开关；流式时静默聚合 SSE，
// 返回与非流式同形状的 { choices, usage } 数据。
import { describe, test, expect, vi } from 'vitest';
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

  // 回归：TextDecoder 仅在 stream:true 下保留半个 UTF-8 序列的状态；
  // 中文/emoji 在 SSE 分块边界被切开时必须拼接还原，不得输出替换符污染摘要/反思 JSON
  test('多字节字符被切在两块边界仍正确解码（stream:false 旧写法会出 U+FFFD）', async () => {
    const encoded = encoder.encode('data: {"choices":[{"delta":{"content":"你好👋"}}]}\n\n');
    // 定位 👋（F0 9F 91 8B）首字节，切点落在序列中间
    const emojiStart = encoded.indexOf(0xF0);
    const split = emojiStart + 1;
    expect(encoded[emojiStart]).toBe(0xF0);
    expect(encoded[emojiStart + 1]).toBe(0x9F);
    const resp = makeSseResponse([encoded.slice(0, split), encoded.slice(split)]);
    const data = await readChatSSE(resp);
    expect(data.choices[0].message.content).toBe('你好👋');
    expect(data.choices[0].message.content).not.toContain('\uFFFD');
  });

  // 回归：网关在 SSE 流内发 event:error 时，旧逻辑当非法行吞掉→上层误归因 empty_summary
  test('SSE 内 error 事件 → 抛出含后端原因的异常而非静默返回空', async () => {
    const resp = makeSseResponse([
      'event: error\ndata: {"error":{"message":"quota exhausted"}}\n\n',
      'data: [DONE]\n\n',
    ]);
    await expect(readChatSSE(resp)).rejects.toThrow(/quota exhausted/);
  });

  // 回归：fetchWithTimeout 预算只覆盖到响应头；SSE 长连接后半路卡流必须有空闲超时兑底
  test('流中途停止推送→空闲超时抛错（不永久悬挂）', async () => {
    vi.useFakeTimers();
    try {
      const enc = new TextEncoder();
      let idx = 0;
      const chunks = [enc.encode('data: {"choices":[{"delta":{"content":"A"}}]}\n\n')];
      const resp = {
        ok: true,
        status: 200,
        headers: { get: (k) => (String(k).toLowerCase() === 'content-type' ? 'text/event-stream' : null) },
        body: {
          getReader: () => ({
            read: () => new Promise((resolve) => {
              if (idx < chunks.length) { resolve({ done: false, value: chunks[idx++] }); return; }
              // 永不 resolve：模拟网关 headers 后卡流，靠空闲超时解开
            }),
            cancel: () => {},
            releaseLock: () => {},
          }),
        },
      };
      const p = readChatSSE(resp, { idleTimeoutMs: 5000 });
      p.catch(() => {}); // 先挂 handler，禁用 timers 推进期间的 unhandled rejection
      await vi.advanceTimersByTimeAsync(5001);
      await expect(p).rejects.toThrow(/CHAT_STREAM_IDLE_TIMEOUT/);
    } finally {
      vi.useRealTimers();
    }
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

  test('HTTP 非 ok 返回 { ok:false, status, errorText }，后端错误正文不被吞（暴露真实根因）', async () => {
    const fetchImpl = async () => ({
      ok: false, status: 400,
      text: async () => '{"error":{"message":"stream_options only works when stream is enabled"}}',
    });
    const res = await callChatCompletion('https://x/v1/chat/completions', {
      headers: {}, body: {}, useStream: true, fetchImpl,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(400);
    expect(res.data).toBeNull();
    expect(res.errorText).toContain('stream_options');
  });

  test('非 ok 且 body 不可读时 errorText 容错为空串，不影响状态码返回', async () => {
    const fetchImpl = async () => ({ ok: false, status: 429 });
    const res = await callChatCompletion('https://x/v1/chat/completions', {
      headers: {}, body: {}, useStream: true, fetchImpl,
    });
    expect(res.ok).toBe(false);
    expect(res.status).toBe(429);
    expect(res.errorText).toBe('');
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
