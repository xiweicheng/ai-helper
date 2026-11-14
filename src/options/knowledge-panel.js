// options/knowledge-panel.js - 知识库管理面板（options.html「知识库」标签页）
// 职责：
//   - 门控引导：Agent 未连接 / RAG 总开关未启用 / 代理端能力未就绪
//   - 知识库列表（卡片）：新建 / 删除 / 导入文档 / 文档管理 / 检索测试
// 数据来源：Agent /api/rag/* 接口（agentApi）；门控状态复用 toolbox-rag.js 的 loadRagStatus()

import { agentApi, escapeHtml, showToast, showCustomConfirm, state } from './toolbox-shared.js';
import { loadRagStatus, refreshRagSection, initRagEvents, setRagAvailabilityChangeHandler } from './toolbox-rag.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';
import DOMPurify from 'dompurify';

// 单文件大小上限（agent 端 body 上限 200MB，base64 膨胀 33%，前端限 50MB 已足够覆盖文档场景）
const MAX_FILE_SIZE = 50 * 1024 * 1024;
// 批量上传单次最大文件数：每个文件都要在本机串行走「解析 → 分块 → 向量化」，
// 而向量化是 CPU 密集操作（首次还要加载模型），数量不设界会让单次导入排队过久。
// 取业界 Web UI 批量上传的保守值（20）；超限整批拒绝，提示用户分批导入。
const MAX_BATCH_FILES = 20;
// 默认分块参数（与 agent config.js 的 DEFAULT_CHUNK_CONFIG 一致）
const DEFAULT_CHUNK_SIZE = 400;
const DEFAULT_CHUNK_OVERLAP = 80;
// 检索默认参数（与 agent searcher 默认一致）
const DEFAULT_TOP_K = 5;
const DEFAULT_THRESHOLD = 0.3;

// 支持的文件格式（与 agent document/loader.js 的路由一致）
const ACCEPT_EXTS = '.txt,.md,.markdown,.pdf,.docx,.doc,.xlsx,.xls,.csv,.pptx,.html,.htm,.json,.rtf,.odt,.odp,.ods,.epub';

// 最近一次加载的知识库列表（供卡片操作查找）
let cachedCollections = [];
// 列表搜索过滤关键字（模块级，重渲染后保持；与 MCP/Skill 列表模式一致）
let kbFilterText = '';
// 状态筛选（模块级，重渲染后保持）：'all' | 'enabled' | 'disabled'
let kbFilterStatus = 'all';
let initialized = false;

// ==================== 入口 ====================

/**
 * 初始化知识库面板（事件绑定 + 初始加载）
 */
export function initKnowledgePanel() {
  if (initialized) return;
  initialized = true;

  const listEl = document.getElementById('knowledgeList');
  if (listEl) {
    listEl.addEventListener('click', onListClick);
  }

  // 搜索过滤（防抖 200ms，与 MCP / Skill 列表一致）
  const searchInput = document.getElementById('kbSearchInput');
  if (searchInput) {
    let debounceTimer = null;
    searchInput.addEventListener('input', () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        kbFilterText = searchInput.value.trim();
        renderList(cachedCollections);
      }, 200);
    });
    const clearBtn = document.getElementById('kbSearchClear');
    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        searchInput.value = '';
        kbFilterText = '';
        renderList(cachedCollections);
        searchInput.focus();
      });
    }
  }

  // 状态筛选标签（全部 / 已启用 / 已停用，与 MCP / Skill 列表一致）
  const filterTabs = document.querySelectorAll('.toolbox-filter-tab[data-target="kb"]');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      kbFilterStatus = tab.dataset.filter;
      renderList(cachedCollections);
    });
  });

  const createBtn = document.getElementById('createKbBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => showCreateDialog());
  }

  // RAG 总开关（面板头部）：初始状态回填 + 切换写入 storage
  const ragToggle = document.getElementById('ragGlobalToggle');
  if (ragToggle) {
    chrome.storage.local.get('ragEnabled', (result) => {
      const enabled = result.ragEnabled === true;
      ragToggle.checked = enabled;
      updateRagToggleLabel(enabled);
    });
    ragToggle.addEventListener('change', () => onRagToggleChange(ragToggle.checked));
  }

  // 依赖安装成功 / 重新检测通过后，自动刷新面板（门控 → 列表）
  setRagAvailabilityChangeHandler(() => refreshKnowledgePanel());

  // 门控引导区（「前往 XX 标签页」/「立即启用」按钮）
  const gateEl = document.getElementById('knowledgeGate');
  if (gateEl) {
    gateEl.addEventListener('click', (e) => {
      const gotoBtn = e.target.closest('[data-goto-tab]');
      if (gotoBtn) {
        const tabBtn = document.querySelector(`.tab-nav-btn[data-tab="${gotoBtn.dataset.gotoTab}"]`);
        if (tabBtn) tabBtn.click();
        return;
      }
      if (e.target.closest('[data-action="enable-rag"]')) {
        onRagToggleChange(true);
      }
    });
  }

  refreshKnowledgePanel();
}

/**
 * 刷新知识库面板：门控检查 → 列表加载（切换 tab / 操作后调用）
 */
export async function refreshKnowledgePanel() {
  const gateEl = document.getElementById('knowledgeGate');
  const mainEl = document.getElementById('knowledgeMain');
  if (!gateEl || !mainEl) return;

  const status = await loadRagStatus();
  const { ragEnabled } = await chrome.storage.local.get('ragEnabled');
  const createBtn = document.getElementById('createKbBtn');

  // 1) 代理未连接
  if (!status.connected) {
    renderGate('agentOff');
    if (createBtn) createBtn.disabled = true;
    return;
  }
  // 2) 总开关未启用
  if (ragEnabled !== true) {
    renderGate('ragOff');
    if (createBtn) createBtn.disabled = true;
    return;
  }
  // 3) 代理端能力未就绪（依赖未装 / Node 版本不足 / 状态不可达）→ 就地展示安装引导
  if (!status.ragAvailable) {
    renderGate('ragUnavailable');
    if (createBtn) createBtn.disabled = true;
    initRagEvents();
    await refreshRagSection();
    return;
  }

  // 就绪：加载知识库列表
  if (createBtn) createBtn.disabled = false;
  gateEl.style.display = 'none';
  mainEl.style.display = '';
  await loadAndRenderList();
}

// ==================== RAG 总开关 ====================

/**
 * 更新总开关标签文案（与工具箱开关样式一致）
 */
function updateRagToggleLabel(enabled) {
  const label = document.getElementById('ragToggleLabel');
  if (label) {
    label.textContent = enabled ? t('common.enabled') : t('common.disabled');
    label.style.color = enabled ? 'var(--text-secondary)' : 'var(--text-tertiary)';
  }
}

/**
 * 总开关切换：写入 storage → 更新开关 UI → 刷新面板门控
 * （工具注册/注销由 background 监听 storage.onChanged 自动处理）
 */
async function onRagToggleChange(enabled) {
  await chrome.storage.local.set({ ragEnabled: enabled });
  const ragToggle = document.getElementById('ragGlobalToggle');
  if (ragToggle) ragToggle.checked = enabled;
  updateRagToggleLabel(enabled);
  showToast(enabled ? t('toolbox.ragServiceEnabled') : t('toolbox.ragServiceDisabled'), 'info');
  await refreshKnowledgePanel();
}

// ==================== 门控引导 ====================

function renderGate(kind) {
  const gateEl = document.getElementById('knowledgeGate');
  const mainEl = document.getElementById('knowledgeMain');
  if (!gateEl || !mainEl) return;

  mainEl.style.display = 'none';
  gateEl.style.display = '';

  // 依赖未就绪：就地渲染安装引导容器（内容由 toolbox-rag.js 的 refreshRagSection 填充）
  if (kind === 'ragUnavailable') {
    gateEl.innerHTML = `<div id="ragSectionContent">${renderLoading()}</div>`;
    return;
  }

  const cfg = {
    agentOff: {
      icon: '🔌',
      title: t('knowledge.gateAgentOffTitle'),
      desc: t('knowledge.gateAgentOffDesc'),
      btn: t('knowledge.goToAgentTab'),
      tab: 'agent'
    },
    ragOff: {
      icon: '📚',
      title: t('knowledge.gateRagOffTitle'),
      desc: t('knowledge.gateRagOffDesc'),
      btn: t('knowledge.enableNow'),
      action: 'enable-rag'
    }
  }[kind];

  const btnHtml = cfg.tab
    ? `<button class="toolbox-add-btn" data-goto-tab="${cfg.tab}" style="width:auto; margin-top:14px; padding:8px 18px; border-style:solid; color:var(--brand-500); border-color:var(--brand-500);">${escapeHtml(cfg.btn)}</button>`
    : `<button class="toolbox-add-btn" data-action="${cfg.action}" style="width:auto; margin-top:14px; padding:8px 18px; border-style:solid; color:var(--brand-500); border-color:var(--brand-500);">${escapeHtml(cfg.btn)}</button>`;

  gateEl.innerHTML = `
    <div class="toolbox-empty" style="text-align:left; padding:24px 20px;">
      <div style="display:flex; align-items:center; gap:10px; font-size:15px; font-weight:600; color:var(--text-secondary);">
        <span style="font-size:22px;">${cfg.icon}</span><span>${escapeHtml(cfg.title)}</span>
      </div>
      <div style="margin-top:8px; line-height:1.7; color:var(--text-tertiary); font-size:13px;">${escapeHtml(cfg.desc)}</div>
      ${btnHtml}
    </div>`;
}

// ==================== 列表与卡片 ====================

