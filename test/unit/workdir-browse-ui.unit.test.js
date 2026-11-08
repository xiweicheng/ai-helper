// @vitest-environment jsdom
// 阶段 1：内置目录浏览器视图 + 弹窗接线守卫
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  buildBreadcrumbSegments,
  browseErrorTextKey,
  createWorkdirBrowserView,
} from '../../src/side_panel/workdir-browser.js';

const read = (relativePath) => readFileSync(resolve(process.cwd(), relativePath), 'utf8');
const t = (key) => key;
const flush = () => new Promise((r) => setTimeout(r, 0));

describe('buildBreadcrumbSegments', () => {
  it('Windows 路径按层级拆分', () => {
    expect(buildBreadcrumbSegments('C:\\Users\\me', 'win32')).toEqual([
      { name: 'C:', path: 'C:\\' },
      { name: 'Users', path: 'C:\\Users' },
      { name: 'me', path: 'C:\\Users\\me' },
    ]);
  });

  it('Windows 盘符根与 POSIX 根都能单独成段', () => {
    expect(buildBreadcrumbSegments('C:\\', 'win32')).toEqual([{ name: 'C:', path: 'C:\\' }]);
    expect(buildBreadcrumbSegments('/', 'darwin')).toEqual([{ name: '/', path: '/' }]);
    expect(buildBreadcrumbSegments('/Users/me', 'darwin')).toEqual([
      { name: '/', path: '/' },
      { name: 'Users', path: '/Users' },
      { name: 'me', path: '/Users/me' },
    ]);
  });

  it('UNC 不拆分（无法可靠逐级下钻）', () => {
    expect(buildBreadcrumbSegments('\\\\server\\share\\docs', 'win32')).toEqual([
      { name: '\\\\server\\share\\docs', path: '\\\\server\\share\\docs' },
    ]);
  });

  it('空路径返回空数组', () => {
    expect(buildBreadcrumbSegments('', 'win32')).toEqual([]);
  });
});

describe('browseErrorTextKey', () => {
  it('接口错误码映射到 i18n 键', () => {
    expect(browseErrorTextKey('path_not_found')).toBe('workspace.browseNotFound');
    expect(browseErrorTextKey('not_a_directory')).toBe('workspace.browseNotDir');
    expect(browseErrorTextKey('permission_denied')).toBe('workspace.browsePermissionDenied');
    expect(browseErrorTextKey('bad_path')).toBe('workspace.browseBadPath');
    expect(browseErrorTextKey('path_too_long')).toBe('workspace.browseBadPath');
    expect(browseErrorTextKey('timeout')).toBe('workspace.browseTimeout');
    expect(browseErrorTextKey('client-timeout')).toBe('workspace.browseTimeout');
    expect(browseErrorTextKey('rate_limited')).toBe('workspace.browseRateLimited');
    expect(browseErrorTextKey('endpoint-missing')).toBe('workspace.browseUnsupported');
    expect(browseErrorTextKey('whatever')).toBe('workspace.browseLoadFailed');
  });
});

