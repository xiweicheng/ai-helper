// @vitest-environment jsdom
// test/unit/session-dock.unit.test.js - 执行中会话停靠条
// buildDockEntries 是纯函数：把「哪些会话在跑 / 在排队 / 刚完成」整理成停靠条目。
// 副作用模块（会话切换、队列、索引库）全部打桩，只验证条目推导与优先级规则。
import { describe, it, expect, vi, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

vi.mock('../../src/side_panel/session-manager-ui.js', () => ({
  handleSessionSwitch: vi.fn(async () => {}),
}));
vi.mock('../../src/side_panel/queue-store.js', () => ({
  subscribe: vi.fn(),
  listSessionIdsWithItems: () => [],
  getQueuedCount: () => 0,
  peekNext: () => null,
}));
vi.mock('../../src/storage/db.js', () => ({
  getSession: vi.fn(async () => null),
}));

const { buildDockEntries, isEntryStale, normalizeLabel, isSameLabel, pickEntryLabel,
  renderDock, initSessionDock, __resetSessionDockForTest } =
  await import('../../src/side_panel/session-dock.js');
const { default: state } = await import('../../src/side_panel/state.js');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

describe('buildDockEntries', () => {
  it('空输入返回空数组', () => {
    expect(buildDockEntries()).toEqual([]);
    expect(buildDockEntries({})).toEqual([]);
  });

  it('当前会话永不出现（用户正看着它，提示就是干扰）', () => {
    const entries = buildDockEntries({
      activeSessionId: 'current',
      generatingIds: ['current'],
      queuedCounts: { current: 3 },
      completedIds: ['current'],
    });
    expect(entries).toEqual([]);
  });

  it('同时命中多个信号时，执行中优先级最高', () => {
    const entries = buildDockEntries({
      activeSessionId: 'current',
      generatingIds: ['s1'],
      completedIds: ['s1'],
      queuedCounts: { s1: 2 },
    });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sessionId: 's1', phase: 'running', queuedCount: 2 });
  });

  it('后台回执的运行集合也算执行中（面板本地集合可能是空的）', () => {
    const entries = buildDockEntries({ runningIds: ['bg1'] });
    expect(entries.map((e) => e.phase)).toEqual(['running']);
  });

  it('只排队还没开跑的会话也要出现，阶段为 queued 并带条数', () => {
    const entries = buildDockEntries({ queuedCounts: { q1: 4 } });
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ sessionId: 'q1', phase: 'queued', queuedCount: 4 });
  });

  it('排队条数为 0 的会话不占位', () => {
    expect(buildDockEntries({ queuedCounts: { q1: 0 } })).toEqual([]);
  });

  it('完成态可被 × 掉，执行态不受 × 影响', () => {
    const entries = buildDockEntries({
      generatingIds: ['run1'],
      completedIds: ['done1', 'done2'],
      dismissedIds: ['run1', 'done1'],
    });
    expect(entries.map((e) => `${e.sessionId}:${e.phase}`)).toEqual(['run1:running', 'done2:done']);
  });

  it('定时任务发起的会话标记 source=scheduled', () => {
    const entries = buildDockEntries({
      runningIds: ['t1', 't2'],
      scheduledIds: ['t1'],
    });
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]));
    expect(byId.t1.source).toBe('scheduled');
    expect(byId.t2.source).toBe('chat');
  });

  it('排序：执行中 → 排队中 → 已完成，同阶段按时间倒序（最新的排最前）', () => {
    const entries = buildDockEntries({
      generatingIds: ['r2', 'r1'],
      queuedCounts: { q1: 1 },
      completedIds: ['d1'],
      startedAt: { r1: 100, r2: 200 },
      doneAt: { d1: 50 },
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['r2', 'r1', 'q1', 'd1']);
  });

  it('同阶段倒序：被折叠的一定是最老的，不是刚点下去的', () => {
    const entries = buildDockEntries({
      generatingIds: ['old', 'mid', 'new'],
      startedAt: { old: 100, mid: 200, new: 300 },
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['new', 'mid', 'old']);
  });

  it('标题、当前节点与子任务进度原样透传给条目', () => {
    const entries = buildDockEntries({
      generatingIds: ['s1'],
      titles: { s1: '重构登录流程' },
      nodeInfo: { s1: { nodeName: 'Write', subtaskIndex: 2, subtaskTotal: 3 } },
    });
    expect(entries[0]).toMatchObject({
      title: '重构登录流程',
      nodeName: 'Write',
      subtaskIndex: 2,
      subtaskTotal: 3,
    });
  });

  it('标题缺失时退回空串，由渲染层决定占位文案', () => {
    const entries = buildDockEntries({ generatingIds: ['s1'] });
    expect(entries[0]).toMatchObject({ title: '', nodeName: '', subtaskTotal: 0 });
  });

  it('Set 与数组两种入参都能接受（生成集合在面板里是 Set）', () => {
    const entries = buildDockEntries({
      generatingIds: new Set(['s1']),
      completedIds: new Set(['s2']),
      scheduledIds: new Set(['s1']),
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['s1', 's2']);
  });
});

describe('停靠条接线（源码守卫）', () => {
  it('面板入口初始化停靠条', () => {
    const src = read('src/side_panel/index.js');
    expect(src).toContain("import { initSessionDock } from './session-dock.js';");
    expect(src).toContain('initSessionDock();');
  });

  it('停靠条只消费既有执行信号，不自建运行状态', () => {
    const src = read('src/side_panel/session-dock.js');
    expect(src).toContain('QUERY_SESSION_RUNNING');
    expect(src).toContain('EXECUTION_STATUS_UPDATE');
    expect(src).toContain('SCHEDULED_TASK_RUN_STATE');
    // 归档 / 彻底删除后条目必须立即消失
    expect(src).toContain("document.addEventListener('session-archived'");
    expect(src).toContain("document.addEventListener('session-deleted'");
  });

  it('× 只给完成态与已失效条目（真在跑的给 × 会被误读成取消任务）', () => {
    const src = read('src/side_panel/session-dock.js');
    const chipBody = src.slice(src.indexOf('function buildChip'), src.indexOf('function showTip'));
    const guard = chipBody.indexOf('entry.phase === \'done\' || entry.stale');
    expect(guard).toBeGreaterThan(0);
    expect(chipBody.slice(guard)).toContain('session-dock-dismiss');
    // 芯片本体（guard 之前）不得出现 dismiss
    expect(chipBody.slice(0, guard)).not.toContain('session-dock-dismiss');
    // 陈旧态必须换一套标注文案，不能继续写「从停靠条移除」了事
    expect(chipBody).toContain("entry.stale ? t('dock.dismissStale') : t('dock.dismiss')");
  });

  it('只按后台权威集合解除 × 标记（不按三路并集）', () => {
    const src = read('src/side_panel/session-dock.js');
    const collect = src.slice(src.indexOf('function collectEntries'), src.indexOf('function trackFlashes'));
    expect(collect).toContain('for (const sid of runningIds) dismissedIds.delete(sid)');
    // 并集循环里不得再清 dismissedIds：陈旧条目本身就脏在本地集合里，
    // 按并集解除会让刚点掉的条目下一帧复活
    const unionLoop = collect.slice(collect.indexOf('for (const sid of new Set'));
    const unionBody = unionLoop.slice(0, unionLoop.indexOf('for (const sid of runningIds)'));
    expect(unionBody).not.toContain('dismissedIds.delete');
  });

  it('收到执行更新就刷新陈旧基准，归档/删除连基准-map 一起清', () => {
    const src = read('src/side_panel/session-dock.js');
    const status = src.slice(src.indexOf('function onExecutionStatus'), src.indexOf('function clearEntry'));
    expect(status).toContain('lastUpdateAt.set(sid, Date.now())');
    const clear = src.slice(src.indexOf('function clearEntry'), src.indexOf('export function initSessionDock'));
    expect(clear).toContain('lastUpdateAt.delete(sessionId)');
  });

  it('陈旧态 / 聚合芯片 / 溢出面板样式齐备，且陈旧时必须停掉动效', () => {
    const css = read('src/side_panel/styles.css');
    expect(css).toContain('.session-dock-item[data-phase="running"][data-stale="true"] .session-dock-chip {');
    expect(css).toContain('.session-dock-item[data-phase="running"][data-stale="true"] .session-dock-chip::after {');
    expect(css).toContain('.session-dock-item--more .session-dock-more {');
    expect(css).toContain('.session-dock-overflow {');
    expect(css).toContain('.session-dock-overflow-row {');
    // 还在动就等于在说谎：旋转弧必须直接不渲染
    const staleBlock = css.slice(
      css.indexOf('.session-dock-item[data-phase="running"][data-stale="true"] .session-dock-chip::after {'),
      css.indexOf('.session-dock-item[data-phase="running"][data-stale="true"] .session-dock-chip::after {') + 200,
    );
    expect(staleBlock).toContain('display: none;');
  });
});

describe('isEntryStale（状态脏了不能永远删不掉）', () => {
  const NOW = 1_000_000;

  it('后台不认 + 超时没更新 → 判为失效', () => {
    expect(isEntryStale({
      phase: 'running',
      sessionId: 's1',
      backendRunningIds: [],
      startedAt: NOW - 90_000,
      now: NOW,
    })).toBe(true);
  });

  it('未超时不判：还差 1 毫秒就还是「执行中」', () => {
    expect(isEntryStale({
      phase: 'running',
      sessionId: 's1',
      backendRunningIds: [],
      startedAt: NOW - 89_999,
      now: NOW,
    })).toBe(false);
  });

  it('后台权威集合还在报告就绝不判陈旧（真在跑的不误伤）', () => {
    expect(isEntryStale({
      phase: 'running',
      sessionId: 's1',
      backendRunningIds: ['s1'],
      startedAt: NOW - 10 * 60_000,
      now: NOW,
    })).toBe(false);
  });

  it('最后一次节点更新会重置计时，长期任务不会被误杀', () => {
    expect(isEntryStale({
      phase: 'running',
      sessionId: 's1',
      backendRunningIds: [],
      startedAt: NOW - 10 * 60_000,
      lastUpdateAt: NOW - 1000,
      now: NOW,
    })).toBe(false);
  });

  it('没有任何时间基准时不判（宁可少报不可误报）', () => {
    expect(isEntryStale({
      phase: 'running',
      sessionId: 's1',
      backendRunningIds: [],
      startedAt: 0,
      lastUpdateAt: 0,
      now: NOW,
    })).toBe(false);
  });

  it('只对执行中生效：排队与完成不参与陈旧判定', () => {
    const base = { sessionId: 's1', backendRunningIds: [], startedAt: NOW - 90_000, now: NOW };
    expect(isEntryStale({ ...base, phase: 'queued' })).toBe(false);
    expect(isEntryStale({ ...base, phase: 'done' })).toBe(false);
    expect(isEntryStale({ ...base, phase: '' })).toBe(false);
    expect(isEntryStale({ ...base, phase: 'running', sessionId: null })).toBe(false);
  });

  it('陈旧判定接上条目：脏在本地集合但后台已不报告的 running 带 stale，新的不带', () => {
    const entries = buildDockEntries({
      generatingIds: ['dirty', 'fresh'],
      runningIds: [],
      startedAt: { dirty: NOW - 200_000, fresh: NOW - 1000 },
      now: NOW,
    });
    const byId = Object.fromEntries(entries.map((e) => [e.sessionId, e]));
    expect(byId.dirty.stale).toBe(true);
    expect(byId.fresh.stale).toBe(false);
  });

  it('已失效条目可以被 × 掉，真在跑的仍然不行', () => {
    const entries = buildDockEntries({
      generatingIds: ['dirty', 'fresh'],
      startedAt: { dirty: NOW - 200_000, fresh: NOW - 1000 },
      dismissedIds: ['dirty', 'fresh'],
      now: NOW,
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['fresh']);
  });

  it('已失效的排在同组真实条目之后，不挤占新任务位置', () => {
    const entries = buildDockEntries({
      generatingIds: ['dirty', 'new'],
      startedAt: { dirty: 100, new: 900 },
      now: 200_000,
    });
    expect(entries.map((e) => e.sessionId)).toEqual(['new', 'dirty']);
  });

  it('排队条目即使没开跑也不会被当成失效（数据源是持久队列）', () => {
    const entries = buildDockEntries({
      queuedCounts: { q1: 3 },
      startedAt: { q1: 0 },
      now: 200_000,
    });
    expect(entries[0]).toMatchObject({ sessionId: 'q1', phase: 'queued', stale: false });
  });
});

describe('主行用用户问题而不是会话标题', () => {
  // 会话标题是首条用户消息截断前 50 字，多轮会话里它挂在第一个问题上，
  // 用户悬停看到标题根本对不上「现在在跑哪一句」。
  it('normalizeLabel：换行与连续空白压成单空格，空值给空串', () => {
    expect(normalizeLabel('  整理\n下载目录   里的\r\n重复文件  ')).toBe('整理 下载目录 里的 重复文件');
    expect(normalizeLabel('')).toBe('');
    expect(normalizeLabel(undefined)).toBe('');
    expect(normalizeLabel(null)).toBe('');
  });

  it('normalizeLabel：超 160 字截断加省略号（按码点切，不拆坏 emoji）', () => {
    const long = normalizeLabel('🔧'.repeat(200));
    expect(Array.from(long)).toHaveLength(161);
    expect(long.endsWith('…')).toBe(true);
    expect(normalizeLabel('短问题')).toBe('短问题');
  });

  it('isSameLabel：标题是问题前缀（含末尾省略号）时算同一句', () => {
    expect(isSameLabel('重构登录流程', '重构登录流程并补上单测')).toBe(true);
    expect(isSameLabel('重构登录流程…', '重构登录流程并补上单测')).toBe(true);
    expect(isSameLabel('重构 登录 流程', '重构登录流程并补上单测')).toBe(true);
    expect(isSameLabel('上周的数据迁移', '重构登录流程并补上单测')).toBe(false);
    expect(isSameLabel('', '重构登录流程')).toBe(false);
    expect(isSameLabel('重构登录流程', '')).toBe(false);
  });

  it('pickEntryLabel：排队中优先用队列条目原文（它还没变成用户消息）', () => {
    const label = pickEntryLabel({
      phase: 'queued',
      queuedText: '下一条要跑的提问',
      questionText: '上一轮已经跑完的提问',
      title: '会话标题',
    });
    expect(label.primary).toBe('下一条要跑的提问');
    expect(label.isQuestion).toBe(true);
  });

  it('pickEntryLabel：非排队阶段用当前用户问题，不看队列原文', () => {
    const label = pickEntryLabel({
      phase: 'running',
      queuedText: '下一条要跑的提问',
      questionText: '正在执行的提问',
      title: '会话标题',
    });
    expect(label.primary).toBe('正在执行的提问');
  });

  it('pickEntryLabel：拿不到问题时回落会话标题，且不编造副行', () => {
    const label = pickEntryLabel({ phase: 'running', questionText: '', title: '只有标题' });
    expect(label).toEqual({ primary: '只有标题', sub: '', isQuestion: false, from: 'title' });
    expect(pickEntryLabel({ phase: 'running' })).toEqual({ primary: '', sub: '', isQuestion: false, from: '' });
  });

  it('pickEntryLabel：from 说清主行来自哪一手（定位只能信 question）', () => {
    expect(pickEntryLabel({ phase: 'queued', queuedText: '排队原文', questionText: '上一轮问题' }).from)
      .toBe('queued');
    expect(pickEntryLabel({ phase: 'running', questionText: '正在执行的问题' }).from).toBe('question');
    expect(pickEntryLabel({ phase: 'done', title: '只有标题' }).from).toBe('title');
  });

  it('pickEntryLabel：副行只在「与问题不是同一句」时出现', () => {
    expect(pickEntryLabel({ phase: 'running', questionText: '第三个问题', title: '第一个问题' }).sub)
      .toBe('第一个问题');
    // 单轮会话：标题就是问题的前缀，副行重复无意义
    expect(pickEntryLabel({ phase: 'running', questionText: '第一个问题的完整版本', title: '第一个问题' }).sub)
      .toBe('');
    // 主行本身就是标题时也不能再当副行播一遍
    expect(pickEntryLabel({ phase: 'running', questionText: '', title: '只有标题' }).sub).toBe('');
  });

  it('buildDockEntries 把标签算进条目，且不影响芯片首字符仍取标题', () => {
    const entries = buildDockEntries({
      generatingIds: ['r1'],
      queuedCounts: { q1: 2 },
      titles: { r1: '第一个问题', q1: '另一个会话' },
      questions: { r1: '第五轮的新问题' },
      queuedTexts: { q1: '排队里等着的那句' },
    });
    const running = entries.find((e) => e.sessionId === 'r1');
    expect(running).toMatchObject({ primary: '第五轮的新问题', sub: '第一个问题', title: '第一个问题' });
    const queued = entries.find((e) => e.sessionId === 'q1');
    expect(queued.primary).toBe('排队里等着的那句');
  });

  it('取用户问题必须走 extractTextFromContent（带图提问的 content 是 parts 数组）', () => {
    const src = read('src/side_panel/session-dock.js');
    const body = src.slice(
      src.indexOf('function lastUserMessageFrom'),
      src.indexOf('/**\n * 由各路信号算出停靠条目'),
    );
    expect(body).toContain('extractTextFromContent(msg.content)');
    // 不得把原始 content 直接当文本塞进提示：那会得到一坨 base64 data URL
    expect(body).not.toContain('String(msg.content)');
    // 定位锚点必须一起取回来：没 messageId 就只能「打开会话」，定不到那一轮
    expect(body).toContain('messageId: msg.messageId ? String(msg.messageId)');
    expect(src).toContain("from '../shared/token-counter.js'");
  });

  it('问题真值以库为准：内存快照只当占位，stamp 变了就重取', () => {
    const src = read('src/side_panel/session-dock.js');
    const hydrate = src.slice(src.indexOf('function hydrateSessionLabels'), src.indexOf('/** 条目状态文案'));
    // 写进缓存的必须是 getSession 回来的记录，而不是 state.sessions 那份旧快照
    expect(hydrate).toContain('questionCache.set(sid, { text: found.text, messageId: found.messageId, stamp })');
    expect(hydrate).toContain('cached.stamp !== stamp');
    // 且一次 getSession 同时补标题与问题，不多一次 IO
    expect(hydrate.match(/getSession\(/g)).toHaveLength(1);
  });
});

describe('点芯片定位到那一轮用户问题', () => {
  it('执行中条目带 anchorMessageId（取自会话最后一条用户消息）', () => {
    const entries = buildDockEntries({
      generatingIds: ['r1'],
      titles: { r1: '会话标题' },
      questions: { r1: '正在执行的问题' },
      anchors: { r1: 'msg_r1_q5' },
    });
    expect(entries[0]).toMatchObject({ primary: '正在执行的问题', anchorMessageId: 'msg_r1_q5' });
  });

  it('完成态也带锚点（点进去先确认是哪个问题跑完了）', () => {
    const entries = buildDockEntries({
      completedIds: ['d1'],
      titles: { d1: '会话标题' },
      questions: { d1: '刚跑完的问题' },
      anchors: { d1: 'msg_d1_q3' },
    });
    expect(entries[0]).toMatchObject({ phase: 'done', anchorMessageId: 'msg_d1_q3' });
  });

  it('排队条目不许拿上一轮的 messageId 冒充定位（那条原文还没入库）', () => {
    const entries = buildDockEntries({
      queuedCounts: { q1: 2 },
      titles: { q1: '会话标题' },
      questions: { q1: '上一轮已经跑完的问题' },
      anchors: { q1: 'msg_q1_prev' },
      queuedTexts: { q1: '排队里等着的那句' },
    });
    expect(entries[0]).toMatchObject({ phase: 'queued', primary: '排队里等着的那句', anchorMessageId: '' });
  });

  it('主行回落到会话标题时不带锚点（会话里没有对应消息节点）', () => {
    const entries = buildDockEntries({
      generatingIds: ['r1'],
      titles: { r1: '每日汇总' },
      anchors: { r1: 'msg_r1_ghost' },
    });
    expect(entries[0]).toMatchObject({ primary: '每日汇总', anchorMessageId: '' });
  });

  it('历史消息没带 messageId 时锚点为空（不拿空 id 去定位）', () => {
    const entries = buildDockEntries({
      generatingIds: ['r1'],
      titles: { r1: '会话标题' },
      questions: { r1: '早期记录的问题' },
    });
    expect(entries[0].anchorMessageId).toBe('');
  });

  it('点执行中芯片：把锚点交给会话切换', async () => {
    const { handleSessionSwitch } = await import('../../src/side_panel/session-manager-ui.js');
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [{
      id: 'other',
      title: '会话标题',
      messageHistory: [{ role: 'user', content: '正在执行的问题', messageId: 'msg_other_q2' }],
    }];
    state.generatingSessionIds.add('other');
    renderDock();

    document.querySelector('.session-dock-item[data-session-id="other"] .session-dock-chip').click();
    expect(handleSessionSwitch).toHaveBeenCalledWith('other', { focusMessageId: 'msg_other_q2' });
  });

  it('只能显示标题的芯片不带锚点：宁可不定位也不定错行', async () => {
    const { handleSessionSwitch } = await import('../../src/side_panel/session-manager-ui.js');
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [{
      id: 'noid',
      title: '每日汇总',
      messageHistory: [{ role: 'assistant', content: '自动执行结果' }],
    }];
    state.generatingSessionIds.add('noid');
    renderDock();

    document.querySelector('.session-dock-item[data-session-id="noid"] .session-dock-chip').click();
    expect(handleSessionSwitch).toHaveBeenCalledWith('noid', { focusMessageId: null });
  });

  it('溢出面板里的行点击也带锚点，且必须是同一个会话的锚点', async () => {
    const { handleSessionSwitch } = await import('../../src/side_panel/session-manager-ui.js');
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [];
    for (let i = 1; i <= 10; i += 1) {
      state.sessions.push({
        id: `big${i}`,
        title: `会话 ${i}`,
        messageHistory: [{ role: 'user', content: `第 ${i} 个任务的问题`, messageId: `msg_big${i}` }],
      });
      state.generatingSessionIds.add(`big${i}`);
    }
    renderDock();
    document.querySelector('.session-dock-item--more').dispatchEvent(new MouseEvent('mouseenter'));

    const rows = document.querySelectorAll('.session-dock-overflow-row');
    expect(rows.length).toBe(3);
    rows[0].click();
    // 不钉死哪一行在前：只要求传回的锚点属于刚切过去的那个会话
    // （mock 不每条用例重置，取最后一笔才是本次点击）
    const [switchedId, options] = handleSessionSwitch.mock.calls[handleSessionSwitch.mock.calls.length - 1];
    expect(options).toEqual({ focusMessageId: `msg_${switchedId}` });
  });

  it('会话切换的接线：跳过内建滚动恢复，定位失败则回落恢复位置', () => {
    const src = read('src/side_panel/session-manager-ui.js');
    expect(src).toContain('export async function handleSessionSwitch(sessionId, { focusMessageId = null } = {})');
    const fn = src.slice(
      src.indexOf('export async function handleSessionSwitch'),
      src.indexOf('// ==================== 会话复制'),
    );
    // 不带参时不能往 detail 里塞 skipScrollRestore，否则所有旧调用点会丢掉原有的滚动恢复
    expect(fn).toContain('...(focusMessageId ? { skipScrollRestore: true } : {})');
    expect(fn).toContain('if (focusMessageId) scheduleMessageFocus(sessionId, focusMessageId);');

    const focus = src.slice(
      src.indexOf('function scheduleMessageFocus'),
      src.indexOf('/**\n * 处理会话切换'),
    );
    // 跳过内建恢复后，定位失败必须自己补一次，不然视野停在消息区顶部
    expect(focus).toContain('if (!focusMessageInView(messageId)) restoreSessionScroll(sessionId)');
    // 等 DOM 重建的 500ms 里用户可能已切走，不能把视野抢回来
    expect(focus).toContain('if (state.activeSessionId !== sessionId) return;');
  });

  it('芯片与溢出行走同一个入口，且只有停靠条会传锚点', () => {
    const dock = read('src/side_panel/session-dock.js');
    // 两个入口不能各写一套传参：只能有一处调 handleSessionSwitch
    expect((dock.match(/handleSessionSwitch\(/g) || []).length).toBe(1);
    // 只数调用点（带分号），否则连定义行 `openDockEntry(entry) {` 也会被算进去
    expect((dock.match(/openDockEntry\(entry\);/g) || []).length).toBe(2);
  });
});

describe('走廊样式与动效克制', () => {
  it('tooltip 主行给两行截断、副行有独立样式，且没弄丢状态行', () => {
    const css = read('src/side_panel/styles.css');
    const title = css.slice(
      css.indexOf('.session-dock-tip-title {'),
      css.indexOf('.session-dock-tip-sub {'),
    );
    expect(title).toContain('-webkit-line-clamp: 2');
    expect(title).toContain('word-break: break-word');
    // 主行不能再是单行 nowrap：长问题会被切得看不出是哪个任务
    expect(title).not.toContain('white-space: nowrap');
    const sub = css.slice(
      css.indexOf('.session-dock-tip-sub {'),
      css.indexOf('.session-dock-tip-status {'),
    );
    // 11px 小字要过 4.5:1，不能用只够装饰文本的 -tertiary
    expect(sub).toContain('var(--text-secondary)');
    // 上一轮改样式时差一点把状态行整条删掉，在这里钉住
    expect(css).toContain('.session-dock-tip-status {');
  });
  it('停靠条与聊天区走廊样式齐备', () => {
    const css = read('src/side_panel/styles.css');
    expect(css).toContain('.session-dock {');
    expect(css).toContain('.session-dock-chip {');
    expect(css).toContain('.session-dock-item[data-phase="running"]');
    expect(css).toContain('.session-dock-item[data-phase="queued"]');
    expect(css).toContain('.session-dock-item[data-phase="done"]');
    expect(css).toContain('.session-dock-tip {');
    expect(css).toContain('body.has-session-dock .chat-container');
  });

  it('尊重系统「减少动态效果」偏好', () => {
    const css = read('src/side_panel/styles.css');
    // 减少动效的块不止一处（芯片动效 / 浮层过渡），按块合起来校而不依赖文件顺序
    const blocks = css.split('@media (prefers-reduced-motion: reduce) {').slice(1);
    expect(blocks.length).toBeGreaterThan(1);
    const joined = blocks.join('\n');
    expect(joined).toContain('.session-dock-item[data-phase="running"] .session-dock-chip');
    expect(joined).toContain('.session-dock-item.is-flash .session-dock-chip');
    expect(joined).toContain('.session-dock-overflow');
    expect(joined).toContain('transition: none;');
  });
});

describe('渲染与初始化接口', () => {
  it('导出渲染、初始化与测试重置三个入口', () => {
    expect(typeof renderDock).toBe('function');
    expect(typeof initSessionDock).toBe('function');
    expect(typeof __resetSessionDockForTest).toBe('function');
  });

  it('初始化幂等：重复调用不重复挂 DOM', () => {
    __resetSessionDockForTest();
    initSessionDock();
    const count = document.querySelectorAll('.session-dock').length;
    initSessionDock();
    expect(document.querySelectorAll('.session-dock').length).toBe(count);
  });

  it('无条目时移除 show 与聊天区走廊类', () => {
    __resetSessionDockForTest();
    document.body.classList.add('has-session-dock');
    renderDock();
    expect(document.body.classList.contains('has-session-dock')).toBe(false);
    const dock = document.querySelector('.session-dock');
    expect(dock.classList.contains('show')).toBe(false);
  });

  it('8 个以内全画条目，不出聚合芯片', () => {
    __resetSessionDockForTest();
    state.sessions = [];
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    for (let i = 1; i <= 8; i += 1) state.generatingSessionIds.add(`ok${i}`);
    renderDock();
    expect(document.querySelectorAll('.session-dock-item').length).toBe(8);
    expect(document.querySelector('.session-dock-item--more')).toBeNull();
  });

  it('第 9 个起折叠：前 7 条 + 1 个 +N 聚合芯片，共占 8 个位置', () => {
    __resetSessionDockForTest();
    state.sessions = [];
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    for (let i = 1; i <= 10; i += 1) state.generatingSessionIds.add(`big${i}`);
    renderDock();

    // 整条不能超过 MAX_CHIPS：这就是「20 个任务会不会溢出」的答案
    expect(document.querySelectorAll('.session-dock-item').length).toBe(8);
    const more = document.querySelector('.session-dock-item--more');
    expect(more).not.toBeNull();
    expect(more.querySelector('.session-dock-more').textContent).toBe('+3');
    // 不能让被折叠的会话默默消失：得用键盘也能开到
    expect(more.querySelector('.session-dock-more').getAttribute('aria-expanded')).toBe('false');
  });

  it('悬停 +N 展开溢出面板，列出被折叠的会话且可点击', async () => {
    const { handleSessionSwitch } = await import('../../src/side_panel/session-manager-ui.js');
    __resetSessionDockForTest();
    state.sessions = [{ id: 'big1', title: '重构登录流程' }];
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    for (let i = 1; i <= 10; i += 1) state.generatingSessionIds.add(`big${i}`);
    renderDock();

    const more = document.querySelector('.session-dock-item--more');
    more.dispatchEvent(new MouseEvent('mouseenter'));

    const panel = document.querySelector('.session-dock-overflow');
    expect(panel).not.toBeNull();
    expect(panel.classList.contains('show')).toBe(true);
    const rows = panel.querySelectorAll('.session-dock-overflow-row');
    expect(rows.length).toBe(3);
    // 行内必须有标题与状态两行，不能只给个而无标题的 ID
    expect(rows[0].querySelector('.session-dock-overflow-title').textContent).not.toBe('');
    expect(rows[0].querySelector('.session-dock-overflow-status').textContent).not.toBe('');

    rows[0].click();
    expect(handleSessionSwitch).toHaveBeenCalled();
    expect(panel.classList.contains('show')).toBe(false);
  });

  it('悬停 tooltip：主行是用户问题，副行才是会话标题', () => {
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [{
      id: 'other',
      title: '第一个问题',
      messageHistory: [
        { role: 'user', content: '第一个问题' },
        { role: 'assistant', content: '回答' },
        { role: 'user', content: '第五轮：\n把季度报表改成表格' },
      ],
    }];
    state.generatingSessionIds.add('other');
    renderDock();

    const wrapper = document.querySelector('.session-dock-item[data-session-id="other"]');
    wrapper.dispatchEvent(new MouseEvent('mouseenter'));
    const tip = document.querySelector('.session-dock-tip');
    expect(tip.classList.contains('show')).toBe(true);
    // 原文里的换行被压成单空格，主行是「现在在跑的那一句」而不是标题
    expect(tip.querySelector('.session-dock-tip-title').textContent).toBe('第五轮： 把季度报表改成表格');
    expect(tip.querySelector('.session-dock-tip-sub').textContent).toBe('第一个问题');
    expect(tip.querySelector('.session-dock-tip-status').textContent).toContain('正在执行');
    // 芯片上的字仍取标题首字符，不随问题变而跳字
    expect(wrapper.querySelector('.session-dock-chip').textContent).toBe('第');
    expect(wrapper.querySelector('.session-dock-chip').getAttribute('aria-label')).toContain('第五轮：');
  });

  it('单轮会话不出副行（标题就是问题的前缀，重复一遍没意义）', () => {
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [{
      id: 'solo',
      title: '重构登录流程',
      messageHistory: [{ role: 'user', content: '重构登录流程并补上单测' }],
    }];
    state.generatingSessionIds.add('solo');
    renderDock();
    document.querySelector('.session-dock-item[data-session-id="solo"]')
      .dispatchEvent(new MouseEvent('mouseenter'));

    const tip = document.querySelector('.session-dock-tip');
    expect(tip.querySelector('.session-dock-tip-title').textContent).toBe('重构登录流程并补上单测');
    expect(tip.querySelector('.session-dock-tip-sub')).toBeNull();
  });

  it('带图提问：content 是多模态数组时只取文本，不把 base64 塞进 tooltip', () => {
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [{
      id: 'img',
      title: '看这张图',
      messageHistory: [{
        role: 'user',
        content: [
          { type: 'text', text: '这张图里的报错是什么意思' },
          { type: 'image_url', image_url: { url: `data:image/png;base64,${'A'.repeat(300)}` } },
        ],
      }],
    }];
    state.generatingSessionIds.add('img');
    renderDock();
    document.querySelector('.session-dock-item[data-session-id="img"]')
      .dispatchEvent(new MouseEvent('mouseenter'));

    const tip = document.querySelector('.session-dock-tip');
    expect(tip.querySelector('.session-dock-tip-title').textContent).toBe('这张图里的报错是什么意思');
    expect(tip.textContent).not.toContain('base64');
    expect(tip.textContent).not.toContain('[object Object]');
  });

  it('会话里没有用户消息（定时任务会话）时回落标题，也不编造副行', () => {
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [{
      id: 'sched',
      title: '每日汇总',
      messageHistory: [{ role: 'assistant', content: '自动执行结果' }],
    }];
    state.generatingSessionIds.add('sched');
    renderDock();
    document.querySelector('.session-dock-item[data-session-id="sched"]')
      .dispatchEvent(new MouseEvent('mouseenter'));

    const tip = document.querySelector('.session-dock-tip');
    expect(tip.querySelector('.session-dock-tip-title').textContent).toBe('每日汇总');
    expect(tip.querySelector('.session-dock-tip-sub')).toBeNull();
  });

  it('溢出面板的行也用用户问题当名称', () => {
    __resetSessionDockForTest();
    state.activeSessionId = 'cur';
    state.generatingSessionIds.clear();
    state.sessions = [];
    for (let i = 1; i <= 9; i += 1) {
      state.sessions.push({
        id: `p${i}`,
        title: `标题${i}`,
        messageHistory: [{ role: 'user', content: `问题${i}` }],
      });
      state.generatingSessionIds.add(`p${i}`);
    }
    renderDock();
    document.querySelector('.session-dock-item--more').dispatchEvent(new MouseEvent('mouseenter'));

    const rows = document.querySelectorAll('.session-dock-overflow-row');
    expect(rows.length).toBeGreaterThan(0);
    for (const row of rows) {
      const text = row.querySelector('.session-dock-overflow-title').textContent;
      expect(text.startsWith('问题')).toBe(true);
      expect(text.startsWith('标题')).toBe(false);
    }
  });

  it('陈旧降级上 DOM：本地还在跑但超时无更新 → data-stale + ×，状态行不再说谎', () => {
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      __resetSessionDockForTest();
      state.sessions = [];
      state.activeSessionId = 'cur';
      state.generatingSessionIds.clear();
      state.generatingSessionIds.add('dirty');
      renderDock();

      // 越过陈旧窗口重绘：dirty 仍脏在面板本地集合里，且没收到任何执行更新，
      // 后台权威集合也从未把它补回来（本例不打 QUERY_SESSION_RUNNING）
      vi.setSystemTime(1_700_000_000_000 + 91_000);
      renderDock();

      const dirty = document.querySelector('.session-dock-item[data-session-id="dirty"]');
      expect(dirty.getAttribute('data-stale')).toBe('true');
      expect(dirty.getAttribute('data-phase')).toBe('running');
      // 陈旧条目必须有可删入口，否则用户只能删会话或重开面板
      expect(dirty.querySelector('.session-dock-dismiss')).not.toBeNull();
      // 状态行不再说谎「正在执行」
      expect(dirty.querySelector('.session-dock-chip').getAttribute('aria-label'))
        .toContain('状态可能已失效');
    } finally {
      vi.useRealTimers();
    }
  });

  it('刚起不久的执行中不挂 data-stale、也不给 ×', () => {
    __resetSessionDockForTest();
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      state.sessions = [];
      state.activeSessionId = 'cur';
      state.generatingSessionIds.clear();
      state.generatingSessionIds.add('live');
      renderDock();
      const live = document.querySelector('.session-dock-item[data-session-id="live"]');
      expect(live.hasAttribute('data-stale')).toBe(false);
      expect(live.querySelector('.session-dock-dismiss')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });

  it('× 掉一个陈旧条目后不会下一帧复活', () => {
    __resetSessionDockForTest();
    vi.useFakeTimers({ now: 1_700_000_000_000 });
    try {
      state.sessions = [];
      state.activeSessionId = 'cur';
      state.generatingSessionIds.clear();
      state.generatingSessionIds.add('dirty');
      renderDock();
      vi.setSystemTime(1_700_000_000_000 + 95_000);
      renderDock();

      const dismiss = document.querySelector('.session-dock-item[data-session-id="dirty"] .session-dock-dismiss');
      expect(dismiss).not.toBeNull();
      dismiss.click();
      // 直接重绘（绕开去抖定时器）：dirty 仍脏在本地集合里，但不能复活
      renderDock();
      expect(document.querySelector('.session-dock-item[data-session-id="dirty"]')).toBeNull();
    } finally {
      vi.useRealTimers();
    }
  });
});

afterEach(() => {
  vi.useRealTimers();
  __resetSessionDockForTest();
  state.generatingSessionIds.clear();
  state.completedSessionIds.clear();
  state.activeSessionId = null;
  state.sessions = [];
});
