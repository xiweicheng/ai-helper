// @vitest-environment jsdom
// queue-panel.unit.test.js - 排队条的渲染分支与"条目不会因 UI 无入口而丢失"
//
// 这一层最容易出现的隐性丢条目方式不是逻辑算错，而是**入口消失**：
//   - 队列清空后整条隐藏 → 「最近处理」打不开 → 失败条目没有重试入口
//   - ✎ 回填时把用户的草稿吞掉（草稿既没入队又没留在输入框）
import { describe, test, expect, beforeEach, vi } from 'vitest';

const h = vi.hoisted(() => ({
  QUEUE_STATUS: {
    QUEUED: 'queued',
    DISPATCHING: 'dispatching',
    INJECTING: 'injecting',
    INJECTED: 'injected',
    DONE: 'done',
    FAILED: 'failed',
  },
  bucket: { items: [], recent: [], paused: false, pausedReason: null },
  calls: { enqueue: [], removeItem: [], reorder: [], runnerEnqueue: [], removeFromRecent: [], inject: [] },
  flags: { enqueueOk: true, enqueueError: null, restoreOk: true, generating: false },
  listeners: [],
}));

vi.mock('../../src/side_panel/state.js', () => ({
  default: {
    activeSessionId: 's1',
    // 用 getter 读 flags：每个用例可以单独把“任务是否在跑”摆好再渲染
    get isGenerating() { return h.flags.generating === true; },
  },
}));

vi.mock('../../src/side_panel/queue-store.js', () => ({
  QUEUE_STATUS: h.QUEUE_STATUS,
  init: async () => {},
  getBucket: () => h.bucket,
  getItems: () => h.bucket.items,
  findItem: (sid, id) => h.bucket.items.find((it) => it.id === id) || null,
  // 与真实 store 同语义：从尾部往前找**仍在排队**的那条
  peekTailForEdit: () => {
    for (let i = h.bucket.items.length - 1; i >= 0; i -= 1) {
      if (h.bucket.items[i].status === 'queued') return h.bucket.items[i];
    }
    return null;
  },
  subscribe: (fn) => {
    h.listeners.push(fn);
    return () => {};
  },
  enqueue: async (arg) => {
    h.calls.enqueue.push(arg);
    if (h.flags.enqueueOk) return { ok: true, item: { id: 'new-item' }, position: 1 };
    return { ok: false, error: h.flags.enqueueError || 'queue_full', limit: 20 };
  },
  removeItem: async (...args) => {
    h.calls.removeItem.push(args);
    return { ok: true };
  },
  reorder: async (...args) => {
    h.calls.reorder.push(args);
  },
  requeueFromRecent: async () => ({ ok: true }),
  // 真实 store 会改动内存 + emit；这里同样改 bucket 并通知订阅者，
  // 以便断言“移除失败条目后整条提醒真的消失”这一闭环
  removeFromRecent: async (sid, id) => {
    h.calls.removeFromRecent.push([sid, id]);
    const i = h.bucket.recent.findIndex((it) => it.id === id);
    if (i >= 0) h.bucket.recent.splice(i, 1);
    h.listeners.forEach((fn) => fn('recent-remove'));
    return true;
  },
}));

vi.mock('../../src/side_panel/queue-runner.js', () => ({
  // 草稿安置走真实的入队链路（含上下文接管），这里只记录调用
  enqueueFromInput: async (opts) => {
    h.calls.runnerEnqueue.push(opts || {});
    if (h.flags.enqueueOk) return { ok: true, item: { id: 'new-item' }, position: 1 };
    return { ok: false, error: h.flags.enqueueError || 'queue_full', limit: 20 };
  },
  resumeQueue: async () => {},
  hasContext: (snapshot) => !!(
    snapshot
    && (snapshot.quotedContextText || snapshot.selectedPage || (snapshot.selectedSkills || []).length)
  ),
  currentInputHasContext: () => h.flags.inputHasContext === true,
  restoreContextForItem: async () => ({ ok: true, attachments: h.flags.restoreOk !== false, wantsAttachments: true }),
  releaseAttachments: async () => true,
  injectQueueItem: async (itemId, sessionId) => {
    h.calls.inject.push([itemId, sessionId]);
    return { ok: true, pending: true };
  },
}));

