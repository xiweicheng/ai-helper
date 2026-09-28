// options/toolbox-rag.js - 知识库检索（RAG）能力探测与依赖安装引导
// 职责：读取代理端 RAG 能力状态（/api/status 的 ragAvailable）→ 渲染状态区
//      依赖未安装时展示安装引导（包清单/手动命令/一键安装）→ 安装进度轮询 → 重新检测
// 依赖可用性检测由代理端（agent/src/rag/detect.js）负责，前端只消费 ragAvailable 字段

import { state, agentApi, getAgentConnection, escapeHtml, showToast } from './toolbox-shared.js';
import { t } from '../shared/i18n.js';
import logger from '../shared/logger.js';

// 安装状态轮询间隔（毫秒）
const INSTALL_POLL_INTERVAL_MS = 2000;

// 兜底包清单（与 agent/package.json 的 optionalDependencies 一致；正常情况从安装状态接口获取）
const DEFAULT_RAG_PACKAGES = ['vectra', '@huggingface/transformers', 'pdf-parse', 'mammoth', 'officeparser', 'cheerio'];

// 安装进度轮询定时器
let installPollTimer = null;

// 依赖就绪回调（知识库面板注册，安装成功 / 重新检测通过后自动刷新门控与列表）
let availabilityChangeHandler = null;

/**
 * 注册「RAG 可用性变化」回调
 */
export function setRagAvailabilityChangeHandler(fn) {
  availabilityChangeHandler = fn;
}

// ==================== 能力探测 ====================

/**
 * 探测代理端 RAG 能力（读取 /api/status 的 ragAvailable / nodeVersion）
 * @returns {Promise<{connected: boolean, ragAvailable: boolean, nodeVersion: string|null, unreachable?: boolean}>}
 */
export async function loadRagStatus() {
  await getAgentConnection();
  if (!state.agentConnected) {
    return { connected: false, ragAvailable: false, nodeVersion: null };
  }
  try {
    const res = await agentApi('GET', '/api/status');
    return {
      connected: true,
      ragAvailable: res.ragAvailable === true,
      nodeVersion: res.nodeVersion || null,
    };
  } catch (err) {
    logger.warn('[RAG] Failed to fetch agent status:', err.message);
    return { connected: true, ragAvailable: false, nodeVersion: null, unreachable: true };
  }
}

/**
 * 读取安装任务状态（依赖未安装时才调用）
 * @returns {Promise<object|null>}
 */
async function loadRagInstallStatus() {
  try {
    return await agentApi('GET', '/api/rag/install/status');
  } catch (err) {
    logger.warn('[RAG] Failed to fetch install status:', err.message);
    return null;
  }
}

/**
 * RAG 功能入口显示条件 = 总开关开启 AND 代理端支持（供后续阶段的门控使用）
 * @param {{ragAvailable?: boolean}} [agentCapabilities]
 * @returns {Promise<boolean>}
 */
export async function shouldShowRagFeatures(agentCapabilities) {
  const { ragEnabled } = await chrome.storage.local.get('ragEnabled');
  return ragEnabled === true && agentCapabilities?.ragAvailable === true;
}

/**
 * 通知 Background 重新注册 RAG 工具（依赖就绪时保证 LLM 能调用知识库工具）
 */
function notifyRagToolsChange() {
  try {
    chrome.runtime.sendMessage({ type: 'RELOAD_RAG_TOOLS' }, (resp) => {
      if (resp?.success) {
        logger.debug(`[Toolbox] Background re loaded ${resp.count}  RAG tool`);
      }
    });
  } catch (_) { /* 忽略错误，background 可能未运行 */ }
}

// ==================== 状态渲染 ====================

/**
 * 判断 Node 版本是否满足 RAG 前置要求（Node 22+）
 * 解析失败时不拦截（避免误报），由代理端检测结果兜底
 */
function isNode22Plus(nodeVersion) {
  if (!nodeVersion) return true;
  const major = parseInt(String(nodeVersion).replace(/^v/i, ''), 10);
  return !Number.isFinite(major) || major >= 22;
}

