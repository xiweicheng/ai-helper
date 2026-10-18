// src/options/memory-panel.js - 选项页「记忆」面板：语义召回向量的配置、状态与重建
// 数据源：Agent /api/memory/* 端点。配置真值只在 agent 的 config.json，本页读写都经 HTTP，
// 明文 apiKey 永不回显（agent 已脱敏），所以表单的 key 框只有「填了才提交」一种语义。
// 与知识库向量卡同构但不共用代码：记忆配置是 agent 全局单份，不是每库一份，字段与生效路径都不同。

import { agentApi, escapeHtml, showToast, showCustomConfirm, getAgentConnection } from './toolbox-shared.js';
import { loadRagStatus } from './toolbox-rag.js';
import { initMemoryEntries, refreshMemoryEntries } from './memory-entries.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

let initialized = false;
let lastStatus = { connected: true, ragAvailable: true };  // mode 切换要重算门控，而连接态只有 refresh 时才知道
let gateBlocked = false;   // 门控（代理未连接等）导致的锁定
let toggleBusy = false;    // 开关写入在途的锁定
let configLoadFailed = false;  // 配置 GET 失败时的保存守卫：WYSIWYG 下空表单保存＝把代理真配置覆盖成空

const $ = (id) => document.getElementById(id);

function currentMode() {
  return document.querySelector('input[name="memoryEmbeddingMode"]:checked')?.value || 'openai-compat';
}
const isLocal = () => currentMode() === 'local';

/** 本地档没有远端端点概念：模型固定内置、地址/key/维度/前缀/探活对它无意义，隐藏且不提交 */
function applyModeVisibility() {
  const hide = isLocal() ? 'none' : '';
  ['memoryRemoteGroup', 'memoryModelGroup', 'memoryApiKeyGroup', 'memoryDimsGroup', 'memoryPrefixGroup', 'memoryTestRow']
    .forEach((id) => { const el = $(id); if (el) el.style.display = hide; });
  const notice = $('memoryLocalNotice');
  if (notice) notice.style.display = isLocal() ? '' : 'none';
}

/**
 * 组装提交体。远端档「所见即所存」：地址/模型/前缀/维度始终提交（含空值/0），
 * apiKey 是唯一例外——明文永不回显，留空只能解释为「不修改」，清除走专用按钮。
 * 为什么改掉原来的「只收非空」：清空 queryPrefix 后字段缺席 = agent 端「不传即不改」
 * ＝清空保存静默无效；清空维度=0 会改指纹、状态卡冒报陈旧——这是配置真变了，
 * 报得对，不该由提交体替用户捂掉。
 * 本地档是反面：「缺席」= 保存层沿用旧值 = 远端残留渗进本地档，
 * 所以会参与本地行为的字段必须显式清空（逐字段理由见 isLocal 分支）。
 */
function collectPayload() {
  const payload = {
    enabled: $('memoryEnabled')?.checked === true,
    mode: currentMode()
  };
  if (isLocal()) {
    // modelName 残留会劫持模型（local.js `modelName || 内置默认`，非空残留被拿去 transformers 下载）；
    // queryPrefix 残留会顶替 BGE 查询前缀（provider `resolved.queryPrefix ?? 本地默认` 只认 nullish，
    // 非空残留原样生效，漏前缀对中文召回是实质质量损失）；
    // dimensions 不参与本地向量，但会拼进 memoryModelKey 指纹——残留值随远端配置历史漂移，
    // 同一份本地配置会莫名冒报 stale（本地档重建实测 23 分钟，白跑不能接受）。
    // baseUrl/apiKey 不在此列：本地档根本不建远端后端，对它们完全惰性，省略留给切回远端用。
    payload.modelName = '';
    payload.queryPrefix = '';
    payload.dimensions = 0;
    return payload;
  }
  payload.modelName = ($('memoryModelInput')?.value || '').trim();
  payload.baseUrl = ($('memoryBaseUrlInput')?.value || '').trim();
  payload.queryPrefix = ($('memoryPrefixInput')?.value || '').trim();
  const dims = Number($('memoryDimsInput')?.value);
  payload.dimensions = Number.isFinite(dims) && dims > 0 ? Math.floor(dims) : 0;
  const apiKey = ($('memoryApiKeyInput')?.value || '').trim();
  if (apiKey) payload.apiKey = apiKey;
  return payload;
}

