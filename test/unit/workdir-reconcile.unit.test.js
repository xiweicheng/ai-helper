// test/unit/workdir-reconcile.unit.test.js
// 目录漂移自愈的重试语义（评审 P2-2）：
//   动作失败不能被记成「已修复」，否则一次瞬时失败会让该会话在整个面板生命周期内
//   再也不修（表现为 chip 一直显示默认目录）；探测结论又要短期缓存，避免 chip 每次
//   刷新（切会话/切模型/水合）都重打一次 /api/status/detail。
import { describe, test, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  fetchWithTimeout: vi.fn(),
  getProxyAgentConfig: vi.fn(),
  resolveWorkdirForSession: vi.fn(),
  unbindSessionWorkdirRemote: vi.fn(),
  setSessionWorkdirBinding: vi.fn(),
}));

vi.mock('../../src/shared/workdir-scope.js', () => ({
  fetchWithTimeout: (...a) => h.fetchWithTimeout(...a),
  // 与真实实现同正则：派生会话回落到主会话
  getBaseSessionId: (sid) => {
    if (!sid) return null;
    const base = String(sid).replace(/(_subtask_[A-Za-z0-9_-]+|_sub_[A-Za-z0-9_-]+)$/, '');
    return base || null;
  },
  getProxyAgentConfig: (...a) => h.getProxyAgentConfig(...a),
  resolveWorkdirForSession: (...a) => h.resolveWorkdirForSession(...a),
  unbindSessionWorkdirRemote: (...a) => h.unbindSessionWorkdirRemote(...a),
}));

vi.mock('../../src/storage/session-store.js', () => ({
  setSessionWorkdirBinding: (...a) => h.setSessionWorkdirBinding(...a),
}));

import { reconcileSessionWorkdir, resetWorkdirReconcileState } from '../../src/side_panel/workdir-reconcile.js';

const BASE = 's1';
const BOUND = '/proj/bound';

/** 代理端 detail：注册表里还留着这条会话的旧绑定 */
function stubDetail(overrides = {}) {
  h.fetchWithTimeout.mockResolvedValue({
    ok: true,
    json: async () => ({
      success: true,
      sessionWorkdirSupported: true,
      sessionWorkdir: BOUND,
      defaultWorkdir: '/agent/default',
      ...overrides,
    }),
  });
}

beforeEach(() => {
  resetWorkdirReconcileState();
  h.fetchWithTimeout.mockReset();
  h.getProxyAgentConfig.mockReset();
  h.resolveWorkdirForSession.mockReset();
  h.unbindSessionWorkdirRemote.mockReset();
  h.setSessionWorkdirBinding.mockReset();
  h.getProxyAgentConfig.mockResolvedValue({ id: 'agent-1', url: 'http://127.0.0.1:9', token: 't' });
  h.setSessionWorkdirBinding.mockResolvedValue(true);
  h.unbindSessionWorkdirRemote.mockResolvedValue({ success: true });
  stubDetail();
});

describe('目录漂移自愈：动作失败必须可重试', () => {
  test('恢复绑定写库失败 → 不记账，下次仍会重试', async () => {
    h.resolveWorkdirForSession.mockResolvedValue({ scope: 'default', boundWorkdir: null, agentId: 'agent-1' });
    h.setSessionWorkdirBinding.mockResolvedValueOnce(false);

    expect(await reconcileSessionWorkdir(BASE)).toBeNull();
    expect(await reconcileSessionWorkdir(BASE)).toEqual({ adopted: true, workdir: BOUND });
    expect(h.setSessionWorkdirBinding).toHaveBeenCalledTimes(2);
  });

  test('恢复成功 → 记账，之后不再重复探测', async () => {
    h.resolveWorkdirForSession.mockResolvedValue({ scope: 'default', boundWorkdir: null, agentId: 'agent-1' });

    expect(await reconcileSessionWorkdir(BASE)).toEqual({ adopted: true, workdir: BOUND });
    h.fetchWithTimeout.mockClear();
    expect(await reconcileSessionWorkdir(BASE)).toBeNull();
    expect(h.fetchWithTimeout).not.toHaveBeenCalled();
  });

  test('解绑失败（代理 500/离线）→ 不能当成功，下次仍会重试', async () => {
    h.resolveWorkdirForSession.mockResolvedValue({ scope: 'default', boundWorkdir: '/proj/other', agentId: 'agent-2' });
    h.unbindSessionWorkdirRemote.mockResolvedValueOnce(null);

    expect(await reconcileSessionWorkdir(BASE)).toBeNull();
    expect(await reconcileSessionWorkdir(BASE)).toEqual({ cleaned: true, workdir: BOUND });
    expect(h.unbindSessionWorkdirRemote).toHaveBeenCalledTimes(2);
  });

  test('两侧已一致 → 结论缓存期内不重复探测', async () => {
    h.resolveWorkdirForSession.mockResolvedValue({ scope: 'session', boundWorkdir: BOUND, agentId: 'agent-1' });

    expect(await reconcileSessionWorkdir(BASE)).toBeNull();
    expect(await reconcileSessionWorkdir(BASE)).toBeNull();
    expect(h.fetchWithTimeout).toHaveBeenCalledTimes(1);
  });

  test('注册表没有绑定 → 无需修复，也不做后续解析', async () => {
    stubDetail({ sessionWorkdir: null });
    expect(await reconcileSessionWorkdir(BASE)).toBeNull();
    expect(h.resolveWorkdirForSession).not.toHaveBeenCalled();
  });

  test('resetWorkdirReconcileState 清空结论缓存（切代理后可重新探测）', async () => {
    h.resolveWorkdirForSession.mockResolvedValue({ scope: 'session', boundWorkdir: BOUND, agentId: 'agent-1' });
    await reconcileSessionWorkdir(BASE);
    resetWorkdirReconcileState();
    await reconcileSessionWorkdir(BASE);
    expect(h.fetchWithTimeout).toHaveBeenCalledTimes(2);
  });
});
