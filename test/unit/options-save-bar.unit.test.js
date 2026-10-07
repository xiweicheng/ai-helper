// @vitest-environment jsdom
// options-save-bar.unit.test.js - 保存按钮栏吸附行为的 DOM 冒烟测试
//
// 契约：options.html 中存在 .save-bar#saveBar（id 与 JS 引用一致）；
// 吸附状态判定 = 按钮栏底边达到/超过视口底边（sticky 生效中）→ 加 .floating；
// 回到文档流位置（底边位于视口底边之上）→ 移除 .floating。
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initSaveBarSticky } from '../../src/options/save-bar.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const VIEWPORT_HEIGHT = 800;
const BAR_HEIGHT = 86;

const originalResizeObserver = globalThis.ResizeObserver;

function setupDom() {
  document.body.innerHTML = `
    <div class="container">
      <div class="save-bar" id="saveBar"><button id="saveBtn">保存配置</button></div>
    </div>`;
}

// 模拟按钮栏相对视口的位置：bottom = 按钮栏底边坐标
function mockBarRect(bottom) {
  const saveBar = document.getElementById('saveBar');
  const spy = vi.spyOn(saveBar, 'getBoundingClientRect');
  spy.mockReturnValue({
    bottom,
    top: bottom - BAR_HEIGHT,
    height: BAR_HEIGHT,
    left: 0,
    right: 600,
    width: 600,
    x: 0,
    y: bottom - BAR_HEIGHT,
  });
  return spy;
}

const isFloating = () => document.getElementById('saveBar').classList.contains('floating');

describe('保存按钮栏吸附行为', () => {
  beforeEach(() => {
    setupDom();
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => VIEWPORT_HEIGHT });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    if (originalResizeObserver === undefined) {
      delete globalThis.ResizeObserver;
    } else {
      globalThis.ResizeObserver = originalResizeObserver;
    }
  });

  it('HTML 契约：options.html 中存在 .save-bar#saveBar 且包含保存按钮', () => {
    const html = fs.readFileSync(path.resolve(__dirname, '../../options.html'), 'utf8');
    const doc = new DOMParser().parseFromString(html, 'text/html');
    const saveBar = doc.getElementById('saveBar');
    expect(saveBar).toBeTruthy();
    expect(saveBar.classList.contains('save-bar')).toBe(true);
    expect(saveBar.querySelector('#saveBtn')).toBeTruthy();
  });

  it('页面放得下（按钮底边在视口内）时保持文档流位置：不加 floating', () => {
    mockBarRect(VIEWPORT_HEIGHT - 100);
    initSaveBarSticky();
    expect(isFloating()).toBe(false);

    // 滚动（短页面无滚动）事件重算后仍不加
    window.dispatchEvent(new Event('scroll'));
    expect(isFloating()).toBe(false);
  });

  it('按钮被视口底边截住（吸附生效）时加 floating；回到文档流位置后移除', () => {
    mockBarRect(VIEWPORT_HEIGHT); // 吸附中：底边恒贴视口底边
    initSaveBarSticky();
    expect(isFloating()).toBe(true);

    mockBarRect(VIEWPORT_HEIGHT - 40); // 滚到页面底部后释放，回到文档流
    window.dispatchEvent(new Event('scroll'));
    expect(isFloating()).toBe(false);
  });

  it('窗口尺寸变化导致按钮被截住时，resize 触发重算并进入浮动状态', () => {
    mockBarRect(VIEWPORT_HEIGHT - 40);
    initSaveBarSticky();
    expect(isFloating()).toBe(false);

    mockBarRect(VIEWPORT_HEIGHT); // 视口变矮后按钮被截住
    window.dispatchEvent(new Event('resize'));
    expect(isFloating()).toBe(true);
  });

  it('判定含 1px 亚像素容差：底边距视口底边 1px 内视为浮动', () => {
    mockBarRect(VIEWPORT_HEIGHT - 1);
    initSaveBarSticky();
    expect(isFloating()).toBe(true);

    mockBarRect(VIEWPORT_HEIGHT - 2);
    window.dispatchEvent(new Event('scroll'));
    expect(isFloating()).toBe(false);
  });

  it('ResizeObserver 可用时观察 body 尺寸变化（切换 Tab / 展开折叠兜底）', () => {
    const observeSpy = vi.fn();
    globalThis.ResizeObserver = class {
      observe(el) {
        observeSpy(el);
      }
    };
    mockBarRect(VIEWPORT_HEIGHT - 100);
    initSaveBarSticky();
    expect(observeSpy).toHaveBeenCalledWith(document.body);
  });

  it('页面缺少 #saveBar 时安全返回（不抛错）', () => {
    document.body.innerHTML = '<div class="container"></div>';
    expect(() => initSaveBarSticky()).not.toThrow();
  });
});
