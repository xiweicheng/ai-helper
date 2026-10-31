// @vitest-environment jsdom
// clarify-routing.unit.test.js - 澄清消息定向路由回归测试
//
// 回归背景：多 Tab 各开一个 Side Panel（标签页绑定模式）时，任一实例触发
// 需求澄清后，SHOW_CLARIFY_DIALOG 通过 chrome.runtime.sendMessage 广播到
// 所有 Side Panel 实例，导致其他 Tab 的侧边栏也弹出澄清弹框。
//
// 修复后的约定：
// - 澄清消息（SHOW_CLARIFY_DIALOG / CLARIFY_TIMEOUT）优先通过发起实例的
//   keepalive 长连接（sessionId → Port）点对点发送，只有发起实例弹框；
// - port 不存在（定时任务发起、实例已关闭/刷新）或 postMessage 失败时，
//   回退 chrome.runtime.sendMessage 广播兜底（保持原行为）。
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
    // 返回非空面板列表：避免 executeClarifyQuestion 的 sidePanelCheck 提前终止等待
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

let executeClarifyQuestion;
let bgState;

beforeAll(async () => {
  const te = await import('../../src/background/tool-executor.js');
  executeClarifyQuestion = te.executeClarifyQuestion;
  bgState = await import('../../src/background/state.js');
});

beforeEach(() => {
  vi.useFakeTimers();
  messageListeners = [];
  sentMessages = [];
});

afterEach(() => {
  vi.useRealTimers();
});

function makePort() {
  return {
    postMessage: vi.fn(),
    onDisconnect: { addListener: noop },
  };
}

/**
 * 模拟面板真正呈现了该条澄清（回发 INTERACTION_DISPLAYED）。
 * 后台的澄清超时不在发出弹窗时起，而在该回执到达起：面板侧确认与澄清
 * 共用单模态闸门，排队未被看到的澄清不得被无声计到超时。
 */
function markDisplayed(toolCallId) {
  for (const l of [...messageListeners]) {
    l({ type: 'INTERACTION_DISPLAYED', data: { kind: 'clarify', toolCallId } }, {}, noop);
  }
}

/** 呈现后推进到澄清超时（默认 300000ms），确保被测 Promise 收敛、定时器清理 */
async function drainToTimeout(toolCallId) {
  markDisplayed(toolCallId);
  await vi.advanceTimersByTimeAsync(300000 + 1000);
}

/** 模拟面板用户点击“延长时间”上行 CLARIFY_EXTEND */
function sendExtend(toolCallId) {
  for (const l of [...messageListeners]) {
    l({ type: 'CLARIFY_EXTEND', toolCallId }, {}, noop);
  }
}

/** 从 port 已发送消息中挑出后台的延长回执 CLARIFY_EXTENDED */
function extendedMsgs(port) {
  return port.postMessage.mock.calls.map((c) => c[0]).filter((m) => m.type === 'CLARIFY_EXTENDED');
}

describe('keepalive port 注册表（定向路由基础设施）', () => {
  test('register → get/has 返回注册的 port；unregister 后失效', () => {
    const port = makePort();
    bgState.registerKeepalivePort('reg-sess', port);
    expect(bgState.getKeepalivePort('reg-sess')).toBe(port);
    expect(bgState.hasKeepalivePort('reg-sess')).toBe(true);

    bgState.unregisterKeepalivePort('reg-sess');
    expect(bgState.getKeepalivePort('reg-sess')).toBeNull();
    expect(bgState.hasKeepalivePort('reg-sess')).toBe(false);
  });

  test('空 sessionId / 空 port 安全返回，不抛错', () => {
    expect(bgState.getKeepalivePort(null)).toBeNull();
    expect(bgState.hasKeepalivePort(undefined)).toBe(false);
    bgState.registerKeepalivePort(null, makePort());
    bgState.registerKeepalivePort('reg-empty', null);
    expect(bgState.getKeepalivePort('reg-empty')).toBeNull();
    bgState.unregisterKeepalivePort(null);
  });
});

