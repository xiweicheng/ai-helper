// options/toolbox-asr.js - 语音输入（本地 STT）配置区
// 职责：读取代理端 ASR 状态 → 渲染「缺哪一环」状态块 → 一键安装 / 重新检测 / 选择模型目录 / 启停开关
// 依赖可用性与模型扫描全在代理端（agent/src/asr/*），前端只消费 /api/asr/* 字段。
// 结构、类名与 toast 行为对齐 toolbox-rag.js。

import { state, agentApi, getAgentConnection, escapeHtml, showToast, showCustomConfirm } from './toolbox-shared.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

/** 安装状态轮询间隔（毫秒） */
const INSTALL_POLL_INTERVAL_MS = 2000;

let installPollTimer = null;
let eventsBound = false;
let lastStatus = null;
// 轮询期间连续取不到状态的次数（防一次网络抖动就误报安装失败）
let installPollFailures = 0;

// ==================== 数据 ====================

/**
 * 读取 ASR 状态
 * @returns {Promise<object|null>}
 */
export async function loadAsrStatus() {
  try {
    const res = await agentApi('GET', '/api/asr/status');
    if (res && res.httpStatus && res.httpStatus >= 400) return { reachable: false, error: res.error };
    lastStatus = res || null;
    return lastStatus;
  } catch (err) {
    logger.warn('[ASR] loadAsrStatus failed:', err?.message || err);
    return null;
  }
}

/** 安装任务进度 */
async function loadInstallStatus() {
  try {
    return await agentApi('GET', '/api/asr/deps/install/status');
  } catch {
    return null;
  }
}

// ==================== 渲染 ====================

function statusPill(ok, label) {
  return `<span class="asr-pill ${ok ? 'ok' : 'bad'}">${ok ? '✓' : '✕'} ${escapeHtml(label)}</span>`;
}

/**
 * 安装进度区文本（空字符串 = 无进度可展示，容器收起）
 * 安装任务状态字段是 running / done / success（服务端不返回 status）
 * @param {object|undefined} install
 * @returns {string}
 */
function progressText(install) {
  if (!install) return '';
  if (install.running === true) return t('toolbox.asrInstallingHint');
  // 成功后不保留进度块（依赖 pill 已有 ✓），失败/中断则留下具体原因，便于排查
  if (install.done === true && install.success !== true) {
    return install.error || t('toolbox.asrInstallAborted');
  }
  return '';
}

/**
 * 安装进度区 HTML（服务端 logTail 直接随状态下发，首次渲染即可见进度）
 * @param {object|undefined} install
 * @returns {string}
 */
function progressHtml(install) {
  const text = progressText(install);
  if (!text) return '';
  const tail = Array.isArray(install.logTail) && install.logTail.length
    ? `<pre class="asr-log-tail">${escapeHtml(install.logTail.slice(-6).join('\n'))}</pre>`
    : '';
  return `<div class="asr-progress-state">${escapeHtml(text)}</div>${tail}`;
}

