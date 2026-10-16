// @vitest-environment jsdom
// PERF-06(NEW-04) 行为取证：预览期 window 监听必须随预览轮次作废，不逐轮累积
//
// 为什么放这里而不是真扩展探针：真跑一次 PDF/PPTX/图片预览要把 Agent 起起来、
// 走完配对、再准备三种二进制素材，装置成本远超这 9 行改动本身的风险面。
// 本文件用真模块真函数驱动：import 真的 workspace-panel.js，调它导出的
// previewArtifactFile，走真的 previewFile → previewImage 分支，因此注册监听、
// AbortController 的创建与 abort、signal 传给 addEventListener 全是真实行为，
// 只在网络层（Agent 的 /api/fs/download-stream）打了桩。
import { describe, test, expect, beforeAll, vi } from 'vitest';

const noop = () => {};
// 面板里既用 callback 风格也用 promise 风格（.catch），桩必须两者都供得上
const storageStub = () => {
  const fn = (...args) => {
    const cb = args.find((a) => typeof a === 'function');
    if (cb) cb({});
    return Promise.resolve({});
  };
  return fn;
};
globalThis.chrome = {
  storage: { local: { get: storageStub(), set: storageStub(), remove: storageStub() }, onChanged: { addListener: noop } },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: noop,
    onMessage: { addListener: noop },
    getContexts: noop,
    id: 'probe',
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
};

const PNG_BYTES = Uint8Array.from(atob(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='
), (c) => c.charCodeAt(0));

// window 监听登记表：给每个 handler 套一层调用计数，所以「作废后真的不再被调用」
// 能直接拿次数当证据，而不是只能读 signal.aborted 这个标记
const windowListeners = [];
const realAdd = window.addEventListener.bind(window);
window.addEventListener = (type, handler, options) => {
  const rec = { type, handler, options, calls: 0 };
  windowListeners.push(rec);
  realAdd(type, (...args) => { rec.calls++; return handler(...args); }, options);
};

// Agent 侧只有取文件这一条被用到，全部桩掉
vi.mock('../../src/side_panel/workspace-manager.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getAgentConfig: async () => ({ url: 'http://127.0.0.1:59999', token: 'probe' }),
    getWorkspaceRoot: async () => '/ws',
    getHomeDir: async () => null,
    expandHomePrefix: async (p) => p,
    listDirectory: async () => ({ success: true, entries: [] }),
    getFileIcon: () => '<svg></svg>',
    formatFileSize: () => '1 KB',
    formatTime: () => '12:00:00',
    supportsPreview: () => true,
  };
});

// fetchFileArrayBuffer 是逐块读 resp.body.getReader()，桩要供得上这个契约
globalThis.fetch = async () => {
  if (fetchDelayMs) await new Promise((r) => setTimeout(r, fetchDelayMs));
  return {
  ok: true,
  status: 200,
  body: {
    getReader: () => {
      let sent = false;
      return {
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: PNG_BYTES };
        },
      };
    },
  },
  text: async () => '',
  json: async () => ({}),
  };
};

let previewArtifactFile;
let closePreview;
// 取文件的延迟：并发取证要让两轮真的交叠在一起，必须能在 await 处可控地停住
let fetchDelayMs = 0;