describe('澄清消息定向路由（多 Tab 侧边栏防串台）', () => {
  test('已注册发起实例 port：SHOW_CLARIFY_DIALOG 只走 port 点对点，不广播', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-port', port);

    const p = executeClarifyQuestion({ question: '要不要发布？', options: ['发布', '跳过'] }, 'tc-port', 'sess-port');
    await vi.advanceTimersByTimeAsync(0);

    // 只通过 port 发送，且内容为澄清请求
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const sent = port.postMessage.mock.calls[0][0];
    expect(sent.type).toBe('SHOW_CLARIFY_DIALOG');
    expect(sent.sessionId).toBe('sess-port');
    expect(sent.data.question).toBe('要不要发布？');
    // 广播通道不应出现澄清消息（这正是串台的根因路径）
    expect(sentMessages.some((m) => m.type === 'SHOW_CLARIFY_DIALOG')).toBe(false);

    // 超时通知同样走 port 定向（不打扰其他实例），并带上「代选的推荐项」供面板说明
    await drainToTimeout('tc-port');
    const result = await p;
    expect(result.success).toBe(true);
    const timeoutMsg = port.postMessage.mock.calls.map((c) => c[0]).find((m) => m.type === 'CLARIFY_TIMEOUT');
    expect(timeoutMsg).toMatchObject({ reason: 'timeout', defaultOption: '发布' });
    expect(port.postMessage.mock.calls.some((c) => c[0].type === 'CLARIFY_TIMEOUT')).toBe(true);

    bgState.unregisterKeepalivePort('sess-port');
  });

  test('无 port（如定时任务发起）：回退广播兜底', async () => {
    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-bg', 'sess-bg');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CLARIFY_DIALOG' && m.sessionId === 'sess-bg')).toBe(true);

    await drainToTimeout('tc-bg');
    await p;
  });

  test('port 已失效（postMessage 抛错）：回退广播兜底', async () => {
    const port = makePort();
    port.postMessage.mockImplementation(() => { throw new Error('Attempting to use a disconnected port object'); });
    bgState.registerKeepalivePort('sess-dead', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-dead', 'sess-dead');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CLARIFY_DIALOG' && m.sessionId === 'sess-dead')).toBe(true);

    await drainToTimeout('tc-dead');
    await p;
    bgState.unregisterKeepalivePort('sess-dead');
  });

  test('定向发送后，用户响应（广播回程）按 toolCallId 正常 resolve', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-resp', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['选项甲', '选项乙'] }, 'tc-resp', 'sess-resp');
    await vi.advanceTimersByTimeAsync(0);
    expect(port.postMessage).toHaveBeenCalledTimes(1);

    // 模拟发起实例提交澄清响应（响应回程仍为 runtime.sendMessage 广播，
    // background 按 toolCallId 匹配，天然不会串台）
    for (const l of [...messageListeners]) {
      l({ type: 'CLARIFY_RESPONSE', toolCallId: 'tc-resp', selectedOption: 1, customInput: '', additionalInfo: '' }, {}, noop);
    }

    const result = await p;
    expect(result.success).toBe(true);
    expect(result.content).toContain('选项乙');

    bgState.unregisterKeepalivePort('sess-resp');
  });

  test('并行子任务的两个澄清：响应按 toolCallId 分别结算，一次作答不释放另一条', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('TASKS_subtask_0', port);

    const pA = executeClarifyQuestion({ question: 'A？', options: ['a1'] }, 'tc-A', 'TASKS_subtask_0');
    const pB = executeClarifyQuestion({ question: 'B？', options: ['b1'] }, 'tc-B', 'TASKS_subtask_1');
    await vi.advanceTimersByTimeAsync(0);

    // 两条都带自己唯一的关联 ID（port 只属于发起实例，第二条在另一个会话上发出）
    const dialogs = port.postMessage.mock.calls
      .filter((c) => c[0].type === 'SHOW_CLARIFY_DIALOG')
      .map((c) => c[0].data.toolCallId);
    expect(dialogs).toEqual(['tc-A']);

    for (const l of [...messageListeners]) {
      l({ type: 'CLARIFY_RESPONSE', toolCallId: 'tc-A', selectedOption: 0, customInput: '', additionalInfo: '' }, {}, noop);
    }
    const resultA = await pA;
    expect(resultA.success).toBe(true);

    // B 仍在等待，未被一并结算
    let bSettled = false;
    pB.then(() => { bSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(bSettled).toBe(false);

    // 收敛 B
    for (const l of [...messageListeners]) {
      l({ type: 'CLARIFY_RESPONSE', toolCallId: 'tc-B', selectedOption: 0, customInput: '', additionalInfo: '' }, {}, noop);
    }
    expect((await pB).success).toBe(true);

    bgState.unregisterKeepalivePort('TASKS_subtask_0');
  });

  test('未被呈现时不起计时：回执到达后面板排队期间不得被计到超时', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('sess-defer', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-defer', 'sess-defer');
    await vi.advanceTimersByTimeAsync(0);

    // 旧行为：发出弹窗即起 5 分钟计时，被确认弹窗压住时到点静默失败
    let settled = false;
    p.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(300000 + 1000);
    expect(settled).toBe(false);

    // 呈现后才起计时
    markDisplayed('tc-defer');
    await vi.advanceTimersByTimeAsync(300000 + 1000);
    const result = await p;
    // 超时不再返回「无答案」：按推荐项（未指定时为第一项）代选，任务继续
    expect(result.success).toBe(true);
    expect(result.content).toContain('a');
    // 超时后下行通知面板撤销这一条
    expect(port.postMessage.mock.calls.some((c) => c[0].type === 'CLARIFY_TIMEOUT' && c[0].toolCallId === 'tc-defer')).toBe(true);

    bgState.unregisterKeepalivePort('sess-defer');
  });

  test('面板已关闭且从未呈现：存活轮询提前终止等待，不白等 5 分钟', async () => {
    // 面板已经关闭：getContexts 返回空列表
    const original = globalThis.chrome.runtime.getContexts;
    globalThis.chrome.runtime.getContexts = () => Promise.resolve([]);

    try {
      const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-closed', 'sess-closed');
      await vi.advanceTimersByTimeAsync(5000);

      const result = await p;
      expect(result.success).toBe(false);
      // 监听器不得泄漏
      expect(messageListeners).toHaveLength(0);
    } finally {
      globalThis.chrome.runtime.getContexts = original;
    }
  });
});

