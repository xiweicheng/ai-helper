// side_panel/context-indicator.js - 上下文占用指示器（输入框下方百分比；详情与手动压缩后续任务扩展）
import state from './state.js';
import { t, registerTranslations } from '../shared/i18n.js';
import { computeContextUsage, assembleCompactionMaterial } from '../shared/context-usage.js';
import { estimateTokens, estimateMessagesTokens } from '../shared/token-counter.js';
import { getSystemPrompt, formatTokenCount, formatTokenFull, showToast } from './utils.js';
import { getCurrentAgentPrompt } from './agent-manager.js';
import { saveCurrentSession } from './session-manager.js';
import logger from '../shared/logger.js';

registerTranslations('zh', {
  contextUsage: {
    indicatorTitle: '上下文占用 {percent}%（{used} / {total} tokens）· 点击查看详情',
    memoryOffToast: '记忆已关闭，无可压缩内容',
    generatingToast: '正在生成回复，请稍后再试',
    nothingToCompactToast: '没有新的消息可压缩',
    confirmTitle: '压缩上下文',
    confirmMessage: '将压缩 {count} 条历史消息（约 {tokens} tokens）为一份摘要{summaryHint}。原始消息仍保留在会话中，发送新消息前可撤销。',
    confirmWithOldSummary: '（含已有摘要，将合并为新摘要）',
    confirmOk: '开始压缩',
    compactingTitle: '正在压缩上下文',
    compactingHint: '正在调用模型生成摘要，请稍候…（通常需要几秒到十几秒）',
    compactDone: '压缩完成，节约约 {saved} tokens',
    compactErrConfig: '无法压缩：API 配置缺失',
    compactErrFailed: '压缩失败，请稍后重试',
    undoTitle: '撤销压缩',
    undoMessage: '撤销后，发送将恢复携带完整历史。确定撤销吗？',
    undoOk: '撤销',
    undoDone: '已撤销压缩',
    dividerText: '⬆ 上方 {count} 条消息已压缩为摘要',
    dividerView: '查看',
    dividerUndo: '撤销',
    popupTitle: '上下文占用明细',
    rowSystem: '系统提示词',
    rowTools: '工具定义',
    rowHistory: '历史消息',
    rowInput: '当前输入',
    historyMeta: '选中 {selected} 条 / 共 {total} 条',
    historyTrimmed: '为控制预算裁剪了 {count} 条（以规则摘要替代）',
    refInfo: '输出预留 {output} · 安全余量 {safety}（不计入上方占用）',
    memoryLabel: '记忆设置',
    memoryAll: '携带全部历史',
    memoryLimited: '携带最近 {n} 条',
    memoryOff: '不携带历史（仅当前消息）',
    compactionActive: '已压缩 {count} 条历史 · 摘要约 {tokens} tokens',
    compactionInvalidHint: '压缩点已失效（对应消息已被删除），本次发送未使用压缩',
    removeInvalid: '移除失效的压缩记录',
    btnCompact: '压缩上下文',
    btnCompactAgain: '再次压缩',
    btnUndoCompact: '撤销压缩',
    undoExpiredToast: '已发送新消息，无法再撤销压缩（可再次压缩合并更新）',
    summaryTitle: '上下文摘要（压缩 {count} 条历史）',
  },
});
registerTranslations('en', {
  contextUsage: {
    indicatorTitle: 'Context usage {percent}% ({used} / {total} tokens) · Click for details',
    memoryOffToast: 'Memory is off, nothing to compact',
    generatingToast: 'Generating a reply, please try again later',
    nothingToCompactToast: 'No new messages to compact',
    confirmTitle: 'Compact Context',
    confirmMessage: 'Compact {count} history messages (~{tokens} tokens) into a summary{summaryHint}. Original messages remain in the session; undo is available before sending new messages.',
    confirmWithOldSummary: ' (including the existing summary, which will be merged into a new one)',
    confirmOk: 'Start Compaction',
    compactingTitle: 'Compacting Context',
    compactingHint: 'Generating a summary with the model, please wait… (usually takes a few seconds)',
    compactDone: 'Compaction complete, saved ~{saved} tokens',
    compactErrConfig: 'Cannot compact: API configuration missing',
    compactErrFailed: 'Compaction failed, please try again later',
    undoTitle: 'Undo Compaction',
    undoMessage: 'After undo, sending will include the full history again. Undo?',
    undoOk: 'Undo',
    undoDone: 'Compaction undone',
    dividerText: '⬆ {count} messages above compacted into a summary',
    dividerView: 'View',
    dividerUndo: 'Undo',
    popupTitle: 'Context Usage Details',
    rowSystem: 'System prompt',
    rowTools: 'Tool definitions',
    rowHistory: 'History messages',
    rowInput: 'Current input',
    historyMeta: 'Selected {selected} / {total} total',
    historyTrimmed: '{count} messages trimmed for budget (replaced by rule summary)',
    refInfo: 'Output reserve {output} · Safety margin {safety} (not counted above)',
    memoryLabel: 'Memory setting',
    memoryAll: 'Carry all history',
    memoryLimited: 'Carry latest {n} messages',
    memoryOff: 'No history (current message only)',
    compactionActive: '{count} messages compacted · summary ~{tokens} tokens',
    compactionInvalidHint: 'Compaction point is stale (its message was deleted); this send ignores the compaction',
    removeInvalid: 'Remove stale compaction record',
    btnCompact: 'Compact Context',
    btnCompactAgain: 'Compact Again',
    btnUndoCompact: 'Undo Compaction',
    undoExpiredToast: 'New messages have been sent; compaction can no longer be undone (you can compact again)',
    summaryTitle: 'Context Summary ({count} messages compacted)',
  },
});

