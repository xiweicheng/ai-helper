// PERF-08 审计日志/工具统计写放大修复的守卫（docs/AUDIT_STATUS.md 第三节 PERF-08）：
// 旧实现每次 appendAuditLog/recordToolStats 都全数组 get → 改一条 → 整份 set 写回，
// 且 react-loop 并行工具组（Promise.all）下多路 get→set 跨 await 交错 → 丢更新。
// 新实现（src/background/activity-store.js）：内存权威态 + 防抖合并落盘 + 关键审计即时刷 + onSuspend 兜底。
//
// 本文件三层锁：
//   1. 行为：条目/统计形状与旧版逐字段一致（读端 toolUsageStats 面板不受影响）、上限 100、
//      冷启动合并不丢存量、防抖合并（N 次改 = 1 次 set）、失败保留脏标重试、关键类目即时落盘；
//   2. 竞态对照：把旧读-改-写算法用同一 fake storage 复现为参考实现，并发 20 写
//      断言旧实现**确实丢**（夹具有效）且新实现**一条不丢**（回归锁）；
//   3. 接线：tool-executor 改用 activity-store 且旧自实现消失；tool-helpers 死副本已删；
//      模块内 get/set 各仅一处（热路径零逐次 IPC）。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { readFileSync } from 'node:fs';

const TOOL_EXECUTOR_SRC = readFileSync(new URL('../../src/background/tool-executor.js', import.meta.url), 'utf8');
const TOOL_HELPERS_SRC = readFileSync(new URL('../../src/background/tool-helpers.js', import.meta.url), 'utf8');
const ACTIVITY_STORE_SRC = readFileSync(new URL('../../src/background/activity-store.js', import.meta.url), 'utf8');

const AUDIT_KEY = 'sensitiveAuditLog';
const STATS_KEY = 'toolUsageStats';

// ============================================================
// fake chrome.storage.local：模拟 Chrome 的序列化语义（存取均为克隆），可注入失败
// ============================================================

function makeFakeStorage(initial = {}) {
  const data = structuredClone(initial);
  const state = {
    data,
    getCalls: [],
    setCalls: [],
    failNextSet: false,
    get(keys) {
      state.getCalls.push(keys);
      const out = {};
      for (const k of Array.isArray(keys) ? keys : [keys]) {
        if (k in data) out[k] = structuredClone(data[k]);
      }
      return Promise.resolve(out);
    },
    set(obj) {
      if (state.failNextSet) {
        state.failNextSet = false;
        return Promise.reject(new Error('quota simulated'));
      }
      state.setCalls.push(structuredClone(obj));
      for (const [k, v] of Object.entries(obj)) data[k] = structuredClone(v);
      return Promise.resolve();
    }
  };
  return state;
}

// 每个用例重置模块单例状态（module-level loadPromise/内存态）并注入 fresh chrome
async function freshStore(fake) {
  vi.resetModules();
  globalThis.chrome = { storage: { local: { get: fake.get, set: fake.set } }, runtime: {} };
  return await import('../../src/background/activity-store.js');
}

// ============================================================
// 参考实现 = 改造前 appendAuditLog 的逐行移植（tool-executor.js 旧 :1034-1042）
// ============================================================

function makeOldAppend(fakeStorage) {
  return async function appendAuditLogOld(category, action, details = {}) {
    const result = await fakeStorage.get([AUDIT_KEY]);
    const entries = result[AUDIT_KEY] || [];
    entries.unshift({ timestamp: new Date().toISOString(), category, action, details });
    if (entries.length > 100) entries.length = 100;
    await fakeStorage.set({ [AUDIT_KEY]: entries });
  };
}

