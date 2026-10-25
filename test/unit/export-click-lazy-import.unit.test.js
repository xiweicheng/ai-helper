// @vitest-environment jsdom
// PERF-05 / NEW-07 回归守卫：导出按钮的 click 回调改 async（按需 import）后，
// 事件对象在 await 之后已不可用，按钮元素必须在让出微任务之前捕获。
//
// 三层，各有分工且都经过负向对照：
//   契约层 —— 在 jsdom 里实测 currentTarget / target 在 await 后的真实取值；
//   行为层 —— 用真 chat-manager 的「恢复」与「重绑」两条路径 × 四类导出共 8 例，
//             且点击复刻真机落点（派发到按钮内部的 <span>），使 target 与
//             currentTarget 可区分——否则写成 e.target 也能全绿；
//   形状层 —— 用 acorn 解析 AST（不再用缩进/大括号配对/字符串正则），
//             同时覆盖解构、别名、提前 await、嵌套括号实参等字符串写法拦不住的形态。
import { describe, test, expect, vi, beforeAll, beforeEach } from 'vitest';
import { readFileSync, readdirSync } from 'fs';
import { resolve, join } from 'path';
import * as acorn from 'acorn';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { reactConfig: { streamEnabled: false }, reflectionConfig: { enabled: false } };
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (m) => Promise.resolve({}),
    onMessage: { addListener: noop, removeListener: noop },
  },
  tabs: {
    query: noop,
    sendMessage: noop,
    onActivated: { addListener: noop },
    onUpdated: { addListener: noop },
  },
  scripting: { executeScript: noop },
};

const PANEL_DIR = resolve(__dirname, '../../src/side_panel');
const LAZY_IMPORT_MARKER = "await import('./chat-export.js')";
const EXPORT_FNS = [
  'exportAssistantMessageToDocx',
  'exportAssistantMessageToMarkdown',
  'exportAssistantMessageToPdf',
  'exportAssistantMessageToImage',
];

// 只在 await 之后会失效、且被当作按钮传下去的两个字段。
// stopPropagation / clientX 这类不纳入：派发前取值本就安全，纳入会产生无关噪音。
const EVENT_FIELDS = new Set(['currentTarget', 'target']);

const exportSpies = {
  exportAssistantMessageToDocx: vi.fn(),
  exportAssistantMessageToPdf: vi.fn(),
  exportAssistantMessageToMarkdown: vi.fn(),
  exportAssistantMessageToImage: vi.fn(),
};

vi.mock('../../src/side_panel/chat-export.js', () => exportSpies);

// ── AST 工具 ────────────────────────────────────────────────────────────────

function walk(node, visit, parent = null) {
  if (!node || typeof node !== 'object') return;
  if (node.type) visit(node, parent);
  for (const key of Object.keys(node)) {
    if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
    const child = node[key];
    if (Array.isArray(child)) {
      for (const c of child) walk(c, visit, node);
    } else {
      walk(child, visit, node);
    }
  }
}

const FN_TYPES = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'FunctionDeclaration']);

/** 作用域内递归：遇到嵌套函数只记录节点本身、不下钻（内层有自己的事件对象） */
function walkScoped(scopeFn, visit) {
  const step = (node) => {
    if (!node || typeof node !== 'object') return;
    if (node.type && node !== scopeFn) visit(node);
    if (FN_TYPES.has(node.type) && node !== scopeFn) return;
    for (const key of Object.keys(node)) {
      if (key === 'type' || key === 'start' || key === 'end' || key === 'loc') continue;
      const child = node[key];
      if (Array.isArray(child)) {
        for (const c of child) step(c);
      } else {
        step(child);
      }
    }
  };
  step(scopeFn);
}

/**
 * 收集回调内「由事件参数派生」的变量名：
 *   const btn = e;                    → btn
 *   const { currentTarget } = e;      → currentTarget
 *   const { currentTarget: btn } = e; → btn
 */
function collectEventDerivedNames(fn, src) {
  const paramNames = (fn.params || [])
    .map((p) => (p.type === 'Identifier' ? p.name : null))
    .filter(Boolean);
  const names = new Set(paramNames);
  if (!fn.body || fn.body.type !== 'BlockStatement') return names;

  walkScoped(fn, (node) => {
    if (node.type !== 'VariableDeclarator' || !node.init) return;
    if (!names.has(getRootName(node.init))) return;
    if (node.id.type === 'Identifier') {
      names.add(node.id.name);
    } else if (node.id.type === 'ObjectPattern') {
      for (const prop of node.id.properties) {
        if (prop.type !== 'Property') continue;
        if (prop.value.type === 'Identifier') names.add(prop.value.name);
      }
    }
  });
  return names;
}

