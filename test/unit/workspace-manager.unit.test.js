// @vitest-environment jsdom
// workspace-manager 探测型请求失败降噪：代理不可达（fetch 网络失败）静默降级为 debug，
// 其他异常（如响应解析错误）保留 warn 便于诊断
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

vi.mock('../../src/shared/logger.js', () => ({
  default: { debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import logger from '../../src/shared/logger.js';
import {
  getWorkspaceRoot, getHomeDir, getAgentStatusDetail, resetWorkspaceRoot, getAgentConfig, pickDirectory,
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

// 回归钉：存储中的 token 以 enc: 混淆，getAgentConfig 必须解码为明文再签发请求，
// 否则代理端 verifyToken 比对 enc: 串必然 401（工作目录整套文件接口全部认证失败）
describe('getAgentConfig 对 enc: token 的解码（防鉴权头携带密文）', () => {
  const realFetch = globalThis.fetch;
  const encToken = 'enc:' + btoa('plain-secret-token');
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceRoot();
    globalThis.chrome.storage.local.get = vi.fn(async () => ({
      pairedAgents: [{ id: 'a1', name: 'P', url: 'http://127.0.0.1:9', token: encToken }],
      activeAgentId: 'a1',
    }));
    globalThis.fetch = vi.fn(async () => ({ ok: true, json: async () => ({ success: true, workdir: '/w' }) }));
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('返回明文 token（非 enc: 密文）', async () => {
    const config = await getAgentConfig();
    expect(config.token).toBe('plain-secret-token');
  });

  it('Authorization 头携带明文而非 enc: 密文', async () => {
    await getWorkspaceRoot();
    const headers = globalThis.fetch.mock.calls[0][1].headers;
    expect(headers.Authorization).toBe('Bearer plain-secret-token');
    expect(headers.Authorization).not.toContain('enc:');
  });
});

// 回归钉：旧版代理端没有 /api/config/pick-directory 端点，404 必须被识别为“版本过旧”，
// 否则用户只会看到“点了没反应/未知的 API 路径”，无法知道要去升级代理端
describe('pickDirectory 端点可用性与失败原因透传', () => {
  const realFetch = globalThis.fetch;
  beforeEach(() => {
    vi.clearAllMocks();
    resetWorkspaceRoot();
  });
  afterEach(() => {
    globalThis.fetch = realFetch;
  });

  it('HTTP 404（旧版代理端）→ outdated:true + available:false', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 404,
      json: async () => ({ success: false, error: '未知的 API 路径' }),
    }));
    const r = await pickDirectory();
    expect(r.success).toBe(false);
    expect(r.outdated).toBe(true);
    expect(r.available).toBe(false);
  });

  it('HTTP 200 选中路径 → 透传 path', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ success: true, path: '/Users/x/ws', available: true }),
    }));
    const r = await pickDirectory();
    expect(r.path).toBe('/Users/x/ws');
  });

  it('HTTP 200 失败（如 PowerShell 异常）→ 保留 available:true 与具体 error', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ success: false, path: null, available: true, exitCode: 1, error: 'TypeNotFound: Add-Type failed' }),
    }));
    const r = await pickDirectory();
    expect(r.available).toBe(true);
    expect(r.outdated).toBeUndefined();
    expect(r.error).toContain('Add-Type failed');
  });

  it('请求携带 AbortSignal：agent 端整体无响应时按钮不会永久停在“等待选择…”', async () => {
    globalThis.fetch = vi.fn(async () => ({
      status: 200,
      json: async () => ({ success: true, path: '/a', available: true }),
    }));
    await pickDirectory();
    expect(globalThis.fetch.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it('扩展端超时（AbortError）→ client-timeout，交由 UI 提示后重试', async () => {
    const abortErr = new Error('The operation was aborted.');
    abortErr.name = 'AbortError';
    globalThis.fetch = vi.fn(async () => { throw abortErr; });
    const r = await pickDirectory();
    expect(r.success).toBe(false);
    expect(r.available).toBe(true);
    expect(r.error).toBe('client-timeout');
  });

  it('响应体不是对象（网关/代理返回异常内容）→ bad-response，不抛异常', async () => {
    globalThis.fetch = vi.fn(async () => ({ status: 200, json: async () => null }));
    const r = await pickDirectory();
    expect(r.success).toBe(false);
    expect(r.error).toBe('bad-response');
  });
});