beforeAll(async () => {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    <div id="workspacePanelContainer">
      <div id="workspacePanel">
        <div id="workspacePreviewArea" style="display:none">
          <div id="workspacePreviewFilename"></div>
          <div id="workspacePreviewLineCount"></div>
          <button id="workspacePreviewCopyBtn"></button>
          <button id="workspacePreviewDownloadBtn"></button>
          <button id="workspacePreviewOpenBrowserBtn"></button>
          <button id="workspacePreviewFullscreenBtn"></button>
          <button id="workspacePreviewMdToggleBtn"></button>
          <button id="workspacePreviewEditBtn"></button>
          <button id="workspacePreviewSaveBtn"></button>
          <button id="workspacePreviewCancelBtn"></button>
          <div id="workspacePreviewExportMenu"></div>
          <div id="workspacePreviewContent"></div>
        </div>
      </div>
    </div>
  `;
  if (!URL.createObjectURL) {
    URL.createObjectURL = () => 'blob:probe';
    URL.revokeObjectURL = noop;
  }
  const mod = await import('../../src/side_panel/workspace-panel.js');
  previewArtifactFile = mod.previewArtifactFile;
  closePreview = mod.closePreview;
});

const previewTypes = ['mousemove', 'mouseup', 'resize'];
const previewListeners = () => windowListeners.filter((l) => previewTypes.includes(l.type));

describe('PERF-06：预览轮次之间 window 监听不累积', () => {
  test('单轮预览向 window 挂 3 个监听（mouse×2 + resize）', async () => {
    await previewArtifactFile('/ws/a.png', 'a.png');

    const round1 = previewListeners();
    expect(round1.length, `第一轮后 window 预览监听数=${round1.length}`).toBe(3);
    for (const t of previewTypes) {
      expect(round1.filter((l) => l.type === t).length).toBe(1);
    }
    // 关键：必须带 signal，否则下一轮无从作废
    for (const l of round1) {
      expect(l.options, `${l.type} 的注册没带 signal`).toBeTruthy();
      expect(l.options.signal, `${l.type} 的 signal 缺失`).toBeInstanceOf(AbortSignal);
    }
  });

  test('第二轮预览后第一轮的 signal 已作废（abort 收口生效）', async () => {
    const round1Signals = previewListeners().map((l) => l.options.signal);

    await previewArtifactFile('/ws/b.png', 'b.png');

    const round1StillLive = round1Signals.filter((s) => !s.aborted);
    expect(round1StillLive.length, `第一轮仍有${round1StillLive.length}个 signal 未作废`).toBe(0);

    const all = previewListeners();
    expect(all.length, `两轮累计注册数变了`).toBe(6);
    const live = all.filter((l) => !l.options.signal.aborted);
    expect(live.length, `存活监听不等于最后一轮的 3 个`).toBe(3);
  });

  test('作废后旧监听收不到事件，存活那轮照常工作（看调用次数）', async () => {
    const viewport = document.getElementById('imgViewport');
    const pan = document.getElementById('imgPan');
    expect(viewport && pan, '预览容器没渲染出来，本轮取证无效').toBeTruthy();

    const before = previewListeners().map((l) => l.calls);

    // 拖拽态由 viewport 上的 mousedown 拉开（handler 开头有 isDragging 守卫）
    viewport.dispatchEvent(new MouseEvent('mousedown', { button: 0, clientX: 10, clientY: 10 }));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 210, clientY: 160 }));
    // mouseup 监听挂在 window 上，jsdom 不会把元素事件冒泡到 window，得直接派发
    window.dispatchEvent(new MouseEvent('mouseup', { clientX: 210, clientY: 160 }));

    const after = previewListeners().map((l) => l.calls);
    const live = previewListeners().filter((l) => !l.options.signal.aborted);
    const dead = previewListeners().filter((l) => l.options.signal.aborted);

    // 旧轮次一个都没被调到
    for (let i = 0; i < before.length; i++) {
      const rec = previewListeners()[i];
      if (rec.options.signal.aborted) {
        expect(after[i], `第${i + 1}个（已作废）监听被调用了 ${after[i] - before[i]} 次`).toBe(before[i]);
      }
    }
    expect(dead.length).toBeGreaterThan(0);
    // 存活的 mousemove 被调到了，且确实干了活
    const liveMove = live.find((l) => l.type === 'mousemove');
    expect(liveMove.calls, '存活的 mousemove 没被调用').toBeGreaterThan(0);
    expect(pan.style.transform, '拖拽后毫无变化，取证无效').not.toBe('');
    const liveMouseup = live.find((l) => l.type === 'mouseup');
    expect(liveMouseup.calls, '存活的 mouseup 没被调用').toBeGreaterThan(0);
  });

  test('第三轮预览后存活监听仍是 3 个（每轮替换而非叠加）', async () => {
    await previewArtifactFile('/ws/c.png', 'c.png');

    const all = previewListeners();
    expect(all.length).toBe(9);
    expect(all.filter((l) => !l.options.signal.aborted).length).toBe(3);
  });

  // 并发才是这条改动的真正难点：previewFile 在 await 取文件时让出，若另一轮
  // 挤进来把模块级 controller 换掉，读模块变量的注册会把旧轮的监听挂到新轮上，
  // 旧轮闭包里的文档数据就得等第三轮才回收。
  test('两轮预览交叠时，每轮的监听绑的是自己那一轮的 signal', async () => {
    fetchDelayMs = 25;
    const before = previewListeners().length;

    const p1 = previewArtifactFile('/ws/race-a.png', 'race-a.png');
    const p2 = previewArtifactFile('/ws/race-b.png', 'race-b.png');
    await Promise.all([p1, p2]);
    fetchDelayMs = 0;

    const round = previewListeners().slice(before);
    const sigA = round.find((l) => l.type === 'mousemove')?.options.signal;
    const sigB = round.length > 3 ? round[3].options.signal : round[0].options.signal;

    // 交错次序不作取证前提：谁先注册取决于桩的唤醒顺序，两种次序都必须在
    // 「旧轮不工作」上收敛。生产侧的 signal?.aborted 早退让陈旧轮压根不注册，
    // 于是注册总数就是最小值。
    expect(round.length, `交叠两轮的注册总数为 ${round.length}，不应超过一轮的 3 个`).toBeLessThanOrEqual(3);
    expect(round.length).toBeGreaterThanOrEqual(3);

    // 新轮自己的 3 个必须齐全、绑同一个 signal、且未被作废
    const live = round.filter((l) => !l.options.signal.aborted);
    expect(live.length, `存活 ${live.length} 个，应为最后一轮的 3 个`).toBe(3);
    const liveSig = live[0].options.signal;
    for (const l of live) expect(l.options.signal, '存活监听没有同属一轮').toBe(liveSig);
    expect(new Set(live.map((l) => l.type)).size).toBe(3);

    // 任何挂在该 signal 上的注册都必须是新轮自己的（旧轮挂错即驻留）
    const onLiveSignal = round.filter((l) => l.options.signal === liveSig);
    expect(onLiveSignal.length, `同一个 signal 上挂了 ${onLiveSignal.length} 个，说明有旧轮串味`).toBe(3);

    // 行为面：派发 resize，已作废的那一档一个都不许被调到
    const callsBefore = round.map((l) => l.calls);
    window.dispatchEvent(new Event('resize'));
    const deadFired = round.filter((l, i2) => l.options.signal.aborted && l.calls > callsBefore[i2]);
    expect(deadFired.length, `已作废的旧轮监听被调用了 ${deadFired.length} 个`).toBe(0);
    const liveResize = round.find((l) => l.type === 'resize' && !l.options.signal.aborted);
    expect(liveResize.calls, '存活的 resize 没被调用，本轮取证无效').toBeGreaterThan(callsBefore[round.indexOf(liveResize)]);
    void sigA; void sigB;
  });

  test('关闭预览即作废本轮监听（不再活到下一次预览）', async () => {
    await previewArtifactFile('/ws/close.png', 'close.png');
    const mine = previewListeners().filter((l) => !l.options.signal.aborted);
    expect(mine.length, '本轮应恰好 3 个存活监听，本轮取证无效').toBe(3);

    await closePreview(true);

    for (const l of mine) {
      expect(l.options.signal.aborted, `${l.type} 在关闭预览后仍未作废`).toBe(true);
    }
    const callsBefore = mine.map((l) => l.calls);
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new MouseEvent('mousemove', { clientX: 5, clientY: 5 }));
    const fired = mine.filter((l, i) => l.calls > callsBefore[i]);
    expect(fired.length, `关闭预览后仍有 ${fired.length} 个监听在工作`).toBe(0);
  });
});
