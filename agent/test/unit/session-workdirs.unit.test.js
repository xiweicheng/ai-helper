// agent/test/unit/session-workdirs.unit.test.js
// 会话级工作目录注册表单元测试：绑定/解绑/非法 id/并发写/过期与上限剪枝
// 运行：node --test agent/test/unit/session-workdirs.unit.test.js
import { test, describe, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  isValidSessionId,
  getBaseSessionId,
  pruneEntries,
  createSessionWorkdirStore,
  MAX_ENTRIES,
  MAX_AGE_DAYS,
} from '../../src/session-workdirs.js';

// ==================== 纯函数：会话 id 白名单 ====================

describe('isValidSessionId - 会话 id 格式白名单', () => {
  test('正常会话 id（时间戳 + 随机后缀）放行', () => {
    assert.equal(isValidSessionId('session_1729000000000_ab12cd'), true);
    assert.equal(isValidSessionId('a'), true);
    assert.equal(isValidSessionId('A-1_2'), true);
  });

  test('空值 / 非字符串拒绝', () => {
    assert.equal(isValidSessionId(''), false);
    assert.equal(isValidSessionId(null), false);
    assert.equal(isValidSessionId(undefined), false);
    assert.equal(isValidSessionId(123), false);
    assert.equal(isValidSessionId({}), false);
  });

  test('路径分隔符、空格、超长串、原型污染键拒绝', () => {
    assert.equal(isValidSessionId('../etc/passwd'), false);
    assert.equal(isValidSessionId('a/b'), false);
    assert.equal(isValidSessionId('a\\b'), false);
    assert.equal(isValidSessionId('a b'), false);
    assert.equal(isValidSessionId('__proto__'), true, '原型污染键本身符合字符集，靠 load 的 hasOwnProperty-free 白名单过滤');
    assert.equal(isValidSessionId('x'.repeat(65)), false);
    assert.equal(isValidSessionId('x'.repeat(64)), true);
  });
});

// ==================== 派生会话 → 主会话 ====================

describe('getBaseSessionId - 派生会话回落到主会话绑定', () => {
  test('普通会话原样返回', () => {
    assert.equal(getBaseSessionId('session_1729000000000_ab12cd'), 'session_1729000000000_ab12cd');
  });

  test('plan 子任务回落主会话', () => {
    assert.equal(getBaseSessionId('session_1_ab_subtask_0'), 'session_1_ab');
    assert.equal(getBaseSessionId('session_1_ab_subtask_12'), 'session_1_ab');
  });

  test('dispatch 子代理回落主会话', () => {
    assert.equal(getBaseSessionId('session_1_ab_sub_agent-x1'), 'session_1_ab');
  });

  test('后缀锚定在末尾才会被识别为派生会话', () => {
    // 正则以 $ 结尾锚定：只有末尾的 _subtask_ / _sub_ 才算派生后缀
    assert.equal(getBaseSessionId('session_ab_subtask_0'), 'session_ab');
    assert.equal(getBaseSessionId('session_ab_xsubtask_0'), 'session_ab_xsubtask_0');
  });

  test('非法入参返回 null', () => {
    assert.equal(getBaseSessionId(''), null);
    assert.equal(getBaseSessionId(null), null);
    assert.equal(getBaseSessionId('a/b_subtask_0'), null);
  });
});

// ==================== 纯函数：剪枝 ====================

describe('pruneEntries - 过期与上限剪枝', () => {
  const now = Date.UTC(2026, 0, 1);
  const dayMs = 24 * 60 * 60 * 1000;

  test('过期条目被剔除', () => {
    const entries = {
      fresh: { workdir: '/a', updatedAt: now - dayMs },
      expired: { workdir: '/b', updatedAt: now - (MAX_AGE_DAYS + 1) * dayMs },
    };
    const { kept, removed } = pruneEntries(entries, { now });
    assert.deepEqual(Object.keys(kept), ['fresh']);
    assert.equal(removed, 1);
  });

  test('超上限时保留最近更新的条目', () => {
    const entries = {};
    for (let i = 0; i < 5; i++) {
      entries[`s${i}`] = { workdir: `/p/${i}`, updatedAt: now - i * 1000 };
    }
    const { kept, removed } = pruneEntries(entries, { maxEntries: 3, now });
    assert.deepEqual(Object.keys(kept).sort(), ['s0', 's1', 's2']);
    assert.equal(removed, 2);
  });

  test('非法键与非法条目被剔除', () => {
    const entries = {
      'ok': { workdir: '/a', updatedAt: now },
      'bad/id': { workdir: '/b', updatedAt: now },
      noWorkdir: { updatedAt: now },
      emptyWorkdir: { workdir: '', updatedAt: now },
    };
    const { kept } = pruneEntries(entries, { now });
    assert.deepEqual(Object.keys(kept), ['ok']);
  });

  test('空注册表不抛错', () => {
    assert.deepEqual(pruneEntries(null, { now }), { kept: {}, removed: 0 });
  });

  test('maxEntries 默认取常量', () => {
    const entries = {};
    for (let i = 0; i < MAX_ENTRIES + 10; i++) {
      entries[`s${i}`] = { workdir: `/p/${i}`, updatedAt: now - i };
    }
    const { kept } = pruneEntries(entries, { now });
    assert.equal(Object.keys(kept).length, MAX_ENTRIES);
  });
});