const DEBOUNCE_MS = 300;

// system prompt 缓存（含 agent 服务网络查询，不能在防抖计算里直调）
let systemPromptCache = '';
// 有效 MCP 工具数缓存（发送/配置变化时刷新）
let mcpToolCountCache = 0;
let debounceTimer = null;

/** 有效 MCP 工具数（独立轻量实现，与 chat-manager 的 countEffectiveMcpTools 口径一致） */
async function getEffectiveMcpToolCount() {
  try {
    const { mcpTools } = await chrome.storage.local.get(['mcpTools']);
    const tools = mcpTools || [];
    const closedSet = new Set(Array.isArray(state.mcpClosedServers) ? state.mcpClosedServers : []);
    const excludedSet = new Set(Array.isArray(state.activeAgentMcpExcludedServerIds) ? state.activeAgentMcpExcludedServerIds : []);
    return tools.filter(item => {
      const sid = item.serverId || 'unknown';
      return !closedSet.has(sid) && !excludedSet.has(sid);
    }).length;
  } catch {
    return 0;
  }
}

/** 计算当前占用（指示器与详情弹窗共用） */
export function computeCurrentUsage() {
  const inputEl = document.getElementById('userInput');
  const inputText = inputEl?.value || '';
  const usage = computeContextUsage({
    model: state.currentModel,
    customModelMap: state.customModelMap,
    systemPromptText: systemPromptCache,
    toolCount: (state.useTools ? state.enabledTools.length : 0) + mcpToolCountCache,
    history: state.messageHistory,
    inputText,
    maxMemoryMessages: state.chatConfig?.maxMemoryMessages ?? null,
    compaction: state.activeCompaction,
    isolateChat: state.isolateChat,
  });
  return { usage, inputText };
}

function renderIndicator(usage) {
  const el = document.getElementById('contextUsageIndicator');
  if (!el) return;
  el._lastUsage = usage;
  el.dataset.level = usage.level;
  const percent = Math.round(usage.ratio * 100);
  const percentEl = el.querySelector('.context-usage-percent');
  if (percentEl) percentEl.textContent = `${percent}%`;
  el.style.setProperty('--usage-ratio', String(Math.min(Math.max(usage.ratio, 0), 1)));
  el.title = t('contextUsage.indicatorTitle', {
    percent,
    used: formatTokenCount(usage.usedTokens),
    total: formatTokenCount(usage.contextWindow),
  });
}

/** 立即重算并渲染；返回 usage 供调用方使用 */
export function updateContextIndicator() {
  try {
    const { usage } = computeCurrentUsage();
    renderIndicator(usage);
    syncCompactionDividerActions();
    return usage;
  } catch (err) {
    logger.warn('[ContextIndicator] update failed:', err?.message);
    return null;
  }
}