describe('澄清倒计时手动延长（后台权威计时器重置）', () => {
  test('延长重置超时：从延长点重新起一个完整窗口', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('s-ext1', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-ext1', 's-ext1');
    await vi.advanceTimersByTimeAsync(0);
    markDisplayed('tc-ext1');
    await vi.advanceTimersByTimeAsync(200000); // 已走 200s（<300s）

    let settled = false;
    p.then(() => { settled = true; });

    sendExtend('tc-ext1');
    await vi.advanceTimersByTimeAsync(0);
    const ext = extendedMsgs(port);
    expect(ext[0].remainingMs).toBe(300000);
    expect(ext[0].extendsLeft).toBe(2);

    // 从延长点再走 200s：累计 400s 但已重置，距延长仅 200s，未超时
    await vi.advanceTimersByTimeAsync(200000);
    expect(settled).toBe(false);

    // 再走 150s（距延长 350s > 300s）→ 超时结算
    await vi.advanceTimersByTimeAsync(150000);
    const result = await p;
    expect(result.success).toBe(true);
    expect(port.postMessage.mock.calls.some((c) => c[0].type === 'CLARIFY_TIMEOUT')).toBe(true);

    bgState.unregisterKeepalivePort('s-ext1');
  });

  test('延长次数上限：第 4 次被拒（denied），前 3 次 extendsLeft 递减', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('s-ext2', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-ext2', 's-ext2');
    await vi.advanceTimersByTimeAsync(0);
    markDisplayed('tc-ext2');

    for (let i = 0; i < 4; i++) {
      sendExtend('tc-ext2');
      await vi.advanceTimersByTimeAsync(0);
    }
    const ext = extendedMsgs(port);
    expect(ext.length).toBe(4);
    expect(ext[0].extendsLeft).toBe(2);
    expect(ext[1].extendsLeft).toBe(1);
    expect(ext[2].extendsLeft).toBe(0);
    expect(ext[3].denied).toBe(true);
    expect(ext[3].remainingMs).toBeNull();

    // 收敛：最后一次成功延长后计时器仍在跑，推进到超时
    await vi.advanceTimersByTimeAsync(300000 + 1000);
    await p;
    bgState.unregisterKeepalivePort('s-ext2');
  });

  test('未呈现（未起计时）时延长无效：不回 CLARIFY_EXTENDED', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('s-ext3', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-ext3', 's-ext3');
    await vi.advanceTimersByTimeAsync(0);
    sendExtend('tc-ext3');
    await vi.advanceTimersByTimeAsync(0);
    expect(extendedMsgs(port).length).toBe(0);

    await drainToTimeout('tc-ext3');
    await p;
    bgState.unregisterKeepalivePort('s-ext3');
  });

  test('toolCallId 不匹配的延长被忽略（并行子任务不串台）', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('s-ext4', port);

    const p = executeClarifyQuestion({ question: 'q?', options: ['a'] }, 'tc-ext4', 's-ext4');
    await vi.advanceTimersByTimeAsync(0);
    markDisplayed('tc-ext4');
    sendExtend('other-tool-call-id');
    await vi.advanceTimersByTimeAsync(0);
    expect(extendedMsgs(port).length).toBe(0);

    await drainToTimeout('tc-ext4');
    await p;
    bgState.unregisterKeepalivePort('s-ext4');
  });
});

