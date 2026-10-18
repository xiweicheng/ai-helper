// @vitest-environment jsdom
/**
 * theme.js 单元测试：三态偏好、持久化、system 跟随、跨页同步
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

function mockStorage(initial = {}) {
  const data = { ...initial };
  const listeners = [];
  globalThis.chrome = {
    storage: {
      local: {
        get: vi.fn((keys, cb) => {
          const out = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((k) => {
            if (k in data) out[k] = data[k];
          });
          if (cb) return cb(out);
          return Promise.resolve(out);
        }),
        set: vi.fn((obj, cb) => {
          Object.assign(data, obj);
          if (cb) cb();
          return Promise.resolve();
        })
      },
      onChanged: { addListener: (cb) => listeners.push(cb) }
    }
  };
  return { data, listeners };
}

describe('theme.js', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.documentElement.removeAttribute('data-theme');
    localStorage.clear();
  });

  it('默认 light 且写入 data-theme=light', async () => {
    mockStorage({});
    const { initTheme, getResolvedTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    expect(getResolvedTheme()).toBe('light');
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');
  });

  it('setTheme(dark) 落盘 appTheme 并翻转属性', async () => {
    mockStorage({});
    const { initTheme, setTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    await setTheme('dark');
    expect(chrome.storage.local.set).toHaveBeenCalledWith({ appTheme: 'dark' }, expect.any(Function));
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(localStorage.getItem('appThemeResolved')).toBe('dark');
  });

  it('system 偏好按 prefers-color-scheme 解析并订阅变化', async () => {
    mockStorage({ appTheme: 'system' });
    let mqHandler = null;
    const mq = {
      matches: true,
      addEventListener: (t, cb) => { mqHandler = cb; },
      removeEventListener: () => {}
    };
    vi.stubGlobal('matchMedia', (q) => {
      expect(q).toContain('prefers-color-scheme');
      return mq;
    });
    const { initTheme, getResolvedTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    expect(getResolvedTheme()).toBe('dark');
    mq.matches = false;
    mqHandler && mqHandler();
    expect(getResolvedTheme()).toBe('light');
  });

  it('storage.onChanged 跨页同步翻转', async () => {
    const s = mockStorage({});
    const { initTheme, getResolvedTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    const listener = s.listeners[0];
    listener({ appTheme: { newValue: 'dark' } }, 'local');
    expect(getResolvedTheme()).toBe('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('模块顶层立即应用 localStorage 镜像（防闪烁）', async () => {
    localStorage.setItem('appThemeResolved', 'dark');
    mockStorage({});
    await import('../../src/shared/theme.js');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('非法偏好值回退 light，setTheme 拒绝非法值', async () => {
    mockStorage({ appTheme: 'blue' });
    const { initTheme, getTheme, setTheme } = await import('../../src/shared/theme.js');
    await initTheme();
    expect(getTheme()).toBe('light');
    await setTheme('sepia');
    expect(getTheme()).toBe('light');
  });
});
