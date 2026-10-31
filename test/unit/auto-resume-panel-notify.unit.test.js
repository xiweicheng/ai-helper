// 长任务保活两项增强回归测试
// Task1 方案 B（alarms 自动续跑）：主任务执行期间注册周期闹钟（官方支持语义，alarms 跨 SW 死亡持久），
//   SW 被系统回收后闹钟 ≤30s 唤醒 SW → 扫描"运行中蒸发"残留 checkpoint → 自动 resumeReactLoopFromCheckpoint。
//   安全阀：① user_cancelled/error 终态 checkpoint 不自动续（用户意志/明确失败保持人工确认）；
//   ② 会话仍在 activeReactLoops 中不重复续跑（防双执行）；③ 连续 3 次自动续跑仍失败即停止并桌面通知。
// Task2 问题②提醒半边：keepalive port 断开时任务若仍在执行 → 立刻桌面通知，
//   堵"面板关了任务无声消失"的体验洞（心跳/续跑已尽量保住任务，通知负责让用户知情）。
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url), 'utf8'
);
const INDEX_SRC = readFileSync(
  new URL('../../src/background/index.js', import.meta.url), 'utf8'
);
const NOTIFIER_SRC = readFileSync(
  new URL('../../src/background/notifier.js', import.meta.url), 'utf8'
);

// ==================== 纯函数决策（不依赖 chrome） ====================

describe('decideAutoResume 自动续跑决策', () => {
  let decideAutoResume, AUTO_RESUME_MAX_ATTEMPTS;

  beforeEach(async () => {
    const m = await import('../../src/background/auto-resume.js');
    decideAutoResume = m.decideAutoResume;
    AUTO_RESUME_MAX_ATTEMPTS = m.AUTO_RESUME_MAX_ATTEMPTS;
  });

  const cp = (over = {}) => ({
    sessionId: 's1', interruptedReason: 'tools_completed', autoResumeAttempts: 0, ...over,
  });

  test('执行中蒸发残留（tools_completed/subtask_completed/plan_task_completed/in_progress）→ 进入续跑目标', () => {
    for (const reason of ['tools_completed', 'subtask_completed', 'plan_task_completed', 'in_progress', 'initial']) {
      const { targets } = decideAutoResume([cp({ interruptedReason: reason })], new Set());
      expect(targets.length, reason).toBe(1);
      expect(targets[0].nextAttempts).toBe(1);
    }
  });

  test('终态 checkpoint 不自 动续：user_cancelled（用户意志）、error（明确失败保持人工确认）与 budget_exhausted（软着陆后等用户点续跑）', () => {
    for (const reason of ['user_cancelled', 'error', 'budget_exhausted']) {
      const { targets, justExhausted } = decideAutoResume([cp({ interruptedReason: reason })], new Set());
      expect(targets.length, reason).toBe(0);
      expect(justExhausted.length, reason).toBe(0);
    }
  });

  test('目标停住的两类现场同样不自动续（闹钟不许替用户按「继续」）', async () => {
    const { GOAL_HALT_CHECKPOINT_REASONS } = await import('../../src/shared/goal.js');
    const m = await import('../../src/background/auto-resume.js');
    expect(GOAL_HALT_CHECKPOINT_REASONS.length).toBeGreaterThan(0);
    for (const reason of GOAL_HALT_CHECKPOINT_REASONS) {
      const { targets, justExhausted } = m.decideAutoResume([cp({ interruptedReason: reason })], new Set());
      expect(targets.length, reason).toBe(0);
      expect(justExhausted.length, reason).toBe(0);
    }
  });

  test('会话仍在 activeReactLoops 中 → 不续跑（防双执行）', () => {
    const { targets } = decideAutoResume([cp()], new Set(['s1']));
    expect(targets.length).toBe(0);
  });

  test('达到次数上限的当拍进 justExhausted（只通知一次），超限后完全静默（防通知风暴）', () => {
    const max = AUTO_RESUME_MAX_ATTEMPTS;
    const atMax = decideAutoResume([cp({ autoResumeAttempts: max - 1 })], new Set());
    expect(atMax.targets.length).toBe(1);   // 第 max 次仍允许续跑
    expect(atMax.targets[0].nextAttempts).toBe(max);

    const afterFail = decideAutoResume([cp({ autoResumeAttempts: max })], new Set());
    expect(afterFail.targets.length).toBe(0);
    expect(afterFail.justExhausted.length).toBe(1); // 刚耗尽 → 通知

    const longAgo = decideAutoResume([cp({ autoResumeAttempts: max + 5 })], new Set());
    expect(longAgo.targets.length).toBe(0);
    expect(longAgo.justExhausted.length).toBe(0);   // 早已通知过 → 静默
  });

  test('缺 sessionId 的畸形 checkpoint 被忽略；多会话混合各自判定', () => {
    const list = [
      cp({ sessionId: null }),
      cp({ sessionId: 'a', interruptedReason: 'error' }),
      cp({ sessionId: 'b' }),
      cp({ sessionId: 'c' }),
    ];
    const { targets } = decideAutoResume(list, new Set(['c']));
    expect(targets.map(t => t.checkpoint.sessionId)).toEqual(['b']);
  });
});

