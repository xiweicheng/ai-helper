// @vitest-environment jsdom
// clarify-dialog-queue.unit.test.js - 澄清弹窗并发队列回归测试
//
// 回归背景：旧实现是单槽位，第二条 SHOW_CLARIFY_DIALOG 会就地覆盖
// state.currentClarifyToolCallId 并重绘同一个 DOM —— 第一条提问被顶掉、用户在界面上
// 看不到它，只能在后台白等到超时，带着「澄清超时」的错误结果继续（提问丢了、任务被拖）。
// 并行子任务（派生 sessionId）会同时提出多个澄清，这正是触发条件。
//
// 现约定：逐条排队呈现、各自作答；回传带本条关联 ID；只有真正呈现的那条才上行
// INTERACTION_DISPLAYED；后台超时撤销按 toolCallId 精确匹配，不得误伤另一条。
import { describe, test, expect, beforeEach, vi } from 'vitest';

const noop = () => {};
let sentMessages = [];

/** 只取用户应答类回传，排除呈现回执上行 */
const responses = () => sentMessages.filter((m) => m.type === 'CLARIFY_RESPONSE');
/** 呈现回执 */
const displayed = () =>
  sentMessages.filter((m) => m.type === 'INTERACTION_DISPLAYED' && m.data?.kind === 'clarify');

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
      sentMessages.push(msg);
      return Promise.resolve({});
    },
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
  notifications: { create: noop },
};

