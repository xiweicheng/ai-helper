// @vitest-environment jsdom
// locateFileInWorkspace 单元测试：虚拟滚动（>200 项）目录下的定位高亮
import { describe, test, expect, beforeAll, beforeEach, vi } from 'vitest';

// 补全 chrome mock（import 链较深：workspace-panel → side-rail / state 等）
const noop = () => {};
globalThis.chrome = {
  storage: { local: { get: noop, set: noop }, onChanged: { addListener: noop } },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: noop,
    onMessage: { addListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

// mock 工作目录与目录列表（目录内容按用例通过 globalThis.__mockDirEntries 控制）
vi.mock('../../src/side_panel/workspace-manager.js', async (importOriginal) => {
  const actual = await importOriginal();
  return {
    ...actual,
    getWorkspaceRoot: async () => '/ws',
    getHomeDir: async () => null,
    listDirectory: async () => ({ success: true, entries: globalThis.__mockDirEntries || [] }),
    getFileIcon: () => '<svg></svg>',
    formatFileSize: () => '1 KB',
    formatTime: () => '12:00:00',
    supportsPreview: () => true,
  };
});

let locateFileInWorkspace;
let t;

beforeAll(async () => {
  const mod = await import('../../src/side_panel/workspace-panel.js');
  locateFileInWorkspace = mod.locateFileInWorkspace;
  // 引入 artifacts-manager 注册 artifacts.* 文案（定位失败的提示消息）
  await import('../../src/side_panel/artifacts-manager.js');
  t = (await import('../../src/shared/i18n.js')).t;
});

beforeEach(() => {
  document.body.innerHTML = `
    <div id="toastContainer"></div>
    <div id="workspacePanelContainer">
      <div id="workspacePanel">
        <div id="workspaceBreadcrumb"></div>
        <button id="workspaceBackBtn"></button>
        <button id="workspaceDownloadDirBtn"></button>
        <button id="workspaceBatchDeleteBtn"></button>
        <span id="workspaceSelectedCount"></span>
        <button id="workspaceAskBtn"></button>
        <div id="workspacePanelContent"></div>
      </div>
    </div>
  `;
  // jsdom 无布局：模拟面板可视高度，让虚拟滚动按真实窗口大小计算渲染范围
  Object.defineProperty(document.getElementById('workspacePanelContent'), 'clientHeight', {
    value: 400,
    configurable: true,
  });
  globalThis.__mockDirEntries = [];
});

const wait = (ms) => new Promise(r => setTimeout(r, ms));

describe('locateFileInWorkspace 定位高亮', () => {
  test('虚拟滚动目录（>200 项）目标排在渲染窗口外时仍能定位高亮', async () => {
    const entries = [];
    for (let i = 0; i < 250; i++) {
      entries.push({ name: `file-${String(i).padStart(3, '0')}.txt`, type: 'file', size: 10, mtime: 1 });
    }
    // 目标文件排序后位于列表末尾（首屏渲染窗口之外）
    entries.push({ name: 'zz-target-late.txt', type: 'file', size: 20, mtime: 2 });
    globalThis.__mockDirEntries = entries;

    await locateFileInWorkspace('/ws/zz-target-late.txt');
    await wait(450); // locate 内部 300ms 延迟后执行查找与高亮

    const content = document.getElementById('workspacePanelContent');
    // 确认当前处于虚拟滚动模式（只渲染了部分条目）
    expect(content.querySelectorAll('.workspace-file-item').length).toBeLessThan(entries.length);
    const target = document.querySelector('.workspace-file-item[data-name="zz-target-late.txt"]');
    expect(target).toBeTruthy();
    expect(target.classList.contains('highlighted')).toBe(true);
  });

  test('小目录（<200 项）正常定位高亮', async () => {
    globalThis.__mockDirEntries = [
      { name: 'docs', type: 'directory', size: 0, mtime: 1 },
      { name: 'readme.md', type: 'file', size: 10, mtime: 1 },
      { name: 'other.txt', type: 'file', size: 10, mtime: 1 },
    ];

    await locateFileInWorkspace('/ws/other.txt');
    await wait(450);

    const target = document.querySelector('.workspace-file-item[data-name="other.txt"]');
    expect(target).toBeTruthy();
    expect(target.classList.contains('highlighted')).toBe(true);
  });

  test('目标确实不在目录列表中时提示未找到', async () => {
    globalThis.__mockDirEntries = [
      { name: 'a.txt', type: 'file', size: 10, mtime: 1 },
    ];

    await locateFileInWorkspace('/ws/missing.txt');
    await wait(800); // 首次查找 300ms + 缓存失效重试 ~300ms

    expect(document.querySelector('.workspace-file-item[data-name="missing.txt"]')).toBeNull();
    expect(document.getElementById('toastContainer').textContent).toContain(t('artifacts.fileNotFound'));
  });
});
