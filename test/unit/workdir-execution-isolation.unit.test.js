// test/unit/workdir-execution-isolation.unit.test.js
// 执行期隔离的端到端回归（计划 §2 / §12 核心）：
//   会话 A 正在执行并冻结了目录，切到 B 把 B 的目录改掉之后，
//   A 的下一次 agent_exec 请求头里仍然必须带 A 的目录，B 只影响 B。
//
// 断言落在真正的请求头（X-AIH-Session-Id / X-AIH-Workdir）上，
// 而不是只在解析函数内部打转：请求头是代理端做权限校验的唯一输入，
// 它一旦串了会话，权限校验就会以别的会话的目录为基准。
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../../src/storage/db.js', () => ({
  getSession: (...args) => getSession(...args),
}));

import { execCommand, execCommandWait } from '../../src/background/local-agent-client.js';
import {
  beginSessionRun,
  endSessionRun,
  clearAllSessionRuns,
  invalidateDefaultWorkdir,
} from '../../src/shared/workdir-scope.js';

const AGENT_ID = 'agent-1';
const DEFAULT_WORKDIR = '/agent/default-workdir';

/** 记录每次 fetch 的 url / body / headers */
let calls = [];

function stubFetch({ workdir = DEFAULT_WORKDIR } = {}) {
  calls = [];
  globalThis.fetch = vi.fn(async (url, options = {}) => {
    calls.push({ url, body: options.body ? JSON.parse(options.body) : null, headers: options.headers || {} });
    if (String(url).includes('/api/exec')) {
      return { ok: true, status: 200, json: async () => ({ success: true, execId: 'e1' }) };
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({ success: true, workdir, defaultWorkdir: workdir, homeDir: '/home/u' }),
    };
  });
}

/** 会话绑定表：改动这里就等价于「用户改了某个会话的工作目录」 */
let bindings = {};

function setBinding(sessionId, workdir) {
  if (workdir) bindings[sessionId] = { workdir, workdirAgentId: AGENT_ID };
  else delete bindings[sessionId];
}

/** 最后一次 /api/exec 请求 */
function lastExec() {
  const execs = calls.filter((c) => String(c.url).includes('/api/exec'));
  return execs[execs.length - 1];
}

beforeEach(() => {
  clearAllSessionRuns();
  invalidateDefaultWorkdir();
  bindings = {};
  getSession.mockReset();
  getSession.mockImplementation(async (id) => bindings[id] || null);
  globalThis.chrome.storage.local.get = vi.fn(async () => ({
    // token 不带 enc: 前缀时 decodeSecret 原样返回
    pairedAgents: [{ id: AGENT_ID, url: 'http://127.0.0.1:9', token: 'plain-token' }],
    activeAgentId: AGENT_ID,
  }));
  stubFetch();
});

afterEach(() => {
  clearAllSessionRuns();
  delete globalThis.fetch;
});

describe('执行期隔离：改别的会话目录不影响正在执行的会话', () => {
  test('A 执行中，切到 B 并改 B 的目录后，A 的 agent_exec 仍带 A 的目录', async () => {
    setBinding('s1', '/proj/a');
    setBinding('s2', '/proj/b');

    // 会话 A 开始执行：目录在派发时冻结
    expect(await beginSessionRun('s1')).toBe('/proj/a');

    await execCommand('pwd', undefined, false, 1000, 's1');
    expect(lastExec().headers['X-AIH-Session-Id']).toBe('s1');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/a');

    // 用户切到会话 B，并把 B 的目录改成 /proj/b2
    setBinding('s2', '/proj/b2');
    await execCommand('pwd', undefined, false, 1000, 's2');
    expect(lastExec().headers['X-AIH-Session-Id']).toBe('s2');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/b2');

    // 回到 A 的下一轮请求：目录仍是 A 的冻结值，B 的改动没有渗透过来
    await execCommand('ls', 'sub', false, 1000, 's1');
    const a2 = lastExec();
    expect(a2.headers['X-AIH-Session-Id']).toBe('s1');
    expect(a2.headers['X-AIH-Workdir']).toBe('/proj/a');
    // cwd 原样透传（相对路径由代理端按会话有效目录解析），不被会话切换污染
    expect(a2.body.cwd).toBe('sub');

    endSessionRun('s1');
  });

  test('A 冻结期间即使 A 自己的绑定被改，本轮仍用冻结值（下一轮才生效）', async () => {
    setBinding('s1', '/proj/a');
    await beginSessionRun('s1');

    // 面板上把 A 的绑定改成 /proj/a2（运行中拦截是 UI 责任，这里模拟记录被写坏的情况）
    setBinding('s1', '/proj/a2');
    await execCommandWait('pwd', undefined, false, 1000, 's1');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/a');

    // 任务结束后解除冻结，新一轮才按最新绑定
    endSessionRun('s1');
    await execCommandWait('pwd', undefined, false, 1000, 's1');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/a2');
  });

  test('排队任务出队时取所属会话的目录，而不是面板当前会话', async () => {
    setBinding('s1', '/proj/a');
    setBinding('s2', '/proj/b');

    // 面板当前会话是 s1（无冻结），但队列派发目标是 s2
    await execCommand('pwd', undefined, false, 1000, 's2');
    expect(lastExec().headers['X-AIH-Session-Id']).toBe('s2');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/b');
  });

  test('派发队列任务时才冻结：出队后即使用户改该会话目录，任务仍用出队时目录', async () => {
    setBinding('s2', '/proj/b');
    // 队列出队 → 任务开始，冻结
    expect(await beginSessionRun('s2')).toBe('/proj/b');
    // 用户在任务执行中改 s2 的绑定
    setBinding('s2', '/proj/b-new');
    await execCommand('pwd', undefined, false, 1000, 's2');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/b');
    endSessionRun('s2');
  });

  test('多个会话并行执行时各自的请求头互不串用', async () => {
    setBinding('s1', '/proj/a');
    setBinding('s2', '/proj/b');
    await beginSessionRun('s1');
    await beginSessionRun('s2');

    await execCommand('pwd', undefined, false, 1000, 's1');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/a');
    await execCommand('pwd', undefined, false, 1000, 's2');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/b');
    await execCommand('pwd', undefined, false, 1000, 's1');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/a');

    endSessionRun('s1');
    endSessionRun('s2');
  });

  test('子任务/子代理会话继承主会话的冻结目录', async () => {
    setBinding('s1', '/proj/a');
    await beginSessionRun('s1');

    // 子任务用派生 sessionId，但目录必须与主会话一致
    await execCommand('pwd', undefined, false, 1000, 's1_subtask_0');
    expect(lastExec().headers['X-AIH-Workdir']).toBe('/proj/a');

    endSessionRun('s1');
  });

  test('未绑定会话跟随代理默认目录，且不写死到请求里以外的地方', async () => {
    await execCommand('pwd', undefined, false, 1000, 's3');
    expect(lastExec().headers['X-AIH-Session-Id']).toBe('s3');
    expect(lastExec().headers['X-AIH-Workdir']).toBe(DEFAULT_WORKDIR);
  });

  test('无会话上下文的请求不带会话头（管理类接口保持原样）', async () => {
    await execCommand('pwd', undefined, false, 1000, null);
    const call = lastExec();
    expect(call.headers['X-AIH-Session-Id']).toBeUndefined();
    expect(call.headers['X-AIH-Workdir']).toBeUndefined();
  });
});