/** 开关文案的唯一出口：只认真值 checkbox，别处不要直接写这个 span */
function syncEnabledLabel() {
  const el = $('memoryEnabledLabel');
  if (el) el.textContent = $('memoryEnabled')?.checked === true ? t('memoryPanel.enabled') : t('memoryPanel.disabled');
}

/**
 * 开关的两把锁合并下发：门控不通过（根本发不出请求）或写入在途（防连点发两轮）都要禁用。
 * 原来 renderGate 只锁三个按钮，开关照样能点 —— 点了又落不了盘，正是用户报「控制不了」的观感来源。
 */
function applyToggleLock() {
  const box = $('memoryEnabled');
  if (box) box.disabled = gateBlocked || toggleBusy;
}

function fillForm(cfg) {
  $('memoryEnabled').checked = cfg.enabled === true;
  syncEnabledLabel();
  const radio = document.querySelector(`input[name="memoryEmbeddingMode"][value="${cfg.mode === 'local' ? 'local' : 'openai-compat'}"]`);
  if (radio) radio.checked = true;
  $('memoryBaseUrlInput').value = cfg.baseUrl || '';
  $('memoryModelInput').value = cfg.modelName || '';
  $('memoryApiKeyInput').value = '';   // 明文 key 不回显，占位文案已说明「留空表示不修改」
  $('memoryApiKeyClearBtn').style.display = cfg.hasApiKey ? '' : 'none';   // 没有已存 key 就没有可清除的东西
  $('memoryDimsInput').value = cfg.dimensions > 0 ? String(cfg.dimensions) : '';
  $('memoryPrefixInput').value = cfg.queryPrefix || '';
  applyModeVisibility();
}

function renderStatus(s) {
  const box = $('memoryStatus');
  if (!box) return;
  if (!s) {
    box.innerHTML = `<span class="memory-status-muted">${escapeHtml(t('memoryPanel.statusLoading'))}</span>`;
    return;
  }
  box.innerHTML = `
    <div class="memory-status-row">
      <span>${escapeHtml(t('memoryPanel.statusIndexed', { indexed: s.indexed, total: s.total }))}</span>
      <span class="memory-status-badge ${s.stale ? 'stale' : 'fresh'}">${escapeHtml(s.stale ? t('memoryPanel.statusStale') : t('memoryPanel.statusFresh'))}</span>
    </div>
    <div class="memory-status-keys">
      <span>${escapeHtml(t('memoryPanel.statusStored'))}: <code>${escapeHtml(s.storedModelKey || '—')}</code></span>
      <span>${escapeHtml(t('memoryPanel.statusCurrent'))}: <code>${escapeHtml(s.currentModelKey)}</code></span>
      <span>${escapeHtml(t('memoryPanel.statusTier'))}: <code>${escapeHtml(s.tier)}</code></span>
    </div>
    ${s.stale ? `<div class="memory-status-hint">${escapeHtml(t('memoryPanel.staleHint'))}</div>` : ''}`;
}

// 状态卡失败态。本面板上线后的第一个真实事故：agent 进程载的还是旧代码时，
// vector-status 返回 404，而失败当时被当成「还没读到」交给 renderStatus(null)，
// 于是页面永远停在「读取中…」——失败必须说失败，还要把能做的事告诉用户。
// 404 单独给「重启代理」提示：新端点不存在的最常见原因就是进程未重启。
function renderStatusFail(err) {
  const box = $('memoryStatus');
  if (!box) return;
  const label = err && err.httpStatus === 404
    ? t('memoryPanel.statusOldAgent')
    : t('memoryPanel.statusFail');
  const detail = (err && (err.error || err.message)) || 'unknown';
  box.innerHTML = `
    <div class="memory-status-row">
      <span class="memory-status-badge fail">${escapeHtml(label)}</span>
    </div>
    <div class="memory-status-keys"><span>${escapeHtml(t('memoryPanel.statusDetail'))}: <code>${escapeHtml(detail)}</code></span></div>`;
}