/**
 * 通用状态块（左对齐展示）
 */
function renderStatusBlock(icon, title, desc, extraHtml = '') {
  return `
    <div class="toolbox-empty" style="text-align:left; padding:20px 16px;">
      <div class="toolbox-empty-title" style="display:flex; align-items:center; gap:8px; font-size:14px;">
        <span style="font-size:20px;">${icon}</span><span>${title}</span>
      </div>
      <div class="toolbox-empty-desc" style="margin-top:6px; line-height:1.6;">${desc}</div>
      ${extraHtml}
    </div>`;
}

/**
 * 安装引导面板（依赖未安装时）
 */
function renderInstallGuide(install) {
  const packages = (install && Array.isArray(install.packages) && install.packages.length > 0)
    ? install.packages : DEFAULT_RAG_PACKAGES;
  const cmd = `npm install ${packages.join(' ')}`;

  // 上一次安装失败的详情（错误 + 日志尾部）
  const failed = install && install.done && !install.success;
  const logTail = failed && Array.isArray(install.logTail) && install.logTail.length > 0
    ? escapeHtml(install.logTail.join('\n')) : '';
  const failHtml = failed ? `
      <div style="margin-top:12px; padding:10px 12px; background:#fdf1f0; border:1px solid #f2c9c4; border-radius:6px;">
        <div style="color:#c0392b; font-weight:600; font-size:12px; margin-bottom:6px;">⚠️ ${escapeHtml(install.error || t('toolbox.ragInstallFailedToast'))}</div>
        ${logTail ? `<div style="font-size:11px; color:#888; margin-bottom:4px;">${t('toolbox.ragInstallLogLabel')}</div>
        <pre style="margin:0; max-height:130px; overflow:auto; font-size:11px; color:#666; white-space:pre-wrap; word-break:break-all;">${logTail}</pre>` : ''}
      </div>` : '';

  const pkgHtml = packages
    .map(p => `<code style="background:#f2f3f5; padding:1px 6px; border-radius:4px; margin:0 6px 4px 0; font-size:12px; display:inline-block;">${escapeHtml(p)}</code>`)
    .join('');

  const extraHtml = `
      <div style="margin-top:12px; font-size:13px;">
        <div style="color:#555; margin-bottom:6px;"><strong>${t('toolbox.ragInstallPackagesLabel')}</strong></div>
        <div style="margin-bottom:8px;">${pkgHtml}</div>
        <div style="color:#999; font-size:12px; line-height:1.6; margin-bottom:10px;">${t('toolbox.ragInstallRequirements')}</div>
        <div style="color:#555; margin-bottom:6px;"><strong>${t('toolbox.ragInstallCommandLabel')}</strong></div>
        <div style="display:flex; align-items:center; gap:8px;">
          <code id="ragInstallCmd" style="flex:1; min-width:0; background:#2d2d2d; color:#e8e8e8; padding:8px 10px; border-radius:6px; font-size:12px; overflow-x:auto; white-space:nowrap; display:block;">${escapeHtml(cmd)}</code>
          <button class="toolbox-add-btn" id="ragCopyCmdBtn" style="width:auto; flex:none; margin:0; padding:6px 12px; font-size:12px;">${t('toolbox.ragCopyCmd')}</button>
        </div>
        ${failHtml}
      </div>
      <div style="margin-top:16px; display:flex; gap:10px;">
        <button class="toolbox-add-btn" id="ragInstallBtn" style="width:auto; flex:none; margin:0; padding:8px 18px; border-style:solid; color:#667eea; border-color:#667eea;">${t('toolbox.ragInstallBtn')}</button>
        <button class="toolbox-add-btn" id="ragRedetectBtn" style="width:auto; flex:none; margin:0; padding:8px 18px;">${t('toolbox.ragRedetectBtn')}</button>
      </div>`;

  return renderStatusBlock('📦', t('toolbox.ragStatusNotInstalledTitle'), t('toolbox.ragStatusNotInstalledDesc'), extraHtml);
}

