// detach-window-restore.unit.test.js - 脱离窗口状态恢复的容错行为
//
// 回归背景：扩展重载 / SW 终止瞬间，chrome.storage.local.get 可能以
// lastError='No SW' 失败（旧回调式实现中 result 为 undefined），旧代码直接读
// result._detachWindowId 抛 TypeError: Cannot read properties of undefined，
// 同时必然产生 Unchecked runtime.lastError 告警。
// 恢复逻辑必须容忍一切失败：静默降级为「无脱离窗口」。
import { describe, it, expect, vi } from 'vitest';
import { restoreDetachWindowId } from '../../src/background/detach-window.js';

function mockChrome({ getResult, getError, windowExists = true } = {}) {
  const get = vi.fn(() => (getError ? Promise.reject(getError) : Promise.resolve(getResult)));
  const remove = vi.fn(() => Promise.resolve());
  const winGet = vi.fn(() => (windowExists
    ? Promise.resolve({ id: 42 })
    : Promise.reject(new Error('No window with id: 42'))));
  globalThis.chrome = { storage: { local: { get, remove } }, windows: { get: winGet } };
  return { get, remove, winGet };
}

describe('restoreDetachWindowId', () => {
  it('有记录且窗口存在 → 返回 windowId', async () => {
    const { get, winGet } = mockChrome({ getResult: { _detachWindowId: 42 } });
    await expect(restoreDetachWindowId()).resolves.toBe(42);
    expect(get).toHaveBeenCalledWith('_detachWindowId');
    expect(winGet).toHaveBeenCalledWith(42);
  });

  it('无记录 → 返回 null', async () => {
    mockChrome({ getResult: {} });
    await expect(restoreDetachWindowId()).resolves.toBeNull();
  });

  it('storage 读取失败（No SW 竞态）→ 返回 null 不抛错、不产生未处理拒绝', async () => {
    mockChrome({ getError: new Error('No SW') });
    await expect(restoreDetachWindowId()).resolves.toBeNull();
  });

  it('storage 意外返回 undefined → 返回 null 不抛错（旧实现崩溃点）', async () => {
    mockChrome({ getResult: undefined });
    await expect(restoreDetachWindowId()).resolves.toBeNull();
  });

  it('窗口已销毁 → 返回 null 并清理残留记录', async () => {
    const { remove } = mockChrome({ getResult: { _detachWindowId: 42 }, windowExists: false });
    await expect(restoreDetachWindowId()).resolves.toBeNull();
    expect(remove).toHaveBeenCalledWith('_detachWindowId');
  });
});
