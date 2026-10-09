// @vitest-environment jsdom
// file-at-selector.unit.test.js - $ 工作目录文件选择器：标题行工作目录路径渲染
// （有 root 写入 / 无 root 清空 / 路径规范化）
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { showFileAtSelector } from '../../src/side_panel/file-at-selector.js';
import { getWorkspaceRoot, listDirectory } from '../../src/side_panel/workspace-manager.js';

vi.mock('../../src/side_panel/workspace-manager.js', () => ({
  getWorkspaceRoot: vi.fn(async () => null),
  listDirectory: vi.fn(async () => ({ entries: [] })),
  searchFilesRemote: vi.fn(async () => []),
  getFileIcon: vi.fn(() => '📄'),
}));
vi.mock('../../src/side_panel/workspace-panel.js', () => ({
  attachFilesForQuestion: vi.fn(),
}));
vi.mock('../../src/side_panel/utils.js', async (importOriginal) => {
  const actual = await importOriginal();
  return { ...actual, adjustInputHeight: vi.fn(), updateDropdownPosition: vi.fn() };
});

function setupDom() {
  document.body.innerHTML = `
    <div class="prompt-selector" id="fileAtSelector" style="display:none;">
      <div class="prompt-dropdown" id="fileAtDropdown">
        <div class="file-at-title">
          <span class="file-at-title-label">工作目录</span>
          <span class="file-at-title-path" id="fileAtTitlePath"></span>
        </div>
        <div class="prompt-dropdown-header">方向键切换</div>
        <div id="fileAtList"></div>
      </div>
    </div>
    <textarea id="userInput"></textarea>`;
  return {
    pathEl: document.getElementById('fileAtTitlePath'),
    list: document.getElementById('fileAtList'),
  };
}

// run() 在 setTimeout(0) 后启动，其内部 await mock 后写入 → 两次 tick 稳妥
const settle = async () => {
  await new Promise((r) => setTimeout(r, 0));
  await new Promise((r) => setTimeout(r, 0));
};

describe('file-at-selector 标题路径', () => {
  let dom;

  beforeEach(() => {
    vi.mocked(getWorkspaceRoot).mockReset().mockResolvedValue('/ws');
    vi.mocked(listDirectory).mockReset().mockResolvedValue({ entries: [] });
    dom = setupDom();
  });

  it('显示选择器时把工作目录路径写入标题行（含 title 全路径）', async () => {
    await showFileAtSelector('');
    await settle();
    expect(dom.pathEl.textContent).toBe('/ws');
    expect(dom.pathEl.title).toBe('/ws');
  });

  it('无工作目录（空态）时标题路径为空', async () => {
    vi.mocked(getWorkspaceRoot).mockResolvedValue(null);
    await showFileAtSelector('');
    await settle();
    expect(dom.pathEl.textContent).toBe('');
    expect(dom.pathEl.title).toBe('');
  });

  it('路径规范化（反斜杠→正斜杠）后写入', async () => {
    vi.mocked(getWorkspaceRoot).mockResolvedValue('C:\\Work\\proj');
    await showFileAtSelector('');
    await settle();
    expect(dom.pathEl.textContent).toBe('C:/Work/proj');
    expect(dom.pathEl.title).toBe('C:/Work/proj');
  });

  it('再次打开时路径刷新（工作目录变化后不残留旧值）', async () => {
    await showFileAtSelector('');
    await settle();
    expect(dom.pathEl.textContent).toBe('/ws');

    vi.mocked(getWorkspaceRoot).mockResolvedValue('/ws2');
    await showFileAtSelector('');
    await settle();
    expect(dom.pathEl.textContent).toBe('/ws2');
  });
});
