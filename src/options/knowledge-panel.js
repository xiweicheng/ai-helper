// options/knowledge-panel.js - 知识库管理面板（options.html「知识库」标签页）
// 职责：
//   - 门控引导：Agent 未连接 / RAG 总开关未启用 / 代理端能力未就绪
//   - 知识库列表（卡片）：新建 / 删除 / 导入文档 / 文档管理 / 检索测试
// 数据来源：Agent /api/rag/* 接口（agentApi）；门控状态复用 toolbox-rag.js 的 loadRagStatus()

import { agentApi, escapeHtml, showToast, showCustomConfirm } from './toolbox-shared.js';
import { loadRagStatus } from './toolbox-rag.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

// 单文件大小上限（agent 端 body 上限 200MB，base64 膨胀 33%，前端限 50MB 已足够覆盖文档场景）
const MAX_FILE_SIZE = 50 * 1024 * 1024;
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

  const createBtn = document.getElementById('createKbBtn');
  if (createBtn) {
    createBtn.addEventListener('click', () => showCreateDialog());
  }

  // 门控引导区（「前往 XX 标签页」按钮）
  const gateEl = document.getElementById('knowledgeGate');
  if (gateEl) {
    gateEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-goto-tab]');
      if (!btn) return;
      const tabBtn = document.querySelector(`.tab-nav-btn[data-tab="${btn.dataset.gotoTab}"]`);
      if (tabBtn) tabBtn.click();
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

  // 1) 代理未连接
  if (!status.connected) {
    renderGate('agentOff');
    return;
  }
  // 2) 总开关未启用
  if (ragEnabled !== true) {
    renderGate('ragOff');
    return;
  }
  // 3) 代理端能力未就绪（依赖未装 / Node 版本不足 / 状态不可达）
  if (!status.ragAvailable) {
    renderGate('ragUnavailable');
    return;
  }

  // 就绪：加载知识库列表
  gateEl.style.display = 'none';
  mainEl.style.display = '';
  await loadAndRenderList();
}

// ==================== 门控引导 ====================

