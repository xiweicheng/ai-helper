// @vitest-environment jsdom
// ② 面板 reattach：新面板实例重新接入「后台仍在跑」的任务
//
// 背景：面板实例重启（SW 被回收连带页面卸载 / 用户关掉面板再点通知打开）后，
// 新实例没有 callApi listener；而会话区所有渲染都挂在同一个监听闭包里，
// 于是「后台在跑、左侧状态条在动、会话区一个字都没有」。
//
// 修法：新实例启动/切回会话时，向后台确认「哪些会话真的在跑 + 各自的活跃 callId」，
// 用独立镜像对象接管该 callId 的流式事件，收终态时落库一次（callId 去重），
// 全程不碰 callApi 的主监听与正常发送路径。
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const INDEX_SRC = readFileSync(join(ROOT, 'src/side_panel/index.js'), 'utf8');
const REATTACH_SRC = readFileSync(join(ROOT, 'src/side_panel/chat-reattach.js'), 'utf8');

// jsdom 没有 IndexedDB：session-manager-ui 在模块作用域监听 generating-state-changed，
// 会在接管/收尾时去读库渲染会话标签。本文件只验证「接管 + 气泡挂载」行为，按仓库惯例
// 把这层重 IO 依赖隔开，保持测试输出干净。
vi.mock('../../src/side_panel/session-manager-ui.js', () => ({
  handleDuplicateSession: vi.fn(),
}));

// 接管终态会走真实落库（session-manager → IndexedDB），jsdom 无 IDB：
// 只替换 appendMessageToSession 为可断言的桩，其余导出保持原样（避免连锁模块缺导出）。
vi.mock('../../src/side_panel/session-manager.js', async (importOriginal) => ({
  ...(await importOriginal()),
  appendMessageToSession: vi.fn(async () => true),
}));

// ==================== 单会话镜像状态机 ====================

function makeRenderer() {
  return {
    start: vi.fn(),
    chunk: vi.fn(),
    restore: vi.fn(),
    toolCalls: vi.fn(),
    toolResult: vi.fn(),
    agentStream: vi.fn(),
    agentStreamDone: vi.fn(),
    retrying: vi.fn(),
    preselect: vi.fn(),
    final: vi.fn(),
    error: vi.fn(),
  };
}

describe('createSessionStreamMirror 单会话流式镜像', () => {
  let createSessionStreamMirror;

  beforeEach(async () => {
    vi.resetModules();
    ({ createSessionStreamMirror } = await import('../../src/side_panel/chat-reattach.js'));
  });

  const make = (over = {}) => {
    const renderer = makeRenderer();
    const persist = vi.fn(async () => ({ written: true }));
    const onFinished = vi.fn();
    const mirror = createSessionStreamMirror({
      sessionId: 's1',
      callId: 'auto_1',
      renderer,
      persist,
      onFinished,
      emptyFallback: '（模型未返回内容）',
      ...over,
    });
    return { mirror, renderer, persist, onFinished };
  };

  test('只处理 sessionId + callId 都匹配的消息（其他会话/旧任务输出一律丢弃）', () => {
    const { mirror, renderer } = make();
    expect(mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's2', callId: 'auto_1', delta: 'x' })).toBe(false);
    expect(mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'call_old', delta: 'x' })).toBe(false);
    expect(mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: 'x' })).toBe(true);
    expect(renderer.chunk).toHaveBeenCalledTimes(1);
  });

  test('STREAM_CHUNK 增量累加后整段交给渲染器；STREAM_START 重置累积', () => {
    const { mirror, renderer } = make();
    mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '你' });
    mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '好' });
    expect(renderer.chunk).toHaveBeenLastCalledWith('你好');
    mirror.handleMessage({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_1' });
    mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '新' });
    expect(renderer.chunk).toHaveBeenLastCalledWith('新');
  });

  test('STREAM_TOOL_CALL → 工具卡片；STREAM_TOOL_RESULT → 结果；AGENT_STREAM(_DONE) → 命令输出', () => {
    const { mirror, renderer } = make();
    const toolCalls = [{ id: 't1', function: { name: 'agent_exec', arguments: '{"command":"ls"}' } }];
    mirror.handleMessage({ type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1', toolCalls });
    expect(renderer.toolCalls).toHaveBeenCalledWith(toolCalls);

    const result = { toolCallId: 't1', toolName: 'agent_exec', success: true, content: 'ok' };
    expect(mirror.handleMessage({ type: 'STREAM_TOOL_RESULT', sessionId: 's1', callId: 'auto_1', result })).toBe(true);
    expect(renderer.toolResult).toHaveBeenCalledWith(result);

    const agentMsg = { type: 'AGENT_STREAM', sessionId: 's1', callId: 'auto_1', execId: 'e1', streamType: 'stdout', data: 'a' };
    expect(mirror.handleMessage(agentMsg)).toBe(true);
    expect(renderer.agentStream).toHaveBeenCalledWith(agentMsg);
    const doneMsg = { type: 'AGENT_STREAM_DONE', sessionId: 's1', callId: 'auto_1', execId: 'e1', exitCode: 1 };
    expect(mirror.handleMessage(doneMsg)).toBe(true);
    expect(renderer.agentStreamDone).toHaveBeenCalledWith(doneMsg);
  });

  test('API_RETRYING / STREAM_PRESELECT 转给对应渲染回调', () => {
    const { mirror, renderer } = make();
    expect(mirror.handleMessage({ type: 'API_RETRYING', sessionId: 's1', callId: 'auto_1', attempt: 2, maxRetries: 3 })).toBe(true);
    expect(renderer.retrying).toHaveBeenCalledWith(2, 3);
    const preselectLog = [{ mode: 'filtered', total: 5, count: 2, tools: ['a', 'b'] }];
    expect(mirror.handleMessage({ type: 'STREAM_PRESELECT', sessionId: 's1', callId: 'auto_1', preselectLog })).toBe(true);
    expect(renderer.preselect).toHaveBeenCalledWith(preselectLog);
  });

  test('EXECUTION_STATUS_UPDATE 被消费但不渲染（接管气泡里不该有常驻状态行）', () => {
    // 真机缺陷：nodeName 被写进气泡的 .stream-status，任务都在输出了还挂着
    // 「🔧 API调用 (第2次)」。正常路径把 nodeName 交给 loading 消息的执行状态区，
    // 接管侧没有那个区域 —— 宁可什么都不渲染，也不能留一条永不清除的假状态。
    const { mirror, renderer } = make();
    expect(mirror.handleMessage({ type: 'EXECUTION_STATUS_UPDATE', sessionId: 's1', callId: 'auto_1', nodeName: '执行命令', status: 'processing' })).toBe(true);
    for (const fn of Object.values(renderer)) expect(fn).not.toHaveBeenCalled();
  });

  test('API_COMPLETE → 一律 finalize（空内容用兜底文案）+ 落库一次 + 收尾回调一次', async () => {
    const { mirror, renderer, persist, onFinished } = make();
    const res = mirror.handleMessage({
      type: 'API_COMPLETE',
      sessionId: 's1',
      callId: 'auto_1',
      content: '   ',
      executionLog: [{ id: 'n1' }],
      budgetEnded: true,
    });
    expect(res).toBe(true);
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(renderer.final).toHaveBeenCalledWith('（模型未返回内容）', [{ id: 'n1' }], expect.objectContaining({ budgetEnded: true }));
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toMatchObject({ sessionId: 's1', callId: 'auto_1', budgetEnded: true });
  });

  test('终态后的迟到消息不再处理（防同一任务二次落库/二次渲染）', async () => {
    const { mirror, renderer, persist } = make();
    mirror.handleMessage({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '完成' });
    await Promise.resolve();
    expect(mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '迟到' })).toBe(false);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(renderer.chunk).not.toHaveBeenCalled();
  });

  test('API_ERROR → 渲染错误 + 落库错误文案（面板不在场时也曾由 SW 写过，靠 callId 去重）', async () => {
    const { mirror, renderer, persist, onFinished } = make();
    mirror.handleMessage({ type: 'API_ERROR', sessionId: 's1', callId: 'auto_1', error: '网关 502', executionLog: [] });
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
    expect(renderer.error).toHaveBeenCalledWith('网关 502', []);
    expect(persist).toHaveBeenCalledTimes(1);
    expect(persist.mock.calls[0][0]).toMatchObject({ sessionId: 's1', callId: 'auto_1', error: '网关 502' });
  });

  test('落库失败不影响收尾（渲染已完成，界面不能卡在“思考中”）', async () => {
    const persist = vi.fn(async () => { throw new Error('IDB 挂了'); });
    const { mirror, onFinished } = make({ persist });
    mirror.handleMessage({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '完成' });
    await vi.waitFor(() => expect(onFinished).toHaveBeenCalledTimes(1));
  });

  test('等待窗口内的消息按到达顺序回放，连续增量合成一次渲染', () => {
    const { mirror, renderer } = make({ awaitSnapshot: true });
    mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: 'A' });
    mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: 'B' });
    mirror.handleMessage({ type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1', toolCalls: [{ id: 't1' }] });
    mirror.handleMessage({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: 'C' });
    // 窗口里一条都不渲染：先渲染就会被随后的还原覆盖掉
    expect(renderer.chunk).not.toHaveBeenCalled();
    expect(renderer.toolCalls).not.toHaveBeenCalled();

    mirror.restore(null);

    // 顺序必须是真实到达顺序：AB → 工具卡片 → ABC（连续增量不会退化成逐条重渲染）
    expect(renderer.chunk.mock.calls.map((c) => c[0])).toEqual(['AB', 'ABC']);
    expect(renderer.toolCalls).toHaveBeenCalledTimes(1);
  });

  test('终态在窗口内先到：先补渲染积压再收口，并且不再还原快照', async () => {
    const { mirror, renderer } = make({ awaitSnapshot: true });
    mirror.handleMessage({ type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1', toolCalls: [{ id: 't1' }] });
    mirror.handleMessage({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '完成' });
    expect(renderer.toolCalls).toHaveBeenCalledTimes(1);
    expect(renderer.final).toHaveBeenCalledTimes(1);

    // 快照读盘晚一步回来，也不能把已收口的气泡盖回半截流
    mirror.restore({ callId: 'auto_1', html: '<div class="stream-content"></div>', accumulated: '半截' });
    expect(renderer.restore).not.toHaveBeenCalled();
    expect(renderer.chunk).not.toHaveBeenCalled();
  });
});

