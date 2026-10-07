// @vitest-environment jsdom
// task-notifier 单元测试：桌面通知中心的开关、可见性抑制、防重复 id、消失策略、
// 显示名/截断、onClicked 解析与 clearInteractionNotification
//
// 多实例防重复设计（被测契约）：通知创建权收敛在 background SW（本模块是唯一创建点），
// 侧边栏实例只上报；同会话通知 id 固定，重复创建会被 Chrome 覆盖而非叠加。
import { describe, test, expect, beforeEach, vi } from 'vitest';

// ============ Mock chrome 环境 ============

let storageData = {};
let sessionTitle = '测试会话标题';

const createMock = vi.fn();
const clearMock = vi.fn();
let onClickedListeners = [];

// getSession 是显示名的来源之一（notifier → ../storage/db.js）；mock 掉避免依赖 IndexedDB
vi.mock('../../src/storage/db.js', () => ({
  getSession: vi.fn(async (id) => ({ id, title: sessionTitle })),
}));

globalThis.chrome = {
  storage: {
    local: {
      get: (key, cb) => {
        const k = Array.isArray(key) ? key[0] : key;
        const result = k in storageData ? { [k]: storageData[k] } : {};
        if (typeof cb === 'function') cb(result);
        return Promise.resolve(result);
      },
      set: (obj, cb) => {
        Object.assign(storageData, obj);
        if (typeof cb === 'function') cb();
        return Promise.resolve();
      },
    },
    onChanged: { addListener: () => {} },
  },
  runtime: { lastError: null, getURL: (p) => p },
  notifications: {
    create: createMock,
    clear: clearMock,
    onClicked: { addListener: (fn) => onClickedListeners.push(fn) },
  },
};

// ============ 动态导入被测模块 ============

let notifier;
beforeEach(async () => {
  storageData = {};
  sessionTitle = '测试会话标题';
  createMock.mockReset();
  clearMock.mockReset();
  onClickedListeners = [];
  vi.resetModules();
  notifier = await import('../../src/background/notifier.js');
});

// ============ 开关：聊天反馈 / 定时任务走独立开关 ============

