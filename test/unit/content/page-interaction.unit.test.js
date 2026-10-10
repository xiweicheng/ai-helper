// @vitest-environment jsdom
// page-interaction 单元测试：query_elements 树快照 / ref 注册表 / 计数 / 交互（jsdom 环境）
import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import {
  queryInteractiveElements,
  getElementCount,
  getSelectorByRef,
  getElementByRef,
  interactByRef,
  scrollToText,
} from '../../../src/content/page-interaction.js';

// jsdom 的 MouseEvent 构造器对 view:window 校验过严（真实浏览器接受），
// 用 wrapper 剥离 view 让 hover 事件派发可测
beforeAll(() => {
  const NativeMouseEvent = window.MouseEvent;
  function PatchedMouseEvent(type, init = {}) {
    const { view, ...rest } = init;
    return new NativeMouseEvent(type, rest);
  }
  PatchedMouseEvent.prototype = NativeMouseEvent.prototype;
  window.MouseEvent = PatchedMouseEvent;
});

beforeEach(() => {
  document.body.innerHTML = '';
});

// 从树快照文本中提取首个 ref（ref 编号跨测试单调递增，测试不硬编码）
function firstRef(content) {
  return Number(content.match(/\[ref (\d+)\]/)[1]);
}

describe('queryInteractiveElements - 树快照', () => {
  test('发现原生交互元素并输出树文本', () => {
    document.body.innerHTML = `
      <div><button id="b1">Save</button></div>
      <a href="/x">Link</a>
      <input type="text" placeholder="q">
    `;
    const r = queryInteractiveElements({});
    expect(r.success).toBe(true);
    expect(r.count).toBe(3);
    expect(r.total).toBe(3);
    expect(r.content.split('\n')[0]).toContain('3');       // 统计行
    expect(r.content).toContain('button "Save" [ref ');
    expect(r.content).toContain('link "Link" [ref ');
    expect(r.content).toContain('textbox');
    expect(r.content).toContain('placeholder="q"');
    expect(r.content).toContain('query_elements');          // 尾行提示
  });

  test('ARIA 角色/tabindex/contenteditable/summary 均被发现', () => {
    document.body.innerHTML = `
      <div role="tab"></div>
      <div role="treeitem"></div>
      <div tabindex="0"></div>
      <div contenteditable="true"></div>
      <details><summary>More</summary></details>
    `;
    const r = queryInteractiveElements({});
    expect(r.count).toBe(5);
    expect(r.content).toContain('tab');
    expect(r.content).toContain('treeitem');
    expect(r.content).toContain('button "More"');           // summary 推导为 button
  });

  test('display:none 与 aria-hidden 子树被剪枝', () => {
    document.body.innerHTML = `
      <div><button id="b1">A</button></div>
      <div style="display:none"><button id="b2">B</button></div>
      <div aria-hidden="true"><button id="b3">C</button></div>
    `;
    const r = queryInteractiveElements({});
    expect(r.count).toBe(1);
    expect(r.content).toContain('"A"');
  });

  test('div 透传不占缩进，语义容器占缩进', () => {
    document.body.innerHTML = `
      <div><div><button id="b1">Deep</button></div></div>
      <form id="f1"><button id="b2">InForm</button></form>
    `;
    const r = queryInteractiveElements({});
    const lines = r.content.split('\n');
    // 两层 div 均透传 → button 有效深度 0（无前导空格）
    expect(lines.some(l => l.startsWith('button "Deep"'))).toBe(true);
    expect(lines.some(l => l.startsWith('form'))).toBe(true);
    // form 是语义容器 → 其中的 button 缩进 1
    expect(lines.some(l => l.startsWith(' button "InForm"'))).toBe(true);
  });

  test('ref 编号跨快照单调递增不复用', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    const r1 = queryInteractiveElements({});
    const ref1 = firstRef(r1.content);
    const r2 = queryInteractiveElements({});
    const ref2 = firstRef(r2.content);
    expect(ref2).toBeGreaterThan(ref1);
  });

  test('filterByText 与 elementTypes 过滤', () => {
    document.body.innerHTML = `<button>Save</button><button>Cancel</button><a href="/">x</a>`;
    const r = queryInteractiveElements({ filterByText: 'save' });
    expect(r.count).toBe(1);
    const r2 = queryInteractiveElements({ elementTypes: ['a'] });
    expect(r2.count).toBe(1);
    expect(r2.content).toContain('link');
  });

  test('maxChars 字符预算截断并提示', () => {
    document.body.innerHTML = Array.from({ length: 50 },
      (_, i) => `<button>Button ${i} with some longer text content</button>`).join('');
    const r = queryInteractiveElements({ maxChars: 200 });
    expect(r.truncated).toBe(true);
    expect(r.content.length).toBeLessThan(400);
    expect(r.content).toContain('截断');
    expect(r.total).toBe(50);
    expect(r.count).toBeLessThan(50);
  });

  test('countOnly 只返回计数', () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    const r = queryInteractiveElements({ countOnly: true });
    expect(r.count).toBe(2);
    expect(r.content).toBe('');
  });
});

describe('getSelectorByRef - ref 注册表查询', () => {
  test('query 后 ref 命中', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    const r = queryInteractiveElements({});
    expect(getSelectorByRef(firstRef(r.content))).toBe('#b1');
  });

  test('未注册的 ref 返回 null', () => {
    expect(getSelectorByRef(999999)).toBeNull();
    expect(getSelectorByRef(0)).toBeNull();
    expect(getSelectorByRef('abc')).toBeNull();
  });
});

