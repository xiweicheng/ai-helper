// @vitest-environment jsdom
// PERF-10 事件委托的回归守卫（对应 docs/AUDIT_STATUS.md 第三节 PERF-10）
//
// 背景：addCodeCopyButtons / addTableToolbarEvents 原为"每次渲染 document 全表扫描 + 逐钮
// addEventListener + dataset.bound 防重复"，并且历史恢复(restoreMessageFromHtml :2656)、
// 会话刷新(rebindAllMessages :2956)都要"清 bound 标志再重扫"才能让按钮重新可用——这正是
// "历史/刷新后事件丢失"那类 bug 的温床。改造为 document 捕获阶段一次性委托后，本文件钉住：
//   R1 覆盖面：委托绑在 document（非 #chatContainer），弹层（body 下、chatContainer 外）里
//      的代码块按钮照常生效——否则等于把 addCodeCopyButtons 从"全表扫描"收窄成"只盖消息区"，
//      会漏掉 context-indicator 摘要弹层。
//   R2 传播语义：复制/表格按钮嵌在"点击即展开/折叠"的祖先（.tool-call-result）里；旧逐钮
//      绑定用 e.stopPropagation() 挡住祖先。委托必须绑在【捕获阶段】才能复刻——冒泡阶段委托
//      会晚于祖先 handler，点复制会顺带把折叠也 toggle 了（新 bug）。
//   R3 免重绑：委托只绑一次；之后无论实时插入、从 HTML 恢复、还是缓存刷新，新加入 DOM 的
//      按钮点击都直接生效，不再依赖每条路径重扫重绑；重复调用初始化函数也只处理一次。
//   R4 取数不变：数据烤在按钮属性上（data-table-full 等），随 HTML 往返仍在；委托只改绑定方式。
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { readFileSync } from 'node:fs';

const copyToClipboard = vi.fn();
const showToast = vi.fn();

vi.mock('../../src/side_panel/utils.js', () => ({
  escapeHtml: (s) => String(s),
  showToast: (...a) => showToast(...a),
  copyToClipboard: (...a) => copyToClipboard(...a),
}));
vi.mock('../../src/side_panel/libs-loader.js', () => ({
  loadMermaid: vi.fn(async () => null),
  loadHtml2Canvas: vi.fn(async () => async () => ({ toDataURL: () => 'data:image/jpeg;base64,' })),
}));

const { addCodeCopyButtons, addTableToolbarEvents } = await import('../../src/side_panel/markdown-render.js');

const read = (rel) => readFileSync(new URL(rel, import.meta.url), 'utf8');

function mount(html) {
  document.body.innerHTML = `<div id="chatContainer">${html}</div>`;
  return document.getElementById('chatContainer');
}

function fire(el) {
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
}

beforeEach(() => {
  copyToClipboard.mockClear();
  showToast.mockClear();
  addCodeCopyButtons(); // 幂等：确保委托已绑（模块级 once 守卫）
});

describe('R2 捕获阶段委托：点按钮不得触发祖先展开/折叠', () => {
  test('code-copy 嵌在 .tool-call-result 内：复制生效、祖先展开未被触发', () => {
    const cc = mount(`
      <div class="message">
        <div class="tool-call-result">
          <div class="code-block-container">
            <pre><code>HELLO_CODE</code></pre>
            <button class="code-copy-btn"></button>
          </div>
        </div>
      </div>`);
    const resultDiv = cc.querySelector('.tool-call-result');
    let expandFired = 0;
    resultDiv.addEventListener('click', () => { expandFired += 1; }); // 模拟"点击展开完整输出"

    fire(cc.querySelector('.code-copy-btn'));

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard.mock.calls[0][0]).toBe('HELLO_CODE');
    expect(expandFired).toBe(0); // 关键：捕获阶段 stopPropagation 挡掉了祖先冒泡 handler
  });

  test('copy-md 按钮点击不触发祖先展开', () => {
    const cc = mount(`
      <div class="tool-call-result">
        <button class="copy-md-btn" data-table-full="${encodeURIComponent('|a|\n|---|\n|1|')}"></button>
      </div>`);
    let expandFired = 0;
    cc.querySelector('.tool-call-result').addEventListener('click', () => { expandFired += 1; });

    fire(cc.querySelector('.copy-md-btn'));

    expect(expandFired).toBe(0);
    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard.mock.calls[0][0]).toContain('|a|');
    expect(showToast).toHaveBeenCalled();
  });

  test('download-excel / export-table-img 选择器分支同样被命中并挡住祖先（无数据即安全返回）', () => {
    const cc = mount(`
      <div class="tool-call-result">
        <button class="download-excel-btn"></button>
        <button class="export-table-img-btn"></button>
      </div>`);
    let expandFired = 0;
    cc.querySelector('.tool-call-result').addEventListener('click', () => { expandFired += 1; });

    fire(cc.querySelector('.download-excel-btn'));
    fire(cc.querySelector('.export-table-img-btn'));

    expect(expandFired).toBe(0);
  });
});

