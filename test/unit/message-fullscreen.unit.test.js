// @vitest-environment jsdom
// AI 回答"全屏查看"（节点迁移方案）单元测试：
// - 打开：把真实消息节点移入覆盖层（事件监听随节点保留），原位留占位注释
// - 关闭：节点按占位标记回到原父容器原位置，清理占位与标志
// - 切换：再次打开另一条消息时，前一条先归位
// - 守卫：全屏期间 DOM 快照接口拒绝返回缓存 innerHTML（避免会话 DOM 缓存丢内容）
// - 快捷键：Alt+F 切换最后一条助手消息全屏；全屏中 Esc 关闭
import { describe, test, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';

// 头栏导出菜单点击会动态 import chat-export（真实模块会拉入 docx 等重依赖），
// 这里整体 mock，断言“按当前全屏消息调用对应导出函数”即可
vi.mock('../../src/side_panel/chat-export.js', () => ({
  exportAssistantMessageToDocx: vi.fn(),
  exportAssistantMessageToPdf: vi.fn(),
  exportAssistantMessageToMarkdown: vi.fn(),
  exportAssistantMessageToImage: vi.fn(),
}));

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
};

let mod;

beforeAll(async () => {
  mod = await import('../../src/side_panel/message-fullscreen.js');
  mod.initMessageFullscreen();
});

function buildPanel() {
  document.body.innerHTML = `
    <div class="chat-container" id="chatContainer">
      <div class="message user" data-message-id="u1"><div class="message-content">问</div></div>
      <div class="message assistant" id="msgA" data-message-id="a1">
        <div class="message-content">
          <div class="thinking-process"><div class="thinking-content">过程内容</div></div>
          <div class="final-answer"><div class="markdown-body">回答A</div></div>
        </div>
        <div class="message-footer"><button class="legacy-copy-btn">复制</button></div>
      </div>
      <div class="message assistant" id="msgB" data-message-id="a2">
        <div class="message-content"><div class="final-answer"><div class="markdown-body">回答B</div></div></div>
      </div>
    </div>
    <div id="messageFullscreenOverlay" class="message-fullscreen-overlay" style="display:none">
      <div class="message-fullscreen-header">
        <span id="messageFullscreenTitle">全屏阅读</span>
        <button id="messageFullscreenCopyBtn"></button>
        <button id="messageFullscreenCloseBtn"></button>
      </div>
      <div class="message-fullscreen-body" id="messageFullscreenBody"></div>
      <div class="message-fullscreen-rail" id="messageFullscreenRail"></div>
    </div>`;
}

beforeEach(() => {
  buildPanel();
  // 每条用例结束后确保退出全屏，避免节点状态泄漏到下一个用例
  if (mod.isFullscreenActive()) mod.closeMessageFullscreen();
});

afterEach(() => {
  if (mod.isFullscreenActive()) mod.closeMessageFullscreen();
});

describe('openMessageFullscreen - 节点迁移', () => {
  test('打开后消息节点被移入覆盖层 body 而非克隆副本', () => {
    const msgA = document.getElementById('msgA');
    const body = document.getElementById('messageFullscreenBody');
    mod.openMessageFullscreen(msgA);
    expect(body.contains(msgA)).toBe(true);
    // 原容器内不应再存在该节点（true 迁移，非克隆）
    expect(document.getElementById('chatContainer').contains(msgA)).toBe(false);
    // 同一节点引用（非克隆）
    expect(document.getElementById('msgA')).toBe(msgA);
  });

  test('打开后节点上的既有事件监听器仍然生效（监听随节点保留）', () => {
    const msgA = document.getElementById('msgA');
    const btn = msgA.querySelector('.legacy-copy-btn');
    let clicks = 0;
    btn.addEventListener('click', () => { clicks++; });
    mod.openMessageFullscreen(msgA);
    // 在覆盖层内点击原按钮，监听应仍触发
    msgA.querySelector('.legacy-copy-btn').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(clicks).toBe(1);
  });

  test('原位留下占位注释并带全屏标志与激活状态', () => {
    const msgA = document.getElementById('msgA');
    const container = document.getElementById('chatContainer');
    mod.openMessageFullscreen(msgA);
    expect(msgA.dataset.fullscreen).toBe('1');
    expect(mod.isFullscreenActive()).toBe(true);
    // 原位置存在至少一个占位注释节点（DOM 顺序锚点）
    const comments = [...container.childNodes].filter(n => n.nodeType === 8);
    expect(comments.length).toBeGreaterThan(0);
  });

  test('覆盖层显示且标记 viewing 类供 CSS 隐藏周边区域', () => {
    const msgA = document.getElementById('msgA');
    mod.openMessageFullscreen(msgA);
    const overlay = document.getElementById('messageFullscreenOverlay');
    expect(overlay.style.display).not.toBe('none');
    expect(document.body.classList.contains('message-fullscreen-viewing')).toBe(true);
  });
});

