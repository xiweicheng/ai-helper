// src/options/memory-entries.js - 选项页「记忆」Tab 的记忆条目查看与管理区
// 真源是 agent 的 global-memory.json；逻辑与数据同在 agent 进程，本模块只做「读列表 + 转发增删改」。
// 数据源用 manage(review) 而不是 recall：review 是只读枚举，返回全量 scored + 低价值 candidates + stats；
// recall 会写入 accessCount/lastAccessAt 并做会话级去重，拿来做管理列表会污染召回统计，绝不能替换。
// 编辑/删除走 store（agent 端已封装向量懒补 / dropVectors，UI 无需操心向量一致性）；低价值淘汰走 manage(compact)。
// 与向量配置面板（memory-panel.js）同走 agentApi 直连，不新增 SW 消息、不动扩展端转发层。

import { agentApi, escapeHtml, showToast, showCustomConfirm, getAgentConnection } from './toolbox-shared.js';
import { t, subscribe } from '../shared/i18n.js';
import logger from '../shared/logger.js';

let initialized = false;
let allEntries = [];   // review 返回的 scored 全量（结构化字段，列表与筛选都基于它）
let candidates = [];   // 低价值淘汰候选（value < 10）
let entriesBusy = false;   // 写操作在途锁定：防连点发出第二次 store/manage
// 状态行只存语义（键+参数），渲染时现取 t()：语言热切换时纯 JS 渲染的动态文案
// 不会自己重画（探针实测：静态标签与 toast 已是英文、列表徽标仍中文），订阅变更后整区重渲染
let lastStatusState = null;   // { key, params } | { rawText }

const $ = (id) => document.getElementById(id);

function currentFilter() {
  return {
    keyword: ($('memoryEntriesSearch')?.value || '').trim().toLowerCase(),
    type: $('memoryEntriesTypeFilter')?.value || 'all',
  };
}

/** 排序规则直接写在筛选行的下拉选项文案里；默认创建时间倒序 */
function currentSort() {
  return $('memoryEntriesSort')?.value || 'createdDesc';
}

const byCreatedDesc = (a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''));
const num = (v) => (Number.isFinite(parseFloat(v)) ? parseFloat(v) : 0);

// 同分一律回落到创建时间倒序：否则相等元素的相对次序依赖引擎实现，用户看到的是「随机抖动」
function sortEntries(items) {
  const sorted = [...items];
  switch (currentSort()) {
    case 'importanceDesc':
      return sorted.sort((a, b) => num(b.importance) - num(a.importance) || byCreatedDesc(a, b));
    case 'valueDesc':
      return sorted.sort((a, b) => num(b.value) - num(a.value) || byCreatedDesc(a, b));
    case 'valueAsc':
      return sorted.sort((a, b) => num(a.value) - num(b.value) || byCreatedDesc(a, b));
    default:
      return sorted.sort(byCreatedDesc);
  }
}

function matchesFilter(m, f) {
  if (f.type !== 'all' && m.type !== f.type) return false;
  if (!f.keyword) return true;
  const hay = [m.content, m.title, m.category, ...(m.tags || [])]
    .filter(Boolean).join(' ').toLowerCase();
  return hay.includes(f.keyword);
}

function typeLabel(type) {
  return type === 'summary' ? t('memoryEntries.filterSummary') : t('memoryEntries.filterFact');
}

/** 逗号（中英文）/顿号分隔 → 去空数组；空串得到 []，与 agent 端「tags 传了就整覆」语义对齐 */
function parseTags(raw) {
  return String(raw || '').split(/[,，、]/).map((s) => s.trim()).filter(Boolean);
}

function fmtDate(iso) {
  return iso ? String(iso).slice(0, 10) : '';
}

// ==================== 渲染 ====================

