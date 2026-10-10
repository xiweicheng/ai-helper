# 页面引用系统阶段三实施计划（iframe 内交互 ref）

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `query_elements` 默认纳入可见 iframe 内容（`[frame #N]` 区块 + 占位行 + 全局 ref 编号），`interact_element` / `fill_form` / `select_dropdown` 的 ref 跨帧透明路由；无帧/单帧页面输出与阶段二逐字节一致。

**Architecture:** content 侧 `collectSnapshotOps`（每帧采集嵌套 treeNode 结构化 ops，不渲染）→ bg `snapshot-orchestrator`（webNavigation 帧枚举 / 并行定向收集 / 按 tab 维度全局编号表 / frame 节点三重对应标记）→ 共享 `renderSnapshot`（唯一渲染出口：全局 matched 流分页切片 + 阶段二预算/容器/截断语义逐条复刻）。`queryInteractiveElements` 保留为薄包装（collect + renderer），单帧输出逐字节不变。

**Tech Stack:** MV3 Chrome 扩展、Vite 构建、Vitest（node/jsdom 双环境）、Playwright e2e、esbuild 打包探针。

**Spec:** `docs/superpowers/specs/2026-10-10-page-element-ref-system-phase3-design.md`（已批准；实现与 spec 冲突时以 spec 为准，本计划的少量实现级决策为 spec 细化，已在对应任务注明）

## Global Constraints

- 每个 Task 结束前必须：相关单测跑绿 → `git commit`（中文 conventional 提交信息）
- 代码注释/提交信息用中文；工具定义 description 用英文（模型侧）；i18n zh/en 必须同步
- **兼容性红线：无帧/单帧页面（含 `frames:'none'`）输出与阶段二逐字节一致**——`queryInteractiveElements` 薄包装 + 现有 45 条 page-interaction 单测 / 25 条 e2e 零改写（只允许新增用例，不得修改既有断言）
- **测试断言不得硬编码 ref 数字**：page-interaction 层从 `content.matchAll(/\[ref (\d+)\]/g)` 提取；渲染器/编排器测试的输入 fixtures 为纯数据对象，允许固定数字
- 测试文件环境：`page-interaction.unit.test.js` 为 jsdom（文件头已标注）；渲染器/编排器/路由/manifest 测试为默认 node 环境；bg 侧测试用文件内 chrome mock 工厂 + `vi.stubGlobal('chrome', ...)`（惯例见 `test/unit/debugger-executor.unit.test.js`）
- `frameId` 是 tab 作用域 → 全局编号表必须按 `tabId` 维度存储
- 探针文件（`test-results-probes/`）gitignored 不入库；main 分支保持本地不推送
- 不改动：`iframe_content` 工具、`wait_element` 等文本类工具跨帧语义、CDP（debugger）路径、shadow 开放域逻辑
- 全部改动完成后执行 `npm run build:silent` 验证构建；最终全量回归（vitest / build / playwright / 探针双本）

## File Structure

| 文件 | 责任 | 动作 |
|---|---|---|
| `src/shared/page-snapshot-renderer.js` | 唯一渲染出口：嵌套 ops → 文本快照（全局流分页/预算/区块/占位行；快照 i18n 键注册） | 新建 |
| `test/unit/shared/page-snapshot-renderer.unit.test.js` | 渲染器纯函数测试（断言从 page-interaction 测试平移 + 多帧用例） | 新建 |
| `src/content/page-interaction.js` | `collectSnapshotOps` / `collectNodes` / `isFrameVisible` / 结构化建议；`queryInteractiveElements` 改薄包装；快照 i18n 键迁出 | 修改核心 |
| `test/unit/content/page-interaction.unit.test.js` | ops 结构 / 帧自报 / 建议结构用例（既有 45 条零改写） | 修改 |
| `src/content/index.js` | `SNAPSHOT_COLLECT` handler + `_frameRouted` 豁免 + SELECT_DROPDOWN 建议透出 | 修改 |
| `manifest.json` | `match_about_blank` / `match_origin_as_fallback` / `webNavigation` | 修改 |
| `test/unit/manifest.unit.test.js` | manifest 注入覆盖与权限断言 | 新建 |
| `src/background/tools/snapshot-orchestrator.js` | 帧枚举 / 并行收集 / 全局编号表 / 三重对应 / 定向消息 / 路由辅助 / i18n | 新建 |
| `test/unit/snapshot-orchestrator.unit.test.js` | mock chrome 编排器用例 | 新建 |
| `src/background/tool-executor.js` | `TOOL_HANDLERS.query_elements` 接线 + ref 路由拦截（`maybeRouteRefTool`）+ fill_form 拆分合并 | 修改 |
| `test/unit/ref-routing.unit.test.js` | 路由单测（定向发送/失效/拆分合并） | 新建 |
| `src/background/tools/browser-tools.js` | query_elements `execution→background` + `frames` 参数 + description | 修改 |
| `test/unit/tool-definitions.unit.test.js` | execution / frames 断言追加 | 修改 |
| `src/shared/locales/zh.js` + `en.js` | `tool.query_elements` 描述同步 | 修改 |
| `test/e2e/fixtures/iframe-visible-page.html` | srcdoc 三类帧 fixture（可见 320x200 / display:none / 零尺寸，`name` 属性区分） | 新建 |
| `test/e2e/helpers/load-module.js` | bundle 挂 `renderSnapshot` + `callToolInFrame` | 修改 |
| `test/e2e/iframe-ref.e2e.spec.js` | 可见性排除 / ops 结构 / 组合渲染用例 | 新建 |
| `test-results-probes/_iframe-ref-orchestrator.mjs` | Phase A 探针：真实 orchestrator 直驱（18 checks；gitignored 不入库） | 新建 |
| `test-results-probes/_iframe-ref-extension.mjs` | Phase B 探针：真实 dist 扩展注入（2 checks；gitignored 不入库） | 新建 |
| `CHANGELOG.md` / `docs/zh/DOCUMENTATION.md` / `docs/en/DOCUMENTATION.md` / `docs/AI-Helper-作品介绍文档.md` | 阶段三描述同步 | 修改 |

---

### Task 1: 共享渲染器 `page-snapshot-renderer.js`（唯一渲染出口）

**Files:**
- Create: `src/shared/page-snapshot-renderer.js`
- Test: `test/unit/shared/page-snapshot-renderer.unit.test.js`（新建，node 环境）

**Interfaces:**
- Produces: `renderSnapshot({ frames, page, maxResults, maxChars, countOnly, frameCount, framesLimited }) → { success, content, count, total, page, totalPages, hasMore, truncated, hint }`（countOnly 时无 page/totalPages/hasMore 字段，精确兼容阶段二）
  - `frames` 条目：`{ frameIndex, depth, isTop, frameInfo: { url, title, width, height, loadId }, overlayTrees: [treeNode], bodyTree: [treeNode] }`
  - treeNode 三形态：`{ t:'el', localRef, role, name, attrs, depth, children }` / `{ t:'container', role, name, depth, children }` / `{ t:'frame', title, srcUrl, sameOriginHref, orderInParent, depth, status, frameIndex }`
- Consumes: `src/shared/i18n.js` 的 `t` / `registerTranslations`
- 约束：纯函数零 DOM 依赖；渲染控制流逐条复刻阶段二 `renderTree`（子行先渲染、父行后决定、预算失败丢弃子树但 `childProduced` 影响祖先容器行、容器行盲扣预算、iframe 占位行像容器行一样盲扣预算）

- [ ] **Step 1: 写渲染器测试（红）**

新建 `test/unit/shared/page-snapshot-renderer.unit.test.js`：

```js
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
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/shared/page-snapshot-renderer.unit.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现渲染器**

新建 `src/shared/page-snapshot-renderer.js`（完整代码）：

```js
// shared/page-snapshot-renderer.js - 页面元素快照唯一渲染出口（纯函数，content 与 background 共用）
// 输入：各帧结构化 ops（嵌套 treeNode）+ 分页参数；输出：文本快照
// 渲染语义逐条复刻阶段二 renderTree/queryInteractiveElements：子行先渲染、父行后决定、
// 预算失败时子树丢弃但 childProduced 影响祖先容器行；容器行/iframe 占位行盲扣预算
import { t, registerTranslations } from './i18n.js';

registerTranslations('zh', {
  pageInteraction: {
    // —— 快照渲染（阶段三从 page-interaction.js 迁入 + 新增帧键）——
    refHint: 'ref 编号仅本次查询有效，页面导航/刷新或切换 tab 后需重新 query_elements',
    snapshotHeader: '可交互元素快照：{count} 个元素',
    snapshotTruncated: '（共 {total} 个，已截断，请用 filterByText 缩小范围）',
    snapshotPageInfo: '（第 {page}/{totalPages} 页，本次输出 {count} 个）',
    snapshotHasMore: '还有更多元素：调用 query_elements 时带 page={next} 查看',
    snapshotPageOutOfRange: 'page={page} 超出范围（共 {totalPages} 页）',
    snapshotOverlayBlock: '[打开层]',
    snapshotBodyBlock: '[页面主体]',
    snapshotFooter: '（ref 编号仅当前快照有效；页面变化后请重新调用 query_elements）',
    snapshotHeaderFrames: '（含 {n} 个 iframe）',
    snapshotFramesLimited: '（部分 iframe 超出数量/深度上限，未展开）',
    snapshotFrameBlock: '[frame #{index}{title}{hostSeg}]',
    snapshotFramePlaceholder: 'iframe #{index}{title}',
    snapshotFrameUnreachable: '（内容不可访问）',
  },
});

registerTranslations('en', {
  pageInteraction: {
    refHint: 'ref numbers are only valid for the current query; re-run query_elements after page navigation/refresh or tab switch',
    snapshotHeader: 'Interactive elements snapshot: {count} element(s)',
    snapshotTruncated: ' (of {total} total; truncated — narrow down with filterByText)',
    snapshotPageInfo: ' (page {page}/{totalPages}, {count} shown)',
    snapshotHasMore: 'More elements available: call query_elements with page={next}',
    snapshotPageOutOfRange: 'page={page} is out of range (only {totalPages} page(s))',
    snapshotOverlayBlock: '[Open overlays]',
    snapshotBodyBlock: '[Page body]',
    snapshotFooter: '(ref numbers are valid only for this snapshot; re-run query_elements after the page changes)',
    snapshotHeaderFrames: ' ({n} iframe(s))',
    snapshotFramesLimited: ' (some iframes exceed count/depth limits; not expanded)',
    snapshotFrameBlock: '[frame #{index}{title}{hostSeg}]',
    snapshotFramePlaceholder: 'iframe #{index}{title}',
    snapshotFrameUnreachable: ' (content inaccessible)',
  },
});

/** 区块头 host 片段：主机名省字符；srcdoc/blank 特判 */
function frameHost(url) {
  if (!url) return '';
  if (url === 'about:srcdoc') return 'srcdoc';
  if (url === 'about:blank') return 'blank';
  try { return new URL(url).hostname || ''; } catch { return ''; }
}

/** 先序收集树中可输出的 el 节点（全局 matched 流的数据源） */
function collectMatchedNodes(nodes, out) {
  for (const node of nodes) {
    if (node.t === 'el' && node.localRef != null) out.push(node);
    if (node.children && node.children.length) collectMatchedNodes(node.children, out);
  }
}

/** iframe 占位行渲染：像容器行一样盲扣预算；excluded/未匹配不带编号 */
function renderFrameNode(node, lines, ctx) {
  if (node.status === 'hidden' || node.status === 'off') return false;
  const titleSeg = node.title ? ` "${node.title}"` : '';
  let line;
  if (node.status === 'ok' && node.frameIndex != null) {
    line = t('pageInteraction.snapshotFramePlaceholder', { index: node.frameIndex, title: titleSeg });
  } else if (node.status === 'unreachable' && node.frameIndex != null) {
    line = t('pageInteraction.snapshotFramePlaceholder', { index: node.frameIndex, title: titleSeg })
      + t('pageInteraction.snapshotFrameUnreachable');
  } else {
    line = `iframe${titleSeg}`;
  }
  line = ' '.repeat(node.depth || 0) + line;
  ctx.budget -= line.length + 1;
  lines.push(line);
  return true;
}

/** 渲染单个 treeNode（复刻阶段二 renderTree 控制流），返回本子树是否产生输出行 */
function renderNode(node, lines, ctx) {
  if (!node) return false;
  if (node.t === 'frame') return renderFrameNode(node, lines, ctx);

  const childLines = [];
  let childProduced = false;
  for (const child of (node.children || [])) {
    if (renderNode(child, childLines, ctx)) childProduced = true;
  }

  if (node.t === 'el') {
    if (node.localRef != null && ctx.selected.has(node)) {
      if (ctx.budget <= 0) { ctx.truncated = true; return childProduced; }
      const role = node.role || '';
      const name = node.name || '';
      const attrs = node.attrs || '';
      // 估算行长度（含 [ref NNNNN] 上限 12 字符）后再输出，控制字符预算
      const estimate = node.depth + role.length + (name ? name.length + 2 : 0) + (attrs ? attrs.length + 1 : 0) + 12;
      if (ctx.budget - estimate < 0) { ctx.truncated = true; return childProduced; }
      const line = `${' '.repeat(node.depth)}${role}${name ? ` "${name}"` : ''} [ref ${node.localRef}]${attrs ? ' ' + attrs : ''}`;
      ctx.budget -= line.length + 1;
      ctx.count += 1;
      lines.push(line, ...childLines); // DOM 顺序：父行在子行前
      return true;
    }
    // 未选中：透传子行（阶段二行为）
    if (childProduced) { lines.push(...childLines); return true; }
    return false;
  }

  if (node.t === 'container') {
    if (childProduced) {
      const line = `${' '.repeat(node.depth)}${node.role}${node.name ? ` "${node.name}"` : ''}`;
      ctx.budget -= line.length + 1; // 容器行盲扣预算（阶段二行为）
      lines.push(line, ...childLines);
      return true;
    }
    return false;
  }

  // 未知节点：透传子行
  if (childProduced) { lines.push(...childLines); return true; }
  return false;
}

/** 帧分区渲染：叠加层区块（产出时才打标记）→ 主体 */
function renderFrameSection(frame, lines, ctx) {
  const overlayLines = [];
  if ((frame.overlayTrees || []).length) {
    for (const node of frame.overlayTrees) renderNode(node, overlayLines, ctx);
    if (overlayLines.length) {
      lines.push(t('pageInteraction.snapshotOverlayBlock'), ...overlayLines, t('pageInteraction.snapshotBodyBlock'));
    }
  }
  for (const node of (frame.bodyTree || [])) renderNode(node, lines, ctx);
}

/**
 * 渲染快照（唯一出口）。
 * 全局 matched 流 = 顶层（打开层→主体）→ 各帧按数组序（帧树先序，各帧内部 打开层→主体）。
 * 分页/预算跨帧统一；区块头缩进 (depth-1)*2，块内容额外缩进 2（缩进开销不计预算，近似）。
 */
