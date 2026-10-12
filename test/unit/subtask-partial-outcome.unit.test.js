// 子任务"部分完成"语义修复回归测试
// 背景：子任务标"失败"的唯一路径是内层 ReAct 循环整体抛异常且重试耗尽——与"几个节点失败"
// 无直接因果。但 UI 把红色「失败」和「98/101 完成，2 个节点失败」并排，用户必然误读为
// "因 2 个节点失败而整体失败"（其实 97% 的工作已完成）；且失败子任务上报给父模型的
// Result 只有 error.message，父模型完全不知道已完成的部分产出，"带着失败继续"是盲续。
// 修复：① UI 三态展示——failed 且节点成功率 ≥80% 显示橙色「部分完成」并附真实中断原因；
//      ② 失败上报 Result 附加内层已完成节点的产出摘要。
// @vitest-environment jsdom
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// jsdom 环境下 import.meta.url 非 file 协议，源文件读取统一用项目根相对路径
const root = process.cwd();
const CHAT_MANAGER_SRC = readFileSync(resolve(root, 'src/side_panel/chat-manager.js'), 'utf8');
const REACT_LOOP_SRC = readFileSync(resolve(root, 'src/background/react-loop.js'), 'utf8');
const STYLES_SRC = readFileSync(resolve(root, 'src/side_panel/styles.css'), 'utf8');

const noop = () => {};

