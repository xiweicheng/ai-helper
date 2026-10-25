// @vitest-environment jsdom
// adjust-input-height.unit.test.js - adjustInputHeight 单行阈值 50→40 收紧后的行为验证：
// 1) 单行（中/英文 scrollHeight 相同，均 ≤40）保持无 inline height，由 CSS min-height:34px 统一控制（不抖动）
// 2) 多行能正常写入 inline height 并封顶 100px（CSS max-height:120px 兜底）
// 3) 多行删回单行时 inline height 正确清除，高度回落
// 4) 旧阈值边界值（41~50）在新逻辑下按多行处理，避免复用 50 造成两行半内容高度残留
import { describe, it, expect, beforeEach } from 'vitest';
import { adjustInputHeight } from '../../src/side_panel/utils.js';
import state from '../../src/side_panel/state.js';

function setupTextarea() {
  document.body.innerHTML = '<textarea id="userInput"></textarea>';
  const el = document.getElementById('userInput');
  // updateDropdownPosition 依赖 .input-wrapper/.input-container，缺席时内部自短路（no-op）
  return el;
}

function stubScrollHeight(el, value) {
  Object.defineProperty(el, 'scrollHeight', { configurable: true, value });
}

describe('adjustInputHeight 单行阈值收紧（50 → 40）', () => {
  beforeEach(() => {
    state.isScrolling = false;
  });

  it('单行中文输入（scrollHeight≈34）：清除 inline height，回落到 CSS min-height:34px', () => {
    const el = setupTextarea();
    el.style.height = '90px'; // 模拟从多行回落
    stubScrollHeight(el, 34);
    adjustInputHeight();
    expect(el.style.height).toBe('');
  });

  it('单行英文输入（scrollHeight≈34）：行为与中文一致，无 inline height', () => {
    const el = setupTextarea();
    stubScrollHeight(el, 34);
    adjustInputHeight();
    expect(el.style.height).toBe('');
  });

  it('阈值上边界（scrollHeight=40）：仍按单行处理，清除 inline height', () => {
    const el = setupTextarea();
    el.style.height = '90px';
    stubScrollHeight(el, 40);
    adjustInputHeight();
    expect(el.style.height).toBe('');
  });

  it('阈值下越界（scrollHeight=41）：按多行处理，写入 inline height=41px', () => {
    const el = setupTextarea();
    stubScrollHeight(el, 41);
    adjustInputHeight();
    expect(el.style.height).toBe('41px');
  });

  it('单行边界附近波动（33/34/40）不触发 inline height 写入——防抖动核心场景', () => {
    const el = setupTextarea();
    for (const h of [33, 34, 40]) {
      el.style.height = ''; // 模拟上一轮已清空
      stubScrollHeight(el, h);
      adjustInputHeight();
      expect(el.style.height).toBe('');
    }
  });

  it('两行内容（scrollHeight≈60）：正常长高为 inline height=60px', () => {
    const el = setupTextarea();
    stubScrollHeight(el, 60);
    adjustInputHeight();
    expect(el.style.height).toBe('60px');
  });

  it('超过 100px 的多行内容：封顶 100px（CSS max-height:120px 视觉兜底）', () => {
    const el = setupTextarea();
    stubScrollHeight(el, 200);
    adjustInputHeight();
    expect(el.style.height).toBe('100px');
  });

  it('多行删回单行：inline height 从 60px 正确清除回落', () => {
    const el = setupTextarea();
    stubScrollHeight(el, 60);
    adjustInputHeight();
    expect(el.style.height).toBe('60px');
    // 删掉一行后
    stubScrollHeight(el, 34);
    adjustInputHeight();
    expect(el.style.height).toBe('');
  });

  it('滚动中（state.isScrolling=true）：完全不调整高度', () => {
    const el = setupTextarea();
    el.style.height = '60px';
    state.isScrolling = true;
    stubScrollHeight(el, 200);
    adjustInputHeight();
    expect(el.style.height).toBe('60px');
  });
});