describe('getElementCount - 元素计数', () => {
  test('统计可见元素（默认过滤隐藏）', () => {
    document.body.innerHTML = `
      <div class="item"></div>
      <div class="item" style="display:none"></div>
    `;
    const r = getElementCount('.item');
    expect(r.success).toBe(true);
    expect(r.count).toBe(1);
    expect(r.totalCount).toBe(2);
  });

  test('includeHidden=true 统计全部', () => {
    document.body.innerHTML = `
      <div class="item"></div>
      <div class="item" style="display:none"></div>
    `;
    const r = getElementCount('.item', true);
    expect(r.count).toBe(2);
  });

  test('空选择器返回 empty', () => {
    document.body.innerHTML = '<div></div>';
    const r = getElementCount('.not-exist');
    expect(r.empty).toBe(true);
    expect(r.count).toBe(0);
  });
});

describe('interactByRef - ref 元素操作', () => {
  test('点击 ref 对应元素', async () => {
    document.body.innerHTML = '<button id="b1">Click</button>';
    let clicked = false;
    document.getElementById('b1').addEventListener('click', () => { clicked = true; });
    const r0 = queryInteractiveElements({});
    const r = await interactByRef(firstRef(r0.content), 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(clicked).toBe(true);
  });

  test('无效 ref 返回失败并提示重新查询', async () => {
    const r = await interactByRef(999999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('无效');
    expect(r.error).toContain('query_elements');
  });

  test('hover 分支派发 mouseover 事件', async () => {
    document.body.innerHTML = '<button id="b1">Hover</button>';
    let hovered = false;
    document.getElementById('b1').addEventListener('mouseover', () => { hovered = true; });
    const r0 = queryInteractiveElements({});
    const r = await interactByRef(firstRef(r0.content), 'hover', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(hovered).toBe(true);
  });
});

describe('resolveByRef / 失效建议', () => {
  test('失效 ref 报错含附近有效引用建议', async () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    queryInteractiveElements({});
    // 用超前的 ref 模拟过期（单调递增保证未注册）
    const r = await interactByRef(999999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('无效');
    expect(r.error).toContain('有效引用');
    expect(r.error).toContain('query_elements');
  });

  test('getElementByRef 返回有效元素', () => {
    document.body.innerHTML = '<input id="i1">';
    const r = queryInteractiveElements({});
    const ref = Number(r.content.match(/\[ref (\d+)\]/)[1]);
    const el = getElementByRef(ref);
    expect(el).toBeTruthy();
    expect(el.tagName).toBe('INPUT');
    expect(getElementByRef(999999)).toBeNull();
  });
});

describe('interactByRef - type 原子输入', () => {
  const refOf = () => firstRef(queryInteractiveElements({}).content);

  test('输入文本并派发 input/change 事件', async () => {
    document.body.innerHTML = '<input id="i1" type="text">';
    const ref = refOf();
    const events = [];
    const el = document.getElementById('i1');
    el.addEventListener('input', () => events.push('input'));
    el.addEventListener('change', () => events.push('change'));
    const r = await interactByRef(ref, 'type', { value: 'hello', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(el.value).toBe('hello');
    expect(events).toContain('input');
    expect(events).toContain('change');
  });

  test('clear=true 先清空再输入', async () => {
    document.body.innerHTML = '<input id="i1" value="old">';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { value: 'new', clear: true, waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(document.getElementById('i1').value).toBe('new');
  });

  test('submit=true 派发 Enter 序列', async () => {
    document.body.innerHTML = '<input id="i1">';
    const ref = refOf();
    const keys = [];
    document.getElementById('i1').addEventListener('keydown', e => keys.push(e.key));
    const r = await interactByRef(ref, 'type', { value: 'x', submit: true, waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(keys).toContain('Enter');
  });

  test('checkbox 拒绝文本输入', async () => {
    document.body.innerHTML = '<input id="c1" type="checkbox">';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { value: 'x', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('不支持');
  });

  test('value 为空报错', async () => {
    document.body.innerHTML = '<input id="i1">';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('value');
  });

  test('contenteditable 走富文本路径', async () => {
    document.body.innerHTML = '<div id="ce" contenteditable="true"></div>';
    const ref = refOf();
    const r = await interactByRef(ref, 'type', { value: 'rich', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(document.getElementById('ce').textContent).toBe('rich');
  });
});

describe('scrollToText - 文本滚动查找', () => {
  test('当前视口存在文本直接定位', async () => {
    document.body.innerHTML = '<div style="height:100px"></div><p id="t">FindMe</p>';
    const r = await scrollToText('FindMe', { maxScrolls: 3, pauseMs: 0 });
    expect(r.success).toBe(true);
    expect(r.scrolls).toBe(0);
    expect(r.selector).toBe('#t');
  });

  test('空文本返回失败', async () => {
    const r = await scrollToText('', { maxScrolls: 1, pauseMs: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('text');
  });

  test('不存在文本滚动后失败', async () => {
    document.body.innerHTML = '<div>Nope here</div>';
    const r = await scrollToText('NotExist', { maxScrolls: 2, pauseMs: 0 });
    expect(r.success).toBe(false);
    expect(r.scrolls).toBe(2);
  });
});