async function loadAndRenderList() {
  const listEl = document.getElementById('knowledgeList');
  if (!listEl) return;
  listEl.innerHTML = renderLoading();

  try {
    const res = await agentApi('GET', '/api/rag/collections');
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
    cachedCollections = res.collections || [];
    renderList(cachedCollections);
  } catch (err) {
    logger.warn('[Knowledge] Failed to load collections:', err.message);
    updateCount([]);
    listEl.innerHTML = `
      <div class="toolbox-empty" style="grid-column:1/-1;">
        <div class="toolbox-empty-icon">⚠️</div>
        <div class="toolbox-empty-title">${escapeHtml(t('knowledge.loadFailed', { error: err.message }))}</div>
        <button class="toolbox-add-btn" id="kbRetryBtn" style="width:auto; margin-top:12px; padding:8px 18px;">${escapeHtml(t('knowledge.retry'))}</button>
      </div>`;
  }
}

function renderLoading() {
  return `
    <div class="toolbox-empty" style="grid-column:1/-1;">
      <div class="toolbox-empty-icon">⏳</div>
      <div class="toolbox-empty-title">${escapeHtml(t('toolbox.loading'))}</div>
    </div>`;
}

function renderList(collections) {
  const listEl = document.getElementById('knowledgeList');
  if (!listEl) return;

  // 无知识库（未创建）
  if (collections.length === 0) {
    updateCount(collections);
    listEl.innerHTML = `
      <div class="toolbox-empty" style="grid-column:1/-1; padding:50px 20px;">
        <div class="toolbox-empty-icon">📚</div>
        <div class="toolbox-empty-title">${escapeHtml(t('knowledge.emptyTitle'))}</div>
        <div class="toolbox-empty-desc">${escapeHtml(t('knowledge.emptyDesc'))}</div>
      </div>`;
    return;
  }

  // 应用状态筛选（启用状态）+ 搜索过滤（匹配名称 / 描述）
  const filtered = collections.filter(c => {
    if (kbFilterStatus === 'enabled' && c.enabled === false) return false;
    if (kbFilterStatus === 'disabled' && c.enabled !== false) return false;
    if (!kbFilterText) return true;
    const haystack = [c.name, c.description].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(kbFilterText.toLowerCase());
  });

  // 计数始终基于全量（与 MCP / 技能一致），不随筛选 / 搜索变化
  updateCount(collections);

  // 过滤后无匹配
  if (filtered.length === 0) {
    listEl.innerHTML = `
      <div class="toolbox-empty" style="grid-column:1/-1; padding:50px 20px;">
        <div class="toolbox-empty-icon">🔍</div>
        <div class="toolbox-empty-title">${escapeHtml(t('toolbox.noMatchResult'))}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = filtered.map(renderCard).join('');
}

function renderCard(c) {
  // 停用库：卡片弱化 + 徽标 + 启停按钮（与技能卡片停用态一致）
  const disabled = c.enabled === false;
  const modeLabel = c.embeddingConfig?.mode === 'openai-compat'
    ? t('knowledge.modeRemote') : t('knowledge.modeLocal');
  const model = c.embeddingConfig?.modelName || '';
  const modelLine = model ? `${modeLabel} · ${model}` : modeLabel;
  return `
    <div class="kb-card${disabled ? ' kb-card-disabled' : ''}" data-kb-id="${escapeHtml(c.id)}">
      <div class="kb-card-title">
        <span>📚</span>
        <span class="kb-card-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
        ${disabled ? `<span class="kb-card-badge badge-disabled">${escapeHtml(t('knowledge.badgeDisabled'))}</span>` : ''}
      </div>
      ${c.description ? `<div class="kb-card-desc" title="${escapeHtml(c.description)}">${escapeHtml(c.description)}</div>` : ''}
      <div class="kb-card-meta">${escapeHtml(t('knowledge.statsSummary', { docs: c.documentCount || 0, chunks: c.chunkCount || 0 }))}</div>
      <div class="kb-card-model">${escapeHtml(modelLine)}</div>
      <div class="kb-card-actions">
        <button class="kb-action-btn" type="button" data-action="edit">${escapeHtml(t('knowledge.actionEdit'))}</button>
        <button class="kb-action-btn" type="button" data-action="ingest">${escapeHtml(t('knowledge.actionIngest'))}</button>
        <button class="kb-action-btn" type="button" data-action="search">${escapeHtml(t('knowledge.actionSearch'))}</button>
        <button class="kb-action-btn" type="button" data-action="docs">${escapeHtml(t('knowledge.actionDocs'))}</button>
        <button class="kb-action-btn" type="button" data-action="export">${escapeHtml(t('knowledge.actionExport'))}</button>
        <button class="kb-action-btn" type="button" data-action="toggle">${escapeHtml(disabled ? t('knowledge.actionEnable') : t('knowledge.actionDisable'))}</button>
        <button class="kb-action-btn kb-action-danger" type="button" data-action="delete">${escapeHtml(t('knowledge.actionDelete'))}</button>
      </div>
    </div>`;
}

function updateCount(collections) {
  const el = document.getElementById('knowledgeCount');
  if (!el) return;
  const total = collections.length;
  if (total === 0) {
    el.style.display = 'none';
    return;
  }
  // 与 MCP / 技能一致：展示「已启用 X / 共 Y」
  const enabled = collections.filter(c => c.enabled !== false).length;
  el.textContent = t('toolbox.enabledCountTotal', { enabled, total });
  el.style.display = '';
}

// ==================== 卡片操作 ====================

async function onListClick(e) {
  // 重试按钮
  if (e.target.closest('#kbRetryBtn')) {
    await loadAndRenderList();
    return;
  }

  const btn = e.target.closest('.kb-action-btn');
  if (!btn) return;

  const card = btn.closest('[data-kb-id]');
  const collection = cachedCollections.find(x => x.id === card?.dataset.kbId);
  if (!collection) return;

  const action = btn.dataset.action;
  if (action === 'ingest') {
    showIngestDialog(collection);
  } else if (action === 'edit') {
    showEditDialog(collection);
  } else if (action === 'search') {
    showSearchDialog(collection);
  } else if (action === 'docs') {
    showDocsDialog(collection);
  } else if (action === 'export') {
    await handleExportCollection(btn, collection);
  } else if (action === 'toggle') {
    await handleToggleCollection(collection);
  } else if (action === 'delete') {
    await handleDeleteCollection(collection);
  }
}

async function handleDeleteCollection(c) {
  const confirmed = await showCustomConfirm(
    t('knowledge.deleteConfirm', {
      name: c.name,
      docs: c.documentCount || 0,
      chunks: c.chunkCount || 0
    }),
    t('knowledge.deleteConfirmTitle')
  );
  if (!confirmed) return;

  try {
    const res = await agentApi('DELETE', `/api/rag/collections/${encodeURIComponent(c.id)}`);
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
    showToast(t('knowledge.deleteSuccess'), 'success');
    await loadAndRenderList();
  } catch (err) {
    showToast(t('knowledge.opFailed', { error: err.message }), 'error');
  }
}

/**
 * 启停知识库：停用后大模型自主检索/导入不再使用该库；用户仍可在侧边栏 @ 手动引用
 */
async function handleToggleCollection(c) {
  try {
    const res = await agentApi('POST', `/api/rag/collections/${encodeURIComponent(c.id)}/toggle`);
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
    showToast(
      res.enabled === false
        ? t('knowledge.disableSuccess', { name: c.name })
        : t('knowledge.enableSuccess', { name: c.name }),
      'success'
    );
    await loadAndRenderList();
  } catch (err) {
    showToast(t('knowledge.opFailed', { error: err.message }), 'error');
  }
}

// ==================== 向量配置表单 ====================

/**
 * 向量配置表单（创建/编辑弹窗共用）
 * @param {object} cfg 当前 embeddingConfig（编辑场景；创建时传空对象）
 * @returns {string} HTML
 */
function renderVectorForm(cfg = {}) {
  const remote = cfg.mode === 'openai-compat';
  return `
    <div class="form-group">
      <label>${escapeHtml(t('knowledge.vectorSectionTitle'))}</label>
      <div class="kb-radio-row">
        <label class="kb-radio-inline">
          <input type="radio" name="kbVecMode" value="local"${remote ? '' : ' checked'}>
          ${escapeHtml(t('knowledge.vectorModeLocal'))}
        </label>
        <label class="kb-radio-inline">
          <input type="radio" name="kbVecMode" value="openai-compat"${remote ? ' checked' : ''}>
          ${escapeHtml(t('knowledge.vectorModeRemote'))}
        </label>
      </div>
      <div class="kb-vec-hint" id="kbVecHint">${escapeHtml(remote ? t('knowledge.vectorModeRemoteHint') : t('knowledge.vectorModeLocalHint'))}</div>
      <div id="kbVecRemoteFields"${remote ? '' : ' style="display:none"'}>
        <div class="form-group" style="margin-top:10px;">
          <label>${escapeHtml(t('knowledge.vectorEndpointLabel'))}</label>
          <input type="text" id="kbVecEndpoint" placeholder="${escapeHtml(t('knowledge.vectorEndpointPlaceholder'))}" value="${escapeHtml(cfg.endpoint || '')}">
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('knowledge.vectorApiKeyLabel'))}</label>
          <input type="password" id="kbVecApiKey" value="" placeholder="${escapeHtml(cfg.apiKey || cfg.hasApiKey ? t('knowledge.vectorApiKeyKeep') : t('knowledge.vectorApiKeyPlaceholder'))}">
        </div>
        <div class="form-group">
          <label>${escapeHtml(t('knowledge.vectorModelLabel'))}</label>
          <input type="text" id="kbVecModel" placeholder="${escapeHtml(t('knowledge.vectorModelPlaceholder'))}" value="${escapeHtml(remote ? (cfg.modelName || '') : '')}">
        </div>
        <div class="form-group" style="margin-bottom:0;">
          <label>${escapeHtml(t('knowledge.vectorDimsLabel'))}</label>
          <div class="kb-vec-test-row">
            <input type="number" id="kbVecDims" min="1" max="8192" placeholder="${escapeHtml(t('knowledge.vectorDimsPlaceholder'))}" value="${remote && cfg.dimensions ? escapeHtml(String(cfg.dimensions)) : ''}">
            <button class="kb-action-btn" type="button" id="kbVecTestBtn">${escapeHtml(t('knowledge.vectorTestBtn'))}</button>
            <span class="kb-vec-test-result" id="kbVecTestResult"></span>
          </div>
        </div>
      </div>
    </div>`;
}

/**
 * 绑定向量表单交互（模式切换显隐 + 测试连通性自动探测维度）
 * @param {HTMLElement} overlay 弹窗根元素
 * @param {string|null} [collectionId] 编辑场景的知识库 ID（测试连通性时空密钥复用已保存密钥）
 */
function bindVectorFormEvents(overlay, collectionId = null) {
  const remoteFields = overlay.querySelector('#kbVecRemoteFields');
  const hintEl = overlay.querySelector('#kbVecHint');
  const syncMode = () => {
    const remote = overlay.querySelector('input[name="kbVecMode"]:checked')?.value === 'openai-compat';
    if (remoteFields) remoteFields.style.display = remote ? '' : 'none';
    if (hintEl) hintEl.textContent = remote ? t('knowledge.vectorModeRemoteHint') : t('knowledge.vectorModeLocalHint');
  };
  overlay.querySelectorAll('input[name="kbVecMode"]').forEach(r => r.addEventListener('change', syncMode));
  syncMode();

  const testBtn = overlay.querySelector('#kbVecTestBtn');
  if (!testBtn) return;
  const resultEl = overlay.querySelector('#kbVecTestResult');
  const dimsInput = overlay.querySelector('#kbVecDims');
  testBtn.addEventListener('click', async () => {
    const endpoint = overlay.querySelector('#kbVecEndpoint').value.trim();
    const modelName = overlay.querySelector('#kbVecModel').value.trim();
    if (!endpoint) {
      showToast(t('knowledge.vectorEndpointRequired'), 'warning');
      return;
    }
    if (!modelName) {
      showToast(t('knowledge.vectorModelRequired'), 'warning');
      return;
    }
    // API Key 留空：编辑场景由代理端经 collectionId 复用已保存密钥（不回传明文）
    const apiKey = overlay.querySelector('#kbVecApiKey').value.trim();
    // 维度填了就透传（支持降维的模型按指定维度探测）；留空则用平台默认维度
    const typedDims = parseInt(dimsInput?.value.trim() || '', 10);

    testBtn.disabled = true;
    const prevText = testBtn.textContent;
    testBtn.textContent = t('knowledge.vectorTesting');
    if (resultEl) {
      resultEl.textContent = '';
      resultEl.style.color = '';
    }
    try {
      const res = await agentApi('POST', '/api/rag/test-embedding', {
        mode: 'openai-compat', endpoint, apiKey, modelName,
        ...(collectionId ? { collectionId } : {}),
        ...(Number.isFinite(typedDims) && typedDims > 0 ? { dimensions: typedDims } : {}),
      });
      if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
      if (resultEl) {
        resultEl.textContent = `✓ ${t('knowledge.vectorTestOk', { model: res.model, dims: res.dimensions })}`;
        resultEl.style.color = 'var(--success-strong)';
      }
      // 自动填充/修正维度
      if (dimsInput && res.dimensions) {
        const prevDims = dimsInput.value.trim();
        dimsInput.value = String(res.dimensions);
        if (prevDims !== String(res.dimensions)) {
          showToast(t('knowledge.vectorDimsFilled', { dims: res.dimensions }), 'info');
        }
      }
    } catch (err) {
      if (resultEl) {
        resultEl.textContent = `✕ ${t('knowledge.vectorTestFailed', { error: err.message })}`;
        resultEl.style.color = 'var(--danger-strong)';
      }
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = prevText || t('knowledge.vectorTestBtn');
    }
  });
}

/**
 * 读取向量表单为提交体（local 仅模式；remote 含完整字段）
 * @param {HTMLElement} overlay 弹窗根元素
 * @returns {object} embeddingConfig
 */
function readVectorForm(overlay) {
  const remote = overlay.querySelector('input[name="kbVecMode"]:checked')?.value === 'openai-compat';
  if (!remote) return { mode: 'local' };
  const dims = parseInt(overlay.querySelector('#kbVecDims').value.trim(), 10);
  return {
    mode: 'openai-compat',
    endpoint: overlay.querySelector('#kbVecEndpoint').value.trim(),
    // 留空沿用已保存密钥（代理端在更新时保留原值，见 updateCollection 的空值继承）
    apiKey: overlay.querySelector('#kbVecApiKey').value.trim(),
    modelName: overlay.querySelector('#kbVecModel').value.trim(),
    ...(Number.isFinite(dims) && dims > 0 ? { dimensions: dims } : {}),
  };
}

/**
 * 判断向量配置变更是否影响向量空间（需重建索引；与 agent 端 needsIndexRebuild 对齐）
 * 未提供的字段视为沿用已保存值（与后端 resolveEmbeddingConfig 语义一致）
 */
function isEmbeddingSpaceChanged(prev = {}, next = {}) {
  const prevMode = prev.mode || 'local';
  const nextMode = next.mode || 'local';
  if (prevMode !== nextMode) return true;
  if (nextMode === 'local') return false; // 本地模式无可选参数
  return ['endpoint', 'modelName', 'dimensions'].some(k => {
    if (next[k] === undefined) return false;
    return String(prev[k] ?? '') !== String(next[k] ?? '');
  });
}

/**
 * 轮询索引重建进度直至完成/失败（编辑弹窗关闭后后台进行；上限 30 分钟）
 * @returns {Promise<{phase: string, error?: string}>}
 */
function waitForRebuildDone(collectionId) {
  const POLL_INTERVAL = 1000;
  const TIMEOUT = 30 * 60 * 1000;
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(async () => {
      if (Date.now() - startedAt > TIMEOUT) {
        clearInterval(timer);
        reject(new Error('rebuild polling timeout'));
        return;
      }
      try {
        const s = await agentApi('GET', `/api/rag/collections/${encodeURIComponent(collectionId)}/ingest/status`);
        const p = s?.progress;
        if (p && p.done) {
          clearInterval(timer);
          resolve(p);
        }
      } catch {
        // 单次轮询失败忽略，等待下次重试
      }
    }, POLL_INTERVAL);
  });
}

// ==================== 编辑知识库 ====================

function showEditDialog(c) {
  const modal = createModal({
    title: t('knowledge.editTitle'),
    bodyHtml: `
      <div class="form-group">
        <label>${escapeHtml(t('knowledge.nameLabel'))}</label>
        <input type="text" id="kbEditName" maxlength="100" placeholder="${escapeHtml(t('knowledge.namePlaceholder'))}" value="${escapeHtml(c.name || '')}">
      </div>
      <div class="form-group">
        <label>${escapeHtml(t('knowledge.descLabel'))}</label>
        <input type="text" id="kbEditDesc" maxlength="500" placeholder="${escapeHtml(t('knowledge.descPlaceholder'))}" value="${escapeHtml(c.description || '')}">
      </div>
      ${renderVectorForm(c.embeddingConfig || {})}`,
    confirmText: t('knowledge.editConfirm'),
    closeOnOverlay: false,
    onConfirm: async ({ close, setBusy }) => {
      const { overlay } = modal;
      const name = overlay.querySelector('#kbEditName').value.trim();
      const description = overlay.querySelector('#kbEditDesc').value.trim();
      if (!name) {
        showToast(t('knowledge.nameRequired'), 'warning');
        return;
      }

      const embeddingConfig = readVectorForm(overlay);
      if (embeddingConfig.mode === 'openai-compat') {
        if (!embeddingConfig.endpoint) {
          showToast(t('knowledge.vectorEndpointRequired'), 'warning');
          return;
        }
        if (!embeddingConfig.modelName) {
          showToast(t('knowledge.vectorModelRequired'), 'warning');
          return;
        }
      }

      // 向量空间变更 → 二次确认（提交后将触发索引重建）
      if (isEmbeddingSpaceChanged(c.embeddingConfig || {}, embeddingConfig)) {
        const ok = await showCustomConfirm(t('knowledge.rebuildConfirm'), t('knowledge.rebuildConfirmTitle'));
        if (!ok) return;
      }

      setBusy(true, t('knowledge.saving'));
      try {
        const res = await agentApi('PUT', `/api/rag/collections/${encodeURIComponent(c.id)}`, { name, description, embeddingConfig });
        if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
        close();
        if (res.collection?.rebuilding) {
          // 后台重建中：先提示，轮询完成后自动刷新列表
          showToast(t('knowledge.rebuildStarted'), 'info');
          await loadAndRenderList();
          waitForRebuildDone(c.id).then(p => {
            if (p.phase === 'error') {
              showToast(t('knowledge.rebuildFailed', { error: p.error || 'unknown error' }), 'error');
            } else {
              showToast(t('knowledge.rebuildDone'), 'success');
            }
            loadAndRenderList();
          }).catch(err => {
            showToast(t('knowledge.rebuildFailed', { error: err.message }), 'error');
            loadAndRenderList();
          });
        } else {
          showToast(t('knowledge.editSuccess'), 'success');
          await loadAndRenderList();
        }
      } catch (err) {
        setBusy(false, t('knowledge.editConfirm'));
        showToast(t('knowledge.opFailed', { error: err.message }), 'error');
      }
    }
  });
  bindVectorFormEvents(modal.overlay, c.id);
  // 预填名称：聚焦并全选，便于直接覆盖输入
  const nameInput = modal.overlay.querySelector('#kbEditName');
  nameInput?.focus();
  nameInput?.select();
}

// ==================== 新建知识库 ====================

function showCreateDialog() {
  const modal = createModal({
    title: t('knowledge.createTitle'),
    bodyHtml: `
      <div class="form-group">
        <label>${escapeHtml(t('knowledge.nameLabel'))}</label>
        <input type="text" id="kbCreateName" maxlength="100" placeholder="${escapeHtml(t('knowledge.namePlaceholder'))}">
      </div>
      <div class="form-group">
        <label>${escapeHtml(t('knowledge.descLabel'))}</label>
        <input type="text" id="kbCreateDesc" maxlength="500" placeholder="${escapeHtml(t('knowledge.descPlaceholder'))}">
      </div>
      ${renderVectorForm({})}`,
    confirmText: t('knowledge.createConfirm'),
    closeOnOverlay: false,
    onConfirm: async ({ close, setBusy }) => {
      const { overlay } = modal;
      const name = overlay.querySelector('#kbCreateName').value.trim();
      const description = overlay.querySelector('#kbCreateDesc').value.trim();
      if (!name) {
        showToast(t('knowledge.nameRequired'), 'warning');
        return;
      }

      const embeddingConfig = readVectorForm(overlay);
      if (embeddingConfig.mode === 'openai-compat') {
        if (!embeddingConfig.endpoint) {
          showToast(t('knowledge.vectorEndpointRequired'), 'warning');
          return;
        }
        if (!embeddingConfig.modelName) {
          showToast(t('knowledge.vectorModelRequired'), 'warning');
          return;
        }
      }

      setBusy(true, t('knowledge.creating'));
      try {
        const res = await agentApi('POST', '/api/rag/collections', { name, description, embeddingConfig });
        if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
        close();
        showToast(t('knowledge.createSuccess', { name: res.collection?.name || name }), 'success');
        await loadAndRenderList();
      } catch (err) {
        setBusy(false, t('knowledge.createConfirm'));
        showToast(t('knowledge.opFailed', { error: err.message }), 'error');
      }
    }
  });
  bindVectorFormEvents(modal.overlay);
  modal.overlay.querySelector('#kbCreateName')?.focus();
}

// ==================== 导入文档 ====================

/**
 * 导入进度快照 → 状态文案（阶段 + 向量化进度；快照缺失时回退笼统文案）
 */
function formatIngestProgress(p) {
  switch (p?.phase) {
    case 'parsing':
      return `⏳ ${t('knowledge.progressParsing')}`;
    case 'chunking':
      return `⏳ ${t('knowledge.progressChunking')}`;
    case 'embedding':
      return `⏳ ${t('knowledge.progressEmbedding', { current: p.current || 0, total: p.total || 0 })}`;
    case 'storing':
      return `⏳ ${t('knowledge.progressStoring')}`;
    case 'rebuilding':
      return `⏳ ${t('knowledge.progressRebuilding', { current: p.current || 0, total: p.total || 0 })}`;
    default:
      return `⏳ ${t('knowledge.ingesting')}`;
  }
}

/**
 * 从 accept 字符串（".txt,.md,..."）提取小写扩展名集合
 */
function extSetFromAccept(accept) {
  return new Set(
    String(accept || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(s => s.startsWith('.'))
  );
}

/**
 * 取文件名的扩展名（含前导点，小写；无扩展名返回空串）
 */
function fileExt(name) {
  const dot = String(name || '').toLowerCase().lastIndexOf('.');
  return dot >= 0 ? String(name).slice(dot).toLowerCase() : '';
}

/**
 * 批量文件校验（纯函数，便于单测）：先查数量上限，再逐个查大小与扩展名；
 * 任一项不通过即整批拒绝。空列表视为通过（交由调用方判空）。
 * @param {Array<{name: string, size: number}>} files
 * @param {{ maxCount: number, maxSize: number, accept: string }} opts
 * @returns {{ ok: boolean, reason: (string|null), detail: * }} reason: null|'tooMany'|'tooLarge'|'badType'
 */
export function validateBatchFiles(files, { maxCount, maxSize, accept }) {
  const exts = extSetFromAccept(accept);
  if (files.length > maxCount) {
    return { ok: false, reason: 'tooMany', detail: { max: maxCount, count: files.length } };
  }
  for (const f of files) {
    if (f.size > maxSize) {
      return { ok: false, reason: 'tooLarge', detail: { name: f.name } };
    }
    const ext = fileExt(f.name);
    if (exts.size > 0 && !exts.has(ext)) {
      return { ok: false, reason: 'badType', detail: { name: f.name } };
    }
  }
  return { ok: true, reason: null, detail: null };
}

/**
 * 串行执行批量导入（纯编排，便于单测）：逐个 await ingestOne，失败记录后继续下一个。
 * （agent 端同库 _activeOps 互斥，并发会直接报错，故必须串行而非并发。）
 * @param {Array} files
 * @ {(file: any, index: number) => Promise<{ chunkCount?: number }>} ingestOne
 * @ {(info: { index: number, total: number, file: any }) => void} [onProgress]
 * @returns {Promise<{ total: number, successCount: number, failCount: number, totalChunks: number, failures: Array<{name: string, error: string}> }>}
 */
export async function runBatchIngest(files, ingestOne, onProgress) {
  const total = files.length;
  let successCount = 0;
  let totalChunks = 0;
  const failures = [];
  for (let i = 0; i < total; i++) {
    const file = files[i];
    if (onProgress) onProgress({ index: i, total, file });
    try {
      const res = await ingestOne(file, i);
      successCount += 1;
      totalChunks += (res && res.chunkCount) || 0;
    } catch (err) {
      failures.push({ name: file.name, error: (err && err.message) || String(err) });
    }
  }
  return { total, successCount, failCount: failures.length, totalChunks, failures };
}

function showIngestDialog(c) {
  const bodyHtml = `
    <div class="import-tabs" id="kbIngestTabs">
      <button type="button" class="import-tab active" data-tab="file">${escapeHtml(t('knowledge.tabFile'))}</button>
      <button type="button" class="import-tab" data-tab="text">${escapeHtml(t('knowledge.tabText'))}</button>
      <button type="button" class="import-tab" data-tab="url">${escapeHtml(t('knowledge.tabUrl'))}</button>
    </div>
    <div class="import-panel active" data-panel="file">
      <div class="upload-drop-zone" id="kbDropzone">
        <div class="upload-icon">📄</div>
        <div style="margin-top:8px; color:var(--text-secondary); font-size:13px;">${escapeHtml(t('knowledge.dropHint'))}</div>
        <div style="margin-top:6px; font-size:12px; color:var(--text-tertiary);">${escapeHtml(t('knowledge.dropSupported'))}</div>
      </div>
      <div id="kbSelectedFiles" class="kb-selected-files" style="display:none;"></div>
      <input type="file" id="kbFileInput" multiple style="display:none" accept="${ACCEPT_EXTS}">
    </div>
    <div class="import-panel" data-panel="text">
      <div class="form-group">
        <label>${escapeHtml(t('knowledge.textNameLabel'))}</label>
        <input type="text" id="kbIngestName" maxlength="100" placeholder="${escapeHtml(t('knowledge.textNamePlaceholder'))}">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>${escapeHtml(t('knowledge.textContentLabel'))}</label>
        <textarea id="kbIngestText" rows="8" placeholder="${escapeHtml(t('knowledge.textContentPlaceholder'))}"></textarea>
      </div>
    </div>
    <div class="import-panel" data-panel="url">
      <div class="form-group" style="margin-bottom:0;">
        <label>${escapeHtml(t('knowledge.urlLabel'))}</label>
        <input type="url" id="kbIngestUrl" placeholder="${escapeHtml(t('knowledge.urlPlaceholder'))}">
      </div>
    </div>
    <div class="kb-chunk-row">
      <span class="kb-chunk-title">${escapeHtml(t('knowledge.chunkSettingsTitle'))}</span>
      <label class="kb-chunk-inline">${escapeHtml(t('knowledge.chunkSizeLabel'))}
        <input type="number" id="kbChunkSize" min="100" max="2000" step="50" value="${DEFAULT_CHUNK_SIZE}">
      </label>
      <label class="kb-chunk-inline">${escapeHtml(t('knowledge.chunkOverlapLabel'))}
        <input type="number" id="kbChunkOverlap" min="0" max="500" step="10" value="${DEFAULT_CHUNK_OVERLAP}">
      </label>
    </div>
    <div id="kbIngestStatus" class="kb-status" style="display:none;">⏳ ${escapeHtml(t('knowledge.ingesting'))}</div>`;

  // 批量已选文件（累加式：多次选择/拖拽合并，可逐个移除）
  let selectedFiles = [];

  const modal = createModal({
    title: t('knowledge.ingestTitle', { name: c.name }),
    bodyHtml,
    confirmText: t('knowledge.ingestConfirm'),
    onConfirm: async ({ close, setBusy }) => {
      const { overlay } = modal;
      const activeTab = overlay.querySelector('.import-tab.active')?.dataset.tab || 'file';
      const statusEl = overlay.querySelector('#kbIngestStatus');
      const ingestPath = `/api/rag/collections/${encodeURIComponent(c.id)}/ingest`;

      // 分块设置（数值合法性校验，非法值回退默认；批量内所有文件一致）
      const chunkSize = parseInt(overlay.querySelector('#kbChunkSize').value, 10);
      const overlap = parseInt(overlay.querySelector('#kbChunkOverlap').value, 10);
      const chunkConfig = {
        ...(Number.isFinite(chunkSize) && chunkSize >= 100 && chunkSize <= 2000 ? { chunkSize } : {}),
        ...(Number.isFinite(overlap) && overlap >= 0 && overlap <= 500 ? { overlap } : {}),
      };

      // ===== 文件：批量串行导入（agent 端同库 _activeOps 互斥，不可并发） =====
      if (activeTab === 'file') {
        if (selectedFiles.length === 0) {
          showToast(t('knowledge.fileRequired'), 'warning');
          return;
        }
        const check = validateBatchFiles(selectedFiles, { maxCount: MAX_BATCH_FILES, maxSize: MAX_FILE_SIZE, accept: ACCEPT_EXTS });
        if (!check.ok) {
          if (check.reason === 'tooMany') showToast(t('knowledge.maxBatchFiles', { max: check.detail.max }), 'warning');
          else if (check.reason === 'tooLarge') showToast(t('knowledge.fileTooLarge'), 'warning');
          else showToast(t('knowledge.fileTypeUnsupported', { name: check.detail.name }), 'warning');
          return;
        }

        if (statusEl) { statusEl.style.display = ''; statusEl.style.color = ''; }
        setBusy(true);

        // 批次标签（多文件时前缀「正在导入 i/N：文件名」）与分阶段进度合并展示
        let batchLabel = '';
        const updateStatus = (progress) => {
          if (!statusEl) return;
          const phase = progress ? formatIngestProgress(progress) : `⏳ ${t('knowledge.ingesting')}`;
          statusEl.textContent = batchLabel ? `${batchLabel} · ${phase}` : phase;
        };
        updateStatus(null);

        // POST 阻塞期间经 /ingest/status 轮询分阶段进度（解析 → 分块 → 向量化 x/y → 存储）
        const pollTimer = setInterval(async () => {
          try {
            const s = await agentApi('GET', `${ingestPath}/status`);
            if (s && s.success && s.progress) updateStatus(s.progress);
          } catch {}
        }, 800);

        const total = selectedFiles.length;
        const resultNames = [];
        let skippedOriginal = 0;
        let summary;
        try {
          summary = await runBatchIngest(
            selectedFiles,
            async (file) => {
              const contentBase64 = await readFileBase64(file);
              const res = await agentApi('POST', ingestPath, { type: 'file', fileName: file.name, contentBase64, chunkConfig });
              if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
              resultNames.push(res.name || file.name);
              if (res.originalSkipped) skippedOriginal += 1;
              return res;
            },
            ({ index, file }) => {
              batchLabel = total > 1 ? t('knowledge.importingBatch', { current: index + 1, total, name: file.name }) : '';
              updateStatus(null);
            }
          );
        } finally {
          clearInterval(pollTimer);
        }

        // 汇总：全成功 / 部分失败 → 关闭并刷新列表；全失败 → 保留弹窗与已选列表供修正后重试
        if (summary.failCount === 0) {
          close();
          showToast(total === 1
            ? t('knowledge.ingestSuccess', { name: resultNames[0] || selectedFiles[0].name, chunks: summary.totalChunks })
            : t('knowledge.batchAllSuccess', { count: summary.successCount, chunks: summary.totalChunks }), 'success');
          await loadAndRenderList();
        } else if (summary.successCount > 0) {
          close();
          showToast(t('knowledge.batchPartial', { success: summary.successCount, fail: summary.failCount, error: summary.failures[0].error }), 'warning');
          await loadAndRenderList();
        } else {
          if (statusEl) {
            statusEl.style.color = 'var(--danger-strong)';
            statusEl.innerHTML = summary.failures.map(f => `<div class="kb-ingest-fail-item">✕ ${escapeHtml(f.name)}：${escapeHtml(f.error)}</div>`).join('');
          }
          setBusy(false, t('knowledge.ingestConfirm'));
          showToast(t('knowledge.batchAllFailed', { error: summary.failures[0].error }), 'error');
        }
        // 原件超配额只跳归档，导入仍然算成功 → 单独用 warning 提醒
        if (skippedOriginal > 0) showToast(t('knowledge.docOriginalSkippedToast'), 'warning');
        return;
      }

      // ===== 文本 / URL：单条导入（行为与原实现一致） =====
      let payload;
      if (activeTab === 'text') {
        const content = overlay.querySelector('#kbIngestText').value;
        const name = overlay.querySelector('#kbIngestName').value.trim();
        if (!content.trim()) {
          showToast(t('knowledge.contentRequired'), 'warning');
          return;
        }
        payload = { type: 'text', content, name: name || undefined };
      } else {
        const url = overlay.querySelector('#kbIngestUrl').value.trim();
        if (!url) {
          showToast(t('knowledge.urlRequired'), 'warning');
          return;
        }
        payload = { type: 'url', url };
      }
      payload.chunkConfig = chunkConfig;

      if (statusEl) {
        statusEl.style.display = '';
        statusEl.style.color = '';
        statusEl.textContent = `⏳ ${t('knowledge.ingesting')}`;
      }
      setBusy(true);

      const pollTimer = setInterval(async () => {
        try {
          const s = await agentApi('GET', `${ingestPath}/status`);
          if (statusEl && s && s.success && s.progress) {
            statusEl.textContent = formatIngestProgress(s.progress);
          }
        } catch {}
      }, 800);

      try {
        const res = await agentApi('POST', ingestPath, payload);
        if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
        close();
        showToast(t('knowledge.ingestSuccess', { name: res.name, chunks: res.chunkCount }), 'success');
        if (res.originalSkipped) showToast(t('knowledge.docOriginalSkippedToast'), 'warning');
        await loadAndRenderList();
      } catch (err) {
        if (statusEl) statusEl.style.display = 'none';
        setBusy(false);
        showToast(t('knowledge.ingestFailed', { error: err.message }), 'error');
      } finally {
        clearInterval(pollTimer);
      }
    }
  });

  // Tab 切换 / 文件选择 / 拖拽（弹窗局部交互）
  const { overlay } = modal;
  overlay.querySelector('#kbIngestTabs').addEventListener('click', (e) => {
    const tab = e.target.closest('.import-tab');
    if (!tab) return;
    overlay.querySelectorAll('.import-tab').forEach(x => x.classList.toggle('active', x === tab));
    overlay.querySelectorAll('.import-panel').forEach(p => {
      p.classList.toggle('active', p.dataset.panel === tab.dataset.tab);
    });
  });

  const dropzone = overlay.querySelector('#kbDropzone');
  const fileInput = overlay.querySelector('#kbFileInput');
  const selectedListEl = overlay.querySelector('#kbSelectedFiles');

  const formatSize = (bytes) => {
    if (!Number.isFinite(bytes)) return '';
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${bytes} B`;
  };

  const renderSelectedFiles = () => {
    if (selectedFiles.length === 0) {
      selectedListEl.style.display = 'none';
      selectedListEl.innerHTML = '';
      dropzone.classList.remove('has-file');
      return;
    }
    dropzone.classList.add('has-file');
    selectedListEl.style.display = '';
    selectedListEl.innerHTML = `
      <div class="kb-selected-count">${escapeHtml(t('knowledge.selectedCount', { count: selectedFiles.length, max: MAX_BATCH_FILES }))}</div>
      ${selectedFiles.map((f, idx) => `
        <div class="kb-selected-file" data-idx="${idx}">
          <span class="kb-selected-name" title="${escapeHtml(f.name)}">${escapeHtml(f.name)}</span>
          <span class="kb-selected-size">${escapeHtml(formatSize(f.size))}</span>
          <button class="kb-selected-del" type="button" data-remove="${idx}" title="${escapeHtml(t('knowledge.removeFile'))}">✕</button>
        </div>`).join('')}`;
  };

  // 累加式添加：按「名称+大小」去重，合并后整批校验；任一项不通过则丢弃本次新增、保留原已选
  const addFiles = (fileList) => {
    const incoming = Array.from(fileList || []);
    if (incoming.length === 0) return;
    const seen = new Set(selectedFiles.map(f => `${f.name}::${f.size}`));
    const merged = selectedFiles.concat(incoming.filter(f => !seen.has(`${f.name}::${f.size}`)));
    const check = validateBatchFiles(merged, { maxCount: MAX_BATCH_FILES, maxSize: MAX_FILE_SIZE, accept: ACCEPT_EXTS });
    if (!check.ok) {
      if (check.reason === 'tooMany') showToast(t('knowledge.maxBatchFiles', { max: check.detail.max }), 'warning');
      else if (check.reason === 'tooLarge') showToast(t('knowledge.fileTooLarge'), 'warning');
      else showToast(t('knowledge.fileTypeUnsupported', { name: check.detail.name }), 'warning');
      return;
    }
    selectedFiles = merged;
    renderSelectedFiles();
  };

  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    addFiles(fileInput.files);
    fileInput.value = ''; // 允许再次选择同一文件仍触发 change
  });
  dropzone.addEventListener('dragover', (e) => e.preventDefault());
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    addFiles(e.dataTransfer?.files);
  });
  // 逐个移除（事件委托，重渲染后仍有效）
  selectedListEl.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-remove]');
    if (!btn) return;
    e.stopPropagation();
    const idx = parseInt(btn.dataset.remove, 10);
    if (Number.isFinite(idx)) {
      selectedFiles.splice(idx, 1);
      renderSelectedFiles();
    }
  });
}