describe('R1 覆盖面：委托绑在 document，弹层（chatContainer 之外）也生效', () => {
  test('body 下模态里的 code-copy 按钮点击仍能复制', () => {
    document.body.innerHTML = '';
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="code-block-container">
        <pre><code>MODAL_CODE</code></pre>
        <button class="code-copy-btn"></button>
      </div>`;
    document.body.appendChild(overlay); // 不在 #chatContainer 内

    fire(overlay.querySelector('.code-copy-btn'));

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard.mock.calls[0][0]).toBe('MODAL_CODE');
  });
});

describe('R3 免重绑：委托绑一次，之后的插入/恢复/刷新都即时生效', () => {
  test('委托绑定后新加入 DOM 的按钮，无需再调用任何重绑函数即可点击生效', () => {
    const cc = mount('');
    // 模拟"历史恢复/缓存刷新后"才插入的消息
    const msg = document.createElement('div');
    msg.className = 'message';
    msg.innerHTML = `
      <div class="code-block-container">
        <pre><code>LATE_CODE</code></pre>
        <button class="code-copy-btn"></button>
      </div>`;
    cc.appendChild(msg);

    fire(msg.querySelector('.code-copy-btn'));

    expect(copyToClipboard).toHaveBeenCalledTimes(1);
    expect(copyToClipboard.mock.calls[0][0]).toBe('LATE_CODE');
  });

  test('重复调用初始化函数（各渲染路径都会调）不会造成一次点击多次处理', () => {
    addCodeCopyButtons();
    addCodeCopyButtons();
    addTableToolbarEvents();
    addTableToolbarEvents();
    const cc = mount(`
      <div class="code-block-container">
        <pre><code>X</code></pre>
        <button class="code-copy-btn"></button>
      </div>`);

    fire(cc.querySelector('.code-copy-btn'));

    expect(copyToClipboard).toHaveBeenCalledTimes(1); // once 守卫：委托只绑一次
  });
});

describe('结构守卫：委托形状（源码级），防止被改回逐钮绑定', () => {
  const MD = read('../../src/side_panel/markdown-render.js');
  const CM = read('../../src/side_panel/chat-manager.js');

  test('markdown-render 在 document 上以捕获阶段绑一次委托', () => {
    const fn = MD.slice(MD.indexOf('function ensureToolbarDelegate'));
    expect(fn).not.toBe(MD); // 函数存在
    expect(fn).toContain("addEventListener('click'");
    // 捕获阶段：本函数内只有一个 addEventListener('click')，故其收尾的 `, true)` 即证明是捕获委托
    expect(/addEventListener\('click',\s*\([\s\S]*?\},\s*true\)/.test(fn)).toBe(true);
    // 四类按钮全在同一委托里分流，杜绝漏一类
    expect(fn).toContain('.code-copy-btn');
    expect(fn).toContain('.copy-md-btn');
    expect(fn).toContain('.download-excel-btn');
    expect(fn).toContain('.export-table-img-btn');
  });

  test('逐钮 document.querySelectorAll 绑定与 dataset.bound 防重复标记已移除', () => {
    // addCodeCopyButtons/addTableToolbarEvents 体里不应再有"每个按钮 addEventListener"
    expect(MD).not.toMatch(/copyButtons\.forEach[\s\S]*?addEventListener/);
    expect(MD).not.toMatch(/btn\.dataset\.bound(Md|Excel|Img)?\s*=\s*'true'/);
  });

  test('chat-manager 历史恢复/刷新路径不再靠"清 bound 标志再重扫"驱动按钮可用性', () => {
    expect(CM).not.toMatch(/delete btn\.dataset\.boundMd/);
    expect(CM).not.toMatch(/delete btn\.dataset\.boundExcel/);
    expect(CM).not.toMatch(/delete btn\.dataset\.boundImg/);
    // 但裸 pre 补容器（DOM 构造，非事件绑定）必须保留
    expect(CM).toContain('code-block-container');
  });
});
