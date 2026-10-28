// @vitest-environment jsdom
// Ctrl+单击复制代码块的事件委托覆盖面守卫（与 PERF-10 按钮委托 R1 同源问题）：
// 背景：setupCodeCtrlClick 原把 Ctrl+单击复制绑在 #chatContainer 上。全屏"节点迁移"会把
// 消息真实节点移出 #chatContainer 到 .message-fullscreen-body，导致全屏里 Ctrl+单击代码块失效。
// 守卫：委托须在 document 上，且作用域覆盖 #chatContainer 与全屏覆盖层两处；工作目录预览
// （既非二者）不得被本处理器复制（它有各自的处理，避免重复复制/双 toast）。
import { describe, test, expect, beforeEach, vi } from 'vitest';

const showToast = vi.fn();

vi.mock('../../src/side_panel/utils.js', () => ({
  escapeHtml: (s) => String(s),
  showToast: (...a) => showToast(...a),
  copyToClipboard: vi.fn(),
}));
vi.mock('../../src/side_panel/libs-loader.js', () => ({
  loadMermaid: vi.fn(async () => null),
  loadHtml2Canvas: vi.fn(async () => async () => ({ toDataURL: () => 'data:image/jpeg;base64,' })),
  mermaidThemeConfig: {},
}));

const { addCodeCopyButtons } = await import('../../src/side_panel/markdown-render.js');

let writeText;
beforeEach(() => {
  showToast.mockClear();
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  addCodeCopyButtons(); // 幂等：确保 Ctrl+单击委托已绑（模块级 once 守卫）
});

function ctrlClick(el) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
}

describe('Ctrl+单击复制代码：document 委托覆盖全屏 body', () => {
  test('#chatContainer 内的代码块 Ctrl+单击可复制（既有行为不回归）', async () => {
    document.body.innerHTML = `
      <div id="chatContainer">
        <div class="message assistant"><div class="markdown-body">
          <div class="code-block-container"><pre><code>NORMAL_CODE</code></pre><button class="code-copy-btn"></button></div>
        </div></div>
      </div>`;
    ctrlClick(document.querySelector('#chatContainer .code-block-container code'));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('NORMAL_CODE');
  });

  test('全屏覆盖层 body（#chatContainer 之外）的代码块 Ctrl+单击仍能复制', async () => {
    document.body.innerHTML = `
      <div id="chatContainer"></div>
      <div class="message-fullscreen-body" id="messageFullscreenBody">
        <div class="message assistant"><div class="markdown-body">
          <div class="code-block-container"><pre><code>FS_CODE</code></pre><button class="code-copy-btn"></button></div>
        </div></div>
      </div>`;
    ctrlClick(document.querySelector('#messageFullscreenBody .code-block-container code'));
    await Promise.resolve();
    expect(writeText).toHaveBeenCalledWith('FS_CODE');
  });

  test('工作目录预览（非聊天区/非全屏 body）不被本处理器复制', async () => {
    document.body.innerHTML = `
      <div id="chatContainer"></div>
      <div id="workspacePreviewArea">
        <div class="code-block-container"><pre><code>WS_CODE</code></pre></div>
      </div>`;
    ctrlClick(document.querySelector('#workspacePreviewArea .code-block-container code'));
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });

  test('未按住 Ctrl/⌘ 的普通点击不触发复制', async () => {
    document.body.innerHTML = `
      <div id="chatContainer">
        <div class="code-block-container"><pre><code>X</code></pre></div>
      </div>`;
    document.querySelector('#chatContainer .code-block-container code')
      .dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await Promise.resolve();
    expect(writeText).not.toHaveBeenCalled();
  });
});
