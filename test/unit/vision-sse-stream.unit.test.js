// @vitest-environment jsdom
// vision-sse-stream.unit.test.js - 视觉识别 SSE 流式解析回归测试
//
// 回归背景：图片识别 API（capture_page 的 analyze/both 模式）走流式解析时，
// 末块数据若未以换行结尾（部分网关如此），旧实现在 done 时直接丢弃 buffer
// 残行，导致内容丢失甚至识别结果为空（"image recognition API result is empty"）。
// 修复约定：done 时为残留行补一个换行，使其走下方统一的按行解析逻辑。
//
// 覆盖：标准多块拼接、跨块行拼接、无尾换行残行、[DONE] 跳过、非法行容错、
// 多格式兼容（delta/message/text）、实时推送、abort 中断。
import { describe, test, expect, beforeAll, vi } from 'vitest';

const noop = () => {};
const sentMessages = [];

// chrome mock：与 clarify-routing.unit.test.js 同款最小集，
// 保证 tool-executor.js 在 node 测试环境下可安全加载
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg) => {
      sentMessages.push(msg);
      return Promise.resolve({});
    },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: () => Promise.resolve([{ contextType: 'SIDE_PANEL' }]),
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

let readVisionSSEStream;

beforeAll(async () => {
  const te = await import('../../src/background/tool-executor.js');
  readVisionSSEStream = te.readVisionSSEStream;
  expect(typeof readVisionSSEStream).toBe('function');
});

const encoder = new TextEncoder();

/** 构造仅含 body.getReader() 的最小 Response 替身，按块依次吐出 */
function makeSseResponse(chunks) {
  const encoded = chunks.map((c) => (typeof c === 'string' ? encoder.encode(c) : c));
  let idx = 0;
  return {
    body: {
      getReader: () => ({
        read: async () => (idx < encoded.length ? { done: false, value: encoded[idx++] } : { done: true, value: undefined }),
        releaseLock: noop,
      }),
    },
  };
}

/** 构造标准 OpenAI 兼容 SSE 数据块（delta.content 格式，含结尾空行） */
function deltaChunk(text) {
  return `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`;
}

/** 构造无尾换行的单行数据块（模拟不规范网关的末块） */
function tailChunk(obj) {
  return `data: ${JSON.stringify(obj)}`;
}

describe('readVisionSSEStream 流式解析', () => {
  test('标准 SSE（空行结尾）：多块内容完整拼接，[DONE] 跳过', async () => {
    const stream = makeSseResponse([deltaChunk('你好'), deltaChunk('，世界'), 'data: [DONE]\n\n']);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('你好，世界');
  });

  test('同一行数据跨 chunk 到达：buffer 拼接后正确解析', async () => {
    const line = deltaChunk('跨块内容');
    const mid = Math.floor(line.length / 2);
    const stream = makeSseResponse([line.slice(0, mid), line.slice(mid)]);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('跨块内容');
  });

  test('末块无换行结尾（网关不规范）：残行内容不丢失', async () => {
    const stream = makeSseResponse([tailChunk({ choices: [{ delta: { content: '最后一行内容' } }] })]);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('最后一行内容');
  });

  test('正常块之后紧跟无尾换行末块：全部内容完整', async () => {
    const stream = makeSseResponse([
      deltaChunk('前部'),
      tailChunk({ choices: [{ delta: { content: '尾部' } }] }),
    ]);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('前部尾部');
  });

  test('无尾换行的 [DONE] 不视为内容也不报错', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stream = makeSseResponse(['data: [DONE]']);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('');
    expect(warnSpy).not.toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('非法 JSON 行跳过并告警，不影响后续内容', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const stream = makeSseResponse(['data: {not-json\n\n', deltaChunk('后续内容')]);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('后续内容');
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  test('兼容 message.content 与 text 字段格式', async () => {
    const a = `data: ${JSON.stringify({ choices: [{ message: { content: 'A' } }] })}\n\n`;
    const b = `data: ${JSON.stringify({ choices: [{ text: 'B' }] })}\n\n`;
    const result = await readVisionSSEStream(makeSseResponse([a, b]), null, null);
    expect(result).toBe('AB');
  });

  test('choices 为空的最终块不产出内容', async () => {
    const stream = makeSseResponse(['data: {"choices":[]}\n\n', 'data: [DONE]\n\n']);
    const result = await readVisionSSEStream(stream, null, null);
    expect(result).toBe('');
  });

  test('传入 sessionId 时逐块推送 VISION_ANALYSIS_CHUNK', async () => {
    sentMessages.length = 0;
    const stream = makeSseResponse([deltaChunk('推'), deltaChunk('送')]);
    const result = await readVisionSSEStream(stream, null, 'sess-vision');
    expect(result).toBe('推送');
    const pushes = sentMessages.filter((m) => m.type === 'VISION_ANALYSIS_CHUNK');
    expect(pushes.map((m) => m.delta)).toEqual(['推', '送']);
    expect(pushes.every((m) => m.sessionId === 'sess-vision')).toBe(true);
  });

  test('abortController 中止读流：以 AbortError 拒绝并释放锁', async () => {
    const ac = new AbortController();
    // read 永久挂起，模拟连接未关闭但无数据（此时 abort 是唯一退出路径）
    const stream = {
      body: {
        getReader: () => ({
          read: () => new Promise(() => {}),
          releaseLock: noop,
        }),
      },
    };
    const p = readVisionSSEStream(stream, ac, null);
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});
