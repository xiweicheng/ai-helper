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
  // 注入帧树先序位置（s3 匹配用；webNavigation 帧对象本身无 orderInParent）
  const childInfos = (plan.childrenByParent.get(parentFrameId) || [])
    .filter(f => plan.effective.has(f.frameId))
    .map(f => ({ ...f, orderInParent: plan.effective.get(f.frameId).orderInParent }));
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
