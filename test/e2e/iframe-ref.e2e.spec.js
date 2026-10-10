// iframe-ref.e2e.spec.js - 真实 iframe 环境下跨帧 ref 采集与整体渲染组装
import { test, expect } from '@playwright/test';
import path from 'path';
import { fileURLToPath } from 'url';
import { getContentBundle, callTool, callToolInFrame } from './helpers/load-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fixtureUrl = (name) => 'file://' + path.resolve(__dirname, 'fixtures', name);

let bundle;
test.beforeAll(async () => {
  bundle = await getContentBundle();
});
test.beforeEach(async ({ page }) => {
  await page.addInitScript({ content: bundle });
});

/** 在树中按 title 找 frame 节点 */
const findFrameNode = (nodes, title) => {
  for (const n of nodes) {
    if (n.t === 'frame' && n.title === title) return n;
    if (n.children && n.children.length) {
      const hit = findFrameNode(n.children, title);
      if (hit) return hit;
    }
  }
  return null;
};

test.describe('iframe 跨帧 ref（真实 DOM 采集 + 渲染组装）', () => {
  test('auto 采集：frame 节点属性（sameOriginHref/orderInParent/srcUrl）+ display:none 剪枝', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    const ops = await callTool(page, 'collectSnapshotOps', { frames: 'auto' });
    expect(ops.success).toBe(true);

    const child = findFrameNode(ops.bodyTree, 'Child');
    const zero = findFrameNode(ops.bodyTree, 'Zero');
    expect(child).toBeTruthy();
    expect(zero).toBeTruthy();
    // display:none 的 iframe 在采集期被子树剪枝剔除（spec §4.1：隐藏帧完全不参与）
    expect(findFrameNode(ops.bodyTree, 'Hidden')).toBeNull();

    // 可见 srcdoc 帧：sameOriginHref 可读；orderInParent 依 DOM 全量 iframe 序；无 src 属性 → srcUrl 空串
    expect(child.sameOriginHref).toBe('about:srcdoc');
    expect(child.srcUrl).toBe('');
    expect(child.orderInParent).toBe(0);
    expect(zero.orderInParent).toBe(2); // 序号按全部 iframe 元素计（display:none 的第 2 个仍占序）
  });

  test('none 采集（旧入口薄包装）：iframe 不产生 frame 节点', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    const r = await callTool(page, 'queryInteractiveElements', {});
    expect(r.success).toBe(true);
    expect(r.content).not.toContain('iframe');
    expect(r.content).toContain('Top Button');
  });

  test('子帧内采集：frameInfo 来自 srcdoc 文档、loadId 存在', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    const ops = await callToolInFrame(page, 'child-frame', 'collectSnapshotOps', { frames: 'none' });
    expect(ops.success).toBe(true);
    expect(ops.frameInfo.url).toBe('about:srcdoc');
    expect(ops.frameInfo.title).toBe('Child Doc');
    expect(typeof ops.frameInfo.loadId).toBe('string');
    expect(ops.frameInfo.loadId.length).toBeGreaterThan(0);
    expect(JSON.stringify(ops.bodyTree)).toContain('Child Button');
  });

  test('可见性判定：可见帧 true；display:none 与零尺寸 false', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    expect(await callToolInFrame(page, 'child-frame', 'isFrameVisible')).toBe(true);
    expect(await callToolInFrame(page, 'hidden-frame', 'isFrameVisible')).toBe(false);
    expect(await callToolInFrame(page, 'zero-frame', 'isFrameVisible')).toBe(false);
  });

  test('组装渲染：占位行编号 + 子帧区块（缩进 2）+ 隐藏帧移除', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    const topOps = await callTool(page, 'collectSnapshotOps', { frames: 'auto' });
    const childOps = await callToolInFrame(page, 'child-frame', 'collectSnapshotOps', { frames: 'none' });

    // 模拟编排器帧节点标记（真实流程由 markFrameNodes 三重对应完成）
    findFrameNode(topOps.bodyTree, 'Child').status = 'ok';
    findFrameNode(topOps.bodyTree, 'Child').frameIndex = 1;
    findFrameNode(topOps.bodyTree, 'Zero').status = 'hidden'; // 零尺寸帧：子帧自报不可见 → 节点移除
    // Hidden（display:none）在采集期已剪枝，无节点可标

    const snapshot = await callTool(page, 'renderSnapshot', {
      frames: [
        { frameIndex: 0, depth: 0, isTop: true, frameInfo: topOps.frameInfo, overlayTrees: topOps.overlayTrees, bodyTree: topOps.bodyTree },
        { frameIndex: 1, depth: 1, isTop: false, frameInfo: childOps.frameInfo, overlayTrees: childOps.overlayTrees, bodyTree: childOps.bodyTree },
      ],
      frameCount: 1,
    });

    expect(snapshot.success).toBe(true);
    expect(snapshot.content).toContain('（含 1 个 iframe）');
    expect(snapshot.content).toContain('iframe #1 "Child"');
    expect(snapshot.content).toContain('[frame #1 "Child Doc" · srcdoc]');
    expect(snapshot.content).toContain('  button "Child Button" [ref '); // 块内容缩进 2
    expect(snapshot.content).not.toContain('Hidden');
    expect(snapshot.content).not.toContain('Zero');
  });

  test('子帧内本地 ref 交互：注册表解析 + type 生效', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    const snap = await callToolInFrame(page, 'child-frame', 'queryInteractiveElements', { filterByText: 'child-input' });
    expect(snap.success).toBe(true);
    const ref = Number(snap.content.match(/\[ref (\d+)\]/)[1]);

    const r = await callToolInFrame(page, 'child-frame', 'interactByRef', ref, 'type', { value: 'cross-frame', waitTime: 0, timeout: 0 });
    expect(r.success).toBe(true);

    const frame = page.frames().find(f => f.name() === 'child-frame');
    expect(await frame.locator('#child-input').inputValue()).toBe('cross-frame');
  });
});
