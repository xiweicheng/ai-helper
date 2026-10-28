// test/unit/workdir-scope.unit.test.js
// 会话级工作目录唯一解析入口的单测：目录解析、执行期冻结、路径收敛、展示名
//
// 重点守护两条硬要求：
//   1. 注入即对齐：任何目录取值都按「目标会话」解析，不读全局单例
//   2. 执行期隔离：并行会话 / 排队任务的执行目录在派发时冻结，切会话或改别的会话目录都不得影响它
import { describe, test, expect, vi, beforeEach, afterEach } from 'vitest';

const { getSession } = vi.hoisted(() => ({ getSession: vi.fn() }));

vi.mock('../../src/storage/db.js', () => ({
  getSession: (...args) => getSession(...args),
}));

import {
  resolveWorkdirForSession,
  getAgentDefaultWorkdir,
  invalidateDefaultWorkdir,
  beginSessionRun,
  endSessionRun,
  getSessionRunWorkdir,
  getEffectiveWorkdir,
  buildAgentScope,
  clearAllSessionRuns,
  normalizeScopePath,
  isPathInsideScope,
  resolveScopeCwd,
  formatWorkdirLabel,
  getBaseSessionId,
  encodeWorkdirHeaderValue,
  fetchWithTimeout,
} from '../../src/shared/workdir-scope.js';

const AGENT_ID = 'agent-1';
const DEFAULT_WORKDIR = '/agent/default-workdir';

/** 代理端 /api/status/detail 的最小响应 */
function stubAgent({ workdir = DEFAULT_WORKDIR } = {}) {
  globalThis.fetch = vi.fn(async () => ({
    ok: true,
    json: async () => ({
      success: true,
      workdir,
      defaultWorkdir: workdir,
      homeDir: '/home/u',
    }),
  }));
}

beforeEach(() => {
  clearAllSessionRuns();
  invalidateDefaultWorkdir();
  getSession.mockReset();
  getSession.mockResolvedValue(null);
  globalThis.chrome.storage.local.get = vi.fn(async () => ({
    // token 不带 enc: 前缀时 decodeSecret 原样返回，省去 base64 编解码
    pairedAgents: [{ id: AGENT_ID, url: 'http://127.0.0.1:9', token: 'plain-token' }],
    activeAgentId: AGENT_ID,
  }));
  stubAgent();
});

afterEach(() => {
  clearAllSessionRuns();
  delete globalThis.fetch;
});

// ==================== 会话解析 ====================

describe('resolveWorkdirForSession - 绑定 / 未绑定 / 代理不匹配', () => {
  test('未绑定会话：跟随代理默认目录', async () => {
    const resolved = await resolveWorkdirForSession('s1');
    expect(resolved).toEqual({
      workdir: DEFAULT_WORKDIR,
      scope: 'default',
      agentId: AGENT_ID,
      boundWorkdir: null,
    });
  });

  test('已绑定且代理匹配：用会话自己的目录', async () => {
    getSession.mockResolvedValue({ workdir: '/proj/a', workdirAgentId: AGENT_ID });
    const resolved = await resolveWorkdirForSession('s1');
    expect(resolved.workdir).toBe('/proj/a');
    expect(resolved.scope).toBe('session');
  });

  test('换过代理：绑定保留但当前回落默认目录', async () => {
    getSession.mockResolvedValue({ workdir: '/proj/a', workdirAgentId: 'another-agent' });
    const resolved = await resolveWorkdirForSession('s1');
    expect(resolved.workdir).toBe(DEFAULT_WORKDIR);
    expect(resolved.scope).toBe('default');
    // 原绑定仍在会话记录里，切回原代理还能生效
    expect(resolved.boundWorkdir).toBe('/proj/a');
  });

  test('派生会话（子任务/子代理）继承主会话绑定', async () => {
    getSession.mockImplementation(async (id) => (
      id === 's1' ? { workdir: '/proj/a', workdirAgentId: AGENT_ID } : null
    ));
    const resolved = await resolveWorkdirForSession('s1_subtask_0');
    expect(getSession).toHaveBeenCalledWith('s1');
    expect(resolved.workdir).toBe('/proj/a');
    expect(resolved.scope).toBe('session');
  });

  test('sessionId 为空时不读会话记录，直接取默认目录', async () => {
    const resolved = await resolveWorkdirForSession(null);
    expect(getSession).not.toHaveBeenCalled();
    expect(resolved.workdir).toBe(DEFAULT_WORKDIR);
  });

  test('代理端不可用时目录为空串，不抛错', async () => {
    chrome.storage.local.get = vi.fn(async () => ({ pairedAgents: [], activeAgentId: null }));
    const resolved = await resolveWorkdirForSession('s1');
    expect(resolved.workdir).toBe('');
    expect(resolved.scope).toBe('default');
    expect(resolved.agentId).toBe(null);
  });
});

