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
    toolCalls: vi.fn(),
    status: vi.fn(),
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

  test('STREAM_TOOL_CALL → 渲染工具卡片；EXECUTION_STATUS_UPDATE → 更新状态行', () => {
    const { mirror, renderer } = make();
    const toolCalls = [{ id: 't1', function: { name: 'agent_exec', arguments: '{"command":"ls"}' } }];
    mirror.handleMessage({ type: 'STREAM_TOOL_CALL', sessionId: 's1', callId: 'auto_1', toolCalls });
    expect(renderer.toolCalls).toHaveBeenCalledWith(toolCalls);
    mirror.handleMessage({ type: 'EXECUTION_STATUS_UPDATE', sessionId: 's1', callId: 'auto_1', nodeName: '执行命令' });
    expect(renderer.status).toHaveBeenCalledWith('执行命令');
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

describe('生产接线：接管的气泡只在目标会话可见时进 DOM', () => {
  let api;
  let state;
  let chatContainer;
  let runningState;

  beforeEach(async () => {
    // 上一轮模块实例的 document 监听要先摘掉：resetModules 会造出新实例，旧监听不会自己消失
    if (prevMod) prevMod.__resetChatReattachForTest();
    vi.resetModules();
    document.body.innerHTML = '<div id="chatContainer"></div>';
    chatContainer = document.getElementById('chatContainer');
    chrome.runtime.onMessage = { addListener: vi.fn(), removeListener: vi.fn() };
    // 后台登记可变：测试里改成新 callId 模拟「SW 被杀后自动续跑接管了这一轮」
    runningState = { activeSessionIds: ['s1'], activeCallIds: { s1: 'auto_1' } };
    chrome.runtime.sendMessage = (msg, cb) => { cb(runningState); };
    state = (await import('../../src/side_panel/state.js')).default;
    // 落库桩是文件级共享的：上一个用例的调用记录会污染「只落库一次」断言
    (await import('../../src/side_panel/session-manager.js')).appendMessageToSession.mockClear();
    state.activeSessionId = 'other';
    const mod = await import('../../src/side_panel/chat-reattach.js');
    mod.__resetChatReattachForTest();
    api = mod.initChatReattach();
    prevMod = mod;
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
    vi.resetModules();
    document.body.innerHTML = '<div id="chatContainer"></div>';
    chatContainer = document.getElementById('chatContainer');
    chrome.runtime.onMessage = { addListener: vi.fn(), removeListener: vi.fn() };
    runningState = { activeSessionIds: [], activeCallIds: {} };
    chrome.runtime.sendMessage = (msg, cb) => { cb(runningState); };
    state = (await import('../../src/side_panel/state.js')).default;
    (await import('../../src/side_panel/session-manager.js')).appendMessageToSession.mockClear();
    state.activeSessionId = 's1';
    const mod = await import('../../src/side_panel/chat-reattach.js');
    mod.__resetChatReattachForTest();
    api = mod.initChatReattach();
    prevMod = mod;
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