/** 防抖重算（输入框打字等高频场景） */
export function scheduleContextUpdate() {
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => updateContextIndicator(), DEBOUNCE_MS);
}

/** 刷新缓存（system prompt 文本 + 有效 MCP 工具数）后重算 */
export async function refreshContextCaches() {
  try {
    const agent = await getCurrentAgentPrompt();
    systemPromptCache = await getSystemPrompt(agent);
  } catch (err) {
    logger.warn('[ContextIndicator] refresh system prompt failed:', err?.message);
  }
  try {
    mcpToolCountCache = await getEffectiveMcpToolCount();
  } catch {
    mcpToolCountCache = 0;
  }
  updateContextIndicator();
}

export function initContextIndicator() {
  const el = document.getElementById('contextUsageIndicator');
  if (!el) return;

  // 点击指示器：打开/关闭详情弹窗
  el.addEventListener('click', () => showContextUsagePopup());

  // 输入变化：防抖重算（含当前输入 token）
  const inputEl = document.getElementById('userInput');
  inputEl?.addEventListener('input', scheduleContextUpdate);

  // 发送/接收完成：刷新缓存并重算（更新时机表：发送完成/接收完成）
  document.addEventListener('generating-state-changed', () => { refreshContextCaches(); });
  // 模型/助手切换：system prompt 与工具集可能变化
  document.addEventListener('agent-model-changed', () => { refreshContextCaches(); });
  // 会话切换：state.activeCompaction 已由 switchToSession 恢复，直接重算
  document.addEventListener('session-switched', () => { scheduleContextUpdate(); });
  // 记忆开关 / 条数 / MCP / 工具变化
  chrome.storage.onChanged.addListener((changes, areaName) => {
    if (areaName !== 'local') return;
    if (changes.chatMaxMemoryMessages || changes.isolateChat) {
      scheduleContextUpdate();
    }
    if (changes.isolateChat || changes.mcpTools || changes.mcpEnabled || changes.enabledTools || changes.enableTools) {
      refreshContextCaches();
    }
  });

  refreshContextCaches();
}

// ==================== 手动压缩流程 ====================

/** 通用确认框（复用项目 modal 样式类） */
function showConfirmDialog({ title, message, okText }) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay show';
    overlay.style.zIndex = '10200';
    overlay.innerHTML = `
      <div class="modal-container">
        <div class="modal-title"></div>
        <div class="modal-message"></div>
        <div class="modal-actions">
          <button class="modal-btn cancel">${t('common.cancel')}</button>
        </div>
      </div>
    `;
    overlay.querySelector('.modal-title').textContent = title;
    overlay.querySelector('.modal-message').textContent = message;
    const actions = overlay.querySelector('.modal-actions');
    const okBtn = document.createElement('button');
    okBtn.className = 'modal-btn confirm';
    okBtn.textContent = okText;
    actions.appendChild(okBtn);
    document.body.appendChild(overlay);

    const cleanup = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('.modal-btn.cancel').addEventListener('click', () => cleanup(false));
    okBtn.addEventListener('click', () => cleanup(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cleanup(false); });
  });
}

/** 压缩进行中的模态加载框（不可关闭；流程结束后由调用方 close） */
function showCompactingModal() {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay show context-usage-compacting-overlay';
  overlay.style.zIndex = '10200';
  overlay.innerHTML = `
    <div class="modal-container context-usage-compacting-modal">
      <div class="context-usage-compacting-spinner"></div>
      <div class="modal-title"></div>
      <div class="modal-message"></div>
    </div>
  `;
  overlay.querySelector('.modal-title').textContent = t('contextUsage.compactingTitle');
  overlay.querySelector('.modal-message').textContent = t('contextUsage.compactingHint');
  document.body.appendChild(overlay);
  return { close: () => overlay.remove() };
}

