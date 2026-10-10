// snapshot-orchestrator 单元测试：帧枚举/定向收集/全局编号/三重对应（node 环境 + chrome mock）
import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  executeSnapshotQuery,
  resolveGlobalRef,
  getTabQueryMode,
  translateRefSuggestions,
} from '../../src/background/tools/snapshot-orchestrator.js';
import { renderSnapshot } from '../../src/shared/page-snapshot-renderer.js';

const T = (n) => 90000 + n; // 每用例唯一 tabId，避免模块级编号表串扰

function mockChrome(frames, responses, { injectFails = true } = {}) {
  const calls = [];
  const chromeMock = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ content_scripts: [{ js: ['libs/qrcode.min.js', 'src/content/index.js'] }] }),
    },
    webNavigation: { getAllFrames: async () => frames },
    tabs: {
      sendMessage: (tabId, message, options, callback) => {
        calls.push({ tabId, message, options });
        const resp = responses.get(options && options.frameId);
        if (resp === 'silent') return; // 不回调：模拟无接收方
        callback(resp);
      },
      query: (_q, cb) => cb([{ id: T(99) }]),
    },
    scripting: {
      executeScript: injectFails ? () => Promise.reject(new Error('cannot inject')) : () => Promise.resolve([]),
    },
  };
  return { chromeMock, calls };
}

const el = (localRef, role, name) => ({ t: 'el', localRef, role, name, attrs: '', depth: 0, children: [] });
const frameNode = (title, extra = {}) =>
  ({ t: 'frame', title, srcUrl: null, sameOriginHref: null, orderInParent: 0, depth: 0, ...extra });
const topOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://a.com/', title: 'A', width: 800, height: 600, loadId: 'L-top' },
  overlayTrees: [], bodyTree,
});
const childOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://b.com/', title: 'Sub', width: 300, height: 200, loadId: 'L-child' },
  overlayTrees: [], bodyTree,
});
const refsOf = (content) => [...content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));
const TWO_FRAMES = [
  { frameId: 0, parentFrameId: -1, url: 'https://a.com/' },
  { frameId: 3, parentFrameId: 0, url: 'https://b.com/' },
];

afterEach(() => vi.unstubAllGlobals());