function renderStatus(state) {
  lastStatusState = state;
  const el = $('memoryEntriesStatus');
  if (!el) return;
  if (state) {
    el.style.display = '';
    el.innerHTML = escapeHtml(state.rawText != null ? state.rawText : t(state.key, state.params));
  } else {
    el.style.display = 'none';
    el.innerHTML = '';
  }
}

function entryItemHtml(m) {
  const id = escapeHtml(m.id);
  const tags = (m.tags || [])
    .map((x) => `<span class="memory-entry-tag-chip">${escapeHtml(x)}</span>`)
    .join('');
  const lastAccess = m.lastAccessAt
    ? fmtDate(m.lastAccessAt)
    : t('memoryEntries.neverAccessed');
  return `
    <div class="memory-entry-item${candidates.some((c) => c.id === m.id) ? ' low-value' : ''}" data-id="${id}">
      <div class="memory-entry-top">
        <span class="memory-entry-badge ${m.type === 'summary' ? 'summary' : 'fact'}">${escapeHtml(typeLabel(m.type))}</span>
        <div class="memory-entry-content">${escapeHtml(m.content || '')}</div>
        <div class="memory-entry-actions">
          <button type="button" data-act="edit">${escapeHtml(t('memoryEntries.editBtn'))}</button>
          <button type="button" data-act="delete" class="memory-entry-del">${escapeHtml(t('memoryEntries.deleteBtn'))}</button>
        </div>
      </div>
      <div class="memory-entry-meta">
        <span>${escapeHtml(t('memoryEntries.importanceShort'))} ${Number(m.importance) || 0}</span>
        <span>${escapeHtml(t('memoryEntries.valueShort'))} ${escapeHtml(m.value)}</span>
        <span>${escapeHtml(t('memoryEntries.createdLabel'))} ${escapeHtml(fmtDate(m.createdAt) || '—')}</span>
        <span>${escapeHtml(t('memoryEntries.lastAccessLabel'))} ${escapeHtml(lastAccess)} · ${escapeHtml(t('memoryEntries.accessCount', { count: m.accessCount || 0 }))}</span>
        ${tags ? `<span>${escapeHtml(t('memoryEntries.tagsLabel'))}: ${tags}</span>` : ''}
      </div>
    </div>`;
}

function renderList() {
  const listEl = $('memoryEntriesList');
  if (!listEl) return;
  const f = currentFilter();
  const shown = sortEntries(allEntries.filter((m) => matchesFilter(m, f)));

  const countEl = $('memoryEntriesCount');
  if (countEl) countEl.textContent = t('memoryEntries.count', { shown: shown.length, total: allEntries.length });

  if (!shown.length) {
    listEl.innerHTML = `<div class="memory-entries-empty">${escapeHtml(
      allEntries.length ? t('memoryEntries.noMatch') : t('memoryEntries.empty'))}</div>`;
    return;
  }
  listEl.innerHTML = shown.map(entryItemHtml).join('');
}

function renderCandidates() {
  const box = $('memoryEntriesCandidates');
  if (!box) return;
  if (!candidates.length) {
    box.style.display = 'none';
    box.innerHTML = '';
    return;
  }
  box.style.display = '';
  box.innerHTML = `
    <span class="memory-entries-candidates-text">${escapeHtml(t('memoryEntries.candidatesHint', { count: candidates.length }))}</span>
    <button type="button" class="memory-entries-compact-btn">${escapeHtml(t('memoryEntries.compactBtn'))}</button>`;
}

// ==================== 数据加载 ====================

async function loadEntries() {
  const listEl = $('memoryEntriesList');
  if (!listEl) return;
  renderStatus({ key: 'memoryEntries.loading' });
  listEl.innerHTML = '';
  try {
    const res = await agentApi('POST', '/api/memory/manage', { action: 'review' });
    // 404 = 旧代理没有 manage 端点：必须说「版本不支持」而不是转圈或泛化失败（同状态卡事故教训）
    if (res && res.httpStatus === 404) {
      renderStatus({ key: 'memoryEntries.unsupported' });
      return;
    }
    if (!res || res.success !== true) {
      renderStatus({ key: 'memoryEntries.loadFail', params: { error: (res && res.error) || 'unknown' } });
      return;
    }
    allEntries = Array.isArray(res.scored) ? res.scored : [];
    candidates = Array.isArray(res.candidates) ? res.candidates : [];
    renderStatus('');
    renderCandidates();
    renderList();
  } catch (err) {
    logger.warn('[MemoryEntries] load failed:', err.message);
    renderStatus({ key: 'memoryEntries.loadFail', params: { error: err.message } });
  }
}

