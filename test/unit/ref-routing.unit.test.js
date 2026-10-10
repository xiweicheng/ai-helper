// ref 跨帧路由单元测试：定向发送/失效建议翻译/fill_form 拆分合并（node 环境 + chrome mock）
import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  executeSnapshotQuery,
  resolveGlobalRef,
  getTabQueryMode,
  shouldRouteRefTool,
  routeSingleRefTool,
  routeFillForm,
  translateRoutedResult,
} from '../../src/background/tools/snapshot-orchestrator.js';

const T = (n) => 95000 + n; // 每用例唯一 tabId，避免模块级编号表串扰
const TWO_FRAMES = [
  { frameId: 0, parentFrameId: -1, url: 'https://a.com/' },
  { frameId: 3, parentFrameId: 0, url: 'https://b.com/' },
];
const el = (localRef, role, name) => ({ t: 'el', localRef, role, name, attrs: '', depth: 0, children: [] });
const frameNode = (title, extra = {}) =>
  ({ t: 'frame', title, srcUrl: null, sameOriginHref: null, orderInParent: 0, depth: 0, ...extra });
const topOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://a.com/', title: 'A', width: 800, height: 600, loadId: 'L-top' },
  overlayTrees: [],
  bodyTree,
});
const childOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://b.com/', title: 'Sub', width: 300, height: 200, loadId: 'L-child' },
  overlayTrees: [],
  bodyTree,
});

/** handlers: Map<frameId, (msg) => 响应>；handler 非函数模拟无接收方（不回调） */
function mockChrome(frames, handlers) {
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
        const handler = handlers.get(options && options.frameId);
        if (typeof handler !== 'function') return;
        callback(handler(message));
      },
      query: (_q, cb) => cb([{ id: T(99) }]),
    },
    scripting: { executeScript: () => Promise.reject(new Error('cannot inject')) },
  };
  return { chromeMock, calls };
}

// 每次生成新对象：orchestrator 会原地改写 localRef，共享 fixture 会跨用例累积污染
const CHILD_BODY = () => [el(2, 'textbox', 'Card'), el(4, 'button', 'Go')];

/** 建一个 mode=global 的 tab：顶层 [button "Top", frame "Sub"]，子帧 [textbox "Card", button "Go"] */
async function setupGlobalTab(n, fillResponses = {}) {
  const tabId = T(n);
  const handlers = new Map([
    [0, (msg) => msg.type === 'FILL_FORM'
      ? (fillResponses.top || { success: true, message: 'ok', details: [] })
      : topOps([el(5, 'button', 'Top'), frameNode('Sub', { sameOriginHref: 'https://b.com/' })])],
    [3, (msg) => msg.type === 'FILL_FORM'
      ? (fillResponses.child || { success: true, message: 'ok', details: [] })
      : childOps(CHILD_BODY())],
  ]);
  const { chromeMock, calls } = mockChrome(TWO_FRAMES, handlers);
  vi.stubGlobal('chrome', chromeMock);
  const r = await executeSnapshotQuery({ tabId }, `setup-${n}`, null);
  expect(r.success).toBe(true);
  expect(getTabQueryMode(tabId)).toBe('global');
  const refFor = (name) => {
    const line = r.content.split('\n').find(l => l.includes(`"${name}"`) && l.includes('[ref '));
    const m = line && line.match(/\[ref (\d+)\]/);
    return m ? Number(m[1]) : null;
  };
  return { tabId, calls, refFor, content: r.content };
}

