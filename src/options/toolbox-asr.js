// options/toolbox-asr.js - 语音输入（本地 STT）配置区
// 职责：读取代理端 ASR 状态 → 渲染「缺哪一环」状态块 → 一键安装 / 重新检测 / 选择模型目录 / 启停开关
// 依赖可用性与模型扫描全在代理端（agent/src/asr/*），前端只消费 /api/asr/* 字段。
// 结构、类名与 toast 行为对齐 toolbox-rag.js。

import { state, agentApi, getAgentConnection, escapeHtml, showToast, showCustomConfirm } from './toolbox-shared.js';
import { t, subscribe } from '../shared/i18n.js';
import { queryMicState, requestMicAccess, watchMicState } from '../shared/mic-permission.js';
import { loadVoiceShortcutConfig, saveVoiceShortcutConfig } from '../shared/voice-shortcut.js';
import {
  loadSelectedDeviceId,
  saveSelectedDeviceId,
  probeAudioInputDevices,
  warmupAudioInputDevices,
  hasAudioInputDevice,
  watchAudioInputDevices,
} from '../shared/audio-input-device.js';
import logger from '../shared/logger.js';

/** 安装状态轮询间隔（毫秒） */
const INSTALL_POLL_INTERVAL_MS = 2000;

/** 模型下载进度轮询间隔（毫秒） */
const DOWNLOAD_POLL_INTERVAL_MS = 1500;

/** devicechange 防抖：Windows 上音频服务抖动会连发，每次枚举要 2.5s，不防抖会一直排不上 */
const DEVICE_REFRESH_DEBOUNCE_MS = 400;

let installPollTimer = null;
let eventsBound = false;
let shortcutBound = false;
let deviceBound = false;
let lastStatus = null;
// 轮询期间连续取不到状态的次数（防一次网络抖动就误报安装失败）
let installPollFailures = 0;
// 模型下载轮询句柄
let downloadPollTimer = null;
// devicechange 防抖句柄（详见 initDeviceSection）
let deviceWatchTimer = null;

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

/**
 * 字节数可读化（下载体积展示）
 * @param {number} bytes
 * @returns {string}
 */
function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  let value = bytes;
  let i = 0;
  while (value >= 1024 && i < units.length - 1) {
    value /= 1024;
    i++;
  }
  return `${value >= 100 ? Math.round(value) : value.toFixed(1)} ${units[i]}`;
}

// 识别语言的展示文案（编码到人话；协议侧仍用 auto/zh/en/…）
const LANG_I18N_KEYS = {
  auto: 'toolbox.asrLangAuto',
  zh: 'toolbox.asrLangZh',
  en: 'toolbox.asrLangEn',
  ja: 'toolbox.asrLangJa',
  ko: 'toolbox.asrLangKo',
  yue: 'toolbox.asrLangYue',
};

/**
 * 语言编码 → 可读文案
 * @param {string} code
 * @returns {string}
 */
function langLabel(code) {
  const key = LANG_I18N_KEYS[code];
  return key ? t(key) : String(code || '');
}

// 识别节奏档位 → 文案键（协议侧仍是 instant/balanced/precise）
const PACING_CODES = ['instant', 'balanced', 'precise'];
const PACING_I18N_KEYS = {
  instant: 'toolbox.asrPacingInstant',
  balanced: 'toolbox.asrPacingBalanced',
  precise: 'toolbox.asrPacingPrecise',
};

/**
 * 节奏档位编码 → 可读文案
 * @param {string} code
 * @returns {string}
 */
function pacingLabel(code) {
  const key = PACING_I18N_KEYS[code];
  return key ? t(key) : String(code || '');
}

/**
 * 模型下载进度区文本（空字符串 = 无内容可展示）
 * @param {object|undefined} download
 * @returns {string}
 */
function downloadProgressText(download) {
  if (!download) return '';
  if (download.running === true) {
    const done = Number(download.bytesDone) || 0;
    const total = Number(download.bytesTotal) || 0;
    const pct = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
    const current = Array.isArray(download.targets)
      ? download.targets.find((x) => x.phase === 'downloading')
      : null;
    return t('toolbox.asrDownloadProgress', {
      percent: pct,
      done: formatBytes(done),
      total: formatBytes(total),
      model: current ? current.id : '',
    });
  }
  // 成功后不保留进度块（模型 pill 已有 ✓），失败则写明具体原因
  if (download.done === true && download.success !== true) {
    return download.error || t('toolbox.asrDownloadFailed');
  }
  return '';
}

/**
 * 模型下载进度区 HTML（含进度条）
 * @param {object|undefined} download
 * @returns {string}
 */
