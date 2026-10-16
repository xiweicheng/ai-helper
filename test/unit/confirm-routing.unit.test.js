// @vitest-environment jsdom
// confirm-routing.unit.test.js - 工具确认弹框定向路由回归测试
//
// 回归背景：与澄清弹框同源的串台问题——多 Tab 各开一个 Side Panel 时，
// 任一实例触发敏感工具确认后，SHOW_CONFIRM_DIALOG 通过 chrome.runtime.sendMessage
// 广播到所有 Side Panel 实例，导致其他 Tab 的侧边栏也弹出确认弹框。
//
// 修复后的约定：与澄清一致——优先通过发起实例的 keepalive 长连接点对点发送；
// port 不存在（定时任务发起、实例已关闭/刷新）或 postMessage 失败时回退广播兜底。
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

let requestToolConfirmation;
let hasLoopApproval;
let bgState;

beforeAll(async () => {
  const rl = await import('../../src/background/react-loop.js');
  requestToolConfirmation = rl.requestToolConfirmation;
  hasLoopApproval = rl.hasLoopApproval;
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

/** 取出已发出确认弹窗的关联键（无 correlationId 时由后台当场生成） */
function dialogKeys(messages = sentMessages) {
  return messages.filter((m) => m.type === 'SHOW_CONFIRM_DIALOG').map((m) => m.data.toolCallId);
}

/** 模拟面板/旧客户端上行一条消息 */
function dispatch(message) {
  for (const l of [...messageListeners]) {
    l(message, {}, noop);
  }
}

/**
 * 模拟面板真正呈现了该条（回发 INTERACTION_DISPLAYED）。
 * 后台的确认倒计时不在发出弹窗时起，而在该回执到达起 —— 面板侧确认与澄清
 * 共用单模态闸门，排队未被看到的确认不得消耗用户的应答窗口。
 */
function markDisplayed(toolCallId, sessionId = null) {
  for (const l of [...messageListeners]) {
    l({ type: 'INTERACTION_DISPLAYED', data: { kind: 'confirm', toolCallId, sessionId } }, {}, noop);
  }
}

/** 呈现后推进到确认超时（默认 300000ms），确保被测 Promise 收敛、监听器清理 */
async function drainToTimeout(toolCallId, sessionId = null) {
  markDisplayed(toolCallId, sessionId);
  await vi.advanceTimersByTimeAsync(300000 + 1000);
}

describe('工具确认弹框定向路由（多 Tab 侧边栏防串台）', () => {
  test('已注册发起实例 port：SHOW_CONFIRM_DIALOG 只走 port 点对点，不广播', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('cs-port', port);

    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-port');
    await vi.advanceTimersByTimeAsync(0);

    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const sent = port.postMessage.mock.calls[0][0];
    expect(sent.type).toBe('SHOW_CONFIRM_DIALOG');
    expect(sent.data.sessionId).toBe('cs-port');
    expect(sent.data.toolName).toBe('debug_page');
    // 关联键不得退化回工具名：同名工具的并行调用一旦共用一键，
    // 一次点击会释放所有挂起确认，面板也会把后续真实请求当成副本吞掉
    expect(sent.data.toolCallId).toMatch(/^debug_page_[0-9a-f]{8}$/);
    // 广播通道不应出现确认消息（这正是串台的根因路径）
    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG')).toBe(false);

    // 收敛：呈现后确认超时默认拒绝
    await drainToTimeout(sent.data.toolCallId, 'cs-port');
    const result = await p;
    expect(result).toBe(false);

    bgState.unregisterKeepalivePort('cs-port', port);
  });

  test('无 port（如定时任务发起）：回退广播兜底', async () => {
    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-bg');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG' && m.data?.sessionId === 'cs-bg')).toBe(true);

    await drainToTimeout(dialogKeys()[0], 'cs-bg');
    await p;
  });

  test('port 已失效（postMessage 抛错）：回退广播兜底', async () => {
    const port = makePort();
    port.postMessage.mockImplementation(() => { throw new Error('Attempting to use a disconnected port object'); });
    bgState.registerKeepalivePort('cs-dead', port);

    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-dead');
    await vi.advanceTimersByTimeAsync(0);

    expect(sentMessages.some((m) => m.type === 'SHOW_CONFIRM_DIALOG' && m.data?.sessionId === 'cs-dead')).toBe(true);

    await drainToTimeout(dialogKeys()[0], 'cs-dead');
    await p;
    bgState.unregisterKeepalivePort('cs-dead', port);
  });

  test('定向发送后，用户确认（广播回程）按 toolCallId 正常 resolve', async () => {
    const port = makePort();
    bgState.registerKeepalivePort('cs-resp', port);

    const p = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-resp');
    await vi.advanceTimersByTimeAsync(0);
    expect(port.postMessage).toHaveBeenCalledTimes(1);
    const key = port.postMessage.mock.calls[0][0].data.toolCallId;

    // 模拟发起实例提交确认结果（响应回程仍为 runtime.sendMessage 广播）
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: key, confirmed: true, scope: 'single', sessionId: 'cs-resp' });

    const result = await p;
    expect(result).toBe(true);

    bgState.unregisterKeepalivePort('cs-resp', port);
  });

  test('弹框无法送达（无 port 且广播无接收方）：fail-closed 拒用，不静默放行', async () => {
    // 侧边栏已关闭（MV3 下广播无接收方 → sendMessage 直接 reject）
    const original = globalThis.chrome.runtime.sendMessage;
    globalThis.chrome.runtime.sendMessage = () => Promise.reject(
      new Error('Could not establish connection. Receiving end does not exist.')
    );

    try {
      // 无需推进到 5 分钟超时：送达失败当拍即拒
      const result = await requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'cs-nolistener');
      expect(result).toBe(false);
      expect(messageListeners).toHaveLength(0); // 监听器已清理，不得泄漏
    } finally {
      globalThis.chrome.runtime.sendMessage = original;
    }
  });

  test('同名工具并发确认：响应按 correlationId 区分，一次点击不释放另一条', async () => {
    const pA = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'S_0', 'call-A');
    const pB = requestToolConfirmation('agent_exec', { command: 'b' }, null, 'S_1', 'call-B');
    await vi.advanceTimersByTimeAsync(0);

    // 弹窗关联键为本次调用唯一 ID，不再共用工具名
    const dialogs = sentMessages.filter((m) => m.type === 'SHOW_CONFIRM_DIALOG');
    expect(dialogs.map((d) => d.data.toolCallId)).toEqual(['call-A', 'call-B']);

    // 只应答 call-B
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-B', confirmed: true, scope: 'single', sessionId: 'S_1' });
    expect(await pB).toBe(true);

    // call-A 仍在等待，未被误放行
    let aSettled = false;
    pA.then(() => { aSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(aSettled).toBe(false);

    // call-A 自己应答后才结算
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-A', confirmed: false, scope: 'single', sessionId: 'S_0' });
    expect(await pA).toBe(false);
  });

  test('跨会话误伤回归：无 correlationId 时两条各自拿到唯一键，退化键与会话不符的响应均被忽略', async () => {
    const pMine = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'S_mine');
    const pOther = requestToolConfirmation('debug_page', { action: 'attach' }, 1, 'S_other');
    await vi.advanceTimersByTimeAsync(0);

    // 旧行为：无 correlationId 就回退工具名，两条并行确认共用一键，只能靠会话隔离兜住
    const keys = dialogKeys();
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);

    // 退化到工具名的陈旧键不得命中任何一条
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'debug_page', confirmed: true, scope: 'loop', sessionId: 'S_mine' });
    // 与会话不符的键（另一会话那一条）也不得命中本会话
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: keys[1], confirmed: true, scope: 'loop', sessionId: 'S_mine' });

    let mineSettled = false;
    pMine.then(() => { mineSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(mineSettled).toBe(false); // 未被跨会话放行
    // 且未真正应答时不得把 loop 授权记到本会话头上
    expect(hasLoopApproval('S_mine')).toBe(false);

    // 各条按自己的键 + 自己的会话应答才结算
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: keys[1], confirmed: true, scope: 'single', sessionId: 'S_other' });
    expect(await pOther).toBe(true);
    dispatch({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: keys[0], confirmed: false, scope: 'single', sessionId: 'S_mine' });
    expect(await pMine).toBe(false);
  });

  test('任务级放行扩散：点“当前任务放行”后，同任务其他挂起确认一并放行并撤销弹窗', async () => {
    // 两个并行子任务（同属一个根任务）各自挂起一条确认
    const pA = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKX_subtask_0', 'call-X0');
    const pB = requestToolConfirmation('agent_exec', { command: 'b' }, null, 'TASKX_subtask_1', 'call-X1');
    await vi.advanceTimersByTimeAsync(0);

    for (const l of [...messageListeners]) {
      l({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-X0', confirmed: true, scope: 'loop', sessionId: 'TASKX_subtask_0' }, {}, noop);
    }

    // 旧行为：B 不受闸门影响（闸门只在发起前检查），用户还得再点一次
    expect(await pA).toBe(true);
    expect(await pB).toBe(true);

    // 面板必须收到撤销，否则排队的陈旧弹窗会继续占位并吞掉后续确认
    const dismisses = sentMessages.filter((m) => m.type === 'DISMISS_CONFIRM_DIALOG');
    expect(dismisses.map((d) => d.data.toolCallId)).toEqual(['call-X1']);
    // 按整棵任务树记住放行：根会话与兄弟子任务后续均免确认
    expect(hasLoopApproval('TASKX')).toBe(true);
    expect(hasLoopApproval('TASKX_subtask_1')).toBe(true);
  });

  test('单次放行不扩散：同任务另一条挂起确认仍需用户自己应答', async () => {
    const pA = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKY_subtask_0', 'call-Y0');
    const pB = requestToolConfirmation('agent_exec', { command: 'b' }, null, 'TASKY_subtask_1', 'call-Y1');
    await vi.advanceTimersByTimeAsync(0);

    for (const l of [...messageListeners]) {
      l({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-Y0', confirmed: true, scope: 'single', sessionId: 'TASKY_subtask_0' }, {}, noop);
    }
    expect(await pA).toBe(true);

    let bSettled = false;
    pB.then(() => { bSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(bSettled).toBe(false); // 只放行了那一条
    expect(sentMessages.some((m) => m.type === 'DISMISS_CONFIRM_DIALOG')).toBe(false);

    for (const l of [...messageListeners]) {
      l({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-Y1', confirmed: false, scope: 'single', sessionId: 'TASKY_subtask_1' }, {}, noop);
    }
    expect(await pB).toBe(false);
  });

  test('跨任务不泄漏：任务 A 的放行不影响任务 B 的挂起确认', async () => {
    const pA = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKA_subtask_0', 'call-TA0');
    const pB = requestToolConfirmation('agent_exec', { command: 'b' }, null, 'TASKB_subtask_0', 'call-TB0');
    await vi.advanceTimersByTimeAsync(0);

    for (const l of [...messageListeners]) {
      l({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-TA0', confirmed: true, scope: 'loop', sessionId: 'TASKA_subtask_0' }, {}, noop);
    }
    expect(await pA).toBe(true);

    let bSettled = false;
    pB.then(() => { bSettled = true; });
    await vi.advanceTimersByTimeAsync(0);
    expect(bSettled).toBe(false);
    expect(hasLoopApproval('TASKB')).toBe(false);

    // 收敛：应答 B
    for (const l of [...messageListeners]) {
      l({ type: 'TOOL_CONFIRMATION_RESPONSE', toolCallId: 'call-TB0', confirmed: false, scope: 'single', sessionId: 'TASKB_subtask_0' }, {}, noop);
    }
    expect(await pB).toBe(false);
  });

  test('确认超时：下行撤销面板弹窗，不留陈旧弹窗', async () => {
    const p = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKZ_subtask_0', 'call-Z0');
    await vi.advanceTimersByTimeAsync(0);

    markDisplayed('call-Z0', 'TASKZ_subtask_0');
    await vi.advanceTimersByTimeAsync(300000 + 1000);
    expect(await p).toBe(false);

    const dismiss = sentMessages.find((m) => m.type === 'DISMISS_CONFIRM_DIALOG');
    expect(dismiss?.data?.toolCallId).toBe('call-Z0');
    expect(dismiss?.data?.sessionId).toBe('TASKZ_subtask_0');
  });

  test("未被呈现时不起计时：面板排队期间不得消耗确认窗口，回执到达后才起超时", async () => {
    const p = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKW_subtask_0', 'call-W0');
    await vi.advanceTimersByTimeAsync(0);

    // 旧行为：发出弹窗即起 5 分钟计时，被另一个弹窗压住时到点静默判拒
    let settled = false;
    p.then(() => { settled = true; });
    await vi.advanceTimersByTimeAsync(300000 + 1000);
    expect(settled).toBe(false);
    expect(sentMessages.some((m) => m.type === 'DISMISS_CONFIRM_DIALOG')).toBe(false);

    // 面板轮到它并呈现 → 上报回执 → 此时才开始消耗倒计时
    markDisplayed('call-W0', 'TASKW_subtask_0');
    await vi.advanceTimersByTimeAsync(300000 - 1);
    expect(settled).toBe(false);

    await vi.advanceTimersByTimeAsync(2000);
    expect(await p).toBe(false);
    const dismiss = sentMessages.find((m) => m.type === 'DISMISS_CONFIRM_DIALOG');
    expect(dismiss?.data?.toolCallId).toBe('call-W0');
  });

  test('重复呈现回执幂等：不会顺延已经开始的倒计时', async () => {
    const p = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKU_subtask_0', 'call-U0');
    await vi.advanceTimersByTimeAsync(0);

    markDisplayed('call-U0', 'TASKU_subtask_0');
    await vi.advanceTimersByTimeAsync(290000);

    // 面板侧异常路径会补发同一份回执：倒计时不得重新起算
    markDisplayed('call-U0', 'TASKU_subtask_0');
    await vi.advanceTimersByTimeAsync(11000);

    expect(await p).toBe(false);
  });

  test("面板已关闭且从未呈现：存活轮询当拍 fail-closed，不白等 5 分钟", async () => {
    // 面板已经关闭：getContexts 返回空列表
    const original = globalThis.chrome.runtime.getContexts;
    globalThis.chrome.runtime.getContexts = () => Promise.resolve([]);

    try {
      const p = requestToolConfirmation('agent_exec', { command: 'a' }, null, 'TASKV_subtask_0', 'call-V0');
      await vi.advanceTimersByTimeAsync(5000);

      expect(await p).toBe(false);
      // 同样要下行撤销，避免面板重新打开后残留陈旧弹窗
      const dismiss = sentMessages.find((m) => m.type === 'DISMISS_CONFIRM_DIALOG');
      expect(dismiss?.data?.toolCallId).toBe('call-V0');
      // 监听器不得泄漏
      expect(messageListeners).toHaveLength(0);
    } finally {
      globalThis.chrome.runtime.getContexts = original;
    }
  });
});

describe('keepalive port 注册表：断开清理防误删', () => {
  test('旧 port 的 disconnect 不删除已被新 port 覆盖的注册', () => {
    const oldPort = makePort();
    const newPort = makePort();
    bgState.registerKeepalivePort('swap-sess', oldPort);
    bgState.registerKeepalivePort('swap-sess', newPort); // 同会话新连接覆盖

    bgState.unregisterKeepalivePort('swap-sess', oldPort); // 旧连接的 onDisconnect 迟到
    expect(bgState.getKeepalivePort('swap-sess')).toBe(newPort); // 新连接不受影响

    bgState.unregisterKeepalivePort('swap-sess', newPort);
    expect(bgState.getKeepalivePort('swap-sess')).toBeNull();
  });

  test('不传 port 的 unregister 保持原有语义（直接删除）', () => {
    const port = makePort();
    bgState.registerKeepalivePort('legacy-sess', port);
    bgState.unregisterKeepalivePort('legacy-sess');
    expect(bgState.getKeepalivePort('legacy-sess')).toBeNull();
  });
});