/** 建一个 mode=local 的 tab（无子帧） */
async function setupLocalTab(n) {
  const tabId = T(n);
  const handlers = new Map([[0, () => topOps([el(1, 'button', 'Solo')])]]);
  const { chromeMock, calls } = mockChrome(
    [{ frameId: 0, parentFrameId: -1, url: 'https://a.com/' }], handlers,
  );
  vi.stubGlobal('chrome', chromeMock);
  const r = await executeSnapshotQuery({ tabId }, `setup-local-${n}`, null);
  expect(r.success).toBe(true);
  expect(getTabQueryMode(tabId)).toBe('local');
  return { tabId, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('shouldRouteRefTool - 路由判定矩阵', () => {
  test('global 模式下按 ref 判定；local / 未查询 tab 不路由', async () => {
    const { tabId } = await setupGlobalTab(2);
    expect(shouldRouteRefTool('interact_element', { ref: 1 }, tabId)).toBe(true);
    expect(shouldRouteRefTool('interact_element', { selector: '#x' }, tabId)).toBe(false);
    expect(shouldRouteRefTool('select_dropdown', { ref: 1 }, tabId)).toBe(true);
    // triggerSelector 存在时 ref 被 content 侧忽略 → legacy 直通
    expect(shouldRouteRefTool('select_dropdown', { ref: 1, triggerSelector: '#t' }, tabId)).toBe(false);
    expect(shouldRouteRefTool('fill_form', { fields: [{ selector: '#a', value: 'v' }] }, tabId)).toBe(false);
    expect(shouldRouteRefTool('fill_form', { fields: [{ selector: '#a', value: 'v' }, { ref: 1, value: 'w' }] }, tabId)).toBe(true);
    expect(shouldRouteRefTool('fill_form', { fields: [] }, tabId)).toBe(false);

    const local = await setupLocalTab(2);
    expect(shouldRouteRefTool('interact_element', { ref: 1 }, local.tabId)).toBe(false);
    expect(shouldRouteRefTool('interact_element', { ref: 1 }, T(98))).toBe(false); // 未查询过
  });
});

describe('routeSingleRefTool - 单 ref 工具路由', () => {
  test('interact_element：全局 ref 定向发送到所属帧（消息 ref=本地编号 + _frameRouted）', async () => {
    const { tabId, calls, refFor } = await setupGlobalTab(1);
    const cardRef = refFor('Card'); // 子帧元素
    expect(cardRef).not.toBeNull();

    const before = calls.length;
    const r = await routeSingleRefTool('interact_element', { ref: cardRef, action: 'click' }, 'tc-1', tabId);

    const sent = calls.slice(before).filter(c => c.message.type === 'INTERACT_ELEMENT');
    expect(sent.length).toBe(1);
    expect(sent[0].options.frameId).toBe(3);
    expect(sent[0].message.ref).toBe(2); // 本地编号
    expect(sent[0].message.action).toBe('click');
    expect(sent[0].message._frameRouted).toBe(true);
    expect(r.success).toBe(true);
    expect(r.tool_call_id).toBe('tc-1');
  });

  test('无效全局 ref：不发送任何消息，直接返回 invalidRef 错误', async () => {
    const { tabId, calls } = await setupGlobalTab(3);
    const before = calls.length;
    const r = await routeSingleRefTool('interact_element', { ref: 987654 }, 'tc-3', tabId);
    expect(r.success).toBe(false);
    expect(r.error).toContain('987654');
    expect(r.tool_call_id).toBe('tc-3');
    expect(calls.length).toBe(before); // 未发送
  });
});

describe('translateRoutedResult - 结果翻译', () => {
  test('failure + suggestions：本地建议翻译为全局编号并重建错误文案', async () => {
    const { tabId, refFor } = await setupGlobalTab(4);
    const cardRef = refFor('Card');
    const mapping = resolveGlobalRef(tabId, cardRef);
    const goRef = refFor('Go');

    const response = {
      success: false,
      error: '本地文案 ref=99',
      suggestions: [{ ref: 4, role: 'button', name: 'Go' }], // 本地编号建议
      tool_call_id: 'tc-4',
    };
    const r = translateRoutedResult(response, mapping, tabId);
    expect(r.suggestions).toBeUndefined();
    expect(r.error).toContain(`ref=${cardRef}`); // 全局编号重建（非本地 =99）
    expect(r.error).toContain(`ref ${goRef}`);   // 建议翻译为全局编号
    expect(r.error).toContain('button "Go"');
    expect(r.tool_call_id).toBe('tc-4');

    // 普通执行失败（无 suggestions）：原样返回
    const plain = { success: false, error: 'click intercepted', tool_call_id: 'tc-4b' };
    expect(translateRoutedResult(plain, mapping, tabId)).toBe(plain);
    // 成功响应：原样返回
    const ok = { success: true, content: 'x', tool_call_id: 'tc-4c' };
    expect(translateRoutedResult(ok, mapping, tabId)).toBe(ok);
  });
});

describe('routeFillForm - 表单跨帧拆分合并', () => {
  test('按归属帧拆分发送（字段本地化）并合并成功统计', async () => {
    const { tabId, calls, refFor } = await setupGlobalTab(5, {
      top: { success: true, message: 'ok', details: [
        { selector: '#plain', success: true, value: 'B' },
        { selector: 'ref=5', success: true, value: 'C' },
      ] },
      child: { success: true, message: 'ok', details: [
        { selector: 'ref=2', success: true, value: 'A' },
      ] },
    });
    const topRef = refFor('Top');
    const cardRef = refFor('Card');
    const before = calls.length;

    const r = await routeFillForm({
      fields: [
        { ref: cardRef, value: 'A' },
        { selector: '#plain', value: 'B' },
        { ref: topRef, value: 'C' },
      ],
      waitTime: 100,
    }, 'tc-5', tabId);

    const sent = calls.slice(before).filter(c => c.message.type === 'FILL_FORM');
    expect(sent.length).toBe(2); // 子帧组 + 顶层组（#plain 与 Top 同属顶层）
    const toChild = sent.find(c => c.options.frameId === 3);
    const toTop = sent.find(c => c.options.frameId === 0);
    expect(toChild.message.fields).toEqual([{ ref: 2, value: 'A' }]); // 本地编号
    expect(toChild.message._frameRouted).toBe(true);
    expect(toChild.message.waitTime).toBe(100);
    expect(toTop.message.fields).toEqual([
      { selector: '#plain', value: 'B' },
      { ref: 5, value: 'C' }, // 顶层本地编号
    ]);

    expect(r.success).toBe(true);
    expect(r.message).toContain('3/3');
    expect(r.tool_call_id).toBe('tc-5');
  });

  test('失败字段标注 frameId；无效 ref 字段不发送仅计入失败', async () => {
    const { tabId, calls, refFor } = await setupGlobalTab(6, {
      child: { success: true, message: 'ok', details: [
        { selector: 'ref=2', success: false, error: 'element not found' },
      ] },
    });
    const cardRef = refFor('Card');
    const before = calls.length;

    const r = await routeFillForm({
      fields: [
        { ref: cardRef, value: 'A' },
        { ref: 888888, value: 'B' }, // 无效全局 ref
      ],
    }, 'tc-6', tabId);

    const sent = calls.slice(before).filter(c => c.message.type === 'FILL_FORM');
    expect(sent.length).toBe(1); // 仅子帧组；无效 ref 未发送
    expect(sent[0].options.frameId).toBe(3);

    expect(r.success).toBe(false);
    expect(r.message).toContain('0/2'); // 两个字段均失败（子帧失败 + 无效 ref）
    expect(r.message).toContain('frame 3');    // 子帧失败标注
    expect(r.message).toContain('888888');     // 无效 ref 字段清单
    expect(r.error).toContain('888888');       // 首个失败原因 = invalidRefField（先于组响应产生）
    const cardDetail = r.details.find(d => d.frameId === 3);
    expect(cardDetail.success).toBe(false);
    expect(cardDetail.error).toBe('element not found');
  });
});
