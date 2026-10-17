// agent-exec-confirmation.unit.test.js - agent_exec 灰名单命令用户确认回归测试
//
// 回归背景：灰名单命令（sudo/npm -g/git push -f 等）的"确认"原先是把提示语返回给模型，
// 依赖模型自觉转达用户并用 force: true 重试——模型可绕过用户直接自我批准。
// 修复约定：
//   1. 确认开关打开时，模型自带的 force 参数一律忽略（不可信），confirm 级命令必须弹
//      真实用户确认框（复用 requestToolConfirmation 通道），确认后由扩展端以 force 重发；
//      且 agent_exec schema 不再向模型暴露 force 字段（避免诱导模型自我批准）；
//   2. 拒绝/超时/弹窗失败默认拒绝（fail-closed）；
//   3. 确认开关关闭 = 用户已明确选择灰名单自动放行（force 直通，黑名单仍不可绕过）；
//   4. 兜底文案（commandNeedConfirm）不得再含"用 force: true 重试"的模型自批准指令。
import { describe, test, expect, beforeEach, afterEach, beforeAll, vi } from 'vitest';

const noop = () => {};
let messageListeners = [];
let sentMessages = [];

const sendMessageMock = (msg, cb) => {
  sentMessages.push(msg);
  if (typeof cb === 'function') cb({});
  return Promise.resolve({});
};

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
    sendMessage: sendMessageMock,
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: {
      addListener: (fn) => messageListeners.push(fn),
      removeListener: (fn) => { messageListeners = messageListeners.filter((l) => l !== fn); },
    },
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

let toolExecutor;
let AgentClient;
let configModule;

const baseConfig = (overrides = {}) => ({
  reactConfig: { toolConfirmationEnabled: true, toolTimeout: 600000 },
  streamConfig: { streamEnabled: true },
  ...overrides,
});

/**
 * 模拟用户在确认弹窗点击（confirm-dialog.js 发回 TOOL_CONFIRMATION_RESPONSE）。
 * 关联 ID / 会话必须是面板实际收到的那一双（后台现在按它们匹配），
 * 默认取最近一条弹窗；并行场景可指定 toolCallId 只应答其中一条。
 */
async function respondConfirmation(confirmed, scope = 'single', toolCallId = null) {
  const dialogs = sentMessages.filter((m) => m.type === 'SHOW_CONFIRM_DIALOG');
  const dialog = toolCallId
    ? dialogs.find((d) => d.data?.toolCallId === toolCallId)
    : dialogs[dialogs.length - 1];
  if (!dialog) throw new Error('no SHOW_CONFIRM_DIALOG sent');

  const listeners = [...messageListeners];
  for (const fn of listeners) {
    fn({
      type: 'TOOL_CONFIRMATION_RESPONSE',
      toolCallId: dialog.data.toolCallId,
      confirmed,
      scope,
      sessionId: dialog.data.sessionId,
    }, {});
  }
  await vi.advanceTimersByTimeAsync(0);
}

beforeAll(async () => {
  toolExecutor = await import('../../src/background/tool-executor.js');
  AgentClient = await import('../../src/background/local-agent-client.js');
  configModule = await import('../../src/background/config.js');
});

beforeEach(() => {
  vi.useFakeTimers();
  messageListeners = [];
  sentMessages = [];
  vi.mocked(AgentClient.execCommand).mockReset();
  vi.mocked(AgentClient.execCommandWait).mockReset();
  vi.mocked(AgentClient.createExecWebSocket).mockReset();
  vi.mocked(AgentClient.stopCommand).mockReset();
  configModule.getStoredConfig.mockResolvedValue(baseConfig());
});

afterEach(() => {
  vi.useRealTimers();
});