describe('closeMessageFullscreen - 归位还原', () => {
  test('关闭后节点回到原父容器的原位置，占位清除，状态复位', () => {
    const container = document.getElementById('chatContainer');
    const msgA = document.getElementById('msgA');
    const orderBefore = [...container.children].map(el => el.id || el.className).join(',');
    mod.openMessageFullscreen(msgA);
    mod.closeMessageFullscreen();
    expect(container.contains(msgA)).toBe(true);
    const orderAfter = [...container.children].map(el => el.id || el.className).join(',');
    expect(orderAfter).toBe(orderBefore);
    expect(msgA.hasAttribute('data-fullscreen')).toBe(false);
    expect(mod.isFullscreenActive()).toBe(false);
    expect(document.getElementById('messageFullscreenBody').children.length).toBe(0);
    expect(document.body.classList.contains('message-fullscreen-viewing')).toBe(false);
  });

  test('未处于全屏时 close 为安全空操作', () => {
    expect(() => mod.closeMessageFullscreen()).not.toThrow();
    expect(mod.isFullscreenActive()).toBe(false);
  });
});

describe('toggle / 多消息切换', () => {
  test('对同一条消息 toggle 两次等价打开后关闭', () => {
    const msgA = document.getElementById('msgA');
    mod.toggleMessageFullscreen(msgA);
    expect(mod.isFullscreenActive()).toBe(true);
    mod.toggleMessageFullscreen(msgA);
    expect(mod.isFullscreenActive()).toBe(false);
  });

  test('全屏中切换另一条消息：前一条归位，新的一条进入覆盖层', () => {
    const container = document.getElementById('chatContainer');
    const msgA = document.getElementById('msgA');
    const msgB = document.getElementById('msgB');
    mod.openMessageFullscreen(msgA);
    mod.openMessageFullscreen(msgB);
    expect(container.contains(msgA)).toBe(true);
    expect(document.getElementById('messageFullscreenBody').contains(msgB)).toBe(true);
    mod.closeMessageFullscreen();
    expect(container.contains(msgB)).toBe(true);
  });
});

describe('DOM 快照守卫（会话缓存并发风险）', () => {
  test('非全屏时返回 innerHTML，全屏期间返回 null', () => {
    const container = document.getElementById('chatContainer');
    expect(mod.getSessionDOMSnapshot(container)).toBe(container.innerHTML);
    mod.openMessageFullscreen(document.getElementById('msgA'));
    expect(mod.getSessionDOMSnapshot(container)).toBeNull();
    mod.closeMessageFullscreen();
    expect(mod.getSessionDOMSnapshot(container)).toBe(container.innerHTML);
  });
});

describe('getLastAssistantMessage 与快捷键', () => {
  test('取最后一条助手消息（跳过用户消息）', () => {
    expect(mod.getLastAssistantMessage()?.id).toBe('msgB');
  });

  test('Alt+F 打开最后一条助手消息全屏，再按退出归位', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', altKey: true, bubbles: true }));
    expect(mod.isFullscreenActive()).toBe(true);
    expect(document.getElementById('messageFullscreenBody').contains(document.getElementById('msgB'))).toBe(true);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', code: 'KeyF', altKey: true, bubbles: true }));
    expect(mod.isFullscreenActive()).toBe(false);
    expect(document.getElementById('chatContainer').contains(document.getElementById('msgB'))).toBe(true);
  });

  test('全屏中 Esc 关闭并归位，且阻断传播避免误消费其他 Esc 逻辑', () => {
    const msgA = document.getElementById('msgA');
    mod.openMessageFullscreen(msgA);
    let downstreamEscHandlerRan = false;
    const downstream = () => { downstreamEscHandlerRan = true; };
    document.addEventListener('keydown', downstream);
    const escEvent = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    document.dispatchEvent(escEvent);
    document.removeEventListener('keydown', downstream);
    expect(mod.isFullscreenActive()).toBe(false);
    expect(document.getElementById('chatContainer').contains(msgA)).toBe(true);
    // 捕获阶段 stopPropagation 后，冒泡阶段的其他 document 监听不应收到
    expect(downstreamEscHandlerRan).toBe(false);
  });

  test('非全屏时 Esc 不做任何事（不干扰其他 Esc 消费者）', () => {
    let consumed = false;
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(mod.isFullscreenActive()).toBe(false);
    expect(consumed).toBe(false);
  });
});

describe('createFullscreenButton footer 按钮', () => {
  test('与 copy-btn 同风格：含图标 + 文字标签，title 无占位符残留', async () => {
    const { t } = await import('../../src/shared/i18n.js');
    const btn = mod.createFullscreenButton();
    expect(btn.className).toContain('fullscreen-btn');
    expect(btn.querySelector('svg')).not.toBeNull();
    // 必须是图标+文字（与 复制/引用/导出 一致），不能是纯图标
    const label = btn.querySelector('span');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe(t('msgFullscreen.btnLabel'));
    expect(label.textContent.length).toBeGreaterThan(0);
    expect(btn.title).toBe(t('msgFullscreen.btnTitle'));
    expect(btn.title).not.toMatch(/\{[a-zA-Z]+\}/);
  });
});

