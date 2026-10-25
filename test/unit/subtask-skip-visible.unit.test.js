// 子任务「中断前已完成，跳过重放」在侧边栏的可见性回归测试
//
// 背景（真机凭据，非推断）：探针 _subtask-interrupt-resume-e2e.mjs 三层取证结果是
// 「SW 发出含跳过 2 条 / UI 收到含跳过 2 条 / DOM 含文案 false」——消息和节点级字段
// { nodeType:'subtask', subtaskIndex:0, skippedReplay:true } 确实到了侧边栏，
// 但用户看到的行与「本轮真跑完」的子任务一模一样（同为「完成 ✓ 全部完成」）。
// 防重放对用户的唯一价值就是"这些写操作没被二次执行"，看不见等于没做。
//
// 根因是渲染层从来不读这个字段：清单行标题取 message.subtaskName（干净计划名），
// 带跳过语义的 nodeName 不参与渲染，skippedReplay 在 UI 侧零消费。
//
// 设计约束（写这份测试时先否掉了一个更"顺手"的方案，此处留档防止重回）：
// 不去改 subtaskMainLog 的取法。resume 场景下同一子任务在 executionLog 里有两条
// nodeType==='subtask' 条目——中断前那轮写的（带 result 产出摘要）在前、本轮跳过
// 节点在后。若把 mainLog 改成"优先取跳过节点"，跳过节点没有 result，行里的
// 「产出摘要：SUB1_DONE…」会一起消失——用可见性换掉已有信息，是回归不是修复。
// 所以判定独立成一个只扫描标记的函数，mainLog 取法维持原样（下方守卫用例钉住）。
// @vitest-environment jsdom
import { describe, test, expect, beforeAll, afterAll, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const root = process.cwd();
const CHAT_MANAGER_SRC = readFileSync(resolve(root, 'src/side_panel/chat-manager.js'), 'utf8');
const STYLES_SRC = readFileSync(resolve(root, 'src/side_panel/styles.css'), 'utf8');

const noop = () => {};

let isSubtaskReplaySkipped;

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
  ({ isSubtaskReplaySkipped } = await import('../../src/side_panel/chat-manager.js'));
});

afterAll(() => {
  vi.unstubAllGlobals();
});

// 真机里 SUB1 在 executionLog 中的实际形态：中断前完成节点（带 result）在前，
// 本轮跳过节点（带 skippedReplay）在后
const PRE_INTERRUPTION = {
  id: 'old-1', nodeType: 'subtask', status: 'success', subtaskIndex: 0,
  subtaskName: 'SUB1 选型', nodeName: '子任务 1: SUB1 选型 (完成)', result: 'SUB1_DONE',
};
const SKIP_NODE = {
  id: 'new-1', nodeType: 'subtask', status: 'success', subtaskIndex: 0,
  subtaskName: 'SUB1 选型', nodeName: '子任务 1: SUB1 选型（中断前已完成，跳过重放）',
  skippedReplay: true,
};

describe('isSubtaskReplaySkipped 跳过状态扫描', () => {
  test('中断前旧节点与本轮跳过节点并存 → 真（真机场景，取第一条会漏判）', () => {
    expect(isSubtaskReplaySkipped([PRE_INTERRUPTION, SKIP_NODE], 0)).toBe(true);
  });

  test('跳过节点排在前面时同样为真（不依赖数组顺序）', () => {
    expect(isSubtaskReplaySkipped([SKIP_NODE, PRE_INTERRUPTION], 0)).toBe(true);
  });

  test('本轮真跑完（只有中断前/本轮的普通完成节点）→ 假，不得挂跳过标记', () => {
    expect(isSubtaskReplaySkipped([PRE_INTERRUPTION], 0)).toBe(false);
    expect(isSubtaskReplaySkipped([], 0)).toBe(false);
  });

  test('不得跨子任务判定：只有 SUB2 跳过时，SUB1 必须为假', () => {
    const skipOfOther = { ...SKIP_NODE, subtaskIndex: 1 };
    expect(isSubtaskReplaySkipped([PRE_INTERRUPTION, skipOfOther], 0)).toBe(false);
  });

  test('只看 nodeType=subtask 的主日志，内层工具/API 节点带该字段也不参与', () => {
    const toolNode = { id: 'x', nodeType: 'tool_exec', status: 'success', subtaskIndex: 0, skippedReplay: true };
    expect(isSubtaskReplaySkipped([toolNode], 0)).toBe(false);
  });

  test('subtaskIndex 为 0 时必须能命中（首子任务 index 就是 0，falsy 判断会整体哑火）', () => {
    expect(isSubtaskReplaySkipped([SKIP_NODE], 0)).toBe(true);
  });

  test('只认布尔 true：经 IndexedDB 往返的字符串/数字脏值不得误标（误标比不显示更糟）', () => {
    for (const dirty of ['true', 1, {}, 'false']) {
      expect(isSubtaskReplaySkipped([{ ...SKIP_NODE, skippedReplay: dirty }], 0)).toBe(false);
    }
  });

  test('非数组入参与脏条目返回假且不抛（渲染处以三元消费）', () => {
    expect(isSubtaskReplaySkipped(null, 0)).toBe(false);
    expect(isSubtaskReplaySkipped(undefined, 0)).toBe(false);
    expect(isSubtaskReplaySkipped([null, undefined, { nodeType: 'subtask' }], 0)).toBe(false);
  });
});

describe('渲染接线与文案守卫', () => {
  test('清单行渲染消费跳过判定，标记进入折叠头部', () => {
    // 必须钉住「标记的唯一条件是判定本身」：只 toContain('isSubtaskReplaySkipped(executionLog, si)')
    // 的话，false && isSubtaskReplaySkipped(...) 这种接线废掉的写法照样命中（变异复验 M7
    // 就是这么存活的），而纯函数全绿、用户仍什么都看不见。
    expect(CHAT_MANAGER_SRC).toMatch(
      /const skipMarkHtml = isSubtaskReplaySkipped\(executionLog, si\)\s*\?/,
    );
    expect(CHAT_MANAGER_SRC).toContain('${skipMarkHtml}${statusHtml}');
    expect(CHAT_MANAGER_SRC).toContain('subtask-replay-skipped');
  });

  test('subtaskMainLog 取法必须维持原样：改了它会把跳过节点的无 result 带进详情区，产出摘要随之消失', () => {
    expect(CHAT_MANAGER_SRC).toContain(
      "const subtaskMainLog = executionLog.find(e => e.subtaskIndex === si && e.nodeType === 'subtask');",
    );
  });

  test('中英文各一份标记文案与悬停说明', () => {
    expect((CHAT_MANAGER_SRC.match(/subtaskReplaySkipped: '/g) || []).length).toBe(2);
    expect((CHAT_MANAGER_SRC.match(/subtaskReplaySkippedHint: '/g) || []).length).toBe(2);
  });

  test('标记类名为 kebab-case、在样式表里有定义，且颜色走主题 token 不硬编码', () => {
    expect(STYLES_SRC).toContain('.subtask-replay-skipped');
    const block = STYLES_SRC.slice(STYLES_SRC.indexOf('.subtask-replay-skipped'));
    expect(block.slice(0, 400)).toContain('var(--border-default)');
    expect(block.slice(0, 400)).toContain('var(--text-tertiary)');
  });
});
