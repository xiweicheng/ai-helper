// @vitest-environment jsdom
// interaction-gate.unit.test.js - 交互弹窗单模态闸门回归测试
//
// 回归背景：确认弹窗（#confirmOverlay）与澄清弹窗（#clarifyOverlay）同为
// .clarify-overlay、z-index 都是 5000，且 HTML 里 confirm 在前、clarify 在后，
// 于是同层级下后出现的澄清会压住确认：两者都是全屏遮罩且澄清不响应遮罩点击关闭，
// 用户看不见也点不到确认的三条按钮，而后台确认倒计时（旧行为：发出弹窗即起）照常消耗
// —— 表现为「没机会拒绝就被判拒」。
//
// 现约定：两类弹窗都先向闸门申请呈现权，同一时刻只呈现一个（FIFO 交接），
// 只有真正呈现的那条才上行 INTERACTION_DISPLAYED，后台据此才起倒计时。
import { describe, test, expect, beforeEach, vi } from 'vitest';

const noop = () => {};
let sentMessages = [];

const displayed = (kind) =>
  sentMessages.filter((m) => m.type === 'INTERACTION_DISPLAYED' && m.data?.kind === kind);

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
    <div class="clarify-overlay" id="clarifyOverlay">
      <div id="clarifySessionName"></div>
      <div id="clarifyQuestion"></div>
      <div id="clarifyTimer"><span id="clarifyTimerText"></span></div>
      <div id="clarifyOptionsList">
        <div id="clarifyCustomInput"><textarea id="clarifyCustomTextarea"></textarea></div>
      </div>
      <div id="clarifyAdditionalInfo"><textarea id="clarifyAdditionalTextarea"></textarea></div>
      <button id="clarifyCancelBtn"></button>
      <button id="clarifyConfirmBtn"></button>
    </div>
  `;
}

const confirmRequest = (toolCallId, sessionId) => ({
  toolName: 'agent_exec',
  toolLabel: '本地命令执行',
  args: { command: `cmd-${toolCallId}` },
  message: undefined,
  toolCallId,
  sessionId,
  timeout: 300000,
});

const clarifyRequest = (toolCallId, sessionId) => ({
  question: `问题-${toolCallId}`,
  options: ['甲'],
  recommendedOption: 0,
  allowCustomInput: true,
  allowAdditionalInfo: true,
  toolCallId,
  timeout: 300000,
  sessionId,
});

let gate;
let showConfirmDialog;
let showClarifyDialog;

beforeEach(async () => {
  vi.useFakeTimers();
  sentMessages = [];
  mountDom();
  // 全新模块图：闸门与两个弹窗模块的模块级状态都不跨用例串味
  vi.resetModules();
  gate = await import('../../src/side_panel/interaction-gate.js');
  const confirm = await import('../../src/side_panel/confirm-dialog.js');
  const clarify = await import('../../src/side_panel/clarify-dialog.js');
  showConfirmDialog = confirm.showConfirmDialog;
  showClarifyDialog = clarify.showClarifyDialog;
  confirm.initConfirmEvents();
  clarify.initClarifyEvents();
});

describe('闸门调度本身（FIFO 交接、无内容不占位）', () => {
  test('持有者无内容时不占闸门：present 返回 false 立即交还给排队者', () => {
    const calls = [];
    gate.registerInteractionPresenter('a', { present: () => { calls.push('a'); return false; }, pendingCount: () => 0 });
    gate.registerInteractionPresenter('b', { present: () => { calls.push('b'); return true; }, pendingCount: () => 1 });

    gate.requestDisplay('a');
    expect(gate.getDisplayOwner()).toBeNull();

    gate.requestDisplay('b');
    expect(gate.getDisplayOwner()).toBe('b');
    expect(calls).toEqual(['a', 'b']);
  });

  test('交接按 FIFO：先排队的先拿到闸门', () => {
    gate.registerInteractionPresenter('a', { present: () => true, pendingCount: () => 1 });
    gate.registerInteractionPresenter('b', { present: () => true, pendingCount: () => 1 });
    gate.registerInteractionPresenter('c', { present: () => true, pendingCount: () => 1 });

    gate.requestDisplay('a');
    gate.requestDisplay('b');
    gate.requestDisplay('c');
    expect(gate.getDisplayOwner()).toBe('a');

    gate.releaseDisplay('a');
    expect(gate.getDisplayOwner()).toBe('b');

    gate.releaseDisplay('b');
    expect(gate.getDisplayOwner()).toBe('c');

    gate.releaseDisplay('c');
    expect(gate.getDisplayOwner()).toBeNull();
  });

  test('排队去重：同一类别重复申请只占一个队位', () => {
    gate.registerInteractionPresenter('a', { present: () => true, pendingCount: () => 1 });
    gate.registerInteractionPresenter('b', { present: () => true, pendingCount: () => 1 });

    gate.requestDisplay('a');
    gate.requestDisplay('b');
    gate.requestDisplay('b');
    gate.requestDisplay('b');

    gate.releaseDisplay('a');
    expect(gate.getDisplayOwner()).toBe('b');
    // b 只有一个队位：交还后再 release 不会把闸门再交给 b 自己
    gate.releaseDisplay('b');
    expect(gate.getDisplayOwner()).toBeNull();
  });

  test('getOtherPendingCount 汇总另一类的排队条数', () => {
    gate.registerInteractionPresenter('confirm', { present: () => true, pendingCount: () => 2 });
    gate.registerInteractionPresenter('clarify', { present: () => true, pendingCount: () => 3 });

    expect(gate.getOtherPendingCount('confirm')).toBe(3);
    expect(gate.getOtherPendingCount('clarify')).toBe(2);
  });
});

describe('确认与澄清不再互相遮挡', () => {
  test('两类同时待决：只呈现先到的确认，澄清不显示', async () => {
    showConfirmDialog(confirmRequest('call-C1', 'S_0'));
    showClarifyDialog(clarifyRequest('call-X1', 'S_1'));
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById('confirmOverlay').style.display).toBe('flex');
    // 旧行为：澄清弹窗直接 add('show') 把确认压在下面，用户点不到确认按钮
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(false);
    expect(gate.getDisplayOwner()).toBe('confirm');
  });

  test('答完确认后闸门交接给澄清，此时才上报澄清的呈现回执', async () => {
    showConfirmDialog(confirmRequest('call-C1', 'S_0'));
    showClarifyDialog(clarifyRequest('call-X1', 'S_1'));
    await vi.advanceTimersByTimeAsync(0);

    document.getElementById('confirmApproveOnceBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(document.getElementById('confirmOverlay').style.display).toBe('none');
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(true);
    expect(gate.getDisplayOwner()).toBe('clarify');

    // 排队期间不得消耗倒计时：澄清的回执只在它真正显示时出现
    expect(displayed('confirm').map((m) => m.data.toolCallId)).toEqual(['call-C1']);
    expect(displayed('clarify').map((m) => m.data.toolCallId)).toEqual(['call-X1']);
  });

  test('被挡的一方由当前弹窗代告排队总数：确认文案带澄清条数', async () => {
    const { t } = await import('../../src/shared/i18n.js');
    showClarifyDialog(clarifyRequest('call-X1', 'S_0'));
    showConfirmDialog(confirmRequest('call-C1', 'S_1'));
    await vi.advanceTimersByTimeAsync(0);

    // 澄清先到并持有闸门：确认排在门外，用户至少能从澄清弹窗上看到有确认在等
    expect(document.getElementById('clarifyOverlay').classList.contains('show')).toBe(true);
    expect(document.getElementById('clarifyQuestion').textContent)
      .toContain(t('dialog.otherPending', { count: 1 }));

    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('confirmOverlay').style.display).toBe('flex');
  });

  test('同类多条 + 另一类插队：队列交替推进不漏条', async () => {
    showConfirmDialog(confirmRequest('call-C1', 'S_0'));
    showConfirmDialog(confirmRequest('call-C2', 'S_0'));
    showClarifyDialog(clarifyRequest('call-X1', 'S_1'));
    await vi.advanceTimersByTimeAsync(0);

    // C1 显示中，C2 与 X1 都在各自队列里
    document.getElementById('confirmApproveOnceBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    // 仍持有闸门的确认继续消费自己的队列，不被澄清抢走
    expect(document.getElementById('confirmArgsSummary').innerHTML).toContain('cmd-call-C2');
    expect(gate.getDisplayOwner()).toBe('confirm');

    document.getElementById('confirmDenyBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.getDisplayOwner()).toBe('clarify');
    expect(document.getElementById('clarifyQuestion').textContent).toContain('问题-call-X1');

    document.getElementById('clarifyConfirmBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(gate.getDisplayOwner()).toBeNull();
    expect(displayed('confirm').map((m) => m.data.toolCallId)).toEqual(['call-C1', 'call-C2']);
    expect(displayed('clarify').map((m) => m.data.toolCallId)).toEqual(['call-X1']);
  });
});
