// tool-read-document-image.unit.test.js - read_document_image 内置工具（文档图片按需深读）
// 结果契约按仓库 makeResult/normalizeToolResult 实际 { success, content } 断言
import { describe, it, expect, beforeEach, vi } from 'vitest';

const noop = () => {};

// 快照数据：agent 来源（path）/ local 有效（dataUrl）/ local 失效（两者皆无）
const snapshots = {
  s1: {
    updatedAt: 1,
    files: [
      { name: 'a.docx', imageSource: 'agent', images: [{ index: 1, page: null, path: '/ws/_attachments/a/img-1.png' }] },
      { name: 'b.pdf', imageSource: 'local', images: [{ index: 1, page: 2, dataUrl: 'data:image/png;base64,AAA' }] },
      { name: 'c.pdf', imageSource: 'local', images: [{ index: 1, page: 2 }] },
    ],
  },
};

// 视觉配置可切换：有 apiBase / 完全未配置
let visionCfg = { apiBase: 'https://v.example/v1', apiKey: 'KEY', modelName: 'vision-m' };
const useConfiguredVision = () => { visionCfg = { apiBase: 'https://v.example/v1', apiKey: 'KEY', modelName: 'vision-m' }; };
const useUnconfiguredVision = () => { visionCfg = {}; };

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { _docImageSnapshot: snapshots, ...visionCfg };
        if (typeof cb === 'function') { cb(result); return; }
        return Promise.resolve(result);
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
    sendMessage: (msg, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop },
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, captureVisibleTab: noop, onUpdated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  notifications: { create: noop },
};

vi.mock('../../src/background/local-agent-client.js', () => ({
  execCommand: vi.fn(),
  execCommandWait: vi.fn(),
  createExecWebSocket: vi.fn(),
  stopCommand: vi.fn(),
  isAgentPaired: vi.fn(() => Promise.resolve(false)),
  writeFile: vi.fn(),
  downloadFile: vi.fn(async () => ({ success: true, content: 'QUFB', mimeType: 'image/png' })),
}));

vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => Promise.resolve({ customModelMap: {} })),
}));

vi.mock('../../src/background/stream-controller.js', () => ({
  sendAgentStream: vi.fn(),
  sendAgentStreamDone: vi.fn(),
}));

// 深读请求响应体（视觉模型返回文本）
const VISION_TEXT = '图中表格显示 Q3 营收 180 万';
const fetchMock = vi.fn(async (url) => ({
  ok: true,
  json: async () => ({ choices: [{ message: { content: VISION_TEXT } }] }),
}));
vi.stubGlobal('fetch', fetchMock);

// 压缩在纯 Node 环境无 createImageBitmap → 内部 try/catch 返 null → handler 回退原图
const { executeTool } = await import('../../src/background/tool-executor.js');

const call = (args) => executeTool({ name: 'read_document_image', arguments: JSON.stringify(args), id: 't1' }, null, 's1');

// 取视觉 API 请求（排除 compress 内部对 dataUrl 的 fetch）
const visionCall = () => fetchMock.mock.calls.find(([u]) => String(u).includes('/chat/completions'));
const visionReqBody = () => JSON.parse(visionCall()[1].body);
const visionReqHeaders = () => visionCall()[1].headers;

beforeEach(() => {
  useConfiguredVision();
  fetchMock.mockClear();
});

describe('read_document_image', () => {
  it('local 来源：直读快照 dataUrl → 视觉深读 → 返回文本', async () => {
    const r = await call({ file: 'b.pdf', image: 1, question: '图里的表格数值是多少' });
    expect(r.success).toBe(true);
    expect(r.content).toContain('180 万');
    const body = visionReqBody();
    expect(body.messages[0].content[0].text).toContain('图里的表格数值是多少');
    // 图片部分透传快照 dataUrl
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/png;base64,AAA');
  });

  it('无 question 时使用全量深读提示', async () => {
    const r = await call({ file: 'b.pdf', image: 1 });
    expect(r.success).toBe(true);
    const body = visionReqBody();
    expect(body.messages[0].content[0].text).toContain('转录');
  });

  it('agent 来源：走 downloadFile 现拉取图', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    const r = await call({ file: 'a.docx', image: 1 });
    expect(dl.downloadFile).toHaveBeenCalledWith('/ws/_attachments/a/img-1.png');
    expect(r.success).toBe(true);
    expect(r.content).toContain('180 万');
  });

  it('file 不在会话附件 → 错误文案含文件名与可用附件', async () => {
    const r = await call({ file: 'zzz.docx', image: 1 });
    expect(r.success).toBe(false);
    expect(r.content).toContain('zzz.docx');
    expect(visionCall()).toBeUndefined();
  });

  it('序号越界 → 含总数提示', async () => {
    const r = await call({ file: 'b.pdf', image: 9 });
    expect(r.success).toBe(false);
    expect(r.content).toMatch(/共 1 张/);
  });

  it('local 快照无 dataUrl（失效）→ 请重新附加', async () => {
    const r = await call({ file: 'c.pdf', image: 1 });
    expect(r.success).toBe(false);
    expect(r.content).toContain('重新附加');
  });

  it('视觉 API 未配置 → 明确错误且不调 fetch', async () => {
    useUnconfiguredVision();
    const r = await call({ file: 'b.pdf', image: 1 });
    expect(r.success).toBe(false);
    expect(r.content).toContain('图片识别');
    expect(visionCall()).toBeUndefined();
  });

  it('无 apiKey 仍可调本地无鉴权视觉服务（同转述链路口径）', async () => {
    visionCfg = { apiBase: 'http://127.0.0.1:11434/v1', modelName: 'llava' };
    const r = await call({ file: 'b.pdf', image: 1 });
    expect(r.success).toBe(true);
    const headers = visionReqHeaders();
    expect(headers.Authorization).toBeUndefined();
  });
});
