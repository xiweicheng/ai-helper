// @vitest-environment jsdom
// 划词浮层「挂载点解耦可编辑区」回归测试（Jira 描述/备注保存污染 bug 的守卫）：
// 背景：content script 以 all_frames + match_origin_as_fallback 注入所有 frame（含 iframe
// 型富文本编辑器，其 designMode body 即编辑区）。旧实现把工具条挂到 document.body，导致
// 宿主保存时连同工具条文字一起被序列化进正文。
// 修复不变量（Layer 0 + Layer 1/2）：
//   1) 浮层只在渲染帧（顶层）创建；子 iframe 仅上报选区，不创建任何浮层 DOM，
//      因此编辑器 iframe 的 body 里根本不会出现工具条节点；
//   2) 顶层那份浮层统一挂到 documentElement 下的 #aih-overlay-host（<body> 的兄弟），
//      且节点带 contenteditable=false，绝不落入任何可编辑子树。
import { describe, test, expect, beforeEach, afterEach, vi } from 'vitest';

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    sendMessage: () => Promise.resolve(),
    onMessage: { addListener: () => {} },
    getURL: (p) => p,
  },
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: () => Promise.resolve(),
    },
    onChanged: { addListener: () => {} },
  },
};

async function loadModule() {
  vi.resetModules();
  return await import('../../../src/content/selection-toolbar.js');
}

function purgeOverlays() {
  document.querySelectorAll('#aih-overlay-host, #aih-selection-toolbar, #aih-selection-result, #aih-copy-toast')
    .forEach((el) => el.remove());
  document.body.innerHTML = '';
}

async function initTop() {
  const { initSelectionToolbar } = await loadModule();
  initSelectionToolbar();
  await new Promise((r) => setTimeout(r, 0));
}

describe('浮层挂到 documentElement host，不落入 body 可编辑区', () => {
  beforeEach(() => { purgeOverlays(); });
  afterEach(() => { purgeOverlays(); });

  test('工具条父节点是 #aih-overlay-host，host 挂在 documentElement 下、body 不含浮层', async () => {
    await initTop();
    const toolbar = document.getElementById('aih-selection-toolbar');
    const host = document.getElementById('aih-overlay-host');
    // 顶层帧正常创建工具条（渲染不受影响）
    expect(toolbar).not.toBeNull();
    expect(host).not.toBeNull();
    expect(toolbar.parentElement).toBe(host);
    // host 是 body 的兄弟（在 <html> 下），绝不在 body 内可编辑区里
    expect(host.parentElement).toBe(document.documentElement);
    expect(document.body.contains(toolbar)).toBe(false);
    // 显式声明非可编辑区
    expect(toolbar.getAttribute('contenteditable')).toBe('false');
    expect(host.getAttribute('contenteditable')).toBe('false');
  });

  test('存在 contenteditable 编辑区时，浮层不在其子树内（模拟编辑器保存不被污染）', async () => {
    // 先放一个“编辑区”（模拟 iframe 编辑器的 designMode body 或顶层 contenteditable）
    const editor = document.createElement('div');
    editor.setAttribute('contenteditable', 'true');
    editor.id = 'editor';
    editor.textContent = '真实描述内容';
    document.body.appendChild(editor);

    await initTop();

    const toolbar = document.getElementById('aih-selection-toolbar');
    // 工具条被创建（逐帧渲染保留），但不在编辑区子树内、也不在 body 内
    expect(toolbar).not.toBeNull();
    expect(editor.contains(toolbar)).toBe(false);
    expect(document.body.contains(toolbar)).toBe(false);
    // 编辑区自身文本不含工具条按钮文案
    expect(editor.textContent).not.toMatch(/AI搜索|解释|翻译|总结|复制/);
  });

  test('结果面板同样挂在 host 下而非 body', async () => {
    await initTop();
    const panel = document.getElementById('aih-selection-result');
    const host = document.getElementById('aih-overlay-host');
    expect(panel).not.toBeNull();
    expect(panel.parentElement).toBe(host);
    expect(document.body.contains(panel)).toBe(false);
  });

  test('子帧（window.top !== window）init 后不创建任何浮层 DOM（Layer 0 守卫）', async () => {
    // 模拟子 iframe：让 window.top 不等于 window，模块加载时 isTopFrame 计算为 false
    const originalTop = window.top;
    Object.defineProperty(window, 'top', { value: {}, configurable: true });
    try {
      const { initSelectionToolbar } = await loadModule();
      initSelectionToolbar();
      await new Promise((r) => setTimeout(r, 0));
      // 子帧不创建工具条/结果面板/host
      expect(document.getElementById('aih-selection-toolbar')).toBeNull();
      expect(document.getElementById('aih-selection-result')).toBeNull();
      expect(document.getElementById('aih-overlay-host')).toBeNull();
    } finally {
      Object.defineProperty(window, 'top', { value: originalTop, configurable: true });
    }
  });
});
