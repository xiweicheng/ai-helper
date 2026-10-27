// @vitest-environment jsdom
// test/unit/workdir-switch-guard.unit.test.js
// 会话级切换弹窗的守卫与语义（计划 §9 / §12）：
//   1. 同会话任务执行中（isGenerating 或队列非空）→ 拦截 + toast，不弹窗
//   2. 空闲时可弹窗，会话级代理端才渲染「恢复默认」「同时设为默认」
//   3. 弹窗标题区分「本会话」与「全局」语义
//
// 长任务中途换目录会让执行中的请求在下一次校验时失配，
// 所以拦截必须在任何网络请求之前发生（返回 false 且 DOM 不出现弹窗）。
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

const { getQueuedCount } = vi.hoisted(() => ({ getQueuedCount: vi.fn() }));

vi.mock('../../src/side_panel/queue-store.js', () => ({
  getQueuedCount: (...args) => getQueuedCount(...args),
}));

const noop = () => {};

globalThis.chrome = {
  storage: { local: { get: noop, set: noop }, onChanged: { addListener: noop } },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: noop,
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

const AGENT_ID = 'agent-1';

let showSwitchWorkdirDialog;
let state;
let resetWorkspaceRoot;
let t;

/** 代理端 /api/status/detail 的最小响应；每次 fetch 的请求头都记录下来 */
let statusDetail = null;
let fetched = [];

function stubFetch() {
  fetched = [];
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    fetched.push({ url: String(url), headers: options.headers || {} });
    return { ok: true, status: 200, json: async () => statusDetail };
  });
}

function toastTexts() {
  return Array.from(document.querySelectorAll('#toastContainer .toast')).map((el) => el.textContent);
}

function dialog() {
  return document.querySelector('.switch-workdir-dialog');
}

beforeEach(async () => {
  document.body.innerHTML = '<div id="toastContainer"></div>';
  state = (await import('../../src/side_panel/state.js')).default;
  const wm = await import('../../src/side_panel/workspace-manager.js');
  resetWorkspaceRoot = wm.resetWorkspaceRoot;
  resetWorkspaceRoot();
  t = (await import('../../src/shared/i18n.js')).t;
  ({ showSwitchWorkdirDialog } = await import('../../src/side_panel/workspace-panel.js'));
  // 引入注册 workdirTag 文案的模块（index.js 里注册）
  await import('../../src/side_panel/index.js').catch(() => {});

  state.activeSessionId = 's1';
  delete state.generatingSessionIds;
  state.generatingSessionIds = new Set();
  getQueuedCount.mockReset();
  getQueuedCount.mockReturnValue(0);
  globalThis.chrome.storage.local.get = vi.fn(async () => ({
    pairedAgents: [{ id: AGENT_ID, url: 'http://127.0.0.1:43123', token: 'plain-token' }],
    activeAgentId: AGENT_ID,
  }));
  statusDetail = {
    success: true,
    workdir: '/proj/a',
    defaultWorkdir: '/agent/default',
    homeDir: '/home/u',
    allowedPaths: ['/proj/a', '/proj/b'],
    sessionWorkdir: '/proj/a',
    sessionWorkdirSupported: true,
  };
  stubFetch();
});

afterEach(() => {
  document.body.innerHTML = '';
  delete globalThis.fetch;
});

describe('同会话运行中拦截', () => {
  test('会话正在生成：返回 false，不弹窗，不请求代理详情', async () => {
    state.generatingSessionIds.add('s1');

    const result = await showSwitchWorkdirDialog({ sessionId: 's1' });

    expect(result).toBe(false);
    expect(dialog()).toBe(null);
    expect(fetched).toEqual([]);
    expect(toastTexts()).toContain(t('workdirTag.lockedHint'));
  });

  test('会话队列非空：同样拦截，不弹窗', async () => {
    getQueuedCount.mockReturnValue(3);

    const result = await showSwitchWorkdirDialog({ sessionId: 's1' });

    expect(result).toBe(false);
    expect(dialog()).toBe(null);
    expect(getQueuedCount).toHaveBeenCalledWith('s1');
    expect(toastTexts()).toContain(t('workdirTag.lockedHint'));
  });

  test('拦截只针对目标会话：别的会话在跑不影响本会话切目录', async () => {
    state.generatingSessionIds.add('s2');

    const promise = showSwitchWorkdirDialog({ sessionId: 's1' });
    // 弹窗是 Promise 挂起的模态：确认已渲染后关闭
    await Promise.resolve();
    await new Promise((r) => setTimeout(r, 0));
    expect(dialog()).not.toBe(null);
    document.querySelector('.switch-workdir-cancel').click();
    expect(await promise).toBe(false);
    expect(toastTexts()).not.toContain(t('workdirTag.lockedHint'));
  });
});

describe('会话级弹窗内容', () => {
  test('会话级代理端：标题为「切换本会话工作目录」，已绑定显示恢复默认与设默认选项', async () => {
    const promise = showSwitchWorkdirDialog({ sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 0));

    const el = dialog();
    expect(el).not.toBe(null);
    expect(el.querySelector('.modal-title').textContent).toBe(t('workdirTag.switchTitle'));
    expect(el.querySelector('.switch-workdir-restore')).not.toBe(null);
    expect(el.querySelector('.switch-workdir-set-default')).not.toBe(null);

    el.querySelector('.switch-workdir-cancel').click();
    expect(await promise).toBe(false);
  });

  test('请求详情时带上 X-AIH-Session-Id（弹窗按目标会话取值）', async () => {
    const promise = showSwitchWorkdirDialog({ sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 0));

    const statusCall = fetched.find((c) => c.url.includes('/api/status/detail'));
    expect(statusCall).toBeTruthy();
    expect(statusCall.headers['X-AIH-Session-Id']).toBe('s1');

    dialog().querySelector('.switch-workdir-cancel').click();
    await promise;
  });

  test('未绑定会话：不显示「恢复默认」', async () => {
    statusDetail = { ...statusDetail, sessionWorkdir: null };

    const promise = showSwitchWorkdirDialog({ sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 0));

    const el = dialog();
    expect(el).not.toBe(null);
    expect(el.querySelector('.switch-workdir-restore')).toBe(null);
    expect(el.textContent).toContain(t('workdirTag.defaultScope'));

    el.querySelector('.switch-workdir-cancel').click();
    await promise;
  });

  test('旧版代理端（无 sessionWorkdirSupported）：降级为全局语义，不渲染会话专属控件', async () => {
    statusDetail = { success: true, workdir: '/proj/a', defaultWorkdir: '/proj/a', allowedPaths: ['/proj/a'] };

    const promise = showSwitchWorkdirDialog({ sessionId: 's1' });
    await new Promise((r) => setTimeout(r, 0));

    const el = dialog();
    expect(el).not.toBe(null);
    expect(el.querySelector('.modal-title').textContent).toBe(t('workspace.switchWorkdirTitle'));
    expect(el.querySelector('.switch-workdir-set-default')).toBe(null);
    expect(el.querySelector('.switch-workdir-restore')).toBe(null);

    el.querySelector('.switch-workdir-cancel').click();
    await promise;
  });
});
