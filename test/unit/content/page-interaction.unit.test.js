// @vitest-environment jsdom
// page-interaction 单元测试：query_elements 树快照 / ref 注册表 / 计数 / 交互（jsdom 环境）
import { describe, test, expect, beforeEach, beforeAll } from 'vitest';
import {
  queryInteractiveElements,
  collectSnapshotOps,
  resolveByRef,
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

// 从树快照文本中提取首个 ref（ref 编号跨测试持续递增，测试不硬编码具体数字）
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

  test('ref 编号跨快照稳定：同一元素复用、新元素递增、编号不转给别元素', () => {
    document.body.innerHTML = '<button id="b1">Go</button>';
    const r1 = queryInteractiveElements({});
    const ref1 = firstRef(r1.content);

    // 同一元素再次快照 → 编号复用（阶段二 WeakMap 稳定编号）
    const r2 = queryInteractiveElements({});
    expect(firstRef(r2.content)).toBe(ref1);

    // 移除旧元素、新增元素 → 新元素获得递增新号，不复用旧号
    document.body.innerHTML = '<button id="b2">New</button>';
    const r3 = queryInteractiveElements({});
    expect(firstRef(r3.content)).toBeGreaterThan(ref1);
  });

  test('发现即注册：maxResults 截断外的元素重查仍可解析', () => {
    document.body.innerHTML = '<button id="a">A</button><button id="b">B</button><button id="c">C</button>';
    const full = queryInteractiveElements({});
    const refs = [...full.content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));
    expect(refs.length).toBe(3);
    // 第二次快照只输出 1 个元素，但全部匹配元素都会重新注册
    const r = queryInteractiveElements({ maxResults: 1 });
    expect(r.content).not.toContain('"C"');
    expect(getElementByRef(refs[2])).toBe(document.getElementById('c'));
  });

  test('元素断开后按 selector 兜底重查同 id 新节点', () => {
    document.body.innerHTML = '<div id="wrap"><button id="b1">Go</button></div>';
    const r = queryInteractiveElements({});
    const ref = firstRef(r.content);
    // 同结构重建（原节点断开）；selector 懒生成后应兜底找到新节点
    document.body.innerHTML = '<div id="wrap"><button id="b1">Go2</button></div>';
    expect(getElementByRef(ref)).toBe(document.getElementById('b1'));
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

describe('queryInteractiveElements - 分页', () => {
  const mkButtons = (n) => Array.from({ length: n }, (_, i) => `<button id="b${i}">B${i}</button>`).join('');
  const refsOf = (content) => [...content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));

  test('分页切片：页间无重叠、并集完整、字段正确', () => {
    document.body.innerHTML = mkButtons(5);
    const all = queryInteractiveElements({});
    const allRefs = refsOf(all.content);
    expect(allRefs.length).toBe(5);

    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    expect(p1.total).toBe(5);
    expect(p1.totalPages).toBe(3);
    expect(p1.hasMore).toBe(true);
    expect(p1.page).toBe(1);
    expect(p1.content).toContain('第 1/3 页');
    expect(p1.content).toContain('page=2');
    expect(p1.hint).toContain('page=2');

    const p2 = queryInteractiveElements({ maxResults: 2, page: 2 });
    const refs1 = refsOf(p1.content);
    const refs2 = refsOf(p2.content);
    expect(refs1.length).toBe(2);
    expect(refs2.length).toBe(2);
    // 稳定编号：页并集 == 全量编号前 4 个
    expect([...refs1, ...refs2].sort()).toEqual(allRefs.slice(0, 4).sort());

    const p3 = queryInteractiveElements({ maxResults: 2, page: 3 });
    expect(p3.hasMore).toBe(false);
    expect(refsOf(p3.content).length).toBe(1);
    expect(p3.content).not.toContain('还有更多元素');
  });

  test('翻页后上一页 ref 仍可交互（稳定编号核心收益）', async () => {
    document.body.innerHTML = mkButtons(3);
    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    const ref0 = refsOf(p1.content)[0];
    let clicked = false;
    document.getElementById('b0').addEventListener('click', () => { clicked = true; });
    // 翻页重建注册表
    queryInteractiveElements({ maxResults: 2, page: 2 });
    const r = await interactByRef(ref0, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);
    expect(clicked).toBe(true);
  });

  test('非法 page 按 1 处理', () => {
    document.body.innerHTML = mkButtons(3);
    const r1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    for (const bad of [0, -3, 2.5, 'abc']) {
      const r = queryInteractiveElements({ maxResults: 2, page: bad });
      expect(r.page).toBe(1);
      expect(refsOf(r.content)).toEqual(refsOf(r1.content));
    }
  });

  test('越界 page 返回范围提示且不报错', () => {
    document.body.innerHTML = mkButtons(3);
    const r = queryInteractiveElements({ maxResults: 2, page: 99 });
    expect(r.success).toBe(true);
    expect(r.page).toBe(99);
    expect(r.totalPages).toBe(2);
    expect(r.hasMore).toBe(false);
    expect(r.content).toContain('超出范围');
    expect(r.content).toContain('query_elements'); // 尾行照常
  });

  test('容器行跨页重复出现（结构上下文）', () => {
    document.body.innerHTML = `<form>${mkButtons(4)}</form>`;
    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    const p2 = queryInteractiveElements({ maxResults: 2, page: 2 });
    const hasForm = (c) => c.split('\n').some(l => l.startsWith('form'));
    expect(hasForm(p1.content)).toBe(true);
    expect(hasForm(p2.content)).toBe(true);
  });

  test('分页 + 页内字符截断同时生效', () => {
    document.body.innerHTML = Array.from({ length: 5 },
      (_, i) => `<button>Very long button label number ${i} padding padding</button>`).join('');
    const r = queryInteractiveElements({ maxResults: 2, maxChars: 80 });
    expect(r.hasMore).toBe(true);
    expect(r.truncated).toBe(true);
    expect(r.content).toContain('截断');
  });
});

describe('queryInteractiveElements - 叠加层提升', () => {
  test('dialog[open] 提升到 [打开层] 且主体不重复输出', () => {
    document.body.innerHTML = `
      <button id="main1">Main</button>
      <dialog id="dlg" open><button id="in1">Confirm</button></dialog>
    `;
    const r = queryInteractiveElements({});
    const lines = r.content.split('\n');
    const overlayIdx = lines.indexOf('[打开层]');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(overlayIdx).toBeGreaterThan(-1);
    expect(bodyIdx).toBeGreaterThan(overlayIdx);
    const confirmIdx = lines.findIndex(l => /"Confirm" \[ref \d+\]/.test(l));
    const mainIdx = lines.findIndex(l => l.includes('"Main"'));
    expect(confirmIdx).toBeGreaterThan(overlayIdx);
    expect(confirmIdx).toBeLessThan(bodyIdx);
    expect(mainIdx).toBeGreaterThan(bodyIdx);
    // 去重：弹窗元素行只出现一次（容器行 dialog "Confirm" 属阶段一既有命名，不计入）
    expect(lines.filter(l => /"Confirm" \[ref \d+\]/.test(l)).length).toBe(1);
  });

  test('role=dialog + aria-modal=true 提升', () => {
    document.body.innerHTML = `
      <button>Main</button>
      <div role="dialog" aria-modal="true"><button>ModalBtn</button></div>
    `;
    const r = queryInteractiveElements({});
    expect(r.content).toContain('[打开层]');
    expect(r.content).toContain('[页面主体]');
  });

  test('role=menu 包含焦点元素时提升', () => {
    document.body.innerHTML = '<button>Main</button><div role="menu"><button id="mi1">Item</button></div>';
    document.getElementById('mi1').focus();
    expect(document.activeElement.id).toBe('mi1');
    const r = queryInteractiveElements({});
    expect(r.content).toContain('[打开层]');
  });

  test('aria-expanded+aria-controls 触发源反查提升', () => {
    document.body.innerHTML = `
      <button aria-expanded="true" aria-controls="pop1">Trigger</button>
      <div id="pop1"><button>PopItem</button></div>
    `;
    const r = queryInteractiveElements({});
    const lines = r.content.split('\n');
    const bodyIdx = lines.indexOf('[页面主体]');
    expect(lines.indexOf('[打开层]')).toBeGreaterThan(-1);
    // 弹层目标在打开层内、触发按钮自身仍留在页面主体
    expect(lines.findIndex(l => l.includes('"PopItem"'))).toBeLessThan(bodyIdx);
    expect(lines.findIndex(l => l.includes('"Trigger"'))).toBeGreaterThan(bodyIdx);
  });

  test('aria-expanded=false 不提升', () => {
    document.body.innerHTML = `
      <button aria-expanded="false" aria-controls="pop1">Trigger</button>
      <div id="pop1"><button>PopItem</button></div>
    `;
    const r = queryInteractiveElements({});
    expect(r.content).not.toContain('[打开层]');
  });

  test('嵌套叠加层只标记最外层', () => {
    document.body.innerHTML = `
      <dialog open><div role="dialog" aria-modal="true"><button>Inner</button></div></dialog>
    `;
    const r = queryInteractiveElements({});
    expect(r.content.split('[打开层]').length - 1).toBe(1);
    expect(r.content.split('[页面主体]').length - 1).toBe(1);
    // 元素行只出现一次（容器行 dialog "Inner" 属阶段一既有命名，不计入）
    expect((r.content.match(/"Inner" \[ref \d+\]/g) || []).length).toBe(1);
  });

  test('select multiple 聚焦不视为叠加层（原生控件隐式角色护栏）', () => {
    document.body.innerHTML = '<select multiple><option>a</option><option>b</option></select>';
    document.querySelector('select').focus();
    const r = queryInteractiveElements({});
    expect(r.content).not.toContain('[打开层]');
  });

  test('无叠加层时输出无任何标记（回归）', () => {
    document.body.innerHTML = '<button>Only</button><input placeholder="x">';
    const r = queryInteractiveElements({});
    expect(r.content).not.toContain('[打开层]');
    expect(r.content).not.toContain('[页面主体]');
  });

  test('弹窗内容优先于 maxChars 截断（核心收益）', () => {
    // 弹窗按钮名称与填充按钮同量级：旧实现（DOM 序）下预算被填充元素耗尽后弹窗必然被截断，
    // 新实现（叠加层优先渲染）下弹窗先占用预算，必然在快照中
    document.body.innerHTML = Array.from({ length: 30 },
      (_, i) => `<button>Filler button number ${i} with long padding text</button>`).join('')
      + '<dialog open><button>Critical overlay action needs a long label text</button></dialog>';
    const r = queryInteractiveElements({ maxChars: 300 });
    expect(r.truncated).toBe(true);
    expect(r.content).toContain('Critical overlay action');
  });

  test('分页第 1 页总是先含弹窗内容', () => {
    document.body.innerHTML = Array.from({ length: 5 },
      (_, i) => `<button id="p${i}">PageBtn ${i}</button>`).join('')
      + '<dialog open><button>FirstOverlayBtn</button></dialog>';
    const p1 = queryInteractiveElements({ maxResults: 2, page: 1 });
    expect(p1.content).toContain('FirstOverlayBtn');
    expect(p1.content).toContain('[打开层]');
  });
});

describe('collectSnapshotOps - 结构化 ops（阶段三数据源）', () => {
  test('基本结构：frameInfo 自报 + 嵌套 el/container 树', () => {
    document.body.innerHTML = `
      <form><button>Save</button></form>
      <button>Cancel</button>
    `;
    const ops = collectSnapshotOps({});
    expect(ops.success).toBe(true);
    expect(ops.frameInfo.url).toBe(window.location.href);
    expect(typeof ops.frameInfo.loadId).toBe('string');
    expect(ops.frameInfo.loadId.length).toBeGreaterThan(0);
    // form 容器包裹 Save；顶层 Cancel 为根级 el
    const form = ops.bodyTree.find(n => n.t === 'container' && n.role === 'form');
    expect(form).toBeTruthy();
    expect(form.children[0].t).toBe('el');
    expect(form.children[0].role).toBe('button');
    expect(form.children[0].name).toBe('Save');
    expect(typeof form.children[0].localRef).toBe('number');
    expect(form.children[0].depth).toBe(1);
    const cancel = ops.bodyTree.find(n => n.t === 'el' && n.name === 'Cancel');
    expect(cancel).toBeTruthy();
    expect(cancel.depth).toBe(0);
  });

  test('打开层独立分区：overlayTrees 含 dialog 子树，bodyTree 跳过叠加层根', () => {
    document.body.innerHTML = `
      <button id="outside">Out</button>
      <dialog open><button id="inside">In</button></dialog>
    `;
    const ops = collectSnapshotOps({});
    expect(ops.overlayTrees.length).toBeGreaterThan(0);
    const dlg = ops.overlayTrees.find(n => n.t === 'container' && n.role === 'dialog');
    expect(dlg).toBeTruthy();
    expect(dlg.children.some(c => c.t === 'el' && c.name === 'In')).toBe(true);
    // 主体树不含叠加层内部元素（去重）
    expect(JSON.stringify(ops.bodyTree)).toContain('Out');
    expect(JSON.stringify(ops.bodyTree)).not.toContain('"In"');
  });

  test('无产出的容器不采集（空 form 剔除，main 保留）', () => {
    document.body.innerHTML = `
      <form><div>text only</div></form>
      <main><button>Go</button></main>
    `;
    const ops = collectSnapshotOps({});
    const json = JSON.stringify(ops.bodyTree);
    expect(json).not.toContain('"form"');
    expect(json).toContain('"main"');
  });

  test('frames=auto → iframe 变 frame 节点；frames=none → 无 frame 节点', () => {
    document.body.innerHTML = `
      <iframe title="Pay" src="https://b.example/x"></iframe>
      <button>After</button>
    `;
    const auto = collectSnapshotOps({ frames: 'auto' });
    const frame = auto.bodyTree.find(n => n.t === 'frame');
    expect(frame).toBeTruthy();
    expect(frame.title).toBe('Pay');
    expect(frame.depth).toBe(0);
    expect(frame.srcUrl).toContain('b.example');
    expect(typeof frame.orderInParent).toBe('number');
    const none = collectSnapshotOps({ frames: 'none' });
    expect(none.bodyTree.some(n => n.t === 'frame')).toBe(false);
  });

  test('filterByText 在 ops 层生效（与阶段二一致）', () => {
    document.body.innerHTML = '<button>Save</button><button>Cancel</button>';
    const ops = collectSnapshotOps({ filterByText: 'save' });
    const json = JSON.stringify(ops.bodyTree);
    expect(json).toContain('Save');
    expect(json).not.toContain('Cancel');
  });
});

describe('resolveByRef - 结构化建议（阶段三路由翻译输入）', () => {
  test('失效 ref 返回 suggestions 结构（≤3，含 role/name）', () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    queryInteractiveElements({});
    const bad = resolveByRef(999999);
    expect(bad.error).toBeTruthy();
    expect(Array.isArray(bad.suggestions)).toBe(true);
    expect(bad.suggestions.length).toBe(2);
    expect(bad.suggestions[0]).toEqual({
      ref: expect.any(Number),
      role: 'button',
      name: expect.any(String),
    });
  });

  test('有效 ref 正常解析、无 suggestions 字段', () => {
    document.body.innerHTML = '<button id="ok">Go</button>';
    const r = queryInteractiveElements({});
    const ok = resolveByRef(firstRef(r.content));
    expect(ok.element).toBe(document.getElementById('ok'));
    expect(ok.suggestions).toBeUndefined();
  });

  test('interactByRef 失效时透传 suggestions 字段', async () => {
    document.body.innerHTML = '<button>A</button>';
    queryInteractiveElements({});
    const r = await interactByRef(999999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(Array.isArray(r.suggestions)).toBe(true);
    expect(r.suggestions.length).toBe(1);
  });
});