// t 返回 key，便于断言"到底渲染了哪条文案"
vi.mock('../../src/shared/i18n.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    t: (key, params) => (params && params.count != null ? `${key}#${params.count}` : key),
  };
});

vi.mock('../../src/side_panel/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, showToast: () => {} };
});

/** 与 side_panel.html 中 #queueStrip 保持一致的骨架 */
const STRIP_HTML = `
  <div class="queue-strip" id="queueStrip" style="display:none;">
    <div class="queue-strip-head">
      <span class="queue-strip-icon">⇥</span>
      <span class="queue-strip-summary" id="queueSummary"></span>
      <span class="queue-strip-paused" id="queuePausedTag" style="display:none;"></span>
      <button class="queue-strip-action" id="queueResumeBtn" type="button" style="display:none;"></button>
      <button class="queue-strip-action" id="queueRecentBtn" type="button"></button>
      <button class="queue-strip-toggle" id="queueToggleBtn" type="button" aria-expanded="false">▼</button>
    </div>
    <div class="queue-list" id="queueList" style="display:none;"></div>
    <div class="queue-recent" id="queueRecent" style="display:none;"></div>
  </div>
  <textarea id="userInput"></textarea>
`;

const item = (id, text, extra = {}) => ({
  id,
  sessionId: 's1',
  text,
  status: 'queued',
  createdAt: 1700000000000,
  hasContext: false,
  ...extra,
});

/** 每个用例重置模块级 UI 状态（expanded / recentVisible）与 DOM */
async function loadPanel(bucketPatch = {}) {
  vi.resetModules();
  h.bucket.items = bucketPatch.items || [];
  h.bucket.recent = bucketPatch.recent || [];
  h.bucket.paused = !!bucketPatch.paused;
  h.bucket.pausedReason = bucketPatch.pausedReason || null;
  h.calls.enqueue = [];
  h.calls.removeItem = [];
  h.calls.reorder = [];
  h.calls.runnerEnqueue = [];
  h.calls.removeFromRecent = [];
  h.flags.enqueueOk = true;
  h.flags.enqueueError = null;
  h.flags.restoreOk = true;
  // 上一组用例会把“输入区挂着图片/文件”摆成 true；不重置会让后续用例被它拦住
  h.flags.inputHasContext = false;
  h.flags.generating = !!bucketPatch.generating;
  h.listeners = [];
  document.body.innerHTML = STRIP_HTML;
  const panel = await import('../../src/side_panel/queue-panel.js');
  await panel.initQueuePanel();
  return panel;
}