// ==================== 接管决策（attach bookkeeping） ====================

describe('createReattachManager 接管决策', () => {
  let createReattachManager;

  beforeEach(async () => {
    vi.resetModules();
    ({ createReattachManager } = await import('../../src/side_panel/chat-reattach.js'));
  });

  const build = (over = {}) => {
    const attached = [];
    const manager = createReattachManager({
      queryRunning: vi.fn(async () => ({
        activeSessionIds: ['s1', 's2'],
        activeCallIds: { s1: 'auto_1', s2: 'auto_2' },
      })),
      hasLocalListener: vi.fn(() => false),
      isAttached: vi.fn(() => false),
      attach: vi.fn((sid, cid) => { attached.push([sid, cid]); }),
      ...over,
    });
    return { manager, attached };
  };

  test('对「后台在跑 + 有活跃 callId + 本地无 listener」的会话发起接管', async () => {
    const { manager, attached } = build();
    await manager.syncFromBackground();
    expect(attached).toEqual([['s1', 'auto_1'], ['s2', 'auto_2']]);
  });

  test('本地已有 listener（原发起实例）→ 跳过，绝不抢它的流', async () => {
    const { manager, attached } = build({ hasLocalListener: vi.fn((sid) => sid === 's1') });
    await manager.syncFromBackground();
    expect(attached).toEqual([['s2', 'auto_2']]);
  });

  test('已接管同一 callId → 幂等跳过', async () => {
    const { manager, attached } = build({ isAttached: vi.fn((sid, cid) => sid === 's1' && cid === 'auto_1') });
    await manager.syncFromBackground();
    expect(attached).toEqual([['s2', 'auto_2']]);
  });

  test('后台没有活跃 callId 的会话不接管（状态可能在陈旧降级中）', async () => {
    const { manager, attached } = build({
      queryRunning: vi.fn(async () => ({ activeSessionIds: ['s1', 's2'], activeCallIds: { s1: 'auto_1' } })),
    });
    await manager.syncFromBackground();
    expect(attached).toEqual([['s1', 'auto_1']]);
  });

  test('查询失败（SW 未就绪）→ 静默降级，不抛错', async () => {
    const { manager } = build({ queryRunning: vi.fn(async () => { throw new Error('no sw'); }) });
    await expect(manager.syncFromBackground()).resolves.toBeUndefined();
  });
});

// ==================== 生产接线：气泡挂载 ====================

// 上一个用例的模块实例不会自己消失：它的 document/chrome 监听还挂着，
// 会跨 describe 继续响应事件（表现为「本该红的用例莫名变绿」）。
// 因此这条清理链必须是文件级的，不能每个 describe 各自记一份。
let prevMod = null;
// 上一个用例的模块实例里可能还挂着快照节流定时器：不摘掉的话它会在本用例中途把
// 「上一个气泡的 HTML」写进同一个 storage key，把种下的快照顶掉（跨用例串台）
let prevSnap = null;

