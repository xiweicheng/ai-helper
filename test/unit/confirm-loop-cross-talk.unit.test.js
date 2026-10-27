// @vitest-environment jsdom
// confirm-loop-cross-talk.unit.test.js - 确认链路端到端串扰回归（后台 + 面板真实模块同场对跑）
//
// 为什么要有这个文件：单测各测一半——后台侧测"响应按关联键只结算一条"，面板侧测"队列逐条呈现"。
// 用户实际报的故障横跨两侧（并行命令只弹一个框、点一次全放行、此后不再弹），
// 任何一侧单独通过都可能漏掉接线问题。这里把 react-loop / tool-executor 与
// confirm-dialog / interaction-gate 挂在同一条 chrome.runtime 消息总线上，
// 用真实按钮点击驱动用户那套操作序列，验证三个断言：
//   1) N 条并行灰名单命令 → N 条确认请求都发出，且每条关联键唯一；
//   2) 点一次"本次放行" → 只有被点的那条被执行，其余每条轮到它时都要用户自己答；
//   3) 全部答完之后再来的新命令 → 仍必须弹框（不得出现"此后再也不弹"）。
import { describe, test, expect, beforeEach, beforeAll, vi } from 'vitest';

const noop = () => {};
// 双向总线：两侧都通过 globalThis.chrome 收发消息，消息按真实语义投递
const listeners = [];
const trace = [];

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
      trace.push(msg);
      // 真实扩展里跨上下文投递是异步的，这里同样推迟到微任务，避免调用方栈内同步回调
      Promise.resolve().then(() => {
        for (const l of listeners.slice()) l(msg, {}, noop);
      });
      return Promise.resolve({});
    },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: {
      addListener: (fn) => listeners.push(fn),
      removeListener: (fn) => {
        const i = listeners.indexOf(fn);
        if (i >= 0) listeners.splice(i, 1);
      },
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

function mountDom() {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    <div id="confirmOverlay" style="display:none">
      <span id="confirmToolName"></span>
      <div id="confirmArgsSummary"></div>
      <div id="confirmMessage"></div>
      <div id="confirmCountdown" style="display:none"><span id="confirmCountdownText"></span></div>
      <button id="confirmDenyBtn"></button>
      <button id="confirmApproveOnceBtn"></button>
      <button id="confirmApproveLoopBtn"></button>
    </div>
  `;
}

let toolExecutor;
let AgentClient;
let configModule;
let showConfirmDialog;
let initConfirmEvents;

beforeAll(async () => {
  toolExecutor = await import('../../src/background/tool-executor.js');
  AgentClient = await import('../../src/background/local-agent-client.js');
  configModule = await import('../../src/background/config.js');
});

/**
 * 让总线上的微任务与 Promise 链全部走到位（不用假 timers：这里只关心投递顺序，不推进超时）
 * 轮数放宽到 40：agent_exec 现在会先按会话解析冻结目录（会话记录读取 + 代理默认目录缓存），
 * 链路比原来多若干跳 Promise，6 轮会在确认请求发出前就断言
 */
async function flush(rounds = 40) {
  for (let i = 0; i < rounds; i++) await Promise.resolve();
}

const dialogs = () => trace.filter((m) => m.type === 'SHOW_CONFIRM_DIALOG').map((m) => m.data);
const responses = () => trace.filter((m) => m.type === 'TOOL_CONFIRMATION_RESPONSE');
const displayedReceipts = () =>
  trace.filter((m) => m.type === 'INTERACTION_DISPLAYED' && m.data?.kind === 'confirm').map((m) => m.data.toolCallId);
const forceCommands = () =>
  vi.mocked(AgentClient.execCommand).mock.calls.filter((c) => c[2] === true).map((c) => c[0]);
const shownCommand = () => document.getElementById('confirmArgsSummary').textContent;

beforeEach(async () => {
  trace.length = 0;
  listeners.length = 0;
  mountDom();
  // 面板模块取全新实例，避免队列/闸门的模块级状态串到下一个用例
  vi.resetModules();
  const mod = await import('../../src/side_panel/confirm-dialog.js');
  showConfirmDialog = mod.showConfirmDialog;
  initConfirmEvents = mod.initConfirmEvents;
  initConfirmEvents();

  vi.mocked(AgentClient.execCommand).mockReset();
  configModule.getStoredConfig.mockResolvedValue({
    reactConfig: { toolConfirmationEnabled: true, toolTimeout: 600000 },
    streamConfig: { streamEnabled: true },
  });
  // 未 force 一律命中灰名单（需要用户确认）；已 force 才算真的执行
  vi.mocked(AgentClient.execCommand).mockImplementation(async (cmd, cwd, force) =>
    force ? { success: false, error: 'executed-with-force' } : { success: true, level: 'confirm', reason: 'sudo' }
  );
});

describe('并行命令确认：后台与面板同场对跑（用户报的三现象）', () => {
  test('三条并行命令各自弹框，点一次"本次放行"只执行被点那条，答完仍会为新命令弹框', async () => {
    const commands = ['sudo apt install a', 'sudo apt install b', 'sudo apt install c'];
    const running = commands.map((command, i) =>
      toolExecutor.executeAgentExecCommand({ command }, `tc-${i}`, 'TASK')
    );
    await flush();

    // 现象一（"多个命令都在那等着，却只弹一个"）：三条请求必须都发出且关联键各不相同
    const asked = dialogs();
    expect(asked.map((d) => d.toolCallId)).toEqual(['tc-0', 'tc-1', 'tc-2']);
    // 面板逐条排队：正在显示的只有队头，其余在文案里告知条数
    expect(shownCommand()).toContain('sudo apt install a');
    expect(document.getElementById('confirmMessage').textContent).toContain('另有 2 条待确认');

    // 现象二（"点了本次放行，所有命令全部放行"）：一次点击只释放那一条
    document.getElementById('confirmApproveOnceBtn').click();
    await flush();
    expect(responses()).toHaveLength(1);
    expect(responses()[0]).toMatchObject({ toolCallId: 'tc-0', confirmed: true, scope: 'single', sessionId: 'TASK' });
    expect(forceCommands()).toEqual(['sudo apt install a']);

    // 队列推进：第二条顶上要用户自己答
    expect(shownCommand()).toContain('sudo apt install b');
    await running[0];

    document.getElementById('confirmApproveOnceBtn').click();
    await flush();
    expect(forceCommands()).toEqual(['sudo apt install a', 'sudo apt install b']);
    expect(shownCommand()).toContain('sudo apt install c');

    // 拒绝第三条：只有它被拒，不受前两次放行影响
    document.getElementById('confirmDenyBtn').click();
    await flush();
    expect(forceCommands()).toEqual(['sudo apt install a', 'sudo apt install b']);
    const [ra, rb, rc] = await Promise.all(running);
    expect(ra.error).toBe('executed-with-force');
    expect(rc.error).toContain('拒绝');
    expect(document.getElementById('confirmOverlay').style.display).toBe('none');

    // 现象三（"后续新产生的命令再也没有弹出过确认框"）：答完全部之后的新命令仍要弹
    const p4 = toolExecutor.executeAgentExecCommand({ command: 'sudo rm -rf ./dist' }, 'tc-3', 'TASK');
    await flush();
    expect(dialogs().map((d) => d.toolCallId)).toEqual(['tc-0', 'tc-1', 'tc-2', 'tc-3']);
    expect(shownCommand()).toContain('sudo rm -rf ./dist');
    expect(displayedReceipts()).toEqual(['tc-0', 'tc-1', 'tc-2', 'tc-3']);

    document.getElementById('confirmApproveOnceBtn').click();
    await p4;
    expect(forceCommands()).toEqual(['sudo apt install a', 'sudo apt install b', 'sudo rm -rf ./dist']);
  });

  test('后台请求的关联键不得退化：模型复用同一个 tool_call.id / 留空时也能逐条弹、逐条答', async () => {
    const running = [
      toolExecutor.executeAgentExecCommand({ command: 'sudo apt install a' }, 'tcDup', 'TASK'),
      toolExecutor.executeAgentExecCommand({ command: 'sudo git push -f' }, 'tcDup', 'TASK'),
      toolExecutor.executeAgentExecCommand({ command: 'sudo npm i -g x' }, undefined, 'TASK'),
    ];
    await flush();

    const asked = dialogs();
    expect(asked).toHaveLength(3);
    expect(new Set(asked.map((d) => d.toolCallId)).size).toBe(3);

    // 面板侧：三条都要进队列（旧的"只看 ID 去重"会把后两条当成副本吞掉，用户看不到）
    expect(shownCommand()).toContain('sudo apt install a');
    expect(document.getElementById('confirmMessage').textContent).toContain('另有 2 条待确认');

    for (let i = 0; i < 3; i++) {
      document.getElementById('confirmApproveOnceBtn').click();
      await flush();
    }
    expect(forceCommands().sort()).toEqual(['sudo apt install a', 'sudo git push -f', 'sudo npm i -g x']);
    await Promise.all(running);
  });

  test('重复投递（port 与广播两条通道）仍只算一条，不得凭空多出待确认', async () => {
    const p = toolExecutor.executeAgentExecCommand({ command: 'sudo apt install a' }, 'tcSolo', 'TASK');
    await flush();
    const first = dialogs()[0];
    expect(first.toolCallId).toBe('tcSolo');

    // 同一条请求经另一条通道再来一次：内容完全相同 → 去重，不入队
    showConfirmDialog(first);
    await flush();
    expect(dialogs()).toHaveLength(1);
    expect(document.getElementById('confirmMessage').textContent).not.toContain('另有');

    document.getElementById('confirmApproveOnceBtn').click();
    await flush();
    expect(responses()).toHaveLength(1);
    await p;
    expect(forceCommands()).toEqual(['sudo apt install a']);
  });
});
