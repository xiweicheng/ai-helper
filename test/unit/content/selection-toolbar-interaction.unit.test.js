// @vitest-environment jsdom
// 划词工具栏交互时序单测（飞书在线文档 bug 的复现用例）：
// 富文本编辑器在 mousedown 阶段会清除/折叠页面选区，触发 selectionchange；
// 若该事件把工具栏提前隐藏，按钮的 click 永远不会派发到已消失的浮层，
// 表现为"工具栏能弹出但按钮点不了，点一下整个工具栏消失"。
// 契约：鼠标在工具栏浮层内按下期间（mousedown→mouseup），selectionchange
// 不得隐藏工具栏、不得清空已保存选区文本。
import { describe, test, expect, beforeEach, afterEach } from 'vitest';

// setup 里的全局 chrome-mock 在无 runtime.id 时按"扩展上下文失效"处理，
// 必须在 import 被测模块前替换为可用且带 Promise 返回的完整 stub
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

// jsdom 的原生 Selection 对 addRange/toString 支持不稳定，用 stub 接管选区读取；
// range 仍使用真实 DOM Range，保证源码对 commonAncestorContainer 等属性的访问契约
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
// jsdom 中 document.getSelection 与 window.getSelection 是独立引用，两处都要 stub
document.getSelection = () => fakeSelection;

/** 模拟用户划词选中 + 松开鼠标（工具栏弹出的正常时序） */
async function selectText(text) {
  // 重置宿主页面内容时，把插件浮层节点移回 body（真实页面不会抹掉扩展 DOM）
  const toasts = Array.from(document.querySelectorAll('#aih-selection-toolbar, #aih-overflow-dropdown, #aih-selection-result'));
  document.body.innerHTML = `<div id="page"><p id="para">${text}</p></div>`;
  toasts.forEach(el => document.body.appendChild(el));
  fakeRange = document.createRange();
  fakeRange.selectNodeContents(document.getElementById('para'));
  // jsdom 未实现 Range.getBoundingClientRect，补固定位置
  fakeRange.getBoundingClientRect = () => ({ left: 100, top: 100, width: 50, height: 16 });
  fakeSelText = text;
  document.dispatchEvent(new Event('selectionchange'));
  // 真实浏览器中选中后必有 mouseup，工具栏在抬起时才显示
  document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, detail: 1 }));
}

/** 选中并松开鼠标，工具栏应立即显示（浮层已在 beforeEach 就绪） */
async function selectTextAndWait(text) {
  await selectText(text);
}

/** 模拟富文本编辑器在 mousedown 后清除页面选区（飞书行为） */
function clearPageSelection() {
  fakeSelText = '';
  document.dispatchEvent(new Event('selectionchange'));
}

function getToolbarEl() {
  return document.getElementById('aih-selection-toolbar');
}

function getFirstActionButton() {
  return getToolbarEl().querySelector('.aih-tb-btn[data-action]');
}

/** copy 按钮：动作同步可观测（产生 toast），用于验证 click 真的派发到委托处理器 */
function getCopyButton() {
  return getToolbarEl().querySelector('.aih-tb-btn[data-action="copy"]');
}

beforeEach(async () => {
  // jsdom 不主动驱动 rAF，同步执行保证 showToolbar 的定位/可见态落定
  globalThis.requestAnimationFrame = (cb) => { cb(0); return 0; };
  initSelectionToolbar();
  // createToolbar 内部 await loadToolbarTools，等微任务完成浮层创建与挂载
  await new Promise((resolve) => { setTimeout(resolve, 0); });
});

afterEach(() => {
  destroySelectionToolbar();
  // 清掉重复 init 产生的残留浮层节点，避免下一个用例拿错元素
  document.querySelectorAll('#aih-selection-toolbar, #aih-overflow-dropdown, #aih-selection-result').forEach(el => el.remove());
  document.body.innerHTML = '';
  fakeSelText = '';
});

describe('工具栏浮层内按住期间，宿主清选区不得关闭工具栏', () => {
  test('对照基线：无 mousedown 时选区清空应隐藏工具栏（现有行为不回退）', async () => {
    await selectTextAndWait('测试文本内容');
    expect(getToolbarEl().style.display).toBe('flex');
    clearPageSelection();
    expect(getToolbarEl().style.display).toBe('none');
  });

  test('复现飞书 bug：按钮上 mousedown 后编辑器清选区，工具栏必须保持可见', async () => {
    await selectTextAndWait('测试文本内容');
    expect(getToolbarEl().style.display).toBe('flex');
    getFirstActionButton().dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clearPageSelection();
    // 修复前：selectionchange → hideToolbar → display none（断言失败，复现 bug）
    expect(getToolbarEl().style.display).not.toBe('none');
  });

  test('交互窗口内 click 应能派发到按钮并触发操作（copy 弹出结果 toast）', async () => {
    await selectTextAndWait('测试文本内容');
    const btn = getCopyButton();
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clearPageSelection();
    btn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    btn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    // 修复前：工具栏在 mousedown 阶段已被隐藏，真实页面中 click 不会命中按钮，
    // 动作不会执行；修复后：copy 动作执行并产生可观测的 toast
    expect(document.getElementById('aih-copy-toast')).not.toBeNull();
  });

  test('mouseup 结束后保护窗口关闭：再次选区变化恢复正常隐藏', async () => {
    await selectTextAndWait('测试文本内容');
    const btn = getFirstActionButton();
    btn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    clearPageSelection();
    expect(getToolbarEl().style.display).not.toBe('none');
    // 真实场景：保护窗口在任意位置的 mouseup（文档冒泡）后关闭
    document.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    // 窗口期已过：重新选中文字再清空，工具栏应能正常隐藏
    await selectTextAndWait('另一段文本');
    clearPageSelection();
    expect(getToolbarEl().style.display).toBe('none');
  });
});
