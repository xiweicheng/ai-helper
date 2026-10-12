// 子任务节点列表"点击统计数字 → 按成功/失败过滤"功能回归测试
// 需求：节点多时（100+）用户想快速定位失败节点，不用手动下拉逐个找。
// 交互：点击 ✓N / ✗N 统计 → 展开节点列表并只显示对应状态的节点；再点一次取消过滤；
//       点另一个数字切换过滤。过滤状态跨 innerHTML 重建持久（挂在 progressEl 上）。
// 抽出两个纯函数（toggleNodeFilter / applyNodeFilter）做行为测试，渲染/样式/i18n 用源码守卫。
// @vitest-environment jsdom
import { describe, test, expect, beforeAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom 环境下 import.meta.url 非 file 协议，源文件读取统一用项目根相对路径
const root = process.cwd();
const CHAT_MANAGER_SRC = readFileSync(resolve(root, 'src/side_panel/chat-manager.js'), 'utf8');
const STYLES_SRC = readFileSync(resolve(root, 'src/side_panel/styles.css'), 'utf8');

const noop = () => {};

let toggleNodeFilter, applyNodeFilter;

beforeAll(async () => {
  const makeStore = () => ({
    get: (keys, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
    set: (obj, cb) => { if (typeof cb === 'function') cb(); return Promise.resolve(); },
  });
  globalThis.chrome = {
    storage: {
      local: makeStore(), session: makeStore(),
      onChanged: { addListener: noop },
    },
    runtime: {
      lastError: null, id: 'test-ext',
      getManifest: () => ({ version: '0.0.0', content_scripts: [{ js: [] }] }),
      getURL: (p) => p,
      sendMessage: (msg, cb) => { if (typeof cb === 'function') cb({}); return Promise.resolve({}); },
      connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
      onMessage: { addListener: noop, removeListener: noop },
      getContexts: noop,
    },
    tabs: {
      query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
      remove: noop, reload: noop, goBack: noop, goForward: noop,
      captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
    },
    scripting: { executeScript: noop },
    bookmarks: { getTree: noop, search: noop },
    history: { search: noop },
    cookies: { get: noop, getAll: noop, set: noop, remove: noop },
    downloads: { download: noop },
    notifications: { create: noop },
    offscreen: { createDocument: noop, hasDocument: noop },
    sidePanel: { setPanelBehavior: () => Promise.resolve() },
  };
  document.body.innerHTML = '<textarea id="userInput"></textarea><div id="messageList"></div>';
  vi.resetModules();
  ({ toggleNodeFilter, applyNodeFilter } = await import('../../src/side_panel/chat-manager.js'));
});

const node = (status, name = 'n') => ({ status, nodeName: name, nodeType: 'tool_exec' });

describe('toggleNodeFilter：点击切换语义', () => {
  test('无过滤时点击 success/failed → 激活对应过滤', () => {
    expect(toggleNodeFilter(null, 'success')).toBe('success');
    expect(toggleNodeFilter(null, 'failed')).toBe('failed');
  });
  test('再次点击同一状态 → 取消过滤（回到 null）', () => {
    expect(toggleNodeFilter('success', 'success')).toBeNull();
    expect(toggleNodeFilter('failed', 'failed')).toBeNull();
  });
  test('已激活一个状态时点击另一个 → 切换过滤', () => {
    expect(toggleNodeFilter('success', 'failed')).toBe('failed');
    expect(toggleNodeFilter('failed', 'success')).toBe('success');
  });
  test('非法点击目标（total 等）→ 维持当前过滤不变', () => {
    expect(toggleNodeFilter('failed', 'total')).toBe('failed');
    expect(toggleNodeFilter(null, 'total')).toBeNull();
    expect(toggleNodeFilter(null, undefined)).toBeNull();
  });
});

describe('applyNodeFilter：按状态过滤节点列表', () => {
  const nodes = [
    node('success', 'a'), node('failed', 'b'), node('success', 'c'),
    node('processing', 'd'), node('failed', 'e'),
  ];
  test('null/非法 filter → 原样返回全部节点', () => {
    expect(applyNodeFilter(nodes, null)).toHaveLength(5);
    expect(applyNodeFilter(nodes, 'total')).toHaveLength(5);
  });
  test('failed → 只保留失败节点', () => {
    expect(applyNodeFilter(nodes, 'failed').map((n) => n.nodeName)).toEqual(['b', 'e']);
  });
  test('success → 只保留成功节点（processing 不算成功）', () => {
    expect(applyNodeFilter(nodes, 'success').map((n) => n.nodeName)).toEqual(['a', 'c']);
  });
  test('空数组/非数组输入安全返回空', () => {
    expect(applyNodeFilter([], 'failed')).toEqual([]);
    expect(applyNodeFilter(undefined, 'failed')).toEqual([]);
  });
});

describe('渲染接线守卫', () => {
  test('运行态统计 span 带 data-node-filter 标记（success/failed 可点，total 不可点）', () => {
    // class 值带动态选中态后缀，断言容忍 ${...} 插值
    expect(CHAT_MANAGER_SRC).toMatch(/class="subtask-stat-done(?:\$\{[^"\}]*\})?" data-node-filter="success"/);
    expect(CHAT_MANAGER_SRC).toMatch(/class="subtask-stat-fail(?:\$\{[^"\}]*\})?" data-node-filter="failed"/);
    // 总数不带过滤标记
    const totalTag = CHAT_MANAGER_SRC.match(/<span class="subtask-stat-total"[^>]*>/);
    expect(totalTag).toBeTruthy();
    expect(totalTag[0]).not.toContain('data-node-filter');
  });
  test('完成态统计（全部完成/部分完成文案中的数字）同样可点过滤', () => {
    // 完成行不再用整段 i18n 文本，而是拆出可点击的 ✓N / ✗N span
    const doneIdx = CHAT_MANAGER_SRC.indexOf('subtask-progress-line done');
    expect(doneIdx).toBeGreaterThan(-1);
    const snippet = CHAT_MANAGER_SRC.slice(doneIdx, doneIdx + 700);
    expect(snippet).toContain('data-node-filter="success"');
    expect(snippet).toContain('data-node-filter="failed"');
  });
  test('过滤状态挂在 progressEl._nodeFilter 上，跨 innerHTML 重建持久', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/progressEl\._nodeFilter\s*=\s*toggleNodeFilter/);
    expect(CHAT_MANAGER_SRC).toMatch(/applyNodeFilter\(\s*subtaskNodes,\s*progressEl\._nodeFilter\s*\)/);
  });
  test('点击统计数字自动展开节点列表（仅激活时展开，取消不强制收起）', () => {
    const clickIdx = CHAT_MANAGER_SRC.indexOf('progressEl._clickDelegated = true');
    expect(clickIdx).toBeGreaterThan(-1);
    const handlerWindow = CHAT_MANAGER_SRC.slice(clickIdx, clickIdx + 900);
    expect(handlerWindow).toMatch(/data-node-filter/);
    expect(handlerWindow).toMatch(/if \(progressEl\._nodeFilter\)[\s\S]{0,80}classList\.add\('subtask-expanded'\)/);
  });
  test('激活的统计项有选中态样式标记', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-stat-active/);
  });
  test('过滤结果为空时显示提示而非空白', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-node-empty/);
    expect(CHAT_MANAGER_SRC).toMatch(/chatMsg\.subtaskFilterEmpty/);
  });
});