/** 记忆 Tab 刷新入口：代理未连接时不发请求、如实展示离线态（连接态由 memory-panel 门控整块收起） */
export async function refreshMemoryEntries() {
  if (!$('memoryEntriesList')) return;
  const conn = await getAgentConnection();
  if (!conn || !conn.connected) {
    allEntries = [];
    candidates = [];
    renderCandidates();
    $('memoryEntriesList').innerHTML = '';
    renderStatus({ key: 'memoryEntries.offline' });
    return;
  }
  await loadEntries();
}

// ==================== 写操作 ====================

function setWriteBusy(on) {
  entriesBusy = on;
  ['memoryEntriesRefreshBtn'].forEach((id) => { const el = $(id); if (el) el.disabled = on; });
  const compact = document.querySelector('.memory-entries-compact-btn');
  if (compact) compact.disabled = on;
  document.querySelectorAll('.memory-entry-actions button').forEach((b) => { b.disabled = on; });
}

/** store 提交统一出口：成功提示 + 重拉列表；失败按调用方给的文案键报错，列表保持原样不猜测 */
async function submitStore(body, okKey, failKey) {
  if (entriesBusy) return false;
  setWriteBusy(true);
  try {
    const res = await agentApi('POST', '/api/memory/store', body);
    if (!res || res.success !== true) throw new Error((res && res.error) || 'unknown');
    showToast(t(okKey), 'info');
    await loadEntries();
    return true;
  } catch (err) {
    logger.warn('[MemoryEntries] store failed:', err.message);
    showToast(t(failKey, { error: err.message }), 'error');
    return false;
  } finally {
    setWriteBusy(false);
  }
}

async function onDelete(m) {
  const ok = await showCustomConfirm(t('memoryEntries.deleteConfirm'));
  if (!ok) return;
  // delete 只需 memoryId（agent 在 facts/summaries 双数组内自行定位，不依赖 type）
  await submitStore({ action: 'delete', memoryId: m.id }, 'memoryEntries.deleted', 'memoryEntries.deleteFail');
}

async function onCompact() {
  const ok = await showCustomConfirm(t('memoryEntries.compactConfirm', { count: candidates.length, threshold: 10 }));
  if (!ok) return;
  if (entriesBusy) return;
  setWriteBusy(true);
  try {
    const res = await agentApi('POST', '/api/memory/manage', { action: 'compact' });
    if (!res || res.success !== true) throw new Error((res && res.error) || 'unknown');
    showToast(t('memoryEntries.compactDone', {
      facts: res.removedFacts ?? 0, summaries: res.removedSummaries ?? 0,
    }), 'info');
    await loadEntries();
  } catch (err) {
    logger.warn('[MemoryEntries] compact failed:', err.message);
    showToast(t('memoryEntries.compactFail', { error: err.message }), 'error');
  } finally {
    setWriteBusy(false);
  }
}

// ==================== 编辑弹窗 ====================