/** 入口：收集素材 → 确认 → 调 background 生成摘要 → 持久化 */
export async function triggerCompaction() {
  if (!state.isolateChat) {
    showToast(t('contextUsage.memoryOffToast'), 'warning');
    return;
  }
  if (state.isGenerating) {
    showToast(t('contextUsage.generatingToast'), 'warning');
    return;
  }
  const history = state.messageHistory;
  if (!history.length) {
    showToast(t('contextUsage.nothingToCompactToast'), 'warning');
    return;
  }

  const old = state.activeCompaction;
  const { material, includedCount, hasOldSummary } = assembleCompactionMaterial(history, {
    maxMemoryMessages: state.chatConfig?.maxMemoryMessages ?? null,
    compaction: old,
  });
  if (includedCount === 0) {
    showToast(t('contextUsage.nothingToCompactToast'), 'warning');
    return;
  }

  const materialTokens = estimateMessagesTokens(material.map(m => ({ role: m.role, content: m.content })));
  const confirmed = await showConfirmDialog({
    title: t('contextUsage.confirmTitle'),
    message: t('contextUsage.confirmMessage', {
      count: includedCount,
      tokens: formatTokenCount(materialTokens),
      summaryHint: hasOldSummary ? t('contextUsage.confirmWithOldSummary') : '',
    }),
    okText: t('contextUsage.confirmOk'),
  });
  if (!confirmed) return;

  // 进行中模态：请求期间遮挡界面、防止误操作（完成/失败后自动关闭）
  const loadingModal = showCompactingModal();
  try {
    const resp = await chrome.runtime.sendMessage({
      type: 'COMPACT_CONTEXT_SUMMARY',
      material,
      model: state.currentModel,
      sessionId: state.activeSessionId,
    });
    if (!resp?.success || !resp.summary) {
      const errKey = resp?.error === 'config_missing' ? 'contextUsage.compactErrConfig' : 'contextUsage.compactErrFailed';
      showToast(t(errKey), 'error');
      return;
    }

    // 压缩点 = 被压缩素材的最后一条消息（历史最后一条）
    const lastMsg = history[history.length - 1];
    const summaryTokens = estimateTokens(resp.summary);
    state.activeCompaction = {
      summary: resp.summary,
      upToMessageId: lastMsg?.messageId,
      compressedCount: (old?.compressedCount || 0) + includedCount,
      summaryTokens,
      savedTokens: Math.max(materialTokens - summaryTokens, 0),
      model: state.currentModel,
      createdAt: Date.now(),
      revision: (old?.revision || 0) + 1,
    };

    await saveCurrentSession();
    renderCompactionDivider();
    updateContextIndicator();
    showToast(t('contextUsage.compactDone', { saved: formatTokenCount(state.activeCompaction.savedTokens) }), 'success');
  } catch (err) {
    logger.warn('[ContextIndicator] compaction failed:', err?.message);
    showToast(t('contextUsage.compactErrFailed'), 'error');
  } finally {
    loadingModal.close();
  }
}

/** 压缩点之后是否已有新消息（有则撤销窗口关闭；压缩点失效时返回 false） */
function hasNewMessagesAfterCompaction() {
  const c = state.activeCompaction;
  if (!c?.upToMessageId) return false;
  const history = state.messageHistory || [];
  const idx = history.findIndex(m => m.messageId === c.upToMessageId);
  return idx >= 0 && idx < history.length - 1;
}

/** 撤销压缩（分隔条按钮：含确认；弹窗/详情按钮：skipConfirm=true） */
export async function undoCompaction(skipConfirm = false) {
  if (!state.activeCompaction) return;
  if (hasNewMessagesAfterCompaction()) {
    showToast(t('contextUsage.undoExpiredToast'), 'warning');
    return;
  }
  if (!skipConfirm) {
    const ok = await showConfirmDialog({
      title: t('contextUsage.undoTitle'),
      message: t('contextUsage.undoMessage'),
      okText: t('contextUsage.undoOk'),
    });
    if (!ok) return;
  }
  state.activeCompaction = null;
  await saveCurrentSession();
  removeCompactionDivider();
  updateContextIndicator();
  showToast(t('contextUsage.undoDone'), 'success');
}

/** 移除分隔条 */
export function removeCompactionDivider() {
  document.querySelectorAll('.compaction-divider').forEach(el => el.remove());
}

/** 同步分隔条撤销按钮显隐（撤销窗口关闭后隐藏；随 updateContextIndicator 在发送/接收完成后自动调用） */
function syncCompactionDividerActions() {
  const expired = hasNewMessagesAfterCompaction();
  document.querySelectorAll('.compaction-divider [data-action="undo"]').forEach(btn => {
    btn.style.display = expired ? 'none' : '';
  });
}

