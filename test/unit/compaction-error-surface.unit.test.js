// compaction-error-surface.unit.test.js - 压缩/摘要链路失败原因上屏回归
//
// 回归背景（044432f "暴露后端真实原因"的完整性欠账）：
// 1. callChatCompletion 曾对非 2xx 直接丢弃响应体——网关的 stream/stream_options
//    报错正文恰恰只在 4xx body 里，toast 只剩裸状态码，根因仍拿不到；
// 2. 流式改造后 SSE body 读取无空闲超时（fetchWithTimeout 预算只覆盖到响应头），
//    网关 headers 后卡流 → 手动压缩永久停在 loading。
// 约定：error 携带后端 errorText；流卡死抛 CHAT_STREAM_IDLE_TIMEOUT 错误码。
import { describe, it, expect, beforeEach, vi } from 'vitest';

const noop = () => {};
globalThis.chrome = {
  storage: {
    local: { get: (keys, cb) => { if (typeof cb === 'function') { cb({}); return; } return Promise.resolve({}); }, set: noop },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    id: 'test-ext',
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
    onMessage: { addListener: noop },
  },
};

vi.mock('../../src/background/tool-executor.js', () => ({
  fetchWithRetry: (url, options, timeoutMs, retryCount, baseDelay) => fetch(url, options),
}));
vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => Promise.resolve({ customModelMap: {} })),
}));
vi.mock('../../src/background/token-recorder.js', () => ({
  recordTokenUsage: vi.fn(() => Promise.resolve()),
}));

const { generateCompactionSummary } = await import('../../src/background/context-compactor.js');
const { getStoredConfig } = await import('../../src/background/config.js');

const material = [{ role: 'user', content: 'hi' }, { role: 'assistant', content: 'hello' }];

beforeEach(() => {
  getStoredConfig.mockResolvedValue({ apiBase: 'https://gw.example/v1', apiKey: 'k', modelName: 'm' });
  vi.unstubAllGlobals();
});

describe('压缩失败原因上屏', () => {
  it('非 2xx：error 携带网关响应正文（而非仅状态码）', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: false,
      status: 400,
      headers: { get: () => 'application/json' },
      text: async () => '{"error":{"message":"stream_options requires stream:true"}}',
    })));
    const r = await generateCompactionSummary({ material });
    expect(r.success).toBe(false);
    expect(r.error).toContain('http_400');
    expect(r.error).toContain('stream_options requires stream:true');
  });

  it('流式聚合空闲超时：error 含 CHAT_STREAM_IDLE_TIMEOUT 供 UI 映射超时文案', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: () => new Promise(() => {}), // headers 后永久卡流
          cancel: noop,
          releaseLock: noop,
        }),
      },
    })));
    vi.useFakeTimers();
    try {
      const p = generateCompactionSummary({ material });
      p.catch(() => {});
      await vi.advanceTimersByTimeAsync(130000); // 越过默认 120s 空闲预算
      const r = await p;
      expect(r.success).toBe(false);
      expect(r.error).toContain('CHAT_STREAM_IDLE_TIMEOUT');
    } finally {
      vi.useRealTimers();
    }
  });

  it('SSE 内 error 事件不再被吞成 empty_summary，error 带后端原因', async () => {
    const enc = new TextEncoder();
    const sse = 'event: error\ndata: {"error":{"message":"model capacity exhausted"}}\n\n';
    let sent = false;
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      status: 200,
      headers: { get: () => 'text/event-stream' },
      body: {
        getReader: () => ({
          read: async () => (sent ? { done: true } : ((sent = true), { done: false, value: enc.encode(sse) })),
          cancel: noop,
          releaseLock: noop,
        }),
      },
    })));
    const r = await generateCompactionSummary({ material });
    expect(r.success).toBe(false);
    expect(r.error).toContain('model capacity exhausted');
    expect(r.error).not.toBe('empty_summary');
  });
});
