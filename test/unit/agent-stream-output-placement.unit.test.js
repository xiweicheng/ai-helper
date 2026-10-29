// @vitest-environment jsdom
// 回归守卫：切换会话后命令执行结果必须仍留在工具卡片折叠区内。
//
// 背景：AGENT_STREAM 首个输出块创建时，旧代码用 `if (!outputDiv.isConnected)` 判断
// “是否成功放进工具卡片”，失败才退回 stream-content。但用户切换会话期间，流式消息
// 元素整体脱离文档（chatContainer.innerHTML 重建，元素由 _streamingElements 保活），
// 此时整棵子树 isConnected 恒为 false —— 即使已经放进 tool-call-body 也会被再次
// appendChild 搬到 stream-content，切回会话后就看到结果单独成块、不在折叠里。
//
// 覆盖两层：
//   1) 行为——直接调用 createAgentStreamOutput，在“脱离文档”的元素上断言输出落在
//      tool-call-body 内、stream-content 里没有游离副本；
//   2) 接线——源码守卫：chat-manager 不再用 isConnected 做挂载判定，改走该 helper。
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

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

const CHAT_MANAGER_SRC = readFileSync(
  path.resolve(process.cwd(), 'src/side_panel/chat-manager.js'),
  'utf8'
);

let createAgentStreamOutput;

beforeAll(async () => {
  ({ createAgentStreamOutput } = await import('../../src/side_panel/chat-streaming.js'));
});

/**
 * 构建“脱离文档”的流式消息元素：含 stream-content 与一个 agent_exec 工具卡片。
 * 刻意不 append 到 document，复刻切换会话期间 chatContainer 被重建后的状态。
 */
function buildDetachedStreamingEl(toolCallId) {
  const el = document.createElement('div');
  el.className = 'message-wrapper assistant streaming';
  el.innerHTML = `
    <div class="message-content">
      <div class="stream-content">
        <div class="tool-call-item" data-meta-type="exec" data-tool-call-id="${toolCallId}">
          <div class="tool-call-header"><span class="tool-call-name">agent_exec</span></div>
          <div class="tool-call-body"></div>
        </div>
      </div>
    </div>
  `;
  return el;
}

/** 判定 stream-content 是否被直接塞入游离的输出块（工具卡片内部的输出不算游离） */
function hasOrphanOutput(streamContent) {
  return Array.from(streamContent.children).some((el) => el.classList.contains('agent-stream-output'));
}

describe('切换会话期间命令输出仍挂在工具卡片内（脱离文档态）', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  test('元素脱离文档时，输出落在 tool-call-body 内且 stream-content 无游离副本', () => {
    const el = buildDetachedStreamingEl('call_1');
    expect(el.isConnected).toBe(false); // 复刻现场：整棵子树都不在文档里

    const card = el.querySelector('.tool-call-item[data-tool-call-id="call_1"]');
    const streamContent = el.querySelector('.stream-content');
    const outputDiv = createAgentStreamOutput(card, streamContent);

    expect(outputDiv.parentElement).toBe(card.querySelector('.tool-call-body'));
    expect(hasOrphanOutput(streamContent)).toBe(false);
    expect(el.querySelectorAll('.agent-stream-output')).toHaveLength(1);
  });

  test('元素在文档内时行为不变：输出同样落在 tool-call-body 内', () => {
    const el = buildDetachedStreamingEl('call_2');
    document.body.appendChild(el);

    const card = el.querySelector('.tool-call-item[data-tool-call-id="call_2"]');
    const streamContent = el.querySelector('.stream-content');
    const outputDiv = createAgentStreamOutput(card, streamContent);

    expect(outputDiv.parentElement).toBe(card.querySelector('.tool-call-body'));
    expect(hasOrphanOutput(streamContent)).toBe(false);
  });

  test('工具卡片缺失（回放消息先于 STREAM_TOOL_CALL 到达）时才退回 stream-content', () => {
    const el = buildDetachedStreamingEl('call_3');
    const streamContent = el.querySelector('.stream-content');

    const outputDiv = createAgentStreamOutput(null, streamContent);

    expect(outputDiv.parentElement).toBe(streamContent);
    expect(el.querySelector('.tool-call-item .agent-stream-output')).toBeNull();
  });

  test('工具卡片缺少 tool-call-body 时退化为挂到卡片自身', () => {
    const el = buildDetachedStreamingEl('call_4');
    const card = el.querySelector('.tool-call-item[data-tool-call-id="call_4"]');
    card.querySelector('.tool-call-body').remove();
    const streamContent = el.querySelector('.stream-content');

    const outputDiv = createAgentStreamOutput(card, streamContent);

    expect(outputDiv.parentElement).toBe(card);
    expect(hasOrphanOutput(streamContent)).toBe(false);
  });
});

describe('接线守卫：chat-manager 不再用 isConnected 判定输出挂载位置', () => {
  test('AGENT_STREAM 分支改走 createAgentStreamOutput', () => {
    expect(CHAT_MANAGER_SRC).toMatch(/createAgentStreamOutput\(/);
    expect(CHAT_MANAGER_SRC).toMatch(/from '\.\/chat-streaming\.js'/);
  });

  test('不再出现 !outputDiv.isConnected 的挂载判定（切换会话期间恒为 false）', () => {
    expect(CHAT_MANAGER_SRC).not.toMatch(/!outputDiv\.isConnected/);
  });
});
