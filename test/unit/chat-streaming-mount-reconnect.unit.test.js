// @vitest-environment jsdom
// 流式气泡「重挂/挂载」不能破坏就地续写，也不能吃掉活动态。
//
// 真机反馈：关掉面板再打开，之前已经输出的正文在界面上重复了 4~6 遍。
// 根因在重挂这一步：它把可见的「思考中」指示器收成「思考结果」badge，却把 badge
// 插在了指示器的父元素（.message-content）里 —— 而 updateStreamingMessage 只在
// .stream-content 内部找 badge。两条查找（可见指示器 / 最后一个 badge）全落空，
// 于是之后每条增量都 append 一整份全量正文，同一段话就被渲染了很多遍。
//
// 覆盖两个形状：第一轮（指示器挂在 .message-content）与第二轮
// （appendThinkingIndicator 把指示器建在 .stream-content 内部），落位分支不同。
import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

/** chrome.storage.session 的内存替身：快照按 sessionId 落在这里 */
const sessionStore = {};

/** 发往后台的消息记账：断言「点了停止真的发出了取消」 */
const sentMessages = [];

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
    session: {
      set: async (obj) => { Object.assign(sessionStore, obj); },
      get: async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        const out = {};
        for (const k of list) if (sessionStore[k] !== undefined) out[k] = sessionStore[k];
        return out;
      },
      remove: async (keys) => {
        const list = Array.isArray(keys) ? keys : [keys];
        for (const k of list) delete sessionStore[k];
      },
    },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (m) => { sentMessages.push(m); return Promise.resolve({}); },
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

let addStreamingMessage;
let updateStreamingMessage;
let reconnectStreamingElement;
let createStreamingElementAccessor;
let setStreamedContent;
let mountStreamingElement;
let deleteStreamingState;
let applyStreamSnapshot;
let snap;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/chat-streaming.js');
  addStreamingMessage = mod.addStreamingMessage;
  updateStreamingMessage = mod.updateStreamingMessage;
  reconnectStreamingElement = mod.reconnectStreamingElement;
  createStreamingElementAccessor = mod.createStreamingElementAccessor;
  setStreamedContent = mod.setStreamedContent;
  mountStreamingElement = mod.mountStreamingElement;
  deleteStreamingState = mod.deleteStreamingState;
  applyStreamSnapshot = mod.applyStreamSnapshot;
  snap = await import('../../src/side_panel/stream-snapshot.js');
});

/** 第二轮形状：指示器由 appendThinkingIndicator 建在 .stream-content 内部 */
function buildRoundTwoEl() {
  const el = document.createElement('div');
  el.className = 'message-wrapper assistant streaming';
  el.dataset.messageId = 'msg_reconnect_r2';
  el.innerHTML = `
    <div class="message-content">
      <div class="stream-content">
        <span class="thinking-badge">思考结果</span>
        <div class="thinking-content"><div>已经输出的前半段</div></div>
        <div class="thinking-indicator"><span class="thinking-label">输出中...</span></div>
      </div>
      <div class="stream-status hidden"></div>
    </div>
  `;
  return el;
}