/**
 * 读取文件为 base64（去掉 data URL 前缀）
 */
function readFileBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result || '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.onerror = () => reject(reader.error || new Error('File read failed'));
    reader.readAsDataURL(file);
  });
}

// ==================== 文档管理 ====================

function showDocsDialog(c) {
  const modal = createModal({
    title: t('knowledge.docsTitle', { name: c.name }),
    bodyHtml: `<div id="kbDocsBody">${renderLoading()}</div>`,
    confirmText: null,
    cancelText: t('common.close'),
    wide: true,
  });

  const body = modal.overlay.querySelector('#kbDocsBody');

  // 行内动作（事件委托，重渲染后仍有效）：查看文本 / 下载原件 / 删除
  body.addEventListener('click', async (e) => {
    const row = e.target.closest('[data-doc-id]');
    const docId = row?.dataset.docId;
    if (!docId) return;
    const docName = row.querySelector('.kb-doc-name')?.textContent || docId;

    const viewBtn = e.target.closest('[data-doc-view]');
    if (viewBtn) {
      await showDocTextDialog(c, docId);
      return;
    }

    const downloadBtn = e.target.closest('[data-doc-download]');
    if (downloadBtn) {
      await handleDocDownload(downloadBtn, c, docId, downloadBtn.dataset.docDownload);
      return;
    }

    if (!e.target.closest('[data-doc-delete]')) return;
    const confirmed = await showCustomConfirm(
      t('knowledge.docDeleteConfirm', { name: docName }),
      t('knowledge.docDeleteConfirmTitle')
    );
    if (!confirmed) return;

    try {
      const res = await agentApi(
        'DELETE',
        `/api/rag/collections/${encodeURIComponent(c.id)}/documents/${encodeURIComponent(docId)}`
      );
      if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
      showToast(t('knowledge.docDeleteSuccess'), 'success');
      await refreshDocsList(body, c);
      loadAndRenderList(); // 后台刷新卡片计数
    } catch (err) {
      showToast(t('knowledge.opFailed', { error: err.message }), 'error');
    }
  });

  refreshDocsList(body, c);
}