let classifySubtaskOutcome, buildSubtaskPartialSummary;

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
  ({ classifySubtaskOutcome } = await import('../../src/side_panel/chat-manager.js'));
  ({ buildSubtaskPartialSummary } = await import('../../src/background/react-loop.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// ==================== 方案1：展示层三态分类（纯函数） ====================

describe('classifySubtaskOutcome 部分完成分类', () => {
  test('failed 且节点成功率 ≥80%（截图场景 98/101）→ partial', () => {
    expect(classifySubtaskOutcome('failed', 98, 101)).toBe('partial');
    expect(classifySubtaskOutcome('failed', 4, 5)).toBe('partial'); // 恰好 80% 含边界
  });

  test('failed 且成功率不足 80% → 维持 failed（真正的失败不粉饰）', () => {
    expect(classifySubtaskOutcome('failed', 3, 5)).toBe('failed');
    expect(classifySubtaskOutcome('failed', 10, 50)).toBe('failed');
  });

  test('failed 且无任何节点记录（total=0，没证据说明做过什么）→ failed', () => {
    expect(classifySubtaskOutcome('failed', 0, 0)).toBe('failed');
  });

  test('非 failed 状态原样透传（success/processing 不受影响）', () => {
    expect(classifySubtaskOutcome('success', 98, 101)).toBe('success');
    expect(classifySubtaskOutcome('processing', 0, 5)).toBe('processing');
    expect(classifySubtaskOutcome(null, 0, 0)).toBe(null);
  });
});

// ==================== 方案2：失败上报的已完成产出摘要（纯函数） ====================

describe('buildSubtaskPartialSummary 已完成产出摘要', () => {
  const node = (over = {}) => ({
    id: Math.random().toString(36).slice(2),
    nodeName: '工具节点', nodeType: 'tool_exec', status: 'success', result: 'OK', ...over,
  });

  test('空日志 / 非数组 → 空串（失败原因保持原样，不追加空摘要）', () => {
    expect(buildSubtaskPartialSummary(null)).toBe('');
    expect(buildSubtaskPartialSummary([])).toBe('');
    expect(buildSubtaskPartialSummary(undefined)).toBe('');
  });

  test('只提取成功且有产出的节点：failed / processing / 无 result 全部排除', () => {
    const summary = buildSubtaskPartialSummary([
      node({ nodeName: '读文件A', result: '内容A' }),
      node({ nodeName: '坏节点', status: 'failed', result: '报错' }),
      node({ nodeName: '挂起节点', status: 'processing' }),
      node({ nodeName: '无产出节点', result: '' }),
      node({ nodeName: '写文件B', result: '内容B' }),
    ]);
    expect(summary).toContain('读文件A');
    expect(summary).toContain('写文件B');
    expect(summary).not.toContain('坏节点');
    expect(summary).not.toContain('挂起节点');
    expect(summary).not.toContain('无产出节点');
  });

  test('最多取最近 5 个成功产出节点（防摘要过大挤占父模型上下文）', () => {
    const log = Array.from({ length: 8 }, (_, i) => node({ nodeName: `N${i}`, result: `R${i}` }));
    const summary = buildSubtaskPartialSummary(log);
    expect(summary).toContain('N7');
    expect(summary).toContain('N3');
    expect(summary).not.toContain('N2');
    expect(summary).not.toContain('N1');
    expect(summary).not.toContain('N0');
  });

  test('超长产出截断（单节点上限内），对象 result 可序列化', () => {
    const long = 'x'.repeat(2000);
    const summary = buildSubtaskPartialSummary([
      node({ nodeName: '大输出', result: long }),
      node({ nodeName: '对象输出', result: { ok: 1, data: 'y' } }),
    ]);
    expect(summary.length).toBeLessThan(2500); // 5 节点 × 300 + 框架文本
    expect(summary).toContain('大输出');
    expect(summary).toContain('对象输出');
  });
});

// ==================== 接线守卫 ====================

describe('接线守卫：方案1 UI', () => {
  test('chat-manager 渲染走 classifySubtaskOutcome，partial 用独立橙色标签与「部分完成」文案', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/export function classifySubtaskOutcome/);
    expect(CHAT_MANAGER_SRC).toMatch(/classifySubtaskOutcome\(/);
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-status-partial/);
    expect(CHAT_MANAGER_SRC).toMatch(/t\('chatMsg\.subtaskPartial'\)/);
  });

  test('失败/部分完成时展示真实中断原因（取子任务主日志行 error，不再让用户只见"2 个节点失败"猜因）', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/subtask-fail-reason/);
    expect(CHAT_MANAGER_SRC).toMatch(/t\('chatMsg\.subtaskFailReason'/);
    // 中断原因来源：nodeType==='subtask' 主行的 error 字段
    expect(CHAT_MANAGER_SRC).toMatch(/nodeType\s*===?\s*'subtask'[\s\S]{0,200}?\.error|\.error[\s\S]{0,200}?nodeType\s*===?\s*'subtask'/);
  });

  test('「部分完成」与「中断原因」文案中英文均已注册', () => {
    const zh = CHAT_MANAGER_SRC.match(/registerTranslations\('zh'[\s\S]*?\n\}\);/);
    const en = CHAT_MANAGER_SRC.match(/registerTranslations\('en'[\s\S]*?\n\}\);/);
    expect(zh && zh[0]).toMatch(/subtaskPartial: '部分完成'/);
    expect(zh && zh[0]).toMatch(/subtaskFailReason:/);
    expect(en && en[0]).toMatch(/subtaskPartial: 'Partial'/);
    expect(en && en[0]).toMatch(/subtaskFailReason:/);
  });

  test('styles.css 定义 partial 橙色样式（区别于红色 failed）', () => {
    expect(STYLES_SRC).toMatch(/\.subtask-status-partial\s*\{/);
    expect(STYLES_SRC).toMatch(/\.subtask-fail-reason\s*\{/);
  });
});

describe('接线守卫：方案2 失败上报', () => {
  test('react-loop 失败 return 的 Result 附加已完成摘要（父模型不再盲续）', () => {
    expect(REACT_LOOP_SRC).toMatch(/export function buildSubtaskPartialSummary/);
    expect(REACT_LOOP_SRC).toMatch(/buildSubtaskPartialSummary\(error\.executionLog\)/);
    // 失败返回的 result 由纯 error.message 升级为"原因 + 部分产出"组合
    expect(REACT_LOOP_SRC).toMatch(/result:\s*partialSummary\s*\?[\s\S]{0,200}: error\.message/);
  });
});