// ==================== alarms 生命周期（引用计数） ====================

describe('auto-resume 闹钟生命周期', () => {
  let startAutoResumeWatch, stopAutoResumeWatch, isAutoResumeWatchRunning, __resetAutoResumeWatchForTest, AUTO_RESUME_ALARM_NAME;
  let createSpy, clearSpy;

  beforeEach(async () => {
    createSpy = vi.fn();
    clearSpy = vi.fn((name, cb) => { if (typeof cb === 'function') cb(); });
    vi.stubGlobal('chrome', {
      alarms: {
        create: createSpy, clear: clearSpy,
        onAlarm: { addListener: vi.fn() },
      },
      runtime: { lastError: null },
    });
    const m = await import('../../src/background/auto-resume.js');
    startAutoResumeWatch = m.startAutoResumeWatch;
    stopAutoResumeWatch = m.stopAutoResumeWatch;
    isAutoResumeWatchRunning = m.isAutoResumeWatchRunning;
    __resetAutoResumeWatchForTest = m.__resetAutoResumeWatchForTest;
    AUTO_RESUME_ALARM_NAME = m.AUTO_RESUME_ALARM_NAME;
    __resetAutoResumeWatchForTest();
  });

  afterEach(() => {
    __resetAutoResumeWatchForTest();
    vi.unstubAllGlobals();
  });

  test('start 注册周期闹钟：固定名称 + 周期 0.5 分钟（30s，Chrome 允许的最小值）', () => {
    startAutoResumeWatch();
    expect(isAutoResumeWatchRunning()).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    expect(createSpy.mock.calls[0][0]).toBe(AUTO_RESUME_ALARM_NAME);
    expect(createSpy.mock.calls[0][1]).toEqual({ periodInMinutes: 0.5 });
  });

  test('引用计数：嵌套 start 只注册一次；stop 归零才 clear', () => {
    startAutoResumeWatch();
    startAutoResumeWatch();
    expect(createSpy).toHaveBeenCalledTimes(1);
    stopAutoResumeWatch();
    expect(isAutoResumeWatchRunning()).toBe(true);
    expect(clearSpy).not.toHaveBeenCalled();
    stopAutoResumeWatch();
    expect(isAutoResumeWatchRunning()).toBe(false);
    expect(clearSpy).toHaveBeenCalledWith(AUTO_RESUME_ALARM_NAME, expect.any(Function));
  });

  test('多余 stop 安全（计数不出负、不误 clear）；归零后可再次 start', () => {
    stopAutoResumeWatch();
    stopAutoResumeWatch();
    expect(clearSpy).not.toHaveBeenCalled();
    startAutoResumeWatch();
    expect(isAutoResumeWatchRunning()).toBe(true);
    expect(createSpy).toHaveBeenCalledTimes(1);
    stopAutoResumeWatch();
  });

  test('chrome.alarms 不可用时静默降级不抛错（重载竞态防护约定）', () => {
    vi.stubGlobal('chrome', {});
    // 模块已缓存；切换到缺 alarms 的 chrome 环境后启停均不应抛错
    expect(() => startAutoResumeWatch()).not.toThrow();
    expect(() => stopAutoResumeWatch()).not.toThrow();
  });
});

