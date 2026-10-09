// @vitest-environment jsdom
// workspace-manager 探测型请求失败降噪：代理不可达（fetch 网络失败）静默降级为 debug，
// 其他异常（如响应解析错误）保留 warn 便于诊断
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/shared/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import logger from '../../src/shared/logger.js';
import {
  getWorkspaceRoot, getHomeDir, getAgentStatusDetail, resetWorkspaceRoot,
} from '../../src/side_panel/workspace-manager.js';

globalThis.chrome = {
  storage: {
    local: {
      get: vi.fn(async () => ({
        pairedAgents: [{ id: 'a1', name: 'Probe', url: 'http://127.0.0.1:9', token: 't' }],
        activeAgentId: 'a1',
      })),
      set: vi.fn(async () => {}),
    },
  },
};

describe('探测型请求失败降噪（代理不可达 → debug 降级）', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceRoot();
    globalThis.fetch = vi.fn();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('TypeError（Failed to fetch）：getWorkspaceRoot 静默返回 null，warn 不触发', async () => {
    globalThis.fetch.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(getWorkspaceRoot()).resolves.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledWith(
      '[WorkspaceManager] get workingdirectory skipped (agent unreachable):', 'Failed to fetch');
  });

  it('跨浏览器文案（Load failed / NetworkError）：家目录与状态详情同样静默降级', async () => {
    globalThis.fetch.mockRejectedValue(new Error('Load failed'));
    await expect(getHomeDir()).resolves.toBeNull();
    globalThis.fetch.mockRejectedValue(new Error('NetworkError when attempting to fetch resource.'));
    await expect(getAgentStatusDetail()).resolves.toBeNull();
    expect(logger.warn).not.toHaveBeenCalled();
    expect(logger.debug).toHaveBeenCalledTimes(2);
  });

  it('非网络异常（响应解析失败）：返回 null 且保留 warn 便于诊断', async () => {
    globalThis.fetch.mockResolvedValue({
      ok: true,
      json: async () => { throw new SyntaxError('Unexpected token < in JSON at position 0'); },
    });
    await expect(getWorkspaceRoot()).resolves.toBeNull();
    expect(logger.warn).toHaveBeenCalledWith(
      '[WorkspaceManager] get workingdirectory failed:', 'Unexpected token < in JSON at position 0');
    expect(logger.debug).not.toHaveBeenCalled();
  });
});