/** 来源徽标：file / url / text（旧备份可能为 unknown，不展示徽标） */
function docSourceBadge(source) {
  if (source === 'file') return { key: 'docSourceFile', cls: 'kb-doc-badge-file' };
  if (source === 'url') return { key: 'docSourceUrl', cls: 'kb-doc-badge-url' };
  if (source === 'text') return { key: 'docSourceText', cls: 'kb-doc-badge-text' };
  return null;
}

/** 元信息片段：分块数 · 原件大小 · 导入时间（外加原件缺失原因） */
function buildDocMeta(doc) {
  const parts = [t('knowledge.docChunkCount', { count: doc.chunkCount || 0 })];
  if (doc.original?.size) parts.push(t('knowledge.docOriginalSize', { size: formatBytes(doc.original.size) }));
  parts.push(formatTime(doc.createdAt));
  if (!doc.original && doc.source !== 'text') {
    parts.push(doc.originalSkipped === 'quotaExceeded'
      ? t('knowledge.docOriginalQuotaSkipped')
      : t('knowledge.docNoOriginal'));
  }
  return parts.join(' · ');
}

async function refreshDocsList(body, c) {
  body.innerHTML = renderLoading();
  try {
    const res = await agentApi('GET', `/api/rag/collections/${encodeURIComponent(c.id)}/documents`);
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
    const docs = res.documents || [];

    if (docs.length === 0) {
      body.innerHTML = `<div class="kb-status" style="color:var(--text-tertiary);">${escapeHtml(t('knowledge.docsEmpty'))}</div>`;
      return;
    }

    body.innerHTML = `<div class="kb-doc-list">${docs.map(d => {
      const badge = docSourceBadge(d.source);
      const hasOriginal = Boolean(d.original);
      // 无原件时禁用下载并说明原因（text 文档本就没有原件，提示改为“仅文本”语义）
      const downloadHint = hasOriginal
        ? t('knowledge.docDownloadOriginal')
        : (d.source === 'text' ? t('knowledge.docNoOriginalText') : t('knowledge.docOriginalMissing'));
      return `
      <div class="kb-doc-row" data-doc-id="${escapeHtml(d.id)}">
        <div class="kb-doc-info">
          <div class="kb-doc-title">
            <span class="kb-doc-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</span>
            ${badge ? `<span class="kb-doc-badge ${badge.cls}">${escapeHtml(t(`knowledge.${badge.key}`))}</span>` : ''}
          </div>
          <div class="kb-doc-meta">${escapeHtml(buildDocMeta(d))}${d.original && d.original.name && d.original.name !== d.name ? ` · ${escapeHtml(t('knowledge.docOriginalName', { name: d.original.name }))}` : ''}</div>
        </div>
        <div class="kb-doc-actions">
          <button class="kb-doc-act" type="button" data-doc-view title="${escapeHtml(t('knowledge.docViewTitle'))}">${escapeHtml(t('knowledge.docView'))}</button>
          <button class="kb-doc-act" type="button" data-doc-download="original" title="${escapeHtml(downloadHint)}"
            ${hasOriginal ? '' : 'disabled'}>${escapeHtml(t('knowledge.docDownloadOriginal'))}</button>
          <button class="kb-doc-del" type="button" data-doc-delete title="${escapeHtml(t('knowledge.actionDelete'))}">✕</button>
        </div>
      </div>`;
    }).join('')}</div>`;
  } catch (err) {
    body.innerHTML = `<div class="kb-status" style="color:var(--danger-strong);">${escapeHtml(t('knowledge.loadFailed', { error: err.message }))}</div>`;
  }
}