// ==================== 实例：落盘 + 缓存 + 写锁 ====================

describe('createSessionWorkdirStore - 绑定/解绑/持久化/并发', () => {
  let dir;
  let store;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'aih-session-workdirs-'));
    store = createSessionWorkdirStore({ filePath: join(dir, 'session-workdirs.json') });
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  test('绑定后可读，且落盘为 { sessionId: { workdir, updatedAt } }', async () => {
    const entry = await store.bind('s1', '/proj/a');
    assert.equal(entry.workdir, '/proj/a');
    assert.equal(store.get('s1'), '/proj/a');

    const raw = JSON.parse(readFileSync(store.filePath, 'utf-8'));
    assert.equal(raw.s1.workdir, '/proj/a');
    assert.ok(raw.s1.updatedAt > 0);
  });

  test('未绑定 / 非法 id 返回 null', async () => {
    await store.bind('s1', '/proj/a');
    assert.equal(store.get('s2'), null);
    assert.equal(store.get('../../etc'), null);
  });

  test('非法 sessionId 绑定抛错，非法 workdir 抛错', async () => {
    await assert.rejects(() => store.bind('bad/id', '/proj/a'), /invalid_session_id/);
    await assert.rejects(() => store.bind('s1', ''), /invalid_workdir/);
    await assert.rejects(() => store.bind('s1', null), /invalid_workdir/);
  });

  test('重复绑定覆盖旧值', async () => {
    await store.bind('s1', '/proj/a');
    await store.bind('s1', '/proj/b');
    assert.equal(store.get('s1'), '/proj/b');
  });

  test('解绑后回到未绑定状态，重复解绑返回 false', async () => {
    await store.bind('s1', '/proj/a');
    assert.equal(await store.unbind('s1'), true);
    assert.equal(store.get('s1'), null);
    assert.equal(await store.unbind('s1'), false);
  });

  test('并行绑定互不覆盖（写锁串行化）', async () => {
    const ids = Array.from({ length: 20 }, (_, i) => `s${i}`);
    await Promise.all(ids.map((id) => store.bind(id, `/proj/${id}`)));
    for (const id of ids) {
      assert.equal(store.get(id), `/proj/${id}`, `${id} 的绑定不应被并发写覆盖`);
    }
  });

  test('外部改动通过 mtime 失效被重新读取', async () => {
    await store.bind('s1', '/proj/a');
    const file = store.filePath;
    const raw = JSON.parse(readFileSync(file, 'utf-8'));
    raw.s2 = { workdir: '/proj/c', updatedAt: Date.now() + 5000 };
    // 直接覆盖文件：mtime 变化应触发缓存失效
    writeFileSync(file, JSON.stringify(raw, null, 2));
    assert.equal(store.get('s2'), '/proj/c');
  });

  test('文件损坏时按空注册表处理，不炸进程', () => {
    writeFileSync(store.filePath, '{ not json');
    assert.equal(store.get('s1'), null);
    assert.ok(existsSync(store.filePath));
  });

  test('prune 按过期时间回收', async () => {
    await store.bind('s1', '/proj/a');
    const removed = await store.prune({ maxAgeDays: -1 });
    assert.equal(removed, 0, 'maxAgeDays<=0 视为不按时间过期');
    const removed2 = await store.prune({ maxAgeDays: 0, maxEntries: 0 });
    assert.equal(removed2, 0);
  });

  test('prune 按上限回收，保留最近绑定', async () => {
    const small = createSessionWorkdirStore({ filePath: store.filePath, maxEntries: 2 });
    await small.bind('s1', '/p/1');
    // updatedAt 精度为毫秒：间隔一下才能形成明确的"最近"次序
    await new Promise((r) => setTimeout(r, 5));
    await small.bind('s2', '/p/2');
    await new Promise((r) => setTimeout(r, 5));
    await small.bind('s3', '/p/3');
    assert.equal(small.get('s1'), null, '最旧的绑定被剪掉');
    assert.equal(small.get('s3'), '/p/3');
  });
});