export function renderSnapshot(options = {}) {
  const {
    frames = [],
    page = 1,
    maxResults = 100,
    maxChars = 6000,
    countOnly = false,
    frameCount = 0,
    framesLimited = 0,
  } = options || {};
  const pageNum = Number.isInteger(page) && page >= 1 ? page : 1;
  const pageSize = Math.max(1, maxResults);

  const stream = [];
  for (const frame of frames) {
    collectMatchedNodes(frame.overlayTrees || [], stream);
    collectMatchedNodes(frame.bodyTree || [], stream);
  }
  const total = stream.length;

  if (countOnly) {
    return { success: true, content: '', count: total, total, truncated: false, hint: '' };
  }

  const totalPages = Math.ceil(total / pageSize);
  const frameSuffix = frameCount > 0 ? t('pageInteraction.snapshotHeaderFrames', { n: frameCount }) : '';
  const limitNote = framesLimited > 0 ? t('pageInteraction.snapshotFramesLimited') : '';

  // 越界页：不渲染，返回范围提示（模型可自我纠正）
  if (total > 0 && pageNum > totalPages) {
    const content = [
      t('pageInteraction.snapshotHeader', { count: total }) + frameSuffix + limitNote,
      t('pageInteraction.snapshotPageOutOfRange', { page: pageNum, totalPages }),
      t('pageInteraction.snapshotFooter'),
    ].join('\n');
    return { success: true, content, count: 0, total, page: pageNum, totalPages, hasMore: false, truncated: false, hint: '' };
  }

  const pageStart = (pageNum - 1) * pageSize;
  const selected = new Set(stream.slice(pageStart, pageStart + pageSize));
  const hasMore = pageNum < totalPages;
  const ctx = { selected, budget: maxChars, truncated: false, count: 0 };

  // 顶层：与阶段二逐字节一致（无帧时 frameSuffix/limitNote/区块均为空）
  const lines = [];
  const topFrame = frames.find(f => f.isTop) || frames[0];
  if (topFrame) renderFrameSection(topFrame, lines, ctx);

  // 各子帧区块（数组序=帧树先序；仅渲染出内容时输出区块头；区块头缩进 (depth-1)*2，块内容额外缩进 2）
  for (const frame of frames.filter(f => f !== topFrame)) {
    const blockLines = [];
    renderFrameSection(frame, blockLines, ctx);
    if (!blockLines.length) continue;
    const indent = ' '.repeat(Math.max(0, (frame.depth || 1) - 1) * 2);
    const titleSeg = frame.frameInfo && frame.frameInfo.title ? ` "${frame.frameInfo.title}"` : '';
    const host = frameHost(frame.frameInfo && frame.frameInfo.url);
    lines.push(
      indent + t('pageInteraction.snapshotFrameBlock', { index: frame.frameIndex, title: titleSeg, hostSeg: host ? ' · ' + host : '' }),
      ...blockLines.map(l => indent + '  ' + l),
    );
  }

  const paged = totalPages > 1;
  const header = t('pageInteraction.snapshotHeader', { count: paged ? total : ctx.count })
    + frameSuffix
    + limitNote
    + (paged ? t('pageInteraction.snapshotPageInfo', { page: pageNum, totalPages, count: ctx.count }) : '')
    + (ctx.truncated ? t('pageInteraction.snapshotTruncated', { total }) : '');
  lines.unshift(header);
  if (hasMore) lines.push(t('pageInteraction.snapshotHasMore', { next: pageNum + 1 }));
  lines.push(t('pageInteraction.snapshotFooter'));

  return {
    success: true,
    content: lines.join('\n'),
    count: ctx.count,
    total,
    page: pageNum,
    totalPages,
    hasMore,
    truncated: ctx.truncated,
    hint: hasMore ? t('pageInteraction.snapshotHasMore', { next: pageNum + 1 }) : t('pageInteraction.refHint'),
  };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/shared/page-snapshot-renderer.unit.test.js`
Expected: PASS（13 条用例）

- [ ] **Step 5: 全量单测回归（确认无副作用）**

Run: `npx vitest run`
Expected: 979 通过（既有 966 + 渲染器 13）

- [ ] **Step 6: Commit**

```bash
git add src/shared/page-snapshot-renderer.js test/unit/shared/page-snapshot-renderer.unit.test.js
git commit -m "feat: 新增共享快照渲染器 page-snapshot-renderer（嵌套 ops 渲染/分页/预算语义复刻）"
```

---

### Task 2: content 侧 `collectSnapshotOps` + `queryInteractiveElements` 薄包装

**Files:**
- Modify: `src/content/page-interaction.js`（新增采集函数；`queryInteractiveElements` 改薄包装；快照 i18n 键迁出；`resolveByRef` 结构化建议；`interactByRef` 透传建议）
- Test: `test/unit/content/page-interaction.unit.test.js`（追加用例；**既有 45 条零改写**）

**Interfaces:**
- Produces: `collectSnapshotOps({ filterByText, elementTypes, frames }) → { success, frameInfo: { url, title, width, height, loadId }, overlayTrees: [treeNode], bodyTree: [treeNode] }`，失败为 `{ success: false, error }`（`frames` 默认 `'none'`）
  - treeNode 三形态：`{ t:'el', localRef, role, name, attrs, depth, children }` / `{ t:'container', role, name, depth, children }` / `{ t:'frame', title, srcUrl, sameOriginHref, orderInParent, depth }`（`status`/`frameIndex` 由 orchestrator 附加，采集侧不产生）
  - `overlayTrees`/`bodyTree` 均为**节点数组**（不合成虚拟根，pass-through 直接展开）
- Produces: `isFrameVisible() → boolean`（子帧视口尺寸 > 0；仅尺寸判据）
- Produces: `resolveByRef` 失败返回 `{ error, suggestions: [{ ref, role, name }, …≤3] }`（成功路径形状不变）；`interactByRef` 失败时透传 `suggestions`（非空才带）
- Produces: `queryInteractiveElements` 对外行为与阶段二完全一致（薄包装：collect + render）
- Consumes: `renderSnapshot`（Task 1）；现有 `collectMatches` / `registerElement` / `buildAttributeText` / `resolveAccessibleName` / `getRole` / `isElementHidden` / `isSubtreePruned` / `CONTAINER_ROLES` / `collectExpandedTargets` / `getElementChildren`（全部复用，零改动）
- 行为增强（已接受）：`countOnly` 路径现在也会注册元素编号（阶段二不注册）；输出仍不含 ref，兼容红线不受影响

- [ ] **Step 1: 追加测试（红）**

修改 `test/unit/content/page-interaction.unit.test.js` 顶部 import（原 6 项导入基础上增加 `collectSnapshotOps`、`resolveByRef`）：

```js
import {
  queryInteractiveElements,
  collectSnapshotOps,
  resolveByRef,
  getElementCount,
  getSelectorByRef,
  getElementByRef,
  interactByRef,
  scrollToText,
} from '../../../src/content/page-interaction.js';
```

在文件末尾（最后一个 `});` 之后）追加两个 describe：

```js
describe('collectSnapshotOps - 结构化 ops（阶段三数据源）', () => {
  test('基本结构：frameInfo 自报 + 嵌套 el/container 树', () => {
    document.body.innerHTML = `
      <form><button>Save</button></form>
      <button>Cancel</button>
    `;
    const ops = collectSnapshotOps({});
    expect(ops.success).toBe(true);
    expect(ops.frameInfo.url).toBe(window.location.href);
    expect(typeof ops.frameInfo.loadId).toBe('string');
    expect(ops.frameInfo.loadId.length).toBeGreaterThan(0);
    // form 容器包裹 Save；顶层 Cancel 为根级 el
    const form = ops.bodyTree.find(n => n.t === 'container' && n.role === 'form');
    expect(form).toBeTruthy();
    expect(form.children[0].t).toBe('el');
    expect(form.children[0].role).toBe('button');
    expect(form.children[0].name).toBe('Save');
    expect(typeof form.children[0].localRef).toBe('number');
    expect(form.children[0].depth).toBe(1);
    const cancel = ops.bodyTree.find(n => n.t === 'el' && n.name === 'Cancel');
    expect(cancel).toBeTruthy();
    expect(cancel.depth).toBe(0);
  });

  test('打开层独立分区：overlayTrees 含 dialog 子树，bodyTree 跳过叠加层根', () => {
    document.body.innerHTML = `
      <button id="outside">Out</button>
      <dialog open><button id="inside">In</button></dialog>
    `;
    const ops = collectSnapshotOps({});
    expect(ops.overlayTrees.length).toBeGreaterThan(0);
    const dlg = ops.overlayTrees.find(n => n.t === 'container' && n.role === 'dialog');
    expect(dlg).toBeTruthy();
    expect(dlg.children.some(c => c.t === 'el' && c.name === 'In')).toBe(true);
    // 主体树不含叠加层内部元素（去重）
    expect(JSON.stringify(ops.bodyTree)).toContain('Out');
    expect(JSON.stringify(ops.bodyTree)).not.toContain('"In"');
  });

  test('无产出的容器不采集（空 form 剔除，main 保留）', () => {
    document.body.innerHTML = `
      <form><div>text only</div></form>
      <main><button>Go</button></main>
    `;
    const ops = collectSnapshotOps({});
    const json = JSON.stringify(ops.bodyTree);
    expect(json).not.toContain('"form"');
    expect(json).toContain('"main"');
  });

  test('frames=auto → iframe 变 frame 节点；frames=none → 无 frame 节点', () => {
    document.body.innerHTML = `
      <iframe title="Pay" src="https://b.example/x"></iframe>
      <button>After</button>
    `;
    const auto = collectSnapshotOps({ frames: 'auto' });
    const frame = auto.bodyTree.find(n => n.t === 'frame');
    expect(frame).toBeTruthy();
    expect(frame.title).toBe('Pay');
    expect(frame.depth).toBe(0);
    expect(frame.srcUrl).toContain('b.example');
    expect(typeof frame.orderInParent).toBe('number');
    const none = collectSnapshotOps({ frames: 'none' });
    expect(none.bodyTree.some(n => n.t === 'frame')).toBe(false);
  });

  test('filterByText 在 ops 层生效（与阶段二一致）', () => {
    document.body.innerHTML = '<button>Save</button><button>Cancel</button>';
    const ops = collectSnapshotOps({ filterByText: 'save' });
    const json = JSON.stringify(ops.bodyTree);
    expect(json).toContain('Save');
    expect(json).not.toContain('Cancel');
  });
});

