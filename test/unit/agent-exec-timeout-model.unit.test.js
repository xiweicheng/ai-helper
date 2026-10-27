// test/unit/agent-exec-timeout-model.unit.test.js
// agent_exec 两端超时一致性回归：
//   1. timeoutMs 钳制下限后透传给 Agent（受管协商）；
//   2. 插件端不再自行延长，预算耗尽即终止（决策权威在 Agent）；
//   3. 空闲挂起分支先 detach 再关 WS（显式豁免，不再靠断连推断）；
//   4. Agent 上报 exit.timedOut → 本地化超时失败结果；
//   5. WS 建连失败但进程已启动 → 禁止同步重跑（防副作用双重执行）。
// 头部 chrome 全局 mock 复用 agent-exec-confirmation.unit.test.js L13-L60 的完整设置（原样拷贝）。
import { describe, test, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const noop = () => {};

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
    sendMessage: (msg, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
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

vi.mock('../../src/background/local-agent-client.js', () => ({
  execCommand: vi.fn(),
  execCommandWait: vi.fn(),
  createExecWebSocket: vi.fn(),
  stopCommand: vi.fn(),
  detachCommand: vi.fn(() => Promise.resolve({ success: true })),
  isAgentPaired: vi.fn(() => Promise.resolve(false)),
  writeFile: vi.fn(),
}));
vi.mock('../../src/background/config.js', () => ({
  getStoredConfig: vi.fn(),
  getChatConfig: vi.fn(() => Promise.resolve({ customModelMap: {} })),
}));
vi.mock('../../src/background/stream-controller.js', () => ({
  sendAgentStream: vi.fn(),
  sendAgentStreamDone: vi.fn(),
}));

let toolExecutor, AgentClient, configModule;
const baseConfig = { reactConfig: { toolConfirmationEnabled: true, toolTimeout: 600000 }, streamConfig: { streamEnabled: true } };

function makeFakeWs() {
  return { onmessage: null, onclose: null, onerror: null, close: vi.fn() };
}

// 真实 createExecWebSocket 会把消息回调挂到 ws.onmessage；测试里必须复现这层接线，
// 否则 tool-executor 的 exit 内层回调（设置 exitCode / timedOutByAgent）不会被触发。
function wireWs() {
  const ws = makeFakeWs();
  AgentClient.createExecWebSocket.mockImplementation(async (_url, onMessage) => {
    ws.onmessage = (event) => onMessage(JSON.parse(event.data));
    return ws;
  });
  return ws;
}

beforeAll(async () => {
  toolExecutor = await import('../../src/background/tool-executor.js');
  AgentClient = await import('../../src/background/local-agent-client.js');
  configModule = await import('../../src/background/config.js');
});
beforeEach(() => {
  vi.useFakeTimers();
  vi.mocked(AgentClient.execCommand).mockReset();
  vi.mocked(AgentClient.execCommandWait).mockReset();
  vi.mocked(AgentClient.createExecWebSocket).mockReset();
  vi.mocked(AgentClient.stopCommand).mockReset().mockResolvedValue({ success: true });
  vi.mocked(AgentClient.detachCommand).mockReset().mockResolvedValue({ success: true });
  configModule.getStoredConfig.mockResolvedValue(baseConfig);
});
afterEach(() => { vi.useRealTimers(); });

const okInit = { success: true, level: 'allow', execId: 'e1', wsUrl: 'ws://x/e1' };

describe('agent_exec 两端超时模型', () => {
  test('computeExecGuardMs/computeExecMaxTotalMs：6 倍预算封顶 600s，保险 +30s', () => {
    expect(toolExecutor.computeExecMaxTotalMs(5000)).toBe(30000);
    expect(toolExecutor.computeExecGuardMs(5000)).toBe(60000);
    expect(toolExecutor.computeExecMaxTotalMs(600000)).toBe(600000);
    expect(toolExecutor.computeExecGuardMs(600000)).toBe(630000);
  });

  test('timeoutMs=3000 → 钳制 5000 并作为第 4 参透传（受管协商）', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    const ws = wireWs();
    const p = toolExecutor.executeAgentExecCommand({ command: 'echo hi', timeoutMs: 3000 }, 'tc1', 's1');
    await vi.advanceTimersByTimeAsync(0);
    expect(AgentClient.execCommand).toHaveBeenCalledWith('echo hi', undefined, false, 5000, 's1');
    ws.onmessage({ data: JSON.stringify({ type: 'exit', exitCode: 0, execId: 'e1', killed: false, timedOut: false }) });
    const r = await p;
    expect(r.success).toBe(true);
  });

  test('静默命令：预算(maxTotal)耗尽插件端直接终止，不再自行延长，且结果无“已延长”字样', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    wireWs();
    const p = toolExecutor.executeAgentExecCommand({ command: 'sleep 30', timeoutMs: 5000 }, 'tc2', 's2');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(30000); // maxTotalMs = 5000*6
    let result;
    await p.then((r) => { result = r; }, () => { result = undefined; });
    expect(result).toBeTruthy();
    expect(result.success).toBe(false);
    expect(result.error).not.toContain('延长');
    expect(AgentClient.stopCommand).toHaveBeenCalledWith('e1', 's2');
    expect(AgentClient.execCommandWait).not.toHaveBeenCalled();
  });

  test('空闲 120s 无输出 → 先 detachCommand 再关 WS（显式 daemon 豁免）', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    wireWs();
    const p = toolExecutor.executeAgentExecCommand({ command: 'node server.js', timeoutMs: 120000 }, 'tc3', 's3');
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(120000); // idleTimeoutMs = max(120000, min(96000,600000)) = 120000
    await vi.advanceTimersByTimeAsync(0);
    expect(AgentClient.detachCommand).toHaveBeenCalledWith('e1', 's3');
    const r = await p;
    expect(r.partial).toBe(true);
    expect(r.success).toBe(true);
  });

  test('Agent 上报 exit.timedOut=true → 返回本地化超时的失败结果', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    const ws = wireWs();
    const p = toolExecutor.executeAgentExecCommand({ command: 'long_task', timeoutMs: 5000 }, 'tc4', 's4');
    await vi.advanceTimersByTimeAsync(0);
    ws.onmessage({ data: JSON.stringify({ type: 'exit', exitCode: -1, execId: 'e1', killed: true, timedOut: true }) });
    const r = await p;
    expect(r.success).toBe(false);
    expect(r.error).toBeTruthy();
    expect(AgentClient.execCommandWait).not.toHaveBeenCalled();
  });

  test('WS 建连失败但进程已启动（有 execId）→ 绝不 execCommandWait 重跑', async () => {
    AgentClient.execCommand.mockResolvedValue(okInit);
    AgentClient.createExecWebSocket.mockRejectedValue(new Error('connect refused'));
    const r = await toolExecutor.executeAgentExecCommand({ command: 'touch /tmp/x', timeoutMs: 5000 }, 'tc5', 's5');
    expect(r.success).toBe(false);
    expect(r.execId).toBe('e1');
    expect(AgentClient.execCommandWait).not.toHaveBeenCalled();
  });
});

describe('agent_exec schema 超时契约', () => {
  test('timeoutMs 声明 minimum=5000 与延长语义描述', () => {
    const src = readFileSync(fileURLToPath(new URL('../../src/background/tools/agent-tools.js', import.meta.url)), 'utf8');
    expect(src).toMatch(/timeoutMs:\s*\{[^}]*minimum:\s*5000/);
    expect(src).toMatch(/timeoutMs:\s*\{[^}]*description:/);
  });
});