function renderStatusBlock(status) {
  if (!status) {
    return `<div class="toolbox-empty"><div class="toolbox-empty-icon">⚠️</div>
      <div class="toolbox-empty-title">${escapeHtml(t('toolbox.asrAgentUnreachable'))}</div></div>`;
  }

  const depsReady = status.deps?.ready === true;
  const modelsReady = status.modelsReady === true;
  const enabled = status.enabled === true;
  const available = status.available === true;
  const cap = status.capability || {};
  const models = Array.isArray(status.models) ? status.models : [];
  const invalid = Array.isArray(status.invalidModels) ? status.invalidModels : [];
  // 安装任务状态字段是 running/done/success（没有 status）：判断必须用布尔字段，
  // 否则会在 npm 正常安装时误报「已中断 / 安装失败」
  const install = status.install || {};
  const installing = install.running === true && install.done !== true;

  const versionText = status.deps?.version ? ` v${escapeHtml(status.deps.version)}` : '';
  const reasonText = available
    ? t('toolbox.asrReadyDesc')
    : status.reason === 'deps_missing'
      ? t('toolbox.asrNeedDeps')
      : status.reason === 'models_missing'
        ? t('toolbox.asrNeedModels')
        : status.reason === 'disabled'
          ? t('toolbox.asrNeedEnable')
          : t('toolbox.asrUnknownReason');

  const modelRows = models.length
    ? models.map((m) => `<div class="asr-model-row">
        <span class="asr-model-kind">${escapeHtml(String(m.kind || ''))}</span>
        <span class="asr-model-id">${escapeHtml(String(m.id || ''))}</span>
        <span class="asr-model-arch">${escapeHtml(String(m.arch || ''))}</span>
        <button class="asr-model-del" data-model-id="${escapeHtml(String(m.id || ''))}" type="button">✕</button>
      </div>`).join('')
    : `<div class="asr-model-empty">${escapeHtml(t('toolbox.asrNoModels'))}</div>`;

  const invalidRows = invalid.length
    ? `<div class="asr-invalid">${invalid.map((x) => `<div>⚠ ${escapeHtml(String(x.id || x.dir || ''))}: ${escapeHtml(String(x.reason || ''))}</div>`).join('')}</div>`
    : '';

  const langs = Array.isArray(status.languages) && status.languages.length
    ? status.languages
    : ['auto', 'zh', 'en'];
  const currentLang = status.language || 'auto';

  return `
    <div class="asr-status-card">
      <div class="asr-status-head">
        <div class="asr-status-title">${escapeHtml(available ? t('toolbox.asrReadyTitle') : t('toolbox.asrNotReadyTitle'))}</div>
        <div class="asr-pills">
          ${statusPill(depsReady, `${t('toolbox.asrDepLabel')}${versionText}`)}
          ${statusPill(modelsReady, t('toolbox.asrModelLabel'))}
          ${statusPill(enabled, t('toolbox.asrEnableLabel'))}
        </div>
      </div>
      <div class="asr-status-desc">${escapeHtml(reasonText)}</div>
      ${status.deps && status.deps.error ? `<div class="asr-status-error">${escapeHtml(String(status.deps.error))}</div>` : ''}
      <div class="asr-capability">
        <span>${escapeHtml(t('toolbox.asrCapabilityLabel'))}</span>
        <span class="asr-cap-item ${cap.online ? 'ok' : ''}">${t('toolbox.asrCapDraft')}</span>
        <span class="asr-cap-item ${cap.offline ? 'ok' : ''}">${t('toolbox.asrCapFinal')}</span>
        <span class="asr-cap-item ${cap.vad ? 'ok' : ''}">${t('toolbox.asrCapVad')}</span>
      </div>
      <div class="asr-actions">
        <button class="toolbox-add-btn asr-install-btn" id="asrInstallBtn" type="button" ${depsReady || installing ? 'disabled' : ''}>
          ${escapeHtml(depsReady ? t('toolbox.asrDepsInstalled') : installing ? t('toolbox.asrInstalling') : t('toolbox.asrInstallBtn'))}
        </button>
        <button class="toolbox-add-btn asr-detect-btn" id="asrDetectBtn" type="button">${escapeHtml(t('toolbox.asrRedetect'))}</button>
        <button class="toolbox-add-btn asr-pick-btn" id="asrPickBtn" type="button">${escapeHtml(t('toolbox.asrPickDir'))}</button>
        <button class="toolbox-add-btn asr-scan-btn" id="asrScanBtn" type="button">${escapeHtml(t('toolbox.asrRescan'))}</button>
      </div>
      <div class="asr-install-progress" id="asrInstallProgress"${progressText(install) ? '' : ' style="display:none;"'}>${progressHtml(install)}</div>
    </div>

    <div class="asr-subsection">
      <div class="asr-subsection-title">${escapeHtml(t('toolbox.asrModelList'))}</div>
      <div class="asr-model-dir">${escapeHtml(t('toolbox.asrModelsDirLabel'))}<code>${escapeHtml(status.modelsDirDisplay || '~/.ai-helper-agent/asr/models')}</code></div>
      <div class="asr-model-list">${modelRows}</div>
      ${invalidRows}
      <div class="asr-hint">${escapeHtml(t('toolbox.asrModelHint'))}</div>
    </div>

    <div class="asr-subsection">
      <div class="asr-subsection-title">${escapeHtml(t('toolbox.asrLanguage'))}</div>
      <select class="asr-lang-select" id="asrLangSelect">
        ${langs.map((l) => `<option value="${escapeHtml(l)}" ${l === currentLang ? 'selected' : ''}>${escapeHtml(l)}</option>`).join('')}
      </select>
    </div>
  `;
}