describe('createWorkdirBrowserView', () => {
  const roots = [
    { name: 'C:', path: 'C:\\', kind: 'drive' },
    { name: '~', path: 'C:\\Users\\me', kind: 'home' },
  ];

  function buildView(overrides = {}) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const onSelect = vi.fn();
    const onClose = vi.fn();
    const listDirs = vi.fn(async (target) => {
      if (!target) {
        return { success: true, path: null, parent: null, roots, entries: [], truncated: false };
      }
      if (target === 'C:\\') {
        return {
          success: true,
          path: 'C:\\',
          parent: null,
          roots,
          entries: [{ name: 'Users', path: 'C:\\Users', kind: 'dir', link: false }],
          truncated: false,
        };
      }
      return {
        success: true,
        path: 'C:\\Users',
        parent: 'C:\\',
        roots,
        entries: [{ name: 'me', path: 'C:\\Users\\me', kind: 'dir', link: false }],
        truncated: false,
      };
    });

    const view = createWorkdirBrowserView({
      container,
      t,
      platform: 'win32',
      platformName: 'Windows',
      hostname: 'HOST',
      listDirs,
      onSelect,
      onClose,
      canUseNative: false,
      ...overrides,
    });
    return { container, view, onSelect, onClose, listDirs };
  }

  it('打开时展示 Agent 标识、根节点与当前层目录', async () => {
    const { container, view } = buildView();
    view.open('C:\\');
    await flush();

    expect(container.querySelector('.wdb-agent').textContent).toContain('workspace.browseAgentHost');
    expect(container.querySelectorAll('.wdb-root').length).toBe(2);
    const items = container.querySelectorAll('.wdb-item');
    expect(items.length).toBe(1);
    expect(items[0].textContent).toContain('Users');
    expect(container.querySelector('.wdb-crumb.current').textContent).toBe('C:');
  });

  it('单击选中、点「选择此目录」回填并关闭视图', async () => {
    const { container, view, onSelect, onClose } = buildView();
    view.open('C:\\');
    await flush();

    container.querySelector('.wdb-item').click();
    const choose = container.querySelector('.wdb-choose');
    expect(choose.disabled).toBe(false);
    expect(choose.textContent).toBe('workspace.browseChooseDir');
    choose.click();

    expect(onSelect).toHaveBeenCalledWith('C:\\Users');
    expect(view.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('双击目录进入下一层（与系统目录列表习惯一致）', async () => {
    const { container, view, onSelect } = buildView();
    view.open('C:\\');
    await flush();

    const item = container.querySelector('.wdb-item');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    item.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await flush();

    expect(onSelect).not.toHaveBeenCalled();
    expect(view.isOpen()).toBe(true);
    expect(container.querySelector('.wdb-item').textContent).toContain('me');
    expect(container.querySelector('.wdb-crumb.current').textContent).toBe('Users');
  });

  it('双击根节点只进入一层，不会误选或继续下钻', async () => {
    const { container, view, onSelect } = buildView();
    view.open('');
    await flush();

    // 根节点第一次点击进入 C:\，列表异步刷新为 Users；第二次点击 + dblclick 落在新项上
    container.querySelectorAll('.wdb-item')[0].dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await flush();
    const child = container.querySelector('.wdb-item');
    child.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 2 }));
    child.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));

    expect(onSelect).not.toHaveBeenCalled();
    expect(view.isOpen()).toBe(true);
    expect(container.querySelector('.wdb-crumb.current').textContent).toBe('C:');
  });

  it('点行内 ✓ 快捷按钮回填并关闭视图（与底部按钮等价）', async () => {
    const { container, view, onSelect, onClose } = buildView();
    view.open('C:\\');
    await flush();

    const pick = container.querySelector('.wdb-item .wdb-pick');
    expect(pick).toBeTruthy();
    pick.click();

    expect(onSelect).toHaveBeenCalledWith('C:\\Users');
    expect(view.isOpen()).toBe(false);
    expect(onClose).toHaveBeenCalled();
  });

  it('根节点层不渲染行内 ✓（盘符/主目录只用于导航）', async () => {
    const { container, view } = buildView();
    view.open('');
    await flush();

    expect(container.querySelectorAll('.wdb-item').length).toBe(2);
    expect(container.querySelector('.wdb-pick')).toBeNull();
  });

  it('根节点层把盘符/主目录作为可点击项', async () => {
    const { container, view, listDirs } = buildView();
    view.open('');
    await flush();

    const rootItems = container.querySelectorAll('.wdb-item');
    expect(rootItems.length).toBe(2);
    rootItems[0].click();
    await flush();
    expect(listDirs).toHaveBeenCalledWith('C:\\');
  });

  it('读取失败展示行内错误而不是静默', async () => {
    const listDirs = vi.fn(async () => ({ success: false, error: 'permission_denied', message: 'denied' }));
    const { container, view } = buildView({ listDirs });
    view.open('C:\\');
    await flush();

    const errorEl = container.querySelector('.wdb-error');
    expect(errorEl.hidden).toBe(false);
    expect(errorEl.textContent).toBe('denied');
  });

  it('旧版代理端标记 outdated 时给出升级提示', async () => {
    const listDirs = vi.fn(async () => ({ success: false, outdated: true, error: 'endpoint-missing' }));
    const { container, view } = buildView({ listDirs });
    view.open('C:\\');
    await flush();

    expect(container.querySelector('.wdb-list').textContent).toContain('workspace.browseUnsupported');
  });
});