/** 渲染分隔条（恢复渲染后调用；找不到锚点/无压缩时静默跳过） */
export function renderCompactionDivider() {
  removeCompactionDivider();
  const compaction = state.activeCompaction;
  if (!compaction?.upToMessageId) return;
  const container = document.getElementById('chatContainer');
  if (!container) return;
  const anchor = container.querySelector(`[data-message-id="${CSS.escape(compaction.upToMessageId)}"]`);
  if (!anchor) return;

  const divider = document.createElement('div');
  divider.className = 'compaction-divider';
  // 撤销窗口：发送新消息后不再渲染撤销按钮（只留"查看"；再次压缩会重建分隔条）
  const canUndo = !hasNewMessagesAfterCompaction();
  divider.innerHTML = `
    <span class="compaction-divider-text">${t('contextUsage.dividerText', { count: compaction.compressedCount })}</span>
    <button class="compaction-divider-btn" data-action="view">${t('contextUsage.dividerView')}</button>
    ${canUndo ? `<button class="compaction-divider-btn" data-action="undo">${t('contextUsage.dividerUndo')}</button>` : ''}
  `;
  divider.querySelector('[data-action="view"]').addEventListener('click', () => showCompactionSummaryPopup(compaction));
  divider.querySelector('[data-action="undo"]')?.addEventListener('click', () => undoCompaction());
  anchor.after(divider);
}

// ==================== 详情弹窗 ====================

let popupDocClickHandler = null;

export function closeContextUsagePopup() {
  document.querySelectorAll('.context-usage-popup').forEach(el => el.remove());
  const el = document.getElementById('contextUsageIndicator');
  if (el) el._ctxPopupOpen = false;
  if (popupDocClickHandler) {
    document.removeEventListener('click', popupDocClickHandler);
    popupDocClickHandler = null;
  }
}

