// @vitest-environment jsdom
// 验证思考过程"成功/失败"筛选：思考结果块（thinking-badge + thinking-content）
// 对应 api_call 成功节点，需随筛选状态显示/隐藏，而非始终可见
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

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
};

let bindProcessHeaderClick;

beforeAll(async () => {
  ({ bindProcessHeaderClick } = await import('../../src/side_panel/chat-streaming.js'));
});

/** 构建思考过程 DOM：两轮思考（badge+content）+ 各一个工具卡片（一失败一成功） */
function buildProcessDom() {
  document.body.innerHTML = `
    <div class="thinking-process">
      <div class="thinking-process-header">
        <span class="thinking-process-stat"><span class="stat-label">总节点</span><span class="stat-value">4</span></span>
        <span class="thinking-process-stat success"><span class="stat-label">成功</span><span class="stat-value">3</span></span>
        <span class="thinking-process-stat failed"><span class="stat-label">失败</span><span class="stat-value">1</span></span>
      </div>
      <div class="thinking-process-body">
        <div class="thinking-process-content">
          <span class="thinking-badge">思考结果 1.7s</span>
          <div class="thinking-content">第一轮思考</div>
          <div class="tool-call-item" data-status="failed">失败工具</div>
          <span class="thinking-badge">思考结果 1.9s</span>
          <div class="thinking-content">第二轮思考</div>
          <div class="tool-call-item" data-status="success">成功工具</div>
        </div>
      </div>
    </div>
  `;
  const header = document.querySelector('.thinking-process-header');
  bindProcessHeaderClick(header);
  return document.querySelector('.thinking-process');
}

function clickStat(processEl, filter) {
  const stat = processEl.querySelector(`.thinking-process-stat[data-filter="${filter}"]`);
  stat.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

function visibility(processEl) {
  const q = (sel) => [...processEl.querySelectorAll(sel)].map(el => el.style.display !== 'none');
  return { badges: q('.thinking-badge'), contents: q('.thinking-content'), tools: q('.tool-call-item') };
}

describe('思考过程节点筛选', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('默认显示全部节点', () => {
    const processEl = buildProcessDom();
    expect(visibility(processEl)).toEqual({
      badges: [true, true],
      contents: [true, true],
      tools: [true, true],
    });
  });

  test('失败筛选：仅显示失败工具卡片，思考结果块被过滤', () => {
    const processEl = buildProcessDom();
    clickStat(processEl, 'failed');
    expect(visibility(processEl)).toEqual({
      badges: [false, false],
      contents: [false, false],
      tools: [true, false],
    });
  });

  test('成功筛选：显示思考结果块与成功工具卡片', () => {
    const processEl = buildProcessDom();
    clickStat(processEl, 'success');
    expect(visibility(processEl)).toEqual({
      badges: [true, true],
      contents: [true, true],
      tools: [false, true],
    });
  });

  test('再次点击已激活筛选项恢复显示全部', () => {
    const processEl = buildProcessDom();
    clickStat(processEl, 'failed');
    clickStat(processEl, 'failed');
    expect(visibility(processEl)).toEqual({
      badges: [true, true],
      contents: [true, true],
      tools: [true, true],
    });
  });
});
