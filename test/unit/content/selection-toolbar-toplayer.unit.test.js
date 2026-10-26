// @vitest-environment jsdom
// 划词工具栏 top layer 迁移 + 遮挡探测单测（同文档浮层被宿主高层级元素遮挡的修复）：
// 背景：飞书等同文档页面用超高 z-index / popover 悬浮条遮挡划词工具栏，
// z-index 已是 CSS 最大值无法再抬升。
// 契约：
// 1. 四个交互浮层（工具栏/溢出下拉/结果面板/Token 弹窗）经 Popover API 进入 top layer；
// 2. 不支持 Popover API 的环境回退为 body 挂载 + 内联 display，不抛错；
// 3. 显示后 elementFromPoint 探测到外来元素遮挡时临时隐藏遮挡源，
//    我方浮层全部关闭后还原；命中我方自身元素（data-aih 标记）不做任何改动。
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

globalThis.chrome = {
  runtime: {
    id: 'test-extension',
    sendMessage: () => Promise.resolve(),
    onMessage: { addListener: () => {} },
  },
  storage: {
    local: {
      get: (_keys, cb) => cb({}),
      set: () => Promise.resolve(),
    },
    onChanged: { addListener: () => {} },
  },
};

const { initSelectionToolbar, destroySelectionToolbar } = await import(
  '../../../src/content/selection-toolbar.js'
);
const { injectStyles } = await import('../../../src/content/selection-toolbar-styles.js');

// ---- 选区 stub（与交互时序单测同款方案）----
let fakeSelText = '';
let fakeRange = null;
const fakeSelection = {
  toString: () => fakeSelText,
  get rangeCount() { return fakeSelText ? 1 : 0; },
  isCollapsed: false,
  getRangeAt: () => fakeRange,
  removeAllRanges: () => { fakeSelText = ''; },
  addRange: () => {},
};
globalThis.window.getSelection = () => fakeSelection;
document.getSelection = () => fakeSelection;

async function selectTextAndWait(text) {
  const toasts = Array.from(document.querySelectorAll('#aih-selection-toolbar, #aih-overflow-dropdown, #aih-selection-result'));
  document.body.innerHTML = `<div id="page"><p id="para">${text}</p></div>`;
  toasts.forEach(el => document.body.appendChild(el));
  fakeRange = document.createRange();
  fakeRange.selectNodeContents(document.getElementById('para'));
  fakeRange.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 16 });
  fakeSelText = text;
  document.dispatchEvent(new Event('selectionchange'));
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));
  await new Promise((resolve) => { setTimeout(resolve, 0); });
}

function getToolbarEl() {
  return document.getElementById('aih-selection-toolbar');
}

// ---- 浮层尺寸/命中探测 stub ----
let hitTest = null; // (x, y) => element | null，模拟文档命中测试
let showPopoverCalls = 0;

beforeEach(async () => {
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
  // jsdom 无布局：给固定矩形，让遮挡探测有点可采
  HTMLElement.prototype.getBoundingClientRect = function () {
    return { left: 100, top: 100, width: 200, height: 40, right: 300, bottom: 140, x: 100, y: 100 };
  };
  document.elementFromPoint = (x, y) => (hitTest ? hitTest(x, y) : null);
  showPopoverCalls = 0;
  HTMLElement.prototype.showPopover = function () { showPopoverCalls++; };
  HTMLElement.prototype.hidePopover = function () {};
  initSelectionToolbar();
  await new Promise((resolve) => { setTimeout(resolve, 0); });
});

afterEach(() => {
  destroySelectionToolbar();
  document.querySelectorAll('#aih-selection-toolbar, #aih-overflow-dropdown, #aih-selection-result, #aih-copy-toast').forEach(el => el.remove());
  document.body.innerHTML = '';
  delete HTMLElement.prototype.showPopover;
  delete HTMLElement.prototype.hidePopover;
  delete document.elementFromPoint;
  hitTest = null;
  fakeSelText = '';
});