/**
 * 查看原文文本（只读弹窗；超长文本由 agent 截断，可下载全文）
 */
async function showDocTextDialog(c, docId) {
  const modal = createModal({
    title: t('knowledge.docViewTitle'),
    bodyHtml: `<div id="kbDocTextView">${renderLoading()}</div>`,
    confirmText: null,
    cancelText: t('common.close'),
    wide: true,
    fullscreen: true,
  });
  const body = modal.overlay.querySelector('#kbDocTextView');

  try {
    const res = await agentApi(
      'GET',
      `/api/rag/collections/${encodeURIComponent(c.id)}/documents/${encodeURIComponent(docId)}`
    );
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
    renderDocText(body, c, res.document || {});
  } catch (err) {
    body.innerHTML = `<div class="kb-status" style="color:var(--danger-strong);">${escapeHtml(t('knowledge.loadFailed', { error: err.message }))}</div>`;
  }
}

function renderDocText(body, c, doc) {
  const badge = docSourceBadge(doc.source);
  const text = doc.text || '';
  const metaParts = [
    t('knowledge.docChunkCount', { count: doc.chunkCount || 0 }),
    t('knowledge.docCharCount', { count: doc.totalChars ?? text.length }),
  ];
  if (doc.original?.size) metaParts.push(t('knowledge.docOriginalSize', { size: formatBytes(doc.original.size) }));

  const isMarkdown = isMarkdownDoc(doc, text);
  body.innerHTML = `
    <div class="kb-doc-viewhead">
      <div class="kb-doc-viewtitle">
        <span class="kb-doc-viewname" title="${escapeHtml(doc.name || '')}">${escapeHtml(doc.name || '')}</span>
        ${badge ? `<span class="kb-doc-badge ${badge.cls}">${escapeHtml(t(`knowledge.${badge.key}`))}</span>` : ''}
      </div>
      <div class="kb-doc-viewactions">
        <div class="kb-doc-viewmode">
          <button class="kb-doc-act" type="button" data-doc-mode="preview">${escapeHtml(t('knowledge.docViewPreview'))}</button>
          <button class="kb-doc-act" type="button" data-doc-mode="source">${escapeHtml(t('knowledge.docViewSource'))}</button>
        </div>
        <button class="kb-doc-act" type="button" data-doc-toc-toggle title="${escapeHtml(t('knowledge.docToc'))}">${escapeHtml(t('knowledge.docToc'))}</button>
        <button class="kb-doc-act" type="button" data-doc-copy>${escapeHtml(t('knowledge.docViewCopy'))}</button>
        <button class="kb-doc-act" type="button" data-doc-download="text">${escapeHtml(t('knowledge.docDownloadText'))}</button>
      </div>
    </div>
    <div class="kb-doc-viewmeta">${escapeHtml(metaParts.join(' · '))}${doc.originUrl ? ` · <span class="kb-doc-origin">${escapeHtml(doc.originUrl)}</span>` : ''}</div>
    ${doc.truncated ? `<div class="kb-doc-textnote">${escapeHtml(t('knowledge.docViewTruncated', { limit: doc.viewLimit || text.length, total: doc.totalChars ?? text.length }))}</div>` : ''}
    <div class="kb-doc-content"></div>`;

  const content = body.querySelector('.kb-doc-content');
  const modeBtns = body.querySelectorAll('[data-doc-mode]');
  const tocToggleBtn = body.querySelector('[data-doc-toc-toggle]');

  let tocVisible = true;          // 目录是否展开

  /** 安全的 CSS 转义（jsdom 等环境可能没有 CSS.escape） */
  const cssEscape = (s) => {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') return CSS.escape(s);
    return String(s).replace(/([^a-zA-Z0-9_\u4e00-\u9fa5-])/g, '\\$1');
  };

  /** 给标题生成稳定 id（重渲染时也能复用） */
  const slugify = (s, idx) => {
    const base = String(s || '').trim().toLowerCase()
      .replace(/[\s]+/g, '-')
      .replace(/[^\w\u4e00-\u9fa5-]/g, '')
      .slice(0, 40) || `heading-${idx}`;
    return `kb-h-${base}-${idx}`;
  };

  /** 从已渲染的 Markdown 中提取标题，生成目录数据并给标题补 id */
  const collectHeadings = (mdEl) => {
    const headings = mdEl.querySelectorAll('h1, h2, h3, h4, h5, h6');
    const items = [];
    headings.forEach((h, i) => {
      const id = h.id || slugify(h.textContent, i);
      h.id = id;
      items.push({ id, text: h.textContent.trim(), level: Number(h.tagName[1]) });
    });
    return items;
  };

  /** 渲染目录侧栏；headings 为空时不显示 */
  const renderToc = (mdEl) => {
    const items = collectHeadings(mdEl);
    if (!items.length) {
      tocToggleBtn.style.display = 'none';
      const oldToc = content.querySelector('.kb-doc-toc');
      if (oldToc) oldToc.remove();
      content.classList.remove('kb-doc-with-toc');
      return;
    }
    tocToggleBtn.style.display = '';

    let toc = content.querySelector('.kb-doc-toc');
    if (!toc) {
      toc = document.createElement('nav');
      toc.className = 'kb-doc-toc';
      content.insertBefore(toc, mdEl);
      content.classList.add('kb-doc-with-toc');
    }
    toc.innerHTML = `
      <div class="kb-doc-toc-head">
        <span class="kb-doc-toc-title">${escapeHtml(t('knowledge.docToc'))}</span>
      </div>
      <ol class="kb-doc-toc-list">
        ${items.map(it => `
          <li class="kb-doc-toc-item" data-level="${it.level}" data-id="${escapeHtml(it.id)}">
            <a href="#${escapeHtml(it.id)}" title="${escapeHtml(it.text)}">${escapeHtml(it.text)}</a>
          </li>`).join('')}
      </ol>`;

    // 点击目录项：滚动到对应标题
    toc.querySelectorAll('.kb-doc-toc-item').forEach(li => {
      li.querySelector('a').addEventListener('click', (e) => {
        e.preventDefault();
        const target = mdEl.querySelector(`#${cssEscape(li.dataset.id)}`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        setActiveToc(li.dataset.id);
      });
    });

    setupScrollSpy(mdEl, items);
    if (!tocVisible) toc.classList.add('kb-doc-toc-collapsed');
  };

  /** 滚动联动：高亮当前可视区标题对应的目录项 */
  const setupScrollSpy = (mdEl, items) => {
    if (!items.length) return;
    const setFromScroll = () => {
      const scrollTop = mdEl.scrollTop;
      const offsetTop = 8;
      let active = items[0]?.id;
      for (const it of items) {
        const el = mdEl.querySelector(`#${cssEscape(it.id)}`);
        if (el && el.offsetTop - offsetTop <= scrollTop) active = it.id;
        else break;
      }
      setActiveToc(active);
    };
    mdEl.addEventListener('scroll', setFromScroll, { passive: true });
    setFromScroll();
  };

  const setActiveToc = (id) => {
    const toc = content.querySelector('.kb-doc-toc');
    if (!toc) return;
    toc.querySelectorAll('.kb-doc-toc-item').forEach(li => {
      li.classList.toggle('active', li.dataset.id === id);
    });
    // 把激活项滚到目录可视区
    const active = toc.querySelector('.kb-doc-toc-item.active');
    if (active) active.scrollIntoView({ block: 'nearest' });
  };

  // 源码模式保留原文（可复制）；预览模式交给 marked 渲染 + DOMPurify 清洗
  const paint = (mode) => {
    if (mode === 'preview' && text) {
      content.innerHTML = renderMarkdownPreview(text);
      const mdEl = content.querySelector('.kb-doc-markdown');
      if (mdEl) renderToc(mdEl);
    } else {
      content.innerHTML = `<pre class="kb-doc-textview">${escapeHtml(text || t('knowledge.docViewEmpty'))}</pre>`;
      tocToggleBtn.style.display = 'none';
    }
    modeBtns.forEach(btn => btn.classList.toggle('active', btn.dataset.docMode === mode));
  };
  paint(isMarkdown ? 'preview' : 'source');

  modeBtns.forEach((btn) => {
    btn.addEventListener('click', () => paint(btn.dataset.docMode));
  });

  // 目录展开/收起
  tocToggleBtn?.addEventListener('click', () => {
    const toc = content.querySelector('.kb-doc-toc');
    if (!toc) return;
    tocVisible = !toc.classList.toggle('kb-doc-toc-collapsed');
  });

  body.querySelector('[data-doc-copy]')?.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(text);
      showToast(t('knowledge.docViewCopied'), 'success');
    } catch (err) {
      showToast(t('knowledge.opFailed', { error: err.message }), 'error');
    }
  });

  body.querySelector('[data-doc-download]')?.addEventListener('click', async (e) => {
    await handleDocDownload(e.currentTarget, c, doc.id, 'text');
  });
}