// 代理未连接时不谎称「读取中」：这个态不是一次失败的请求，而是根本没法发请求
function renderStatusOffline() {
  const box = $('memoryStatus');
  if (!box) return;
  box.innerHTML = `<span class="memory-status-muted">${escapeHtml(t('memoryPanel.statusOffline'))}</span>`;
}

// 写操作进行中锁住三个按钮：重建是长任务（本地档 41 条实测 23 分钟），
// 而 agentApi 是裸 fetch 无超时，中途再点一次会并发两个全量重建。
function setBusy(on) {
  $('memoryReindexBtn').disabled = on;
  $('memoryTestBtn').disabled = on || isLocal();
  $('memoryApiKeyClearBtn').disabled = on;   // 清除也是写操作，防连点
}

// ==================== 动作 ====================

async function onTest() {
  if (isLocal()) return;
  setBusy(true);
  const result = $('memoryTestResult');
  result.textContent = t('memoryPanel.testRunning');
  try {
    const res = await agentApi('POST', '/api/memory/test-embedding', collectPayload());
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    result.textContent = t('memoryPanel.testOk', { model: collectPayload().modelName, dims: res.dimensions });
    const dimsInput = $('memoryDimsInput');
    dimsInput.value = String(res.dimensions);   // 厂商实际维度优先于用户猜测
    showToast(t('memoryPanel.testOk', { model: collectPayload().modelName, dims: res.dimensions }), 'info');
  } catch (err) {
    result.textContent = t('memoryPanel.testFail', { error: err.message });
    showToast(t('memoryPanel.testFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
  }
}

// onSave 只负责写代理并返回结果，不再自己弹 toast：
// 底部那颗是全局「保存配置」，记忆写入成功时由它那条统一代表，避免连弹两条。
// reason 供上层决定文案：notLoaded=配置没读到（禁止把代理真配置覆盖成空）；error=接口失败。
async function onSave() {
  if (configLoadFailed) return { ok: false, reason: 'notLoaded' };
  setBusy(true);
  try {
    const res = await agentApi('POST', '/api/memory/embedding-config', collectPayload());
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    $('memoryApiKeyInput').value = '';
    await loadAll();
    return { ok: true };
  } catch (err) {
    return { ok: false, reason: 'error', error: err.message };
  } finally {
    setBusy(false);
  }
}

// 底部全局「保存配置」在记忆 Tab 上的代理保存入口（原独立的「保存到代理」按钮已并入）。
// toast 收敛（方案B）：代理已连接且写入成功 → 不弹自己那条，交给底部「保存成功」统一代表；
// 只有离线跳过 / 配置未加载 / 接口失败才补一条，让异常不被子按钮的成功提示淹没。
export async function saveMemoryFromGlobalSave() {
  const conn = await getAgentConnection();
  if (!conn || !conn.connected) {
    showToast(t('memoryPanel.saveSkippedOffline'), 'info');
    return;
  }
  const result = await onSave();
  if (result.ok) return;
  if (result.reason === 'notLoaded') {
    showToast(t('memoryPanel.configNotLoaded'), 'error');
  } else {
    showToast(t('memoryPanel.saveFail', { error: result.error }), 'error');
  }
}

async function onReindex() {
  const ok = await showCustomConfirm(t('memoryPanel.reindexConfirm'));
  if (!ok) return;
  setBusy(true);
  const out = $('memoryResult');
  out.style.display = '';
  out.textContent = t('memoryPanel.reindexRunning');
  try {
    const res = await agentApi('POST', '/api/memory/reindex', {});
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    if (res.skipped === true) {
      out.textContent = t('memoryPanel.reindexSkipped');
    } else {
      // 三个计数照实展示：批失败与超窗都不会让重建"看起来失败"，藏起来等于骗人
      let text = t('memoryPanel.reindexDone', { indexed: res.indexed, total: res.total });
      if (res.failedBatches > 0) text += t('memoryPanel.reindexBatchFail', { count: res.failedBatches });
      if (res.overWindow && res.overWindow.count > 0) {
        text += t('memoryPanel.reindexOverWindow', { count: res.overWindow.count, window: res.overWindow.window });
      }
      out.textContent = text;
      showToast(t('memoryPanel.reindexDone', { indexed: res.indexed, total: res.total }), 'info');
    }
    await loadAll();   // 重建后指纹必然对齐，状态卡要跟着收敛
  } catch (err) {
    out.textContent = t('memoryPanel.reindexFail', { error: err.message });
    showToast(t('memoryPanel.reindexFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
  }
}

/**
 * 清除已存 API Key：明文永不回显 + 留空=不修改 ⇒ 这是用户唯一的清除通道。
 * 立即落盘（只发 clearApiKey 一个字段，agent 端「不传的字段不改」），成功后本地隐藏
 * 按钮——绝不 loadAll：会把用户未保存的草稿盖掉（与总开关同一惯例）。
 */
async function onClearApiKey() {
  const ok = await showCustomConfirm(t('memoryPanel.apiKeyClearConfirm'));
  if (!ok) return;
  setBusy(true);
  try {
    const res = await agentApi('POST', '/api/memory/embedding-config', { clearApiKey: true });
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    $('memoryApiKeyClearBtn').style.display = 'none';
    showToast(t('memoryPanel.apiKeyCleared'), 'info');
  } catch (err) {
    showToast(t('memoryPanel.apiKeyClearFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
  }
}

// ==================== 加载 ====================

/** 只重拉状态卡：开关切换后档位会从 remote/local 变 none，状态必须收敛，但不能顺带回填表单 */
async function loadStatus() {
  try {
    const statusRes = await agentApi('GET', '/api/memory/vector-status');
    if (statusRes && statusRes.success === true) {
      renderStatus(statusRes);
    } else {
      renderStatusFail(statusRes);
    }
  } catch (err) {
    logger.warn('[MemoryPanel] status load failed:', err.message);
    renderStatusFail(err);
  }
}

async function loadAll() {
  // 两条请求并发（进面板不等两个往返串行），但各自独立降级：
  // 旧代理可能只缺其中一个端点，捆在同一个 try 里会让能拿到的那份也被拖成失败
  const cfgTask = (async () => {
    configLoadFailed = true;   // 先上锁：GET 成功为止，保存一律拒绝（WYSIWYG：空表单=覆盖成空）
    try {
      const cfgRes = await agentApi('GET', '/api/memory/embedding-config');
      if (cfgRes && cfgRes.success === true && cfgRes.config) {
        fillForm(cfgRes.config);
        configLoadFailed = false;
      }
    } catch (err) {
      logger.warn('[MemoryPanel] config load failed:', err.message);
      showToast(t('memoryPanel.statusFail') + ' — ' + err.message, 'error');
    }
  })();

  const statusTask = loadStatus();

  await Promise.all([cfgTask, statusTask]);
}

function renderGate(status) {
  const gate = $('memoryGate');
  const main = $('memoryMain');
  const hint = document.querySelector('.memory-scope-hint');
  const blocked = !status.connected || (currentMode() === 'local' && !status.ragAvailable);
  gateBlocked = blocked;
  applyToggleLock();
  ['memoryReindexBtn', 'memoryTestBtn'].forEach((id) => { const el = $(id); if (el) el.disabled = blocked; });

  if (!blocked) {
    // 就绪：收起门控，正常展示配置与说明行
    gate.style.display = 'none';
    gate.innerHTML = '';
    main.style.display = '';
    if (hint) hint.style.display = '';
    return;
  }

  // 未就绪：整块隐藏配置（对齐知识库，不再半透明叠放），同时隐藏说明行；
  // 门控卡片用知识库同款 .toolbox-empty（图标 + 标题 + 描述 + 跳转按钮），保证视觉统一。
  main.style.display = 'none';
  if (hint) hint.style.display = 'none';
  gate.style.display = '';
  const agentOff = !status.connected;
  const icon = agentOff ? '🔌' : '📚';
  const title = agentOff ? t('memoryPanel.gateAgentOffTitle') : t('memoryPanel.gateRagTitle');
  const desc = agentOff ? t('memoryPanel.gateAgentOffBody') : t('memoryPanel.gateRagMissing');
  const btnLabel = agentOff ? t('memoryPanel.goToAgentTab') : t('memoryPanel.goToToolboxTab');
  const gotoTab = agentOff ? 'agent' : 'toolbox';
  gate.innerHTML = `
    <div class="toolbox-empty" style="text-align:left; padding:24px 20px;">
      <div style="display:flex; align-items:center; gap:10px; font-size:15px; font-weight:600; color:var(--text-secondary);">
        <span style="font-size:22px;">${icon}</span><span>${escapeHtml(title)}</span>
      </div>
      <div style="margin-top:8px; line-height:1.7; color:var(--text-tertiary); font-size:13px;">${escapeHtml(desc)}</div>
      <button class="toolbox-add-btn" data-goto-tab="${gotoTab}" style="width:auto; margin-top:14px; padding:8px 18px; border-style:solid; color:var(--brand-500); border-color:var(--brand-500);">${escapeHtml(btnLabel)}</button>
    </div>`;
}

/**
 * 总开关切换即持久化（与仓库其它顶层开关同惯例）。
 * 只发 { enabled }：agent 端语义是「不传的字段不改」，实测这种最小体不会抹掉地址/模型/维度，
 * 也不会改动 modelKey 指纹。成功后只重拉状态卡，绝不 loadAll —— 那会把用户尚未保存的草稿盖掉。
 * 失败必须回滚勾选框：界面显示「已停用」而代理里还开着，比原来那个「刷新后自己弹回去」更坏。
 */
async function onToggleEnabled() {
  const box = $('memoryEnabled');
  const target = box.checked === true;
  toggleBusy = true;
  applyToggleLock();
  try {
    const res = await agentApi('POST', '/api/memory/embedding-config', { enabled: target });
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    showToast(target ? t('memoryPanel.toggleOnSaved') : t('memoryPanel.toggleOffSaved'), 'info');
    await loadStatus();
  } catch (err) {
    logger.warn('[MemoryPanel] toggle persist failed:', err.message);
    box.checked = !target;
    showToast(t('memoryPanel.toggleFail', { error: err.message }), 'error');
  } finally {
    toggleBusy = false;
    applyToggleLock();
    syncEnabledLabel();
  }
}

// ==================== 入口 ====================

export function initMemoryPanel() {
  if (initialized) return;
  initialized = true;

  initMemoryEntries();
  $('memoryTestBtn')?.addEventListener('click', onTest);
  $('memoryReindexBtn')?.addEventListener('click', onReindex);
  $('memoryApiKeyClearBtn')?.addEventListener('click', onClearApiKey);
  // 门控卡片的「前往…标签页」按钮：事件委托（卡片随门控重建，不能直接绑），
  // 点对应 tab 导航按钮即可，复用 index.js 的 switchTab 链路（与知识库同款）
  $('memoryGate')?.addEventListener('click', (e) => {
    const gotoBtn = e.target.closest('[data-goto-tab]');
    if (!gotoBtn) return;
    document.querySelector(`.tab-nav-btn[data-tab="${gotoBtn.dataset.gotoTab}"]`)?.click();
  });
  document.querySelectorAll('input[name="memoryEmbeddingMode"]').forEach((r) => {
    r.addEventListener('change', () => { applyModeVisibility(); renderGate(lastStatus); });
  });
  $('memoryEnabled')?.addEventListener('change', () => {
    syncEnabledLabel();      // 先跟着用户动作走，失败时 onToggleEnabled 会回滚
    onToggleEnabled();
  });
}

export async function refreshMemoryPanel() {
  const status = await loadRagStatus();
  lastStatus = status;
  renderGate(status);
  // 条目区自带连接态判断（离线时如实展示），两条路径都要带刷：
  // 它是本 Tab 的第二个数据入口，不能只刷配置不刷列表
  if (!status.connected) { renderStatusOffline(); await refreshMemoryEntries(); return; }
  await loadAll();
  await refreshMemoryEntries();
}