function downloadProgressHtml(download) {
  const text = downloadProgressText(download);
  if (!text) return '';
  const total = Number(download?.bytesTotal) || 0;
  const done = Number(download?.bytesDone) || 0;
  const pct = total > 0 ? Math.min(100, Math.floor((done / total) * 100)) : 0;
  const bar = download?.running === true
    ? `<div class="asr-progress-bar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>`
    : '';
  return `<div class="asr-progress-state">${escapeHtml(text)}</div>${bar}`;
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
    // 代理端返回的是 { dir, name, error }（model-pack.scanModels），不是 { id, reason }：
    // 读错字段的后果是冒号后永远空白、并且回落到 dir —— 把本机绝对路径（含用户名）暴露给用户
    ? `<div class="asr-invalid">${invalid.map((x) => `<div>⚠ ${escapeHtml(String(x.name || x.id || x.dir || ''))}: ${escapeHtml(String(x.error || x.reason || ''))}</div>`).join('')}</div>`
    : '';

  // ---- 推荐模型下载：缺什么就下什么；全已安装则按钮置灰 ----
  const catalog = Array.isArray(status.catalog) ? status.catalog : [];
  const missingModels = catalog.filter((c) => c.installed !== true);
  const missingBytes = missingModels.reduce((sum, c) => sum + (Number(c.totalBytes) || 0), 0);
  const download = status.download || {};
  const downloading = download.running === true && download.done !== true;
  // 旧代理没有 catalog 字段 → 不渲染下载按钮（避免点了 404 的误导入口）
  let downloadBtn = '';
  if (catalog.length > 0 && downloading) {
    downloadBtn = `<button class="toolbox-add-btn" id="asrDownloadCancelBtn" type="button">${escapeHtml(t('toolbox.asrDownloadCancel'))}</button>`;
  } else if (catalog.length > 0 && missingModels.length === 0) {
    downloadBtn = `<button class="toolbox-add-btn" id="asrDownloadBtn" type="button" disabled>${escapeHtml(t('toolbox.asrDownloadInstalled'))}</button>`;
  } else if (catalog.length > 0) {
    downloadBtn = `<button class="toolbox-add-btn" id="asrDownloadBtn" type="button">${escapeHtml(t('toolbox.asrDownloadBtn', { size: formatBytes(missingBytes) }))}</button>`;
  }

  const langs = Array.isArray(status.languages) && status.languages.length
    ? status.languages
    : ['auto', 'zh', 'en'];
  const currentLang = status.language || 'auto';
  // 选项结构与「界面语言」下拉保持一致：纯文本 .model-option（不带额外包裹层），
  // 样式全部来自 .model-dropdown / .model-option 基类
  const langOptions = langs.map((code) => `<div class="model-option${code === currentLang ? ' selected' : ''}" role="option" aria-selected="${code === currentLang ? 'true' : 'false'}" data-lang="${escapeHtml(code)}">${escapeHtml(langLabel(code))}</div>`).join('');

  // 识别节奏三档（旧代理不返回 asrPacing → 按默认 balanced 渲染，不报错）
  const currentPacing = PACING_CODES.includes(status.asrPacing) ? status.asrPacing : 'balanced';
  const pacingOptions = PACING_CODES.map((code) => `<div class="model-option${code === currentPacing ? ' selected' : ''}" role="option" aria-selected="${code === currentPacing ? 'true' : 'false'}" data-pacing="${code}">${escapeHtml(pacingLabel(code))}</div>`).join('');

  // 能力行只有两个 chip：流式草稿 + 高精度定稿。
  // 曾有第三个「智能断句」(cap.vad)，已删：那是永远不会亮起的死标签 —— 磁盘上没有 vad 类型
  // 模型包时 capability.vad 恒为 false，而即便有也不可用（engine.js getVad 因 sherpa-onnx-node
  // 的 vad.front() 必 SIGSEGV 而默认短路返回 null），逐句断句实际由纯 JS RMS 切句完成
  //（见 agent/src/asr/sentence-splitter.js）。代理端仍如实上报 capability.vad —— 那是状态契约，
  // 不是给用户看的能力承诺。这段只能写成 JS 注释：写进模板会随 HTML 一起发到浏览器。
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
      </div>
      <div class="asr-actions">
        <button class="toolbox-add-btn asr-install-btn" id="asrInstallBtn" type="button" ${depsReady || installing ? 'disabled' : ''}>
          ${escapeHtml(depsReady ? t('toolbox.asrDepsInstalled') : installing ? t('toolbox.asrInstalling') : t('toolbox.asrInstallBtn'))}
        </button>
        <button class="toolbox-add-btn asr-detect-btn" id="asrDetectBtn" type="button">${escapeHtml(t('toolbox.asrRedetect'))}</button>
      </div>
      <div class="asr-install-progress" id="asrInstallProgress"${progressText(install) ? '' : ' style="display:none;"'}>${progressHtml(install)}</div>
    </div>

    <div class="asr-subsection">
      <div class="asr-subsection-title">${escapeHtml(t('toolbox.asrModelList'))}</div>
      <div class="asr-model-dir">${escapeHtml(t('toolbox.asrModelsDirLabel'))}<code>${escapeHtml(status.modelsDirDisplay || '~/.ai-helper-agent/asr/models')}</code></div>
      <div class="asr-model-list">${modelRows}</div>
      ${invalidRows}
      <div class="asr-actions asr-model-actions">
        ${downloadBtn}
        <button class="toolbox-add-btn" id="asrPickBtn" type="button">${escapeHtml(t('toolbox.asrPickDir'))}</button>
        <button class="toolbox-add-btn" id="asrScanBtn" type="button">${escapeHtml(t('toolbox.asrRescan'))}</button>
      </div>
      <div class="asr-install-progress" id="asrDownloadProgress"${downloadProgressText(download) ? '' : ' style="display:none;"'}>${downloadProgressHtml(download)}</div>
      <div class="asr-hint">${escapeHtml(t('toolbox.asrModelHint', { dir: status.modelsDirDisplay || '~/.ai-helper-agent/asr/models' }))}</div>
    </div>

    <div class="asr-subsection">
      <div class="asr-subsection-title">${escapeHtml(t('toolbox.asrLanguage'))}</div>
      <!-- 触发器直接复用「界面语言」那颗下拉的写法：.model-selector + readonly input
           （样式、右侧箭头、focus ring 全部来自基类，不再单独定一套按钮样式） -->
      <div class="model-selector asr-lang-field" id="asrLangField">
        <input type="text" id="asrLangInput" readonly value="${escapeHtml(langLabel(currentLang))}" aria-haspopup="listbox" aria-expanded="false">
        <div class="model-dropdown asr-lang-menu" id="asrLangDropdown" role="listbox">${langOptions}</div>
      </div>
      <div class="asr-hint">${escapeHtml(t('toolbox.asrLangHint'))}</div>
    </div>

    <div class="asr-subsection">
      <div class="asr-subsection-title">${escapeHtml(t('toolbox.asrPacing'))}</div>
      <!-- 与「识别语言」同一套 .model-selector + readonly input：样式/箭头/focus ring 全走基类 -->
      <div class="model-selector asr-lang-field" id="asrPacingField">
        <input type="text" id="asrPacingInput" readonly value="${escapeHtml(pacingLabel(currentPacing))}" aria-haspopup="listbox" aria-expanded="false">
        <div class="model-dropdown asr-lang-menu" id="asrPacingDropdown" role="listbox">${pacingOptions}</div>
      </div>
      <div class="asr-hint">${escapeHtml(t('toolbox.asrPacingHint'))}</div>
    </div>
  `;
}

/**
 * 刷新整个 ASR 区
 */
export async function refreshAsrSection() {
  const container = document.getElementById('asrSectionContent');
  if (!container) return;
  const section = document.getElementById('asrSection');
  // 设备列表独立于代理端：放在最前面，代理离线/未装模型时也要能列
  void refreshDeviceList();

  await getAgentConnection();
  if (!state.agentConnected) {
    container.innerHTML = `<div class="toolbox-empty"><div class="toolbox-empty-icon">🔌</div>
      <div class="toolbox-empty-title">${escapeHtml(t('toolbox.asrAgentDisconnected'))}</div></div>`;
    const toggle = document.getElementById('asrEnableToggle');
    if (toggle) { toggle.checked = false; toggle.disabled = true; }
    // 代理未连接：这里不能收起。语音已独立成 Tab，「扩展」里那条 Agent 状态提示不再跟过来，
    // 收起后就只剩一个「已停用」开关，用户看不出原因（空态是唯一的提示，且只有一行）
    section?.classList.remove('disabled-section');
    return;
  }

  const status = await loadAsrStatus();
  container.innerHTML = renderStatusBlock(status);

  const toggle = document.getElementById('asrEnableToggle');
  const toggleLabel = document.getElementById('asrToggleLabel');
  const enabled = status?.enabled === true;
  if (toggle) {
    toggle.disabled = false;
    toggle.checked = enabled;
    if (toggleLabel) toggleLabel.textContent = enabled ? t('toolbox.asrEnabled') : t('toolbox.asrDisabled');
  }
  // 总开关关闭 → 收起下方所有配置项（与 MCP / 技能区块同一套 disabled-section 语义）：
  // 关着时这些项一个都用不上，铺开只会把下面的「技能管理」顶到屏幕外
  section?.classList.toggle('disabled-section', !enabled);

  bindSectionEvents();

  // 安装仍在进行（用户重新打开配置页）→ 接上轮询，否则进度永远停在快照上
  if (status?.install?.running === true) pollInstallStatus();
  // 下载同理
  if (status?.download?.running === true) pollDownloadStatus();
}

// ==================== 麦克风授权 ====================
//
// 侧边栏（side panel）里调 getUserMedia 不会弹授权框，只会直接抛 NotAllowedError；
// 只有标签页形态的扩展页面能弹。所以把授权动作放在这里：一次授权按扩展 origin 记忆，
// 侧边栏随后直接可用（侧边栏失败时会用「去授权」把人送到本区块）。

/** 权限状态 → 状态 pill 文案 / 色调 */
const MIC_STATE_UI = {
  granted: { text: 'toolbox.asrMicStateGranted', tone: 'ok' },
  prompt: { text: 'toolbox.asrMicStatePrompt', tone: 'warn' },
  denied: { text: 'toolbox.asrMicStateDenied', tone: 'bad' },
  unknown: { text: 'toolbox.asrMicStateUnknown', tone: 'warn' },
};

/** 权限状态 → 引导文案 */
const MIC_HINT_KEY = {
  granted: 'toolbox.asrMicHintGranted',
  prompt: 'toolbox.asrMicHintPrompt',
  denied: 'toolbox.asrMicHintDenied',
  unknown: 'toolbox.asrMicHintUnknown',
};

let micWatching = false;

/**
 * 刷新「麦克风权限」小节的展示
 * @returns {Promise<string>} 归一化后的权限状态
 */
export async function refreshMicState() {
  const pill = document.getElementById('asrMicPill');
  if (!pill) return 'unknown';
  const state = await queryMicState();
  const ui = MIC_STATE_UI[state] || MIC_STATE_UI.unknown;
  pill.className = `asr-pill ${ui.tone}`;
  pill.textContent = t(ui.text);

  const hint = document.getElementById('asrMicHint');
  if (hint) hint.textContent = t(MIC_HINT_KEY[state] || MIC_HINT_KEY.unknown);

  const grantBtn = document.getElementById('asrMicGrantBtn');
  if (grantBtn) {
    // 已被拒绝时再点也不会弹框（Chrome 直接拦），换成「复制扩展详情链接」引导
    grantBtn.hidden = state === 'denied';
    grantBtn.disabled = state === 'granted';
    grantBtn.textContent = state === 'granted' ? t('toolbox.asrMicGrantedBtn') : t('toolbox.asrMicGrantBtn');
  }
  const copyBtn = document.getElementById('asrMicCopyBtn');
  if (copyBtn) copyBtn.hidden = state !== 'denied';
  return state;
}

/** 申请授权（必须由用户手势触发） */
async function grantMicAccess() {
  const btn = document.getElementById('asrMicGrantBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('toolbox.asrMicGranting'); }
  let res;
  try {
    res = await requestMicAccess();
  } finally {
    // 不管结果如何都回到真实状态（按钮文案与可用性由 refreshMicState 统一重置）
    await refreshMicState();
    // 授权后设备名（label）才拿得到：立刻重枚举一次，用户就不用再手动刷新
    refreshDeviceList();
  }
  if (res?.ok) showToast(t('toolbox.asrMicGrantedToast'));
  else if (res?.state === 'denied') showToast(t('toolbox.asrMicDeniedToast'), 'error');
  else if (res?.error === 'unsupported') showToast(t('toolbox.asrMicUnsupportedToast'), 'error');
  else showToast(t('toolbox.asrMicNotGrantedToast'), 'error');
}

/** 被拒绝后：复制扩展详情链接（chrome:// 地址无法用 <a> 打开，只能让用户粘贴） */
async function copyExtensionDetailsLink() {
  const id = globalThis.chrome?.runtime?.id || '';
  if (!id) { showToast(t('toolbox.asrMicCopyFailed'), 'error'); return; }
  try {
    await navigator.clipboard.writeText(`chrome://extensions/?id=${id}`);
    showToast(t('toolbox.asrMicCopied'));
  } catch {
    showToast(t('toolbox.asrMicCopyFailed'), 'error');
  }
}