describe('resolveByRef - 结构化建议（阶段三路由翻译输入）', () => {
  test('失效 ref 返回 suggestions 结构（≤3，含 role/name）', () => {
    document.body.innerHTML = '<button>A</button><button>B</button>';
    queryInteractiveElements({});
    const bad = resolveByRef(999999);
    expect(bad.error).toBeTruthy();
    expect(Array.isArray(bad.suggestions)).toBe(true);
    expect(bad.suggestions.length).toBe(2);
    expect(bad.suggestions[0]).toEqual({
      ref: expect.any(Number),
      role: 'button',
      name: expect.any(String),
    });
  });

  test('有效 ref 正常解析、无 suggestions 字段', () => {
    document.body.innerHTML = '<button id="ok">Go</button>';
    const r = queryInteractiveElements({});
    const ok = resolveByRef(firstRef(r.content));
    expect(ok.element).toBe(document.getElementById('ok'));
    expect(ok.suggestions).toBeUndefined();
  });

  test('interactByRef 失效时透传 suggestions 字段', async () => {
    document.body.innerHTML = '<button>A</button>';
    queryInteractiveElements({});
    const r = await interactByRef(999999, 'click', { waitTime: 0, timeout: 0 });
    expect(r.success).toBe(false);
    expect(Array.isArray(r.suggestions)).toBe(true);
    expect(r.suggestions.length).toBe(1);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: FAIL（`collectSnapshotOps` / `resolveByRef` 未导出 / 行为不符）

- [ ] **Step 3: 实现（对 `src/content/page-interaction.js` 执行 7 处修改）**

**修改 1 —— 新增渲染器导入**（原导入区末尾）：

```js
import { t, registerTranslations } from '../shared/i18n.js';
import { renderSnapshot } from '../shared/page-snapshot-renderer.js';
```

**修改 2 —— zh 注册块删除 9 个已迁出的快照键**（保留 `invalidRefSuggest` 及其后所有键）：

```js
// 快照展示类 i18n 键已迁入 page-snapshot-renderer.js（Task 1），此处不得重复注册
registerTranslations('zh', {
  pageInteraction: {
    invalidRefSuggest: '无效或已过期的元素引用 ref={ref}。',
```

（即删除：`refHint`、`snapshotHeader`、`snapshotTruncated`、`snapshotPageInfo`、`snapshotHasMore`、`snapshotPageOutOfRange`、`snapshotOverlayBlock`、`snapshotBodyBlock`、`snapshotFooter` 共 9 行）

**修改 3 —— en 注册块同样删除 9 键**（保留 `invalidRefSuggest` 及其后）：

```js
// Snapshot display i18n keys moved to page-snapshot-renderer.js (Task 1); do not re-register here
registerTranslations('en', {
  pageInteraction: {
    invalidRefSuggest: 'Invalid or stale element ref={ref}. ',
```

**修改 4 —— 在 `// ==================== 树序列化与查询 ====================` 之后插入帧身份与可见性：**

```js
// ==================== 树序列化与查询 ====================

// 帧文档身份：模块加载（=文档加载）时生成一次，随 frameInfo 上报；
// orchestrator 用它检测子帧导航——重载后 loadId 变化，该帧旧编号映射整体作废
const FRAME_LOAD_ID = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;

/**
 * 帧可见性（仅尺寸判据，spec §4.1）：display:none / 零尺寸 iframe 的子帧视口为 0
 * 仅由子帧自身调用（顶层帧不适用）
 */
export function isFrameVisible() {
  return window.innerWidth > 0 && window.innerHeight > 0;
}
```

**修改 5 —— 用下方完整代码整体替换现有 `queryInteractiveElements`（含其 JSDoc；其后 `collectMatches` 及其后所有函数保持不动）：**

```js
/**
 * 查询可交互元素并输出树形快照（推荐优先使用）
 * 薄包装（阶段三）：collectSnapshotOps（本帧结构化采集）+ renderSnapshot（唯一渲染出口）
 * frames='none'：iframe 元素透传 fallback 子节点 → 输出与阶段二逐字节一致
 */
export function queryInteractiveElements(options = {}) {
  const {
    filterByText = '',
    elementTypes = null,
    page = 1,
    maxResults = 100,
    maxChars = 6000,
    countOnly = false,
  } = options;
  try {
    const ops = collectSnapshotOps({ filterByText, elementTypes, frames: 'none' });
    if (!ops.success) return ops;
    return renderSnapshot({
      frames: [{
        frameIndex: 0,
        depth: 0,
        isTop: true,
        frameInfo: ops.frameInfo,
        overlayTrees: ops.overlayTrees,
        bodyTree: ops.bodyTree,
      }],
      page,
      maxResults,
      maxChars,
      countOnly,
    });
  } catch (error) {
    console.error('[PageInteraction] queryInteractiveElements failed:', error);
    return { success: false, error: error.message };
  }
}

/**
 * iframe 元素 → frame 节点（orchestrator 与 webNavigation 帧树做三重对应的输入）
 * srcUrl 取 IDL 属性（已绝对化）；sameOriginHref 仅同源时可读（跨源访问抛异常 → null）
 */
function buildFrameNode(el, depth, ctx) {
  const title = el.getAttribute('title') || '';
  let srcUrl = '';
  try { srcUrl = el.src || ''; } catch { /* 忽略 */ }
  if (!srcUrl) srcUrl = el.getAttribute('src') || '';
  let sameOriginHref = null;
  try {
    const href = el.contentWindow && el.contentWindow.location.href;
    if (typeof href === 'string') sameOriginHref = href;
  } catch { /* 跨源：不可读 */ }
  const orderInParent = ctx.iframeOrder.has(el) ? ctx.iframeOrder.get(el) : -1;
  return { t: 'frame', title, srcUrl, sameOriginHref, orderInParent, depth };
}

/**
 * 构建树节点（复刻阶段二 renderTree 的产出判定，仅保留可产出节点）：
 * - 匹配元素（matchedSet）→ el 节点（带 localRef 与 children）；未匹配 → 透传子节点
 * - 语义容器（dialog/heading 带名）→ 仅子树产出时输出
 * - iframe（frames='auto'）→ frame 节点（不深入 fallback 内容）
 * 返回本子树是否产出节点
 */
function buildTree(el, depth, nodes, ctx) {
  if (isSubtreePruned(el)) return false;
  if (ctx.skipRoots && ctx.skipRoots.has(el)) return false;

  const role = getRole(el);
  const interactive = isInteractiveElement(el, role);
  const container = !interactive && CONTAINER_ROLES.has(role) ? role : null;
  const childDepth = depth + ((interactive || container) ? 1 : 0);

  // iframe：auto 模式构建 frame 节点（内容由子帧采集；fallback 子节点丢弃）
  if (ctx.frames === 'auto' && el.tagName === 'IFRAME') {
    nodes.push(buildFrameNode(el, depth, ctx));
    return true;
  }

  const childNodes = [];
  let childProduced = false;
  for (const child of getElementChildren(el)) {
    if (buildTree(child, childDepth, childNodes, ctx)) childProduced = true;
  }

  if (interactive && ctx.matchedSet.has(el)) {
    const effectiveRole = role || el.tagName.toLowerCase();
    const name = resolveAccessibleName(el, effectiveRole);
    nodes.push({
      t: 'el',
      localRef: elementRefMap.get(el) ?? registerElement(el, effectiveRole, name),
      role: effectiveRole,
      name,
      attrs: buildAttributeText(el, effectiveRole),
      depth,
      children: childNodes,
    });
    return true;
  }

  if (container && childProduced) {
    const cname = (container === 'dialog' || container === 'heading')
      ? resolveAccessibleName(el, role) : '';
    nodes.push({ t: 'container', role: container, name: cname, depth, children: childNodes });
    return true;
  }

  if (childProduced) {
    nodes.push(...childNodes);
    return true;
  }
  return false;
}

/**
 * 采集本帧快照 ops（结构化树，不渲染；阶段三 query_elements 数据源）
 * frames='none'（默认）：iframe 元素透传 fallback 子节点——与阶段二完全一致
 * frames='auto'：iframe 元素 → frame 节点（orchestrator 汇总各帧后统一渲染）
 */
export function collectSnapshotOps(options = {}) {
  const {
    filterByText = '',
    elementTypes = null,
    frames = 'none',
  } = options;

  try {
    elementRegistry.clear();

    // 阶段 A：收集叠加层根与匹配元素（复用阶段二 collectMatches，判定零差异）
    const expandedTargets = collectExpandedTargets();
    const overlayRoots = [];
    const matched = [];
    collectMatches(document.body, { matched, filterByText, elementTypes, overlayRoots, expandedTargets });

    // 阶段 B：发现即注册（编号经 WeakMap 跨快照稳定；countOnly 路径也注册，属阶段三行为增强）
    for (const m of matched) {
      registerElement(m.el, m.role, m.name);
    }

    // 阶段 C：构建嵌套树（打开层子树独立分区；主体树跳过打开层根，避免重复）
    const iframeOrder = new Map();
    try {
      document.querySelectorAll('iframe').forEach((el, i) => iframeOrder.set(el, i));
    } catch { /* 忽略 */ }
    const ctx = { matchedSet: new Set(matched.map(m => m.el)), frames, iframeOrder, skipRoots: null };
    const overlayTrees = [];
    for (const root of overlayRoots) {
      const nodes = [];
      buildTree(root, 0, nodes, ctx);
      overlayTrees.push(...nodes);
    }
    ctx.skipRoots = new Set(overlayRoots);
    const bodyTree = [];
    buildTree(document.body, 0, bodyTree, ctx);

    return {
      success: true,
      frameInfo: {
        url: location.href,
        title: document.title || '',
        width: window.innerWidth,
        height: window.innerHeight,
        loadId: FRAME_LOAD_ID,
      },
      overlayTrees,
      bodyTree,
    };
  } catch (error) {
    console.error('[PageInteraction] collectSnapshotOps failed:', error);
    return { success: false, error: error.message };
  }
}
```

**修改 6 —— `resolveByRef` 失败返回结构化建议**（连同 JSDoc 与 `buildInvalidRefMessage` 一并替换；`buildInvalidRefMessage` 的文案输出保持与阶段二逐字节一致）：

```js
/**
 * 统一 ref 解析：注册表命中 + isConnected 检查 + selector 兜底重查
 * 失败时返回 { error, suggestions }（结构化附近引用），供跨帧路由翻译
 */
export function resolveByRef(ref) {
  const refNum = parseInt(ref, 10);
  if (!refNum || !elementRegistry.has(refNum)) {
    return { error: buildInvalidRefMessage(refNum), suggestions: collectRefSuggestions(refNum) };
  }
  const entry = elementRegistry.get(refNum);
  if (entry.element && entry.element.isConnected) {
    ensureSelector(entry); // 成功返回前回填，供 getSelectorByRef 消费方使用
    return { entry, element: entry.element };
  }
  const selector = ensureSelector(entry);
  const found = selector ? deepQuerySelector(selector) : null;
  if (found) {
    entry.element = found;
    return { entry, element: found };
  }
  return { error: buildInvalidRefMessage(refNum), suggestions: collectRefSuggestions(refNum) };
}

/**
 * 附近有效引用列表（编号最接近优先，≤3）：结构化返回供跨帧路由翻译成全局编号
 */
function collectRefSuggestions(refNum) {
  return [...elementRegistry.entries()]
    .sort((a, b) => Math.abs(a[0] - refNum) - Math.abs(b[0] - refNum))
    .slice(0, 3)
    .map(([r, e]) => ({
      ref: r,
      role: e.role || (e.tag && e.tag.toLowerCase()) || '?',
      name: e.name || '',
    }));
}

/**
 * 构造失效 ref 的错误文案：附当前注册表中编号最接近的 ≤3 个有效引用
 */
function buildInvalidRefMessage(refNum) {
  let msg = t('pageInteraction.invalidRefSuggest', { ref: refNum });
  const alive = collectRefSuggestions(refNum);
  if (alive.length) {
    const list = alive
      .map(s => `ref ${s.ref} (${s.role}${s.name ? ` "${s.name}"` : ''})`)
      .join(', ');
    msg += t('pageInteraction.invalidRefSuggestions', { list });
  }
  msg += t('pageInteraction.invalidRefTail');
  return msg;
}
```

**修改 7 —— `interactByRef` 失效分支透传 `suggestions`**（函数体开头）：

```js
  const refNum = parseInt(ref, 10);
  const resolved = resolveByRef(refNum);
  if (resolved.error) {
    return {
      success: false,
      error: resolved.error,
      ...(resolved.suggestions && resolved.suggestions.length ? { suggestions: resolved.suggestions } : {}),
    };
  }
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/content/page-interaction.unit.test.js`
Expected: PASS（既有 45 条 + 新增 8 条）

- [ ] **Step 5: 全量单测 + lint 回归**

Run: `npx vitest run && npx eslint src/content/page-interaction.js`
Expected: 全部通过（既有 966 + 新增）

- [ ] **Step 6: Commit**

```bash
git add src/content/page-interaction.js test/unit/content/page-interaction.unit.test.js
git commit -m "refactor: query_elements 拆分 collectSnapshotOps 采集与薄包装渲染（新增帧身份/可见性与结构化建议）"
```

---

### Task 3: content 消息层（`SNAPSHOT_COLLECT` + `_frameRouted` 豁免 + SELECT_DROPDOWN 建议）

**Files:**
- Modify: `src/content/index.js`

**Interfaces:**
- Produces: 消息类型 `SNAPSHOT_COLLECT`（`{ type, filterByText?, elementTypes? }`）→ `{ success, frameInfo, overlayTrees, bodyTree }` 或 `{ success: true, visible: false }`（子帧不可见时早退）
- Produces: 消息字段 `_frameRouted: true`（orchestrator 定向发送时携带）——豁免 `TOP_FRAME_ONLY_TYPES` 护栏，使子帧处理 `INTERACT_ELEMENT` 等 ref 路由消息
- Consumes: `collectSnapshotOps` / `isFrameVisible` / `resolveByRef`（Task 2）；`t` / `contentIndex.invalidRef`（现有）
- 说明：本文件无单测（消息监听器依赖 chrome 环境），行为由 Task 8 e2e 与 Task 9 探针端到端覆盖；既有 `QUERY_ELEMENTS` handler / `TOP_FRAME_ONLY_TYPES` 内容不变（兼容红线）

- [ ] **Step 1: 修改导入与 SELECT_DROPDOWN**

修改 1 —— 导入行替换（`getSelectorByRef` 不再使用，改用 `resolveByRef`）：

```js
import {
  queryInteractiveElements, collectSnapshotOps, isFrameVisible,
  interactByRef, scrollToText, resolveByRef
} from './page-interaction.js';
```

修改 2 —— `SELECT_DROPDOWN` handler 整体替换（ref 解析改用 `resolveByRef`，失败透传结构化建议）：

```js
  SELECT_DROPDOWN:           (msg) => {
    let triggerSelector = msg.triggerSelector;
    if (msg.ref != null && !triggerSelector) {
      const resolved = resolveByRef(msg.ref);
      if (!resolved.element) {
        return {
          success: false,
          error: t('contentIndex.invalidRef', { ref: msg.ref }),
          ...(resolved.suggestions && resolved.suggestions.length ? { suggestions: resolved.suggestions } : {}),
        };
      }
      triggerSelector = resolved.entry.selector;
    }
    return selectDropdown(triggerSelector, msg.optionText, msg.optionSelector, msg.timeout);
  },
```

- [ ] **Step 2: 新增 SNAPSHOT_COLLECT handler**

在 `HANDLERS` 的 `QUERY_ELEMENTS` 行之后插入：

```js
  QUERY_ELEMENTS:            (msg) => queryInteractiveElements(msg),
  // 阶段三：子帧快照采集（orchestrator 定向发送；子帧不可见时早退不采集）
  SNAPSHOT_COLLECT:          (msg) => {
    if (window.top !== window && !isFrameVisible()) {
      return { success: true, visible: false };
    }
    return collectSnapshotOps({ filterByText: msg.filterByText, elementTypes: msg.elementTypes, frames: msg.frames === 'none' ? 'none' : 'auto' });
  },
```

（无需加入 `ASYNC_HANDLERS` / `TOP_FRAME_ONLY_TYPES`：handler 同步返回、需所有帧响应）

- [ ] **Step 3: 护栏豁免 `_frameRouted`**

修改监听器顶部护栏（`chrome.runtime.onMessage.addListener` 内首行）：

```js
  // 页面级内容获取工具：只在顶层 frame 响应，避免 iframe 响应覆盖主页面内容
  // 例外：orchestrator 定向跨帧路由的消息（_frameRouted）需子帧处理 ref
  if (TOP_FRAME_ONLY_TYPES.has(message.type) && window.top !== window && !message._frameRouted) {
    return;
  }
```

- [ ] **Step 4: 验证（lint + 构建 + 全量回归）**

Run: `npx eslint src/content/index.js && npm run build:silent && npx vitest run`
Expected: lint 无错误、构建成功、单测全部通过（既有 966 + Task 2 新增）

- [ ] **Step 5: Commit**

```bash
git add src/content/index.js
git commit -m "feat: content 消息层支持 SNAPSHOT_COLLECT 与 _frameRouted 定向豁免（含 select_dropdown 建议透出）"
```

---

### Task 4: manifest（srcdoc/about:blank 帧注入 + webNavigation 权限）

**Files:**
- Modify: `manifest.json`
- Test: `test/unit/manifest.unit.test.js`（新建）

**Interfaces:**
- Produces: `match_about_blank: true` / `match_origin_as_fallback: true`（srcdoc/数据 URL 子帧注入 content script）；`webNavigation` 权限（orchestrator 帧树枚举）
- Consumes: 无

- [ ] **Step 1: 写测试（红）**

新建 `test/unit/manifest.unit.test.js`：

```js
// manifest 单元测试：阶段三帧注入覆盖与权限（srcdoc/about:blank 帧 + webNavigation）
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const manifest = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf-8'));

describe('manifest - 阶段三帧支持', () => {
  test('permissions 含 webNavigation（帧树枚举）', () => {
    expect(manifest.permissions).toContain('webNavigation');
  });

  test('content_scripts 开启 all_frames + match_about_blank + match_origin_as_fallback', () => {
    const cs = manifest.content_scripts[0];
    expect(cs.all_frames).toBe(true);
    expect(cs.match_about_blank).toBe(true);
    expect(cs.match_origin_as_fallback).toBe(true);
    expect(cs.matches).toContain('<all_urls>');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/manifest.unit.test.js`
Expected: FAIL（webNavigation / match_about_blank 缺失）

- [ ] **Step 3: 修改 manifest.json**

修改 1 —— `permissions` 数组末尾追加：

```json
    "alarms",
    "debugger",
    "webNavigation"
```

修改 2 —— `content_scripts[0]` 增加两个匹配标志：

```json
      "run_at": "document_idle",
      "all_frames": true,
      "match_about_blank": true,
      "match_origin_as_fallback": true
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/manifest.unit.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add manifest.json test/unit/manifest.unit.test.js
git commit -m "feat: manifest 支持 srcdoc/about:blank 帧注入与 webNavigation 权限"
```

---

### Task 5: background 快照编排器 `snapshot-orchestrator.js`（最大模块）

**Files:**
- Create: `src/background/tools/snapshot-orchestrator.js`
- Test: `test/unit/snapshot-orchestrator.unit.test.js`（新建，平铺惯例同 `debugger-executor.unit.test.js`）

**Interfaces:**
- Produces（供 Task 6/7）：
  - `executeSnapshotQuery(args, toolCallId, sessionId) → Promise<结果对象>`（query_elements 的 background handler；tab 解析链 `args.tabId || getLastOperatedTab(sessionId) || getActiveTabId()`）
  - `sendDirectedMessage(tabId, frameId, message, toolCallId) → Promise<响应>`（定向发送 + 失败注入重试 300/600/1200ms）
  - `resolveGlobalRef(tabId, ref) → { frameId, localRef, globalRef } | null`
  - `translateRefSuggestions(tabId, frameId, suggestions) → [{ ref, role, name }]`（本地编号→全局编号，无映射条目丢弃）
  - `getTabQueryMode(tabId) → 'global' | 'local' | null`
- Consumes：`renderSnapshot`（Task 1）；`SNAPSHOT_COLLECT` 消息（Task 3）；`getLastOperatedTab`（`../state.js`）；`t` / `registerTranslations`（i18n 注册 `snapshotQuery.*` 命名空间）
- 核心机制（spec §3.2/§3.4/§3.5/§6）：
  - tab 维度编号表 `tabRefTables: Map<tabId, { mode, fwd: Map<'frameId:localRef', globalRef>, rev: Map<globalRef, {frameId, localRef}>, loadIds: Map<frameId, loadId> }>`；全局计数器模块级单调
  - 每次查询先 `pruneTabTable`（已消失帧）+ `purgeFrameOnReload`（loadId 变化帧）
  - 帧规划：先序遍历（children 按 frameId 升序）；纳入条件 = 父链全纳入 + depth ≤ 3 + 先序名额 ≤ 20；超限子树全部计入 `excludedIds`
  - 编号：ok + unreachable 帧按先序密集 1..F（hidden 不编号）；F>0 → mode='global'（替换为全局编号）；F=0 → mode='local'（**不替换，保持本地编号输出=阶段二逐字节一致；routing 直通**）
  - 三重对应：s1 sameOriginHref 全等 → s2 srcUrl 归一化（去尾斜杠）唯一 → s3 orderInFrameTree === orderInParent；候选 claimed 排除；失败节点标 `excluded`（宁缺勿错）；区块编号独立于节点匹配
  - content 不可访问帧 → status `unreachable`（占位行带编号 + 无区块）；`visible:false` 帧 → status `hidden`（节点移除）
  - 收集超时：子帧 400ms / 顶层 5000ms；无响应且注入失败 → unreachable；顶层无响应 → `collectFailed`

- [ ] **Step 1: 写测试（红）**

新建 `test/unit/snapshot-orchestrator.unit.test.js`：

```js
// snapshot-orchestrator 单元测试：帧枚举/定向收集/全局编号/三重对应（node 环境 + chrome mock）
import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  executeSnapshotQuery,
  resolveGlobalRef,
  getTabQueryMode,
  translateRefSuggestions,
} from '../../src/background/tools/snapshot-orchestrator.js';
import { renderSnapshot } from '../../src/shared/page-snapshot-renderer.js';

const T = (n) => 90000 + n; // 每用例唯一 tabId，避免模块级编号表串扰

function mockChrome(frames, responses, { injectFails = true } = {}) {
  const calls = [];
  const chromeMock = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ content_scripts: [{ js: ['libs/qrcode.min.js', 'src/content/index.js'] }] }),
    },
    webNavigation: { getAllFrames: async () => frames },
    tabs: {
      sendMessage: (tabId, message, options, callback) => {
        calls.push({ tabId, message, options });
        const resp = responses.get(options && options.frameId);
        if (resp === 'silent') return; // 不回调：模拟无接收方
        callback(resp);
      },
      query: (_q, cb) => cb([{ id: T(99) }]),
    },
    scripting: {
      executeScript: injectFails ? () => Promise.reject(new Error('cannot inject')) : () => Promise.resolve([]),
    },
  };
  return { chromeMock, calls };
}

const el = (localRef, role, name) => ({ t: 'el', localRef, role, name, attrs: '', depth: 0, children: [] });
const frameNode = (title, extra = {}) =>
  ({ t: 'frame', title, srcUrl: null, sameOriginHref: null, orderInParent: 0, depth: 0, ...extra });
const topOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://a.com/', title: 'A', width: 800, height: 600, loadId: 'L-top' },
  overlayTrees: [], bodyTree,
});
const childOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://b.com/', title: 'Sub', width: 300, height: 200, loadId: 'L-child' },
  overlayTrees: [], bodyTree,
});
const refsOf = (content) => [...content.matchAll(/\[ref (\d+)\]/g)].map(m => Number(m[1]));
const TWO_FRAMES = [
  { frameId: 0, parentFrameId: -1, url: 'https://a.com/' },
  { frameId: 3, parentFrameId: 0, url: 'https://b.com/' },
];

afterEach(() => vi.unstubAllGlobals());

describe('executeSnapshotQuery - 全链路', () => {
  test('单帧（无子帧）：输出与 renderSnapshot 一致且 mode=local', async () => {
    const tabId = T(1);
    const ops = topOps([el(5, 'button', 'Top')]);
    const { chromeMock } = mockChrome([{ frameId: 0, parentFrameId: -1, url: 'https://a.com/' }], new Map([[0, ops]]));
    vi.stubGlobal('chrome', chromeMock);

    const r = await executeSnapshotQuery({ tabId }, 'tc-1', null);
    expect(r.success).toBe(true);
    const expected = renderSnapshot({
      frames: [{ frameIndex: 0, depth: 0, isTop: true, frameInfo: ops.frameInfo, overlayTrees: [], bodyTree: ops.bodyTree }],
    });
    expect(r.content).toBe(expected.content);
    expect(r.count).toBe(expected.count);
    expect(getTabQueryMode(tabId)).toBe('local');
  });

  test('双帧（s1 同源精确匹配）：全局编号/区块/占位行/映射', async () => {
    const tabId = T(2);
    const responses = new Map([
      [0, topOps([el(5, 'button', 'Top'), frameNode('Sub', { sameOriginHref: 'https://b.com/' })])],
      [3, childOps([el(2, 'textbox', 'Card')])],
    ]);
    const { chromeMock } = mockChrome(TWO_FRAMES, responses);
    vi.stubGlobal('chrome', chromeMock);

    const r = await executeSnapshotQuery({ tabId }, 'tc-2', null);
    expect(r.success).toBe(true);
    expect(getTabQueryMode(tabId)).toBe('global');
    expect(r.content).toContain('（含 1 个 iframe）');
    expect(r.content).toContain('iframe #1 "Sub"');
    expect(r.content).toContain('[frame #1 "Sub" · b.com]');
    expect(r.content).toContain('textbox "Card"');
    // 全局编号替换：顶层先分配，子帧随后（流序）
    const refs = refsOf(r.content);
    expect(refs.length).toBe(2);
    expect(resolveGlobalRef(tabId, refs[0])).toEqual({ frameId: 0, localRef: 5, globalRef: refs[0] });
    expect(resolveGlobalRef(tabId, refs[1])).toEqual({ frameId: 3, localRef: 2, globalRef: refs[1] });
    expect(refs[1]).toBe(refs[0] + 1);
  });

  test('双帧（s2 srcUrl 归一化匹配）：sameOriginHref 为 null 也可挂接', async () => {
    const tabId = T(3);
    const responses = new Map([
      [0, topOps([frameNode('Sub', { srcUrl: 'https://b.com/' })])], // 尾斜杠差异由归一化吸收
      [3, childOps([el(7, 'link', 'Go')])],
    ]);
    const { chromeMock } = mockChrome(
      [{ frameId: 0, parentFrameId: -1, url: 'https://a.com/' }, { frameId: 3, parentFrameId: 0, url: 'https://b.com' }],
      responses,
    );
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId }, 'tc-3', null);
    expect(r.content).toContain('iframe #1 "Sub"');
    expect(r.content).toContain('[frame #1 "Sub" · b.com]');
  });

  test('子帧不可见（visible:false）：节点移除、无区块、mode 回退 local', async () => {
    const tabId = T(4);
    const responses = new Map([
      [0, topOps([el(5, 'button', 'Top'), frameNode('Hidden')])],
      [3, { success: true, visible: false }],
    ]);
    const { chromeMock } = mockChrome(TWO_FRAMES, responses);
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId }, 'tc-4', null);
    expect(r.content).not.toContain('iframe');
    expect(r.content).not.toContain('[frame');
    expect(r.content).toContain('[ref 5]'); // local 模式：保留本地编号
    expect(getTabQueryMode(tabId)).toBe('local');
  });

  test('子帧无响应：unreachable 占位行带编号，无区块', async () => {
    const tabId = T(5);
    const responses = new Map([
      [0, topOps([frameNode('Dead', { sameOriginHref: 'https://b.com/' })])],
      [3, 'silent'],
    ]);
    const { chromeMock } = mockChrome(TWO_FRAMES, responses); // 注入失败 → 直接 unreachable
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId }, 'tc-5', null);
    expect(r.success).toBe(true);
    expect(r.content).toContain('iframe #1 "Dead"（内容不可访问）');
    expect(r.content).not.toContain('[frame #1');
    expect(r.content).toContain('（含 1 个 iframe）');
  });

  test('frames:none：跳过帧枚举、本地编号输出、mode=local', async () => {
    const tabId = T(6);
    const noneOps = topOps([el(5, 'button', 'Top')]); // none 模式 content 侧不产生 frame 节点
    const { chromeMock, calls } = mockChrome(TWO_FRAMES, new Map([[0, noneOps], [3, 'silent']]));
    vi.stubGlobal('chrome', chromeMock);
    const r = await executeSnapshotQuery({ tabId, frames: 'none' }, 'tc-6', null);
    expect(r.success).toBe(true);
    expect(r.content).toContain('[ref 5]'); // 本地编号直出
    expect(r.content).not.toContain('iframe');
    expect(getTabQueryMode(tabId)).toBe('local');
    // 仅向顶层发送（无子帧定向消息）
    expect(calls.every(c => c.options && c.options.frameId === 0)).toBe(true);
  });

  test('未查询 tab：resolveGlobalRef 为 null，mode 为 null', () => {
    expect(resolveGlobalRef(T(50), 1)).toBeNull();
    expect(getTabQueryMode(T(50))).toBeNull();
    expect(translateRefSuggestions(T(50), 0, [{ ref: 1, role: 'button', name: '' }])).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/snapshot-orchestrator.unit.test.js`
Expected: FAIL（模块不存在）

- [ ] **Step 3: 实现编排器**

新建 `src/background/tools/snapshot-orchestrator.js`（完整代码）：

```js
// background/tools/snapshot-orchestrator.js - query_elements 编排器（阶段三）
// 职责：webNavigation 帧枚举 → 并行定向收集各帧 ops → frame 节点与帧树三重对应 →
//       按 tab 维护局部↔全局编号表 → 组装 frames[] → 共享渲染器渲染
// 另提供 ref 跨帧路由辅助（sendDirectedMessage / resolveGlobalRef / translateRefSuggestions / getTabQueryMode）
import { t, registerTranslations } from '../../shared/i18n.js';
import { renderSnapshot } from '../../shared/page-snapshot-renderer.js';
import { getLastOperatedTab } from '../state.js';

registerTranslations('zh', {
  snapshotQuery: {
    noTab: '没有可用的标签页',
    collectFailed: '快照采集失败：无法访问页面内容',
    tabAccessDenied: '无法访问该标签页（{error}）',
    systemPageNotAllowed: '无法在系统页面执行此操作：{url}',
    frameGone: '目标 iframe 已被移除或导航，请重新调用 query_elements',
    invalidRef: '无效或已过期的元素引用 ref={ref}，请重新调用 query_elements',
    invalidRefSuggest: '无效或已过期的元素引用 ref={ref}。',
    invalidRefSuggestions: '最近快照中的有效引用：{list}。',
    invalidRefTail: '如页面已变化，请重新调用 query_elements 获取最新快照',
    invalidRefField: '字段 ref={ref} 无效，请重新调用 query_elements',
    formFillMerged: '表单填写完成：成功 {success}/{total} 个字段',
    formFillFailures: '失败字段：{list}',
    directedSendFailed: '无法向目标 iframe 发送消息（可能已被移除或导航）',
  },
});

registerTranslations('en', {
  snapshotQuery: {
    noTab: 'No available tab',
    collectFailed: 'Snapshot collection failed: page content is not accessible',
    tabAccessDenied: 'Cannot access the tab ({error})',
    systemPageNotAllowed: 'This action cannot run on a system page: {url}',
    frameGone: 'The target iframe was removed or navigated; re-run query_elements',
    invalidRef: 'Invalid or stale element ref={ref}; re-run query_elements',
    invalidRefSuggest: 'Invalid or stale element ref={ref}. ',
    invalidRefSuggestions: 'Nearest valid refs from the latest snapshot: {list}. ',
    invalidRefTail: 'If the page has changed, re-run query_elements',
    invalidRefField: 'Invalid ref={ref} for field; re-run query_elements',
    formFillMerged: 'Form fill complete: {success}/{total} field(s) succeeded',
    formFillFailures: 'Failed fields: {list}',
    directedSendFailed: 'Cannot send a message to the target iframe (it may have been removed or navigated)',
  },
});

// ==================== 常量 ====================

const FRAME_COLLECT_TIMEOUT_MS = 400;   // 子帧采集超时
const TOP_COLLECT_TIMEOUT_MS = 5000;    // 顶层帧采集超时
const MAX_VISIBLE_FRAMES = 20;          // 收集名额上限（先序分配）
const MAX_FRAME_DEPTH = 3;              // 帧嵌套深度上限（距顶层层数）

// ==================== 全局编号表（tab 维度） ====================
// frameId 是 tab 作用域；编号经 fwd/rev 双表维护：同一帧同一元素的全局号跨快照稳定。
// mode='global' 时 ref 工具走跨帧路由；mode='local'（无可见帧）时本地编号与 routing 均走 legacy。

let globalRefCounter = 0;
const tabRefTables = new Map(); // tabId → { mode, fwd, rev, loadIds }

function getTabTable(tabId) {
  let table = tabRefTables.get(tabId);
  if (!table) {
    table = { mode: 'local', fwd: new Map(), rev: new Map(), loadIds: new Map() };
    tabRefTables.set(tabId, table);
  }
  return table;
}

/** 当前 tab 的查询模式：'global'（上次快照含可见帧）/ 'local' / null（未查询过） */
export function getTabQueryMode(tabId) {
  const table = tabRefTables.get(tabId);
  return table ? table.mode : null;
}

/** 清理已消失帧的编号映射（帧被移除后其编号不应再路由） */
function pruneTabTable(table, liveFrameIds) {
  for (const [key, globalRef] of [...table.fwd]) {
    const frameId = Number(key.split(':')[0]);
    if (!liveFrameIds.has(frameId)) {
      table.fwd.delete(key);
      table.rev.delete(globalRef);
      table.loadIds.delete(frameId);
    }
  }
}

/** 帧重载（loadId 变化）→ 该帧旧编号映射整体作废（新文档不复用旧编号） */
function purgeFrameOnReload(table, frameId, loadId) {
  const prev = table.loadIds.get(frameId);
  if (prev && loadId && prev !== loadId) {
    for (const [key, globalRef] of [...table.fwd]) {
      if (key.startsWith(`${frameId}:`)) {
        table.fwd.delete(key);
        table.rev.delete(globalRef);
      }
    }
  }
  if (loadId) table.loadIds.set(frameId, loadId);
}

/** 先序遍历替换树中 el 节点的 localRef 为全局编号（分配顺序 = 全局流序） */
function replaceRefsWithGlobals(nodes, table, frameId) {
  for (const node of nodes) {
    if (node.t === 'el' && node.localRef != null) {
      const key = `${frameId}:${node.localRef}`;
      let globalRef = table.fwd.get(key);
      if (globalRef == null) {
        globalRefCounter += 1;
        globalRef = globalRefCounter;
        table.fwd.set(key, globalRef);
        table.rev.set(globalRef, { frameId, localRef: node.localRef });
      }
      node.localRef = globalRef;
    }
    if (node.children && node.children.length) replaceRefsWithGlobals(node.children, table, frameId);
  }
}

/** 全局编号 → { frameId, localRef }（不在表中返回 null） */
export function resolveGlobalRef(tabId, ref) {
  const table = tabRefTables.get(tabId);
  if (!table) return null;
  const refNum = parseInt(ref, 10);
  const mapping = table.rev.get(refNum);
  if (!mapping) return null;
  return { frameId: mapping.frameId, localRef: mapping.localRef, globalRef: refNum };
}

/** 把子帧建议（本地编号）翻译为全局编号（无映射条目丢弃） */
export function translateRefSuggestions(tabId, frameId, suggestions) {
  const table = tabRefTables.get(tabId);
  if (!table || !Array.isArray(suggestions) || !suggestions.length) return [];
  const out = [];
  for (const s of suggestions) {
    const globalRef = table.fwd.get(`${frameId}:${s.ref}`);
    if (globalRef != null) out.push({ ref: globalRef, role: s.role || '', name: s.name || '' });
  }
  return out;
}

// ==================== 帧树规划 ====================

/**
 * 帧树规划：先序遍历（children 按 frameId 升序）；纳入条件 = 父链全纳入 + depth ≤ 3 + 先序名额 ≤ 20
 * 超限子树全部计入 excludedIds（framesLimited 注记）
 */
function planFrames(allFrames) {
  const childrenByParent = new Map();
  for (const f of allFrames) {
    if (!childrenByParent.has(f.parentFrameId)) childrenByParent.set(f.parentFrameId, []);
    childrenByParent.get(f.parentFrameId).push(f);
  }
  for (const list of childrenByParent.values()) list.sort((a, b) => a.frameId - b.frameId);

  const effective = new Map();
  const excludedIds = new Set();
  const order = [];
  let slot = 0;

  const root = allFrames.find(f => f.frameId === 0);
  if (!root) return { effective, excludedIds, order, childrenByParent };
  effective.set(0, { frameId: 0, parentFrameId: -1, url: root.url || '', depth: 0, orderInParent: -1 });

  const markSubtreeExcluded = (frameId) => {
    excludedIds.add(frameId);
    for (const child of (childrenByParent.get(frameId) || [])) markSubtreeExcluded(child.frameId);
  };

  const walk = (frame, depth) => {
    const children = childrenByParent.get(frame.frameId) || [];
    children.forEach((child, i) => {
      const childDepth = depth + 1;
      if (childDepth > MAX_FRAME_DEPTH || slot >= MAX_VISIBLE_FRAMES) {
        markSubtreeExcluded(child.frameId);
        return;
      }
      slot += 1;
      effective.set(child.frameId, {
        frameId: child.frameId,
        parentFrameId: frame.frameId,
        url: child.url || '',
        depth: childDepth,
        orderInParent: i,
      });
      order.push(child.frameId);
      walk(child, childDepth);
    });
  };
  walk(root, 0);
  return { effective, excludedIds, order, childrenByParent };
}

// ==================== 帧节点三重对应 ====================

/** 收集 ops 树中全部 frame 节点（先序扁平化） */
function collectFrameNodesFromOps(ops) {
  const out = [];
  const walk = (nodes) => {
    for (const node of nodes) {
      if (node.t === 'frame') out.push(node);
      if (node.children && node.children.length) walk(node.children);
    }
  };
  walk(ops.overlayTrees || []);
  walk(ops.bodyTree || []);
  return out;
}

const normalizeUrl = (u) => (u || '').replace(/\/+$/, '');

/**
 * 三重对应：s1 sameOriginHref 全等 → s2 srcUrl 归一化唯一 → s3 出现次序相等
 * 候选被 claimed 排除（每 child 帧至多一个节点）；失败不强行匹配（宁缺勿错）
 */
function matchFrameNodes(childInfos, treeNodes) {
  const claimed = new Set();
  const matched = new Map();
  const tryMatch = (child, candidates) => {
    const free = candidates.filter(n => !claimed.has(n));
    if (free.length === 1) {
      claimed.add(free[0]);
      matched.set(child.frameId, free[0]);
    }
  };
  const pending = () => childInfos.filter(c => !matched.has(c.frameId));

  for (const child of pending()) {
    tryMatch(child, treeNodes.filter(n => n.sameOriginHref && n.sameOriginHref === child.url));
  }
  for (const child of pending()) {
    const target = normalizeUrl(child.url);
    tryMatch(child, treeNodes.filter(n => n.srcUrl && normalizeUrl(n.srcUrl) === target));
  }
  for (const child of pending()) {
    tryMatch(child, treeNodes.filter(n => n.orderInParent >= 0 && n.orderInParent === child.orderInParent));
  }
  return { matched, claimed };
}

/** 标记父帧树中的 frame 节点（status/frameIndex）；未匹配节点标 excluded */
function markFrameNodes(parentFrameId, resp, plan, statuses, frameIndexMap) {
  const childInfos = (plan.childrenByParent.get(parentFrameId) || [])
    .filter(f => plan.effective.has(f.frameId));
  if (!childInfos.length) return;
  const frameNodes = collectFrameNodesFromOps(resp);
  if (!frameNodes.length) return;

  const { matched } = matchFrameNodes(childInfos, frameNodes);
  const nodeOwner = new Map();
  for (const [frameId, node] of matched) nodeOwner.set(node, frameId);

  for (const node of frameNodes) {
    const owner = nodeOwner.get(node);
    if (owner == null) { node.status = 'excluded'; continue; }
    const st = statuses.get(owner);
    if (st === 'hidden') { node.status = 'hidden'; continue; }
    node.status = st === 'unreachable' ? 'unreachable' : 'ok';
    node.frameIndex = frameIndexMap.get(owner);
  }
}

// ==================== 定向收集 ====================

/** 单次定向发送（带超时保护）：无接收方/超时返回 undefined */
function sendOnce(tabId, frameId, message, timeoutMs) {
  return new Promise((resolve) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) { settled = true; resolve(undefined); }
    }, timeoutMs);
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (chrome.runtime.lastError || !response) { resolve(undefined); return; }
      resolve(response);
    });
  });
}

/** 向指定帧注入 content script（与 tool-executor 同策略：取含 content 的脚本文件） */
function injectContentScriptIntoFrame(tabId, frameId) {
  const manifest = chrome.runtime.getManifest();
  const contentJsFiles = (manifest.content_scripts && manifest.content_scripts[0] && manifest.content_scripts[0].js) || [];
  const contentFileIdx = contentJsFiles.findIndex(f => /content/i.test(f) && f.endsWith('.js'));
  const injectFiles = contentFileIdx !== -1 ? [contentJsFiles[contentFileIdx]] : contentJsFiles;
  if (!injectFiles.length) return Promise.reject(new Error('no content script files found'));
  return chrome.scripting.executeScript({ target: { tabId, frameIds: [frameId] }, files: injectFiles });
}

/**
 * 收集单帧 ops（含超时与失败注入重试）
 * 子帧超时 400ms / 顶层 5000ms；无响应且注入失败 → undefined（unreachable）
 */
async function collectFrame(tabId, frameId, isTop, filterByText, elementTypes, framesMode = 'auto') {
  const budgetMs = isTop ? TOP_COLLECT_TIMEOUT_MS : FRAME_COLLECT_TIMEOUT_MS;
  const message = { type: 'SNAPSHOT_COLLECT', filterByText, elementTypes, frames: framesMode, _frameRouted: true };
  const first = await sendOnce(tabId, frameId, message, budgetMs);
  if (first !== undefined) return first;
  try {
    await injectContentScriptIntoFrame(tabId, frameId);
  } catch {
    return undefined;
  }
  return sendOnce(tabId, frameId, message, Math.max(300, Math.floor(budgetMs / 2)));
}

// ==================== 定向消息（ref 跨帧路由） ====================

/**
 * 定向消息发送（ref 跨帧路由专用）：定向 frameId；失败时注入目标帧后指数退避重试
 * 调用方需在 message 中携带 _frameRouted: true（豁免子帧顶层护栏）
 */
export function sendDirectedMessage(tabId, frameId, message, toolCallId) {
  return new Promise((resolve) => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (!chrome.runtime.lastError && response) {
        resolve({ ...response, tool_call_id: toolCallId });
        return;
      }
      injectContentScriptIntoFrame(tabId, frameId)
        .then(() => retryDirectedSend(tabId, frameId, message, toolCallId, 0, resolve))
        .catch(() => resolve({ success: false, error: t('snapshotQuery.directedSendFailed'), tool_call_id: toolCallId }));
    });
  });
}

function retryDirectedSend(tabId, frameId, message, toolCallId, attempt, resolve) {
  const delays = [300, 600, 1200];
  setTimeout(() => {
    chrome.tabs.sendMessage(tabId, message, { frameId }, (response) => {
      if (!chrome.runtime.lastError && response) {
        resolve({ ...response, tool_call_id: toolCallId });
        return;
      }
      if (attempt < delays.length - 1) {
        retryDirectedSend(tabId, frameId, message, toolCallId, attempt + 1, resolve);
      } else {
        resolve({ success: false, error: t('snapshotQuery.directedSendFailed'), tool_call_id: toolCallId });
      }
    });
  }, delays[attempt]);
}

// ==================== 主流程 ====================

function getActiveTabId() {
  return new Promise((resolve) => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      resolve(tabs && tabs.length > 0 ? tabs[0].id : null);
    });
  });
}

/** frames='none'：仅顶层帧采集（本地编号；不枚举帧树） */
async function executeTopOnlyQuery(targetTabId, table, args, toolCallId, filterByText, elementTypes) {
  const resp = await collectFrame(targetTabId, 0, true, filterByText, elementTypes, 'none');
  if (!resp || resp.visible === false || !resp.success || !resp.frameInfo) {
    return { success: false, error: t('snapshotQuery.collectFailed'), tool_call_id: toolCallId };
  }
  // none 模式：编号为本地编号 → 模式置 local（ref 路由走 legacy 直通）
  table.mode = 'local';
  table.fwd.clear();
  table.rev.clear();
  return renderSnapshot({
    frames: [{
      frameIndex: 0,
      depth: 0,
      isTop: true,
      frameInfo: resp.frameInfo,
      overlayTrees: resp.overlayTrees || [],
      bodyTree: resp.bodyTree || [],
    }],
    page: args.page,
    maxResults: args.maxResults,
    maxChars: args.maxChars,
    countOnly: args.countOnly,
    frameCount: 0,
    framesLimited: 0,
  });
}

/** query_elements 的 background 入口（TOOL_HANDLERS 接线，Task 7） */
export async function executeSnapshotQuery(args, toolCallId, sessionId) {
  try {
    const lastOperatedTab = sessionId ? getLastOperatedTab(sessionId) : null;
    const targetTabId = args.tabId || lastOperatedTab || await getActiveTabId();
    if (!targetTabId) {
      return { success: false, error: t('snapshotQuery.noTab'), tool_call_id: toolCallId };
    }

    const table = getTabTable(targetTabId);
    const filterByText = args.filterByText || '';
    const elementTypes = args.elementTypes || null;

    // frames='none'：仅顶层采集（本地编号输出；routing 走 legacy 直通）
    if (args.frames === 'none') {
      return executeTopOnlyQuery(targetTabId, table, args, toolCallId, filterByText, elementTypes);
    }

    const allFrames = await chrome.webNavigation.getAllFrames({ tabId: targetTabId });
    if (!allFrames || !allFrames.length) {
      return { success: false, error: t('snapshotQuery.collectFailed'), tool_call_id: toolCallId };
    }

    pruneTabTable(table, new Set(allFrames.map(f => f.frameId)));

    const plan = planFrames(allFrames);
    if (!plan.effective.has(0)) {
      return { success: false, error: t('snapshotQuery.collectFailed'), tool_call_id: toolCallId };
    }

    // 并行定向收集（顶层 + effective 帧）
    const collected = new Map(await Promise.all(
      [...plan.effective.keys()].map(async (frameId) => {
        const resp = await collectFrame(targetTabId, frameId, frameId === 0, filterByText, elementTypes);
        return [frameId, resp];
      })
    ));

    // 顶层采集失败：无法提供快照
    const topResp = collected.get(0);
    if (!topResp || topResp.visible === false || !topResp.frameInfo) {
      return { success: false, error: t('snapshotQuery.collectFailed'), tool_call_id: toolCallId };
    }

    // 状态判定 + 帧重载检测
    const statuses = new Map();
    for (const [frameId, resp] of collected) {
      let status;
      if (!resp) status = 'unreachable';
      else if (resp.visible === false) status = 'hidden';
      else if (resp.success && resp.frameInfo) status = 'ok';
      else status = 'unreachable';
      statuses.set(frameId, status);
      if (status === 'ok') purgeFrameOnReload(table, frameId, resp.frameInfo.loadId);
    }

    // 帧编号：ok + unreachable 先序密集 1..F（hidden 不编号）
    const frameIndexMap = new Map();
    let idx = 0;
    for (const frameId of plan.order) {
      const st = statuses.get(frameId);
      if (st === 'ok' || st === 'unreachable') {
        idx += 1;
        frameIndexMap.set(frameId, idx);
      }
    }

    if (frameIndexMap.size > 0) {
      table.mode = 'global';
      // 替换顺序 = 全局流序（effective 插入序即先序）
      for (const frameId of plan.effective.keys()) {
        if (statuses.get(frameId) !== 'ok') continue;
        const resp = collected.get(frameId);
        replaceRefsWithGlobals(resp.overlayTrees || [], table, frameId);
        replaceRefsWithGlobals(resp.bodyTree || [], table, frameId);
      }
    } else {
      table.mode = 'local';
      table.fwd.clear();
      table.rev.clear();
    }

    // frame 节点标记（对每个 ok 帧的树）
    for (const frameId of plan.effective.keys()) {
      if (statuses.get(frameId) !== 'ok') continue;
      markFrameNodes(frameId, collected.get(frameId), plan, statuses, frameIndexMap);
    }

    // 组装渲染帧数组（数组序 = 帧树先序；顶层恒第一）
    const renderFrames = [{
      frameIndex: 0,
      depth: 0,
      isTop: true,
      frameInfo: topResp.frameInfo,
      overlayTrees: topResp.overlayTrees || [],
      bodyTree: topResp.bodyTree || [],
    }];
    for (const frameId of plan.order) {
      if (statuses.get(frameId) !== 'ok') continue;
      const resp = collected.get(frameId);
      const info = plan.effective.get(frameId);
      renderFrames.push({
        frameIndex: frameIndexMap.get(frameId),
        depth: info.depth,
        isTop: false,
        frameInfo: resp.frameInfo,
        overlayTrees: resp.overlayTrees || [],
        bodyTree: resp.bodyTree || [],
      });
    }

    return renderSnapshot({
      frames: renderFrames,
      page: args.page,
      maxResults: args.maxResults,
      maxChars: args.maxChars,
      countOnly: args.countOnly,
      frameCount: frameIndexMap.size,
      framesLimited: plan.excludedIds.size,
    });
  } catch (error) {
    console.error('[SnapshotOrchestrator] executeSnapshotQuery failed:', error);
    return { success: false, error: t('snapshotQuery.collectFailed'), tool_call_id: toolCallId };
  }
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/snapshot-orchestrator.unit.test.js`
Expected: PASS（7 条用例）

- [ ] **Step 5: 全量单测 + lint 回归**

Run: `npx vitest run && npx eslint src/background/tools/snapshot-orchestrator.js`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add src/background/tools/snapshot-orchestrator.js test/unit/snapshot-orchestrator.unit.test.js
git commit -m "feat: background 快照编排器 snapshot-orchestrator（帧枚举/全局编号/三重对应/定向收集）"
```

---

### Task 6: ref 工具跨帧路由（`shouldRouteRefTool` / `routeSingleRefTool` / `routeFillForm`）

**Files:**
- Modify: `src/background/tools/snapshot-orchestrator.js`（文件末尾追加"ref 工具跨帧路由"区段）
- Modify: `src/background/tool-executor.js`（import 扩展 + `maybeRouteRefTool` + `executeTool` content_script 分支拦截）
- Test: `test/unit/ref-routing.unit.test.js`（新建，平铺惯例）

**Interfaces:**
- Consumes（Task 5 已导出）：`getTabQueryMode` / `resolveGlobalRef` / `sendDirectedMessage` / `translateRefSuggestions`
- Consumes（content 侧响应约定）：
  - `INTERACT_ELEMENT` / `SELECT_DROPDOWN` 失败：`{ success: false, error, suggestions?: [{ ref, role, name }] }`（建议为**本地编号**，Task 2/3 透传）
  - `FILL_FORM` 响应：`{ success, message, details: [{ selector, success, value?, error? }] }`（既有 `interaction-tools.js#fillForm`，`details` 与发送的 `fields` **下标对齐**）
- Produces（Task 7 e2e / Task 9 探针消费）：
  - `shouldRouteRefTool(toolName, args, targetTabId) → boolean`——mode='global' 且带 ref 的交互工具 → true
  - `routeSingleRefTool(toolName, args, toolCallId, targetTabId) → Promise<结果>`——全局 ref → 定向发送本地化消息 → 结果翻译
  - `routeFillForm(args, toolCallId, targetTabId) → Promise<结果>`——fields 按归属帧分组 → 逐组发送 → 合并统计与失败清单
  - `translateRoutedResult(response, mapping, targetTabId) → 结果`——failure + suggestions → 用全局编号重建错误文案
- tool-executor `executeTool`：content_script 分支在 legacy 发送前调用 `maybeRouteRefTool`（内部封装 `shouldRouteRefTool`），命中即跳过 `sendToContentScriptWithRetry`

**设计要点：**
- 顶层帧元素（frameId=0）同样走定向发送（frameId=0 即主帧，语义与 legacy 等价；统一路径并附带注入重试）
- `select_dropdown` 带 `triggerSelector` 时 `ref` 被 content 侧忽略（既有语义）→ 不路由，走 legacy
- `fill_form` 无 ref 字段（纯 selector）归顶层帧 frameId=0；归属解析失败的字段**不发送**，直接计入失败清单（错误文案 `snapshotQuery.invalidRefField`）
- 失败清单条目格式：`${selector}（frame N）`；无效 ref 字段无 frame 标注；仅在有失败时附 `error`（首个失败原因）
- ref 失效建议：content 建议基于本地编号 → 翻译为全局编号（无映射条目丢弃）；重建文案 = `invalidRefSuggest` + 可选 `invalidRefSuggestions` + `invalidRefTail`，仅当响应**带非空 suggestions 数组**时才重建（普通执行失败保留原文案）

- [ ] **Step 1: 写测试（红）**

新建 `test/unit/ref-routing.unit.test.js`：

```js
// ref 跨帧路由单元测试：定向发送/失效建议翻译/fill_form 拆分合并（node 环境 + chrome mock）
import { describe, test, expect, afterEach, vi } from 'vitest';
import {
  executeSnapshotQuery,
  resolveGlobalRef,
  getTabQueryMode,
  shouldRouteRefTool,
  routeSingleRefTool,
  routeFillForm,
  translateRoutedResult,
} from '../../src/background/tools/snapshot-orchestrator.js';

const T = (n) => 95000 + n; // 每用例唯一 tabId，避免模块级编号表串扰
const TWO_FRAMES = [
  { frameId: 0, parentFrameId: -1, url: 'https://a.com/' },
  { frameId: 3, parentFrameId: 0, url: 'https://b.com/' },
];
const el = (localRef, role, name) => ({ t: 'el', localRef, role, name, attrs: '', depth: 0, children: [] });
const frameNode = (title, extra = {}) =>
  ({ t: 'frame', title, srcUrl: null, sameOriginHref: null, orderInParent: 0, depth: 0, ...extra });
const topOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://a.com/', title: 'A', width: 800, height: 600, loadId: 'L-top' },
  overlayTrees: [],
  bodyTree,
});
const childOps = (bodyTree) => ({
  success: true,
  frameInfo: { url: 'https://b.com/', title: 'Sub', width: 300, height: 200, loadId: 'L-child' },
  overlayTrees: [],
  bodyTree,
});

/** handlers: Map<frameId, (msg) => 响应>；handler 非函数模拟无接收方（不回调） */
function mockChrome(frames, handlers) {
  const calls = [];
  const chromeMock = {
    runtime: {
      lastError: undefined,
      getManifest: () => ({ content_scripts: [{ js: ['libs/qrcode.min.js', 'src/content/index.js'] }] }),
    },
    webNavigation: { getAllFrames: async () => frames },
    tabs: {
      sendMessage: (tabId, message, options, callback) => {
        calls.push({ tabId, message, options });
        const handler = handlers.get(options && options.frameId);
        if (typeof handler !== 'function') return;
        callback(handler(message));
      },
      query: (_q, cb) => cb([{ id: T(99) }]),
    },
    scripting: { executeScript: () => Promise.reject(new Error('cannot inject')) },
  };
  return { chromeMock, calls };
}

const CHILD_BODY = [el(2, 'textbox', 'Card'), el(4, 'button', 'Go')];

/** 建一个 mode=global 的 tab：顶层 [button "Top", frame "Sub"]，子帧 [textbox "Card", button "Go"] */
async function setupGlobalTab(n, fillResponses = {}) {
  const tabId = T(n);
  const handlers = new Map([
    [0, (msg) => msg.type === 'FILL_FORM'
      ? (fillResponses.top || { success: true, message: 'ok', details: [] })
      : topOps([el(5, 'button', 'Top'), frameNode('Sub', { sameOriginHref: 'https://b.com/' })])],
    [3, (msg) => msg.type === 'FILL_FORM'
      ? (fillResponses.child || { success: true, message: 'ok', details: [] })
      : childOps(CHILD_BODY)],
  ]);
  const { chromeMock, calls } = mockChrome(TWO_FRAMES, handlers);
  vi.stubGlobal('chrome', chromeMock);
  const r = await executeSnapshotQuery({ tabId }, `setup-${n}`, null);
  expect(r.success).toBe(true);
  expect(getTabQueryMode(tabId)).toBe('global');
  const refFor = (name) => {
    const line = r.content.split('\n').find(l => l.includes(`"${name}"`) && l.includes('[ref '));
    const m = line && line.match(/\[ref (\d+)\]/);
    return m ? Number(m[1]) : null;
  };
  return { tabId, calls, refFor, content: r.content };
}

/** 建一个 mode=local 的 tab（无子帧） */
async function setupLocalTab(n) {
  const tabId = T(n);
  const handlers = new Map([[0, () => topOps([el(1, 'button', 'Solo')])]]);
  const { chromeMock, calls } = mockChrome(
    [{ frameId: 0, parentFrameId: -1, url: 'https://a.com/' }], handlers,
  );
  vi.stubGlobal('chrome', chromeMock);
  const r = await executeSnapshotQuery({ tabId }, `setup-local-${n}`, null);
  expect(r.success).toBe(true);
  expect(getTabQueryMode(tabId)).toBe('local');
  return { tabId, calls };
}

afterEach(() => vi.unstubAllGlobals());

describe('shouldRouteRefTool - 路由判定矩阵', () => {
  test('global 模式下按 ref 判定；local / 未查询 tab 不路由', async () => {
    const { tabId } = await setupGlobalTab(2);
    expect(shouldRouteRefTool('interact_element', { ref: 1 }, tabId)).toBe(true);
    expect(shouldRouteRefTool('interact_element', { selector: '#x' }, tabId)).toBe(false);
    expect(shouldRouteRefTool('select_dropdown', { ref: 1 }, tabId)).toBe(true);
    // triggerSelector 存在时 ref 被 content 侧忽略 → legacy 直通
    expect(shouldRouteRefTool('select_dropdown', { ref: 1, triggerSelector: '#t' }, tabId)).toBe(false);
    expect(shouldRouteRefTool('fill_form', { fields: [{ selector: '#a', value: 'v' }] }, tabId)).toBe(false);
    expect(shouldRouteRefTool('fill_form', { fields: [{ selector: '#a', value: 'v' }, { ref: 1, value: 'w' }] }, tabId)).toBe(true);
    expect(shouldRouteRefTool('fill_form', { fields: [] }, tabId)).toBe(false);

    const local = await setupLocalTab(2);
    expect(shouldRouteRefTool('interact_element', { ref: 1 }, local.tabId)).toBe(false);
    expect(shouldRouteRefTool('interact_element', { ref: 1 }, T(98))).toBe(false); // 未查询过
  });
});

describe('routeSingleRefTool - 单 ref 工具路由', () => {
  test('interact_element：全局 ref 定向发送到所属帧（消息 ref=本地编号 + _frameRouted）', async () => {
    const { tabId, calls, refFor } = await setupGlobalTab(1);
    const cardRef = refFor('Card'); // 子帧元素
    expect(cardRef).not.toBeNull();

    const before = calls.length;
    const r = await routeSingleRefTool('interact_element', { ref: cardRef, action: 'click' }, 'tc-1', tabId);

    const sent = calls.slice(before).filter(c => c.message.type === 'INTERACT_ELEMENT');
    expect(sent.length).toBe(1);
    expect(sent[0].options.frameId).toBe(3);
    expect(sent[0].message.ref).toBe(2); // 本地编号
    expect(sent[0].message.action).toBe('click');
    expect(sent[0].message._frameRouted).toBe(true);
    expect(r.success).toBe(true);
    expect(r.tool_call_id).toBe('tc-1');
  });

  test('无效全局 ref：不发送任何消息，直接返回 invalidRef 错误', async () => {
    const { tabId, calls } = await setupGlobalTab(3);
    const before = calls.length;
    const r = await routeSingleRefTool('interact_element', { ref: 987654 }, 'tc-3', tabId);
    expect(r.success).toBe(false);
    expect(r.error).toContain('987654');
    expect(r.tool_call_id).toBe('tc-3');
    expect(calls.length).toBe(before); // 未发送
  });
});

describe('translateRoutedResult - 结果翻译', () => {
  test('failure + suggestions：本地建议翻译为全局编号并重建错误文案', async () => {
    const { tabId, refFor } = await setupGlobalTab(4);
    const cardRef = refFor('Card');
    const mapping = resolveGlobalRef(tabId, cardRef);
    const goRef = refFor('Go');

    const response = {
      success: false,
      error: '本地文案 ref=99',
      suggestions: [{ ref: 4, role: 'button', name: 'Go' }], // 本地编号建议
      tool_call_id: 'tc-4',
    };
    const r = translateRoutedResult(response, mapping, tabId);
    expect(r.suggestions).toBeUndefined();
    expect(r.error).toContain(`ref=${cardRef}`); // 全局编号重建（非本地 =99）
    expect(r.error).toContain(`ref ${goRef}`);   // 建议翻译为全局编号
    expect(r.error).toContain('button "Go"');
    expect(r.tool_call_id).toBe('tc-4');

    // 普通执行失败（无 suggestions）：原样返回
    const plain = { success: false, error: 'click intercepted', tool_call_id: 'tc-4b' };
    expect(translateRoutedResult(plain, mapping, tabId)).toBe(plain);
    // 成功响应：原样返回
    const ok = { success: true, content: 'x', tool_call_id: 'tc-4c' };
    expect(translateRoutedResult(ok, mapping, tabId)).toBe(ok);
  });
});

describe('routeFillForm - 表单跨帧拆分合并', () => {
  test('按归属帧拆分发送（字段本地化）并合并成功统计', async () => {
    const { tabId, calls, refFor } = await setupGlobalTab(5, {
      top: { success: true, message: 'ok', details: [
        { selector: '#plain', success: true, value: 'B' },
        { selector: 'ref=5', success: true, value: 'C' },
      ] },
      child: { success: true, message: 'ok', details: [
        { selector: 'ref=2', success: true, value: 'A' },
      ] },
    });
    const topRef = refFor('Top');
    const cardRef = refFor('Card');
    const before = calls.length;

    const r = await routeFillForm({
      fields: [
        { ref: cardRef, value: 'A' },
        { selector: '#plain', value: 'B' },
        { ref: topRef, value: 'C' },
      ],
      waitTime: 100,
    }, 'tc-5', tabId);

    const sent = calls.slice(before).filter(c => c.message.type === 'FILL_FORM');
    expect(sent.length).toBe(2); // 子帧组 + 顶层组（#plain 与 Top 同属顶层）
    const toChild = sent.find(c => c.options.frameId === 3);
    const toTop = sent.find(c => c.options.frameId === 0);
    expect(toChild.message.fields).toEqual([{ ref: 2, value: 'A' }]); // 本地编号
    expect(toChild.message._frameRouted).toBe(true);
    expect(toChild.message.waitTime).toBe(100);
    expect(toTop.message.fields).toEqual([
      { selector: '#plain', value: 'B' },
      { ref: 5, value: 'C' }, // 顶层本地编号
    ]);

    expect(r.success).toBe(true);
    expect(r.message).toContain('3/3');
    expect(r.tool_call_id).toBe('tc-5');
  });

  test('失败字段标注 frameId；无效 ref 字段不发送仅计入失败', async () => {
    const { tabId, calls, refFor } = await setupGlobalTab(6, {
      child: { success: true, message: 'ok', details: [
        { selector: 'ref=2', success: false, error: 'element not found' },
      ] },
    });
    const cardRef = refFor('Card');
    const before = calls.length;

    const r = await routeFillForm({
      fields: [
        { ref: cardRef, value: 'A' },
        { ref: 888888, value: 'B' }, // 无效全局 ref
      ],
    }, 'tc-6', tabId);

    const sent = calls.slice(before).filter(c => c.message.type === 'FILL_FORM');
    expect(sent.length).toBe(1); // 仅子帧组；无效 ref 未发送
    expect(sent[0].options.frameId).toBe(3);

    expect(r.success).toBe(false);
    expect(r.message).toContain('1/2');
    expect(r.message).toContain('frame 3');    // 子帧失败标注
    expect(r.message).toContain('888888');     // 无效 ref 字段清单
    expect(r.error).toContain('888888');       // 首个失败原因 = invalidRefField（先于组响应产生）
    const cardDetail = r.details.find(d => d.frameId === 3);
    expect(cardDetail.success).toBe(false);
    expect(cardDetail.error).toBe('element not found');
  });
});
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/ref-routing.unit.test.js`
Expected: FAIL（`shouldRouteRefTool` / `routeSingleRefTool` / `routeFillForm` / `translateRoutedResult` 未导出）

- [ ] **Step 3: 实现路由**

**修改 1 —— 在 `src/background/tools/snapshot-orchestrator.js` 文件末尾追加**（`executeSnapshotQuery` 之后）：

```js
// ==================== ref 工具跨帧路由（阶段三） ====================

/** 路由判定：上次快照含可见 iframe（mode=global）且工具带 ref → 走跨帧路由，否则 legacy 直通 */
export function shouldRouteRefTool(toolName, args, targetTabId) {
  if (getTabQueryMode(targetTabId) !== 'global') return false;
  if (toolName === 'interact_element') return args.ref != null;
  // triggerSelector 存在时 ref 被 content 侧忽略 → legacy 直通
  if (toolName === 'select_dropdown') return args.ref != null && !args.triggerSelector;
  if (toolName === 'fill_form') return Array.isArray(args.fields) && args.fields.some(f => f && f.ref != null);
  return false;
}

/**
 * 单 ref 工具（interact_element / select_dropdown）跨帧路由：
 * 全局编号 → resolve → 定向发送（本地编号 + _frameRouted）→ 结果翻译
 */
export async function routeSingleRefTool(toolName, args, toolCallId, targetTabId) {
  const mapping = resolveGlobalRef(targetTabId, args.ref);
  if (!mapping) {
    return { success: false, error: t('snapshotQuery.invalidRef', { ref: args.ref }), tool_call_id: toolCallId };
  }

  const message = toolName === 'select_dropdown'
    ? {
        type: 'SELECT_DROPDOWN',
        ref: mapping.localRef,
        optionText: args.optionText,
        optionSelector: args.optionSelector,
        timeout: args.timeout,
        _frameRouted: true,
      }
    : {
        type: 'INTERACT_ELEMENT',
        ref: mapping.localRef,
        action: args.action,
        value: args.value,
        clear: args.clear,
        submit: args.submit,
        waitTime: args.waitTime,
        timeout: args.timeout,
        _frameRouted: true,
      };

  const response = await sendDirectedMessage(targetTabId, mapping.frameId, message, toolCallId);
  return translateRoutedResult(response, mapping, targetTabId);
}

/**
 * 翻译 routed 结果：仅当失败响应带非空 suggestions（ref 失效，建议为本地编号）时，
 * 用全局编号重建错误文案；其余情况原样返回。
 */
export function translateRoutedResult(response, mapping, targetTabId) {
  if (!response || response.success !== false) return response;
  if (!Array.isArray(response.suggestions) || !response.suggestions.length) return response;

  const { suggestions, ...rest } = response;
  const translated = translateRefSuggestions(targetTabId, mapping.frameId, suggestions);
  let error = t('snapshotQuery.invalidRefSuggest', { ref: mapping.globalRef });
  if (translated.length) {
    const list = translated
      .map(s => `ref ${s.ref} (${s.role}${s.name ? ` "${s.name}"` : ''})`)
      .join(', ');
    error += t('snapshotQuery.invalidRefSuggestions', { list });
  }
  error += t('snapshotQuery.invalidRefTail');
  return { ...rest, error };
}

/**
 * fill_form 跨帧路由：fields 按 ref 归属帧分组（无 ref 字段归顶层 frameId=0），
 * 逐组定向发送（组序 = 首现序），合并成功统计、失败清单与详情。
 * 归属解析失败的字段不发送，直接计入失败。
 */
export async function routeFillForm(args, toolCallId, targetTabId) {
  const rawFields = Array.isArray(args.fields) ? args.fields.filter(f => f && typeof f === 'object') : [];
  const groups = new Map(); // frameId → [{ local: 本地化字段, globalRef: 原全局编号 | null }]
  const groupOrder = [];
  const failures = []; // { selector, error, frameId }
  const details = [];   // 全量字段结果（含 frameId 标注）

  for (const field of rawFields) {
    if (field.ref == null) {
      if (!groups.has(0)) { groups.set(0, []); groupOrder.push(0); }
      groups.get(0).push({ local: field, globalRef: null });
      continue;
    }
    const mapping = resolveGlobalRef(targetTabId, field.ref);
    if (!mapping) {
      const msg = t('snapshotQuery.invalidRefField', { ref: field.ref });
      failures.push({ selector: `ref=${field.ref}`, error: msg, frameId: null });
      details.push({ selector: `ref=${field.ref}`, success: false, error: msg, frameId: null });
      continue;
    }
    if (!groups.has(mapping.frameId)) { groups.set(mapping.frameId, []); groupOrder.push(mapping.frameId); }
    groups.get(mapping.frameId).push({ local: { ...field, ref: mapping.localRef }, globalRef: mapping.globalRef });
  }

  let successCount = 0;

  for (const frameId of groupOrder) {
    const groupFields = groups.get(frameId);
    const response = await sendDirectedMessage(targetTabId, frameId, {
      type: 'FILL_FORM',
      fields: groupFields.map(g => g.local),
      waitTime: args.waitTime,
      _frameRouted: true,
    }, toolCallId);

    // 展示用 selector：带 ref 字段回显全局编号；纯 selector 字段用响应/原值
    const displayOf = (g, d) => (g.globalRef != null ? `ref=${g.globalRef}` : (d && d.selector) || g.local.selector || '?');

    if (!response || response.success === false || !Array.isArray(response.details)) {
      const errMsg = (response && response.error) || t('snapshotQuery.directedSendFailed');
      for (const g of groupFields) {
        const selector = displayOf(g, null);
        failures.push({ selector, error: errMsg, frameId });
        details.push({ selector, success: false, error: errMsg, frameId });
      }
      continue;
    }

    // details 与发送 fields 下标对齐（fillForm 按序 push）
    for (let i = 0; i < groupFields.length; i += 1) {
      const g = groupFields[i];
      const d = response.details[i];
      const selector = displayOf(g, d);
      if (d && d.success) {
        successCount += 1;
        details.push({ selector, success: true, value: d.value, frameId });
      } else {
        const errMsg = (d && d.error) || '';
        failures.push({ selector, error: errMsg, frameId });
        details.push({ selector, success: false, ...(errMsg ? { error: errMsg } : {}), frameId });
      }
    }
  }

  const total = rawFields.length;
  let message = t('snapshotQuery.formFillMerged', { success: successCount, total });
  if (failures.length) {
    const list = failures
      .map(f => `${f.selector || '?'}${f.frameId != null ? `（frame ${f.frameId}）` : ''}`)
      .join('；');
    message += ' ' + t('snapshotQuery.formFillFailures', { list });
  }

  return {
    success: successCount === total,
    message,
    ...(failures.length && failures[0].error ? { error: failures[0].error } : {}),
    details,
    tool_call_id: toolCallId,
  };
}
```

**修改 2 —— `src/background/tool-executor.js` import 扩展**（第 15 行 `import { RAG_TOOLS } ...` 之后新增一行）：

```js
import { shouldRouteRefTool, routeSingleRefTool, routeFillForm } from './tools/snapshot-orchestrator.js';
```

**修改 3 —— `src/background/tool-executor.js` 新增 `maybeRouteRefTool`**（插在 `CONTENT_PAYLOADS.search_in_page` 特殊覆盖块之后、`executeTool` 的 JSDoc 之前）：

```js
/**
 * ref 跨帧路由分派（阶段三）：上次快照含可见 iframe（mode=global）时，
 * 把带 ref 的交互工具按全局编号定向发送到元素所属帧；其余情况返回 null 走 legacy 直通。
 */
async function maybeRouteRefTool(toolName, args, toolCallId, targetTabId) {
  if (!shouldRouteRefTool(toolName, args, targetTabId)) return null;
  if (toolName === 'fill_form') return routeFillForm(args, toolCallId, targetTabId);
  return routeSingleRefTool(toolName, args, toolCallId, targetTabId);
}
```

**修改 4 —— `executeTool` 的 content_script 分支整体替换**（插入 routed 拦截，原注释与 tab 解析逻辑保持不变）：

```js
  } else if (executionType === 'content_script') {
    const buildPayload = CONTENT_PAYLOADS[toolName];
    if (buildPayload) {
      const messageType = toolName.toUpperCase();
      const messagePayload = buildPayload(args);
      // 模型主导 tabId：传了就用模型指定的（可操作任意 tab，含后台 tab）；
      // 没传则用"最近操作 tab"（模型自己 open_tab/switch_tab 的结果）作 fallback，
      // 比 getActiveTabId() 更贴近模型意图；都没有则取当前活动 tab。
      const lastOperatedTab = sessionId ? getLastOperatedTab(sessionId) : null;
      const targetTabId = args.tabId || lastOperatedTab || await getActiveTabId();
      // ref 跨帧路由（阶段三）：上次快照含可见 iframe（mode=global）时，ref 工具定向发送到所属帧
      const routed = targetTabId ? await maybeRouteRefTool(toolName, args, toolCallId, targetTabId) : null;
      if (routed) {
        result = routed;
      } else if (targetTabId) {
        result = await sendToContentScriptWithRetry(targetTabId, { type: messageType, ...messagePayload }, toolCallId);
      } else {
        result = { success: false, error: t('toolExec.noTabAvailable'), tool_call_id: toolCallId };
      }
    } else {
      result = { success: false, error: t('toolExec.unknownTool', { name: toolName }), tool_call_id: toolCallId };
    }
  } else {
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/ref-routing.unit.test.js`
Expected: PASS（6 条用例）

- [ ] **Step 5: 全量单测 + lint 回归**

Run: `npx vitest run && npx eslint src/background/tools/snapshot-orchestrator.js src/background/tool-executor.js`
Expected: 全部通过（tool-executor 既有测试不受影响——legacy 路径仅在 mode≠global 或未带 ref 时执行）

- [ ] **Step 6: Commit**

```bash
git add src/background/tools/snapshot-orchestrator.js src/background/tool-executor.js test/unit/ref-routing.unit.test.js
git commit -m "feat: ref 交互跨帧路由（全局编号定向发送/失效建议翻译/fill_form 拆分合并）"
```

---

### Task 7: 工具定义与接线（query_elements → background + frames 参数 + 提示词同步）

**Files:**
- Modify: `src/background/tools/browser-tools.js:299-326`（query_elements 定义）
- Modify: `src/background/tool-executor.js`（import 扩展 + `TOOL_HANDLERS` 接线）
- Modify: `src/shared/locales/zh.js:645`（AI 工具简介）
- Modify: `src/shared/locales/en.js:645`（AI 工具简介）
- Test: `test/unit/tool-definitions.unit.test.js`（追加 2 条用例，既有 4 条断言不改）

**Interfaces:**
- Consumes：`executeSnapshotQuery`（Task 5 导出）
- Produces：query_elements `execution='background'`（`constants.js:114` 的 `TOOL_EXECUTION_MAP` 从 RAW_TOOLS 自动派生，无需手动同步）；新增 `frames` 参数（`'auto'` 默认 / `'none'`）；AI 工具简介（locales）同步 iframe 语义
- 影响面已核验：`CONTENT_PAYLOADS.query_elements` 自动不再生成（该表只收录 content_script 工具）；e2e 通过 bundle 直接调用 `queryInteractiveElements` 函数，不受 execution 变更影响；`untrusted-content.js` / `config.js` / `agent-defaults.js` 的工具名单仅按 id 引用，无影响

- [ ] **Step 1: 追加测试断言（红）**

在 `test/unit/tool-definitions.unit.test.js` 的 `describe('query_elements 分页与叠加层 schema')` 内、`test('maxResults 描述为每页元素数')` 之后追加：

```js
  test('execution=background（由快照编排器接管）且含 frames 参数', () => {
    expect(qe.execution).toBe('background');
    const frames = qe.function.parameters.properties.frames;
    expect(frames).toBeDefined();
    expect(frames.enum).toEqual(['auto', 'none']);
  });

  test('描述覆盖 [frame #N] 区块与全局编号', () => {
    expect(qe.function.description).toContain('[frame #N]');
    expect(qe.function.description).toContain('globally');
  });
```

- [ ] **Step 2: 运行确认失败**

Run: `npx vitest run test/unit/tool-definitions.unit.test.js`
Expected: FAIL（execution 仍为 content_script；无 frames 参数）

- [ ] **Step 3: 修改定义与接线**

**修改 1 —— `src/background/tools/browser-tools.js` 的 query_elements 定义整体替换**（`execution` 改 background；description 追加 iframe 段并保留既有 hasMore / page=N / Open overlays / stable 四词；新增 `frames` 参数）：

```js
  {
    id: 'query_elements',
    category: 'content_extraction',
    execution: 'background',
    parallelizable: true,
    requiresConfirmation: false,
    type: 'function',
    function: {
      name: 'query_elements',
      description: 'Query interactive elements and return a tree-formatted snapshot with [ref N] numbers for interact_element/fill_form. Recommended as the primary element locating method. Open overlays (dialogs/menus/popups) are lifted to the top under [Open overlays]. Visible iframes are included as [frame #N] blocks and their refs are valid globally; set frames to "none" to query only the top frame. ref numbers are stable for the same element while the page state is unchanged - re-query after the page changes. Results include hasMore: fetch the next page with page=N; use filterByText when a page is truncated',
      parameters: {
        type: 'object',
        properties: {
          tabId: { type: 'integer', description: 'Omit to use active tab' },
          filterByText: { type: 'string', description: 'Only include elements whose text matches (case-insensitive)' },
          elementTypes: {
            type: 'array',
            items: { type: 'string', enum: ['button', 'a', 'input', 'select', 'textarea', 'checkbox', 'radio', 'tab', 'menuitem', 'option', 'link'] }
          },
          page: { type: 'integer', description: '1-based page number (default 1); use with hasMore to fetch the next page' },
          maxResults: { type: 'integer', description: 'Page size: max elements per page (default 100)' },
          maxChars: { type: 'integer', description: 'Character budget per page (default 6000)' },
          countOnly: { type: 'boolean' },
          frames: { type: 'string', enum: ['auto', 'none'], description: 'auto (default): include visible iframes as [frame #N] blocks; none: only the top frame' }
        },
        required: []
      }
    }
  },
```

**修改 2 —— `src/background/tool-executor.js` import 行扩展**（Task 6 新增的 orchestrator import 行改为）：

```js
import { executeSnapshotQuery, shouldRouteRefTool, routeSingleRefTool, routeFillForm } from './tools/snapshot-orchestrator.js';
```

**修改 3 —— `TOOL_HANDLERS` 末尾接线**（`exec_log: executeExtractExecutionLog,` 之后新增一行）：

```js
  query_elements: executeSnapshotQuery,
```

**修改 4 —— `src/shared/locales/zh.js:645` 与 `src/shared/locales/en.js:645` 工具简介同步**（两行均为阶段二遗留的顶格缩进，顺带修正为 4 空格对齐邻居）：

```js
    // zh.js
    query_elements: '查询可交互元素，返回树形快照与 ref 编号（打开的弹窗/菜单提升到 [打开层]；可见 iframe 以 [frame #N] 区块纳入，其 ref 全局有效；同一元素编号稳定，页面变化后需重新查询；hasMore 为真时用 page 翻页）',

    // en.js
    query_elements: 'Query interactive elements, returns tree snapshot with ref numbers (open overlays lifted under [Open overlays]; visible iframes included as [frame #N] blocks with globally valid refs; refs stable for the same element; re-query after page changes; use page to paginate when hasMore)',
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx vitest run test/unit/tool-definitions.unit.test.js`
Expected: PASS（既有 4 条 + 新增 2 条）

- [ ] **Step 5: 全量单测 + lint 回归**

Run: `npx vitest run && npx eslint src/background/tools/browser-tools.js src/background/tool-executor.js src/shared/locales/zh.js src/shared/locales/en.js`
Expected: 全部通过

- [ ] **Step 6: Commit**

```bash
git add src/background/tools/browser-tools.js src/background/tool-executor.js src/shared/locales/zh.js src/shared/locales/en.js test/unit/tool-definitions.unit.test.js
git commit -m "feat: query_elements 转 background 编排接管（frames 参数/iframe 描述/i18n 同步）"
```

---

### Task 8: e2e 验证（真实 iframe 环境跨帧采集 + 渲染组装 + 子帧本地 ref）

**Files:**
- Create: `test/e2e/fixtures/iframe-visible-page.html`
- Modify: `test/e2e/helpers/load-module.js`（bundle 加 renderSnapshot；新增 `callToolInFrame`）
- Create: `test/e2e/iframe-ref.e2e.spec.js`

**Interfaces:**
- Consumes：`collectSnapshotOps` / `isFrameVisible` / `queryInteractiveElements` / `interactByRef`（Task 2）、`renderSnapshot`（Task 1）——均经 esbuild bundle 注入页面
- Produces：6 条 e2e 用例（真实 Chromium + srcdoc 帧 + file:// 协议），验证子帧真实 DOM 下采集/可见性判定/跨帧组装渲染/子帧本地 ref 交互

**关键设计说明：**
- 子帧全部用 **srcdoc**（继承父 origin，`contentWindow.location.href` 可读；file:// 子页在 Chrome 中被视为跨源会抛 SecurityError，故不用）
- Playwright `addInitScript` 对 child frame attach 同样生效（与生产 content script all_frames 注入同构）→ 子帧内 `window.__tools` 可用；`callToolInFrame` 按 iframe 的 `name` 属性定位 frame（3 个 srcdoc 帧 URL 均为 `about:srcdoc`，无法用 URL 区分）
- iframe 元素不设 `src` → `srcUrl` 为空串；`sameOriginHref='about:srcdoc'`；`orderInParent` 按 DOM 序 0/1/2
- 组装渲染用例模拟 `markFrameNodes` 的编号标记（真实流程由编排器完成，此处手动赋 `status`/`frameIndex`）

- [ ] **Step 1: 新建 fixture**

新建 `test/e2e/fixtures/iframe-visible-page.html`：

```html
<!DOCTYPE html>
<html lang="zh">
<head>
  <meta charset="UTF-8">
  <title>Iframe Visible Page</title>
</head>
<body>
  <h1>Top page</h1>
  <button id="top-btn">Top Button</button>
  <iframe id="child-frame" name="child-frame" title="Child" width="320" height="200"
    srcdoc="<html><head><title>Child Doc</title></head><body><button id='child-btn'>Child Button</button><input id='child-input' placeholder='child-input'></body></html>"></iframe>
  <iframe id="hidden-frame" name="hidden-frame" title="Hidden" style="display:none"
    srcdoc="<button id='hidden-btn'>Hidden Button</button>"></iframe>
  <iframe id="zero-frame" name="zero-frame" title="Zero" width="0" height="0"
    srcdoc="<button id='zero-btn'>Zero Button</button>"></iframe>
  <button id="bottom-btn">Bottom Button</button>
</body>
</html>
```

- [ ] **Step 2: 扩展 load-module.js**

`test/e2e/helpers/load-module.js` 两处修改：

① bundle entry 追加 renderer（`import * as InteractionTools` 行之后加一行，并扩展 Object.assign）：

```js
import * as Renderer from './src/shared/page-snapshot-renderer.js';
window.__tools = Object.assign({}, PageUtils, ShadowDomUtils, PageInteraction, PageExtract, InteractionTools, Renderer);
```

② 文件末尾追加 `callToolInFrame`：

```js
// 在指定 iframe（按 name 属性匹配）的上下文中调用工具函数（addInitScript 对子帧同样注入）
export async function callToolInFrame(page, frameName, fnName, ...args) {
  const frame = page.frames().find(f => f.name() === frameName);
  if (!frame) throw new Error(`frame not found: ${frameName}`);
  return frame.evaluate(({ fn, a }) => window.__tools[fn](...a), { fn: fnName, a: args });
}
```

- [ ] **Step 3: 新建 spec**

新建 `test/e2e/iframe-ref.e2e.spec.js`：

```js
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
  test('auto 采集：三个 iframe 各生成 frame 节点（sameOriginHref/orderInParent/srcUrl）', async ({ page }) => {
    await page.goto(fixtureUrl('iframe-visible-page.html'));
    const ops = await callTool(page, 'collectSnapshotOps', { frames: 'auto' });
    expect(ops.success).toBe(true);

    const child = findFrameNode(ops.bodyTree, 'Child');
    const hidden = findFrameNode(ops.bodyTree, 'Hidden');
    const zero = findFrameNode(ops.bodyTree, 'Zero');
    expect(child).toBeTruthy();
    expect(hidden).toBeTruthy();
    expect(zero).toBeTruthy();

    // 可见 srcdoc 帧：sameOriginHref 可读；orderInParent 依 DOM 序；无 src 属性 → srcUrl 空串
    expect(child.sameOriginHref).toBe('about:srcdoc');
    expect(child.srcUrl).toBe('');
    expect(child.orderInParent).toBe(0);
    expect(hidden.orderInParent).toBe(1);
    expect(zero.orderInParent).toBe(2);
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
    findFrameNode(topOps.bodyTree, 'Hidden').status = 'hidden';
    findFrameNode(topOps.bodyTree, 'Zero').status = 'hidden';

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
```

**排错提示**：若 `callToolInFrame` 报 `Cannot read properties of undefined (reading ...)`，说明 srcdoc 子帧未收到 init script——先跑 `page.frames().find(f => f.name() === 'child-frame').evaluate(() => !!window.__tools)` 确认；若确认未注入，将 fixture 改为通过 `page.route` 拦截的 http 子页（同源路径）。

- [ ] **Step 4: 运行新 e2e**

Run: `npx playwright test test/e2e/iframe-ref.e2e.spec.js`
Expected: 6 passed

- [ ] **Step 5: 全量 e2e 回归**

Run: `npx playwright test`
Expected: 31 passed（既有 25 + 新增 6）

- [ ] **Step 6: Commit**

```bash
git add test/e2e/fixtures/iframe-visible-page.html test/e2e/helpers/load-module.js test/e2e/iframe-ref.e2e.spec.js
git commit -m "test: iframe 跨帧采集与渲染组装 e2e（srcdoc 帧/可见性/区块输出/本地 ref）"
```

---

### Task 9: 探针（真实浏览器 + 真实 orchestrator 直驱 / 真实扩展注入覆盖）

**Files:**
- Create: `test-results-probes/_iframe-ref-orchestrator.mjs`（Phase A）
- Create: `test-results-probes/_iframe-ref-extension.mjs`（Phase B）
- 目录 `test-results-probes/` 已 gitignored（`.gitignore:34`）——探针不入库、**不 commit**

**Interfaces:**
- Phase A：Playwright 真实浏览器承载帧（双源 http 跨源 + srcdoc + display:none + 零尺寸）；Node 侧 **真实 orchestrator**（动态 import src 模块）+ chrome mock 把 `tabs.sendMessage` 转发到真实帧执行（dispatch 模拟 content handler 语义：子帧不可见早退用 `isFrameVisible()`）
- Phase B：真实 MV3 扩展（`--load-extension=dist`，`channel:'chromium'`——默认 headless shell 不支持扩展）验证 content script 在 http 页 + srcdoc 帧的注入覆盖（console 日志 `[ContentScript] content script loaded ... isTopFrame:`）
- 前置：Phase B 需先 `npm run build:silent` 生成 dist/

- [ ] **Step 1: 写 Phase A 探针**

新建 `test-results-probes/_iframe-ref-orchestrator.mjs`：

```js
// 探针：阶段三 orchestrator 全链路（真实浏览器帧 + Node 侧真实编排器 + chrome mock 转发）
// 覆盖：srcdoc/跨源/display:none/零尺寸帧、三重对应、全局编号、跨帧路由、失效建议翻译、
//       fill_form 拆分合并、frames:none、loadId 重载清理、无 iframe 逐字节兼容
// 用法：node test-results-probes/_iframe-ref-orchestrator.mjs
import { chromium } from '@playwright/test';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getContentBundle } from '../test/e2e/helpers/load-module.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};
const refOfLine = (content, text) => {
  const line = content.split('\n').find(l => l.includes(text) && l.includes('[ref '));
  return line ? Number(line.match(/\[ref (\d+)\]/)[1]) : null;
};

// ---------- 双源 http server（动态端口；不同端口 = 跨源） ----------
const PAGE_PLAIN = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Plain</title></head>
<body><h1>Plain</h1><button id="p-btn-a">Plain A</button><button id="p-btn-b">Plain B</button><input id="p-input" placeholder="plain-input"></body></html>`;
const PAGE_CROSS = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Cross Child</title></head>
<body><button id="x-btn">Cross Button</button><input id="x-input" placeholder="x-input"></body></html>`;

const server = (routes) => new Promise((resolve) => {
  const s = http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(routes[req.url] || routes['/'] || '');
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});

const routes1 = { '/plain.html': PAGE_PLAIN };
const s1 = await server(routes1);
const P1 = s1.address().port;
const routes2 = { '/': PAGE_CROSS, '/x.html': PAGE_CROSS };
const s2 = await server(routes2);
const P2 = s2.address().port;
routes1['/'] = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Probe Top</title></head>
<body>
  <h1>Probe</h1>
  <button id="top-btn">Probe Top</button>
  <input id="top-input" placeholder="top-input">
  <iframe id="src-frame" name="src-frame" title="Src" width="320" height="200"
    srcdoc="<button id='src-btn'>Src Button</button><input id='src-input' placeholder='src-input'>"></iframe>
  <iframe id="x-frame" name="x-frame" title="Cross" src="http://127.0.0.1:${P2}/x.html" width="320" height="200"></iframe>
  <iframe id="hidden-frame" name="hidden-frame" title="Hidden" style="display:none" srcdoc="<button>H</button>"></iframe>
  <iframe id="zero-frame" name="zero-frame" title="Zero" width="0" height="0" srcdoc="<button>Z</button>"></iframe>
  <button id="bottom-btn">Bottom Button</button>
</body></html>`;

// ---------- 浏览器 + 双 tab ----------
const browser = await chromium.launch();
const bundle = await getContentBundle();
const page1 = await browser.newPage();
await page1.addInitScript({ content: bundle });
await page1.goto(`http://127.0.0.1:${P1}/`);
const page2 = await browser.newPage();
await page2.addInitScript({ content: bundle });
await page2.goto(`http://127.0.0.1:${P1}/plain.html`);

// ---------- tab 帧注册（frameId 模拟真实 Chrome 的稀疏递增；重注册按 name 复用） ----------
let nextFrameId = 3;
const tabs = new Map(); // tabId → { allFrames, byId: Map<frameId, pwFrame>, idByName: Map<name, frameId> }

function registerTab(page, tabId) {
  const existing = tabs.get(tabId);
  const frames = page.frames();
  const fidOf = new Map();
  for (const f of frames) {
    if (f === page.mainFrame()) { fidOf.set(f, 0); continue; }
    const reused = existing && f.name() && existing.idByName.get(f.name());
    fidOf.set(f, reused != null ? reused : (nextFrameId++));
  }
  const allFrames = [];
  const byId = new Map();
  const idByName = new Map();
  for (const f of frames) {
    const fid = fidOf.get(f);
    const parent = f.parentFrame();
    const parentFrameId = parent === null ? -1 : (parent === page.mainFrame() ? 0 : (fidOf.get(parent) ?? 0));
    allFrames.push({ frameId: fid, parentFrameId, url: f.url() });
    byId.set(fid, f);
    if (f.name()) idByName.set(f.name(), fid);
  }
  tabs.set(tabId, { allFrames, byId, idByName });
}
registerTab(page1, 1);
registerTab(page2, 2);
const idOfTab1 = (name) => tabs.get(1).idByName.get(name);

// ---------- chrome mock：sendMessage 转发到真实帧执行（模拟 content handler 语义） ----------
const dispatch = (frame, msg) => frame.evaluate(({ m }) => {
  const T = window.__tools;
  if (!T) return { success: false, error: 'no __tools in frame' };
  switch (m.type) {
    case 'SNAPSHOT_COLLECT':
      if (window.top !== window && !T.isFrameVisible()) return { success: true, visible: false };
      return T.collectSnapshotOps({ filterByText: m.filterByText, elementTypes: m.elementTypes, frames: m.frames });
    case 'INTERACT_ELEMENT':
      return T.interactByRef(m.ref, m.action, { waitTime: m.waitTime, timeout: m.timeout, value: m.value, clear: m.clear, submit: m.submit });
    case 'FILL_FORM':
      return T.fillForm(m.fields, m.waitTime);
    default:
      return { success: false, error: 'unhandled: ' + m.type };
  }
}, { m: msg });

globalThis.chrome = {
  runtime: {
    lastError: undefined,
    getManifest: () => ({ content_scripts: [{ js: ['src/content/index.js'] }] }),
  },
  webNavigation: {
    getAllFrames: async ({ tabId }) => {
      const t = tabs.get(tabId);
      if (!t) throw new Error('no such tab: ' + tabId);
      return t.allFrames;
    },
  },
  tabs: {
    sendMessage: (tabId, message, options, callback) => {
      const t = tabs.get(tabId);
      const frame = t && t.byId.get(options && options.frameId);
      if (!frame) { callback(undefined); return; }
      dispatch(frame, message).then(callback).catch(() => callback(undefined));
    },
    query: (_q, cb) => cb([{ id: 1 }]),
  },
  scripting: { executeScript: async () => [] },
};

// ---------- 真实 orchestrator（node 侧） ----------
const {
  executeSnapshotQuery, getTabQueryMode, resolveGlobalRef,
  shouldRouteRefTool, routeSingleRefTool, routeFillForm,
} = await import('../src/background/tools/snapshot-orchestrator.js');

// ---------- 1. 全链路快照（tab1：4 iframe） ----------
const r1 = await executeSnapshotQuery({ tabId: 1 }, 'probe-1', null);
console.log('--- snapshot (first 30 lines) ---');
console.log((r1.content || '').split('\n').slice(0, 30).join('\n'));
check('快照成功', r1.success === true);
check('mode=global', getTabQueryMode(1) === 'global');
check('header 计数=2（hidden/零尺寸不编号）', r1.content.includes('（含 2 个 iframe）'));
check('占位行 iframe #1 "Src"', r1.content.includes('iframe #1 "Src"'));
check('srcdoc 帧区块', r1.content.includes('[frame #1 "Src" · srcdoc]'));
check('跨源帧区块', r1.content.includes('[frame #2 "Cross" · 127.0.0.1]'));
check('两帧内容均渲染', r1.content.includes('Src Button') && r1.content.includes('Cross Button'));
check('隐藏/零尺寸帧不输出', !r1.content.includes('Hidden') && !r1.content.includes('Zero'));

// ---------- 2. 全局编号映射 ----------
const topInputRef = refOfLine(r1.content, 'top-input');
const srcInputRef = refOfLine(r1.content, 'src-input');
const srcBtnRef = refOfLine(r1.content, 'Src Button');
const xInputRef = refOfLine(r1.content, 'x-input');
const topMapping = topInputRef != null ? resolveGlobalRef(1, topInputRef) : null;
const srcMapping = srcInputRef != null ? resolveGlobalRef(1, srcInputRef) : null;
check('顶层元素映射 frameId=0', topMapping && topMapping.frameId === 0, JSON.stringify(topMapping));
check('srcdoc 元素映射到 src 帧', srcMapping && srcMapping.frameId === idOfTab1('src-frame'), JSON.stringify(srcMapping));
check('global 模式判定路由', shouldRouteRefTool('interact_element', { ref: topInputRef }, 1) === true);

// ---------- 3. 跨帧交互：type 到 srcdoc 帧 input ----------
const tr = await routeSingleRefTool('interact_element', { ref: srcInputRef, action: 'type', value: 'probe-src', waitTime: 0, timeout: 0 }, 'probe-3', 1);
check('跨帧 type 返回成功', tr.success === true, JSON.stringify(tr).slice(0, 160));
const srcFrame = page1.frames().find(f => f.name() === 'src-frame');
check('srcdoc 帧内值已写入', (await srcFrame.locator('#src-input').inputValue()) === 'probe-src');

// ---------- 4. fill_form 拆分合并（跨源帧 + 顶层） ----------
const fr = await routeFillForm({
  fields: [{ ref: xInputRef, value: 'fill-x' }, { ref: topInputRef, value: 'fill-top' }],
}, 'probe-4', 1);
check('fill_form 合并成功 2/2', fr.success === true, JSON.stringify(fr.message));
const xFrame = page1.frames().find(f => f.name() === 'x-frame');
check('跨源帧字段写入', (await xFrame.locator('#x-input').inputValue()) === 'fill-x');
check('顶层字段写入', (await page1.inputValue('#top-input')) === 'fill-top');

// ---------- 5. 失效建议翻译（子帧移除元素后旧 ref 路由） ----------
await srcFrame.evaluate(() => { const b = document.querySelector('#src-btn'); if (b) b.remove(); });
const r5 = await executeSnapshotQuery({ tabId: 1 }, 'probe-5', null);
check('移除元素后重查成功', r5.success === true);
const stale = await routeSingleRefTool('interact_element', { ref: srcBtnRef, action: 'click' }, 'probe-5b', 1);
check('已移除元素旧 ref 路由失败', stale.success === false);
check('错误含全局编号重建与建议列表', stale.error.includes('无效或已过期') && stale.error.includes('最近快照中的有效引用'), stale.error.slice(0, 220));

// ---------- 6. frames:'none'（本地编号 + mode 回退） ----------
const r6 = await executeSnapshotQuery({ tabId: 1, frames: 'none' }, 'probe-6', null);
check('none 模式成功且无 iframe 区块', r6.success === true && !r6.content.includes('iframe'));
check('none 模式后 mode 回退 local', getTabQueryMode(1) === 'local');

// ---------- 7. loadId 重载清理 ----------
await page1.evaluate(() => { const f = document.getElementById('src-frame'); f.srcdoc = f.srcdoc; });
await page1.waitForTimeout(700); // 等新 srcdoc 文档建立与注入
registerTab(page1, 1);            // 按 name 复用 frameId（不新增编号）
const r7 = await executeSnapshotQuery({ tabId: 1 }, 'probe-7', null);
check('重载后重查成功', r7.success === true);
const gone = await routeSingleRefTool('interact_element', { ref: srcInputRef, action: 'click' }, 'probe-7b', 1);
check('重载后旧 ref 失效（loadId purge）', gone.success === false, JSON.stringify(gone).slice(0, 160));

// ---------- 8. 无 iframe 页面逐字节兼容 ----------
const r8 = await executeSnapshotQuery({ tabId: 2 }, 'probe-8', null);
const direct = await page2.evaluate(() => window.__tools.queryInteractiveElements({}));
check('无 iframe：编排器输出与页内薄包装逐字节一致', r8.content === direct.content && r8.total === direct.total,
  `total r8=${r8.total} direct=${direct.total}`);
check('无 iframe：mode=local', getTabQueryMode(2) === 'local');
check('local 模式不路由', shouldRouteRefTool('interact_element', { ref: 1 }, 2) === false);

await browser.close();
s1.close();
s2.close();
console.log(failures.length ? `\nSMOKE_FAIL: ${failures.join(' | ')}` : '\nSMOKE_PASS');
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 2: 运行 Phase A**

Run: `node test-results-probes/_iframe-ref-orchestrator.mjs`
Expected: 全部 PASS → `SMOKE_PASS`
（失败时查看首 30 行快照输出与各 check 详情定位）

- [ ] **Step 3: 写 Phase B 探针**

新建 `test-results-probes/_iframe-ref-extension.mjs`：

```js
// 探针：真实 MV3 扩展（dist）在 http 页 + srcdoc 帧的 content script 注入覆盖
// 验证 manifest：all_frames + match_about_blank（srcdoc 帧注入）
// 用法：node test-results-probes/_iframe-ref-extension.mjs（先 npm run build:silent）
// 注意：需要 channel:'chromium'（默认 headless shell 不支持扩展）
import { chromium } from 'playwright';
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dist = path.resolve(__dirname, '../dist');
if (!fs.existsSync(path.join(dist, 'manifest.json'))) {
  console.error('dist/manifest.json 不存在，请先运行 npm run build:silent');
  process.exit(1);
}

const failures = [];
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) failures.push(name);
};

const PAGE = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Ext Probe</title></head>
<body>
  <h1>Ext Probe</h1>
  <p>plain content</p>
  <iframe id="f1" title="Frame1" width="300" height="150"
    srcdoc="<p id='inside'>inside srcdoc</p>"></iframe>
</body></html>`;

const srv = await new Promise((resolve) => {
  const s = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(PAGE);
  });
  s.listen(0, '127.0.0.1', () => resolve(s));
});
const port = srv.address().port;

const profile = path.join(__dirname, '_iframe-ext-profile');
fs.rmSync(profile, { recursive: true, force: true });

const context = await chromium.launchPersistentContext(profile, {
  headless: true,
  channel: 'chromium',
  args: [`--disable-extensions-except=${dist}`, `--load-extension=${dist}`],
});

const page = await context.newPage();
const logs = [];
page.on('console', (m) => logs.push(m.text()));
await page.goto(`http://127.0.0.1:${port}/`);
await page.waitForTimeout(2000); // 等 content script 注入（顶层 + srcdoc 帧）

const loaded = logs.filter((l) => l.includes('[ContentScript] content script loaded'));
console.log('--- content script logs ---');
loaded.forEach((l) => console.log(' ', l.slice(0, 160)));
check('顶层 content script 已注入', loaded.some((l) => l.includes('isTopFrame: true')));
check('srcdoc 子帧 content script 已注入（match_about_blank）',
  loaded.some((l) => l.includes('isTopFrame: false')),
  `loaded=${loaded.length}`);

await context.close();
srv.close();
console.log(failures.length ? `\nSMOKE_FAIL: ${failures.join(' | ')}` : '\nSMOKE_PASS');
process.exit(failures.length ? 1 : 0);
```

- [ ] **Step 4: 构建 + 运行 Phase B**

Run: `npm run build:silent && node test-results-probes/_iframe-ref-extension.mjs`
Expected: 2 项 PASS → `SMOKE_PASS`（srcdoc 帧注入是 Task 4 manifest 修改的运行时验证；若未注入检查 `match_about_blank`/`all_frames` 是否生效于 dist/manifest.json）

- [ ] **Step 5: 不 commit**

探针目录已 gitignored，无需提交；确认 `git status --porcelain` 无 `test-results-probes/` 条目。

---

### Task 10: 全量回归验证（单测 / 构建 / e2e / 探针三本）

**Files:**
- 无（纯验证任务，不产生文件改动，不单独 commit；任一步失败 → 回到对应任务修复后重跑本任务全部步骤，禁止带失败进入 Task 11）

**Interfaces:**
- Consumes: Task 1-9 的全部产物
- Produces: 全量基线证据（Task 11 文档数字引用）、兼容性红线最终确认

- [ ] **Step 1: 全量单测**

Run: `npx vitest run`
Expected: 64 个测试文件 / 1004 条用例全部通过（既有 60 文件 966 条 + 新增 4 文件 38 条：渲染器 13 / page-interaction 追加 8 / manifest 2 / 编排器 7 / 路由 6 / tool-definitions 追加 2）——0 failed

- [ ] **Step 2: 构建验证**

Run: `npm run build:silent`
Expected: 构建成功（dist/ 更新），无错误输出

- [ ] **Step 3: e2e 全量**

Run: `npx playwright test`
Expected: 全部通过（既有 25 条 + `iframe-ref.e2e.spec.js` 6 条 = 31 条；既有用例零改写）

- [ ] **Step 4: 探针三本回归（真实浏览器）**

Run: `node test-results-probes/_ref-system-smoke.mjs && node test-results-probes/_iframe-ref-orchestrator.mjs && npm run build:silent && node test-results-probes/_iframe-ref-extension.mjs`
Expected: 三本均以 `SMOKE_PASS` 结束（现有 `_ref-system-smoke` 19 项 + Phase A 18 项 + Phase B 2 项）；任一 FAIL → 按输出清单修复后重跑

- [ ] **Step 5: 兼容性红线确认（三锁复核）**

Run: `git diff 82cad81 --stat`
Expected: 改动集中于本计划 File Structure 所列文件。无帧页面逐字节兼容由三处锁定，逐一确认：
1. Task 1 渲染器断言自 page-interaction 测试平移（同输入同输出）
2. Task 2 薄包装后既有 45 条 page-interaction 单测零改写全绿
3. Task 9 Phase A「无 iframe 逐字节兼容」check 通过（r8.content === direct.content）

---

### Task 11: 文档同步（CHANGELOG / DOCUMENTATION 中英 / 作品介绍）

**Files:**
- Modify: `CHANGELOG.md`（`## 2026-10-10` 区块三处：新增 / 优化 / 工程质量与测试）
- Modify: `docs/zh/DOCUMENTATION.md`（L682 `query_elements` 工具行）
- Modify: `docs/en/DOCUMENTATION.md`（L691 `query_elements` 工具行）
- Modify: `docs/AI-Helper-作品介绍文档.md`（L284 第 4.1 节括号子串）

参照模式：commit `3a01306`（阶段二文档同步，同四文件）。行号为 HEAD（`82cad81`）位置，Task 1-10 不改这四个文件，行号稳定。

- [ ] **Step 1: CHANGELOG.md —— `### 新增` 追加阶段三条目**

在「页面引用系统阶段二（叠加层提升 + 分页 + WeakMap 稳定编号）」条目（L11）之后、`### 优化`（L13）之前插入：

```markdown
- **页面引用系统阶段三（iframe 内交互 ref 穿透）**：`query_elements` 升级为 background 编排（content 侧逐帧采集结构化 ops → 编排器 webNavigation 帧枚举 + 并行定向收集 → 共享渲染器统一输出），可见 iframe 以 `[frame #N]` 区块纳入快照、其内元素 ref 全局有效——`interact_element` / `select_dropdown` / `fill_form` 传入全局 ref 后由编排器解析为「帧 + 本地 ref」定向发送到所属帧执行，`fill_form` 自动按归属帧拆分并合并返回（失败项标注「（frame N）」）；失效 ref 报错附全局编号翻译的「最近快照中的有效引用」建议；子帧重载（loadId 变化）自动清除该帧旧 ref 映射，帧移除后编号表按 tab 维度清理；嵌套帧深度 ≤3、先序名额 ≤20（超限子树整体排除并在概要注记）；跨源 / 不可达帧显示占位行并保留全局编号（「（内容不可访问）」），隐藏 / 零尺寸帧不输出不编号；新增 `frames` 参数（`auto` 默认 / `none` 仅顶层帧）；无可见 iframe 页面（含 `frames:"none"`）输出与阶段二逐字节一致。
```

- [ ] **Step 2: CHANGELOG.md —— `### 优化` 追加一行**

在「demo 商品录入页模态框补齐标准 ARIA」条目（L16）之后、`### 修复`（L18）之前插入：

```markdown
- **`query_elements` 编排升级为 background + 工具描述同步（阶段三）**：`execution` 由 `content_script` 改为 `background`——帧枚举 / 并行收集 / 全局编号 / 跨帧路由由后台编排器调度；模型侧 description 与 zh/en 文案补充「可见 iframe 以 [frame #N] 区块纳入、其 ref 全局有效、frames:"none" 仅顶层帧」并新增 `frames`（`auto` / `none`）参数声明。
```

- [ ] **Step 3: CHANGELOG.md —— `### 工程质量与测试` 两行改写**

替换 L23 整行（old → new）：

````markdown
OLD:
- 新增/扩展单测：`page-interaction`（树输出 / 发现范围 / 剪枝 / 编号稳定 / 失效建议 / type 原子输入 / 分页 / 叠加层）、`interaction-tools`（fill_form ref 定位，含 radio 同组匹配）、`tool-definitions`（分页与叠加层 schema 断言）；全量 966 通过。e2e 断言迁移至 `content` 树文本并新增 type 链路与分页 / 叠加层用例（全量 25 通过）；真实页冒烟探针 `test-results-probes/_ref-system-smoke.mjs` 扩展至 19 项断言通过。

NEW:
- 新增/扩展单测：`page-interaction`（树输出 / 发现范围 / 剪枝 / 编号稳定 / 失效建议 / type 原子输入 / 分页 / 叠加层 / 采集与薄包装拆分 / 帧身份与可见性 / 结构化建议）、`interaction-tools`（fill_form ref 定位，含 radio 同组匹配）、`tool-definitions`（分页与叠加层及阶段三 schema 断言）；阶段三新增 `page-snapshot-renderer`（唯一渲染出口 13 条）、`snapshot-orchestrator`（帧枚举 / 三重对应 / 编号表 / 定向发送 / 重载清理 7 条）、`ref-routing`（路由判定 / 定向发送 / 翻译 / 分组合并 6 条）、`manifest`（webNavigation + match_about_blank 2 条）；全量 1004 通过。e2e 断言迁移至 `content` 树文本并新增 type 链路与分页 / 叠加层用例（全量 31 通过，含阶段三 iframe-ref 跨帧用例 6 条）；真实页冒烟探针 `test-results-probes/_ref-system-smoke.mjs` 19 项不变，阶段三探针 `_iframe-ref-orchestrator.mjs`（真实编排器直驱）18 项 / `_iframe-ref-extension.mjs`（真实扩展注入）2 项通过。
````

替换 L24 整行：在阶段二路径之后追加阶段三路径（句尾新增 `；阶段三 \`docs/superpowers/specs/2026-10-10-page-element-ref-system-phase3-design.md\`、\`docs/superpowers/plans/2026-10-10-page-element-ref-system-phase3.md\`。`）。

- [ ] **Step 4: 三个文档的 query_elements 行更新（各 1 行替换）**

`docs/zh/DOCUMENTATION.md` L682：

```markdown
OLD: | `query_elements` | 提取可交互元素并输出树形快照（推荐优先使用，返回稳定 ref 编号供 interact_element / fill_form 使用；打开的弹窗/菜单提升到 [打开层]，大页面用 page/hasMore 分页；页面变化后需重新查询，支持 countOnly 模式） |
NEW: | `query_elements` | 提取可交互元素并输出树形快照（推荐优先使用，返回稳定 ref 编号供 interact_element / fill_form 使用；打开的弹窗/菜单提升到 [打开层]，大页面用 page/hasMore 分页；可见 iframe 以 [frame #N] 区块纳入、其 ref 全局有效，frames:"none" 仅查询顶层帧；页面变化后需重新查询，支持 countOnly 模式） |
```

`docs/en/DOCUMENTATION.md` L691：

```markdown
OLD: | `query_elements` | Extract interactive elements as a tree snapshot (recommended; returns stable ref ids for interact_element / fill_form — open overlays lifted to the top, paginate with page/hasMore, re-query after page changes, supports countOnly mode) |
NEW: | `query_elements` | Extract interactive elements as a tree snapshot (recommended; returns stable ref ids for interact_element / fill_form — open overlays lifted to the top, paginate with page/hasMore, visible iframes included as [frame #N] blocks with globally valid refs, frames:"none" for top frame only, re-query after page changes, supports countOnly mode) |
```

`docs/AI-Helper-作品介绍文档.md` L284（只替换括号子串）：

```markdown
OLD: （打开的弹窗/菜单自动提升置顶，大页面支持分页浏览）
NEW: （打开的弹窗/菜单自动提升置顶，大页面支持分页浏览，可见 iframe 内元素以 [frame #N] 区块纳入且 ref 跨帧全局有效）
```

- [ ] **Step 5: Commit**

```bash
git add CHANGELOG.md docs/zh/DOCUMENTATION.md docs/en/DOCUMENTATION.md docs/AI-Helper-作品介绍文档.md
git commit -m "docs: 同步页面引用系统阶段三描述（CHANGELOG / DOCUMENTATION 中英 / 作品介绍）"
```

---

## 计划自检（writing-plans 三项检查，写作时已完成）

### 1. Spec 覆盖对照

| Spec 节 | 要求 | 覆盖任务 |
|---|---|---|
| §1 目标 | 默认纳入可见 iframe、ref 跨帧路由、无帧零变化 | Task 1 / 5 / 6（header Goal 同步） |
| §2 设计总览 | content ops → bg 编排 → shared 渲染 三段式 | Task 1 / 2 / 5 |
| §3.1 快照格式 | [打开层]/[页面主体] + [frame #N] 区块 + 占位行 + 概要 | Task 1（渲染）+ Task 5（status/frameIndex 标记） |
| §3.2 全局 ref 编号 | 按 tab 编号表；F>0 → global / F=0 → local 回退 | Task 5 |
| §3.3 分页与预算 | 跨帧统一 matched 流切片；打开层优先 | Task 1（renderSnapshot 全局流） |
| §3.4 采集协议 | SNAPSHOT_COLLECT + ops 结构 + loadId + isFrameVisible | Task 2 / 3 |
| §3.5 帧枚举与对应 | webNavigation 枚举 + 三重对应 + claimed 排除 + 先序规划 | Task 5 |
| §3.6 渲染器接口 | renderSnapshot(options) 唯一出口 | Task 1 |
| §3.7 交互路由 | shouldRouteRefTool + 定向发送 + fill_form 拆分 + 翻译 | Task 6 |
| §3.8 执行路径与描述 | execution→background + frames 参数 + zh/en 文案 | Task 7 |
| §4.1 可见性 | 子帧自报（尺寸判据）→ visible:false 早退 | Task 2（isFrameVisible）+ Task 3（handler 早退）+ Task 9（探针模拟同语义） |
| §4.2 不可达帧 | 占位行带编号 + （内容不可访问）+ 注入重试 | Task 5（collectFrame 重试）+ Task 1（占位行渲染） |
| §4.3 注入与权限 | match_about_blank / match_origin_as_fallback / webNavigation | Task 4 + Task 9 Phase B（运行时验证） |
| §4.4 数量与深度 | depth ≤3 / 先序名额 ≤20 / 超限子树 excludedIds | Task 5（planFrameTree） |
| §4.5 性能预算 | 子帧 400ms / 顶层 5000ms / 并行收集 | Task 5 |
| §4.6 生命周期 | loadId 重载清理 / 帧消失 prune / 表按 tab 维度 | Task 5 + Task 9（重载 check） |
| §5 兼容性清单 | 7 项语义变更逐条落地 | #1 Task 1/2/9/10；#2 Task 1/5；#3 Task 5；#4 Task 7；#5 Task 6；#6 Task 4；#7 Task 5/6 |
| §6 测试计划 | 单测 / e2e / 探针三层 + 回归矩阵 | Task 1-9；回归 Task 10 |
| §7 风险缓解 | 双锁、fail-open、宁缺勿错等机制落地 | Task 1/2（双锁）；Task 5（fail-open + 三重对应）；Task 6（不静默失败） |
| §8 CDP 评估 | 非实施项 | 不实现（Global Constraints 声明不改 CDP 路径） |
| §9 实施顺序 | 9 步顺序 | Task 1-10（+ Task 11 文档同步为计划补充） |

**相对 spec 的实现级细化（已在对应任务注明）：**
1. e2e 子帧方案：spec §6 写「srcdoc + 同源 file 子页」→ 计划全 srcdoc（file:// 子页在 Chrome 为 opaque origin，`contentWindow.location.href` 抛 SecurityError；Task 8「关键设计说明」已述）
2. 探针方案：spec §6 单探针 7 项 → 计划双探针（Phase A 真实编排器直驱 18 checks / Phase B 真实扩展注入 2 checks，覆盖更强；Task 9 头部已述）
3. 编排器测试路径：spec §6 `test/unit/background/` → 计划 `test/unit/`（平铺，符合仓库既有惯例）
4. 任务拆分：spec §9 的 9 步 → 11 tasks（Task 3 content 消息层独立成任务；Task 11 文档同步为计划补充）

### 2. 占位符扫描

- `grep -nE "TBD|TODO|待补充|待更新|待定|类似 Task|适当的|视情况|按需调整"`：**0 处命中**（写作时扫描）
- 所有代码步骤含完整代码块；文档同步任务含 old/new 逐行替换对；无「参见 Task N」式代码省略
- 每个任务的 Step 4/5 含精确 Run 命令与 Expected 数字（已与各任务 test() 数交叉核对）

### 3. 类型与签名一致性（跨任务核对）

| 接口 | 定义处 | 使用处 | 核对结果 |
|---|---|---|---|
| `renderSnapshot(options)`：`{ frames, page, maxResults, maxChars, countOnly, frameCount, framesLimited }` | Task 1（声明/实现） | Task 2 / Task 5 / Task 8 | 一致（全部 options 对象调用，无位置参数） |
| `collectSnapshotOps({ filterByText, elementTypes, frames })` | Task 2 | Task 3 handler / Task 5 mock / Task 8 e2e | 一致 |
| `frameInfo: { url, title, width, height, loadId }` | Task 2 | Task 1 frames 条目 / Task 5 收集 / Task 8 断言 | 一致 |
| `executeSnapshotQuery(args, toolCallId, sessionId)` | Task 5 | Task 5 测试 / Task 7 TOOL_HANDLERS | 一致；调用方 `executeTool` 统一以 `(args, toolCallId, sessionId, tabId)` 调用 handler（多余第 4 参被忽略，tab 解析链在 handler 内部 `args.tabId \|\| getLastOperatedTab(sessionId) \|\| getActiveTabId()`——与 `executeCapturePage` 等既有 handler 惯例一致） |
| `resolveGlobalRef` / `getTabQueryMode` / `sendDirectedMessage` / `translateRefSuggestions` | Task 5 | Task 6（Consumes 明列） | 一致 |
| `shouldRouteRefTool(toolName, args, targetTabId)` / `routeSingleRefTool(toolName, args, toolCallId, targetTabId)` / `routeFillForm(args, toolCallId, targetTabId)` / `translateRoutedResult(response, mapping, targetTabId)` | Task 6 | Task 6 tool-executor 接线 | 一致 |
| treeNode 三形态 `el / container / frame` + orchestrator 附加 `status / frameIndex` | Task 2 | Task 5 markFrameNodes / Task 8 | 一致 |
| 测试计数：单测 +38（13+8+2+7+6+2）= 1004；e2e +6 = 31 | 各任务 Expected | Task 10 回归 | 已核对各任务 Step 4 预期与 test() 实际数一致 |

**写作期间发现并 inline 修复的 5 处内部不一致：**
1. Task 1 区块内容缩进：断言期望 depth=1 块内容缩进 2，实现原为 `indent + l`（缩进 0）→ 修正为 `indent + '  ' + l` + 注释同步
2. File Structure 帧 fixture 行：`srcdoc / file / display:none / 零尺寸 四类` + `iframe-child.html` → 全 srcdoc 三类单文件
3. File Structure 探针行：`_iframe-ref-system-smoke.mjs` → 双探针文件名
4. Task 1 Step 4/5 预期：`（全部用例）` / `966 + 新增` → 精确 `13 条` / `979 通过`
5. Task 5 Step 4 预期：`6 条用例` → `7 条用例`（与 test() 实际数对齐）

---

## 执行记录（executing-plans 期间发现并修正的计划缺陷）

采用 inline executing-plans 逐任务 TDD 执行（Task 1-11）。以下为执行期间发现的计划与实现/spec 不一致处，均已修正并通过验证。

**已单独提交（计划文件修正）**：Task 1 测试断言缩进笔误（overlay 内 el 期望 2 空格，实际阶段二实现为 1 空格/层）→ commit `dbdfd63`。

**执行时修正（以代码/测试为准，计划文档保持原样）**：

| # | 任务 | 缺陷 | 修正 |
|---|---|---|---|
| 1 | Task 3 | 修改 1 的导入行照抄会删除 `scrollAndCollect`，但 `SCROLL_COLLECT` handler 仍在 HANDLERS 中使用（ReferenceError） | 导入行保留 `scrollAndCollect` |
| 2 | Task 5 | `markFrameNodes` 的 `childInfos` 直接取 webNavigation 原始帧对象（无 `orderInParent` 字段），s3 条件 `0 === undefined` 永不成立 → hidden 用例 tc-4 将失败 | `childInfos` 注入 `plan.effective.get(f.frameId).orderInParent`（spec §3.5 s3 语义） |
| 3 | Task 6 | 测试 tc-6 期望 `'1/2'`；实际两字段均失败（子帧 details success:false + 无效 ref 未发送）→ successCount=0 | 期望改为 `'0/2'` |
| 4 | Task 6 | 测试 fixture `CHILD_BODY` 为模块级共享数组，`replaceRefsWithGlobals` 原地改写 localRef 跨用例累积污染（生产无此问题：chrome 消息结构化克隆产生新对象） | fixture 改工厂函数 `CHILD_BODY()` |
| 5 | Task 8 | e2e 断言 display:none iframe 产生 frame 节点并标 hidden——与 `isSubtreePruned` 剪枝矛盾（spec §4.1：隐藏帧完全不参与，无节点可标） | display:none 断言 `toBeNull()`（剪枝实证）；零尺寸帧保留节点标 hidden（渲染移除）；`zero.orderInParent === 2` 验证「DOM 全量 iframe 序」语义 |
| 6 | Task 9 | 探针区块头期望混淆 title 来源；渲染器既定语义为「占位行 title = iframe 元素属性；区块头 title = 子帧文档 title（frameInfo.title）」 | srcdoc 帧加 `<title>Src Doc</title>`，断言 `[frame #1 "Src Doc" · srcdoc]` / `[frame #2 "Cross Child" · 127.0.0.1]`（同时验证两种 title 来源差异化） |
| 7 | Task 9/10 | 探针 check 数记录为 18，实际 26（e2e 修正后不变） | CHANGELOG 用实际值 26 |

**执行最终验证（Task 10 全量回归）**：单测 64 文件 / 1004 通过（0 failed）；构建 BUILD_SUCCESS；e2e 31 通过（既有 25 零改写 + 新增 6）；探针三本 SMOKE_PASS（19 + 26 + 2 项）；无 iframe 逐字节兼容三锁复核通过（渲染器断言平移 / 45 条既有单测零改写 / Phase A `r8.content === direct.content`）。