describe('executeSnapshotQuery - 全链路', () => {
  test('单帧（无子帧）：输出与 renderSnapshot 一致且 mode=local', async () => {
    const tabId = T(1);
    const ops = topOps([el(5, 'button', 'Top')]);
    const { chromeMock } = mockChrome([{ frameId: 0, parentFrameId: -1, url: 'https://a.com/' }], new Map([[0, ops]]));
    vi.stubGlobal('chrome', chromeMock);

    const r = await executeSnapshotQuery({ tabId }, 'tc-1', null);
    expect(r.success).toBe(true);
    const expected = renderSnapshot({
      frames: [{ frameIndex: 0, depth: 0, isTop: true, frameInfo: ops.frameInfo, overlayTrees: [], bodyTree: ops.bodyTree }],
    });
    expect(r.content).toBe(expected.content);
    expect(r.count).toBe(expected.count);
    expect(getTabQueryMode(tabId)).toBe('local');
  });

  test('双帧（s1 同源精确匹配）：全局编号/区块/占位行/映射', async () => {
    const tabId = T(2);
    const responses = new Map([
      [0, topOps([el(5, 'button', 'Top'), frameNode('Sub', { sameOriginHref: 'https://b.com/' })])],
      [3, childOps([el(2, 'textbox', 'Card')])],
    ]);
    const { chromeMock } = mockChrome(TWO_FRAMES, responses);
    vi.stubGlobal('chrome', chromeMock);

    const r = await executeSnapshotQuery({ tabId }, 'tc-2', null);
    expect(r.success).toBe(true);
    expect(getTabQueryMode(tabId)).toBe('global');
    expect(r.content).toContain('（含 1 个 iframe）');
    expect(r.content).toContain('iframe #1 "Sub"');
    expect(r.content).toContain('[frame #1 "Sub" · b.com]');
    expect(r.content).toContain('textbox "Card"');
    // 全局编号替换：顶层先分配，子帧随后（流序）
    const refs = refsOf(r.content);
    expect(refs.length).toBe(2);
    expect(resolveGlobalRef(tabId, refs[0])).toEqual({ frameId: 0, localRef: 5, globalRef: refs[0] });
    expect(resolveGlobalRef(tabId, refs[1])).toEqual({ frameId: 3, localRef: 2, globalRef: refs[1] });
    expect(refs[1]).toBe(refs[0] + 1);
  });

  test('双帧（s2 srcUrl 归一化匹配）：sameOriginHref 为 null 也可挂接', async () => {
    const tabId = T(3);
    const responses = new Map([
      [0, topOps([frameNode('Sub', { srcUrl: 'https://b.com/' })])], // 尾斜杠差异由归一化吸收
      [3, childOps([el(7, 'link', 'Go')])],
    ]);
    const { chromeMock } = mockChrome(
      [{ frameId: 0, parentFrameId: -1, url: 'https://a.com/' }, { frameId: 3, parentFrameId: 0, url: 'https://b.com' }],
      responses,
    );
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId }, 'tc-3', null);
    expect(r.content).toContain('iframe #1 "Sub"');
    expect(r.content).toContain('[frame #1 "Sub" · b.com]');
  });

  test('子帧不可见（visible:false）：节点移除、无区块、mode 回退 local', async () => {
    const tabId = T(4);
    const responses = new Map([
      [0, topOps([el(5, 'button', 'Top'), frameNode('Hidden')])],
      [3, { success: true, visible: false }],
    ]);
    const { chromeMock } = mockChrome(TWO_FRAMES, responses);
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId }, 'tc-4', null);
    expect(r.content).not.toContain('iframe');
    expect(r.content).not.toContain('[frame');
    expect(r.content).toContain('[ref 5]'); // local 模式：保留本地编号
    expect(getTabQueryMode(tabId)).toBe('local');
  });

  test('子帧无响应：unreachable 占位行带编号，无区块', async () => {
    const tabId = T(5);
    const responses = new Map([
      [0, topOps([frameNode('Dead', { sameOriginHref: 'https://b.com/' })])],
      [3, 'silent'],
    ]);
    const { chromeMock } = mockChrome(TWO_FRAMES, responses); // 注入失败 → 直接 unreachable
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId }, 'tc-5', null);
    expect(r.success).toBe(true);
    expect(r.content).toContain('iframe #1 "Dead"（内容不可访问）');
    expect(r.content).not.toContain('[frame #1');
    expect(r.content).toContain('（含 1 个 iframe）');
  });

  test('frames:none：跳过帧枚举、本地编号输出、mode=local', async () => {
    const tabId = T(6);
    const noneOps = topOps([el(5, 'button', 'Top')]); // none 模式 content 侧不产生 frame 节点
    const { chromeMock, calls } = mockChrome(TWO_FRAMES, new Map([[0, noneOps], [3, 'silent']]));
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId, frames: 'none' }, 'tc-6', null);
    expect(r.success).toBe(true);
    expect(r.content).toContain('[ref 5]'); // 本地编号直出
    expect(r.content).not.toContain('iframe');
    expect(getTabQueryMode(tabId)).toBe('local');
    // 仅向顶层发送（无子帧定向消息）
    expect(calls.every(c => c.options && c.options.frameId === 0)).toBe(true);
  });

  test('未查询 tab：resolveGlobalRef 为 null，mode 为 null', () => {
    expect(resolveGlobalRef(T(50), 1)).toBeNull();
    expect(getTabQueryMode(T(50))).toBeNull();
    expect(translateRefSuggestions(T(50), 0, [{ ref: 1, role: 'button', name: '' }])).toEqual([]);
  });
});