describe('流式记账收摊时把气泡快照一起清掉', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="chatContainer"></div>';
    snap.__resetStreamSnapshotForTest();
    for (const k of Object.keys(sessionStore)) delete sessionStore[k];
  });

  test('deleteStreamingState 之后读不回快照（错误收尾也不留半截流给下一次接管）', async () => {
    // 正常错误路径只删气泡、不调 finalize（chat-manager 的 API_ERROR 分支），
    // 快照靠 finalize 清就会留到 TTL 到期：既白占 storage.session，
    // 也把「已经作废的这一轮」留在可被读回的位置上。
    const el = addStreamingMessage();
    el.dataset.sessionId = 's9';
    el.dataset.callId = 'call_s9';
    createStreamingElementAccessor('s9')(el);
    setStreamedContent('s9', '出错前已经输出的半截');
    updateStreamingMessage(el, '出错前已经输出的半截');
    await snap.flushStreamSnapshot('s9');
    expect(await snap.readStreamSnapshot('s9')).toBeTruthy();

    deleteStreamingState('s9');

    expect(await snap.readStreamSnapshot('s9')).toBe(null);
  });

  // 抓拍不能挂在「DOM 更新」上：用户切到别的会话时气泡脱离文档，
  // chat-manager 会跳过 updateStreamingMessage（只往 Map 里攒正文），
  // 于是「切走 → 再关掉面板」这一整条路径一个快照都没有，重开时无从还原。
  //
  // 必须跨过一整个节流窗口：上一窗口里攒着的 read 是闭包，脱文档后就算不重新排快照，
  // 它也能在窗口末尾读到新正文 —— 只盯「读回来的文字」会误以为修法生效。
  test('气泡脱文档后仍能持续进快照（正文路径会自己排下一次抓拍）', async () => {
    vi.useFakeTimers();
    try {
      const el = addStreamingMessage();
      el.dataset.sessionId = 's8';
      el.dataset.callId = 'call_s8';
      createStreamingElementAccessor('s8')(el);
      setStreamedContent('s8', '切走之前已经输出的一段');
      updateStreamingMessage(el, '切走之前已经输出的一段');
      // 把第一个窗口落盘，之后不得再有任何 DOM 更新
      await vi.advanceTimersByTimeAsync(snap.FLUSH_MS);
      expect(await snap.readStreamSnapshot('s8')).toBeTruthy();

      // 用户切到别的会话：气泡从 DOM 摘掉，此后只有正文在涨
      el.remove();
      setStreamedContent('s8', '切走之前已经输出的一段，切走期间又输出了一段');
      await vi.advanceTimersByTimeAsync(snap.FLUSH_MS);

      const read = await snap.readStreamSnapshot('s8');
      expect(read.accumulated).toContain('切走期间又输出了一段');
    } finally {
      vi.useRealTimers();
    }
  });

  // 新一轮起步 / 接管起步都会先把记账清零，让它落盘就是把待读的快照顶成空的。
  test('空正文不排快照（新一轮清零不能顶掉上一轮留下的快照）', async () => {
    const el = addStreamingMessage();
    el.dataset.sessionId = 's7';
    el.dataset.callId = 'call_s7';
    createStreamingElementAccessor('s7')(el);
    setStreamedContent('s7', '还在输出的半截');
    await snap.flushStreamSnapshot('s7');

    setStreamedContent('s7', '');
    await snap.flushStreamSnapshot('s7');

    expect((await snap.readStreamSnapshot('s7')).accumulated).toBe('还在输出的半截');
  });
});

describe('接管路径的挂载（mountStreamingElement）只挪位置', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="chatContainer"></div>';
  });

  test('登记过的气泡挂回会话区末尾，正文与可见指示器一个都不动', () => {
    const el = addStreamingMessage();
    createStreamingElementAccessor('m1')(el);
    setStreamedContent('m1', '正在输出的正文');
    updateStreamingMessage(el, '正在输出的正文');
    el.remove();

    expect(mountStreamingElement('m1')).toBe(true);

    expect(el.parentElement?.id).toBe('chatContainer');
    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBeTruthy();
    expect(el.querySelectorAll('.stream-content .thinking-badge').length).toBe(0);
    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(1);
    expect(el.textContent).toContain('正在输出的正文');
  });

  test('元素属于别的会话 → 不挂进当前会话区（不能把别人的流式气泡塞进来）', () => {
    const container = document.getElementById('chatContainer');
    const el = document.createElement('div');
    el.className = 'message-wrapper assistant streaming';
    el.dataset.sessionId = 'other-session';
    createStreamingElementAccessor('m2')(el);

    expect(mountStreamingElement('m2')).toBe(false);
    expect(container.children.length).toBe(0);
  });

  test('没有登记元素 / 容器不在 → 安静返回 false，不抛错', () => {
    expect(mountStreamingElement('never-attached')).toBe(false);
    const el = addStreamingMessage();
    createStreamingElementAccessor('m3')(el);
    document.body.innerHTML = '';
    expect(mountStreamingElement('m3')).toBe(false);
  });
});