const $ = (id) => document.getElementById(id);

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('排队条显隐', () => {
  test('队列与归档都为空 → 整条隐藏，不占输入区高度', async () => {
    await loadPanel();
    expect($('queueStrip').style.display).toBe('none');
  });

  test('队列空但有失败条目 → 保留一行失败提醒（失败任务的重试入口）', async () => {
    await loadPanel({ recent: [item('r1', '失败的那条', { status: 'failed' })] });

    const strip = $('queueStrip');
    expect(strip.style.display).toBe('');
    expect(strip.classList.contains('empty')).toBe(true);
    // 没有可展开的排队项 → 不显示展开箭头，但「最近处理」入口必须还在
    expect($('queueToggleBtn').style.display).toBe('none');
    expect($('queueRecentBtn').style.display).toBe('');
    // 文案不再是“队列已空”这种零信息量内容，而是直接告诉用户有几条需要处理
    expect($('queueSummary').textContent).toBe('queue.summaryFailed#1');
    expect($('queueSummary').classList.contains('failed')).toBe(true);
  });

  test('队列空且归档全是成功记录 → 整条隐藏，不再永久占住输入区', async () => {
    await loadPanel({
      recent: [item('r1', '已完成的一条', { status: 'done' }), item('r2', '已插话的一条', { status: 'injected' })],
    });
    expect($('queueStrip').style.display).toBe('none');
  });

  test('用户展开着归档时队列跑完 → 不突然消失，收起后消失', async () => {
    const panel = await loadPanel({
      items: [item('a', '第一条')],
      recent: [item('r1', '已完成的一条', { status: 'done' })],
    });
    $('queueRecentBtn').click();
    expect($('queueRecent').style.display).toBe('');

    // 队列跑空（全部成功，无失败）
    h.bucket.items = [];
    panel.renderQueue();
    expect($('queueStrip').style.display).toBe('');

    // 用户收起归档：既无排队项也无失败 → 整条消失
    $('queueRecentBtn').click();
    expect($('queueStrip').style.display).toBe('none');
  });

  test('有排队项 → 显示条数与展开箭头', async () => {
    await loadPanel({ items: [item('a', '第一条'), item('b', '第二条')] });

    const strip = $('queueStrip');
    expect(strip.style.display).toBe('');
    expect(strip.classList.contains('empty')).toBe(false);
    expect($('queueSummary').textContent).toBe('queue.summary#2');
    expect($('queueToggleBtn').style.display).toBe('');
  });

  test('暂停状态带出警示标签与继续按钮', async () => {
    await loadPanel({ items: [item('a', '第一条')], paused: true, pausedReason: 'user_stopped' });

    expect($('queueStrip').classList.contains('paused')).toBe(true);
    expect($('queuePausedTag').style.display).toBe('');
    expect($('queuePausedTag').title).toBe('queue.pausedByStop');
    expect($('queueResumeBtn').style.display).toBe('');
  });
});

describe('排队条交互', () => {
  test('展开后才渲染 chip，每个 chip 带「插话 + 回填 + 删除」三个操作', async () => {
    await loadPanel({ items: [item('a', '第一条'), item('b', '第二条')] });

    expect($('queueList').style.display).toBe('none');
    $('queueToggleBtn').click();

    expect($('queueList').style.display).toBe('');
    const chips = $('queueList').querySelectorAll('.queue-chip');
    expect(chips.length).toBe(2);
    const acts = [...chips[0].querySelectorAll('.queue-chip-btn')].map((b) => b.dataset.act);
    expect(acts).toEqual(['inject', 'edit', 'remove']);
  });

  test('展开「最近处理」后归档条目可见并带重新入队 / 移除按钮', async () => {
    await loadPanel({
      items: [item('a', '第一条')],
      recent: [item('r1', '已执行的一条', { status: 'done' })],
    });

    $('queueRecentBtn').click();
    expect($('queueRecent').style.display).toBe('');
    const rows = $('queueRecent').querySelectorAll('.queue-recent-item');
    expect(rows.length).toBe(1);
    expect(rows[0].querySelector('[data-act="requeue"]')).toBeTruthy();
    expect(rows[0].querySelector('[data-act="forget"]')).toBeTruthy();
  });

  test('移除失败条目后 → 队列条整条消失（否则提醒永远占着输入区）', async () => {
    await loadPanel({ recent: [item('r1', '失败的那条', { status: 'failed' })] });
    expect($('queueStrip').style.display).toBe('');

    $('queueRecentBtn').click();
    $('queueRecent').querySelector('[data-act="forget"]').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(h.calls.removeFromRecent).toEqual([['s1', 'r1']]);
    expect($('queueStrip').style.display).toBe('none');
  });

  test('移除一条失败记录后若还有其它失败 → 提醒保留并更新条数', async () => {
    await loadPanel({
      recent: [item('r1', '失败1', { status: 'failed' }), item('r2', '失败2', { status: 'failed' })],
    });
    expect($('queueSummary').textContent).toBe('queue.summaryFailed#2');

    $('queueRecentBtn').click();
    $('queueRecent').querySelectorAll('[data-act="forget"]')[0].click();
    await new Promise((r) => setTimeout(r, 0));

    expect($('queueStrip').style.display).toBe('');
    expect($('queueSummary').textContent).toBe('queue.summaryFailed#1');
  });

  test('chip 上分别显示图片数与文件数（让用户确认带的上下文没溜）', async () => {
    await loadPanel({
      items: [item('a', '带附件的一条', {
        attachmentSummary: { imageCount: 2, fileCount: 1, fileNames: ['需求.md'] },
      })],
    });
    $('queueToggleBtn').click();

    const badge = $('queueList').querySelector('.queue-chip-ctx');
    expect(badge.textContent).toBe('queue.withImages#2 · queue.withFiles#1');
    // title 里能看到具体文件名，确认带的是哪个文件
    expect(badge.getAttribute('title')).toBe('需求.md');
  });

  test('没有附件的条目只显示“带上下文”，不虚报图片/文件', async () => {
    await loadPanel({ items: [item('a', '只带引用', { contextSnapshot: { quotedContextText: '原文' } })] });
    $('queueToggleBtn').click();

    expect($('queueList').querySelector('.queue-chip-ctx').textContent).toBe('queue.withContext');
  });

  test('chip 上只保留插话、回填与删除三个按钮（排序只靠拖拽）', async () => {
    await loadPanel({ items: [item('a', '第一条'), item('b', '第二条'), item('c', '第三条')] });
    $('queueToggleBtn').click();

    const first = $('queueList').querySelectorAll('.queue-chip')[0];
    const acts = [...first.querySelectorAll('.queue-chip-btn')].map((b) => b.dataset.act);
    expect(acts).toEqual(['inject', 'edit', 'remove']);
    // 上移/下移/置顶彻底移除，避免按钮堆叠
    for (const gone of ['up', 'down', 'top']) {
      expect($('queueList').querySelector(`[data-act="${gone}"]`)).toBeFalsy();
    }
  });
});