// ==================== Task2：notifier 行为 ====================

describe('notifyPanelDetached / notifyAutoResumeExhausted 行为', () => {
  let notifyPanelDetached, notifyAutoResumeExhausted;
  let createSpy, clearSpy;

  beforeEach(async () => {
    createSpy = vi.fn();
    clearSpy = vi.fn((id, cb) => { if (typeof cb === 'function') cb(); });
    vi.stubGlobal('chrome', {
      notifications: { create: createSpy, clear: clearSpy, onClicked: { addListener: vi.fn() } },
      runtime: { lastError: null, getURL: (p) => p },
      storage: { local: { get: (k, cb) => { cb && cb({}); return Promise.resolve({}); }, set: () => Promise.resolve() } },
    });
    const m = await import('../../src/background/notifier.js');
    notifyPanelDetached = m.notifyPanelDetached;
    notifyAutoResumeExhausted = m.notifyAutoResumeExhausted;
    createSpy.mockClear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('notifyPanelDetached 弹带会话标识的桌面通知（aih| 前缀 id，可点击聚焦面板）', async () => {
    await notifyPanelDetached({ sessionId: 'sess-9' });
    expect(createSpy).toHaveBeenCalledTimes(1);
    const [id, options] = createSpy.mock.calls[0];
    expect(id).toBe('aih|panel-lost|sess-9');
    expect(options.type).toBe('basic');
    expect(typeof options.title).toBe('string');
    expect(options.title.length).toBeGreaterThan(0);
    expect(options.message.length).toBeGreaterThan(0);
  });

  test('notifyAutoResumeExhausted 弹自动续跑失败通知', async () => {
    await notifyAutoResumeExhausted({ sessionId: 'sess-3' });
    expect(createSpy).toHaveBeenCalledTimes(1);
    const [id, options] = createSpy.mock.calls[0];
    expect(id).toBe('aih|auto-resume-exhausted|sess-3');
    expect(options.message.length).toBeGreaterThan(0);
  });
});

// ==================== 面板断开通知抑制判定 ====================

describe('shouldNotifyPanelDetached 面板断开通知抑制判定', () => {
  let shouldNotifyPanelDetached;

  beforeEach(async () => {
    vi.stubGlobal('chrome', {
      notifications: { create: vi.fn(), clear: vi.fn(), onClicked: { addListener: vi.fn() } },
      runtime: { lastError: null, getURL: (p) => p },
      storage: { local: { get: (k, cb) => { cb && cb({}); return Promise.resolve({}); }, set: () => Promise.resolve() } },
    });
    const m = await import('../../src/background/notifier.js');
    shouldNotifyPanelDetached = m.shouldNotifyPanelDetached;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  test('任务真在跑 + 未被取消 + 面板没重开 → 该弹（原设计意图）', () => {
    expect(shouldNotifyPanelDetached({ active: true, cancelled: false, panelReconnected: false })).toBe(true);
  });

  test('用户手动终止 → 不弹（端口同一 tick 断开，任务只是还在收尾）', () => {
    expect(shouldNotifyPanelDetached({ active: true, cancelled: true, panelReconnected: false })).toBe(false);
  });

  test('复核时任务已不在跑（正常完成/已收尾）→ 不弹', () => {
    expect(shouldNotifyPanelDetached({ active: false, cancelled: false, panelReconnected: false })).toBe(false);
  });

  test('面板已重连（关了又马上打开）→ 不弹，用户已经看得到任务', () => {
    expect(shouldNotifyPanelDetached({ active: true, cancelled: false, panelReconnected: true })).toBe(false);
  });

  test('缺参/空对象按保守处理不弹', () => {
    expect(shouldNotifyPanelDetached({})).toBe(false);
    expect(shouldNotifyPanelDetached()).toBe(false);
  });
});
// ==================== 接线守卫（源码正则） ====================

describe('接线守卫', () => {
  test('reactLoop 包装器：主任务（有 sessionId 且无 taskContext）随心跳同生命周期启停自动续跑闹钟', () => {
    expect(REACT_LOOP_SRC).toMatch(/import\s*\{[^}]*startAutoResumeWatch[^}]*\}\s*from\s*'\.\/auto-resume\.js'/);
    expect(REACT_LOOP_SRC).toMatch(
      /export async function reactLoop\(\.\.\.args\)\s*\{[\s\S]{0,400}?startAutoResumeWatch\(\)[\s\S]{0,600}?finally\s*\{[\s\S]{0,300}?stopAutoResumeWatch\(\)/
    );
    // 主任务判定：args[5]=sessionId 且 args[6]=taskContext 为空
    expect(REACT_LOOP_SRC).toMatch(/!\s*args\[6\][\s\S]{0,40}?args\[5]/);
  });

  test('index.js 注册闹钟处理：扫描 checkpoint → 计数回写 → resumeReactLoopFromCheckpoint', () => {
    expect(INDEX_SRC).toMatch(/registerAutoResumeAlarmHandler|onAutoResumeAlarm/);
    expect(INDEX_SRC).toMatch(/autoResumeAttempts/);
    expect(INDEX_SRC).toMatch(/resumeReactLoopFromCheckpoint\(/);
    expect(INDEX_SRC).toMatch(/getAllReactCheckpoints\(/);
  });

  test('index.js keepalive onDisconnect：不直接弹，延迟复核后由 shouldNotifyPanelDetached 决定', () => {
    const disconnectIdx = INDEX_SRC.indexOf("port.onDisconnect.addListener");
    expect(disconnectIdx).toBeGreaterThan(-1);
    const seg = INDEX_SRC.slice(disconnectIdx, disconnectIdx + 1400);
    expect(seg).toMatch(/setTimeout\(/);
    expect(seg).toMatch(/PANEL_DETACH_NOTIFY_DELAY_MS/);
    expect(seg).toMatch(/shouldNotifyPanelDetached\(\{/);
    expect(seg).toMatch(/active:\s*activeReactLoops\.has\(sessionId\)/);
    expect(seg).toMatch(/cancelled:\s*isCancelled\(sessionId\)/);
    expect(seg).toMatch(/panelReconnected:\s*hasKeepalivePort\(sessionId\)/);
    expect(seg).toMatch(/notifyPanelDetached\(\{ sessionId \}\)/);
    // 老写法（命中 activeReactLoops 就直接弹）必须消失，否则误报回归
    expect(seg).not.toMatch(/if \(activeReactLoops\.has\(sessionId\)\)\s*\{\s*notifyPanelDetached/);
  });

  test('index.js 补齐判定所需依赖导入（isCancelled / hasKeepalivePort / shouldNotifyPanelDetached）', () => {
    expect(INDEX_SRC).toMatch(/import\s*\{[^}]*\bisCancelled\b[^}]*\}\s*from\s*'\.\/state\.js'/);
    expect(INDEX_SRC).toMatch(/import\s*\{[^}]*hasKeepalivePort[^}]*\}\s*from\s*'\.\/state\.js'/);
    expect(INDEX_SRC).toMatch(/import\s*\{[^}]*shouldNotifyPanelDetached[^}]*\}\s*from\s*'\.\/notifier\.js'/);
  });

  test('notifier 新文案 i18n 中英文均已注册', () => {
    const zh = NOTIFIER_SRC.match(/registerTranslations\('zh'[\s\S]*?\n\}\);/);
    const en = NOTIFIER_SRC.match(/registerTranslations\('en'[\s\S]*?\n\}\);/);
    for (const src of [zh && zh[0], en && en[0]]) {
      expect(src).toMatch(/panelLostTitle:/);
      expect(src).toMatch(/panelLostMsg:/);
      expect(src).toMatch(/autoResumeExhaustedTitle:/);
      expect(src).toMatch(/autoResumeExhaustedMsg:/);
    }
  });
});