describe('notifyTaskFeedback 开关', () => {
  test('未设置（undefined）默认开启：创建通知', async () => {
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1', name: '任务A' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test('completionNotificationEnabled=false：聊天通知不创建', async () => {
    storageData = { completionNotificationEnabled: false };
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1' });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('scheduled 走独立开关：scheduledNotificationEnabled=false 不创建', async () => {
    storageData = { scheduledNotificationEnabled: false };
    await notifier.notifyTaskFeedback({ success: false, sessionId: 's1', error: 'x', source: 'scheduled' });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('scheduled 不受 completionNotificationEnabled=false 影响', async () => {
    storageData = { completionNotificationEnabled: false };
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1', source: 'scheduled' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test('interactionNotificationEnabled=false：交互提醒不创建', async () => {
    storageData = { interactionNotificationEnabled: false };
    await notifier.notifyInteractionRequired({ kind: 'confirm', sessionId: 's1', detail: 'x' });
    expect(createMock).not.toHaveBeenCalled();
  });
});

// ============ 可见性抑制（按发起实例判定） ============

describe('可见性抑制', () => {
  test('未 init：默认不可见 → chat 通知创建', async () => {
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test('init 后 isPanelVisible=true：chat 通知被抑制（用户看得到面板）', async () => {
    notifier.initNotifier({ isPanelVisible: () => true, revealPanel: () => {} });
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1' });
    expect(createMock).not.toHaveBeenCalled();
  });

  test('init 后 isPanelVisible=false：chat 通知创建', async () => {
    notifier.initNotifier({ isPanelVisible: () => false, revealPanel: () => {} });
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test('scheduled 不做可见性抑制：isPanelVisible=true 也创建', async () => {
    notifier.initNotifier({ isPanelVisible: () => true, revealPanel: () => {} });
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1', source: 'scheduled' });
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  test('交互提醒同理：isPanelVisible=false 创建 / true 抑制', async () => {
    notifier.initNotifier({ isPanelVisible: () => false, revealPanel: () => {} });
    await notifier.notifyInteractionRequired({ kind: 'confirm', sessionId: 's1', detail: 'manage_tab' });
    expect(createMock).toHaveBeenCalledTimes(1);

    createMock.mockClear();
    notifier.initNotifier({ isPanelVisible: () => true });
    await notifier.notifyInteractionRequired({ kind: 'clarify', sessionId: 's1', detail: 'q' });
    expect(createMock).not.toHaveBeenCalled();
  });
});

// ============ 通知 id：固定 + 覆盖非叠加 ============

describe('通知 id 与防重复', () => {
  test('同 sessionId 两次上报：通知 id 相同（Chrome 覆盖而非叠加）', async () => {
    await notifier.notifyTaskFeedback({ success: true, sessionId: 'sess-A' });
    await notifier.notifyTaskFeedback({ success: true, sessionId: 'sess-A' });
    expect(createMock).toHaveBeenCalledTimes(2);
    const id1 = createMock.mock.calls[0][0];
    const id2 = createMock.mock.calls[1][0];
    expect(id1).toBe(id2);
    expect(id1).toBe('aih|feedback|ok|sess-A');
  });

  test('成功/失败 id 区分；无 sessionId 用 global', async () => {
    await notifier.notifyTaskFeedback({ success: true });
    await notifier.notifyTaskFeedback({ success: false });
    expect(createMock.mock.calls[0][0]).toBe('aih|feedback|ok|global');
    expect(createMock.mock.calls[1][0]).toBe('aih|feedback|fail|global');
  });

  test('交互提醒 id：confirm / clarify 区分', async () => {
    await notifier.notifyInteractionRequired({ kind: 'confirm', sessionId: 's2' });
    await notifier.notifyInteractionRequired({ kind: 'clarify', sessionId: 's2' });
    expect(createMock.mock.calls[0][0]).toBe('aih|interaction|confirm|s2');
    expect(createMock.mock.calls[1][0]).toBe('aih|interaction|clarify|s2');
  });
});

// ============ 消失策略与选项 ============

describe('消失策略与通知选项', () => {
  test('成功：requireInteraction=false（系统自动收起）+ silent=true', async () => {
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1' });
    const options = createMock.mock.calls[0][1];
    expect(options.requireInteraction).toBe(false);
    expect(options.silent).toBe(true);
    expect(options.iconUrl).toBe('icons/icon128.png');
    expect(options.type).toBe('basic');
  });

  test('失败：requireInteraction=true（停留至手动关闭）+ silent=true', async () => {
    await notifier.notifyTaskFeedback({ success: false, sessionId: 's1', error: 'boom' });
    const options = createMock.mock.calls[0][1];
    expect(options.requireInteraction).toBe(true);
    expect(options.silent).toBe(true);
  });

  test('交互提醒：requireInteraction=true（保留系统默认提示音）', async () => {
    await notifier.notifyInteractionRequired({ kind: 'confirm', sessionId: 's1', detail: 'manage_tab' });
    const options = createMock.mock.calls[0][1];
    expect(options.requireInteraction).toBe(true);
    expect(options.silent).toBeUndefined();
  });
});

// ============ 显示名与截断 ============

describe('显示名与截断', () => {
  test('name 优先于会话标题', async () => {
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1', name: '自定义名' });
    expect(createMock.mock.calls[0][1].message).toContain('自定义名');
    expect(createMock.mock.calls[0][1].message).not.toContain(sessionTitle);
  });

  test('无 name 回退会话标题；无 sessionId 用默认名', async () => {
    await notifier.notifyTaskFeedback({ success: true, sessionId: 's1' });
    expect(createMock.mock.calls[0][1].message).toContain(sessionTitle);

    createMock.mockClear();
    await notifier.notifyTaskFeedback({ success: true });
    expect(createMock.mock.calls[0][1].message).toContain('AI 助手');
  });

  test('失败无错误文本：回退「未知错误」', async () => {
    await notifier.notifyTaskFeedback({ success: false, sessionId: 's1' });
    expect(createMock.mock.calls[0][1].message).toContain('未知错误');
  });

  test('错误文本截断到约 160 字符（159 + 省略号）', async () => {
    await notifier.notifyTaskFeedback({ success: false, sessionId: 's1', error: 'e'.repeat(500) });
    const msg = createMock.mock.calls[0][1].message;
    expect(msg).toContain('e'.repeat(159) + '…');
    expect(msg).not.toContain('e'.repeat(160));
  });

  test('澄清问题截断到约 120 字符（119 + 省略号）', async () => {
    await notifier.notifyInteractionRequired({ kind: 'clarify', sessionId: 's1', detail: 'q'.repeat(300) });
    const msg = createMock.mock.calls[0][1].message;
    expect(msg).toContain('q'.repeat(119) + '…');
    expect(msg).not.toContain('q'.repeat(120));
  });

  test('错误文本折叠空白（换行/连续空格→单空格）', async () => {
    await notifier.notifyTaskFeedback({ success: false, sessionId: 's1', error: 'a\n\n   b   c' });
    expect(createMock.mock.calls[0][1].message).toContain('a b c');
  });
});

// ============ onClicked 解析 ============

describe('onClicked 解析', () => {
  test('未 init 时不注册 onClicked 监听（导入即崩防护）', () => {
    expect(onClickedListeners.length).toBe(0);
  });

  test('aih| 前缀：clear 该通知 + revealPanel', () => {
    const reveal = vi.fn();
    notifier.initNotifier({ isPanelVisible: () => false, revealPanel: reveal });
    expect(onClickedListeners.length).toBe(1);
    onClickedListeners[0]('aih|feedback|ok|s1');
    expect(clearMock).toHaveBeenCalledWith('aih|feedback|ok|s1');
    expect(reveal).toHaveBeenCalledTimes(1);
  });

  test('非 aih| 前缀（show_notification 工具的通知）：忽略', () => {
    const reveal = vi.fn();
    notifier.initNotifier({ isPanelVisible: () => false, revealPanel: reveal });
    onClickedListeners[0]('some-other-tool-notification');
    expect(clearMock).not.toHaveBeenCalled();
    expect(reveal).not.toHaveBeenCalled();
  });

  test('非字符串 id：忽略且不崩', () => {
    const reveal = vi.fn();
    notifier.initNotifier({ revealPanel: reveal });
    onClickedListeners[0](undefined);
    onClickedListeners[0](null);
    expect(reveal).not.toHaveBeenCalled();
  });

  test('revealPanel 抛异常不影响 clear 与后续', () => {
    notifier.initNotifier({ revealPanel: () => { throw new Error('reveal boom'); } });
    expect(() => onClickedListeners[0]('aih|interaction|confirm|s1')).not.toThrow();
    expect(clearMock).toHaveBeenCalledWith('aih|interaction|confirm|s1');
  });
});

// ============ clearInteractionNotification ============

describe('clearInteractionNotification', () => {
  test('清除 confirm 与 clarify 两个 id', () => {
    notifier.clearInteractionNotification('s9');
    expect(clearMock).toHaveBeenCalledTimes(2);
    expect(clearMock).toHaveBeenCalledWith('aih|interaction|confirm|s9');
    expect(clearMock).toHaveBeenCalledWith('aih|interaction|clarify|s9');
  });

  test('无 sessionId：清 global 两个 id', () => {
    notifier.clearInteractionNotification(null);
    expect(clearMock).toHaveBeenCalledWith('aih|interaction|confirm|global');
    expect(clearMock).toHaveBeenCalledWith('aih|interaction|clarify|global');
  });
});