describe('chip 上的状态信息', () => {
  // 这一块的情绪成本最高：用户列在这里的东西本来就是“排队的”，
  // 再标一句“排队中”、再塞个时间戳，等于用一行噪音换零信息。
  test('排队中的条目不再标“排队中”，也不显示时间', async () => {
    await loadPanel({ items: [item('a', '第一条')] });
    $('queueToggleBtn').click();

    const chip = $('queueList').querySelector('.queue-chip');
    // 没有状态标签，也没有整行 meta（无上下文时第二行不该存在）
    expect(chip.querySelector('.queue-chip-status')).toBeFalsy();
    expect(chip.querySelector('.queue-chip-meta')).toBeFalsy();
    expect(chip.textContent).not.toMatch(/\d{1,2}:\d{2}/);
  });

  test('正在执行的那条标“执行中”，带脉动标记与原因提示', async () => {
    await loadPanel({ items: [item('a', '正在跑的', { status: 'dispatching' })] });
    $('queueToggleBtn').click();

    const chip = $('queueList').querySelector('.queue-chip');
    const status = chip.querySelector('.queue-chip-status');
    expect(status.textContent).toBe('queue.statusDispatching');
    expect(status.classList.contains('running')).toBe(true);
    // 它会在列表里停留整轮生成（含工具调用），必须能解释“为什么还没走”
    expect(status.getAttribute('title')).toBe('queue.statusRunningHint');
    expect(chip.dataset.status).toBe('dispatching');
  });

  test('上次未完成的条目只提示这一例外状态，走警示色', async () => {
    await loadPanel({ items: [item('a', '恢复回来的', { interrupted: true })] });
    $('queueToggleBtn').click();

    const status = $('queueList').querySelector('.queue-chip-status');
    expect(status.textContent).toBe('queue.statusRecovered');
    expect(status.classList.contains('warning')).toBe(true);
    expect(status.classList.contains('running')).toBe(false);
  });

  test('有上下文时 meta 行才出现，状态与上下文并排', async () => {
    await loadPanel({
      items: [item('a', '正在跑且带图', {
        status: 'dispatching',
        attachmentSummary: { imageCount: 1, fileCount: 0, fileNames: [] },
      })],
    });
    $('queueToggleBtn').click();

    const meta = $('queueList').querySelector('.queue-chip-meta');
    expect(meta).toBeTruthy();
    expect(meta.querySelector('.queue-chip-status').textContent).toBe('queue.statusDispatching');
    expect(meta.querySelector('.queue-chip-ctx').textContent).toBe('queue.withImages#1');
  });
});