function renderGate(kind) {
  const gateEl = document.getElementById('knowledgeGate');
  const mainEl = document.getElementById('knowledgeMain');
  if (!gateEl || !mainEl) return;

  mainEl.style.display = 'none';
  gateEl.style.display = '';

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
      btn: t('knowledge.goToToolboxTab'),
      tab: 'toolbox'
    },
    ragUnavailable: {
      icon: '⚠️',
      title: t('knowledge.gateRagUnavailableTitle'),
      desc: t('knowledge.gateRagUnavailableDesc'),
      btn: t('knowledge.goToToolboxTab'),
      tab: 'toolbox'
    }
  }[kind];

  gateEl.innerHTML = `
    <div class="toolbox-empty" style="text-align:left; padding:24px 20px;">
      <div style="display:flex; align-items:center; gap:10px; font-size:15px; font-weight:600; color:#555;">
        <span style="font-size:22px;">${cfg.icon}</span><span>${escapeHtml(cfg.title)}</span>
      </div>
      <div style="margin-top:8px; line-height:1.7; color:#888; font-size:13px;">${escapeHtml(cfg.desc)}</div>
      <button class="toolbox-add-btn" data-goto-tab="${cfg.tab}" style="width:auto; margin-top:14px; padding:8px 18px; border-style:solid; color:#667eea; border-color:#667eea;">${escapeHtml(cfg.btn)}</button>
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
    updateCount(0);
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
  updateCount(collections.length);

  if (collections.length === 0) {
    listEl.innerHTML = `
      <div class="toolbox-empty" style="grid-column:1/-1; padding:50px 20px;">
        <div class="toolbox-empty-icon">📚</div>
        <div class="toolbox-empty-title">${escapeHtml(t('knowledge.emptyTitle'))}</div>
        <div class="toolbox-empty-desc">${escapeHtml(t('knowledge.emptyDesc'))}</div>
      </div>`;
    return;
  }

  listEl.innerHTML = collections.map(renderCard).join('');
}

function renderCard(c) {
  const model = c.embeddingConfig?.modelName
    || (c.embeddingConfig?.mode === 'openai-compat' ? 'OpenAI API' : '');
  return `
    <div class="kb-card" data-kb-id="${escapeHtml(c.id)}">
      <div class="kb-card-title">
        <span>📚</span>
        <span class="kb-card-name" title="${escapeHtml(c.name)}">${escapeHtml(c.name)}</span>
      </div>
      ${c.description ? `<div class="kb-card-desc" title="${escapeHtml(c.description)}">${escapeHtml(c.description)}</div>` : ''}
      <div class="kb-card-meta">${escapeHtml(t('knowledge.statsSummary', { docs: c.documentCount || 0, chunks: c.chunkCount || 0 }))}</div>
      ${model ? `<div class="kb-card-model">${escapeHtml(t('knowledge.modelPrefix'))} ${escapeHtml(model)}</div>` : ''}
      <div class="kb-card-actions">
        <button class="kb-action-btn" type="button" data-action="ingest">${escapeHtml(t('knowledge.actionIngest'))}</button>
        <button class="kb-action-btn" type="button" data-action="search">${escapeHtml(t('knowledge.actionSearch'))}</button>
        <button class="kb-action-btn" type="button" data-action="docs">${escapeHtml(t('knowledge.actionDocs'))}</button>
        <button class="kb-action-btn kb-action-danger" type="button" data-action="delete">${escapeHtml(t('knowledge.actionDelete'))}</button>
      </div>
    </div>`;
}

function updateCount(count) {
  const el = document.getElementById('knowledgeCount');
  if (!el) return;
  if (count > 0) {
    el.textContent = t('toolbox.enabledCountTotal', { enabled: count, total: count });
    el.style.display = '';
  } else {
    el.style.display = 'none';
  }
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
  } else if (action === 'search') {
    showSearchDialog(collection);
  } else if (action === 'docs') {
    showDocsDialog(collection);
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

// ==================== 新建知识库 ====================

function showCreateDialog() {
  const modal = createModal({
    title: t('knowledge.createTitle'),
    bodyHtml: `
      <div class="form-group">
        <label>${escapeHtml(t('knowledge.nameLabel'))}</label>
        <input type="text" id="kbCreateName" maxlength="100" placeholder="${escapeHtml(t('knowledge.namePlaceholder'))}">
      </div>
      <div class="form-group" style="margin-bottom:0;">
        <label>${escapeHtml(t('knowledge.descLabel'))}</label>
        <input type="text" id="kbCreateDesc" maxlength="500" placeholder="${escapeHtml(t('knowledge.descPlaceholder'))}">
      </div>`,
    confirmText: t('knowledge.createConfirm'),
    onConfirm: async ({ close, setBusy }) => {
      const name = modal.overlay.querySelector('#kbCreateName').value.trim();
      const description = modal.overlay.querySelector('#kbCreateDesc').value.trim();
      if (!name) {
        showToast(t('knowledge.nameRequired'), 'warning');
        return;
      }
      setBusy(true, t('knowledge.creating'));
      try {
        const res = await agentApi('POST', '/api/rag/collections', { name, description });
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
  modal.overlay.querySelector('#kbCreateName')?.focus();
}

// ==================== 导入文档 ====================

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
        <div style="margin-top:8px; color:#666; font-size:13px;">${escapeHtml(t('knowledge.dropHint'))}</div>
        <div style="margin-top:6px; font-size:12px; color:#999;">${escapeHtml(t('knowledge.dropSupported'))}</div>
        <div id="kbSelectedFile" style="display:none; margin-top:8px; color:#38a169; font-weight:500; font-size:13px;"></div>
      </div>
      <input type="file" id="kbFileInput" style="display:none" accept="${ACCEPT_EXTS}">
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

  let selectedFile = null;

  const modal = createModal({
    title: t('knowledge.ingestTitle', { name: c.name }),
    bodyHtml,
    confirmText: t('knowledge.ingestConfirm'),
    onConfirm: async ({ close, setBusy }) => {
      const { overlay } = modal;
      const activeTab = overlay.querySelector('.import-tab.active')?.dataset.tab || 'file';

      // 按来源构造请求体
      let payload = null;
      if (activeTab === 'file') {
        if (!selectedFile) {
          showToast(t('knowledge.fileRequired'), 'warning');
          return;
        }
        const contentBase64 = await readFileBase64(selectedFile);
        payload = { type: 'file', fileName: selectedFile.name, contentBase64 };
      } else if (activeTab === 'text') {
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

      // 分块设置（数值合法性校验，非法值回退默认）
      const chunkSize = parseInt(overlay.querySelector('#kbChunkSize').value, 10);
      const overlap = parseInt(overlay.querySelector('#kbChunkOverlap').value, 10);
      payload.chunkConfig = {
        ...(Number.isFinite(chunkSize) && chunkSize >= 100 && chunkSize <= 2000 ? { chunkSize } : {}),
        ...(Number.isFinite(overlap) && overlap >= 0 && overlap <= 500 ? { overlap } : {}),
      };

      // 进行中状态（ingest 为同步接口：解析 + 向量化可能耗时较久，首次还含模型加载）
      const statusEl = overlay.querySelector('#kbIngestStatus');
      if (statusEl) statusEl.style.display = '';
      setBusy(true);

      try {
        const res = await agentApi('POST', `/api/rag/collections/${encodeURIComponent(c.id)}/ingest`, payload);
        if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
        close();
        showToast(t('knowledge.ingestSuccess', { name: res.name, chunks: res.chunkCount }), 'success');
        await loadAndRenderList();
      } catch (err) {
        if (statusEl) statusEl.style.display = 'none';
        setBusy(false);
        showToast(t('knowledge.ingestFailed', { error: err.message }), 'error');
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
  const selectedFileEl = overlay.querySelector('#kbSelectedFile');
  const pickFile = (file) => {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      showToast(t('knowledge.fileTooLarge'), 'warning');
      return;
    }
    selectedFile = file;
    dropzone.classList.add('has-file');
    selectedFileEl.style.display = '';
    selectedFileEl.textContent = t('knowledge.selectedFile', { name: file.name });
  };
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => pickFile(fileInput.files?.[0]));
  dropzone.addEventListener('dragover', (e) => e.preventDefault());
  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    pickFile(e.dataTransfer?.files?.[0]);
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

  // 文档删除（事件委托，重渲染后仍有效）
  body.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-doc-delete]');
    if (!btn) return;
    const row = btn.closest('[data-doc-id]');
    const docId = row?.dataset.docId;
    const docName = row?.querySelector('.kb-doc-name')?.textContent || docId;
    if (!docId) return;

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

async function refreshDocsList(body, c) {
  body.innerHTML = renderLoading();
  try {
    const res = await agentApi('GET', `/api/rag/collections/${encodeURIComponent(c.id)}/documents`);
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown error');
    const docs = res.documents || [];

    if (docs.length === 0) {
      body.innerHTML = `<div class="kb-status" style="color:#999;">${escapeHtml(t('knowledge.docsEmpty'))}</div>`;
      return;
    }

    body.innerHTML = `<div class="kb-doc-list">${docs.map(d => `
      <div class="kb-doc-row" data-doc-id="${escapeHtml(d.id)}">
        <div class="kb-doc-info">
          <div class="kb-doc-name" title="${escapeHtml(d.name)}">${escapeHtml(d.name)}</div>
          <div class="kb-doc-meta">${escapeHtml(t('knowledge.docChunkCount', { count: d.chunkCount }))} · ${escapeHtml(formatTime(d.createdAt))}</div>
        </div>
        <button class="kb-doc-del" type="button" data-doc-delete title="${escapeHtml(t('knowledge.actionDelete'))}">✕</button>
      </div>`).join('')}</div>`;
  } catch (err) {
    body.innerHTML = `<div class="kb-status" style="color:#c0392b;">${escapeHtml(t('knowledge.loadFailed', { error: err.message }))}</div>`;
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
      resultsEl.innerHTML = `<div class="kb-status" style="color:#c0392b;">${escapeHtml(t('knowledge.searchFailed', { error: err.message }))}</div>`;
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
    container.innerHTML = `<div class="kb-status" style="color:#999;">${escapeHtml(t('knowledge.searchNoHits'))}</div>`;
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
 * @param {{title: string, bodyHtml: string, confirmText?: string|null, cancelText?: string, onConfirm?: Function, wide?: boolean}} opts
 *        confirmText 为 null 时隐藏确认按钮（纯查看型弹窗）
 */
function createModal({ title, bodyHtml, confirmText, cancelText, onConfirm, wide }) {
  const overlay = document.createElement('div');
  overlay.className = 'modal-overlay';
  overlay.innerHTML = `
    <div class="modal-content kb-modal${wide ? ' kb-modal-wide' : ''}">
      <div class="modal-header">
        <h3>${escapeHtml(title)}</h3>
        <button class="modal-close-btn" type="button">✕</button>
      </div>
      <div class="kb-modal-body">${bodyHtml}</div>
      <div class="modal-actions">
        <button class="btn btn-cancel" type="button" data-modal-cancel>${escapeHtml(cancelText || t('common.cancel'))}</button>
        ${confirmText ? `<button class="btn btn-primary" type="button" data-modal-confirm>${escapeHtml(confirmText)}</button>` : ''}
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const close = () => overlay.remove();
  overlay.querySelector('.modal-close-btn').addEventListener('click', close);
  overlay.querySelector('[data-modal-cancel]').addEventListener('click', close);
  overlay.querySelector('[data-modal-confirm]')?.addEventListener('click', (e) => e.stopPropagation());
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

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

function formatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
