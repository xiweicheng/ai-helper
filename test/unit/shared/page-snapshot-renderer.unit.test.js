// page-snapshot-renderer 单元测试：嵌套 ops → 文本快照（纯函数，node 环境）
// ref 数字来自输入 fixtures（纯数据），允许固定值；渲染语义须与阶段二逐字节一致
import { describe, test, expect } from 'vitest';
import { renderSnapshot } from '../../../src/shared/page-snapshot-renderer.js';

// —— fixtures 构造器 ——
const el = (localRef, role, name = '', depth = 0, children = [], attrs = '') =>
  ({ t: 'el', localRef, role, name, attrs, depth, children });
const container = (role, name = '', depth = 0, children = []) =>
  ({ t: 'container', role, name, depth, children });
const frameNode = (title, depth = 0, extra = {}) =>
  ({ t: 'frame', title, srcUrl: null, sameOriginHref: null, orderInParent: 0, depth, ...extra });
const topFrame = (bodyTree, overlayTrees = [], frameInfo = {}) => ({
  frameIndex: 0, depth: 0, isTop: true,
  frameInfo: { url: 'https://a.com/', title: '', width: 800, height: 600, ...frameInfo },
  overlayTrees, bodyTree,
});
const childFrame = (frameIndex, depth, bodyTree, overlayTrees = [], frameInfo = {}) => ({
  frameIndex, depth, isTop: false,
  frameInfo: { url: 'https://b.com/x', title: 'Sub', width: 300, height: 200, ...frameInfo },
  overlayTrees, bodyTree,
});

describe('renderSnapshot - 单帧与阶段二逐字节一致', () => {
  test('基本格式：缩进/角色/名称/attrs/统计行/尾行', () => {
    const r = renderSnapshot({ frames: [topFrame([
      el(4, 'button', 'Save', 0),
      container('form', '', 0, [el(5, 'textbox', 'q', 1, [], 'placeholder="q"')]),
    ])] });
    expect(r.success).toBe(true);
    expect(r.count).toBe(2);
    expect(r.total).toBe(2);
    expect(r.content).toContain('button "Save" [ref 4]');
    expect(r.content).toContain('form');
    expect(r.content).toContain(' textbox "q" [ref 5] placeholder="q"');
    expect(r.content).toContain('可交互元素快照：2 个元素');
    expect(r.content).toContain('query_elements'); // 尾行提示
  });

  test('叠加层区块：先渲染打开层、再页面主体标记与主体', () => {
    const r = renderSnapshot({ frames: [topFrame(
      [el(9, 'button', 'Body', 0)],
      [container('dialog', 'Tip', 0, [el(3, 'button', 'OK', 1)])],
    )] });
    const lines = r.content.split('\n');
    expect(lines).toContain('[打开层]');
    expect(lines).toContain('[页面主体]');
    expect(lines.indexOf(' button "OK" [ref 3]')).toBeGreaterThan(lines.indexOf('[打开层]'));
    expect(lines.indexOf('button "Body" [ref 9]')).toBeGreaterThan(lines.indexOf('[页面主体]'));
  });

  test('未选中的容器仅在子树产出时输出（含容器盲扣预算）', () => {
    const sel = el(1, 'button', 'Selected', 1);
    const tree = [container('form', 'F', 0, [sel, el(2, 'button', 'Other', 1)])];
    const r = renderSnapshot({ frames: [topFrame(tree)], maxResults: 1 });
    // 分页只选中第一个匹配 → form 容器包裹 Selected 输出，Other 不输出
    expect(r.content).toContain('form');
    expect(r.content).toContain('button "Selected" [ref 1]');
    expect(r.content).not.toContain('"Other"');
  });

  test('分页：页信息/裁页/hasMore/越界提示', () => {
    const tree = [el(1, 'button', 'A', 0), el(2, 'button', 'B', 0), el(3, 'button', 'C', 0)];
    const p1 = renderSnapshot({ frames: [topFrame(tree)], maxResults: 2, page: 1 });
    expect(p1.page).toBe(1);
    expect(p1.totalPages).toBe(2);
    expect(p1.hasMore).toBe(true);
    expect(p1.content).toContain('（第 1/2 页，本次输出 2 个）');
    expect(p1.hint).toContain('page=2');
    const p2 = renderSnapshot({ frames: [topFrame(tree)], maxResults: 2, page: 2 });
    expect(p2.content).toContain('"C"');
    expect(p2.hasMore).toBe(false);
    const oor = renderSnapshot({ frames: [topFrame(tree)], maxResults: 2, page: 99 });
    expect(oor.success).toBe(true);
    expect(oor.count).toBe(0);
    expect(oor.hasMore).toBe(false);
    expect(oor.content).toContain('超出范围（共 2 页）');
  });

  test('maxChars 截断：截断标记 + 截断提示', () => {
    const tree = [el(1, 'button', 'AAAAA', 0), el(2, 'button', 'BBBBB', 0)];
    const r = renderSnapshot({ frames: [topFrame(tree)], maxChars: 30 });
    expect(r.truncated).toBe(true);
    expect(r.content).toContain('已截断');
  });

  test('countOnly 精确形状（无 page/totalPages/hasMore）', () => {
    const r = renderSnapshot({ frames: [topFrame([el(1, 'button', 'A', 0)])], countOnly: true });
    expect(r).toEqual({ success: true, content: '', count: 1, total: 1, truncated: false, hint: '' });
  });

  test('空页面：仅统计行（0 个元素）与尾行', () => {
    const r = renderSnapshot({ frames: [topFrame([])] });
    expect(r.total).toBe(0);
    expect(r.content).toContain('0 个元素');
  });
});

