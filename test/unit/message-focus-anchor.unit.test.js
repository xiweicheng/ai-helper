// @vitest-environment jsdom
// test/unit/message-focus-anchor.unit.test.js - 聊天区按 messageId 定位
// 停靠条点芯片后要滚到「那一轮用户问题」，用的是 utils.focusMessageInView：
// 这里验的是真实定位语义（滚动参数、高亮加/撤、找不着时如实返回 false），
// 而不是它被谁调用——调用接线在 session-dock.unit.test.js 里守。
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { focusMessageInView } from '../../src/side_panel/utils.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

function buildContainer(ids) {
  document.body.innerHTML = `
    <div id="chatContainer">
      ${ids.map((id) => `<div class="message user" data-message-id="${id}"><span>q</span></div>`).join('')}
    </div>
  `;
  const container = document.getElementById('chatContainer');
  const nodes = Array.from(container.querySelectorAll('[data-message-id]'));
  for (const node of nodes) node.scrollIntoView = vi.fn();
  return { container, nodes };
}

describe('focusMessageInView', () => {
  beforeEach(() => { vi.useFakeTimers(); });
  afterEach(() => { vi.useRealTimers(); document.body.innerHTML = ''; });

  it('命中时贴顶滚动（block:start），而不是居中或落到底部', () => {
    const { nodes } = buildContainer(['msg_a', 'msg_b']);
    expect(focusMessageInView('msg_b')).toBe(true);
    expect(nodes[1].scrollIntoView).toHaveBeenCalledWith({ behavior: 'instant', block: 'start' });
    // 定位错的行等于把用户带偏，必须只滚到 id 精确相等那一条
    expect(nodes[0].scrollIntoView).not.toHaveBeenCalled();
  });

  it('高亮加上了并在 2 秒后撤掉（复用既有的 bookmark-highlight）', () => {
    const { nodes } = buildContainer(['msg_a']);
    focusMessageInView('msg_a');
    expect(nodes[0].classList.contains('bookmark-highlight')).toBe(true);
    vi.advanceTimersByTime(1999);
    expect(nodes[0].classList.contains('bookmark-highlight')).toBe(true);
    vi.advanceTimersByTime(1);
    expect(nodes[0].classList.contains('bookmark-highlight')).toBe(false);
  });

  it('找不到目标消息时返回 false，且不碰任何节点、不加高亮', () => {
    const { nodes } = buildContainer(['msg_a', 'msg_b']);
    expect(focusMessageInView('msg_ghost')).toBe(false);
    for (const node of nodes) {
      expect(node.scrollIntoView).not.toHaveBeenCalled();
      expect(node.classList.contains('bookmark-highlight')).toBe(false);
    }
  });

  it('比对的是 dataset 值而不是拼进选择器：id 含引号与反斜杠也照样命中', () => {
    // 消息 id 现实里只含 base36 与下划线，但把值拼进 CSS 属性选择器要靠转义兜底，
    // jsdom 又不提供 CSS.escape —— 遍历比对才是两条路径都稳的做法
    document.body.innerHTML = '<div id="chatContainer"></div>';
    const container = document.getElementById('chatContainer');
    const tricky = 'a"b\'c\\d';
    const node = document.createElement('div');
    node.className = 'message user';
    node.dataset.messageId = tricky;
    node.scrollIntoView = vi.fn();
    container.appendChild(node);

    expect(focusMessageInView(tricky)).toBe(true);
    expect(node.scrollIntoView).toHaveBeenCalled();
  });

  it('id 为空或聊天容器不存在时直接 false（调用方要能据此回落）', () => {
    buildContainer(['msg_a']);
    expect(focusMessageInView('')).toBe(false);
    expect(focusMessageInView(null)).toBe(false);
    document.getElementById('chatContainer').remove();
    expect(focusMessageInView('msg_a')).toBe(false);
  });

  it('前缀相同的另一条不会被误命中', () => {
    const { nodes } = buildContainer(['msg_1', 'msg_12']);
    expect(focusMessageInView('msg_1')).toBe(true);
    expect(nodes[0].scrollIntoView).toHaveBeenCalled();
    expect(nodes[1].scrollIntoView).not.toHaveBeenCalled();
  });

  it('不新造第三种闪烁：高亮类名沿用收藏/搜索/问答跳转那一个', () => {
    const css = read('src/side_panel/styles.css');
    expect(css).toMatch(/\.bookmark-highlight\s*\{/);
    const src = read('src/side_panel/utils.js');
    const fn = src.slice(src.indexOf('export function focusMessageInView'), src.indexOf('/**\n * 判定当前所在组'));
    expect(fn).toContain("'bookmark-highlight'");
    // 停靠条自己不该再实现一套定位/闪烁，只调这个 helper
    const manager = read('src/side_panel/session-manager-ui.js');
    expect(manager).toContain('focusMessageInView');
    expect(css).not.toContain('.session-dock-highlight');
  });
});

describe('用户气泡的高亮不能把白字底提亮', () => {
  const css = () => read('src/side_panel/styles.css');

  it('气泡专用脉冲的 keyframes 全程不含 inset（探针只录 15%–60%，剩下的帧靠这条守）', () => {
    const all = css();
    const start = all.indexOf('@keyframes bookmarkHighlightPulseOnBrand');
    expect(start).toBeGreaterThan(-1);
    // 关键帧步骤都缩进，收尾那个 } 占行首
    const body = all.slice(start, all.indexOf('\n}', start) + 2);
    expect(body).not.toContain('inset');
  });

  it('.message.user.bookmark-highlight 切到不含 inset 的那条脉冲', () => {
    const start = css().indexOf('.message.user.bookmark-highlight {');
    expect(start).toBeGreaterThan(-1);
    const block = css().slice(start, css().indexOf('}', start));
    expect(block).toContain('bookmarkHighlightPulseOnBrand');
  });

  it('通用脉冲一字不动（收藏/搜索/问答跳转还靠它的内铺光）', () => {
    expect(css()).toMatch(/@keyframes bookmarkHighlightPulse \{[^}]*inset/);
    expect(css()).toMatch(/\.bookmark-highlight\s*\{[^}]*bookmarkHighlightPulse 2s/);
  });

  it('reduce 块里必须连气泡专用选择器一起关掉：它权重高，漏写就会在 reduce 下继续闪', () => {
    const reduce = css().slice(css().indexOf('.message.user.bookmark-highlight {'));
    const block = reduce.slice(reduce.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block.slice(0, block.indexOf('}', block.indexOf('animation: none'))))
      .toContain('.message.user.bookmark-highlight');
  });
});