describe('i18n 双语', () => {
  test('zh/en 均定义 subtaskFilterEmpty 键', () => {
    const zhIdx = CHAT_MANAGER_SRC.indexOf("subtaskAllDone: '✓");
    const enIdx = CHAT_MANAGER_SRC.indexOf("subtaskAllDone: '✓ All done");
    expect(zhIdx).toBeGreaterThan(-1);
    expect(enIdx).toBeGreaterThan(-1);
    expect(CHAT_MANAGER_SRC.slice(zhIdx, zhIdx + 400)).toContain('subtaskFilterEmpty');
    expect(CHAT_MANAGER_SRC.slice(enIdx, enIdx + 400)).toContain('subtaskFilterEmpty');
  });
});

describe('样式', () => {
  test('统计项可点击光标 + 悬停反馈', () => {
    const idx = STYLES_SRC.indexOf('[data-node-filter]');
    expect(idx).toBeGreaterThan(-1);
    expect(STYLES_SRC.slice(idx, idx + 260)).toMatch(/cursor:\s*pointer/);
  });
  test('选中态（subtask-stat-active）与空提示（subtask-node-empty）样式存在', () => {
    expect(STYLES_SRC).toMatch(/\.subtask-stat-active\s*\{/);
    expect(STYLES_SRC).toMatch(/\.subtask-node-empty\s*\{/);
  });
});