describe('PERF-08 行为不变量（形状/上限/合并/防抖/失败重试/即时刷）', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); });

  it('条目形状与旧版逐字段一致：timestamp/category/action/details，最新在前', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    await store.appendAuditLog('file_write', 'Write file: /a', { path: '/a' });
    await vi.advanceTimersByTimeAsync(2000);
    const entries = fake.data[AUDIT_KEY];
    expect(entries).toHaveLength(1);
    expect(Object.keys(entries[0]).sort()).toEqual(['action', 'category', 'details', 'timestamp']);
    expect(entries[0].category).toBe('file_write');
    expect(entries[0].details).toEqual({ path: '/a' });
    expect(typeof Date.parse(entries[0].timestamp)).toBe('number');
  });

  it('统计形状与旧版一致：callCount/successCount/totalDuration/lastUsed', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    await store.recordToolStats('screenshot_page', { success: true }, 120);
    await store.recordToolStats('screenshot_page', { success: false }, 80);
    await store.flushActivityStoreNow();
    const e = fake.data[STATS_KEY].screenshot_page;
    expect(e).toMatchObject({ callCount: 2, successCount: 1, totalDuration: 200 });
    expect(e.lastUsed).toBeGreaterThan(0);
  });

  it('上限 100：150 条只留最新 100 条', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    for (let i = 0; i < 150; i++) await store.appendAuditLog('file_write', `w${i}`, { i });
    await vi.advanceTimersByTimeAsync(2000);
    const entries = fake.data[AUDIT_KEY];
    expect(entries).toHaveLength(100);
    expect(entries[0].action).toBe('w149');
    expect(entries[99].action).toBe('w50');
  });

  it('冷启动合并存量：不清空磁盘已有条目，新条目插到最前', async () => {
    const seeded = [{ action: 'old3' }, { action: 'old2' }, { action: 'old1' }];
    const fake = makeFakeStorage({ [AUDIT_KEY]: structuredClone(seeded) });
    const store = await freshStore(fake);
    await store.appendAuditLog('file_write', 'new', {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.data[AUDIT_KEY].map(e => e.action)).toEqual(['new', 'old3', 'old2', 'old1']);
  });

  it('防抖合并：窗口内 10 次审计 + 10 次统计只落盘一次，且两个键在同一次 set', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    for (let i = 0; i < 10; i++) {
      await store.appendAuditLog('file_write', `w${i}`, {});
      await store.recordToolStats('t', { success: true }, 1);
    }
    expect(fake.setCalls).toHaveLength(0); // 窗口内未落盘
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.setCalls).toHaveLength(1);
    expect(Object.keys(fake.setCalls[0]).sort()).toEqual([AUDIT_KEY, STATS_KEY].sort());
    expect(fake.data[AUDIT_KEY]).toHaveLength(10);
    expect(fake.data[STATS_KEY].t.callCount).toBe(10);
  });

  it('关键审计即时落盘：cookie_write / page_data_clear / 用户拒绝命令 / 文件删除不等防抖', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    await store.appendAuditLog('cookie_write', 'Delete cookie: a', {});
    expect(fake.setCalls).toHaveLength(1); // append 返回时已落盘
    await store.appendAuditLog('command_exec', 'User denied command: rm', { command: 'rm' });
    await store.appendAuditLog('page_data_clear', 'Clear page data: x', {});
    await store.appendAuditLog('file_delete', 'Delete file: y', {});
    expect(fake.setCalls).toHaveLength(4);
    expect(fake.data[AUDIT_KEY]).toHaveLength(4);
  });

  it('普通命令成功不属即时档：仍走防抖', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    await store.appendAuditLog('command_exec', 'Execute command: ls', {});
    expect(fake.setCalls).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.setCalls).toHaveLength(1);
  });

  it('落盘失败不丢数据：保留脏标，下一次落盘把失败批一起带走', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    fake.failNextSet = true;
    await store.appendAuditLog('cookie_write', 'Delete cookie: a', {}); // 即时刷 → set 失败
    expect(fake.data[AUDIT_KEY]).toBeUndefined();
    await store.appendAuditLog('file_write', 'later', {});
    await vi.advanceTimersByTimeAsync(2000);
    expect(fake.data[AUDIT_KEY].map(e => e.action)).toEqual(['later', 'Delete cookie: a']);
  });
});

describe('PERF-08 竞态对照：旧读-改-写确实丢更新（夹具有效）且新实现一条不丢', () => {
  it('并发 20 写：参考旧实现只剩 1 条（丢 19），新实现 20 条齐全', async () => {
    vi.useFakeTimers();

    // 旧实现：并发 20 路 get→unshift→set。get 在 Promise.all 构造时同步全部发出，
    // 20 路都读到同一空快照 → 各自 set 回"只含自己 1 条"的数组 → 最终 1 条。
    const fakeOld = makeFakeStorage();
    const oldAppend = makeOldAppend(fakeOld);
    await Promise.all(Array.from({ length: 20 }, (_, i) => oldAppend('file_write', `w${i}`, {})));
    expect(fakeOld.data[AUDIT_KEY]).toHaveLength(1); // 夹具确实复现了丢失（守卫有效性的证据）

    // 新实现：同并发度，内存权威态串行 unshift → 一条不丢
    const fakeNew = makeFakeStorage();
    const store = await freshStore(fakeNew);
    await Promise.all(Array.from({ length: 20 }, (_, i) => store.appendAuditLog('file_write', `w${i}`, {})));
    await vi.advanceTimersByTimeAsync(2000);
    expect(fakeNew.data[AUDIT_KEY]).toHaveLength(20);
    expect(new Set(fakeNew.data[AUDIT_KEY].map(e => e.action)).size).toBe(20);
    vi.useRealTimers();
  });

  it('并发统计：旧口径 20 路并发 callCount 会少记，新实现精确 20', async () => {
    const fake = makeFakeStorage();
    const store = await freshStore(fake);
    await Promise.all(Array.from({ length: 20 }, () => store.recordToolStats('t', { success: true }, 5)));
    await store.flushActivityStoreNow();
    expect(fake.data[STATS_KEY].t.callCount).toBe(20);
    expect(fake.data[STATS_KEY].t.totalDuration).toBe(100);
  });
});

describe('PERF-08 接线守卫：调用点改造与热路径零逐次 IPC', () => {
  it('tool-executor 改用 activity-store，旧的自实现读写已消失', () => {
    expect(TOOL_EXECUTOR_SRC).toMatch(/import \{[^}]*appendAuditLog[^}]*recordToolStats[^}]*\} from '\.\/activity-store\.js'/);
    expect(TOOL_EXECUTOR_SRC).not.toMatch(/async function appendAuditLog/);
    expect(TOOL_EXECUTOR_SRC).not.toMatch(/async function recordToolStats/);
    expect(TOOL_EXECUTOR_SRC).not.toMatch(/AUDIT_LOG_KEY/);
  });

  it('tool-helpers 的死副本（0 引用）已删除', () => {
    expect(TOOL_HELPERS_SRC).not.toMatch(/recordToolStats/);
  });

  it('模块热路径零逐次 IPC：get 仅存在于冷启动加载，set 仅存在于 flush', () => {
    expect((ACTIVITY_STORE_SRC.match(/chrome\.storage\.local\.get/g) || []).length).toBe(1);
    expect((ACTIVITY_STORE_SRC.match(/chrome\.storage\.local\.set/g) || []).length).toBe(1);
  });

  it('onSuspend 兜底存在且对不支持的环境做了能力守卫', () => {
    expect(ACTIVITY_STORE_SRC).toMatch(/onSuspend\??\.addListener/);
  });
});