describe('⚡ 插话入口', () => {
  test('任务在跑时 ⚡ 亮起，点击交给 runner', async () => {
    await loadPanel({ items: [item('a', '补一句')], generating: true });
    $('queueToggleBtn').click();

    const btn = $('queueList').querySelector('[data-act="inject"]');
    expect(btn.classList.contains('muted')).toBe(false);
    expect(btn.title).toBe('queue.inject');

    btn.click();
    await new Promise((r) => setTimeout(r, 0));
    expect(h.calls.inject).toEqual([['a', 's1']]);
  });

  test('空闲时不置灰只弱化：点击仍能拿到“没有正在执行的任务”的原因', async () => {
    await loadPanel({ items: [item('a', '补一句')] });
    $('queueToggleBtn').click();

    const btn = $('queueList').querySelector('[data-act="inject"]');
    // disabled 的按钮点不动也不解释，用户会以为功能坏了
    expect(btn.disabled).toBe(false);
    expect(btn.classList.contains('muted')).toBe(true);
    expect(btn.title).toBe('queue.injectIdleHint');
  });

  test('生成开始/结束会重绘 ⚡ 的可用态', async () => {
    await loadPanel({ items: [item('a', '补一句')] });
    $('queueToggleBtn').click();
    expect($('queueList').querySelector('[data-act="inject"]').classList.contains('muted')).toBe(true);

    h.flags.generating = true;
    document.dispatchEvent(new CustomEvent('generating-state-changed'));
    expect($('queueList').querySelector('[data-act="inject"]').classList.contains('muted')).toBe(false);
  });
});

describe('整行标题都能折叠', () => {
  test('点标题文字（不是 ▲▼）也能收放', async () => {
    await loadPanel({ items: [item('a', '第一条')] });
    expect($('queueList').style.display).toBe('none');

    $('queueSummary').click();
    expect($('queueList').style.display).toBe('');

    $('queueSummary').click();
    expect($('queueList').style.display).toBe('none');
  });

  test('点标题行的空白处也能展开', async () => {
    await loadPanel({ items: [item('a', '第一条')] });
    document.querySelector('.queue-strip-head').click();
    expect($('queueList').style.display).toBe('');
  });

  test('点 ▲▼ 只切换一次（冒泡不能把刚做的切换又撤回去）', async () => {
    await loadPanel({ items: [item('a', '第一条')] });
    $('queueToggleBtn').click();
    expect($('queueList').style.display).toBe('');
    expect($('queueToggleBtn').getAttribute('aria-expanded')).toBe('true');
  });

  test('点「最近处理」不被标题行额外切换一次', async () => {
    await loadPanel({
      items: [item('a', '第一条')],
      recent: [item('r1', '已完成的一条', { status: 'done' })],
    });
    $('queueRecentBtn').click();
    // recentBtn 自己会把 expanded 置 true；冒泡到标题行再切一次就变 false，列表会消失
    expect($('queueRecent').style.display).toBe('');
    expect($('queueList').style.display).toBe('');
  });

  test('没有排队项时点标题不做事（无可折叠的内容）', async () => {
    await loadPanel({ recent: [item('r1', '失败的那条', { status: 'failed' })] });
    $('queueSummary').click();
    expect($('queueList').style.display).toBe('none');
  });
});

