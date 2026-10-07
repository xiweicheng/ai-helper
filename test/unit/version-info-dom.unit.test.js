// @vitest-environment jsdom
// version-info-dom.unit.test.js - 「版本信息」弹窗的 DOM 行为冒烟测试
//
// 覆盖 HTML(id 契约) 与 JS 接线：点击菜单项 → 渲染四行信息 + 5 行链接（官网/讨论/上报/仓库）并显示弹窗；
// 关闭按钮 / 遮罩点击 / Esc → 隐藏弹窗。若 HTML id 与 JS 引用不一致，
// initVersionInfo 会静默 return，这些断言将失败。
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initVersionInfo } from '../../src/side_panel/version-info.js';
import { t } from '../../src/shared/i18n.js';
import versionMeta from '../../src/config/version.json';

// 链接区期望顺序：官网 → 讨论频道 → 上报问题 → GitHub → Gitee
const LINK_URLS = [
  'https://xiweicheng.github.io/ai-helper/',
  'https://github.com/xiweicheng/ai-helper/discussions',
  'https://github.com/xiweicheng/ai-helper/issues/new',
  'https://github.com/xiweicheng/ai-helper',
  'https://gitee.com/xiweicheng/ai-helper',
];

const LINK_LABEL_KEYS = [
  'versionInfo.website',
  'versionInfo.discussions',
  'versionInfo.reportIssue',
  'versionInfo.githubRepo',
  'versionInfo.giteeRepo',
];

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

  it('渲染官网/讨论/上报/GitHub/Gitee 链接行（整行可点，title 为完整 URL）', () => {
    document.getElementById('versionInfoBtn').click();
    const links = document.querySelectorAll('.version-info-link');
    expect(links).toHaveLength(LINK_URLS.length);
    LINK_URLS.forEach((url, i) => expect(links[i].title).toBe(url));
    const text = document.getElementById('versionInfoLinks').textContent;
    for (const key of LINK_LABEL_KEYS) {
      const label = t(key);
      expect(label).not.toBe(key); // 未注册的 i18n key 会返回 key 原文
      expect(text).toContain(label);
    }
  });

  it('点击链接行 → chrome.tabs.create 以对应 URL 新标签页打开', () => {
    const createSpy = vi.fn();
    globalThis.chrome.tabs.create = createSpy;
    document.getElementById('versionInfoBtn').click();
    const links = document.querySelectorAll('.version-info-link');
    LINK_URLS.forEach((url, i) => {
      links[i].click();
      expect(createSpy).toHaveBeenLastCalledWith({ url });
    });
    expect(createSpy).toHaveBeenCalledTimes(LINK_URLS.length);
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