describe('超时兜底：按推荐项结算，而不是「没有答案」', () => {
  test('推荐索引合法：按推荐项结算，并写明这是超时默认值、禁止重问', async () => {
    const p = executeClarifyQuestion(
      { question: '用哪个包管理器？', options: ['npm', 'pnpm', 'yarn'], recommendedOption: 1 },
      'tc-def', 's-def'
    );
    await vi.advanceTimersByTimeAsync(0);

    await drainToTimeout('tc-def');
    const result = await p;

    // 用户没看到 / 没点选时，任务不能白等：直接按推荐项给出答案
    expect(result.success).toBe(true);
    expect(result.content).toContain('pnpm');
    expect(result.content).toMatch(/推荐项/);
    // 明确禁止就同一问题反复追问（否则会反复弹框、用户仍然看不到）
    expect(result.content).toMatch(/不要.*再次追问/);
    expect(result.tool_call_id).toBe('tc-def');
  });

  test('推荐索引越界 / 缺失：回落到第一项（与弹窗预选口径一致）', async () => {
    const p1 = executeClarifyQuestion(
      { question: 'q1?', options: ['甲', '乙'], recommendedOption: 9 },
      'tc-oob', 's-oob'
    );
    await vi.advanceTimersByTimeAsync(0);
    await drainToTimeout('tc-oob');
    const r1 = await p1;
    expect(r1.success).toBe(true);
    expect(r1.content).toContain('甲');

    const p2 = executeClarifyQuestion({ question: 'q2?', options: ['丙', '丁'] }, 'tc-norec', 's-norec');
    await vi.advanceTimersByTimeAsync(0);
    await drainToTimeout('tc-norec');
    const r2 = await p2;
    expect(r2.success).toBe(true);
    expect(r2.content).toContain('丙');
  });

  test('options 为空：无值可代选，仍按未澄清失败收口', async () => {
    const p = executeClarifyQuestion({ question: 'q?', options: [] }, 'tc-empty', 's-empty');
    await vi.advanceTimersByTimeAsync(0);

    await drainToTimeout('tc-empty');
    const result = await p;

    expect(result.success).toBe(false);
    expect(result.error).toMatch(/澄清/);
  });

  test('面板被主动关掉：不代选（与超时的口径必须区分开）', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('s-closed', port);
    const p = executeClarifyQuestion(
      { question: 'q?', options: ['甲', '乙'], recommendedOption: 1 },
      'tc-closed', 's-closed'
    );
    await vi.advanceTimersByTimeAsync(0);

    // 面板消失 → 后台轮询（5s 一次）发现 SIDE_PANEL 上下文为空，提前终止等待
    const snapshot = globalThis.chrome.runtime.getContexts;
    globalThis.chrome.runtime.getContexts = () => Promise.resolve([]);
    try {
      await vi.advanceTimersByTimeAsync(5100);
      const result = await p;
      expect(result.success).toBe(false);
      expect(result.error).toMatch(/Side Panel/);
      const timeoutMsg = port.postMessage.mock.calls.map((c) => c[0]).find((m) => m.type === 'CLARIFY_TIMEOUT');
      expect(timeoutMsg).toMatchObject({ reason: 'panel_closed', defaultOption: null });
    } finally {
      globalThis.chrome.runtime.getContexts = snapshot;
      bgState.unregisterKeepalivePort('s-closed');
    }
  });
});