// 气泡快照走 chrome.storage.session（跨面板实例的唯一通道）：内存版假实现，
// set/get/remove 齐全，顺带消掉 syncPendingSessionsToStorage 缺 storage.session 的噪音。
let sessionStore = null;

function installSessionStore() {
  sessionStore = {};
  if (typeof chrome === 'undefined') global.chrome = {};
  if (!chrome.storage) chrome.storage = {};
  chrome.storage.session = {
    set: vi.fn(async (obj) => { Object.assign(sessionStore, obj); }),
    get: vi.fn(async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      const out = {};
      for (const k of list) if (sessionStore[k] !== undefined) out[k] = sessionStore[k];
      return out;
    }),
    remove: vi.fn(async (keys) => {
      const list = Array.isArray(keys) ? keys : [keys];
      for (const k of list) delete sessionStore[k];
    }),
  };
}

describe('生产接线：接管的气泡只在目标会话可见时进 DOM', () => {
  let api;
  let state;
  let chatContainer;
  let runningState;

  beforeEach(async () => {
    // 上一轮模块实例的 document 监听要先摘掉：resetModules 会造出新实例，旧监听不会自己消失
    if (prevMod) prevMod.__resetChatReattachForTest();
    if (prevSnap) prevSnap.__resetStreamSnapshotForTest();
    vi.resetModules();
    document.body.innerHTML = '<div id="chatContainer"></div>';
    chatContainer = document.getElementById('chatContainer');
    chrome.runtime.onMessage = { addListener: vi.fn(), removeListener: vi.fn() };
    // 后台登记可变：测试里改成新 callId 模拟「SW 被杀后自动续跑接管了这一轮」
    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_1' } };
    chrome.runtime.sendMessage = (msg, cb) => { cb(runningState); };
    installSessionStore();
    state = (await import('../../src/side_panel/state.js')).default;
    // 落库桩是文件级共享的：上一个用例的调用记录会污染「只落库一次」断言
    (await import('../../src/side_panel/session-manager.js')).appendMessageToSession.mockClear();
    state.activeSessionId = 'other';
    const mod = await import('../../src/side_panel/chat-reattach.js');
    mod.__resetChatReattachForTest();
    api = mod.initChatReattach();
    prevMod = mod;
    prevSnap = await import('../../src/side_panel/stream-snapshot.js');
  });

  test('接管的会话当前不可见 → 不把气泡塞进当前会话 DOM', async () => {
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);
  });

  test('切回该会话后气泡挂上来（否则只剩状态条在动，会话区仍然空白）', async () => {
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);

    state.activeSessionId = 's1';
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    syncReattachForSession('s1');

    expect(chatContainer.children.length).toBe(1);
    expect(chatContainer.children[0].dataset.sessionId).toBe('s1');
  });

  test('启动期补水（session-hydrated）后把游离气泡挂上来', async () => {
    // 启动阶段 chat-manager 只发 session-hydrated、不发 session-switched
    // （后者会重建聊天区，启动期重建会打架）。reattach 若只听 session-switched，
    // 重开面板时就只能在库里看到结果、会话区永远没有实时输出——真机探针复现的就是这个。
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);

    state.activeSessionId = 's1';
    document.dispatchEvent(new CustomEvent('session-hydrated', { detail: { sessionId: 's1' } }));

    expect(chatContainer.children.length).toBe(1);
    expect(chatContainer.children[0].dataset.sessionId).toBe('s1');
  });

  test('历史渲染完成后气泡必须回到末尾（启动期先挂会被后 append 的历史挤到上面）', async () => {
    // 真机缺陷：重开面板时 activeSessionId 恢复的就是那个正在跑的会话，启动期那一次
    // 接管会把气泡挂进当时还空的会话区；loadChatHistory 随后 append 历史消息，气泡就
    // 被挤到用户提问上面。探针证据：
    //   [order] streaming@1 / total 3 → ["selection-floating-menu","...streaming","message user"]
    // 既有单测全部在「接管会话不可见」下跑（activeSessionId='other'），恰好绕过这条路径。
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);

    // 启动期补水：会话此刻可见，游离气泡被挂回（历史还没渲染）
    state.activeSessionId = 's1';
    document.dispatchEvent(new CustomEvent('session-hydrated', { detail: { sessionId: 's1' } }));
    expect(chatContainer.children.length).toBe(1);

    // 历史渲染在气泡之后才开始 → 用户消息落在气泡下面，顺序错位
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    chatContainer.appendChild(userMsg);
    expect(chatContainer.children[0].classList.contains('streaming')).toBe(true);

    // 渲染完成的信号到达后，必须把接管气泡移回末尾
    document.dispatchEvent(new CustomEvent('chat-history-rendered', { detail: { sessionId: 's1' } }));
    const kids = [...chatContainer.children];
    expect(kids[kids.length - 1].classList.contains('streaming')).toBe(true);
    expect(kids[kids.length - 1].dataset.sessionId).toBe('s1');
    // 移动不能把已渲染的历史消息弄丢
    expect(kids.filter((k) => k.classList.contains('user')).length).toBe(1);
  });

  test('chat-history-rendered 不影响没有接管镜像的会话（正常会话零变化）', async () => {
    // 没有接管气泡的会话收到这条事件必须什么都不做：正常发送流程的会话区不能因为
    // 多一次 reconnect 被重排，更不能凭空长出一个「思考中」气泡。
    const userMsg = document.createElement('div');
    userMsg.className = 'message user';
    chatContainer.appendChild(userMsg);

    document.dispatchEvent(new CustomEvent('chat-history-rendered', { detail: { sessionId: 's2' } }));

    expect(chatContainer.children.length).toBe(1);
    expect(chatContainer.children[0].classList.contains('streaming')).toBe(false);
  });

  test('session-hydrated 不碰不属于本镜像的会话（正常会话零影响）', async () => {
    document.dispatchEvent(new CustomEvent('session-hydrated', { detail: { sessionId: 'other' } }));
    expect(chatContainer.children.length).toBe(0);
  });

  // ==================== 接管期间的消息口径必须与正常监听一致 ====================
  // 正常 callApi 监听处理 16 种广播，镜像一开始只处理 6 种：接管期间工具结果、
  // 命令输出、预筛选卡、重试提示全部静默丢弃，用户看到的就是「内容不全 / 只剩之后的正文」。

  test('EXECUTION_STATUS_UPDATE 不得在气泡里渲染常驻状态行（正常流程根本不写 .stream-status）', async () => {
    // 真机反馈：接管后的气泡下方多出一行「🔧 API调用 (第2次)」并且一直挂着。
    // nodeName 在正常路径是走状态区 / 左侧 dock 的，气泡内的 .stream-status 只在
    // STREAM_DONE 被清空、finalize 时被 remove —— 接管侧不该插这根管子。
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({
      type: 'EXECUTION_STATUS_UPDATE', sessionId: 's1', callId: 'auto_1',
      nodeName: 'API调用 (第2次)', status: 'processing',
    });

    const el = chatContainer.querySelector('.message-wrapper.streaming');
    expect(el.querySelector('.stream-status').classList.contains('hidden')).toBe(true);
    expect(el.textContent).not.toContain('API调用');
  });

  test('接管期间工具结果必须落到对应工具卡片（漏掉 STREAM_TOOL_RESULT 就是结果永不显示）', async () => {
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({
      type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1',
      toolCalls: [{ id: 'tc1', function: { name: 'agent_file', arguments: '{}' } }],
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');
    expect(el.querySelector('.tool-call-item[data-tool-call-id="tc1"]')).toBeTruthy();

    listener({
      type: 'STREAM_TOOL_RESULT', sessionId: 's1', callId: 'auto_1',
      result: { toolCallId: 'tc1', toolName: 'agent_file', success: true, content: '结果正文' },
    });

    await vi.waitFor(() => {
      const card = el.querySelector('.tool-call-item[data-tool-call-id="tc1"]');
      expect(card.dataset.status).toBe('success');
      // 结果正文受 appendToolResult 的 400ms「执行中」最小展示延迟影响，一起在等待里断言
      expect(card.textContent).toContain('结果正文');
    }, { timeout: 2000 });
  });

  test('接管期间命令流式输出要建容器并持续追写（AGENT_STREAM / AGENT_STREAM_DONE）', async () => {
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({
      type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1',
      toolCalls: [{ id: 'tc9', function: { name: 'agent_exec', arguments: '{}' } }],
    });
    listener({ type: 'AGENT_STREAM', sessionId: 's1', callId: 'auto_1', execId: 'ex1', toolCallId: 'tc9', streamType: 'stdout', data: '第1行' });
    listener({ type: 'AGENT_STREAM', sessionId: 's1', callId: 'auto_1', execId: 'ex1', toolCallId: 'tc9', streamType: 'stdout', data: '\n第2行' });

    const el = chatContainer.querySelector('.message-wrapper.streaming');
    const output = el.querySelector('.agent-stream-output');
    expect(output).toBeTruthy();
    expect(output.textContent).toContain('第1行');
    expect(output.textContent).toContain('第2行');

    listener({ type: 'AGENT_STREAM_DONE', sessionId: 's1', callId: 'auto_1', execId: 'ex1', exitCode: 1 });
    expect(el.querySelector('.agent-stream-output').classList.contains('agent-stream-error')).toBe(true);
  });

  test('接管期间重试提示要就地改「思考中」文案（API_RETRYING）', async () => {
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({ type: 'API_RETRYING', sessionId: 's1', callId: 'auto_1', attempt: 2, maxRetries: 3 });

    const el = chatContainer.querySelector('.message-wrapper.streaming');
    const label = el.querySelector('.thinking-indicator:not(.hidden) .thinking-label');
    expect(label).toBeTruthy();
    expect(label.textContent).toContain('2');
  });

  test('接管后新一轮 STREAM_START 要重新出现「思考中」指示器（与正常路径同构）', async () => {
    // 口径对齐正常路径：appendToolCallItems 会隐掉（并移除）本轮指示器，
    // 下一轮 STREAM_START 必须补一个新的，否则工具执行完到下次输出之间界面是死的。
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    const el = chatContainer.querySelector('.message-wrapper.streaming');
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBeTruthy();

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '第一轮' });
    listener({
      type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1',
      toolCalls: [{ id: 'tc1', function: { name: 'agent_file', arguments: '{}' } }],
    });
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBe(null);

    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_1' });
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBeTruthy();
  });

  // ==================== 接管时必须还原「脱落期间已经输出」的内容 ====================
  // 真机反馈：关掉再打开，确实还在输出，但之前已经输出的内容看不到了，只剩之后的。
  // 根因：接管气泡从接管那一刻才开始累积。修法：流式期间把气泡 HTML + 本轮累积正文
  // 节流写进 chrome.storage.session，接管同一 callId 时读回还原。
  const SNAP_KEY = (sid) => `streamSnap|${sid}`;

  const roundHtml = (text) => `<div class="message-content"><div class="stream-content">`
    + `<div class="thinking-content"><div class="thinking-text">${text}</div></div>`
    + `</div><div class="thinking-indicator"><span class="thinking-label">思考中...</span></div>`
    + `<div class="stream-status hidden"></div></div>`;

  /**
   * 模拟「用户重新打开面板」那一次启动：storage.session 里已经有上一个实例留下的快照，
   * 然后重新走一遍 init → 接管，看还原有没有发生。
   * 快照按落盘格式直接写进存储，不借道本实例的抓拍逻辑（那是 stream-snapshot 用例的事）。
   * @returns {Promise<(msg:Object)=>boolean>} 本实例的广播入口
   */
  const restartPanelWithSnapshot = async ({ callId, text, html, accumulated, getDelayMs = 0 }) => {
    const mod = await import('../../src/side_panel/chat-reattach.js');
    const { deleteStreamingState } = await import('../../src/side_panel/chat-streaming.js');
    // beforeEach 里 initChatReattach 那次启动对齐是未 await 的：先让它落地，
    // 否则两次接管链会交叉（旧镜像晚一步覆盖新镜像），慢读盘用例会随机飘红。
    await api.syncFromBackground();
    // 把这一次启动之前的痕迹擦干净，才真的是「新实例」
    mod.__resetChatReattachForTest();
    deleteStreamingState('s1');
    document.body.innerHTML = '<div id="chatContainer"></div>';
    chatContainer = document.getElementById('chatContainer');

    sessionStore[SNAP_KEY('s1')] = {
      sessionId: 's1',
      callId,
      html: html !== undefined ? html : roundHtml(text),
      accumulated: accumulated !== undefined ? accumulated : text,
      ts: Date.now(),
    };
    if (getDelayMs) {
      // 把读盘拖慢，确保还原等待窗口里真的来了新消息
      const realGet = chrome.storage.session.get;
      chrome.storage.session.get = async (keys) => {
        await new Promise((r) => setTimeout(r, getDelayMs));
        return realGet(keys);
      };
    }

    state.activeSessionId = 's1';
    api = mod.initChatReattach();
    await api.syncFromBackground();
    return chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
  };

  test('同 callId 的快照 → 接管气泡还原脱落期正文，之后的输出接着往下走', async () => {
    const listener = await restartPanelWithSnapshot({ callId: 'auto_1', text: '脱落期间已经输出的正文' });
    const el = chatContainer.querySelector('.message-wrapper.streaming');
    await vi.waitFor(() => expect(el.textContent).toContain('脱落期间已经输出的正文'), { timeout: 2000 });

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '，接着输出的新内容' });
    // 已还原的正文不能被「本轮新文本」覆盖掉 —— 那正是用户看到的「只剩之后的内容」
    expect(el.textContent).toContain('脱落期间已经输出的正文');
    expect(el.textContent).toContain('接着输出的新内容');
  });

  test('快照里的工具卡片也要一起还原（只回填正文会把卡片结构丢掉）', async () => {
    const cardHtml = '<div class="message-content"><div class="stream-content">'
      + '<div class="thinking-content"><div class="thinking-text">已经输出的前半段</div></div>'
      + '<div class="tool-call-item" data-tool-call-id="tc1"><div class="tool-call-header">'
      + '<span class="tool-call-name">agent_file</span></div>'
      + '<div class="tool-call-result"><pre><code>执行结果正文</code></pre></div></div>'
      + '</div><div class="thinking-indicator"><span class="thinking-label">思考中...</span></div>'
      + '<div class="stream-status hidden"></div></div>';
    await restartPanelWithSnapshot({
      callId: 'auto_1', text: '', html: cardHtml, accumulated: '已经输出的前半段',
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');
    await vi.waitFor(() => expect(el.querySelector('.tool-call-item')).toBeTruthy(), { timeout: 2000 });
    expect(el.querySelector('.tool-call-name').textContent).toBe('agent_file');
    expect(el.textContent).toContain('执行结果正文');

    // 还原后的续写不能把卡片冲掉：正文只替换最后一个 .thinking-content
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '，续写' });
    expect(el.querySelector('.tool-call-item')).toBeTruthy();
    expect(el.textContent).toContain('已经输出的前半段，续写');
  });

  test('接管重挂只负责把气泡挪回末尾：可见指示器与停止按钮必须活着', async () => {
    // 接管气泡一直是「活的」（镜像每条增量都在原地更新），既不需要回填正文，
    // 更不能把可见指示器收成「思考结果」——那等于同时藏掉「输出中」和停止按钮，
    // 用户只会觉得「还在输出，但界面看起来已经结束了，而且停不下来」。
    const liveHtml = '<div class="message-content"><div class="stream-content">'
      + '<div class="thinking-content"><div class="thinking-text">脱落期正文</div></div>'
      + '</div><div class="thinking-indicator">'
      + '<span class="thinking-label">输出中...</span>'
      + '<button class="streaming-stop-btn">停止</button></div>'
      + '<div class="stream-status hidden"></div></div>';
    const listener = await restartPanelWithSnapshot({
      callId: 'auto_1', text: '', html: liveHtml, accumulated: '脱落期正文',
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');
    await vi.waitFor(() => expect(el.textContent).toContain('脱落期正文'), { timeout: 2000 });

    document.dispatchEvent(new CustomEvent('chat-history-rendered', { detail: { sessionId: 's1' } }));

    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBeTruthy();
    expect(el.querySelector('.thinking-indicator:not(.hidden) .streaming-stop-btn')).toBeTruthy();

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '，续写A' });
    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(1);
    expect(el.textContent.replace(/\s+/g, '')).toContain('脱落期正文，续写A');
  });


  test('快照属于别的 callId → 不还原（上一轮的内容不能接进这一轮）', async () => {
    const listener = await restartPanelWithSnapshot({ callId: 'call_old_round', text: '别轮的旧内容' });
    const el = chatContainer.querySelector('.message-wrapper.streaming');

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '本轮正文' });
    await vi.waitFor(() => expect(el.textContent).toContain('本轮正文'), { timeout: 2000 });
    expect(el.textContent).not.toContain('别轮的旧内容');
  });

  test('还原等待期间到达的 chunk 不丢：先攒着，还原完一起补渲染', async () => {
    const listener = await restartPanelWithSnapshot({
      callId: 'auto_1', text: '快照里的前半段', accumulated: '快照里的前半段', getDelayMs: 60,
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '等待期内的新段落' });

    await vi.waitFor(() => {
      expect(el.textContent).toContain('快照里的前半段');
      expect(el.textContent).toContain('等待期内的新段落');
    }, { timeout: 3000 });
  });

  // 等待窗口里只把 chunk 攒着是不够的：工具卡片/命令输出先渲染出去，
  // 随后 restore() 的 innerHTML 一盖就把它们抹掉。命令输出那条尤其致命：
  // 渲染器按 execId 缓存的 entry.element 变成脱离文档的孤儿节点，
  // 之后每条增量都写进那个看不见的节点 —— 这个 execId 的显示永久冻结。
  test('等待窗口内到达的工具卡片不能被还原覆盖掉', async () => {
    const listener = await restartPanelWithSnapshot({
      callId: 'auto_1', text: '快照里的前半段', accumulated: '快照里的前半段', getDelayMs: 60,
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');

    listener({
      type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1',
      toolCalls: [{ id: 'tc9', function: { name: 'agent_exec', arguments: '{"command":"ls"}' } }],
    });

    await vi.waitFor(() => {
      expect(el.textContent).toContain('快照里的前半段');
      const card = el.querySelector('.tool-call-item[data-tool-call-id="tc9"]');
      expect(card).toBeTruthy();
      expect(card.textContent).toContain('agent_exec');
    }, { timeout: 3000 });
  });

  test('等待窗口内开始的命令输出要跟着还原后的 DOM 走（不能写进孤儿节点）', async () => {
    const listener = await restartPanelWithSnapshot({
      callId: 'auto_1', text: '快照里的前半段', accumulated: '快照里的前半段', getDelayMs: 60,
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');

    listener({
      type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1',
      toolCalls: [{ id: 'tc9', function: { name: 'agent_exec', arguments: '{"command":"du"}' } }],
    });
    listener({ type: 'AGENT_STREAM', sessionId: 's1', callId: 'auto_1', execId: 'e1', toolCallId: 'tc9', streamType: 'stdout', data: '第一行' });
    listener({ type: 'AGENT_STREAM', sessionId: 's1', callId: 'auto_1', execId: 'e1', toolCallId: 'tc9', streamType: 'stdout', data: '第二行' });

    await vi.waitFor(() => {
      const codeEl = el.querySelector('.tool-call-item[data-tool-call-id="tc9"] .agent-stream-output code');
      expect(codeEl).toBeTruthy();
      expect(codeEl.textContent).toContain('第一行第二行');
    }, { timeout: 3000 });
    // 写进去的那个节点必须还在文档里：否则界面永远停在最后一帧
    expect(document.contains(el.querySelector('.tool-call-item[data-tool-call-id="tc9"] .agent-stream-output code'))).toBe(true);
  });

  // 窗口里遇到新一轮 STREAM_START 不能顺手把还原扫掉：同一个 callId 里
  // 每一轮 ReAct 都是一次 STREAM_START，扫掉就是「脱落期已经输出的内容又看不到了」。
  test('等待窗口内新一轮起步 → 旧快照照样还原，新轮输出接着往下走', async () => {
    // 快照形状取「上一轮已由工具调用收口、新一轮还没起步」的真实形态：
    // 指示器已被 appendToolCallItems 收起/移除，本轮正文后面跟着 badge + 工具卡片。
    const closedRoundHtml = '<div class="message-content"><div class="stream-content">'
      + '<div class="thinking-content"><div class="thinking-text">脱落期已经输出的一段</div></div>'
      + '<span class="thinking-badge">思考结果</span>'
      + '<div class="tool-call-item" data-tool-call-id="tc1"><div class="tool-call-header">'
      + '<span class="tool-call-name">agent_exec</span></div></div>'
      + '</div><div class="stream-status hidden"></div></div>';
    const listener = await restartPanelWithSnapshot({
      callId: 'auto_1', text: '', html: closedRoundHtml, accumulated: '脱落期已经输出的一段', getDelayMs: 60,
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');

    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_1' });
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '新一轮的输出' });

    await vi.waitFor(() => {
      expect(el.textContent).toContain('新一轮的输出');
      expect(el.textContent).toContain('脱落期已经输出的一段');
    }, { timeout: 3000 });
    // 还原的 HTML 里已经有那一段正文，不能再拿 accumulated 补一重复的一份；
    // 新一轮自己的正文是独立一块，所以总数恰好是 2。
    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(2);
    expect(el.querySelectorAll('.stream-content .thinking-badge').length).toBe(1);
  });

  // 快照「只存正文」降级（html 为空）时，正文靠 chunk 补；html 还原成功时它已经在
  // DOM 里，再 chunk 一遍就是把同一段文字写两份。
  test('快照 HTML 已含正文时不再补写一份（accumulated 只用来记账）', async () => {
    const closedRoundHtml = '<div class="message-content"><div class="stream-content">'
      + '<div class="thinking-content"><div class="thinking-text">脱落期已经输出的一段</div></div>'
      + '<span class="thinking-badge">思考结果</span>'
      + '</div><div class="stream-status hidden"></div></div>';
    await restartPanelWithSnapshot({
      callId: 'auto_1', text: '', html: closedRoundHtml, accumulated: '脱落期已经输出的一段',
    });
    const el = chatContainer.querySelector('.message-wrapper.streaming');

    await vi.waitFor(() => expect(el.textContent).toContain('脱落期已经输出的一段'), { timeout: 2000 });

    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(1);
  });

  test('接管收终态后清除快照（不留脏快照给下一次接管）', async () => {
    await restartPanelWithSnapshot({ callId: 'auto_1', text: '将要结束的半截' });
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    expect(sessionStore[SNAP_KEY('s1')]).toBeTruthy();

    listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '完成', executionLog: [] });

    const snap = await import('../../src/side_panel/stream-snapshot.js');
    await vi.waitFor(async () => expect(await snap.readStreamSnapshot('s1')).toBe(null), { timeout: 2000 });
  });

  test('真实监听 → 会话区实时渲染 + 终态只落库一次（带 callId 去重键）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    const { appendMessageToSession } = await import('../../src/side_panel/session-manager.js');
    await api.syncFromBackground();

    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '正在分析' });

    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    expect(chatContainer.textContent).toContain('正在分析');

    listener({
      type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '分析完成',
      executionLog: [], reflectionScore: 0.9, wasRevised: true,
    });

    await vi.waitFor(() => expect(appendMessageToSession).toHaveBeenCalledTimes(1));
    expect(appendMessageToSession.mock.calls[0][0]).toBe('s1');
    expect(appendMessageToSession.mock.calls[0][1]).toMatchObject({
      role: 'assistant', content: '分析完成', callId: 'auto_1', resumed: true, reflectionScore: 0.9, wasRevised: true,
    });
  });

  test('后台把这一轮换成新 callId（SW 被杀后由闹钟自动续跑）→ 丢弃旧镜像改接新流', async () => {
    // 旧镜像盯着的 callId 已随 SW 一起死掉：若不让位，气泡会永远停在“生成中”，
    // 而续跑用的是 auto_ 新 callId，消息全被旧镜像的过滤丢掉 → 又回到“会话区没输出”。
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    const { appendMessageToSession } = await import('../../src/side_panel/session-manager.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');

    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '旧流片段' });
    expect(chatContainer.textContent).toContain('旧流片段');

    // SW 重启后自动续跑：后台登记换成 auto_2
    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_2' } };
    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_2' });

    // 让位是异步的（先向后台核对登记再动手），之后到来的片段才进新气泡
    await vi.waitFor(() => expect(chatContainer.textContent).not.toContain('旧流片段'));
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_2', delta: '续跑片段' });

    await vi.waitFor(() => expect(chatContainer.textContent).toContain('续跑片段'));
    // 旧气泡必须移除：同一个会话不能同时挂两个流式气泡
    expect(chatContainer.children.length).toBe(1);

    listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_2', content: '续跑完成', executionLog: [] });
    await vi.waitFor(() => expect(appendMessageToSession).toHaveBeenCalledTimes(1));
    expect(appendMessageToSession.mock.calls.at(-1)[1]).toMatchObject({ callId: 'auto_2', content: '续跑完成' });
  });

  test('迟到消息带回旧 callId 时不来回切换（以后台登记为准）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    // 后台仍登记 auto_1：来自已死实例的 auto_9 消息不能把镜像带走
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '正文' });
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_9', delta: '幽灵' });
    await Promise.resolve();
    await Promise.resolve();

    expect(chatContainer.children.length).toBe(1);
    expect(chatContainer.textContent).toContain('正文');
    expect(chatContainer.textContent).not.toContain('幽灵');
    // 原镜像仍然能继续消费自己的流
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '续写' });
    expect(chatContainer.textContent).toContain('正文续写');
  });

  test('换轮后的终态先到、后台已结束（登记已清）→ 用该终态收尾，不能卡在生成中', async () => {
    // 现场：SW 续跑（auto_2）很快失败，面板看到的第一个新 callId 消息就是 API_ERROR；
    // 此时 reactLoop 的 finally 已经把活跃登记清掉。若只信 QUERY_SESSION_RUNNING，
    // 会既不接管也不收尾 —— 旧气泡永久「生成中」，该会话的归档/继续执行全被挡。
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    const { appendMessageToSession } = await import('../../src/side_panel/session-manager.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '旧流' });
    expect(chatContainer.textContent).toContain('旧流');

    runningState = { activeSessionIds: [], activeCallIds: {} };
    listener({ type: 'API_ERROR', sessionId: 's1', callId: 'auto_2', error: '网关 502', executionLog: [] });

    await vi.waitFor(() => expect(appendMessageToSession).toHaveBeenCalledTimes(1));
    expect(appendMessageToSession.mock.calls.at(-1)[1]).toMatchObject({ callId: 'auto_2', content: '网关 502' });
    await vi.waitFor(() => expect(chatContainer.textContent).not.toContain('旧流'));
    expect(state.pendingCallApiSessionIds.has('s1')).toBe(false);
  });

  test('换轮后同一波多条消息只拆建一次（旧气泡不被反复清空重建）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '旧' });
    const oldEl = chatContainer.children[0];

    // 一波新 callId 消息（STREAM_START 紧跟 chunk）会各自触发一次核对
    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_2' } };
    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_2' });
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_2', delta: '新1' });
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_2', delta: '新2' });

    await vi.waitFor(() => expect(chatContainer.children[0]).not.toBe(oldEl));
    const newEl = chatContainer.children[0];
    await new Promise((r) => setTimeout(r, 100));
    // 同一波里其余核对解析时，不能把刚建好的新气泡再拆一次
    expect(chatContainer.children[0]).toBe(newEl);
    expect(chatContainer.children.length).toBe(1);
  });

  test('监听器一律返回 false（返回 true 会被当成异步 sendResponse，挂住后台广播）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    expect(listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: 'x' })).toBe(false);
    expect(listener({ type: 'STREAM_CHUNK', sessionId: 's2', callId: 'auto_9', delta: 'x' })).toBe(false);
    expect(listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_9' })).toBe(false);
    expect(listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_9', content: 'x' })).toBe(false);
  });

  test('镜像收终态时发出 generation-ended（完成标记与队列接力都挂在这个时机）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    const ended = vi.fn();
    document.addEventListener('generation-ended', ended);
    listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '完成', executionLog: [] });

    await vi.waitFor(() => expect(ended).toHaveBeenCalled());
    expect(ended.mock.calls[0][0].detail.sessionId).toBe('s1');
    document.removeEventListener('generation-ended', ended);
  });

  test('核对窗口内的新波消息不丢：终态和正文在同一波到达也要收尾', async () => {
    // 让位核对是一次跨进程往返（QUERY_SESSION_RUNNING）。续跑很快失败时，
    // STREAM_START / STREAM_CHUNK / API_ERROR 会全部落在这个窗口里；
    // 若按「核对期间一律丢弃」处理，新镜像永远等不到终态 → 又回到永久生成中。
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    const { appendMessageToSession } = await import('../../src/side_panel/session-manager.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '旧' });

    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_2' } };
    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_2' });
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_2', delta: '续跑正文' });
    listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_2', content: '续跑完成', executionLog: [] });

    await vi.waitFor(() => expect(appendMessageToSession).toHaveBeenCalledTimes(1));
    expect(appendMessageToSession.mock.calls.at(-1)[1]).toMatchObject({ callId: 'auto_2', content: '续跑完成' });
  });

  test('接管期间登记「生成中」：按钮是停止而不是发送（否则会和后台任务并发）', async () => {
    // sendMessage 的并发早退、停止按钮、队列接力都只看 generatingSessionIds；
    // 只记 pendingCallApiSessionIds 等于「界面以为自己闲着」，一点发送就在后台
    // 起了第二个顶层 reactLoop（checkpoint 互相覆盖、双流式气泡）。
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');

    expect(state.generatingSessionIds.has('s1')).toBe(true);
    expect(state.isGenerating).toBe(true);

    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '完成', executionLog: [] });
    await vi.waitFor(() => expect(state.generatingSessionIds.has('s1')).toBe(false));
  });

  test('API_ERROR 要在会话区留下可见错误（不能删掉气泡了事）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    const { appendMessageToSession } = await import('../../src/side_panel/session-manager.js');
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];

    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '写了一半' });
    listener({ type: 'API_ERROR', sessionId: 's1', callId: 'auto_1', error: '网关 502', executionLog: [] });

    await vi.waitFor(() => expect(chatContainer.textContent).toContain('网关 502'));
    // 收尾也等干净：否则本用例的异步落库会落到下一个用例的桩上
    await vi.waitFor(() => expect(appendMessageToSession).toHaveBeenCalledTimes(1));
  });

  test('迟到的收尾不能清掉换轮后的新镜像（否则新气泡变孤儿、永远收不到终态）', async () => {
    const { syncReattachForSession } = await import('../../src/side_panel/chat-reattach.js');
    const { appendMessageToSession } = await import('../../src/side_panel/session-manager.js');
    let releasePersist;
    appendMessageToSession.mockImplementationOnce(() => new Promise((r) => { releasePersist = r; }));
    await api.syncFromBackground();
    state.activeSessionId = 's1';
    syncReattachForSession('s1');
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '旧' });

    // 旧镜像已进入收尾（落库还没回来），此时后台换轮、同一会话建出新镜像
    listener({ type: 'API_COMPLETE', sessionId: 's1', callId: 'auto_1', content: '旧轮完成', executionLog: [] });
    await vi.waitFor(() => expect(typeof releasePersist).toBe('function'));
    const oldEl = chatContainer.children[0];
    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_2' } };
    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_2' });
    await vi.waitFor(() => expect(chatContainer.children[0]).not.toBe(oldEl));

    releasePersist(true);
    await new Promise((r) => setTimeout(r, 50));

    // 新镜像必须还活着：后续分片照常进 DOM，也不许多出一个气泡
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_2', delta: '续跑正文' });
    expect(chatContainer.textContent).toContain('续跑正文');
    expect(chatContainer.children.length).toBe(1);
    expect(state.generatingSessionIds.has('s1')).toBe(true);
  });

  // 观察端口只建一次的隐含假设在真机上不成立：SW 被回收会把端口从两头拆掉，
  // 而面板侧只知道自摘、没人重开。接下来的关闭就没有断开事件可报 ——
  // 「第二次关闭不弹提醒」在那个路径上又回来了。

  /**
   * 用「能拿到端口对象 + 能手动拆端口」的 connect 重新起一次面板实例。
   * beforeEach 里的那次接管用的是假 connect（返回 undefined），不擦掉就看不清
   * 「接管 → 端口被拆 → 补开」这一条链。
   * @returns {Promise<{ports:Array,killPort:()=>void,isOpen:()=>boolean,restart:()=>Promise<void>}>}
   */
  const withPortSpy = async () => {
    const ports = [];
    const prevConnect = chrome.runtime.connect;
    const mod = await import('../../src/side_panel/chat-reattach.js');
    const portMod = await import('../../src/side_panel/panel-observer-port.js');
    const { deleteStreamingState } = await import('../../src/side_panel/chat-streaming.js');

    const restart = async () => {
      // 先让 beforeEach 那一次未 await 的对齐落地，再把 connect 换成可拆的代理：
      // 反过来的话旧实例也会往 ports 里插一条，用例就看不清「几条是本次建的」
      await api.syncFromBackground();
      chrome.runtime.connect = (opts) => {
        const port = {
          name: opts.name,
          postMessage: vi.fn(),
          disconnect: vi.fn(),
          onMessage: { addListener: vi.fn() },
          onDisconnect: { addListener: (fn) => { port.kill = fn; } },
        };
        ports.push(port);
        return port;
      };
      mod.__resetChatReattachForTest();
      portMod.__resetPanelObserverPortsForTest();
      deleteStreamingState('s1');
      document.body.innerHTML = '<div id="chatContainer"></div>';
      chatContainer = document.getElementById('chatContainer');
      state.activeSessionId = 's1';
      api = mod.initChatReattach();
      await api.syncFromBackground();
    };
    await restart();

    return {
      ports,
      killPort: () => ports[ports.length - 1].kill(),
      isOpen: () => portMod.isPanelObserverOpen('s1'),
      restart,
      restoreConnect: () => { chrome.runtime.connect = prevConnect; },
    };
  };

  test('端口被 SW 拆掉后：下一次对齐要重开一条', async () => {
    const spy = await withPortSpy();
    try {
      expect(spy.ports.length).toBe(1);
      expect(spy.isOpen()).toBe(true);

      // SW 被回收：Chrome 拆掉端口，面板侧 onDisconnect 把本地引用摸掉
      spy.killPort();
      expect(spy.isOpen()).toBe(false);

      // 镜像还活着（同一 callId）→ 不会重建接管，但对齐时必须把端口补回来
      await api.syncFromBackground();
      expect(spy.ports.length).toBe(2);
      expect(spy.isOpen()).toBe(true);
    } finally {
      spy.restoreConnect();
    }
  });

  test('面板一直开着、只靠广播自愈：下一条广播就要把端口补回来', async () => {
    const spy = await withPortSpy();
    try {
      const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
      spy.killPort();
      expect(spy.isOpen()).toBe(false);

      // 这个场景里用户不会切会话、也不会重开面板：后台一发消息就该自愈，
      // 否则他直接关面板时 SW 仍然不知情（问题②在原路径上复现）
      listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '续写' });

      expect(spy.isOpen()).toBe(true);
      expect(spy.ports.length).toBe(2);
      // 端口还在时不重复建（每条广播都 connect 一次会把 SW 刷爆）
      listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_1', delta: '再续' });
      expect(spy.ports.length).toBe(2);
    } finally {
      spy.restoreConnect();
    }
  });

});