function getRootName(node) {
  let cur = node;
  while (cur) {
    if (cur.type === 'Identifier') return cur.name;
    if (cur.type === 'MemberExpression') cur = cur.object;
    else if (cur.type === 'ChainExpression' || cur.type === 'TSNonNullExpression') cur = cur.expression;
    else return null;
  }
  return null;
}

/** 找出事件字段的所有读取位置，含两种形态： */
function findEventFieldReads(fn, src) {
  const names = collectEventDerivedNames(fn, src);
  const reads = [];
  walkScoped(fn, (node) => {
    // ① 成员访问：e.currentTarget / ev.target（含别名）
    if (node.type === 'MemberExpression' && !node.computed) {
      if (EVENT_FIELDS.has(node.property.name) && names.has(getRootName(node.object))) {
        reads.push({ start: node.start, text: src.slice(node.start, node.end) });
      }
      return;
    }
    // ② 解构取值：const { currentTarget } = e —— 它根本不是 MemberExpression，
    //    只靠「下游引用」查会漏掉这一行本身
    if (node.type === 'VariableDeclarator' && node.id?.type === 'ObjectPattern' && names.has(getRootName(node.init))) {
      for (const prop of node.id.properties) {
        if (prop.type !== 'Property' || prop.computed) continue;
        const keyName = prop.key.name ?? prop.key.value;
        if (!EVENT_FIELDS.has(keyName)) continue;
        reads.push({ start: prop.start, text: `const { ${keyName}${prop.value.type === 'Identifier' && prop.value.name !== keyName ? `: ${prop.value.name}` : ''} } = ${getRootName(node.init)}` });
      }
    }
  });
  return reads;
}

/** 回调体内第一个 await 的位置；Infinity 表示整个回调没有 await */
function firstAwaitPos(fn) {
  if (!fn.body || fn.body.type !== 'BlockStatement') return Infinity;
  let min = Infinity;
  walkScoped(fn, (node) => {
    if (node.type === 'AwaitExpression' && node.start < min) min = node.start;
  });
  return min;
}

/** 截出源码片段用于报错展示 */
function sliceAt(src, start, len = 70) {
  return src.slice(start, start + len).replace(/\s+/g, ' ').trim();
}

/**
 * 取出某文件里所有 `x.addEventListener('click', async (e) => { ... })` 回调，
 * 并按「是否真的调用了导出函数」筛出导出回调。
 */