/**
 * 启用语音输入时顺手要一次权限：点开关本身就是用户手势，
 * 且配置页是标签页（唯一能弹授权框的地方）。错过这里就只剩「侧边栏报错 → 跳过来补授权」。
 */
async function ensureMicOnEnable() {
  if (await queryMicState() === 'granted') return;
  const res = await requestMicAccess();
  if (res?.ok) showToast(t('toolbox.asrMicGrantedToast'));
  await refreshMicState();
}

/** 首次进入时挂上：按钮只绑一次，权限变化自动同步 */
function initMicSection() {
  document.getElementById('asrMicGrantBtn')?.addEventListener('click', grantMicAccess);
  document.getElementById('asrMicCopyBtn')?.addEventListener('click', copyExtensionDetailsLink);
  refreshMicState();
  if (micWatching) return;
  micWatching = true;
  // 用户可能在 chrome://extensions 里改了权限：回到本页自动同步状态
  watchMicState(() => { refreshMicState(); });
}

/**
 * 快捷触发（右侧 Alt / 右侧 Ctrl）
 * 纯扩展侧偏好：存 chrome.storage.local，侧边栏与 content script 都直接读，
 * 所以这里不走 agentApi（代理离线也能配），也不跟随语音总开关收起。
 * 每次进 Tab 都以存储为准回填 —— 存储是唯一真源，不在这里缓存一份。
 */