/**
 * 刷新整个 ASR 区
 */
export async function refreshAsrSection() {
  const container = document.getElementById('asrSectionContent');
  if (!container) return;

  await getAgentConnection();
  if (!state.agentConnected) {
    container.innerHTML = `<div class="toolbox-empty"><div class="toolbox-empty-icon">🔌</div>
      <div class="toolbox-empty-title">${escapeHtml(t('toolbox.asrAgentDisconnected'))}</div></div>`;
    const toggle = document.getElementById('asrEnableToggle');
    if (toggle) { toggle.checked = false; toggle.disabled = true; }
    return;
  }

  const section = document.getElementById('asrSection');
  section?.classList.remove('disabled-section');

  const status = await loadAsrStatus();
  container.innerHTML = renderStatusBlock(status);

  const toggle = document.getElementById('asrEnableToggle');
  const toggleLabel = document.getElementById('asrToggleLabel');
  if (toggle) {
    toggle.disabled = false;
    toggle.checked = status?.enabled === true;
    if (toggleLabel) toggleLabel.textContent = toggle.checked ? t('toolbox.asrEnabled') : t('toolbox.asrDisabled');
  }

  bindSectionEvents();

  // 安装仍在进行（用户重新打开配置页）→ 接上轮询，否则进度永远停在快照上
  if (status?.install?.running === true) pollInstallStatus();
}

// ==================== 事件 ====================

function bindSectionEvents() {
  document.getElementById('asrInstallBtn')?.addEventListener('click', startInstall);
  document.getElementById('asrDetectBtn')?.addEventListener('click', redetect);
  document.getElementById('asrPickBtn')?.addEventListener('click', pickModelDir);
  document.getElementById('asrScanBtn')?.addEventListener('click', rescanModels);

  document.querySelectorAll('.asr-model-del').forEach((btn) => {
    btn.addEventListener('click', () => deleteModel(btn.getAttribute('data-model-id')));
  });

  document.getElementById('asrLangSelect')?.addEventListener('change', async (e) => {
    const language = e.target.value;
    const res = await agentApi('POST', '/api/asr/config', { language });
    if (res && res.success !== false) {
      showToast(t('toolbox.asrLangSaved'));
      notifyStatusChanged();
    } else {
      showToast(res?.error || t('toolbox.asrSaveFailed'), 'error');
    }
  });

  const toggle = document.getElementById('asrEnableToggle');
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('change', async () => {
      const enabled = toggle.checked;
      const res = await agentApi('POST', '/api/asr/config', { enabled });
      if (res && res.success !== false) {
        const label = document.getElementById('asrToggleLabel');
        if (label) label.textContent = enabled ? t('toolbox.asrEnabled') : t('toolbox.asrDisabled');
        showToast(enabled ? t('toolbox.asrEnabledToast') : t('toolbox.asrDisabledToast'));
        notifyStatusChanged();
        refreshAsrSection();
      } else {
        toggle.checked = !enabled;
        showToast(res?.error || t('toolbox.asrSaveFailed'), 'error');
      }
    });
  }
}

/** 让侧边栏下次拉取状态时绕过 10s 缓存 */
function notifyStatusChanged() {
  try {
    chrome.runtime.sendMessage({ type: 'ASR_RESET_STATUS' }).catch?.(() => {});
  } catch { /* background 可能未运行 */ }
}