function extractExportListeners(file, src) {
  const ast = acorn.parse(src, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
  const out = [];
  walk(ast, (node) => {
    if (
      node.type !== 'CallExpression'
      || node.callee.type !== 'MemberExpression'
      || node.callee.property.type !== 'Identifier'
      || node.callee.property.name !== 'addEventListener'
    ) return;
    const [, listener] = node.arguments;
    if (!listener || listener.type !== 'ArrowFunctionExpression' || !listener.async) return;
    const typeArg = node.arguments[0];
    if (!typeArg || typeArg.type !== 'Literal' || typeArg.value !== 'click') return;

    const bodyStart = listener.body.start;
    const bodyEnd = listener.body.end;
    const calledFns = new Set();
    walkScoped(listener, (n) => {
      if (n.type === 'CallExpression' && n.callee.type === 'Identifier' && EXPORT_FNS.includes(n.callee.name)) {
        calledFns.add(n.callee.name);
      }
    });
    if (!calledFns.size) return;

    out.push({
      file,
      fn: listener,
      src,
      bodyStart,
      bodyEnd,
      calledFns: [...calledFns],
      usesLazyImport: src.slice(bodyStart, bodyEnd).includes(LAZY_IMPORT_MARKER),
      reads: findEventFieldReads(listener, src),
      firstAwait: firstAwaitPos(listener),
      snippet: sliceAt(src, bodyStart, 60),
    });
  });
  return out;
}

// 扫描作用域不硬编码文件名：以「源码里出现按需 import」为唯一判据动态派生，
// 免得日后新增引用方（或把同类回调写到第三个文件）落在守卫视野外。
const PANEL_SOURCES = Object.fromEntries(
  readdirSync(PANEL_DIR)
    .filter((f) => f.endsWith('.js'))
    .map((f) => [f, readFileSync(join(PANEL_DIR, f), 'utf-8')])
    .filter(([, src]) => src.includes(LAZY_IMPORT_MARKER)),
);

let chatManager;

beforeAll(async () => {
  chatManager = await import('../../src/side_panel/chat-manager.js');
});

beforeEach(() => {
  document.body.innerHTML = '<div id="chatContainer"></div><textarea id="userInput"></textarea>';
  Object.values(exportSpies).forEach((spy) => spy.mockClear());
});

/** 复刻面板里一条助手消息的导出菜单结构（按钮内含子元素，与真实 DOM 一致） */
function mountMessageHtml() {
  return `
    <div class="message assistant">
      <div class="message-content"><div class="markdown-body">正文</div></div>
      <div class="message-footer">
        <div class="export-menu-container">
          <button class="export-trigger-btn" type="button">导出</button>
          <div class="export-dropdown">
            <button class="export-dropdown-item export-docx-item" type="button"><svg viewBox="0 0 24 24"></svg><span>Word</span></button>
            <button class="export-dropdown-item export-pdf-item" type="button"><svg viewBox="0 0 24 24"></svg><span>PDF</span></button>
            <button class="export-dropdown-item export-md-item" type="button"><svg viewBox="0 0 24 24"></svg><span>Markdown</span></button>
            <button class="export-dropdown-item export-image-item" type="button"><svg viewBox="0 0 24 24"></svg><span>图片</span></button>
          </div>
        </div>
      </div>
    </div>`;
}

function mountMessageWithExportMenu() {
  const container = document.getElementById('chatContainer');
  container.innerHTML = mountMessageHtml();
  return container;
}

/**
 * 真机点击永远落在按钮内部的 <svg>/<span> 上，而不是按钮本身。
 * 从内部元素派发，e.target 是 span、e.currentTarget 是 button——
 * 这样「改成 e.target」会被行为层立刻撞红。
 */
async function clickFromInnerAndWait(selector) {
  const btn = document.querySelector(selector);
  const inner = btn.querySelector('span') || btn.querySelector('svg') || btn;
  inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  // 等按需 import 的微任务与后续调用落地
  await new Promise((r) => setTimeout(r, 0));
  await Promise.resolve();
  return btn;
}

// ── 契约层 ──────────────────────────────────────────────────────────────────

describe('契约：await 之后事件对象字段的真实取值', () => {
  test('currentTarget 在派发结束后被复位为 null', async () => {
    let capturedBefore = 'not-called';
    let afterAwait = 'not-called';
    const el = document.createElement('button');
    document.body.appendChild(el);

    el.addEventListener('click', async (e) => {
      capturedBefore = e.currentTarget;
      await Promise.resolve();
      afterAwait = e.currentTarget;
    });

    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    await new Promise((r) => setTimeout(r, 0));

    expect(capturedBefore).toBe(el);
    expect(afterAwait).toBeNull();
    el.remove();
  });

  test('点击落在内部元素时 target 指向内部元素——所以 e.target 不能替代 currentTarget', async () => {
    let targetValue = 'not-called';
    let currentTargetValue = 'not-called';
    const btn = document.createElement('button');
    const inner = document.createElement('span');
    btn.appendChild(inner);
    document.body.appendChild(btn);

    btn.addEventListener('click', (e) => {
      targetValue = e.target;
      currentTargetValue = e.currentTarget;
    });

    inner.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));

    expect(currentTargetValue).toBe(btn);
    expect(targetValue).toBe(inner);
    expect(targetValue).not.toBe(btn);
    btn.remove();
  });
});

// ── 行为层 ──────────────────────────────────────────────────────────────────

