// @vitest-environment jsdom
// version-info-dom.unit.test.js - 「版本信息」弹窗的 DOM 行为冒烟测试
//
// 覆盖 HTML(id 契约) 与 JS 接线：点击菜单项 → 渲染四行信息 + 仓库链接行并显示弹窗；
// 关闭按钮 / 遮罩点击 / Esc → 隐藏弹窗。若 HTML id 与 JS 引用不一致，
// initVersionInfo 会静默 return，这些断言将失败。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initVersionInfo } from '../../src/side_panel/version-info.js';
import versionMeta from '../../src/config/version.json';

function setupDom() {
  document.body.innerHTML = `
    <div id="headerMoreDropdown" class="show">
      <button id="versionInfoBtn"></button>
    </div>
    <div id="versionInfoModal" class="modal-overlay" style="display: none;">
      <button id="versionInfoCloseBtn"></button>
      <div id="versionInfoList"></div>
      <div id="versionInfoLinks"></div>
      <button id="versionInfoCopyBtn"></button>
    </div>`;
}

describe('initVersionInfo DOM 冒烟', () => {
  beforeEach(() => {
    setupDom();
    initVersionInfo();
  });

  it('点击菜单项 → 渲染 4 行信息、显示弹窗并收起更多菜单', () => {
    document.getElementById('versionInfoBtn').click();
    const modal = document.getElementById('versionInfoModal');
    expect(modal.style.display).toBe('flex');
    expect(document.querySelectorAll('.version-info-row')).toHaveLength(4);
    expect(document.getElementById('headerMoreDropdown').classList.contains('show')).toBe(false);
  });

  it('渲染 GitHub/Gitee 仓库链接行（整行可点，title 为完整 URL）', () => {
    document.getElementById('versionInfoBtn').click();
    const links = document.querySelectorAll('.version-info-link');
    expect(links).toHaveLength(2);
    const text = document.getElementById('versionInfoLinks').textContent;
    expect(text).toContain('GitHub');
    expect(text).toContain('Gitee');
    expect(links[0].title).toBe('https://github.com/xiweicheng/ai-helper');
    expect(links[1].title).toBe('https://gitee.com/xiweicheng/ai-helper');
  });

  it('点击仓库链接 → chrome.tabs.create 以对应 URL 新标签页打开', () => {
    const createSpy = vi.fn();
    globalThis.chrome.tabs.create = createSpy;
    document.getElementById('versionInfoBtn').click();
    const links = document.querySelectorAll('.version-info-link');
    links[0].click();
    expect(createSpy).toHaveBeenCalledWith({ url: 'https://github.com/xiweicheng/ai-helper' });
    links[1].click();
    expect(createSpy).toHaveBeenCalledTimes(2);
    expect(createSpy).toHaveBeenLastCalledWith({ url: 'https://gitee.com/xiweicheng/ai-helper' });
  });

  it('渲染内容包含发布版本号；commit 行为短哈希且 title 为完整 hash', () => {
    document.getElementById('versionInfoBtn').click();
    const text = document.getElementById('versionInfoList').textContent;
    expect(text).toContain(`v${versionMeta.version}`);
    expect(text).toContain(versionMeta.tag);
    const monoEl = document.querySelector('.version-info-value.mono');
    expect(monoEl).toBeTruthy();
    expect(monoEl.title).toBe(versionMeta.commitId);
    expect(monoEl.textContent).toBe(versionMeta.commitId.slice(0, 8));
  });

  it('点击关闭按钮 → 隐藏弹窗', () => {
    const modal = document.getElementById('versionInfoModal');
    document.getElementById('versionInfoBtn').click();
    expect(modal.style.display).toBe('flex');
    document.getElementById('versionInfoCloseBtn').click();
    expect(modal.style.display).toBe('none');
  });

  it('点击遮罩空白处 → 隐藏弹窗', () => {
    const modal = document.getElementById('versionInfoModal');
    document.getElementById('versionInfoBtn').click();
    expect(modal.style.display).toBe('flex');
    modal.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(modal.style.display).toBe('none');
  });

  it('Esc → 隐藏弹窗', () => {
    const modal = document.getElementById('versionInfoModal');
    document.getElementById('versionInfoBtn').click();
    expect(modal.style.display).toBe('flex');
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(modal.style.display).toBe('none');
  });
});