describe('top layer 迁移（Popover API）', () => {
  test('工具栏元素带 popover=manual 属性', async () => {
    await selectTextAndWait('测试文本内容');
    expect(getToolbarEl().getAttribute('popover')).toBe('manual');
  });

  test('显示工具栏时调用 showPopover 进入 top layer', async () => {
    await selectTextAndWait('测试文本内容');
    expect(showPopoverCalls).toBeGreaterThan(0);
  });

  test('不支持 Popover API 时回退为内联 display，不抛错', async () => {
    delete HTMLElement.prototype.showPopover;
    delete HTMLElement.prototype.hidePopover;
    await selectTextAndWait('测试文本内容');
    expect(getToolbarEl().style.display).toBe('flex');
  });

  test('不得有会抹掉组件自身样式的 [popover] 重置块（UA 默认由作者规则直接盖过）', () => {
    injectStyles();
    const css = document.getElementById('aih-selection-toolbar-styles').textContent;
    // 回归锁：[popover] 选择器特异性高于组件基础规则，若带 background:none/padding:0
    // 会反过来抹掉工具栏自身的半透底/内边距（实阅现象：工具栏变透明发虚）
    const popoverBlocks = [...css.matchAll(/\[popover\][^{]*\{([^}]*)\}/g)].map((m) => m[1]);
    for (const body of popoverBlocks) {
      expect(body).not.toMatch(/background\s*:\s*none/);
      expect(body).not.toMatch(/padding\s*:\s*0/);
    }
    // 组件基础规则自带背景与内边距（作者 origin 无条件盖过 UA popover 默认）
    expect(css).toMatch(/#aih-selection-toolbar\s*\{[^}]*background:\s*var\(--tb-panel\)/);
    expect(css).toMatch(/#aih-selection-toolbar\s*\{[^}]*padding:\s*4px 6px/);
  });

  test('四个 popover 浮层基础规则均置 margin:0（抵消 UA margin:auto 居中，否则无视 left/top）', () => {
    injectStyles();
    const css = document.getElementById('aih-selection-toolbar-styles').textContent;
    for (const sel of ['#aih-selection-toolbar', '.aih-overflow-dropdown', '#aih-selection-result', '.aih-token-popup']) {
      expect(css).toMatch(new RegExp(sel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{[^}]*margin:\\s*0'));
    }
  });
});

describe('elementFromPoint 遮挡探测', () => {
  test('外来元素遮挡浮层时被临时隐藏，浮层关闭后还原', async () => {
    const foreign = document.createElement('div');
    foreign.id = 'host-float-bar';
    document.body.appendChild(foreign);
    hitTest = () => foreign;
    await selectTextAndWait('测试文本内容');
    expect(foreign.style.display).toBe('none');
    // 关闭工具栏（点击页面空白处）→ 还原遮挡源原样式
    // 选区显示工具栏的那次 click 会被 suppressNextClick 消费（既有行为），先发掉再点空白
    hitTest = null;
    document.dispatchEvent(new MouseEvent('click', { bubbles: true })); // 被 suppressNextClick 抑制
    document.dispatchEvent(new MouseEvent('click', { bubbles: true })); // 真正的空白处点击
    expect(foreign.style.display).toBe('');
  });

  test('命中我方自身元素（data-aih）不做任何改动', async () => {
    const toast = document.createElement('div');
    toast.id = 'aih-copy-toast';
    toast.setAttribute('data-aih', '');
    document.body.appendChild(toast);
    hitTest = () => toast;
    await selectTextAndWait('测试文本内容');
    expect(toast.style.display).toBe('');
  });

  test('无遮挡（命中为空或我方浮层自身）时不误伤', async () => {
    // 真实浏览器中 top layer 浮层先被命中，elementFromPoint 不会返回其下方的页面正文
    hitTest = () => null;
    await selectTextAndWait('测试文本内容');
    expect(getToolbarEl().style.display).toBe('flex');
    expect(document.getElementById('para').style.display).toBe('');
    // 命中我方浮层内部子节点：同样不隐藏任何东西
    hitTest = () => getToolbarEl().querySelector('.aih-tb-btn');
    document.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await selectTextAndWait('另一段文本');
    expect(document.getElementById('para').style.display).toBe('');
  });
});