function initShortcutSection() {
  const rightAlt = document.getElementById('asrShortcutRightAlt');
  const rightCtrl = document.getElementById('asrShortcutRightCtrl');
  if (!rightAlt && !rightCtrl) return;

  loadVoiceShortcutConfig().then((cfg) => {
    if (rightAlt) rightAlt.checked = cfg.rightAlt;
    if (rightCtrl) rightCtrl.checked = cfg.rightCtrl;
  }).catch(() => { /* 读不到就保持未勾选（= 单键不开） */ });

  if (shortcutBound) return;
  shortcutBound = true;

  const bind = (key, box) => {
    box?.addEventListener('change', async () => {
      const next = await saveVoiceShortcutConfig({ [key]: box.checked });
      // 以落盘结果回写：存储失败时勾选状态不能骗人
      if (rightAlt) rightAlt.checked = next.rightAlt;
      if (rightCtrl) rightCtrl.checked = next.rightCtrl;
      showToast(t('toolbox.asrShortcutSaved'));
    });
  };
  bind('rightAlt', rightAlt);
  bind('rightCtrl', rightCtrl);
}

// ==================== 输入设备（麦克风） ====================
//
// 与「快捷触发」同一定位：纯扩展侧偏好（chrome.storage.local），不走代理端，
// 也不跟随语音总开关收起。语义与 shared/audio-input-device.js 一致：空串 = 跟随系统默认。
//
// 注意 enumerateDevices 在未授权时 label 是空串（只能靠 deviceId 分辨），
// 所以这里要在授权之后（或进 Tab 时）重新枚举一次才能看到设备名。