describe('接线守卫', () => {
  it('弹窗不再按 hostname 隐藏浏览按钮，且使用内置浏览器', () => {
    const src = read('src/side_panel/workspace-panel.js');
    expect(src).not.toContain('browseAvailable ?');
    expect(src).toContain('createWorkdirBrowserView');
    expect(src).toContain('browseDirs');
    expect(src).toContain('browserView.open');
    expect(src).toContain("e.key === 'Escape' && browserView && browserView.isOpen()");
    expect(src).toContain("canUseNative: canUseNativePicker");
  });

  it('browseDirs 使用 /api/fs/browse 且有客户端超时', () => {
    const src = read('src/side_panel/workspace-manager.js');
    expect(src).toContain('/api/fs/browse');
    expect(src).toContain('BROWSE_DIRS_CLIENT_TIMEOUT_MS');
    expect(src).toContain('outdated: true');
  });

  it('内置浏览器样式与中英文文案齐全', () => {
    const css = read('src/side_panel/styles.css');
    expect(css).toContain('.wdb-view');
    expect(css).toContain('.wdb-pick');
    expect(css).not.toContain('.wdb-enter');
    const panel = read('src/side_panel/workspace-panel.js');
    for (const key of [
      'browseAgentHost',
      'browseRoots',
      'browseLoading',
      'browseEmpty',
      'browseTruncated',
      'browseNotFound',
      'browsePermissionDenied',
      'browseBadPath',
      'browseRateLimited',
      'browseUnsupported',
      'browseChooseCurrent',
      'browseChooseDir',
      'browseUseNative',
    ]) {
      expect(panel).toContain(`${key}:`);
    }
    expect(panel).not.toContain('browseEnter:');
  });

  it('Agent 端浏览接口仍在（阶段 0 回归）', () => {
    expect(read('agent/src/server.js')).toContain("pathname === '/api/fs/browse'");
    expect(read('agent/src/server.js')).toContain("error: 'rate_limited'");
  });
});

describe('原生弹窗降级治理（阶段 2）', () => {
  it('Agent：busy 可取消（cancellable + elapsedMs），并提供取消端点', () => {
    const picker = read('agent/src/directory-picker.js');
    expect(picker).toContain('cancellable: true');
    expect(picker).toContain('elapsedMs');
    expect(picker).toContain('export async function cancelPickDirectory()');
    const server = read('agent/src/server.js');
    expect(server).toContain("pathname === '/api/config/pick-directory/cancel'");
    // 取消端点与发起端点保持同一来源门控（远端不得取消本机用户弹窗）
    expect(server).toContain('pick_directory_cancel_remote_blocked');
  });

  it('Agent：请求断开时 kill 子进程（res close → cancelPickDirectory）', () => {
    const server = read('agent/src/server.js');
    const idx = server.indexOf("pathname === '/api/config/pick-directory' && req.method === 'POST'");
    expect(idx).toBeGreaterThan(-1);
    const seg = server.slice(idx, idx + 2200);
    expect(seg).toContain("res.on('close'");
    expect(seg).toContain('cancelPickDirectory()');
  });

  it('Agent：取消退出码但窗口从未出现 → no-window（不再静默当用户取消）', () => {
    const picker = read('agent/src/directory-picker.js');
    expect(picker).toContain("error: 'no-window'");
    expect(picker).toContain('item.expectShown && !runResult.shown');
  });

  it('扩展端：busy 时取消旧弹窗并重试一次；取消本身不弹错误 toast', () => {
    const panel = read('src/side_panel/workspace-panel.js');
    expect(panel).toContain('cancelPickDirectory');
    expect(panel).toMatch(/result\.error === 'busy' && result\.cancellable/);
    expect(panel).toMatch(/errorText === 'cancelled'\) \{\s*\n\s*\/\/ 请求被取消/);
    const manager = read('src/side_panel/workspace-manager.js');
    expect(manager).toContain("'/api/config/pick-directory/cancel'");
  });
});
