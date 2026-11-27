// @vitest-environment jsdom
// message-footer-adapt.unit.test.js - AI 回复底部工具栏自适应降级
//
// 与 toolbar-adapt 同法：jsdom 不做真实布局，用 defineProperty 模拟
// scrollWidth/clientWidth，且 scrollWidth 随降级类变化（模拟加类后内容变窄），
// 验证逐级降级顺序、空间充足不降级、空间恢复还原、未布局 footer 跳过。
// 另用源码守卫锁定两个易回归点：MutationObserver 不监听 attributes（防改 class
// 自触发死循环）、测量带 clientWidth > 0 守卫（跳过未布局 footer）。
import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { adaptMessageFooters } from '../../src/side_panel/message-footer-adapt.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(path.resolve(__dirname, '../../src/side_panel/message-footer-adapt.js'), 'utf8');

function setupDom() {
  document.body.innerHTML = `
    <div id="chatContainer">
      <div class="message assistant">
        <div class="message-footer">
          <div class="footer-right-actions"><button class="copy-btn"><span>复制</span></button></div>
        </div>
      </div>
    </div>`;
  return document.querySelector('.message-footer');
}

/** scroll 传函数可让宽度随降级类动态变化（模拟加类后内容收窄） */
function mockWidth(footer, { client = 100, scroll }) {
  Object.defineProperty(footer, 'clientWidth', { configurable: true, get: () => client });
  Object.defineProperty(footer, 'scrollWidth', {
    configurable: true,
    get: typeof scroll === 'function' ? scroll : () => scroll,
  });
}

beforeEach(() => { document.body.innerHTML = ''; });

describe('adaptMessageFooters 逐级降级', () => {
  it('恒溢出：compact → ultra → wrap 三级全部加上', () => {
    const footer = setupDom();
    mockWidth(footer, { client: 100, scroll: 200 });
    adaptMessageFooters();
    expect(footer.classList.contains('footer-compact')).toBe(true);
    expect(footer.classList.contains('footer-compact-ultra')).toBe(true);
    expect(footer.classList.contains('footer-wrap')).toBe(true);
  });

  it('compact 后即放下：只加 compact，不再加 ultra/wrap', () => {
    const footer = setupDom();
    // 完整态溢出（200），加上 compact 后内容收窄到 100（=clientWidth，不再溢出）
    mockWidth(footer, {
      client: 100,
      scroll: () => (footer.classList.contains('footer-compact') ? 100 : 200),
    });
    adaptMessageFooters();
    expect(footer.classList.contains('footer-compact')).toBe(true);
    expect(footer.classList.contains('footer-compact-ultra')).toBe(false);
    expect(footer.classList.contains('footer-wrap')).toBe(false);
  });

  it('空间充足：不加任何降级类', () => {
    const footer = setupDom();
    mockWidth(footer, { client: 200, scroll: 100 });
    adaptMessageFooters();
    expect(footer.classList.contains('footer-compact')).toBe(false);
    expect(footer.classList.contains('footer-compact-ultra')).toBe(false);
    expect(footer.classList.contains('footer-wrap')).toBe(false);
  });

  it('空间恢复时全量还原：先溢出降级，再充足则清掉全部降级类', () => {
    const footer = setupDom();
    mockWidth(footer, { client: 100, scroll: 200 });
    adaptMessageFooters();
    expect(footer.classList.contains('footer-wrap')).toBe(true);

    mockWidth(footer, { client: 200, scroll: 100 });
    adaptMessageFooters();
    expect(footer.classList.contains('footer-compact')).toBe(false);
    expect(footer.classList.contains('footer-compact-ultra')).toBe(false);
    expect(footer.classList.contains('footer-wrap')).toBe(false);
  });

  it('clientWidth 为 0（未布局/display:none）的 footer 跳过测量', () => {
    const footer = setupDom();
    mockWidth(footer, { client: 0, scroll: 200 });
    adaptMessageFooters();
    expect(footer.classList.contains('footer-compact')).toBe(false);
  });

  it('测量期间带 measuring 类（禁用过渡），结束后移除', () => {
    const footer = setupDom();
    const during = [];
    Object.defineProperty(footer, 'clientWidth', { configurable: true, get: () => 100 });
    Object.defineProperty(footer, 'scrollWidth', {
      configurable: true,
      get: () => { during.push(footer.classList.contains('footer-measuring')); return 200; },
    });
    adaptMessageFooters();
    expect(during.length).toBeGreaterThan(0);
    expect(during.every(Boolean)).toBe(true);
    expect(footer.classList.contains('footer-measuring')).toBe(false);
  });
});

describe('防回归源码守卫', () => {
  it('MutationObserver 只监听 childList，不监听 attributes（避免改 class 自触发死循环）', () => {
    expect(SRC).toContain('.observe(container, { subtree: true, childList: true })');
    expect(SRC).not.toContain('attributes: true');
  });

  it('测量带 clientWidth > 0 守卫，跳过未布局的 footer', () => {
    expect(SRC).toContain('f.clientWidth > 0');
  });
});