/** 设备名兜底：未授权时 enumerateDevices 的 label 是空串（只能靠 deviceId 分辨） */
function deviceOptionName(device, index) {
  return device.label || t('toolbox.asrDeviceUnnamed', { index: index + 1 });
}

// 状态行的文案由 JS 管理（HTML 上没挂 data-i18n）：applyI18n 只认静态标签，
// 若让它也管这一行，任何一次 applyI18n 都会把状态冲回初始文案 ——
// 外观上就是「已经列完了还写着正在读取」。语言切走切回时由 subscribe 重渲。
let deviceNoteState = { key: '', warn: false };
// 是否已经拿到过一次确定结果：刷新时不再把状态行冲回「正在读取」（反复闪 loading 在
// Windows 上观感就是「永远没读完」）。用户手动点「刷新列表」时会重置，保留点击反馈。
let deviceNoteSettled = false;
// 并发保护：初始化 / 授权 / 插拔 / 语言切换都可能同时触发重列，旧结果不能覆盖新结果
let deviceRefreshToken = 0;

function renderDeviceNote() {
  const note = document.getElementById('asrDeviceNote');
  if (!note) return;
  note.textContent = deviceNoteState.key ? t(deviceNoteState.key) : '';
  note.hidden = !deviceNoteState.key;
  note.classList.toggle('warn', deviceNoteState.warn);
}

function setDeviceNote(key, warn = false) {
  deviceNoteState = { key: key || '', warn: Boolean(key) && warn };
  renderDeviceNote();
}

/** 只在「列不出来 / 名字看不到」时露出授权入口（已拒绝就别再弹，点了也不会有框） */
function setDeviceGrantVisible(visible) {
  const btn = document.getElementById('asrDeviceGrantBtn');
  if (btn) btn.hidden = !visible;
}

/**
 * 枚举设备，超时时先「唤醒」音频子系统再试一次。
 *
 * Windows 上真实存在这种形态：麦克风已授权，但音频服务刚启动 / 隐私设置半开，
 * enumerateDevices() 永不 resolve。先成功开一次流（拿完立刻停）之后，枚举通常立刻返回。
 * 未授权时不试：预热会弹授权框，不能在后台偷偷弹。
 */
async function probeDevicesWithWarmup() {
  const first = await probeAudioInputDevices();
  if (!first.timedOut) return first;
  if (await queryMicState() !== 'granted') return first;
  const warmed = await warmupAudioInputDevices();
  if (!warmed) return first;
  return probeAudioInputDevices();
}

/**
 * 刷新下拉列表：列表来自 enumerateDevices，选中值以存储为准（存储是唯一真源）
 * 与「识别语言」同一套下拉（.model-selector + readonly input + .model-dropdown）
 *
 * 无论成功、空列表、没授权、超时还是抛错，都必须落到一个确定的状态文案，
 * 不能停在 loading —— 否则用户只能看到一个永远转不完的「正在读取设备列表」
 *
 * @param {{ showLoading?: boolean }} [opts]
 */
async function refreshDeviceList(opts = {}) {
  const input = document.getElementById('asrDeviceInput');
  const menu = document.getElementById('asrDeviceDropdown');
  if (!input || !menu) return;
  const token = ++deviceRefreshToken;
  if (opts.showLoading) deviceNoteSettled = false;
  if (!deviceNoteSettled) setDeviceNote('toolbox.asrDeviceNoteLoading');

  try {
    const { devices: list, timedOut, unsupported } = await probeDevicesWithWarmup();
    const selected = await loadSelectedDeviceId();
    if (token !== deviceRefreshToken) return;

    // 设备不在了（拔掉 / 禁用）时先回落到「跟随系统默认」，但**不清存储**：
    // 蓝牙耳机断开再连上时同一个 deviceId 会回来，直接抹掉反而让用户要重选一次
    const present = hasAudioInputDevice(list, selected);
    const effective = present ? selected : '';

    const items = [{ id: '', label: t('toolbox.asrDeviceFollowSystem') }]
      .concat(list.map((device, index) => ({ id: device.deviceId, label: deviceOptionName(device, index) })));
    menu.innerHTML = items.map((item) => {
      const current = item.id === effective;
      return `<div class="model-option${current ? ' selected' : ''}" role="option" aria-selected="${current ? 'true' : 'false'}" data-device-id="${escapeHtml(item.id)}">${escapeHtml(item.label)}</div>`;
    }).join('');
    const current = items.find((item) => item.id === effective) || items[0];
    input.value = current.label;

    // 没授权时 Chrome 可能只给很少甚至空的列表 → 「先授权再看」是唯一有效的引导
    const unlabeled = list.length > 0 && list.every((device) => !device.label);
    const needGrant = !timedOut && !unsupported && (list.length === 0 || unlabeled);
    const micState = needGrant ? await queryMicState() : 'unknown';
    if (token !== deviceRefreshToken) return;

    if (timedOut) {
      setDeviceNote('toolbox.asrDeviceTimeout', true);
      setDeviceGrantVisible(true);
    } else if (unsupported) {
      setDeviceNote('toolbox.asrDeviceUnsupported', true);
      setDeviceGrantVisible(false);
    } else if (needGrant) {
      setDeviceNote(micState === 'denied'
        ? 'toolbox.asrDeviceDenied'
        : (unlabeled ? 'toolbox.asrDeviceNeedPermission' : 'toolbox.asrDeviceEmpty'), true);
      setDeviceGrantVisible(micState !== 'denied');
    } else if (selected && !present) {
      setDeviceNote('toolbox.asrDeviceMissing', true);
      setDeviceGrantVisible(false);
    } else {
      setDeviceNote('');
      setDeviceGrantVisible(false);
    }
    deviceNoteSettled = true;
  } catch (err) {
    if (token !== deviceRefreshToken) return;
    // 任何没预料到的异常也必须落成一个可读状态：只留一个「正在读取」等于骗人。
    // 常踩的雷是 storage 回调 / escapeHtml 在奇怪输入上抛错，别让整块静默。
    logger.warn?.('[asr] 读取输入设备失败', err);
    setDeviceNote('toolbox.asrDeviceReadFailed', true);
    setDeviceGrantVisible(true);
    deviceNoteSettled = true;
  }
}