describe('重挂流式气泡后必须继续就地更新同一份正文', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="chatContainer"></div>';
  });

  test('第一轮（指示器在 message-content）：badge 落在 .stream-content 里，续写不另起正文块', () => {
    const el = addStreamingMessage();
    createStreamingElementAccessor('s1')(el);
    setStreamedContent('s1', '前半段');
    updateStreamingMessage(el, '前半段');
    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(1);

    // 用户切走再切回：元素脱离文档后重挂
    el.remove();
    reconnectStreamingElement('s1');
    expect(el.parentElement?.id).toBe('chatContainer');
    expect(el.querySelector('.stream-content .thinking-badge')).toBeTruthy();

    updateStreamingMessage(el, '前半段，后半段');
    updateStreamingMessage(el, '前半段，后半段，再一段');

    const blocks = el.querySelectorAll('.stream-content .thinking-content');
    expect(blocks.length).toBe(1);
    expect(blocks[0].textContent).toContain('前半段，后半段，再一段');
  });

  test('第二轮（指示器在 stream-content）：badge 插在本轮正文上面，续写仍然只有一份', () => {
    const el = buildRoundTwoEl();
    document.getElementById('chatContainer').appendChild(el);
    createStreamingElementAccessor('s2')(el);
    setStreamedContent('s2', '已经输出的前半段');

    el.remove();
    reconnectStreamingElement('s2');

    const contents = el.querySelectorAll('.stream-content .thinking-content');
    expect(contents.length).toBe(1);
    const badge = el.querySelector('.stream-content .thinking-badge:last-of-type');
    expect(badge.nextElementSibling?.className).toBe('thinking-content');

    updateStreamingMessage(el, '已经输出的前半段，续写A');
    updateStreamingMessage(el, '已经输出的前半段，续写A，续写B');

    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(1);
    expect(el.querySelector('.stream-content .thinking-content').textContent)
      .toContain('已经输出的前半段，续写A，续写B');
  });

  test('重挂不会把正文再补一遍（accumulated 命中同一条更新路径）', () => {
    const el = addStreamingMessage();
    createStreamingElementAccessor('s3')(el);
    setStreamedContent('s3', '只有一份的正文');

    reconnectStreamingElement('s3');

    expect(el.querySelectorAll('.stream-content .thinking-content').length).toBe(1);
    expect(el.textContent.replace(/\s+/g, '')).toContain('只有一份的正文');
  });

  test('.stream-content 缺失时也要把可见指示器收掉（登记 API 允许挂任意元素）', () => {
    const el = document.createElement('div');
    el.className = 'message-wrapper assistant streaming';
    el.innerHTML = `
      <div class="message-content">
        <div class="thinking-indicator"><span class="thinking-label">输出中...</span></div>
      </div>
    `;
    document.getElementById('chatContainer').appendChild(el);
    createStreamingElementAccessor('s4')(el);
    setStreamedContent('s4', '脱落期已经输出的一段');

    el.remove();
    reconnectStreamingElement('s4');

    expect(el.querySelector('.thinking-indicator:not(.hidden)')).toBe(null);
  });
});

describe('快照还原后的停止按钮必须点得动', () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="chatContainer"></div>';
    sentMessages.length = 0;
  });

  // 多轮 ReAct 的快照里，上一轮收口的指示器只是加了 .hidden（display:none），
  // 节点本身还在 .stream-content 里，所以气泡里同时存在两颗停止按钮，而 DOM 顺序
  // 第一颗属于看不见的那轮。用户能点的只有可见那颗。
  test('还原后点「输出中」那颗停止按钮，要真的发出 CANCEL_REACT', () => {
    const el = addStreamingMessage();
    const snapshotHtml = `
      <div class="message-content">
        <div class="stream-content">
          <div class="thinking-indicator hidden"><span class="thinking-label">思考中...</span><button class="streaming-stop-btn"></button></div>
          <span class="thinking-badge">思考结果</span>
          <div class="thinking-content">脱落期已经输出的一段</div>
          <div class="thinking-indicator"><span class="thinking-label">输出中...</span><button class="streaming-stop-btn"></button></div>
        </div>
        <div class="stream-status hidden"></div>
      </div>
    `;

    expect(applyStreamSnapshot(el, snapshotHtml)).toBe(true);
    expect(el.querySelectorAll('.streaming-stop-btn').length).toBe(2);

    let stopRequests = 0;
    document.addEventListener('task-stop-requested', () => { stopRequests += 1; });

    const visibleBtn = el.querySelector('.thinking-indicator:not(.hidden) .streaming-stop-btn');
    expect(visibleBtn).toBeTruthy();
    visibleBtn.click();

    expect(stopRequests).toBe(1);
    expect(sentMessages.some((m) => m?.type === 'CANCEL_REACT')).toBe(true);
  });
});