export function showContextUsagePopup() {
  const anchorEl = document.getElementById('contextUsageIndicator');
  if (!anchorEl) return;
  if (anchorEl._ctxPopupOpen) { closeContextUsagePopup(); return; }
  closeContextUsagePopup();
  anchorEl._ctxPopupOpen = true;

  const { usage } = computeCurrentUsage();
  const b = usage.breakdown;
  const percent = Math.round(usage.ratio * 100);

  // 记忆状态
  let memoryText;
  if (!state.isolateChat) memoryText = t('contextUsage.memoryOff');
  else if (state.chatConfig?.maxMemoryMessages > 0) memoryText = t('contextUsage.memoryLimited', { n: state.chatConfig.maxMemoryMessages });
  else memoryText = t('contextUsage.memoryAll');

  // 压缩状态区
  const compaction = state.activeCompaction;
  let compactionSection;
  if (compaction && b.compactionApplied) {
    // 撤销窗口：发送新消息后只显示"再次压缩"（旧摘要+新消息合并更新）；未发送时显示"撤销"
    compactionSection = `
      <div class="context-usage-compaction">
        <div class="context-usage-dim">${t('contextUsage.compactionActive', { count: compaction.compressedCount, tokens: formatTokenCount(compaction.summaryTokens) })}</div>
        ${hasNewMessagesAfterCompaction()
          ? `<button class="context-usage-btn primary" data-action="compact">${t('contextUsage.btnCompactAgain')}</button>`
          : `<button class="context-usage-btn danger-ghost" data-action="undo">${t('contextUsage.btnUndoCompact')}</button>`}
      </div>`;
  } else if (b.compactionInvalid) {
    compactionSection = `
      <div class="context-usage-compaction">
        <div class="context-usage-warn">${t('contextUsage.compactionInvalidHint')}</div>
        <button class="context-usage-btn danger-ghost" data-action="remove-invalid">${t('contextUsage.removeInvalid')}</button>
      </div>`;
  } else {
    compactionSection = `
      <div class="context-usage-compaction">
        <button class="context-usage-btn primary" data-action="compact">${t('contextUsage.btnCompact')}</button>
      </div>`;
  }

  const historyMeta = t('contextUsage.historyMeta', { selected: b.selectedCount, total: b.totalCount });
  const trimmedLine = b.trimmedCount > 0
    ? `<div class="context-usage-dim">${t('contextUsage.historyTrimmed', { count: b.trimmedCount })}</div>` : '';

  const popup = document.createElement('div');
  popup.className = 'context-usage-popup';
  popup.dataset.level = usage.level;
  popup.innerHTML = `
    <div class="context-usage-popup-header">
      <span class="context-usage-popup-title">${t('contextUsage.popupTitle')}</span>
      <button class="context-usage-popup-close" aria-label="${t('common.close')}">×</button>
    </div>
    <div class="context-usage-popup-body">
      <div class="context-usage-total">
        <span class="context-usage-total-percent">${percent}%</span>
        <span class="context-usage-total-detail">${formatTokenFull(usage.usedTokens)} / ${formatTokenFull(usage.contextWindow)}</span>
      </div>
      <div class="context-usage-bar"><div class="context-usage-bar-fill" style="width:${Math.min(percent, 100)}%"></div></div>
      <div class="context-usage-section">
        <div class="context-usage-row"><span>${t('contextUsage.rowSystem')}</span><span>${formatTokenFull(b.system)}</span></div>
        <div class="context-usage-row"><span>${t('contextUsage.rowTools')}</span><span>${formatTokenFull(b.tools)}</span></div>
        <div class="context-usage-row"><span>${t('contextUsage.rowHistory')}</span><span>${formatTokenFull(b.history)}</span></div>
        <div class="context-usage-dim">${historyMeta}</div>
        ${trimmedLine}
        <div class="context-usage-row"><span>${t('contextUsage.rowInput')}</span><span>${formatTokenFull(b.input)}</span></div>
      </div>
      <div class="context-usage-section context-usage-dim">${t('contextUsage.refInfo', { output: formatTokenFull(b.outputReserve), safety: formatTokenFull(b.safetyMargin) })}</div>
      <div class="context-usage-section">
        <div class="context-usage-row"><span>${t('contextUsage.memoryLabel')}</span><span>${memoryText}</span></div>
      </div>
      ${compactionSection}
    </div>
  `;

  document.body.appendChild(popup);

  // 定位：指示器上方左对齐（fixed 定位，参照 token-detail-popup 模式）
  const rect = anchorEl.getBoundingClientRect();
  popup.style.left = `${Math.max(rect.left, 8)}px`;
  popup.style.bottom = `${window.innerHeight - rect.top + 6}px`;

  // 事件绑定
  popup.querySelector('.context-usage-popup-close').addEventListener('click', () => closeContextUsagePopup());
  popup.querySelector('[data-action="compact"]')?.addEventListener('click', () => { closeContextUsagePopup(); triggerCompaction(); });
  popup.querySelector('[data-action="undo"]')?.addEventListener('click', () => { closeContextUsagePopup(); undoCompaction(true); });
  popup.querySelector('[data-action="remove-invalid"]')?.addEventListener('click', async () => {
    closeContextUsagePopup();
    state.activeCompaction = null;
    await saveCurrentSession();
    removeCompactionDivider();
    updateContextIndicator();
  });

  // 点击外部关闭
  popupDocClickHandler = (e) => {
    if (e.target.closest('.context-usage-popup, #contextUsageIndicator')) return;
    closeContextUsagePopup();
  };
  setTimeout(() => document.addEventListener('click', popupDocClickHandler), 0);
}

/** 分隔条"查看"：展示当前摘要全文 */
export function showCompactionSummaryPopup(compaction = state.activeCompaction) {
  if (!compaction?.summary) return;
  const overlay = document.createElement('div');
  // modal-overlay 基础样式 display:none，必须附带 show 类才会显示（项目统一约定）
  overlay.className = 'modal-overlay show';
  overlay.style.zIndex = '10200';
  overlay.innerHTML = `
    <div class="modal-container context-usage-summary-modal">
      <div class="modal-title">${t('contextUsage.summaryTitle', { count: compaction.compressedCount })}
      </div>
      <div class="context-usage-summary-body"></div>
      <div class="modal-actions">
        <button class="modal-btn cancel">${t('common.close')}</button>
      </div>
    </div>
  `;
  overlay.querySelector('.context-usage-summary-body').textContent = compaction.summary;
  document.body.appendChild(overlay);
  overlay.querySelector('.modal-btn.cancel').addEventListener('click', () => overlay.remove());
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
}