// ==================== Markdown 预览 ====================

const MARKDOWN_EXTS = new Set(['.md', '.markdown', '.mdown', '.mkd', '.mdx']);
const MARKDOWN_NAME_RE = /\.(?:md|markdown|mdown|mkd|mdx)(?:[?#].*)?$/i;
// 明确的二进制/结构化原件：正文只是抽取结果，不按 Markdown 渲染（抽取出来的排版不是 Markdown 语法）
const NON_MARKDOWN_EXTS = new Set([
  '.pdf', '.doc', '.docx', '.html', '.htm', '.xls', '.xlsx', '.csv',
  '.ppt', '.pptx', '.rtf', '.odt', '.odp', '.ods', '.epub', '.json',
]);

/**
 * 判断文档是否按 Markdown 渲染。判定顺序：
 *   1) 原件扩展名 / 原件名 / 文档名 / 网页 URL 命中 md 后缀 → 直接认定；
 *   2) 原件是 PDF/DOCX/HTML 等 → 一律不认（正文是解析器抽出来的，不是 Markdown）；
 *   3) 其余（大模型工具写入的文本、手输文本、.txt/.log、无扩展名）→ 按正文特征识别。
 * 注意：即使识别为 false，弹窗里仍有「预览 / 源码」切换，用户可以手动切到预览。
 */
function isMarkdownDoc(doc, text) {
  const ext = String(doc.original?.ext || '').toLowerCase();
  if (MARKDOWN_EXTS.has(ext)) return true;
  const named = [doc.original?.name, doc.name, doc.originUrl].filter(Boolean);
  if (named.some(n => MARKDOWN_NAME_RE.test(String(n).trim()))) return true;
  if (NON_MARKDOWN_EXTS.has(ext)) return false;
  return looksLikeMarkdown(text);
}

// 强特征：出现任意一种就基本可以断定是 Markdown（普通文章几乎不会用这些行首语法）
const STRONG_MARKDOWN_SIGNALS = [
  /^#{1,6}[ \t]+\S/m,           // ATX 标题
  /^```/m,                        // 围栏代码块
  /^\s*\|.+\|\s*$/m,              // 表格行
  /^\s*>\s+\S/m,                  // 引用块
  /^[-*_]{3,}\s*$/m,              // 分隔线
];
// 弱特征：普通文本里也可能偶发，需要命中两种以上才认
const WEAK_MARKDOWN_SIGNALS = [
  /^\s*(?:[-*+]|\d+\.)\s+\S/m,    // 有序 / 无序列表
  /\*\*(?!\s)[^*\n]+\*\*/,        // 加粗
  /\[[^\]\n]+\]\([^)\s]+\)/,      // 链接
  /`[^`\n]+`/,                    // 行内代码
];

/** 正文特征识别：面向没有 .md 后缀、但内容确实是 Markdown 的文档（如大模型工具写入的知识） */
function looksLikeMarkdown(text) {
  if (!text) return false;
  if (STRONG_MARKDOWN_SIGNALS.some(re => re.test(text))) return true;
  return WEAK_MARKDOWN_SIGNALS.reduce((hit, re) => hit + (re.test(text) ? 1 : 0), 0) >= 2;
}

/** Markdown → 安全 HTML（marked 缺失时降级为原文，不影响阅读与复制） */
function renderMarkdownPreview(text) {
  if (typeof marked === 'undefined') {
    return `<pre class="kb-doc-textview">${escapeHtml(text || t('knowledge.docViewEmpty'))}</pre>`;
  }
  marked.setOptions({ breaks: true, gfm: true });
  const html = DOMPurify.sanitize(marked.parse(text), {
    FORBID_TAGS: ['style', 'iframe', 'script', 'object', 'embed', 'svg', 'form'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur', 'onchange', 'oninput', 'onkeydown', 'onkeyup', 'onkeypress'],
    ADD_ATTR: ['target'],
  });
  // 弹窗里的外链不该把配置页顶走
  return `<div class="kb-doc-markdown">${html.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')}</div>`;
}

/** 下载单库可恢复 ZIP（Agent 流式生成，前端仅在浏览器下载阶段接收 Blob） */
async function downloadCollectionExport(c) {
  const url = `${state.agentBaseUrl}/api/rag/collections/${encodeURIComponent(c.id)}/export`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${state.agentToken}` },
  });
  if (!resp.ok) {
    const data = await resp.json().catch(() => null);
    throw new Error(data?.error || `HTTP ${resp.status}`);
  }

  const blob = await resp.blob();
  const fileName = parseDownloadName(
    resp.headers.get('Content-Disposition'),
    `${c.name || c.id}-backup.zip`,
  );
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

async function handleExportCollection(btn, c) {
  if (btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('knowledge.exporting');
  try {
    await downloadCollectionExport(c);
    showToast(t('knowledge.exportSuccess', { name: c.name }), 'success');
  } catch (err) {
    showToast(t('knowledge.exportFailed', { error: err.message }), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

/**
 * 下载文档附件（kind: original | text）
 * 走原生 fetch 而非 agentApi：后者固定按 JSON 解析，这里需要二进制与响应头
 */
async function downloadDocument(c, docId, kind) {
  const url = `${state.agentBaseUrl}/api/rag/collections/${encodeURIComponent(c.id)}/documents/${encodeURIComponent(docId)}/download?kind=${encodeURIComponent(kind)}`;
  const resp = await fetch(url, {
    headers: { Authorization: `Bearer ${state.agentToken}` },
  });

  if (!resp.ok) {
    let code = '';
    try {
      const data = await resp.json();
      code = data?.code || '';
    } catch {
      // 非 JSON 错误体：按通用失败处理
    }
    throw new Error(code === 'originalMissing'
      ? t('knowledge.docOriginalMissing')
      : t('knowledge.docDownloadFailed'));
  }

  const blob = await resp.blob();
  const fileName = parseDownloadName(resp.headers.get('Content-Disposition'), kind === 'text'
    ? `${docId}.txt`
    : docId);
  const objectUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = objectUrl;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // 延后释放，避免部分浏览器取消下载
  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
}

async function handleDocDownload(btn, c, docId, kind) {
  if (!kind || btn.disabled) return;
  const label = btn.textContent;
  btn.disabled = true;
  btn.textContent = t('knowledge.docDownloading');
  try {
    await downloadDocument(c, docId, kind);
  } catch (err) {
    showToast(err.message || t('knowledge.docDownloadFailed'), 'error');
  } finally {
    btn.disabled = false;
    btn.textContent = label;
  }
}

// ==================== 检索测试 ====================

function showSearchDialog(c) {
  const bodyHtml = `
    <div class="kb-search-scope">${escapeHtml(t('knowledge.searchScope', { name: c.name }))}</div>
    <div class="kb-search-bar">
      <input type="text" id="kbSearchQuery" placeholder="${escapeHtml(t('knowledge.searchQueryPlaceholder'))}">
      <button class="btn btn-primary" type="button" id="kbSearchBtn" style="width:auto; padding:8px 20px; flex:none;">${escapeHtml(t('knowledge.searchBtn'))}</button>
    </div>
    <div class="kb-search-opts">
      <label class="kb-chunk-inline">${escapeHtml(t('knowledge.searchTopKLabel'))}
        <input type="number" id="kbSearchTopK" min="1" max="20" value="${DEFAULT_TOP_K}">
      </label>
      <label class="kb-chunk-inline">${escapeHtml(t('knowledge.searchThresholdLabel'))}
        <input type="number" id="kbSearchThreshold" min="0" max="1" step="0.05" value="${DEFAULT_THRESHOLD}">
      </label>
    </div>
    <div id="kbSearchResults"></div>`;

  const modal = createModal({
    title: t('knowledge.searchTitle'),
    bodyHtml,
    confirmText: null,
    cancelText: t('common.close'),
    wide: true,
  });

  const { overlay } = modal;
  const queryInput = overlay.querySelector('#kbSearchQuery');
  const searchBtn = overlay.querySelector('#kbSearchBtn');
  const resultsEl = overlay.querySelector('#kbSearchResults');

  const runSearch = async () => {
    const query = queryInput.value.trim();
    if (!query) {
      showToast(t('knowledge.contentRequired'), 'warning');
      return;
    }

    const topK = parseInt(overlay.querySelector('#kbSearchTopK').value, 10);
    const threshold = parseFloat(overlay.querySelector('#kbSearchThreshold').value);

    searchBtn.disabled = true;
    searchBtn.textContent = t('knowledge.searching');
    resultsEl.innerHTML = `<div class="kb-status">⏳ ${escapeHtml(t('knowledge.searching'))}</div>`;

    try {
      const res = await agentApi('POST', `/api/rag/collections/${encodeURIComponent(c.id)}/search`, {
        query,
        topK: Number.isFinite(topK) && topK > 0 ? topK : DEFAULT_TOP_K,
        threshold: Number.isFinite(threshold) ? threshold : DEFAULT_THRESHOLD,
      });
      if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
      renderSearchResults(resultsEl, res);
    } catch (err) {
      resultsEl.innerHTML = `<div class="kb-status" style="color:var(--danger-strong);">${escapeHtml(t('knowledge.searchFailed', { error: err.message }))}</div>`;
    } finally {
      searchBtn.disabled = false;
      searchBtn.textContent = t('knowledge.searchBtn');
    }
  };

  searchBtn.addEventListener('click', runSearch);
  queryInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') runSearch();
  });
  queryInput.focus();
}

function renderSearchResults(container, result) {
  const results = result.results || [];

  if (results.length === 0) {
    container.innerHTML = `<div class="kb-status" style="color:var(--text-tertiary);">${escapeHtml(t('knowledge.searchNoHits'))}</div>`;
    return;
  }

  const fallbackHtml = result.fallback
    ? `<div class="kb-fallback-hint">⚠️ ${escapeHtml(t('knowledge.searchFallbackHint'))}</div>`
    : '';

  container.innerHTML = `
    ${fallbackHtml}
    <div class="kb-hit-count">${escapeHtml(t('knowledge.searchHitCount', { count: results.length }))}</div>
    <div class="kb-hit-list">${results.map(r => `
      <div class="kb-hit">
        <div class="kb-hit-head">
          <span class="kb-hit-score">${escapeHtml((r.score ?? 0).toFixed(3))}</span>
          <span class="kb-hit-doc" title="${escapeHtml(r.metadata?.documentName || '')}">${escapeHtml(r.metadata?.documentName || '')}</span>
        </div>
        <div class="kb-hit-text">${escapeHtml(r.content || '')}</div>
      </div>`).join('')}</div>`;

  // 长文本折叠 + 点击展开/收起
  container.querySelectorAll('.kb-hit-text').forEach(el => {
    if (el.textContent.length > 180) {
      el.classList.add('kb-hit-collapsed');
      el.title = t('knowledge.expandFull');
      el.addEventListener('click', () => {
        const collapsed = el.classList.toggle('kb-hit-collapsed');
        el.title = collapsed ? t('knowledge.expandFull') : t('knowledge.collapse');
      });
    }
  });
}

// ==================== 通用弹窗工厂 ====================

/**
 * 创建弹窗（返回 { overlay, close }）
 * @param {{title: string, bodyHtml: string, confirmText?: string|null, cancelText?: string, onConfirm?: Function, wide?: boolean, closeOnOverlay?: boolean, fullscreen?: boolean}} opts
 *        confirmText 为 null 时隐藏确认按钮（纯查看型弹窗）
 *        closeOnOverlay 为 false 时点击遮罩空白区不关闭（默认 true；编辑/新建知识库传 false 防误触丢失表单）
 *        fullscreen 为 true 时在标题栏右侧（关闭按钮左侧）增加视口级全屏切换按钮（仅 CSS 撑满可视区，不触发浏览器全屏 API）
 */
function createModal({ title, bodyHtml, confirmText, cancelText, onConfirm, wide, closeOnOverlay = true, fullscreen = false }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  // 进入全屏（四角向外展开）/ 退出全屏（四角向内收拢），复用同一套 SVG 风格
  const FS_ENTER_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M8 3H5a2 2 0 0 0-2 2v3M16 3h3a2 2 0 0 1 2 2v3M21 16v3a2 2 0 0 1-2 2h-3M3 16v3a2 2 0 0 0 2 2h3"/></svg>';
  const FS_EXIT_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M8 3v3a2 2 0 0 1-2 2H3M21 8h-3a2 2 0 0 1-2-2V3M3 16h3a2 2 0 0 1 2 2v3M16 21v-3a2 2 0 0 1 2-2h3"/></svg>';
  overlay.innerHTML = `
    <div class="modal-content kb-modal${wide ? ' kb-modal-wide' : ''}">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <div class="modal-header-actions">
          ${fullscreen ? `<button class="modal-fs-btn" type="button" title="${escapeHtml(t('knowledge.docFullscreen'))}">${FS_ENTER_ICON}</button>` : ''}
          <button class="modal-close-btn" type="button">✕</button>
        </div>
      </div>
      <div class="kb-modal-body">${bodyHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-cancel" type="button" data-modal-cancel>${escapeHtml(cancelText || t('common.cancel'))}</button>
        ${confirmText ? `<button class="btn btn-primary" type="button" data-modal-confirm>${escapeHtml(confirmText)}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const content = overlay.querySelector('.modal-content');
  let fsCleanup = null;

  const close = () => {
    try { fsCleanup?.(); } catch { /* ignore */ }
    overlay.remove();
  };
  overlay.querySelector('.modal-close-btn').addEventListener('click', close);
  overlay.querySelector('[data-modal-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-modal-confirm]')?.addEventListener('click', (e) => e.stopPropagation());
  if (closeOnOverlay) {
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) close();
    });
  }

  // 视口级全屏：仅切换 CSS 类，让 .modal-content 撑满 .modal-overlay（即当前窗口可视区）
  if (fullscreen) {
    const fsBtn = overlay.querySelector('.modal-fs-btn');
    const syncFsIcon = (on) => {
      fsBtn.innerHTML = on ? FS_EXIT_ICON : FS_ENTER_ICON;
      fsBtn.classList.toggle('active', on);
      fsBtn.title = on ? t('knowledge.docExitFullscreen') : t('knowledge.docFullscreen');
    };
    const toggleFs = () => {
      syncFsIcon(content.classList.toggle('kb-doc-fs'));
    };
    fsBtn.addEventListener('click', toggleFs);
    const onKey = (e) => {
      if (e.key === 'Escape' && content.classList.contains('kb-doc-fs')) {
        e.preventDefault();
        toggleFs();
      }
    };
    document.addEventListener('keydown', onKey);
    fsCleanup = () => {
      document.removeEventListener('keydown', onKey);
      content.classList.remove('kb-doc-fs');
    };
  }

  const confirmBtn = overlay.querySelector('[data-modal-confirm]');
  if (confirmBtn && typeof onConfirm === 'function') {
    let busy = false;
    confirmBtn.addEventListener('click', async () => {
      if (busy) return;
      try {
        await onConfirm({
          overlay,
          close,
          busy: () => busy,
          setBusy: (isBusy, text) => {
            busy = isBusy;
            confirmBtn.disabled = isBusy;
            if (typeof text === 'string') confirmBtn.textContent = text;
          },
        });
      } catch (err) {
        // onConfirm 内部自行处理错误提示；此处兜底避免未捕获拒绝
        logger.warn('[Knowledge] Modal confirm error:', err.message);
      }
    });
  }

  return { overlay, close };
}

// ==================== 工具函数 ====================

function formatBytes(size) {
  const n = Number(size);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 * 1024 * 1024) return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  return `${(n / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

/** 从 Content-Disposition 取文件名（优先 RFC 5987 的 filename*，保住中文名） */
function parseDownloadName(header, fallback) {
  if (!header) return fallback;
  const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
  if (star) {
    try {
      return decodeURIComponent(star[1].trim());
    } catch {
      // 编码异常时退回 ascii 回退名
    }
  }
  const plain = /filename="([^"]+)"/i.exec(header);
  return plain ? plain[1] : fallback;
}

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
