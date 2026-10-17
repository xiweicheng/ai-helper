// @vitest-environment jsdom
// SEC-08 回归守卫：页内搜索高亮必须以 DOM Range 按文本节点包裹，绝不重写整段 body.innerHTML
//
// 背景（docs/AUDIT_STATUS.md SEC-08）：searchInPage 的两个高亮分支（plain / regex）旧写法为
//   document.body.innerHTML = document.body.innerHTML.replace(/.../g, '<span ...>$&</span>')
// 危害有二：① 整段 body 从字符串重建 → 宿主页面所有事件监听、框架虚拟 DOM 关联、选中态全丢
// （SPA 上一次"搜索+高亮"即可能把页面点坏）；② 命中若落在标签/属性内部，插入 <span> 直接损坏标记。
// 本守卫锁住：新实现保留监听、不碰属性、可正确复位；并保留一条"旧写法确会丢监听"的负向对照。

import { describe, test, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { highlightTextMatches, removeHighlights } from '../../src/content/page-utils.js';

// vitest 从项目根运行；jsdom 环境下 import.meta.url 非 file scheme，故按 cwd 相对路径读取
const SRC = readFileSync(join(process.cwd(), 'src/content/page-extract.js'), 'utf8');
const UTILS = readFileSync(join(process.cwd(), 'src/content/page-utils.js'), 'utf8');

function mount(html) {
  document.body.innerHTML = `<div id="root">${html}</div><style id="ai-helper-highlight-style">.x{}</style>`;
  return document.getElementById('root');
}

describe('SEC-08 源码接线：旧写法不得复现', () => {
  test('page-extract.js 不再把 body.innerHTML 自赋值做替换', () => {
    expect(SRC).not.toMatch(/document\.body\.innerHTML\s*=\s*document\.body\.innerHTML\.replace/);
  });

  test('page-extract.js 两个高亮分支均改走 highlightTextMatches', () => {
    const calls = SRC.match(/highlightTextMatches\(document\.body/g) || [];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  test('removeHighlights 清理名单必须含搜索高亮类名（否则永不复位）', () => {
    expect(UTILS).toMatch(/querySelectorAll\([^)]*ai-helper-search-highlight/);
  });
});

describe('SEC-08 行为不变量：Range 高亮', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('命中被包进 span，且文本内容原样保留', () => {
    const root = mount('<p>the cat and the catalog</p>');
    const n = highlightTextMatches(root, /cat/gi, 20);
    expect(n).toBe(2);
    expect(root.querySelectorAll('.ai-helper-search-highlight').length).toBe(2);
    // 可见文本不变（只是被 span 包裹）
    expect(root.textContent).toBe('the cat and the catalog');
  });

  test('单个文本节点内多处命中全部正确包裹（反向拆分不串位）', () => {
    const root = mount('<p>ab ab ab ab</p>');
    const n = highlightTextMatches(root, /ab/g, 20);
    expect(n).toBe(4);
    const spans = [...root.querySelectorAll('.ai-helper-search-highlight')];
    expect(spans.every((s) => s.textContent === 'ab')).toBe(true);
    expect(root.textContent).toBe('ab ab ab ab');
  });

  test('命中落在属性值里时绝不污染标签结构（旧写法会插入 span 打断属性）', () => {
    const root = mount('<img alt="cat dog" src="a.png"><span>see cat</span>');
    highlightTextMatches(root, /cat/gi, 20);
    const img = root.querySelector('img');
    // alt 属性必须保持原样，且不应被插入任何 span 子节点（img 本就无子节点）
    expect(img.getAttribute('alt')).toBe('cat dog');
    expect(root.querySelectorAll('img span').length).toBe(0);
    // 只有可见文本里的 cat 被高亮（span 内的那处）
    expect(root.querySelectorAll('.ai-helper-search-highlight').length).toBe(1);
  });

  test('高亮后父元素上已注册的事件监听仍然存活（核心：不重建 DOM）', () => {
    const root = mount('<p>highlight me cat please</p>');
    let rootFired = 0;
    root.addEventListener('ping', () => { rootFired++; });
    const p = root.querySelector('p');
    let pFired = 0;
    p.addEventListener('ping', () => { pFired++; });

    highlightTextMatches(root, /cat/g, 20);

    // 结构未被重建：live DOM 里的 p 与旧引用仍是同一对象
    expect(root.querySelector('p')).toBe(p);
    // 从 p 向上冒泡，p 与 root 两处监听都应收到
    p.dispatchEvent(new Event('ping', { bubbles: true }));
    expect(pFired).toBe(1);
    expect(rootFired).toBe(1);
  });

  test('maxResults 上限生效，超出部分不高亮', () => {
    const root = mount('<p>ab ab ab ab ab ab</p>');
    const n = highlightTextMatches(root, /ab/g, 3);
    expect(n).toBe(3);
    expect(root.querySelectorAll('.ai-helper-search-highlight').length).toBe(3);
  });

  test('removeHighlights 能解包搜索高亮并还原原始文本、移除注入样式', () => {
    const root = mount('<p>the cat and the catalog</p>');
    highlightTextMatches(root, /cat/gi, 20);
    expect(root.querySelectorAll('.ai-helper-search-highlight').length).toBe(2);

    removeHighlights();

    expect(root.querySelectorAll('.ai-helper-search-highlight').length).toBe(0);
    expect(root.textContent).toBe('the cat and the catalog');
    expect(document.getElementById('ai-helper-highlight-style')).toBe(null);
  });

  test('script/style 容器内的文本不参与高亮', () => {
    const root = mount('<script>var cat = "cat";</script><p>cat</p>');
    const n = highlightTextMatches(root, /cat/g, 20);
    // 仅 <p> 内那一处被高亮；script 文本被跳过
    expect(n).toBe(1);
    expect(root.querySelector('script').textContent).toBe('var cat = "cat";');
  });
});

describe('SEC-08 负向对照：证明旧写法确会丢监听（守卫有意义）', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  test('旧 body.innerHTML.replace 会重建节点、丢监听且打断属性', () => {
    const root = mount('<img alt="cat dog"><p>find cat here</p>');
    const oldP = root.querySelector('p');
    let oldFired = 0;
    oldP.addEventListener('ping', () => { oldFired++; });

    // 复刻旧写法：对整段 innerHTML 做正则替换再回写
    root.innerHTML = root.innerHTML.replace(/cat/gi, '<span class="ai-helper-search-highlight">$&</span>');

    // ① 节点被重建：live DOM 里的 p 与旧引用不是同一对象
    const liveP = root.querySelector('p');
    expect(liveP).not.toBe(oldP);
    // ② 在 live 节点上派发，旧监听收不到（监听随旧节点一起丢失）
    liveP.dispatchEvent(new Event('ping'));
    expect(oldFired).toBe(0);
    // ③ 属性里的 cat 被插入 span，alt 被打断
    const img = root.querySelector('img');
    expect(img.getAttribute('alt')).not.toBe('cat dog');
  });
});