function openEditModal(m) {
  const existing = document.getElementById('memoryEntryEditModal');
  if (existing) existing.remove();

  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.id = 'memoryEntryEditModal';
  overlay.innerHTML = `
    <div class="modal-content" style="max-width: 560px;">
      <div class="modal-header">
        <h3>${escapeHtml(t('memoryEntries.editTitle'))}</h3>
      </div>
      <div class="modal-body">
        <div class="form-group">
          <label>${escapeHtml(t('memoryEntries.typeLabel'))}</label>
          <input type="text" value="${escapeHtml(typeLabel(m.type))}${m.category ? ` · ${escapeHtml(m.category)}` : ''}" readonly style="background:var(--bg-subtle);color:var(--text-secondary);">
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('memoryEntries.contentLabel'))}</label>
          <textarea id="memoryEntryEditContent" rows="5">${escapeHtml(m.content || '')}</textarea>
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('memoryEntries.importanceLabel'))}</label>
          <input type="number" id="memoryEntryEditImportance" min="1" max="10" value="${Number(m.importance) || 5}">
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('memoryEntries.tagsLabel'))}</label>
          <input type="text" id="memoryEntryEditTags" value="${escapeHtml((m.tags || []).join(', '))}" placeholder="${escapeHtml(t('memoryEntries.tagsPlaceholder'))}">
        </div>
      </div>
      <div class="modal-actions">
        <button class="btn btn-cancel" id="memoryEntryEditCancel">${escapeHtml(t('memoryEntries.cancelBtn'))}</button>
        <button class="btn btn-primary" id="memoryEntryEditSave" style="width:auto;">${escapeHtml(t('memoryEntries.saveBtn'))}</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('#memoryEntryEditCancel').addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });

  overlay.querySelector('#memoryEntryEditSave').addEventListener('click', async () => {
    const content = overlay.querySelector('#memoryEntryEditContent').value.trim();
    if (!content) {
      showToast(t('memoryEntries.contentEmpty'), 'error');
      return;
    }
    const body = {
      action: 'update',
      memoryId: m.id,
      type: m.type,
      content,
      tags: parseTags(overlay.querySelector('#memoryEntryEditTags').value),
    };
    const imp = Number(overlay.querySelector('#memoryEntryEditImportance').value);
    if (Number.isFinite(imp)) body.importance = imp;
    const saved = await submitStore(body, 'memoryEntries.saved', 'memoryEntries.saveFail');
    if (saved) close();
  });
}

// ==================== 入口 ====================

/** 语言热切换时的整区重渲染出口：候选条 + 列表 + 状态行都是 JS 拼的，不重画会停在旧语言 */
export function renderMemoryEntries() {
  renderCandidates();
  renderList();
  if (lastStatusState) renderStatus(lastStatusState);
}

export function initMemoryEntries() {
  if (initialized) return;
  initialized = true;

  $('memoryEntriesRefreshBtn')?.addEventListener('click', () => refreshMemoryEntries());
  $('memoryEntriesSearch')?.addEventListener('input', () => renderList());
  $('memoryEntriesTypeFilter')?.addEventListener('change', () => renderList());
  $('memoryEntriesSort')?.addEventListener('change', () => renderList());

  // 列表行按钮走事件委托：列表每次重建 DOM，直接绑会丢；条目数据按 data-id 回查全量
  $('memoryEntriesList')?.addEventListener('click', (e) => {
    const item = e.target.closest('.memory-entry-item');
    if (!item) return;
    const m = allEntries.find((x) => String(x.id) === item.dataset.id);
    if (!m) return;
    const actBtn = e.target.closest('[data-act]');
    if (actBtn) {
      if (actBtn.dataset.act === 'edit') openEditModal(m);
      else if (actBtn.dataset.act === 'delete') onDelete(m);
      return;
    }
    // 点内容区展开/收起长文案（默认两行截断）
    if (e.target.closest('.memory-entry-content')) item.classList.toggle('expanded');
  });

  $('memoryEntriesCandidates')?.addEventListener('click', (e) => {
    if (e.target.closest('.memory-entries-compact-btn')) onCompact();
  });

  // 语言热切换：本区文案全是 JS 拼的，applyI18n 只刷静态标签，不订阅就会停在旧语言
  // （探针实测缺口：静态标题与 toast 已是英文，列表徽标/候选条仍中文）
  subscribe(() => renderMemoryEntries());
}