/** 首次进入时挂上：选择即时落盘；插拔设备自动刷新列表 */
function initDeviceSection() {
  const input = document.getElementById('asrDeviceInput');
  const menu = document.getElementById('asrDeviceDropdown');
  if (!input || !menu) return;
  refreshDeviceList();
  if (deviceBound) return;
  deviceBound = true;

  bindDropdownDismissOnce();
  bindDropdownSelect(input, menu, async (option) => {
    // 列表每次刷新都整体重建 → 只读 data 属性，不缓存 DOM 引用
    const deviceId = option.getAttribute('data-device-id') || '';
    const next = await saveSelectedDeviceId(deviceId);
    // 以落盘结果回写：存储失败时下拉不能骗人
    await refreshDeviceList();
    showToast(next ? t('toolbox.asrDeviceSaved') : t('toolbox.asrDeviceFollowSystemSaved'));
  });

  document.getElementById('asrDeviceRefreshBtn')?.addEventListener('click', () => {
    // 手动刷新要看到反馈：主动把状态行打回「正在读取」
    refreshDeviceList({ showLoading: true });
  });

  // 就地授权：未授权时设备列表可能只给很少/空列表，名字也拿不到。
  // 授权入口不能只放在「麦克风权限」小节（那块跟着语音总开关收起，关着时用户找不到）
  document.getElementById('asrDeviceGrantBtn')?.addEventListener('click', async () => {
    const btn = document.getElementById('asrDeviceGrantBtn');
    if (btn) { btn.disabled = true; btn.textContent = t('toolbox.asrMicGranting'); }
    let res;
    try {
      res = await requestMicAccess();
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = t('toolbox.asrMicGrantBtn'); }
      await refreshMicState();
      refreshDeviceList();
    }
    if (res?.ok) showToast(t('toolbox.asrMicGrantedToast'));
    else if (res?.state === 'denied') showToast(t('toolbox.asrMicDeniedToast'), 'error');
    else showToast(t('toolbox.asrMicNotGrantedToast'), 'error');
  });

  // USB 麦插上 / 蓝牙耳机连上 / 设备被拔：列表跟着变（devicechange 是全局事件，只绑一次）
  // 必须防抖：Windows 上音频服务抖动会连发多次，每次枚举要 2.5s，不防抖则旧结果持续被 token 丢掉、
  // 状态行反复被冲回「正在读取」 —— 用户看到的就是永远在读取
  watchAudioInputDevices(() => {
    if (deviceWatchTimer !== null) clearTimeout(deviceWatchTimer);
    deviceWatchTimer = setTimeout(() => {
      deviceWatchTimer = null;
      refreshDeviceList();
    }, DEVICE_REFRESH_DEBOUNCE_MS);
  });
  // 语言切换：列表项与状态行都是 JS 拼的，applyI18n 碰不到 → 自己重渲一次
  subscribe(() => { refreshDeviceList(); });
}

// ==================== 事件 ====================