function mountDom({ withOverlay = true } = {}) {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    ${withOverlay ? `<div class="clarify-overlay" id="clarifyOverlay">
      <div id="clarifySessionName"></div>
      <div id="clarifyQuestion"></div>
      <div id="clarifyTimer"><span id="clarifyTimerText"></span></div>
      <div id="clarifyOptionsList">
        <div id="clarifyCustomInput"><textarea id="clarifyCustomTextarea"></textarea></div>
      </div>
      <div id="clarifyAdditionalInfo"><textarea id="clarifyAdditionalTextarea"></textarea></div>
      <button id="clarifyCancelBtn"></button>
      <button id="clarifyConfirmBtn"></button>
    </div>` : ''}
  `;
}

const request = (toolCallId, sessionId, question, options = ['甲', '乙']) => ({
  question,
  options,
  recommendedOption: 0,
  allowCustomInput: true,
  allowAdditionalInfo: true,
  toolCallId,
  timeout: 300000,
  sessionId,
});

let showClarifyDialog;
let handleClarifyTimeout;
let initClarifyEvents;
let state;
let t;

beforeEach(async () => {
  vi.useFakeTimers();
  sentMessages = [];
  mountDom();
  // 每个用例拿一份全新模块实例，避免队列/闸门的模块级状态串味
  vi.resetModules();
  const mod = await import('../../src/side_panel/clarify-dialog.js');
  showClarifyDialog = mod.showClarifyDialog;
  handleClarifyTimeout = mod.handleClarifyTimeout;
  initClarifyEvents = mod.initClarifyEvents;
  state = (await import('../../src/side_panel/state.js')).default;
  t = (await import('../../src/shared/i18n.js')).t;
  initClarifyEvents();
});

describe('澄清弹窗并发队列（不再互相覆盖）', () => {
  test('两条并发澄清：先呈现第一条，第二条排队并在问题文案中告知', async () => {
    showClarifyDialog(request('call-A', 'S_0', '要不要现在发布？'));
    showClarifyDialog(request('call-B', 'S_1', '回滚哪个版本？'));
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(true);
    expect(document.getElementById('clarifyQuestion').textContent).toContain('要不要现在发布？');
    expect(document.getElementById('clarifyQuestion').textContent).not.toContain('回滚哪个版本？');
    // B 没有顶掉 A，而是被明确告知还在排队
    expect(document.getElementById('clarifyQuestion').textContent)
      .toContain(t('dialog.pendingQueueClarify', { count: 1 }));

    // 呈现回执只报了正在显示的 A：排队的 B 不得消耗后台倒计时
    expect(displayed().map((m) => m.data.toolCallId)).toEqual(['call-A']);
    expect(displayed()[0].data).toMatchObject({ kind: 'clarify', sessionId: 'S_0' });
  });

  test('提交当前条：只回传本条关联 ID 与会话，随后推进到下一条', async () => {
    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    showClarifyDialog(request('call-B', 'S_1', '问题乙'));
    await vi.advanceTimersByTimeAsync(0);

    // 选中第二个选项后提交
    document.querySelector('.clarify-option-item[data-index="1"]').click();
    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(responses()).toHaveLength(1);
    expect(responses()[0]).toMatchObject({
      type: 'CLARIFY_RESPONSE',
      toolCallId: 'call-A',
      sessionId: 'S_0',
      selectedOption: 1,
    });

    // 队列推进：现在显示 B，且不再有排队提示；此时才补上报 B 的呈现回执
    expect(document.getElementById('clarifyQuestion').textContent).toContain('问题乙');
    expect(document.getElementById('clarifyQuestion').textContent)
      .not.toContain(t('dialog.pendingQueueClarify', { count: 1 }));
    expect(displayed().map((m) => m.data.toolCallId)).toEqual(['call-A', 'call-B']);

    // B 的作答由用户单独作出，带自己的会话
    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(responses()[1]).toMatchObject({ toolCallId: 'call-B', sessionId: 'S_1' });
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(false);
  });

  test('后台撤销排队条目：从队列移除，当前条答完后不再弹这条死提问', async () => {
    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    showClarifyDialog(request('call-B', 'S_1', '问题乙'));
    await vi.advanceTimersByTimeAsync(0);

    handleClarifyTimeout({ toolCallId: 'call-B', sessionId: 'S_1' });
    await vi.advanceTimersByTimeAsync(0);

    // 排队条目被撤销：不得回发响应，也不影响正在显示的 A
    expect(responses()).toHaveLength(0);
    expect(state.currentClarifyToolCallId).toBe('call-A');
    expect(document.getElementById('clarifyQuestion').textContent)
      .not.toContain(t('dialog.pendingQueueClarify', { count: 1 }));

    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(responses().map((m) => m.toolCallId)).toEqual(['call-A']);
    // B 从未呈现也就从未上报回执，队列空时弹层关闭
    expect(displayed().map((m) => m.data.toolCallId)).toEqual(['call-A']);
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(false);
  });

  test('后台撤销当前条目：不回发响应，队列自动推进到下一条', async () => {
    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    showClarifyDialog(request('call-B', 'S_1', '问题乙'));
    await vi.advanceTimersByTimeAsync(0);

    handleClarifyTimeout({ toolCallId: 'call-A', sessionId: 'S_0' });
    await vi.advanceTimersByTimeAsync(0);

    // 后台已自行结算，重发只会误伤后续请求
    expect(responses()).toHaveLength(0);
    // B 顶上
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(true);
    expect(document.getElementById('clarifyQuestion').textContent).toContain('问题乙');
    expect(state.currentClarifyToolCallId).toBe('call-B');
  });

  test('超时代选：toast 必须说出「已按推荐项 X 继续」，不能只报一句「已超时」', async () => {
    showClarifyDialog(request('call-A', 'S_0', '用哪个包管理器？', ['npm', 'pnpm']));
    await vi.advanceTimersByTimeAsync(0);

    handleClarifyTimeout({ toolCallId: 'call-A', sessionId: 'S_0', reason: 'timeout', defaultOption: 'pnpm' });
    await vi.advanceTimersByTimeAsync(0);

    const toastText = document.getElementById('toastContainer').textContent;
    expect(toastText).toContain(t('clarify.timedOutDefaulted', { option: 'pnpm' }));
    expect(toastText).toContain('pnpm');
  });

  test('面板被关掉（无 defaultOption）：不得谎称替用户做了选择', async () => {
    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    await vi.advanceTimersByTimeAsync(0);

    handleClarifyTimeout({ toolCallId: 'call-A', sessionId: 'S_0', reason: 'panel_closed', defaultOption: null });
    await vi.advanceTimersByTimeAsync(0);

    const toastText = document.getElementById('toastContainer').textContent;
    expect(toastText).toContain(t('clarify.timedOut'));
    expect(toastText).not.toContain('推荐项');
  });

  test('撤销按 toolCallId 精确匹配：另一会话的超时不得刷掉正在显示的澄清', async () => {
    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    await vi.advanceTimersByTimeAsync(0);

    // 并行子任务里兄弟澄清的超时通知：与当前显示的不是同一条，必须忽略
    handleClarifyTimeout({ toolCallId: 'call-OTHER', sessionId: 'S_1' });
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById('clarifyQuestion').textContent).toContain('问题甲');
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(true);
    expect(responses()).toHaveLength(0);
  });

  test('同一澄清重复投递（port 与广播双通道）：去重，不重复入队', async () => {
    const dup = request('call-A', 'S_0', '问题甲');
    showClarifyDialog(dup);
    showClarifyDialog(dup);
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById('clarifyQuestion').textContent)
      .not.toContain(t('dialog.pendingQueueClarify', { count: 1 }));

    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(responses()).toHaveLength(1);
    expect(displayed()).toHaveLength(1);
  });

  test('关联 ID 重复但问题不同（并行调用复用 id）：两条都得呈现，不得被去重吞掉', async () => {
    showClarifyDialog(request('callDup', 'S', '要不要现在发布？'));
    showClarifyDialog(request('callDup', 'S', '回滚哪个版本？'));
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById('clarifyQuestion').textContent).toContain('要不要现在发布');
    // 第二条不得被当成副本丢掉，而是排队告知
    expect(document.getElementById('clarifyQuestion').textContent)
      .toContain(t('dialog.pendingQueueClarify', { count: 1 }));

    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    // 第二条顶上，用户还能单独回答它
    expect(document.getElementById('clarifyQuestion').textContent).toContain('回滚哪个版本');
    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(responses()).toHaveLength(2);
  });

  test('弹窗 DOM 缺失：按未澄清回发结算，不让后台白等', async () => {
    mountDom({ withOverlay: false });

    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    await vi.advanceTimersByTimeAsync(0);

    // 呈现回执没发出去（无法呈现），但必须有一条确定性的结算让任务继续
    expect(displayed()).toHaveLength(0);
    expect(responses()[0]).toMatchObject({
      type: 'CLARIFY_RESPONSE',
      toolCallId: 'call-A',
      selectedOption: -1,
    });
  });

  test('面板倒计时走到 0：重发一次呈现回执，不让后台因回执丢失而永远挂着', async () => {
    showClarifyDialog(request('call-A', 'S_0', '问题甲'));
    await vi.advanceTimersByTimeAsync(0);
    expect(displayed()).toHaveLength(1);

    // 走到本条倒计时终点（后台会同时超时并下行撤销；这里只关心面板侧补发了一次回执）
    await vi.advanceTimersByTimeAsync(300000);

    expect(displayed().map((m) => m.data.toolCallId)).toEqual(['call-A', 'call-A']);
    // 重发回执不是作答：不得回发 CLARIFY_RESPONSE
    expect(responses()).toHaveLength(0);
  });
});
