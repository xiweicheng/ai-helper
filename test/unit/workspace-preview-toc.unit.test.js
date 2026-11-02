// @vitest-environment jsdom
// 工作目录 Markdown 预览的章节目录接线：
// - 挂载路由：预览全屏（fixed 覆盖层盖住 side-rail）时目录挂覆盖层内 .workspace-preview-rail，
//   浮窗预览挂入口轨道 toc 槽位（行为驱动，同 message-toc-fullscreen 的做法）；
// - 关闭预览必须清空 rail 里指向旧文档的目录残留（真 closePreview 驱动）；
// - 全屏切换 / 渲染态↔源码态切换先收起旧目录（源码守卫：这两个函数未导出）。
import { describe, test, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (m) => Promise.resolve({}),
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
};

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let toc;
let getSideRailSlot;
let closePreview;

beforeAll(async () => {
  toc = await import('../../src/side_panel/message-toc.js');
  ({ getSideRailSlot } = await import('../../src/side_panel/side-rail.js'));
  document.body.innerHTML = `
    <div class="chat-container" id="chatContainer"></div>
    <div id="workspacePanel">
      <div class="workspace-preview-overlay" id="workspacePreviewArea">
        <div id="workspacePreviewFilename"></div>
        <div id="workspacePreviewLineCount"></div>
        <button id="workspacePreviewCopyBtn"></button>
        <button id="workspacePreviewDownloadBtn"></button>
        <button id="workspacePreviewOpenBrowserBtn"></button>
        <button id="workspacePreviewFullscreenBtn"></button>
        <button id="workspacePreviewMdToggleBtn"></button>
        <button id="workspacePreviewEditBtn"></button>
        <button id="workspacePreviewSaveBtn"></button>
        <button id="workspacePreviewCancelBtn"></button>
        <div id="workspacePreviewExportMenu"></div>
        <div class="workspace-preview-content" id="workspacePreviewContent">
          <div class="markdown-body workspace-preview-markdown" id="wsMd">
            <h2 id="wh1">工作目录篇</h2>
            <h3 id="wh2">小节 W.1</h3>
          </div>
        </div>
        <div class="workspace-preview-rail" id="workspacePreviewRail"></div>
      </div>
    </div>`;
  ({ closePreview } = await import('../../src/side_panel/workspace-panel.js'));
});

describe('工作目录预览目录挂载路由（行为）', () => {
  test('预览全屏时，目录挂覆盖层内 rail 而非被遮挡的 side-rail', () => {
    const previewArea = document.getElementById('workspacePreviewArea');
    const rail = document.getElementById('workspacePreviewRail');
    const md = document.getElementById('wsMd');
    previewArea.classList.add('fullscreen');

    const headings = md.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(md, headings);

    const container = document.querySelector('.message-toc-container');
    expect(container).toBeTruthy();
    expect(rail.contains(container)).toBe(true);
    expect(getSideRailSlot('toc').contains(container)).toBe(false);
    toc.hideMessageToc();
    previewArea.classList.remove('fullscreen');
  });

  test('浮窗预览（非全屏）时，目录挂入口轨道 toc 槽位', () => {
    const md = document.getElementById('wsMd');
    const headings = md.querySelectorAll('.markdown-body h2, .markdown-body h3');
    toc.showMessageToc(md, headings);

    const slot = getSideRailSlot('toc');
    expect(slot.querySelector('.message-toc-container')).toBeTruthy();
    expect(document.getElementById('workspacePreviewRail').querySelector('.message-toc-container')).toBe(null);
    toc.hideMessageToc();
  });

  test('closePreview 清空全屏 rail 里指向旧文档的目录残留', async () => {
    const rail = document.getElementById('workspacePreviewRail');
    const previewArea = document.getElementById('workspacePreviewArea');
    previewArea.classList.add('fullscreen');
    // 上一轮全屏预览留下的目录容器（指向已随 innerHTML 重建摘除的旧标题）
    const stale = document.createElement('div');
    stale.className = 'message-toc-container';
    rail.appendChild(stale);

    await closePreview(true);

    expect(rail.querySelector('.message-toc-container')).toBe(null);
    expect(previewArea.classList.contains('fullscreen')).toBe(false);
  });
});

describe('工作目录预览目录接线（源码守卫）', () => {
  const src = () => read('src/side_panel/workspace-panel.js');

  test('预览模板里有全屏目录挂载 rail', () => {
    expect(src()).toContain('class="workspace-preview-rail"');
  });

  test('全屏切换先收起旧目录；退出全屏清理 rail 残留', () => {
    const idx = src().indexOf('function togglePreviewFullscreen');
    expect(idx).toBeGreaterThan(0);
    const body = src().slice(idx, idx + 1400);
    expect(body).toContain('hideMessageToc()');
    expect(body).toContain("querySelectorAll('.message-toc-container')");
  });

  test('渲染态↔源码态切换先收起旧目录，避免入口指向重建掉的标题', () => {
    const idx = src().indexOf('function toggleMarkdownPreview');
    expect(idx).toBeGreaterThan(0);
    const body = src().slice(idx, idx + 700);
    expect(body).toContain('hideMessageToc()');
  });

  test('全屏 preview-rail 只在覆盖层全屏态显示，避免与 side-rail 入口双重出现', () => {
    const css = read('src/side_panel/styles.css');
    const idx = css.indexOf('.workspace-preview-rail {');
    expect(idx).toBeGreaterThan(0);
    expect(css.slice(idx, idx + 120)).toContain('display: none');
    expect(css).toContain('.workspace-preview-overlay.fullscreen .workspace-preview-rail {');
  });
});