function bindSectionEvents() {
  document.getElementById('asrInstallBtn')?.addEventListener('click', startInstall);
  document.getElementById('asrDetectBtn')?.addEventListener('click', redetect);
  document.getElementById('asrPickBtn')?.addEventListener('click', pickModelDir);
  document.getElementById('asrScanBtn')?.addEventListener('click', rescanModels);
  document.getElementById('asrDownloadBtn')?.addEventListener('click', () => startModelDownload());
  document.getElementById('asrDownloadCancelBtn')?.addEventListener('click', cancelModelDownload);

  document.querySelectorAll('.asr-model-del').forEach((btn) => {
    btn.addEventListener('click', () => deleteModel(btn.getAttribute('data-model-id')));
  });

  bindLangSelectEvents();
  bindPacingSelectEvents();

  const toggle = document.getElementById('asrEnableToggle');
  if (toggle && !toggle.dataset.bound) {
    toggle.dataset.bound = '1';
    toggle.addEventListener('change', async () => {
      const enabled = toggle.checked;
      // 借这次点击顺手把麦克风权限要下来：侧边栏里弹不出授权框，这里是唯一能「提前申请」的时机
      if (enabled) await ensureMicOnEnable();
      const res = await agentApi('POST', '/api/asr/config', { enabled });
      if (res && res.success !== false) {
        const label = document.getElementById('asrToggleLabel');
        if (label) label.textContent = enabled ? t('toolbox.asrEnabled') : t('toolbox.asrDisabled');
        showToast(enabled ? t('toolbox.asrEnabledToast') : t('toolbox.asrDisabledToast'));
        notifyStatusChanged();
        // 等刷新完再判断：lastStatus 是刷新后的快照（否则拿到的是旧状态）
        await refreshAsrSection();
        // 启用时缺模型 → 自动尝试下载（失败会降级为「模型未安装」状态，不影响其它功能）
        // 只在清单可用且有缺口时才触发：旧代理没有 catalog，别去撞一个不存在的端点
        const catalog = Array.isArray(lastStatus?.catalog) ? lastStatus.catalog : [];
        if (enabled && catalog.some((c) => c.installed !== true)) {
          triggerAutoDownload();
        }
      } else {
        toggle.checked = !enabled;
        showToast(res?.error || t('toolbox.asrSaveFailed'), 'error');
      }
    });
  }
}

/**
 * 绑定一颗「只读输入框 + 浮层列表」的下拉（.model-selector / .model-dropdown）
 *
 * 「界面语言」「识别语言」「输入设备」外观是同一套，交互也必须一样：点触发器展开 / 收起，
 * 点选项交给 onPick，Esc 收起。之前各处各写一份绑定，于是「点外面不收起」这类差异就冒出来了。
 * @param {HTMLInputElement} input 触发器
 * @param {HTMLElement} menu 浮层列表
 * @param {(option: HTMLElement) => void} onPick 点中某一项（取值 / 落盘由调用方决定）
 */
function bindDropdownSelect(input, menu, onPick) {
  const close = () => {
    menu.classList.remove('show');
    input.setAttribute('aria-expanded', 'false');
  };
  input.addEventListener('click', () => {
    const shown = menu.classList.toggle('show');
    input.setAttribute('aria-expanded', shown ? 'true' : 'false');
  });
  menu.addEventListener('click', (ev) => {
    const option = ev.target instanceof Element ? ev.target.closest('.model-option') : null;
    if (!option) return;
    close();
    onPick(option);
  });
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape') close();
  });
}

/** 需要「点别处收起」的下拉（列表会整体重建，所以监听挂 document 上只挂一次、按 id 现查） */
const DISMISSABLE_DROPDOWNS = [
  { inputId: 'asrLangInput', menuId: 'asrLangDropdown' },
  { inputId: 'asrPacingInput', menuId: 'asrPacingDropdown' },
  { inputId: 'asrDeviceInput', menuId: 'asrDeviceDropdown' },
];
let dropdownDismissBound = false;

function bindDropdownDismissOnce() {
  if (dropdownDismissBound) return;
  dropdownDismissBound = true;
  document.addEventListener('click', (ev) => {
    DISMISSABLE_DROPDOWNS.forEach(({ inputId, menuId }) => {
      const input = document.getElementById(inputId);
      const menu = document.getElementById(menuId);
      if (!input || !menu || !menu.classList.contains('show')) return;
      // 点在自己的触发器上由 toggle 管，点在浮层里由选项自己管
      if (input.contains(ev.target) || menu.contains(ev.target)) return;
      menu.classList.remove('show');
      input.setAttribute('aria-expanded', 'false');
    });
  });
}

/**
 * 识别语言下拉：展开 + 选择
 * 触发器与「界面语言」下拉完全同构（.model-selector + readonly input）
 */
