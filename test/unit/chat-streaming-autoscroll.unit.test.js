// @vitest-environment jsdom
// 验证流式输出的"智能滚动到底部"在布局延后稳定时仍能滚到位：
// 每个数据块用 innerHTML 重渲染整段内容（含代码块/图片/思考指示器折叠），
// 其真实高度常在下一帧才最终确定。若只在单个 requestAnimationFrame 内按当时的
// scrollHeight 滚动，就会"差一点没到底"，导致最新内容被底部遮挡。
// autoScrollToBottom 必须补滚一帧，把延后增大的高度也滚到位。
import { describe, test, expect, beforeAll, beforeEach, afterEach } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
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

let autoScrollToBottom;
let scrollStreamingToBottom;

beforeAll(async () => {
  ({ autoScrollToBottom, scrollStreamingToBottom } = await import('../../src/side_panel/chat-streaming.js'));
});

// 用手动队列完全接管 rAF，令测试与 jsdom 的 rAF 实现/时序无关
let rafQueue;
const realRaf = globalThis.requestAnimationFrame;
beforeEach(() => {
  rafQueue = [];
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
});
afterEach(() => {
  globalThis.requestAnimationFrame = realRaf;
});
// 冲刷一帧：执行本帧入队的全部回调（回调内新入队的留到下一帧，模拟真实分帧）
function flushFrame() {
  const cbs = rafQueue.splice(0, rafQueue.length);
  cbs.forEach((cb) => cb());
}

// 构建一个可完全控制 scrollTop / scrollHeight / clientHeight 的滚动容器
function buildContainer() {
  document.body.innerHTML = '<div id="chatContainer"></div>';
  const cc = document.getElementById('chatContainer');
  let scrollTop = 0;
  let scrollHeight = 300; // 首帧时测得的高度（偏小，模拟尚未稳定）
  Object.defineProperty(cc, 'scrollTop', {
    configurable: true,
    get: () => scrollTop,
    set: (v) => { scrollTop = v; },
  });
  Object.defineProperty(cc, 'clientHeight', { configurable: true, value: 200 });
  Object.defineProperty(cc, 'scrollHeight', {
    configurable: true,
    get: () => scrollHeight,
    set: (v) => { scrollHeight = v; },
  });
  // scrollTo（smooth 分支用）在本用例里不需要真实行为
  cc.scrollTo = () => {};
  return { cc, grown: () => { scrollHeight = 1000; }, readScrollTop: () => scrollTop };
}

describe('autoScrollToBottom - 布局延后稳定时补滚到位', () => {
  test('scrollHeight 在下一帧才增大时，补滚后应滚到最终底部', () => {
    const { cc, grown, readScrollTop } = buildContainer();

    autoScrollToBottom(cc); // 非强制、非平滑（流式每块的默认调用形态）

    // 同步滚动：按当时偏小的 scrollHeight 滚动（300）——单帧滚动的结果，差一点没到底
    expect(readScrollTop()).toBe(300);

    // 关键：下一帧浏览器才把内容真正撑高（代码块/图片/指示器折叠完成）
    grown();
    // 修复的补滚帧在下一帧执行，应读到增大后的高度并滚到位
    flushFrame();

    // 断言补滚后滚到最终底部
    expect(readScrollTop()).toBe(1000);
  });
});

// 新一轮"思考中"指示器 / 预筛选卡片刚追加到流式消息底部，尚未产生 STREAM_CHUNK：
// scrollStreamingToBottom 必须按智能滚动立即补一次到底，否则新"思考中"下半部被遮挡。
describe('scrollStreamingToBottom - 底部新增内容后立即补滚到位', () => {
  test('元素已连接时，将容器滚到最新底部', () => {
    const { cc, grown, readScrollTop } = buildContainer();
    // 连接在文档中的流式消息元素
    const msg = document.createElement('div');
    msg.className = 'message-wrapper assistant streaming';
    cc.appendChild(msg);

    // 刚追加新指示器使内容撑高（此时尚未滚动）
    grown();
    expect(readScrollTop()).toBe(0);

    scrollStreamingToBottom(msg);
    flushFrame(); // autoScrollToBottom 内部的补滚帧

    expect(readScrollTop()).toBe(1000);
  });

  test('元素未连接（后台会话/脱落）时不滚动', () => {
    const { cc, grown, readScrollTop } = buildContainer();
    const detached = document.createElement('div'); // 未 appendChild，isConnected=false
    grown();
    scrollStreamingToBottom(detached);
    flushFrame();
    expect(readScrollTop()).toBe(0);
  });

  test('传入 null 不报错且不滚动', () => {
    const { grown, readScrollTop } = buildContainer();
    grown();
    expect(() => scrollStreamingToBottom(null)).not.toThrow();
    flushFrame();
    expect(readScrollTop()).toBe(0);
  });
});