describe('真处理器：导出点击后必须把按钮元素交给导出函数', () => {
  // restoreMessageFromHtml 是本次报错的实际路径（从历史 HTML 恢复消息），
  // rebindAllMessages 是缓存重绑路径，两条都得驱动，不能只测一条。
  const drivers = [
    { name: 'rebindAllMessages', run: (container) => chatManager.rebindAllMessages(container), mount: mountMessageWithExportMenu },
    {
      name: 'restoreMessageFromHtml',
      run: () => chatManager.restoreMessageFromHtml(mountMessageHtml()),
      mount: () => document.getElementById('chatContainer'),
    },
  ];

  const cases = [
    ['.export-docx-item', 'exportAssistantMessageToDocx'],
    ['.export-md-item', 'exportAssistantMessageToMarkdown'],
    ['.export-pdf-item', 'exportAssistantMessageToPdf'],
    ['.export-image-item', 'exportAssistantMessageToImage'],
  ].flatMap(([selector, fnName]) => drivers.map((d) => ({ ...d, selector, fnName })));

  test.each(cases)(
    '$name + $selector → $fnName 收到按钮本身（非 null、非内部元素）',
    async ({ run, mount, selector, fnName }) => {
      const container = mount();
      run(container);

      const btn = await clickFromInnerAndWait(selector);
      const spy = exportSpies[fnName];
      expect(spy).toHaveBeenCalledTimes(1);

      const args = spy.mock.calls[0];
      expect(args[0]).toBe(container.querySelector('.message'));
      // 曾经这里是 null：await 之后 e.currentTarget 已复位，取值即崩
      expect(args[1], `${fnName} 的 exportBtn 不得为 null（须在 await 前捕获）`).toBe(btn);
      // 也不能是按钮内部的 <span>/<svg>：那样 dataset/图标/禁用全部失效
      expect(args[1].tagName, `${fnName} 的 exportBtn 必须是按钮本身，不能写成 e.target`).toBe('BUTTON');
      expect(args[2]).toBe(container.querySelector('.export-dropdown'));
    },
  );
});

// ── 形状层 ──────────────────────────────────────────────────────────────────

describe('源码接线（AST）：导出回调不得在任何 await 之后读事件对象', () => {
  const allListeners = Object.entries(PANEL_SOURCES)
    .flatMap(([file, src]) => extractExportListeners(file, src));

  test('扫描作用域按「含按需 import」动态派生，且覆盖已知引用方', () => {
    expect(Object.keys(PANEL_SOURCES).sort()).toEqual([
      'chat-manager.js',
      'chat-streaming.js',
      'message-fullscreen.js',
      'workspace-panel.js',
    ]);
  });

  test('导出回调共 16 个，且全部走按需 import（新增回调不会漏网）', () => {
    // chat-manager 4（addMessage）+ 4（restoreMessageFromHtml）+ 4（rebindAllMessages）、chat-streaming 4
    expect(allListeners.length).toBe(16);
    for (const h of allListeners) {
      expect(h.usesLazyImport, `${h.file} 的导出回调未走按需 import：${h.snippet}`).toBe(true);
    }
  });

  test('不存在任何 await 之后对事件对象 currentTarget/target 的读取', () => {
    expect(allListeners.length).toBeGreaterThan(0);
    for (const h of allListeners) {
      const late = h.reads.filter((r) => r.start > h.firstAwait);
      expect(
        late,
        `${h.file} 在 await 之后读事件对象（首个 await @${h.firstAwait}）：`
        + `${late.map((l) => l.text).join(', ')} ｜ ${h.snippet}`,
      ).toEqual([]);
    }
  });

  test('接线约定：按钮一律先捕获成局部常量，不得内联解构事件字段', () => {
    // 内联解构（`const { currentTarget } = e`）位置合法但对本仓是冗余写法，
    // 真凶是 await 之后取值；约定只保留一种形态，避免两种写法只被一种守卫覆盖。
    for (const h of allListeners) {
      const destructured = h.reads.filter((r) => r.text.startsWith('const {'));
      expect(
        destructured,
        `${h.file} 用内联解构取事件字段，请统一为「const btn = e.currentTarget」：${h.snippet}`,
      ).toEqual([]);
    }
  });

  test('传给导出函数的按钮实参不得是事件对象字段（含嵌套括号实参）', () => {
    expect(allListeners.length).toBeGreaterThan(0);
    for (const h of allListeners) {
      walkScoped(h.fn, (n) => {
        if (n.type !== 'CallExpression') return;
        if (n.callee.type !== 'Identifier' || !EXPORT_FNS.includes(n.callee.name)) return;
        for (const arg of n.arguments) {
          const late = h.reads.filter((r) => r.start === arg.start || (arg.start <= r.start && r.start < arg.end));
          expect(late, `${h.file} 把事件对象字段直接传给 ${n.callee.name}：${h.snippet}`).toEqual([]);
        }
      });
    }
  });
});