function bindLangSelectEvents() {
  const trigger = document.getElementById('asrLangInput');
  const menu = document.getElementById('asrLangDropdown');
  if (!trigger || !menu) return;
  bindDropdownDismissOnce();

  bindDropdownSelect(trigger, menu, async (option) => {
    const language = option.getAttribute('data-lang') || 'auto';
    const res = await agentApi('POST', '/api/asr/config', { language });
    if (res && res.success !== false) {
      trigger.value = langLabel(language);
      menu.querySelectorAll('.model-option').forEach((el) => {
        const isCurrent = el.getAttribute('data-lang') === language;
        el.classList.toggle('selected', isCurrent);
        el.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
      showToast(t('toolbox.asrLangSaved'));
      notifyStatusChanged();
    } else {
      showToast(res?.error || t('toolbox.asrSaveFailed'), 'error');
    }
  });
}

/**
 * 识别节奏下拉：展开 + 选择
 *
 * 档位是长期偏好（instant 不逐句精修 / balanced 逐句精修 / precise 不出逐字草稿），
 * 与识别语言一样写进 /api/asr/config，会话创建时读一次——不往 WS 帧里塞。
 */
function bindPacingSelectEvents() {
  const trigger = document.getElementById('asrPacingInput');
  const menu = document.getElementById('asrPacingDropdown');
  if (!trigger || !menu) return;
  bindDropdownDismissOnce();

  bindDropdownSelect(trigger, menu, async (option) => {
    const pacing = option.getAttribute('data-pacing') || 'balanced';
    const res = await agentApi('POST', '/api/asr/config', { asrPacing: pacing });
    if (res && res.success !== false) {
      trigger.value = pacingLabel(pacing);
      menu.querySelectorAll('.model-option').forEach((el) => {
        const isCurrent = el.getAttribute('data-pacing') === pacing;
        el.classList.toggle('selected', isCurrent);
        el.setAttribute('aria-selected', isCurrent ? 'true' : 'false');
      });
      showToast(t('toolbox.asrPacingSaved'));
      notifyStatusChanged();
    } else {
      showToast(res?.error || t('toolbox.asrSaveFailed'), 'error');
    }
  });
}

/** 让侧边栏下次拉取状态时绕过 10s 缓存 */
function notifyStatusChanged() {
  try {
    chrome.runtime.sendMessage({ type: 'ASR_RESET_STATUS' }).catch?.(() => {});
  } catch { /* background 可能未运行 */ }
}

// ==================== 模型下载 ====================

/** 下载进度 */
async function loadDownloadStatus() {
  try {
    return await agentApi('GET', '/api/asr/models/download/status');
  } catch {
    return null;
  }
}

/**
 * 手动开始下载推荐模型
 */
async function startModelDownload() {
  const btn = document.getElementById('asrDownloadBtn');
  if (btn) { btn.disabled = true; btn.textContent = t('toolbox.asrDownloading'); }
  try {
    const res = await agentApi('POST', '/api/asr/models/download', {});
    // alreadyRunning = 幂等重入（重复点击）：接上进度轮询，不当成失败
    if (res && res.success === false && res.alreadyRunning !== true) {
      showToast(res.error || t('toolbox.asrDownloadFailed'), 'error');
      await refreshAsrSection();
      return;
    }
    if (res && res.skipped === 'already_installed') {
      showToast(t('toolbox.asrDownloadInstalled'));
      await refreshAsrSection();
      return;
    }
    if (res && res.started !== true && res.alreadyRunning !== true) {
      // 无可用目标等异常分支：回到真实状态
      await refreshAsrSection();
      return;
    }
    pollDownloadStatus();
  } catch (err) {
    showToast(t('toolbox.asrDownloadFailed'), 'error');
    await refreshAsrSection();
  }
}

/**
 * 取消下载（已落盘的文件保留，下次重试续传）
 */
async function cancelModelDownload() {
  try {
    await agentApi('POST', '/api/asr/models/download/cancel', {});
  } catch { /* 忽略：下面的刷新会反映真实状态 */ }
  stopDownloadPolling();
  showToast(t('toolbox.asrDownloadCanceled'));
  await refreshAsrSection();
}

/**
 * 启用开关后自动尝试下载（用户已确认的交互：能下就下，下不下来就降级为「未安装」）
 */
async function triggerAutoDownload() {
  showToast(t('toolbox.asrAutoDownloadStart'));
  await startModelDownload();
}

function renderDownloadProgress(download) {
  const el = document.getElementById('asrDownloadProgress');
  if (!el) return;
  const html = downloadProgressHtml(download);
  if (!html) { el.style.display = 'none'; el.innerHTML = ''; return; }
  el.style.display = '';
  el.innerHTML = html;
}

function stopDownloadPolling() {
  if (downloadPollTimer) clearInterval(downloadPollTimer);
  downloadPollTimer = null;
}

function pollDownloadStatus() {
  stopDownloadPolling();
  let failures = 0;
  const tick = async () => {
    const download = await loadDownloadStatus();
    if (!download) {
      if (++failures >= 3) {
        stopDownloadPolling();
        showToast(t('toolbox.asrAgentUnreachable'), 'error');
      }
      return;
    }
    failures = 0;
    renderDownloadProgress(download);
    if (download.running === true && download.done !== true) return;
    stopDownloadPolling();
    notifyStatusChanged();
    if (download.success === true) showToast(t('toolbox.asrDownloadDone'));
    else if (download.aborted === true) showToast(t('toolbox.asrDownloadCanceled'));
    else showToast(download.error || t('toolbox.asrDownloadFailed'), 'error');
    await refreshAsrSection();
  };
  tick();
  downloadPollTimer = setInterval(tick, DOWNLOAD_POLL_INTERVAL_MS);
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
  initMicSection();
  initDeviceSection();
  initShortcutSection();
  // 语言下拉：点击区域外收起。全局只绑一次（每次重渲染都会重建 DOM，
  // 若在 bindSectionEvents 里绑会不断累积监听）
  document.addEventListener('click', (e) => {
    const field = document.getElementById('asrLangField');
    const menu = document.getElementById('asrLangDropdown');
    if (!field || !menu) return;
    if (field.contains(e.target)) return;
    menu.classList.remove('show');
    document.getElementById('asrLangInput')?.setAttribute('aria-expanded', 'false');
  });
}