// ==================== 启动时序：面板先开、任务后到 ====================
// 上面那组的 beforeEach 里 init 已接管了 auto_1（后台一开始就在跑），测不到
// 「一开始什么都没有、后来才有任务」的场景，所以单独起一组：初始后台为空。

describe('生产接线：面板先开、任务后到（SW 被杀后闹钟续跑）', () => {
  let api;
  let state;
  let chatContainer;
  let runningState;

  beforeEach(async () => {
    if (prevMod) prevMod.__resetChatReattachForTest();
    if (prevSnap) prevSnap.__resetStreamSnapshotForTest();
    vi.resetModules();
    document.body.innerHTML = '<div id="chatContainer"></div>';
    chatContainer = document.getElementById('chatContainer');
    chrome.runtime.onMessage = { addListener: vi.fn(), removeListener: vi.fn() };
    runningState = { activeSessionIds: [], activeCallIds: {} };
    chrome.runtime.sendMessage = (msg, cb) => { cb(runningState); };
    installSessionStore();
    state = (await import('../../src/side_panel/state.js')).default;
    (await import('../../src/side_panel/session-manager.js')).appendMessageToSession.mockClear();
    state.activeSessionId = 's1';
    const mod = await import('../../src/side_panel/chat-reattach.js');
    mod.__resetChatReattachForTest();
    api = mod.initChatReattach();
    prevMod = mod;
    prevSnap = await import('../../src/side_panel/stream-snapshot.js');
  });

  test('打开时后台什么都没跑 → 不建镜像、不抢 DOM', async () => {
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);
  });

  test('之后续跑开始（新 callId 的 STREAM_START）→ 自动对齐并接管实时输出', async () => {
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);

    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_9' } };
    const listener = chrome.runtime.onMessage.addListener.mock.calls.at(-1)[0];
    listener({ type: 'STREAM_START', sessionId: 's1', callId: 'auto_9' });

    await vi.waitFor(() => expect(chatContainer.children.length).toBe(1), { timeout: 4000 });
    listener({ type: 'STREAM_CHUNK', sessionId: 's1', callId: 'auto_9', delta: '续跑输出' });
    expect(chatContainer.textContent).toContain('续跑输出');
  });

  test('hydration 补水时再对齐一次（启动快于任务开始）', async () => {
    await api.syncFromBackground();
    expect(chatContainer.children.length).toBe(0);

    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_7' } };
    document.dispatchEvent(new CustomEvent('session-hydrated', { detail: { sessionId: 's1' } }));

    await vi.waitFor(() => expect(chatContainer.children.length).toBe(1), { timeout: 4000 });
  });
});

