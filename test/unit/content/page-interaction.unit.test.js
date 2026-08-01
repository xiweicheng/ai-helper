// @vitest-environment jsdom
// page-interaction 单元测试：query_elements / ref 注册表 / 计数 / 无障碍树（jsdom 环境）
import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import {
  queryInteractiveElements,
  getElementCount,
  getSelectorByRef,
  readAccessibilityTree,
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

describe('queryInteractiveElements - 可交互元素查询', () => {
  test('返回所有可交互元素并分配 ref', () => {
    document.body.innerHTML = `
      <button id="b1">Save</button>
      <a href="/x">Link</a>
      <input type="text" name="q">
    `;
    const r = queryInteractiveElements({});
    expect(r.success).toBe(true);
    expect(r.elements.length).toBe(3);
    expect(r.elements[0].ref).toBe(1);
    expect(r.elements[1].ref).toBe(2);
    expect(r.hint).toContain('query_elements');
  });

  test('filterByText 过滤', () => {
    document.body.innerHTML = `
      <button>Save</button>
      <button>Cancel</button>
    `;
    const r = queryInteractiveElements({ filterByText: 'save' });
    expect(r.count).toBe(1);
    expect(r.elements[0].text.toLowerCase()).toContain('save');
  });

  test('elementTypes 限定查询类型', () => {
    document.body.innerHTML = `
      <button>btn</button>
      <a href="/">link</a>
      <input type="text">
    `;
    const r = queryInteractiveElements({ elementTypes: ['a'] });
    expect(r.elements.length).toBe(1);
    expect(r.elements[0].tag).toBe('a');
  });

  test('maxResults 限制返回数量', () => {
    document.body.innerHTML = '<button>1</button><button>2</button><button>3</button>';
    const r = queryInteractiveElements({ maxResults: 2 });
    expect(r.count).toBe(2);
    expect(r.total).toBe(3);
  });
});

describe('getSelectorByRef - ref 注册表查询', () => {
  test('query 后 ref 命中', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    queryInteractiveElements({});
    expect(getSelectorByRef(1)).toBe('#b1');
  });

  test('未注册的 ref 返回 null', () => {
    expect(getSelectorByRef(999)).toBeNull();
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

describe('readAccessibilityTree - 无障碍树', () => {
  test('提取语义角色', () => {
    document.body.innerHTML = `
      <nav><a href="/">home</a></nav>
      <main><button>OK</button></main>
    `;
    const r = readAccessibilityTree(100);
    expect(r.success).toBe(true);
    expect(r.elements.length).toBeGreaterThan(0);
    const nav = r.elements.find(e => e.tag === 'nav');
    expect(nav.role).toBe('navigation');
  });
});

describe('interactByRef - ref 元素操作', () => {
  test('点击 ref 对应元素', async () => {
    document.body.innerHTML = '<button id="b1">Click</button>';
    let clicked = false;
    document.getElementById('b1').addEventListener('click', () => { clicked = true; });
    queryInteractiveElements({});
    const r = await interactByRef(1, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(clicked).toBe(true);
    expect(r.selector).toBe('#b1');
  });

  test('无效 ref 返回失败并提示重新查询', async () => {
    const r = await interactByRef(999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(r.error).toContain('无效');
    expect(r.error).toContain('query_elements');
  });

  test('hover 分支派发 mouseover 事件', async () => {
    document.body.innerHTML = '<button id="b1">Hover</button>';
    let hovered = false;
    document.getElementById('b1').addEventListener('mouseover', () => { hovered = true; });
    queryInteractiveElements({});
    const r = await interactByRef(1, 'hover', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(hovered).toBe(true);
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
