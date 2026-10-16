// @vitest-environment jsdom
// confirm-dialog-queue.unit.test.js - 确认弹窗并发队列回归测试
//
// 回归背景：旧实现是单槽位，并发确认请求互相覆盖（state.currentConfirmToolCallId
// 被后到的请求改写），用户只看到一条弹窗并点"本次放行"，其余挂起确认在界面上
// 不可见、却在后台按工具名匹配被一并放行（串扰）。
// 现约定：逐条排队展示、各自应答，回传必须带上当前这条的关联 ID 与会话。
import { describe, test, expect, beforeEach, vi } from 'vitest';

const noop = () => {};
let sentResponses = [];

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
      sentResponses.push(msg);
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

const request = (toolCallId, sessionId, command) => ({
  toolName: 'agent_exec',
  toolLabel: '本地命令执行',
  args: { command },
  message: undefined,
  toolCallId,
  sessionId,
  timeout: 300000,
});

let showConfirmDialog;
let dismissConfirmDialog;
let initConfirmEvents;
let t;

beforeEach(async () => {
  vi.useFakeTimers();
  sentResponses = [];
  mountDom();
  // 每个用例拿一份全新模块实例，避免队列模块级状态串味
  vi.resetModules();
  const mod = await import('../../src/side_panel/confirm-dialog.js');
  showConfirmDialog = mod.showConfirmDialog;
  dismissConfirmDialog = mod.dismissConfirmDialog;
  initConfirmEvents = mod.initConfirmEvents;
  t = (await import('../../src/shared/i18n.js')).t;
  initConfirmEvents();
});

describe('确认弹窗并发队列（不再互相覆盖）', () => {
  test('两条并发确认：先渲染第一条，第二条排队并在文案中告知', async () => {
    showConfirmDialog(request('call-A', 'S_0', 'sudo apt install a'));
    showConfirmDialog(request('call-B', 'S_1', 'git push -f origin main'));
    await vi.advanceTimersByTimeAsync(0);

    // 当前展示的是 A
    expect(document.getElementById('confirmOverlay').style.display).toBe('flex');
    expect(document.getElementById('confirmArgsSummary').innerHTML).toContain('sudo apt install a');
    expect(document.getElementById('confirmArgsSummary').innerHTML).not.toContain('git push -f');
    // B 没有覆盖 A，而是被明确告知还在排队
    expect(document.getElementById('confirmMessage').textContent)
      .toContain(t('dialog.pendingQueue', { count: 1 }));
  });

  test('点击"本次放行"：只回传当前条目的关联 ID 与会话，随后推进到下一条', async () => {
    showConfirmDialog(request('call-A', 'S_0', 'sudo apt install a'));
    showConfirmDialog(request('call-B', 'S_1', 'git push -f origin main'));
    await vi.advanceTimersByTimeAsync(0);

    document.getElementById('confirmApproveOnceBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    // 只发出 A 的响应（旧实现会带着被覆盖后的 ID 回传，导致后台误伤另一条）
    expect(sentResponses).toHaveLength(1);
    expect(sentResponses[0]).toMatchObject({
      type: 'TOOL_CONFIRMATION_RESPONSE',
      toolCallId: 'call-A',
      confirmed: true,
      scope: 'single',
      sessionId: 'S_0',
    });

    // 队列推进：现在展示 B，且不再有排队提示
    expect(document.getElementById('confirmArgsSummary').innerHTML).toContain('git push -f origin main');
    expect(document.getElementById('confirmMessage').textContent)
      .not.toContain(t('dialog.pendingQueue', { count: 1 }));

    // B 的应答由用户单独作出，作用域与它自己的会话一致
    document.getElementById('confirmDenyBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentResponses[1]).toMatchObject({ toolCallId: 'call-B', confirmed: false, sessionId: 'S_1' });

    // 队列清空后弹层关闭
    expect(document.getElementById('confirmOverlay').style.display).toBe('none');
  });

  test('后台撤销当前条目：不回发响应，队列自动推进到下一条', async () => {
    showConfirmDialog(request('call-A', 'S_0', 'sudo apt install a'));
    showConfirmDialog(request('call-B', 'S_1', 'git push -f'));
    await vi.advanceTimersByTimeAsync(0);

    dismissConfirmDialog({ toolCallId: 'call-A', sessionId: 'S_0' });
    await vi.advanceTimersByTimeAsync(0);

    // 不回发 TOOL_CONFIRMATION_RESPONSE：后台已自行结算，重发会误伤后续请求
    expect(sentResponses.filter((m) => m.type === 'TOOL_CONFIRMATION_RESPONSE')).toHaveLength(0);
    // 下一条顶上，且不再报排队
    expect(document.getElementById('confirmOverlay').style.display).toBe('flex');
    expect(document.getElementById('confirmArgsSummary').innerHTML).toContain('git push -f');
    expect(document.getElementById('confirmMessage').textContent)
      .not.toContain(t('dialog.pendingQueue', { count: 1 }));

    // 剩下的 B 仍可由用户正常应答
    document.getElementById('confirmDenyBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentResponses[0]).toMatchObject({ toolCallId: 'call-B', confirmed: false });
    expect(document.getElementById('confirmOverlay').style.display).toBe('none');
  });

  test('后台撤销排队条目：从队列移除，计数提示随之更新', async () => {
    showConfirmDialog(request('call-A', 'S_0', 'sudo apt install a'));
    showConfirmDialog(request('call-B', 'S_1', 'npm install -g x'));
    showConfirmDialog(request('call-C', 'S_2', 'git push -f'));
    await vi.advanceTimersByTimeAsync(0);
    expect(document.getElementById('confirmMessage').textContent)
      .toContain(t('dialog.pendingQueue', { count: 2 }));

    // 中间那条被后台提前结算（如任务级放行扩散）：不应再弹给用户
    dismissConfirmDialog({ toolCallId: 'call-B', sessionId: 'S_1' });
    await vi.advanceTimersByTimeAsync(0);

    document.getElementById('confirmApproveOnceBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    // A 之后直接顶上来的是 C（B 已被移除），此时只发出过 A 一条响应
    expect(sentResponses.map((m) => m.toolCallId)).toEqual(['call-A']);
    expect(document.getElementById('confirmArgsSummary').innerHTML).toContain('git push -f');
    expect(document.getElementById('confirmMessage').textContent)
      .not.toContain(t('dialog.pendingQueue', { count: 1 }));

    // C 仍待用户自己应答
    document.getElementById('confirmApproveOnceBtn').click();
    await vi.advanceTimersByTimeAsync(0);
    expect(sentResponses.map((m) => m.toolCallId)).toEqual(['call-A', 'call-C']);
    expect(document.getElementById('confirmOverlay').style.display).toBe('none');
  });

  test('同一确认重复投递（port 与广播双通道）：去重，不重复入队', async () => {
    const dup = request('call-A', 'S_0', 'sudo ls');
    const first = showConfirmDialog(dup);
    const second = showConfirmDialog(dup);
    await vi.advanceTimersByTimeAsync(0);

    // 重复请求立即以 false 结算，不进入队列
    await expect(second).resolves.toBe(false);

    document.getElementById('confirmApproveOnceBtn').click();
    await vi.advanceTimersByTimeAsync(0);

    expect(sentResponses).toHaveLength(1);
    await expect(first).resolves.toBe(true);
    // 没有因重复投递产生第二条待确认
    expect(document.getElementById('confirmMessage').textContent)
      .not.toContain(t('dialog.pendingQueue', { count: 1 }));
  });
});
