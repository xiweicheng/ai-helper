// tool-read-document-image.unit.test.js - read_image 通用图片深读工具（文档附件 + 代理端任意路径）
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

// 合法 PNG 字节（magic header + 尺寸头最小体）的 base64：path 来源经扩展侧 magic bytes 硬校验后才会送视觉
const PNG_B64 = b64Png();
function b64Png() {
  const head = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const rest = new Array(28).fill(0);
  const bytes = Uint8Array.from([...head, ...rest]);
  let bin = '';
  bytes.forEach((x) => { bin += String.fromCharCode(x); });
  return btoa(bin);
}

vi.mock('../../src/background/local-agent-client.js', () => ({
  execCommand: vi.fn(),
  execCommandWait: vi.fn(),
  createExecWebSocket: vi.fn(),
  stopCommand: vi.fn(),
  isAgentPaired: vi.fn(() => Promise.resolve(false)),
  writeFile: vi.fn(),
  downloadFile: vi.fn(async () => ({ success: true, content: PNG_B64, mimeType: 'image/png' })),
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

const call = (args) => executeTool({ name: 'read_image', arguments: JSON.stringify(args), id: 't1' }, null, 's1');

// 取视觉 API 请求（排除 compress 内部对 dataUrl 的 fetch）
const visionCall = () => fetchMock.mock.calls.find(([u]) => String(u).includes('/chat/completions'));
const visionReqBody = () => JSON.parse(visionCall()[1].body);
const visionReqHeaders = () => visionCall()[1].headers;

beforeEach(async () => {
  useConfiguredVision();
  fetchMock.mockClear();
  const dl = await import('../../src/background/local-agent-client.js');
  dl.downloadFile.mockClear();
});

describe('read_image — 文档附件来源', () => {
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
    expect(dl.downloadFile).toHaveBeenCalledWith('/ws/_attachments/a/img-1.png', 's1');
    expect(r.success).toBe(true);
    expect(r.content).toContain('180 万');
  });

  // 安全回归：agent 来源（file+image 落盘路径）现拉必须与 path 来源同口径过大小闸门，
  // 否则 magic bytes 通过但超大的文件仍会整包送外部视觉端点（来源一已挡、来源二漏挡）
  it('agent 来源图片超单图上限（magic 合法但体积超限）→ 拒绝且不调视觉', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    // 合法 PNG 头 + 填充至 >5MB：magic bytes 判定通过，仅体积闸门可拦截
    let bin = String.fromCharCode(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a);
    bin += 'x'.repeat(5 * 1024 * 1024);
    dl.downloadFile.mockResolvedValueOnce({ success: true, content: btoa(bin), mimeType: 'image/png' });
    const r = await call({ file: 'a.docx', image: 1 });
    expect(dl.downloadFile).toHaveBeenCalled();
    expect(r.success).toBe(false);
    expect(visionCall()).toBeUndefined();
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

describe('read_image — 代理端任意路径来源', () => {
  it('path 来源：走 downloadFile(path) → 视觉深读（不查快照）', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    dl.downloadFile.mockResolvedValueOnce({ success: true, content: PNG_B64, mimeType: 'image/png' });
    const r = await call({ path: 'shot.png', question: '这是什么界面' });
    expect(dl.downloadFile).toHaveBeenCalledWith('shot.png', 's1');
    expect(r.success).toBe(true);
    expect(r.content).toContain('180 万');
    const body = visionReqBody();
    expect(body.messages[0].content[0].text).toContain('这是什么界面');
    expect(body.messages[0].content[1].image_url.url).toBe('data:image/png;base64,' + PNG_B64);
  });

  it('path 取图失败（离线/越权）→ 错误文案含 path，不调视觉', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    dl.downloadFile.mockResolvedValueOnce({ success: false });
    const r = await call({ path: '/etc/secret.png' });
    expect(r.success).toBe(false);
    expect(r.content).toContain('/etc/secret.png');
    expect(visionCall()).toBeUndefined();
  });

  it('既无 file+image 又无 path → 参数错误，不取图不调视觉', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    const r = await call({ question: 'x' });
    expect(r.success).toBe(false);
    expect(dl.downloadFile).not.toHaveBeenCalled();
    expect(visionCall()).toBeUndefined();
  });

  // 安全回归：read_image 属不可信内容入口且无需确认，path 来料必须经扩展侧硬校验，
  // 防止提示注入借任意工作目录文件 → 外部视觉端点外泄非图片内容
  it('path 取回内容非图片（magic bytes 不符）→ 拒绝且不调视觉 API', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    const notImage = btoa('SECRET TOKEN abc');
    dl.downloadFile.mockResolvedValueOnce({ success: true, content: notImage, mimeType: 'text/plain' });
    const r = await call({ path: 'notes.txt' });
    expect(r.success).toBe(false);
    expect(r.content).toContain('notes.txt');
    expect(visionCall()).toBeUndefined();
  });

  it('path 取回字节超单图上限 → 拒绝且不调视觉', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    const huge = 'A'.repeat(8 * 1024 * 1024); // base64 约 6MB 原文 > 5MB 上限
    dl.downloadFile.mockResolvedValueOnce({ success: true, content: huge, mimeType: 'image/png' });
    const r = await call({ path: 'big.png' });
    expect(r.success).toBe(false);
    expect(visionCall()).toBeUndefined();
  });

  it('path 非字符串/全空白 → 参数错误，不取图', async () => {
    const dl = await import('../../src/background/local-agent-client.js');
    const r1 = await call({ path: '   ' });
    expect(r1.success).toBe(false);
    const r2 = await call({ path: 123 });
    expect(r2.success).toBe(false);
    expect(dl.downloadFile).not.toHaveBeenCalled();
  });

  it('path 与 file+image 同时给出 → 明确二选一报错，不静默取 path', async () => {
    const r = await call({ path: 'shot.png', file: 'b.pdf', image: 1 });
    expect(r.success).toBe(false);
    expect(r.content).toContain('二选一');
    expect(visionCall()).toBeUndefined();
  });

  it('image 序号字符串归一："1" 等同 1 命中；越界文案仍含总数', async () => {
    const r = await call({ file: 'b.pdf', image: '1' });
    expect(r.success).toBe(true);
    const r2 = await call({ file: 'b.pdf', image: '9' });
    expect(r2.success).toBe(false);
    expect(r2.content).toMatch(/共 1 张/);
  });
});