/**
 * 安装进行中面板
 */
function renderInstalling(install) {
  const phaseText = install && install.phase === 'verifying'
    ? t('toolbox.ragInstallVerifying') : t('toolbox.ragInstallRunning');
  const logTail = install && Array.isArray(install.logTail) && install.logTail.length > 0
    ? escapeHtml(install.logTail.join('\n')) : '';
  const extraHtml = logTail
    ? `<pre style="margin-top:12px; max-height:160px; overflow:auto; background:#2d2d2d; color:#c8c8c8; padding:10px; border-radius:6px; font-size:11px; white-space:pre-wrap; word-break:break-all;">${logTail}</pre>`
    : '';
  return renderStatusBlock('⏳', phaseText, t('toolbox.ragInstallTip'), extraHtml);
}

/**
 * 渲染 RAG 状态区
 * @param {{connected: boolean, ragAvailable: boolean, nodeVersion: string|null, unreachable?: boolean, install?: object|null}} status
 */
export function renderRagStatus(status) {
  const container = document.getElementById('ragSectionContent');
  if (!container) return;

  const { connected, ragAvailable, nodeVersion, unreachable, install } = status || {};

  // 1) Agent 未连接
  if (!connected) {
    container.innerHTML = renderStatusBlock('🔌', t('toolbox.ragStatusAgentOffTitle'), t('toolbox.ragStatusAgentOffDesc'));
    return;
  }

  // 2) 无法获取代理状态
  if (unreachable) {
    container.innerHTML = renderStatusBlock('⚠️', t('toolbox.ragStatusUnreachableTitle'), t('toolbox.ragStatusUnreachableDesc'));
    return;
  }

  // 3) 安装任务进行中
  if (install && install.running) {
    container.innerHTML = renderInstalling(install);
    return;
  }

  // 4) 依赖已就绪
  if (ragAvailable) {
    container.innerHTML = renderStatusBlock('✅', t('toolbox.ragStatusReadyTitle'), t('toolbox.ragStatusReadyDesc'));
    return;
  }

  // 5) Node 版本不满足（代理端前置检查会返回 ragAvailable=false）
  if (!isNode22Plus(nodeVersion)) {
    container.innerHTML = renderStatusBlock(
      '⚠️',
      t('toolbox.ragStatusNodeLowTitle'),
      t('toolbox.ragStatusNodeLowDesc', { version: escapeHtml(nodeVersion || '?') })
    );
    return;
  }

  // 6) 依赖未安装 → 安装引导
  container.innerHTML = renderInstallGuide(install);
}

// ==================== 安装与轮询 ====================

/**
 * 停止安装进度轮询
 */
function stopInstallPolling() {
  if (installPollTimer) {
    clearTimeout(installPollTimer);
    installPollTimer = null;
  }
}

/**
 * 启动安装进度轮询：每 2 秒查询一次安装状态，结束后刷新完整能力状态
 */
function startInstallPolling() {
  stopInstallPolling();
  const poll = async () => {
    const install = await loadRagInstallStatus();

    // 仍在安装：更新进度面板并继续轮询
    if (install && install.running) {
      renderRagStatus({ connected: true, ragAvailable: false, nodeVersion: null, install });
      installPollTimer = setTimeout(poll, INSTALL_POLL_INTERVAL_MS);
      return;
    }

    // 安装结束：刷新完整状态（ragAvailable 由代理端安装后重新检测的结果决定）
    stopInstallPolling();
    const status = await loadRagStatus();
    if (status.connected && !status.ragAvailable) {
      status.install = install;
    }
    renderRagStatus(status);

    if (install && install.done) {
      showToast(
        install.success ? t('toolbox.ragInstallSuccess') : t('toolbox.ragInstallFailedToast'),
        install.success ? 'success' : 'error'
      );
      if (install.success) {
        notifyRagToolsChange();
        await availabilityChangeHandler?.();
      }
    }
  };
  installPollTimer = setTimeout(poll, INSTALL_POLL_INTERVAL_MS);
}