// ==================== 接线守卫 ====================

describe('接线：侧边栏初始化与切回会话时触发 reattach', () => {
  test('「本实例是否持有该会话 callApi」用内存信号判定，不用会从 storage 恢复的 pendingCallApiSessionIds', () => {
    // pendingCallApiSessionIds 在面板重开时会被 restorePendingSessionsFromStorage 灌回来，
    // 用它判「本实例有 listener」会把「上一个实例遗留的 pending」误判成本实例持有 →
    // reattach 永不接管，修复失效。pendingCancelApiMap 只在 callApi 存活期存在且不落盘。
    expect(REATTACH_SRC).toMatch(/pendingCancelApiMap\.has\(sessionId\)/);
    expect(REATTACH_SRC).not.toMatch(/hasLocalListener:[^\n]*pendingCallApiSessionIds/);
  });

  test('接管/收尾变动生成态后同步 storage.session（否则重开会看到永远「生成中」）', () => {
    expect(REATTACH_SRC).toMatch(/syncPendingSessionsToStorage/);
  });

  test('index.js 初始化 reattach（启动同步一次）', () => {
    expect(INDEX_SRC).toMatch(/from '\.\/chat-reattach\.js'/);
    expect(INDEX_SRC).toMatch(/initChatReattach\(/);
  });

  test('session-switched 分支在 reconnectStreamingElement 之外补充 reattach（新实例没有旧元素）', () => {
    const idx = INDEX_SRC.indexOf('reconnectStreamingElement(sessionId)');
    expect(idx).toBeGreaterThan(-1);
    const around = INDEX_SRC.slice(idx, idx + 700);
    expect(around).toMatch(/reattach/i);
  });
});
