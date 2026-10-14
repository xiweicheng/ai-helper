// src/options/memory-panel.js - 选项页「记忆」面板：语义召回向量的配置、状态与重建
// 数据源：Agent /api/memory/* 端点。配置真值只在 agent 的 config.json，本页读写都经 HTTP，
// 明文 apiKey 永不回显（agent 已脱敏），所以表单的 key 框只有「填了才提交」一种语义。
// 与知识库向量卡同构但不共用代码：记忆配置是 agent 全局单份，不是每库一份，字段与生效路径都不同。

import { agentApi, escapeHtml, showToast, showCustomConfirm } from './toolbox-shared.js';
import { loadRagStatus } from './toolbox-rag.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

let initialized = false;
let lastStatus = { connected: true, ragAvailable: true };  // mode 切换要重算门控，而连接态只有 refresh 时才知道
let gateBlocked = false;   // 门控（代理未连接等）导致的锁定
let toggleBusy = false;    // 开关写入在途的锁定

const $ = (id) => document.getElementById(id);

function currentMode() {
  return document.querySelector('input[name="memoryEmbeddingMode"]:checked')?.value || 'openai-compat';
}
const isLocal = () => currentMode() === 'local';

/** 本地档没有远端端点概念：地址/key/维度/探活对它无意义，隐藏且不提交 */
function applyModeVisibility() {
  const hide = isLocal() ? 'none' : '';
  ['memoryRemoteGroup', 'memoryApiKeyGroup', 'memoryDimsGroup', 'memoryPrefixGroup', 'memoryTestRow']
    .forEach((id) => { const el = $(id); if (el) el.style.display = hide; });
  const notice = $('memoryLocalNotice');
  if (notice) notice.style.display = isLocal() ? '' : 'none';
}

/**
 * 组装提交体：只收「看得见的且非空的」字段，其余**缺席**。
 * 为什么不能交空值：memoryModelKey = mode|modelName|dimensions，且 dimensions 取
 * `Number(d) > 0 ? floor : 0` —— 把已存 512 覆盖成 0 会改变指纹，界面冒报陈旧，
 * 逼用户做一次无谓重建。apiKey 留空同理（agent 端语义：不传即不改）。
 */
function collectPayload() {
  const payload = {
    enabled: $('memoryEnabled')?.checked === true,
    mode: currentMode()
  };
  const modelName = ($('memoryModelInput')?.value || '').trim();
  if (modelName) payload.modelName = modelName;

  if (!isLocal()) {
    const baseUrl = ($('memoryBaseUrlInput')?.value || '').trim();
    if (baseUrl) payload.baseUrl = baseUrl;
    const apiKey = ($('memoryApiKeyInput')?.value || '').trim();
    if (apiKey) payload.apiKey = apiKey;
    const dims = Number($('memoryDimsInput')?.value);
    if (Number.isFinite(dims) && dims > 0) payload.dimensions = Math.floor(dims);
    const queryPrefix = ($('memoryPrefixInput')?.value || '').trim();
    if (queryPrefix) payload.queryPrefix = queryPrefix;
  }
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
  $('memorySaveBtn').disabled = on;
  $('memoryTestBtn').disabled = on || isLocal();
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

async function onSave() {
  setBusy(true);
  try {
    const res = await agentApi('POST', '/api/memory/embedding-config', collectPayload());
    if (!res || res.success !== true) throw new Error(res?.error || 'unknown');
    $('memoryApiKeyInput').value = '';
    showToast(t('memoryPanel.saveSuccess'), 'info');
    await loadAll();
  } catch (err) {
    showToast(t('memoryPanel.saveFail', { error: err.message }), 'error');
  } finally {
    setBusy(false);
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
    try {
      const cfgRes = await agentApi('GET', '/api/memory/embedding-config');
      if (cfgRes && cfgRes.success === true && cfgRes.config) {
        fillForm(cfgRes.config);
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
  const blocked = !status.connected || (currentMode() === 'local' && !status.ragAvailable);
  gateBlocked = blocked;
  applyToggleLock();
  gate.style.display = blocked ? '' : 'none';
  main.style.opacity = blocked ? '0.5' : '';
  ['memorySaveBtn', 'memoryReindexBtn', 'memoryTestBtn'].forEach((id) => { const el = $(id); if (el) el.disabled = blocked; });
  if (blocked) {
    const title = !status.connected ? t('memoryPanel.gateAgentOffTitle') : t('memoryPanel.gateRagTitle');
    const body = !status.connected
      ? t('memoryPanel.gateAgentOffBody')
      : t('memoryPanel.gateRagMissing');
    // 门控样式用本面板自己的类（knowledge 的 gate 是一套带安装引导的渲染器，不适合直接搬用）
    gate.innerHTML = `<div class="memory-gate"><span class="memory-gate-title">${escapeHtml(title)}</span><span class="memory-gate-body">${escapeHtml(body)}</span></div>`;
  }
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

  $('memoryTestBtn')?.addEventListener('click', onTest);
  $('memorySaveBtn')?.addEventListener('click', onSave);
  $('memoryReindexBtn')?.addEventListener('click', onReindex);
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
  if (!status.connected) { renderStatusOffline(); return; }
  await loadAll();
}
