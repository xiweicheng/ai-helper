// gettools-vision-gate.unit.test.js - 图片识别总开关对 read_image 的按需下发门控
// 背景：工具清单按需传递以减少 token 消耗；开关关闭时附件抠图链路不产出图片，
// 快照永为空、工具必然失败，故未开启图片识别时不应下发该工具。
import { describe, it, expect, beforeEach, vi } from 'vitest';

const noop = () => {};

// 存储内容可变：enableImageInput 开关 + 默认全量勾选（未保存过配置=全启用）
let store = {};
globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const out = {};
        for (const k of [].concat(keys)) if (k in store) out[k] = store[k];
        if (typeof cb === 'function') { cb(out); return; }
        return Promise.resolve(out);
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
  getActiveAgent: vi.fn(async () => null),
  setAgentReachable: vi.fn(),
  checkAgentHealth: vi.fn(async () => false),
  writeFile: vi.fn(),
  downloadFile: vi.fn(),
}));

vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => Promise.resolve({ customModelMap: {} })),
}));

vi.mock('../../src/background/stream-controller.js', () => ({
  sendAgentStream: vi.fn(),
  sendAgentStreamDone: vi.fn(),
}));

const { getTools } = await import('../../src/background/tool-executor.js');
const { BUILTIN_TOOLS } = await import('../../src/background/constants.js');

beforeEach(() => {
  store = {
    enableImageInput: false,
    pairedAgents: [],
    mcpEnabled: false,
    skillsEnabled: false,
  };
});

const ids = () => getTools().then((tools) => tools.map((t) => t.function.name));

describe('read_image 按图片识别开关按需下发', () => {
  it('开关关闭：不下发（减少 token 消耗）', async () => {
    const list = await ids();
    expect(list).not.toContain('read_image');
  });

  it('开关开启：下发', async () => {
    store.enableImageInput = true;
    const list = await ids();
    expect(list).toContain('read_image');
  });

  it('开关开启但用户曾显式保存勾选且未含该工具：尊重勾选不下发', async () => {
    store.enableImageInput = true;
    store.enabledTools = BUILTIN_TOOLS.map((t) => t.id).filter((id) => id !== 'read_image');
    const list = await ids();
    expect(list).not.toContain('read_image');
  });

  it('门控只影响该工具：开关关闭时其余默认工具不受牵连', async () => {
    const off = await ids();
    store.enableImageInput = true;
    const on = await ids();
    expect(on.filter((id) => !off.includes(id))).toEqual(['read_image']);
  });

  // 回归：read_document_image → read_image 改名必须登记 TOOL_NAME_MIGRATION，
  // 否则曾显式保存勾选的老用户存储里是旧 ID，新工具不再下发且不可自愈
  it('存储内的旧 ID read_document_image 经迁移后仍下发 read_image', async () => {
    store.enableImageInput = true;
    store.enabledTools = BUILTIN_TOOLS.map((t) => t.id).filter((id) => id !== 'read_image')
      .concat('read_document_image');
    const list = await ids();
    expect(list).toContain('read_image');
  });
});