async function startInstall() {
  const btn = document.getElementById('asrInstallBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('toolbox.asrInstalling'); }
  try {
    const res = await agentApi('POST', '/api/asr/deps/install');
    // alreadyRunning = 幂等重入（用户重复点击）：直接接上进度轮询，不当成失败
    if (res && res.success === false && res.alreadyRunning !== true) {
      showToast(res.error || t('toolbox.asrInstallFailed'), 'error');
      if (btn) { btn.disabled = false; btn.textContent = t('toolbox.asrInstallBtn'); }
      return;
    }
    pollInstallStatus();
  } catch (err) {
    showToast(t('toolbox.asrInstallFailed'), 'error');
    if (btn) { btn.disabled = false; btn.textContent = t('toolbox.asrInstallBtn'); }
  }
}

function renderProgress(install) {
  const el = document.getElementById('asrInstallProgress');
  if (!el) return;
  const html = progressHtml(install);
  if (!html) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = html;
}

function pollInstallStatus() {
  if (installPollTimer) clearInterval(installPollTimer);
  installPollFailures = 0;
  const tick = async () => {
    const install = await loadInstallStatus();
    if (!install) {
      // 代理重启/网络抖动：继续重试，连续 3 次拿不到状态才提示（否则一次抖动就误报失败）
      if (++installPollFailures >= 3) {
        clearInterval(installPollTimer);
        installPollTimer = null;
        showToast(t('toolbox.asrAgentUnreachable'), 'error');
      }
      return;
    }
    installPollFailures = 0;
    renderProgress(install);
    // running === true 才继续等待；done 后按 success 决定提示文案
    if (install.running === true && install.done !== true) return;
    clearInterval(installPollTimer);
    installPollTimer = null;
    notifyStatusChanged();
    if (install.success === true) showToast(t('toolbox.asrInstallDone'));
    else showToast(install.error || t('toolbox.asrInstallFailed'), 'error');
    refreshAsrSection();
  };
  tick();
  installPollTimer = setInterval(tick, INSTALL_POLL_INTERVAL_MS);
}

async function redetect() {
  const btn = document.getElementById('asrDetectBtn');
  if (btn) btn.disabled = true;
  try {
    await agentApi('POST', '/api/asr/deps/detect');
    notifyStatusChanged();
    await refreshAsrSection();
    showToast(t('toolbox.asrRedetected'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function pickModelDir() {
  const btn = document.getElementById('asrPickBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await agentApi('POST', '/api/asr/models/pick');
    if (res && res.success === false) {
      if (res.code !== 'cancelled') showToast(res.error || t('toolbox.asrPickFailed'), 'error');
      return;
    }
    showToast(t('toolbox.asrPickDone'));
    notifyStatusChanged();
    await refreshAsrSection();
  } catch (err) {
    showToast(t('toolbox.asrPickFailed'), 'error');
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function rescanModels() {
  const btn = document.getElementById('asrScanBtn');
  if (btn) btn.disabled = true;
  try {
    await agentApi('POST', '/api/asr/models/scan');
    notifyStatusChanged();
    await refreshAsrSection();
    showToast(t('toolbox.asrRescanned'));
  } finally {
    if (btn) btn.disabled = false;
  }
}

async function deleteModel(id) {
  if (!id) return;
  const ok = await showCustomConfirm(t('toolbox.asrDeleteConfirm'));
  if (!ok) return;
  const res = await agentApi('DELETE', `/api/asr/models/${encodeURIComponent(id)}`);
  if (res && res.success !== false) {
    showToast(t('toolbox.asrDeleteDone'));
    notifyStatusChanged();
    await refreshAsrSection();
  } else {
    showToast(res?.error || t('toolbox.asrDeleteFailed'), 'error');
  }
}

/**
 * 初始化（幂等）：绑定一次即可，刷新交给 refreshAsrSection
 */
export function initAsrEvents() {
  if (eventsBound) return;
  eventsBound = true;
}