describe('头栏导出菜单', () => {
  async function resetMocks() {
    const m = await import('../../src/side_panel/chat-export.js');
    Object.values(m).forEach((fn) => typeof fn === 'function' && fn.mockClear && fn.mockClear());
    return m;
  }

  test('打开全屏后头栏出现导出入口：图标+文字触发器 + 4 个格式项（与复制同区）', async () => {
    const { t } = await import('../../src/shared/i18n.js');
    await resetMocks();
    mod.openMessageFullscreen(document.getElementById('msgA'));
    const trigger = document.getElementById('messageFullscreenExportBtn');
    expect(trigger).not.toBeNull();
    expect(trigger.querySelector('svg')).not.toBeNull();
    const label = trigger.querySelector('span');
    expect(label).not.toBeNull();
    expect(label.textContent).toBe(t('msgFullscreen.export'));
    expect(label.textContent).not.toMatch(/\{[a-zA-Z]+\}/);
    // 触发器位于退出按钮之前（复制 -> 导出 -> 退出）
    const closeBtn = document.getElementById('messageFullscreenCloseBtn');
    expect(trigger.compareDocumentPosition(closeBtn) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const items = document.querySelectorAll('#messageFullscreenExportDropdown .export-dropdown-item');
    expect(items.length).toBe(4);
  });

  test('重复打开不叠加：导出菜单仅一份', () => {
    mod.openMessageFullscreen(document.getElementById('msgA'));
    mod.closeMessageFullscreen();
    mod.openMessageFullscreen(document.getElementById('msgB'));
    expect(document.querySelectorAll('#messageFullscreenExportBtn').length).toBe(1);
  });

  test('点击导出项按当前全屏消息调用对应导出函数', async () => {
    const m = await resetMocks();
    const msgA = document.getElementById('msgA');
    mod.openMessageFullscreen(msgA);
    const docxItem = document.querySelector('#messageFullscreenExportDropdown .export-docx-item');
    docxItem.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    // 导出项处理器内 await import(...) 需跨多个微任务，用宏任务 flush 等待完成
    await new Promise((r) => setTimeout(r, 0));
    expect(m.exportAssistantMessageToDocx).toHaveBeenCalledTimes(1);
    expect(m.exportAssistantMessageToDocx.mock.calls[0][0]).toBe(msgA);
  });

  test('点击导出触发器切换下拉显隐', () => {
    mod.openMessageFullscreen(document.getElementById('msgA'));
    const trigger = document.getElementById('messageFullscreenExportBtn');
    const dropdown = document.getElementById('messageFullscreenExportDropdown');
    expect(dropdown.classList.contains('show')).toBe(false);
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dropdown.classList.contains('show')).toBe(true);
    trigger.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(dropdown.classList.contains('show')).toBe(false);
  });
});

describe('主列表滚动位置保持（节点迁移副作用）', () => {
  function stubScrollTop(el, initial) {
    let v = initial;
    Object.defineProperty(el, 'scrollTop', {
      configurable: true,
      get: () => v,
      set: (x) => { v = x; },
    });
    return () => v;
  }

  test('退出全屏后主列表 scrollTop 还原到进入前的位置', () => {
    const container = document.getElementById('chatContainer');
    const read = stubScrollTop(container, 350);
    mod.openMessageFullscreen(document.getElementById('msgA'));
    // 模拟节点移出后浏览器把 scrollTop 夹紧/归零
    container.scrollTop = 0;
    expect(read()).toBe(0);
    mod.closeMessageFullscreen();
    expect(read()).toBe(350);
  });

  test('全屏中切换消息不提前重置，最终退出才还原到最初位置', () => {
    const container = document.getElementById('chatContainer');
    const read = stubScrollTop(container, 420);
    mod.openMessageFullscreen(document.getElementById('msgA'));
    container.scrollTop = 0;
    mod.openMessageFullscreen(document.getElementById('msgB'));
    container.scrollTop = 0;
    mod.closeMessageFullscreen();
    expect(read()).toBe(420);
  });
});

describe('全屏内目录导航清理', () => {
  test('退出全屏时移除 rail 内残留的目录容器', () => {
    const rail = document.getElementById('messageFullscreenRail');
    mod.openMessageFullscreen(document.getElementById('msgA'));
    // 模拟 hover 生成的目录挂入覆盖层内 rail
    const fake = document.createElement('div');
    fake.className = 'message-toc-container';
    rail.appendChild(fake);
    expect(rail.querySelector('.message-toc-container')).toBeTruthy();
    mod.closeMessageFullscreen();
    expect(rail.querySelector('.message-toc-container')).toBe(null);
  });
});

describe('i18n 集成', () => {
  test('头栏标题与按钮 title 使用真实翻译且无占位符残留', async () => {
    const { t } = await import('../../src/shared/i18n.js');
    mod.openMessageFullscreen(document.getElementById('msgA'));
    const title = document.getElementById('messageFullscreenTitle').textContent;
    const copyTitle = document.getElementById('messageFullscreenCopyBtn').title;
    expect(title).toBe(t('msgFullscreen.title'));
    expect(title).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(copyTitle).not.toMatch(/\{[a-zA-Z]+\}/);
    expect(copyTitle.length).toBeGreaterThan(0);
  });
});