describe('renderSnapshot - 多帧区块与占位行', () => {
  test('区块头（含 host）/占位行/全局编号/header 概要', () => {
    const r = renderSnapshot({
      frames: [
        topFrame([el(1, 'button', 'Top', 0), frameNode('Pay', 0, { status: 'ok', frameIndex: 1 })]),
        childFrame(1, 1, [el(7, 'textbox', 'Card', 0)], [], { url: 'https://js.stripe.com/v3/', title: 'Pay' }),
      ],
      frameCount: 1,
    });
    expect(r.content).toContain('（含 1 个 iframe）');
    expect(r.content).toContain('iframe #1 "Pay"');
    expect(r.content).toContain('[frame #1 "Pay" · js.stripe.com]');
    expect(r.content).toContain('  textbox "Card" [ref 7]'); // 区块内容缩进 2
  });

  test('不可达帧：占位行带编号与标注、无区块', () => {
    const r = renderSnapshot({
      frames: [topFrame([frameNode('X', 0, { status: 'unreachable', frameIndex: 1 })])],
      frameCount: 1,
    });
    expect(r.content).toContain('iframe #1 "X"（内容不可访问）');
    expect(r.content).not.toContain('[frame #1 ');
  });

  test('超限/未匹配帧：占位行无编号 + header 截断注记', () => {
    const r = renderSnapshot({
      frames: [topFrame([frameNode('Big', 0, { status: 'excluded' })])],
      frameCount: 0,
      framesLimited: 1,
    });
    expect(r.content).toContain('iframe "Big"');
    expect(r.content).not.toContain('iframe #');
    expect(r.content).toContain('超出数量/深度上限');
  });

  test('隐藏帧节点防御：不输出任何行', () => {
    const r = renderSnapshot({
      frames: [topFrame([el(1, 'button', 'A', 0), frameNode('H', 0, { status: 'hidden' })])],
    });
    expect(r.content).not.toContain('H');
  });

  test('嵌套帧区块缩进；about:srcdoc 显示 srcdoc', () => {
    const r = renderSnapshot({
      frames: [
        topFrame([frameNode('Outer', 0, { status: 'ok', frameIndex: 1 })]),
        childFrame(1, 1, [frameNode('Inner', 0, { status: 'ok', frameIndex: 2 }), el(8, 'button', 'O', 0)],
          [], { url: 'about:srcdoc', title: 'Outer' }),
        childFrame(2, 2, [el(9, 'button', 'I', 0)], [], { url: 'https://c.com/', title: 'Inner' }),
      ],
      frameCount: 2,
    });
    expect(r.content).toContain('[frame #1 "Outer" · srcdoc]');
    expect(r.content).toContain('  iframe #2 "Inner"');
    expect(r.content).toContain('  [frame #2 "Inner" · c.com]'); // 嵌套区块缩进 2
  });

  test('多帧全局流分页：跨帧切片', () => {
    const r = renderSnapshot({
      frames: [
        topFrame([el(1, 'button', 'T1', 0)]),
        childFrame(1, 1, [el(2, 'button', 'F1', 0)], [], { url: 'https://b.com/', title: '' }),
      ],
      maxResults: 1, page: 2, frameCount: 1,
    });
    expect(r.count).toBe(1);
    expect(r.content).toContain('"F1"');
    expect(r.content).toContain('[frame #1 · b.com]'); // 无 title 时省略引号段
  });
});