/**
 * 触发一键安装（代理端固定白名单，无参数）
 */
export async function startRagInstall() {
  const btn = document.getElementById('ragInstallBtn');
  if (btn) {
    btn.disabled = true;
    btn.textContent = t('toolbox.ragInstallBtnBusy');
  }
  try {
    const res = await agentApi('POST', '/api/rag/install');
    if (!res || !res.started) {
      showToast(res && res.error ? res.error : t('toolbox.ragInstallFailedToast'), 'error');
      // 可能是并发安装（409）：直接进入轮询展示进度
      const install = await loadRagInstallStatus();
      if (install && install.running) {
        startInstallPolling();
        return;
      }
      if (btn) {
        btn.disabled = false;
        btn.textContent = t('toolbox.ragInstallBtn');
      }
      return;
    }
    showToast(t('toolbox.ragInstallStarted'), 'info');
    startInstallPolling();
  } catch (err) {
    showToast(`${t('toolbox.ragInstallFailedToast')}: ${err.message}`, 'error');
    if (btn) {
      btn.disabled = false;
      btn.textContent = t('toolbox.ragInstallBtn');
    }
  }
}

/**
 * 重新检测 RAG 依赖可用性（手动安装依赖后使用）
 */
export async function redetectRag() {
  const btn = document.getElementById('ragRedetectBtn');
  if (btn) btn.disabled = true;
  try {
    const res = await agentApi('POST', '/api/rag/detect');
    if (res && res.success) {
      showToast(res.available ? t('toolbox.ragRedetectReady') : t('toolbox.ragRedetectStillMissing'), res.available ? 'success' : 'info');
      if (res.available) {
        notifyRagToolsChange();
        await availabilityChangeHandler?.();
      }
    } else {
      showToast(t('toolbox.ragRedetectFailed', { error: (res && res.error) || 'unknown' }), 'error');
    }
  } catch (err) {
    showToast(t('toolbox.ragRedetectFailed', { error: err.message }), 'error');
  }
  await refreshRagSection();
}

/**
 * 复制手动安装命令到剪贴板
 */
async function copyRagCommand() {
  const cmdEl = document.getElementById('ragInstallCmd');
  const cmd = cmdEl ? cmdEl.textContent : `npm install ${DEFAULT_RAG_PACKAGES.join(' ')}`;
  try {
    await navigator.clipboard.writeText(cmd);
    showToast(t('toolbox.ragCopied'), 'success');
  } catch (err) {
    logger.warn('[RAG] Clipboard write failed:', err.message);
    showToast(t('toolbox.ragCopyFailed'), 'error');
  }
}

// ==================== 刷新与事件 ====================

/**
 * 刷新 RAG 状态区（知识库面板门控调用；容器 #ragSectionContent 位于门控 HTML 内）
 */
export async function refreshRagSection() {
  const status = await loadRagStatus();
  if (!status.connected || status.ragAvailable || status.unreachable) {
    if (status.ragAvailable) notifyRagToolsChange();
    renderRagStatus(status);
    stopInstallPolling();
    return;
  }
  // 依赖未安装：附带安装任务状态（失败详情/进行中进度）
  status.install = await loadRagInstallStatus();
  renderRagStatus(status);
  if (status.install && status.install.running) {
    startInstallPolling();
  } else {
    stopInstallPolling();
  }
}

/**
 * 初始化 RAG 状态区事件（事件委托 + 防重绑定；容器随门控重建后需重新调用）
 */
export function initRagEvents() {
  const container = document.getElementById('ragSectionContent');
  if (!container || container.dataset.ragEventsBound === '1') return;
  container.dataset.ragEventsBound = '1';
  container.addEventListener('click', async (e) => {
    const btn = e.target.closest('button');
    if (!btn) return;
    if (btn.id === 'ragInstallBtn') {
      await startRagInstall();
    } else if (btn.id === 'ragRedetectBtn') {
      await redetectRag();
    } else if (btn.id === 'ragCopyCmdBtn') {
      await copyRagCommand();
    }
  });
}
