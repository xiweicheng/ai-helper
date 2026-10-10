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
