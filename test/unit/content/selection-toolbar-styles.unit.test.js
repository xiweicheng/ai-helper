// @vitest-environment jsdom
// selection-toolbar-styles 单元测试：注入的样式必须阻断宿主页面的 text-align 继承，
// 同时不能破坏 Markdown 正文自身的对齐语义（内联 style / 表格列对齐）。
// 背景：工具栏/结果面板直接 append 到宿主页面 DOM（无 Shadow DOM 隔离），
// 页面对 body/div 等设置的 text-align: center 会传到面板内，导致查询结果居左失效。
import { describe, test, expect, beforeEach } from 'vitest';
import { injectStyles } from '../../../src/content/selection-toolbar-styles.js';

function getInjectedCss() {
  const styleEl = document.getElementById('aih-selection-toolbar-styles');
  return styleEl?.textContent ?? '';
}

/** 提取某个选择器规则块内的声明文本（要求选择器出现在行首，避免前缀误匹配派生选择器） */
function getRuleBlock(css, selector) {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`^\\s*${escaped}\\s*\\{([^}]*)\\}`, 'm'));
  return match?.[1] ?? '';
}

beforeEach(() => {
  document.head.innerHTML = '';
  document.body.innerHTML = '';
});

describe('injectStyles - 阻断宿主页面样式继承', () => {
  test('样式幂等：重复注入只产生一个 style 节点', () => {
    injectStyles();
    injectStyles();
    expect(document.querySelectorAll('#aih-selection-toolbar-styles').length).toBe(1);
  });

  test('结果面板根节点显式居左，防止页面居中样式继承到 aih-result-body', () => {
    injectStyles();
    const css = getInjectedCss();
    const block = getRuleBlock(css, '#aih-selection-result');
    expect(block).toMatch(/text-align:\s*left/);
  });

  test('高特异性后代规则直接命中正文子元素防污染，但不加 !important 以保留内联对齐', () => {
    // 页面对 p 等直接声明的 text-align:center 会直接命中子元素，继承重置打不过，
    // 故需高特异性选择器直接命中；但【不能加 !important】，否则会压掉
    // 模型输出的内联 style="text-align"（如居中的 HTML 块）。
    injectStyles();
    const css = getInjectedCss();
    const descendantRule = css.match(
      /#aih-selection-result \.aih-result-body :not\(th\):not\(td\)\s*\{[^}]*text-align:\s*left[^}]*\}/
    );
    expect(descendantRule).not.toBeNull();
    // 断言后代规则块内不含 !important（保障内联对齐不被压掉）
    expect(descendantRule[0]).not.toMatch(/!important/);
  });

  test('不强制 th/td 对齐，保留 Markdown 表格列对齐', () => {
    injectStyles();
    const css = getInjectedCss();
    const cellBlock = getRuleBlock(css, '#aih-selection-result .aih-result-body td');
    expect(cellBlock).toBeTruthy();
    expect(cellBlock).not.toMatch(/text-align/);
  });

  test('浮动工具栏根节点同样显式居左', () => {
    injectStyles();
    const css = getInjectedCss();
    const block = getRuleBlock(css, '#aih-selection-toolbar');
    expect(block).toMatch(/text-align:\s*left/);
  });

  test('Token 明细弹窗与溢出下拉根节点显式居左', () => {
    injectStyles();
    const css = getInjectedCss();
    expect(getRuleBlock(css, '.aih-token-popup')).toMatch(/text-align:\s*left/);
    expect(getRuleBlock(css, '.aih-overflow-dropdown')).toMatch(/text-align:\s*left/);
  });
});