describe('✎ 回填不吞草稿', () => {
  test('输入框已有草稿 → 先把草稿入队，再回填并出队', async () => {
    await loadPanel({ items: [item('a', '排队中的那条')] });
    $('queueToggleBtn').click();
    $('userInput').value = '我打到一半的草稿';

    $('queueList').querySelector('[data-act="edit"]').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(h.calls.runnerEnqueue.length).toBe(1);
    // 草稿要连同它挂的上下文一起入队，且不能顺手把草稿派发出去
    expect(h.calls.runnerEnqueue[0]).toEqual({ autoDrain: false });
    expect($('userInput').value).toBe('排队中的那条');
    expect(h.calls.removeItem.length).toBe(1);
  });

  test('草稿入队失败 → 中止回填，草稿原样留在输入框', async () => {
    await loadPanel({ items: [item('a', '排队中的那条')] });
    h.flags.enqueueOk = false;
    h.flags.enqueueError = 'queue_full';
    $('queueToggleBtn').click();
    $('userInput').value = '我打到一半的草稿';

    $('queueList').querySelector('[data-act="edit"]').click();
    await new Promise((r) => setTimeout(r, 0));

    expect($('userInput').value).toBe('我打到一半的草稿');
    // 条目仍在队列里，没有被出队
    expect(h.calls.removeItem.length).toBe(0);
  });

  test('输入框为空 → 直接回填，不产生多余入队', async () => {
    await loadPanel({ items: [item('a', '排队中的那条')] });
    $('queueToggleBtn').click();

    $('queueList').querySelector('[data-act="edit"]').click();
    await new Promise((r) => setTimeout(r, 0));

    expect(h.calls.enqueue.length).toBe(0);
    expect(h.calls.runnerEnqueue.length).toBe(0);
    expect($('userInput').value).toBe('排队中的那条');
    expect(h.calls.removeItem.length).toBe(1);
  });

  test('没写字但挂了图片/文件 → 中止回填，不静默 revoke 掉它们', async () => {
    await loadPanel({ items: [item('a', '排队中的那条')] });
    h.flags.inputHasContext = true;
    $('queueToggleBtn').click();

    $('queueList').querySelector('[data-act="edit"]').click();
    await new Promise((r) => setTimeout(r, 0));

    // 输入框没动、条目没出队：user 自己挂的上下文还在
    expect($('userInput').value).toBe('');
    expect(h.calls.removeItem.length).toBe(0);
    expect(h.calls.runnerEnqueue.length).toBe(0);
  });
});

describe('↑ 编辑队尾', () => {
  test('取的是最后一条，不是第一条', async () => {
    const panel = await loadPanel({ items: [item('a', '第一条'), item('b', '最后一条')] });
    expect(panel.editQueueTail()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect($('userInput').value).toBe('最后一条');
    expect(h.calls.removeItem).toEqual([['s1', 'b']]);
  });

  test('尾部正在执行时往前找：不能把已经在跑的那条取回来重发', async () => {
    const panel = await loadPanel({
      items: [item('a', '还在排队的'), item('b', '已交给后台', { status: 'dispatching' })],
    });
    expect(panel.editQueueTail()).toBe(true);
    await new Promise((r) => setTimeout(r, 0));

    expect($('userInput').value).toBe('还在排队的');
    expect(h.calls.removeItem).toEqual([['s1', 'a']]);
  });

  test('没有可编辑的条目 → 返回 false，把这次按键让给历史导航', async () => {
    const panel = await loadPanel({ items: [item('a', '已交给后台', { status: 'injecting' })] });
    expect(panel.editQueueTail()).toBe(false);
    expect($('userInput').value).toBe('');
    expect(h.calls.removeItem.length).toBe(0);
  });

  test('⌨ 取回时给一句提示（否则 ↑ 看起来像“历史被删了”）', async () => {
    const panel = await loadPanel({ items: [item('a', '最后一条')] });
    panel.editQueueTail();
    await new Promise((r) => setTimeout(r, 0));
    // showToast 被本文件 mock 成空实现，这里只验证路径真实走完（条目已出队）
    expect(h.calls.removeItem.length).toBe(1);
  });
});