describe('getAgentDefaultWorkdir - 默认目录缓存', () => {
  test('命中缓存不再发请求', async () => {
    await getAgentDefaultWorkdir();
    await getAgentDefaultWorkdir();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  test('invalidate 后重新拉取', async () => {
    await getAgentDefaultWorkdir();
    invalidateDefaultWorkdir();
    await getAgentDefaultWorkdir();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  test('请求失败回落缓存值', async () => {
    await getAgentDefaultWorkdir();
    invalidateDefaultWorkdir();
    globalThis.fetch = vi.fn(async () => { throw new Error('offline'); });
    // 缓存已清空，失败时没有兜底值
    expect(await getAgentDefaultWorkdir()).toBe(null);
  });
});

// ==================== 执行期冻结（核心回归） ====================

describe('执行期冻结 - 并行会话与会话切换隔离', () => {
  test('begin 冻结目录，记录随后被改也不影响本轮', async () => {
    getSession.mockResolvedValue({ workdir: '/proj/a', workdirAgentId: AGENT_ID });
    const frozen = await beginSessionRun('s1');
    expect(frozen).toBe('/proj/a');

    // 会话记录被改成别的目录（例如用户在面板上改了绑定）
    getSession.mockResolvedValue({ workdir: '/proj/other', workdirAgentId: AGENT_ID });
    expect(await getEffectiveWorkdir('s1')).toBe('/proj/a');
  });

  test('嵌套 begin 按引用计数释放：最外层才解除', async () => {
    getSession.mockResolvedValue({ workdir: '/proj/a', workdirAgentId: AGENT_ID });
    await beginSessionRun('s1');
    await beginSessionRun('s1'); // 子任务共用同一个 sessionId
    endSessionRun('s1');
    expect(getSessionRunWorkdir('s1')).toBe('/proj/a');
    endSessionRun('s1');
    expect(getSessionRunWorkdir('s1')).toBe(null);
  });

  test('切到另一个会话并改它的目录，不影响 A 的冻结值', async () => {
    getSession.mockImplementation(async (id) => (
      id === 's1'
        ? { workdir: '/proj/a', workdirAgentId: AGENT_ID }
        : { workdir: '/proj/b', workdirAgentId: AGENT_ID }
    ));
    await beginSessionRun('s1');
    // 面板切到 B 并按 B 的绑定解析（模拟「切走再改目录」）
    const bResolved = await resolveWorkdirForSession('s2');
    expect(bResolved.workdir).toBe('/proj/b');
    // A 仍在执行：它的下一次取值必须还是 /proj/a
    expect(await getEffectiveWorkdir('s1')).toBe('/proj/a');
    expect(await buildAgentScope('s1')).toEqual({ sessionId: 's1', workdir: '/proj/a' });
  });

  test('未冻结时按会话解析（排队任务出队后取所属会话目录）', async () => {
    getSession.mockImplementation(async (id) => (
      id === 's2' ? { workdir: '/proj/b', workdirAgentId: AGENT_ID } : null
    ));
    // 面板当前会话是 s1，但派发目标 s2 → 取值按 s2 的绑定
    expect(await getEffectiveWorkdir('s2')).toBe('/proj/b');
  });

  test('endSessionRun 对未冻结的会话是安全空操作', () => {
    expect(() => endSessionRun('nobody')).not.toThrow();
    expect(() => endSessionRun(null)).not.toThrow();
    expect(getSessionRunWorkdir(null)).toBe(null);
  });

  test('buildAgentScope(null) 返回 null（无会话不拼会话头）', async () => {
    expect(await buildAgentScope(null)).toBe(null);
  });
});

// ==================== 路径工具 ====================

describe('normalizeScopePath / isPathInsideScope / resolveScopeCwd', () => {
  test('消解 . 与 ..，统一分隔符', () => {
    expect(normalizeScopePath('a/./b/../c')).toBe('a/c');
    expect(normalizeScopePath('/a//b/')).toBe('/a/b');
    expect(normalizeScopePath('C:\\x\\..\\y')).toBe('C:/y');
    expect(normalizeScopePath('')).toBe('');
  });

  test('越界的 .. 在绝对路径上被吞掉（不会跳出根）', () => {
    expect(normalizeScopePath('/a/../../etc')).toBe('/etc');
  });

  test('isPathInsideScope：前缀按路径段比较，大小写不敏感', () => {
    expect(isPathInsideScope('/proj/a/b', '/proj/a')).toBe(true);
    expect(isPathInsideScope('/proj/a', '/proj/a')).toBe(true);
    expect(isPathInsideScope('/proj/abc', '/proj/a')).toBe(false);
    expect(isPathInsideScope('/Proj/A/b', '/proj/a')).toBe(true);
    expect(isPathInsideScope('', '/proj/a')).toBe(false);
  });

  test('resolveScopeCwd：缺省 / 相对 / 目录内绝对 / 越界绝对', () => {
    expect(resolveScopeCwd(undefined, '/root')).toEqual({ cwd: '/root', dropped: false, original: '' });
    expect(resolveScopeCwd('sub/dir', '/root')).toEqual({ cwd: '/root/sub/dir', dropped: false, original: 'sub/dir' });
    expect(resolveScopeCwd('/root/x', '/root')).toEqual({ cwd: '/root/x', dropped: false, original: '/root/x' });
    expect(resolveScopeCwd('/etc', '/root')).toEqual({ cwd: '/root', dropped: true, original: '/etc' });
  });

  test('resolveScopeCwd：没有冻结目录时原样返回', () => {
    expect(resolveScopeCwd('/etc', '')).toEqual({ cwd: '/etc', dropped: false, original: '/etc' });
  });
});

describe('formatWorkdirLabel - 信息带 chip 展示', () => {
  test('取末级目录名', () => {
    expect(formatWorkdirLabel('/a/b/c')).toBe('c');
    expect(formatWorkdirLabel('/a/b/c/')).toBe('c');
    expect(formatWorkdirLabel('C:\\a\\b')).toBe('b');
  });

  test('根路径回落完整路径', () => {
    expect(formatWorkdirLabel('/')).toBe('/');
    expect(formatWorkdirLabel('C:\\')).toBe('C:');
  });

  test('家目录前缀替换为 ~', () => {
    expect(formatWorkdirLabel('/home/u/proj', { homeDir: '/home/u' })).toBe('proj');
    expect(formatWorkdirLabel('/home/u', { homeDir: '/home/u' })).toBe('~');
  });

  test('空值返回空串', () => {
    expect(formatWorkdirLabel('')).toBe('');
    expect(formatWorkdirLabel(null)).toBe('');
  });
});

describe('getBaseSessionId - 扩展端派生会话识别', () => {
  test('子任务 / 子代理回落主会话', () => {
    expect(getBaseSessionId('s1_subtask_0')).toBe('s1');
    expect(getBaseSessionId('s1_sub_agent-x')).toBe('s1');
    expect(getBaseSessionId('s1')).toBe('s1');
    expect(getBaseSessionId(null)).toBe(null);
  });
});

describe('X-AIH-Workdir 请求头编码：非 ASCII 目录不能直塞 header', () => {
  test('中文目录编码后可由代理端 decodeURIComponent 原样还原', () => {
    const raw = '/Users/u/Documents/项目 A';
    const encoded = encodeWorkdirHeaderValue(raw);
    expect(encoded).not.toBe(raw);
    expect(decodeURIComponent(encoded)).toBe(raw);
    // 头值必须是 ByteString 安全的：原值含非 latin-1 字符，塞进 Headers 会抛 TypeError
    // （agentRequest 的 catch 会把它吞成「请求失败」，该会话所有 agent 读写全挂）
    expect(/^[\x20-\x7E]*$/.test(encoded)).toBe(true);
    if (typeof Headers === 'function') {
      expect(() => new Headers({ 'X-AIH-Workdir': encoded })).not.toThrow();
      expect(() => new Headers({ 'X-AIH-Workdir': raw })).toThrow();
    }
  });

  test('含 % 的目录也必须编码（否则代理端 decode 抛 URIError 并静默忽略声明）', () => {
    const raw = '/tmp/100%done';
    expect(encodeWorkdirHeaderValue(raw)).toBe('/tmp/100%25done');
    expect(decodeURIComponent(encodeWorkdirHeaderValue(raw))).toBe(raw);
  });

  test('纯 ASCII 路径保持原样（不改变既有冻结声明语义）', () => {
    expect(encodeWorkdirHeaderValue('/proj/a')).toBe('/proj/a');
  });

  test('空值返回 null（调用方据此不设头）', () => {
    expect(encodeWorkdirHeaderValue('')).toBeNull();
    expect(encodeWorkdirHeaderValue(null)).toBeNull();
    expect(encodeWorkdirHeaderValue(undefined)).toBeNull();
  });
});

describe('fetchWithTimeout：代理半挂时不能永久挂起', () => {
  test('超时按 AbortError 抛出，交给调用方各自的降级分支', async () => {
    globalThis.fetch = vi.fn((url, opts) => new Promise((resolve, reject) => {
      opts.signal.addEventListener('abort', () => {
        const err = new Error('aborted');
        err.name = 'AbortError';
        reject(err);
      });
    }));
    await expect(fetchWithTimeout('http://127.0.0.1:9/api/status/detail', {}, 20)).rejects.toMatchObject({ name: 'AbortError' });
  });
});