describe('agent_exec 灰名单命令真实用户确认（防模型自我批准）', () => {
  test('开关打开：模型自带 force 被忽略，confirm 级弹真实确认框，拒绝后不再执行', async () => {
    vi.mocked(AgentClient.execCommand).mockResolvedValue({ success: true, level: 'confirm', reason: 'sudo' });

    const p = toolExecutor.executeAgentExecCommand(
      { command: 'sudo apt install x', force: true }, 'tc1', 's1');
    await vi.advanceTimersByTimeAsync(0);

    // 模型 force 被忽略：首次初始化以 force=false 走安全分级
    expect(AgentClient.execCommand).toHaveBeenCalledWith('sudo apt install x', undefined, false, 600000);

    // 弹了真实确认框（定向 port 不可用 → 广播兜底），且面向用户而非模型
    const dialog = sentMessages.find((m) => m.type === 'SHOW_CONFIRM_DIALOG');
    expect(dialog).toBeTruthy();
    expect(dialog.data.toolName).toBe('agent_exec');
    expect(dialog.data.args.command).toBe('sudo apt install x');

    // 用户拒绝 → fail-closed，不再重试执行
    await respondConfirmation(false);
    const result = await p;
    expect(result.success).toBe(false);
    expect(result.error).toContain('拒绝');
    expect(AgentClient.execCommand).toHaveBeenCalledTimes(1);
  });

  test('开关打开：用户弹窗确认后，扩展端才以 force 重发执行', async () => {
    vi.mocked(AgentClient.execCommand)
      .mockResolvedValueOnce({ success: true, level: 'confirm', reason: 'sudo' })
      .mockResolvedValueOnce({ success: false, error: 'boom' });

    const p = toolExecutor.executeAgentExecCommand(
      { command: 'sudo apt install x' }, 'tc2', 's1');
    await vi.advanceTimersByTimeAsync(0);

    await respondConfirmation(true);
    const result = await p;

    // 第二次初始化由扩展端授予 force=true（用户已确认）
    expect(AgentClient.execCommand).toHaveBeenNthCalledWith(2, 'sudo apt install x', undefined, true, 600000);
    expect(result.success).toBe(false);
    expect(result.error).toBe('boom');
  });

  test('任务级放行：选择“本次任务放行”后，同任务后续灰名单命令自动放行不再弹窗', async () => {
    vi.mocked(AgentClient.execCommand)
      .mockResolvedValueOnce({ success: true, level: 'confirm', reason: 'sudo' })   // #1 安全分级拦下
      .mockResolvedValueOnce({ success: false, error: 'boom' })                      // #2 确认后 force 执行
      .mockResolvedValueOnce({ success: true, level: 'confirm', reason: 'rm' })      // #3 仍命中灰名单
      .mockResolvedValueOnce({ success: false, error: 'boom' });                      // #4 自动 force 放行

    // 第一条命令：弹窗 → 用户选择“本次任务放行”
    const p1 = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install x' }, 'tcL1', 's-loop');
    await vi.advanceTimersByTimeAsync(0);
    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG')).toBe(true);
    await respondConfirmation(true, 'loop');
    await p1;

    // 第二条命令：不再弹窗，经安全分级后由扩展端自动以 force 放行
    sentMessages = [];
    await toolExecutor.executeAgentExecCommand({ command: 'sudo rm -rf ./build' }, 'tcL2', 's-loop');

    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG')).toBe(false);
    expect(AgentClient.execCommand).toHaveBeenNthCalledWith(3, 'sudo rm -rf ./build', undefined, false, 600000);
    expect(AgentClient.execCommand).toHaveBeenNthCalledWith(4, 'sudo rm -rf ./build', undefined, true, 600000);
  });

  test('弹框无法送达（侧边栏已关闭）：视为未授权拒用，绝不 force 执行', async () => {
    // 面板关着 → 无 keepalive port 且广播无接收方 → 确认消息无处渲染
    const originalSendMessage = globalThis.chrome.runtime.sendMessage;
    vi.mocked(AgentClient.execCommand).mockResolvedValue({ success: true, level: 'confirm', reason: 'sudo' });
    globalThis.chrome.runtime.sendMessage = () => Promise.reject(
      new Error('Could not establish connection. Receiving end does not exist.')
    );

    try {
      const result = await toolExecutor.executeAgentExecCommand(
        { command: 'sudo apt install x' }, 'tcNoUI', 's-noui');

      expect(result.success).toBe(false);
      // 只发生了一次安全分级调用：没有任何 force 执行发生
      expect(AgentClient.execCommand).toHaveBeenCalledTimes(1);
      expect(AgentClient.execCommand).toHaveBeenCalledWith('sudo apt install x', undefined, false, 600000);
    } finally {
      globalThis.chrome.runtime.sendMessage = originalSendMessage;
    }
  });

  test('并行串扰回归：两个并行子任务的命令确认，一次点击只释放自己那条', async () => {
    // 不依赖调用顺序的 mock：未 force 永远命中灰名单，已 force 则真正执行
    vi.mocked(AgentClient.execCommand).mockImplementation(async (cmd, cwd, force) =>
      force ? { success: false, error: 'executed-with-force' } : { success: true, level: 'confirm', reason: 'sudo' }
    );

    // 两个并行子任务（不同 sessionId + 不同 toolCallId）各自等确认
    const pA = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install a' }, 'tcA', 'S_subtask_0');
    const pB = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install b' }, 'tcB', 'S_subtask_1');
    await vi.advanceTimersByTimeAsync(0);

    // 弹窗关联键必须是唯一调用 ID，不再是共用的工具名
    const dialogs = sentMessages.filter((m) => m.type === 'SHOW_CONFIRM_DIALOG').map((m) => m.data);
    expect(dialogs.map((d) => d.toolCallId).sort()).toEqual(['tcA', 'tcB']);
    expect(dialogs.every((d) => d.toolCallId !== 'agent_exec')).toBe(true);

    const forceCommands = () => vi.mocked(AgentClient.execCommand)
      .mock.calls.filter((c) => c[2] === true).map((c) => c[0]);

    // 用户只对 tcA 点“本次放行”：B 不得被一并放行
    await respondConfirmation(true, 'single', 'tcA');
    expect(forceCommands()).toEqual(['sudo apt install a']);

    // 再应答 tcB，此时 B 才执行
    await respondConfirmation(true, 'single', 'tcB');
    expect(forceCommands().sort()).toEqual(['sudo apt install a', 'sudo apt install b']);

    const [ra, rb] = await Promise.all([pA, pB]);
    expect(ra.error).toBe('executed-with-force');
    expect(rb.error).toBe('executed-with-force');
  });

  test('关联键退化回归：模型对并行调用复用同一个 tool_call.id（甚至全部留空）时，一次点击仍只释放一条', async () => {
    vi.mocked(AgentClient.execCommand).mockImplementation(async (cmd, cwd, force) =>
      force ? { success: false, error: 'executed-with-force' } : { success: true, level: 'confirm', reason: 'sudo' }
    );

    // 同一会话内的三条并行命令：前两条拿到重复 id，第三条连 id 都没有
    const pA = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install a' }, 'tcDup', 'S');
    const pB = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install b' }, 'tcDup', 'S');
    const pC = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install c' }, undefined, 'S');
    await vi.advanceTimersByTimeAsync(0);

    const keys = sentMessages
      .filter((m) => m.type === 'SHOW_CONFIRM_DIALOG')
      .map((m) => m.data.toolCallId);
    // 三条必须有三个不同的关联键：共用一键会让一次点击命中全部挂起确认（集体放行），
    // 并让面板把后到的真实请求当成副本吞掉（新命令再也不弹框）
    expect(keys).toHaveLength(3);
    expect(new Set(keys).size).toBe(3);
    expect(keys[0]).toBe('tcDup');
    expect(keys).not.toContain('agent_exec');

    const forceCommands = () => vi.mocked(AgentClient.execCommand)
      .mock.calls.filter((c) => c[2] === true).map((c) => c[0]);

    // 只对第一条点“本次放行”：后两条不得被一并放行
    await respondConfirmation(true, 'single', keys[0]);
    expect(forceCommands()).toEqual(['sudo apt install a']);

    await respondConfirmation(true, 'single', keys[1]);
    expect(forceCommands()).toEqual(['sudo apt install a', 'sudo apt install b']);

    await respondConfirmation(true, 'single', keys[2]);
    await Promise.all([pA, pB, pC]);
    expect(forceCommands().sort()).toEqual([
      'sudo apt install a', 'sudo apt install b', 'sudo apt install c',
    ]);
  });

  test('开关关闭：灰名单自动放行（用户显式选择），不弹确认框', async () => {
    configModule.getStoredConfig.mockResolvedValue(baseConfig({
      reactConfig: { toolConfirmationEnabled: false, toolTimeout: 600000 },
    }));
    vi.mocked(AgentClient.execCommand).mockResolvedValue({ success: false, error: 'spawn failed' });

    const result = await toolExecutor.executeAgentExecCommand(
      { command: 'sudo apt install x' }, 'tc3', 's1');

    // force 直通（开关关闭语义），且全程无确认弹窗
    expect(AgentClient.execCommand).toHaveBeenCalledWith('sudo apt install x', undefined, true, 600000);
    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG')).toBe(false);
    expect(result.error).toBe('spawn failed');
  });

  test('非流式路径：confirm 级弹窗确认后以 force 重试 execCommandWait', async () => {
    configModule.getStoredConfig.mockResolvedValue(baseConfig({
      streamConfig: { streamEnabled: false },
    }));
    // 注意：mock 直接解析为 agent 响应；{cancelled, value} 包装由 executeWithCancel 负责
    vi.mocked(AgentClient.execCommandWait)
      .mockResolvedValueOnce({ success: true, level: 'confirm', reason: 'git push -f' })
      .mockResolvedValueOnce({ success: true, level: 'allow', exitCode: 0, stdout: 'ok', stderr: '' });

    const p = toolExecutor.executeAgentExecCommand({ command: 'git push -f' }, 'tc4', 's1');
    await vi.advanceTimersByTimeAsync(0);

    expect(AgentClient.execCommandWait).toHaveBeenNthCalledWith(1, 'git push -f', undefined, false, 600000);

    await respondConfirmation(true);
    const result = await p;

    expect(AgentClient.execCommandWait).toHaveBeenNthCalledWith(2, 'git push -f', undefined, true, 600000);
    expect(result.success).toBe(true);
    expect(result.exitCode).toBe(0);
  });

  test('非流式路径：弹窗拒绝返回拒绝结果，不重试', async () => {
    configModule.getStoredConfig.mockResolvedValue(baseConfig({
      streamConfig: { streamEnabled: false },
    }));
    vi.mocked(AgentClient.execCommandWait)
      .mockResolvedValue({ success: true, level: 'confirm', reason: 'sudo' });

    const p = toolExecutor.executeAgentExecCommand({ command: 'sudo rm x' }, 'tc5', 's1');
    await vi.advanceTimersByTimeAsync(0);

    await respondConfirmation(false);
    const result = await p;

    expect(result.success).toBe(false);
    expect(AgentClient.execCommandWait).toHaveBeenCalledTimes(1);
  });

  test('兜底文案不再含模型自我批准指令（不得出现 force: true 重试指引）', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(
      path.resolve(process.cwd(), 'src/background/tool-executor.js'), 'utf8');
    expect(src).not.toContain('我会用 force: true');
    expect(src).not.toContain('re-execute this command with force: true');
    expect(src).toContain('commandUserDenied');
  });

  test('schema 契约：agent_exec 不得向模型暴露 force 参数', async () => {
    const { AGENT_TOOLS } = await import('../../src/background/tools/agent-tools.js');
    const execTool = AGENT_TOOLS.find(t => t.id === 'agent_exec');
    expect(Object.keys(execTool.function.parameters.properties)).not.toContain('force');
  });
});
