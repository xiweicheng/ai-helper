// side_panel/voice-input.js - 语音输入（本地 STT）
//
// 交互（对齐主流桌面端语音输入）：
//   点 🎤 / Alt+V 开始录音 → 录音条显示波形与计时、边说边出草稿 → 再点一次或点 ✓ 结束定稿；
//   Esc 或录音条 ✕ = 取消并回滚本次草稿；定稿后不自动发送。
//
// 通道：
//   状态与整段转写走一次性消息（background 转发代理端 HTTP）；
//   流式（草稿）走 chrome.runtime.connect({name:'asr'})，由 background 持 token 开 WebSocket。
//
// 门控（三者全真才露面）：deps.ready（依赖）× modelsReady（模型）× enabled（用户开关）。
// 任何一环缺失都不显示按钮，避免「装了就该能用」的误解（配置页负责逐项说明缺哪一环）。

import { t, registerTranslations } from '../shared/i18n.js';
import logger from '../shared/logger.js';
import {
  createSingleKeyTrigger,
  loadVoiceShortcutConfig,
  watchVoiceShortcutConfig,
  DEFAULT_VOICE_SHORTCUT_CONFIG,
} from '../shared/voice-shortcut.js';
import { loadSelectedDeviceId, acquireAudioStream } from '../shared/audio-input-device.js';
import { buildDraftText, applySentence, locateEdit, mergeRefined } from './voice-draft-items.js';

registerTranslations('zh', {
  voice: {
    start: '语音输入（开始录音）',
    stop: '结束录音并转写',
    recording: '正在录音',
    listening: '正在聆听…',
    transcribing: '正在转写…',
    cancel: '取消录音',
    done: '完成',
    noSpeech: '没有听到声音',
    noResult: '未识别到语音',
    micDenied: '麦克风未授权',
    micDeniedHelp: '侧边栏里浏览器不会弹授权框，请到配置页「语音输入 → 麦克风权限」授权一次',
    micDeniedAction: '去授权',
    micDeniedActionTitle: '打开配置页授权麦克风（侧边栏内无法弹出授权框）',
    unavailable: '语音功能不可用',
    modelMissing: '缺少语音模型',
    modelMissingHelp: '请在配置页「语音」Tab 中导入模型包',
    busy: '有语音任务正在进行',
    failed: '语音识别失败',
    connectionLost: '连接中断',
    tooShort: '录音太短',
    maxDuration: '已达单次录音时长上限，正在转写…',
    unsupported: '当前浏览器不支持录音',
    keyRightAlt: '右侧 Alt',
    keyRightCtrl: '右侧 Ctrl',
    btnTitle: '语音输入（{keys}）',
    deviceFallback: '原麦克风不可用，已改用系统默认',
    refineListening: '正在听…（已定稿 {n} 句）',
    refineCorrecting: '正在校正…',
    refineCorrected: '已校正 {n} 处',
    refineDegraded: '本机性能有限，已关闭逐句精修（松手后仍会整体校正）',
  },
});
registerTranslations('en', {
  voice: {
    start: 'Voice input (start recording)',
    stop: 'Stop and transcribe',
    recording: 'Recording',
    listening: 'Listening…',
    transcribing: 'Transcribing…',
    cancel: 'Cancel recording',
    done: 'Done',
    noSpeech: 'No sound detected',
    noResult: 'No speech recognised',
    micDenied: 'Microphone not granted',
    micDeniedHelp: 'The browser cannot prompt inside the side panel — grant it once in Options → Voice Input → Microphone permission',
    micDeniedAction: 'Grant access',
    micDeniedActionTitle: 'Open options to grant microphone access (the side panel cannot show the prompt)',
    unavailable: 'Voice input unavailable',
    modelMissing: 'Speech model missing',
    modelMissingHelp: 'Import a model pack in the Options "Voice" tab',
    busy: 'Another voice task is running',
    failed: 'Speech recognition failed',
    connectionLost: 'Connection lost',
    tooShort: 'Recording too short',
    maxDuration: 'Recording length limit reached, transcribing…',
    unsupported: 'Recording is not supported in this browser',
    keyRightAlt: 'Right Alt',
    keyRightCtrl: 'Right Ctrl',
    btnTitle: 'Voice input ({keys})',
    deviceFallback: 'Selected microphone unavailable — using the system default',
    refineListening: 'Listening… ({n} sentences finalized)',
    refineCorrecting: 'Refining…',
    refineCorrected: '{n} correction(s) applied',
    refineDegraded: 'This machine is too slow for per-sentence refinement (the final pass still runs)',
  },
});

/** pendingVoiceStart 有效期：与 background 写入侧约定一致 */
const PENDING_START_TTL_MS = 15_000;
/** 采样率：代理端只吃 16k */
const TARGET_RATE = 16_000;
/** 连续静音多久提示「没有听到声音」 */
const SILENCE_HINT_MS = 2_500;
/** 静音 RMS 阈值（低于视为无声） */
const SILENCE_RMS = 0.008;
/** 太短不送转写（避免空请求） */
const MIN_RECORD_MS = 350;
/** 波形柱数量 */
const WAVE_BARS = 24;

const st = {
  input: null,
  btn: null,
  bar: null,
  wave: null,
  timerEl: null,
  statusEl: null,
  permBtn: null,
  barEls: [],
  status: null,
  armed: false,
  phase: 'idle', // idle | starting | recording | finalizing
  port: null,
  stream: null,
  ctx: null,
  node: null,
  source: null,
  startedAt: 0,
  timer: null,
  silentSince: 0,
  silenceWarned: false,
  // 草稿区间：{start, len, items: [{id, text, state}]}；items 末位是 id:null 的「正在说」开放句
  draft: null,
  lastText: '',
  // 已写进输入框的那一版文本（整块），用来算用户手改产生的净增量
  appliedText: '',
  // 上一次程序化写入后的完整输入框值：用户净增量 = 当前长度 - 它
  appliedValue: '',
  // 服务端当前「未切句」的原文，用户改过开放句后只能追加它多出来的尾巴
  openText: '',
  // ScriptProcessor 兜底的 0 增益中继（不进 destination 不会被回调，真进去又会被听见）
  mute: null,
  programmatic: false,
  draftSupported: true,
  finishWaitTimer: null,
  adjustInputHeight: null,
  // 单键快捷键（右侧 Alt / 右侧 Ctrl）：配置在 chrome.storage.local，配置页勾选后实时生效
  shortcutCfg: { ...DEFAULT_VOICE_SHORTCUT_CONFIG },
  shortcutTrigger: null,
  shortcutBound: false,
  // 本次录音是否因「选中的设备不可用」回落到了系统默认（用于录音条提示一次）
  deviceFellBack: false,
};

// ==================== 小工具 ====================

function s(input) {
  return typeof input === 'string' ? input : '';
}

function fmtTime(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const mm = String(Math.floor(total / 60)).padStart(2, '0');
  const ss = String(total % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/** Int16Array → base64（port 只能传 JSON，ArrayBuffer 会被丢掉） */
function pcmToBase64(int16) {
  const bytes = new Uint8Array(int16.buffer, int16.byteOffset, int16.byteLength);
  let binary = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/** 线性插值重采样（AudioContext 未必肯给 16k，兜底用） */
function resample(samples, from, to) {
  if (from === to) return samples;
  const ratio = from / to;
  const outLen = Math.floor(samples.length / ratio);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const pos = i * ratio;
    const i0 = Math.floor(pos);
    const frac = pos - i0;
    const s0 = samples[i0] || 0;
    const s1 = samples[i0 + 1] !== undefined ? samples[i0 + 1] : s0;
    out[i] = s0 + (s1 - s0) * frac;
  }
  return out;
}

function floatToInt16(samples) {
  const out = new Int16Array(samples.length);
  for (let i = 0; i < samples.length; i++) {
    const v = samples[i] < -1 ? -1 : samples[i] > 1 ? 1 : samples[i];
    out[i] = v < 0 ? v * 0x8000 : v * 0x7fff;
  }
  return out;
}

// ==================== 状态与门控 ====================

async function fetchStatus(force = false) {
  try {
    const res = await chrome.runtime.sendMessage({ type: 'ASR_GET_STATUS', force });
    if (res && res.success && res.status) {
      st.status = res.status;
      return st.status;
    }
  } catch (err) {
    logger.debug('[Voice] status fetch failed:', err?.message || err);
  }
  st.status = null;
  return null;
}

/** 三者全真才允许露出按钮 */
export function computeArmed(status) {
  if (!status || status.success === false) return false;
  // 服务端给了汇总结果就以它为准（三分离的判定只在代理端做一次，避免两边规则漂移）
  if (typeof status.available === 'boolean') return status.available;
  // 兼容旧代理：没有 available 字段时按细分项推导
  return status.deps?.ready === true && status.modelsReady === true && status.enabled === true;
}

/**
 * 纯函数：把文本写入草稿区间（可单测，不依赖 DOM）。
 * - 支持替换：原地替换 [start, start+len)
 * - 不支持（缺 setRangeText）：退化为在光标处追加，绝不覆盖用户输入
 *
 * 用户手改的隔离不在这里做：那一层已经精确到句（句表 locked），
 * 所以每次重写都是「整块草稿区间」，不需要「用户改过就只追加」的开关。
 * @param {{value: string, draft: {start:number, len:number}, text: string, caret?: number, canReplace?: boolean}} input
 * @returns {{value: string, caret: number, len: number}}
 */
export function computeDraftEdit({ value, draft, text, caret, canReplace = true }) {
  const base = typeof value === 'string' ? value : '';
  if (!draft) return { value: base, caret: base.length, len: 0 };
  if (!canReplace) {
    const at = typeof caret === 'number' ? Math.min(Math.max(0, caret), base.length) : base.length;
    return { value: base.slice(0, at) + text + base.slice(at), caret: at + text.length, len: 0 };
  }
  const from = Math.min(Math.max(0, draft.start), base.length);
  const to = Math.min(Math.max(from, draft.start + draft.len), base.length);
  return {
    value: base.slice(0, from) + text + base.slice(to),
    caret: from + text.length,
    len: text.length,
  };
}

/**
 * 纯函数：取消时回滚草稿区间（用户改过的句由调用方先筛掉，这里只管区间）
 * @param {{value: string, draft: object, canReplace?: boolean}} input
 * @returns {{value: string, caret: number}}
 */
export function computeDraftRollback({ value, draft, canReplace = true }) {
  const base = typeof value === 'string' ? value : '';
  if (!draft || !canReplace || draft.len <= 0) {
    return { value: base, caret: base.length };
  }
  const from = Math.min(Math.max(0, draft.start), base.length);
  const to = Math.min(Math.max(from, draft.start + draft.len), base.length);
  return { value: base.slice(0, from) + base.slice(to), caret: from };
}

/**
 * 纯函数：判断键盘事件是否为「语音输入」快捷键（Alt+V）。
 * 守卫（可单测，与 side_panel/index.js 的实际绑定共用一份判定）：
 *   - 输入法候选期（isComposing）不响应：否则中文候选时按 Alt+V 会误触发
 *   - 长按重复（repeat）不响应：避免 start/stop 抖动
 *   - 带其他修饰键不响应；用 e.code（布局无关，macOS 上 Alt+V 的 e.key 是 '√'）
 * @param {KeyboardEvent|object} e
 * @returns {boolean}
 */
export function matchVoiceShortcut(e) {
  if (!e || e.isComposing || e.repeat) return false;
  return e.altKey === true && !e.shiftKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyV';
}

async function refreshGating() {
  const status = await fetchStatus();
  st.armed = computeArmed(status);
  if (st.btn) {
    st.btn.style.display = st.armed ? '' : 'none';
  }
  if (!st.armed && st.phase !== 'idle') {
    cancelRecording({ rollback: true });
  }
  return st.armed;
}

// ==================== 草稿注入 ====================

function markDirty() {
  if (!st.draft || !st.input) return;
  const expected = buildDraftText(st.draft.items);
  const full = st.input.value;
  // 用户净增量：纯插入>0、纯删除<0。只有单处编辑时块尾 = start + expected.length + delta
  const delta = full.length - s(st.appliedValue).length;
  const from = Math.min(Math.max(0, st.draft.start), full.length);
  const actual = full.slice(from, from + expected.length + delta);
  const r = locateEdit(st.draft.items, expected, actual);
  if (r.shift) st.draft.start += r.shift; // 块前插了字：草稿起点跟着挪
  if (r.lockedIds.length === 0) return; // 改动不在块内（尾巴追加）：草稿长度不变
  // 锁住被改的那几句，并把用户手上的文字一并收进句表（否则下次重写会盖回去）
  st.draft.items = r.items.map((i) => (r.lockedIds.includes(i.id) ? { ...i, state: 'locked' } : i));
  st.draft.len = r.len;
}

function captureInsertPoint() {
  const input = st.input;
  if (!input) return { start: 0, len: 0, items: [] };
  const start = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
  const end = typeof input.selectionEnd === 'number' ? input.selectionEnd : start;
  if (start !== end) {
    // 有选区：直接替换选区内容
    input.setRangeText('', start, end, 'end');
  }
  return { start, len: 0, items: [] };
}

/**
 * 纯函数：流式 partial 是「累积文本」，用户接手草稿后只能追加与上一版相比多出来的尾巴。
 * 返回 null 表示这一版发生了改写（不是纯追加）—— 此时宁可不动用户的文本，也不整段重写。
 * @param {string} prev 上一版已写入输入框的文本
 * @param {string} next 本次收到的文本
 * @returns {string|null} 可安全追加的增量
 */
export function appendOnlyDelta(prev, next) {
  const a = s(prev);
  const b = s(next);
  if (!b) return '';
  if (!a) return b;
  if (!b.startsWith(a)) return null;
  return b.slice(a.length);
}

/** 写入输入框：机器改内容必须走这里，好让发送按钮等下游知道「值变了」 */
function writeInput(value, caret) {
  const input = st.input;
  if (!input) return;
  st.programmatic = true;
  st.appliedValue = value; // 上一次程序化写入的完整值，用户净增量靠它算
  input.value = value;
  try { input.setSelectionRange(caret, caret); } catch { /* 忽略 */ }
  st.programmatic = false;
  // 不能派发原生 input 事件：侧边栏还挂着「扫 / @ $ 弹选择器」的监听，
  // 口述内容里出现这三个字符就会在录音中途弹出面板。只发一个专用信号。
  try { document.dispatchEvent(new CustomEvent('voice-draft-written')); } catch { /* 忽略 */ }
  try { st.adjustInputHeight?.(); } catch { /* 忽略 */ }
  try { input.focus(); } catch { /* 忽略 */ }
}

/**
 * 把句表整块重写进输入框（草稿区间不变，只换内容）。
 * 文本没变时直接返回：partial 每 150ms 一次，无意义重写会把光标不断拖到句尾。
 */
function rewriteDraftBlock(force = false) {
  const input = st.input;
  if (!input || !st.draft) return;
  const nextText = buildDraftText(st.draft.items);
  if (!force && nextText === s(st.appliedText)) return;
  const caret = typeof input.selectionStart === 'number' ? input.selectionStart : undefined;
  const next = computeDraftEdit({
    value: input.value,
    draft: { start: st.draft.start, len: st.draft.len },
    text: nextText,
    caret,
    canReplace: st.draftSupported,
  });
  st.draft.len = nextText.length;
  st.appliedText = nextText;
  writeInput(next.value, next.caret);
}

/**
 * 只更新「正在说」的那一句（句表末位的开放句），整块重写。
 *
 * 为什么不是整段重写：已定稿的句子有自己的 id，精修回来要能「只改那一句」；
 * 而用户改过的句子（state=locked）绝不能因为流式草稿刷新而被模型结果覆盖。
 */
function applyDraft(openText) {
  const input = st.input;
  if (!input || !st.draft) return;
  const items = Array.isArray(st.draft.items) ? st.draft.items : [];
  const idx = items.findIndex((i) => i.id === null);
  const incoming = s(openText);

  if (idx >= 0 && items[idx].state === 'locked') {
    // 用户改过正在说的这一句：只追加新多出来的尾巴，不覆盖用户的字
    const delta = appendOnlyDelta(st.openText, incoming);
    st.openText = incoming;
    if (!delta) return;
    st.draft.items = items.map((i, k) => (k === idx ? { ...i, text: i.text + delta } : i));
  } else {
    st.openText = incoming;
    st.draft.items = idx >= 0
      ? items.map((i, k) => (k === idx ? { ...i, text: incoming } : i))
      : items.concat([{ id: null, text: incoming, state: 'draft' }]);
  }
  rewriteDraftBlock();
}

/** 回滚本次草稿（取消时）。用户改过的句子不删，宁可留一段也不想毁掉手写内容 */
function rollbackDraft() {
  const input = st.input;
  if (!input || !st.draft) return;
  const locked = Array.isArray(st.draft.items) && st.draft.items.some((i) => i.state === 'locked');
  const next = locked
    ? { value: input.value, caret: input.value.length }
    : computeDraftRollback({
      value: input.value,
      draft: st.draft,
      canReplace: st.draftSupported,
    });
  if (next.value !== input.value) {
    st.programmatic = true;
    st.appliedValue = next.value;
    input.value = next.value;
    const caret = Math.min(next.caret, input.value.length);
    try { input.setSelectionRange(caret, caret); } catch { /* 忽略 */ }
    st.programmatic = false;
    try { st.adjustInputHeight?.(); } catch { /* 忽略 */ }
  }
  st.draft = null;
  st.lastText = '';
  st.appliedText = '';
  st.openText = '';
}

// ==================== 录音条 UI ====================

function buildWaveBars() {
  if (!st.wave) return;
  st.wave.textContent = '';
  st.barEls = [];
  for (let i = 0; i < WAVE_BARS; i++) {
    const i2 = document.createElement('i');
    st.wave.appendChild(i2);
    st.barEls.push(i2);
  }
}

function setBarStatus(text, tone = '') {
  if (!st.statusEl) return;
  st.statusEl.textContent = text;
  st.statusEl.className = 'voice-recorder-status' + (tone ? ` is-${tone}` : '');
}

function showBar() {
  if (!st.bar) return;
  st.bar.classList.add('show');
  // 属性只用来表达「隐藏」：显示时直接移除，不写 aria-hidden="false"
  // （false 与移除在无障碍树上等价，但两态写法容易再写出「隐藏时焦点还在里面」那类问题）
  st.bar.removeAttribute('aria-hidden');
}

/** 「去授权」入口：只在麦克风未授权时露出（授权只能在标签页形态的配置页做） */
function showPermButton(show) {
  if (!st.permBtn) return;
  st.permBtn.style.display = show ? '' : 'none';
}

/**
 * 隐藏前先把焦点收走
 *
 * 「取消 / 完成」都是条内按钮触发的：点完焦点就留在按钮上，紧接着 hideBar 给整条设
 * aria-hidden="true"，浏览器会拦下并告警（Blocked aria-hidden on an element because
 * its descendant retained focus），键盘/读屏用户的焦点还会被悬空。所以隐藏前先把焦点
 * 交还输入框 —— 取消或定稿之后，用户下一步本来就是接着打字。
 */
function releaseBarFocus() {
  const active = document.activeElement;
  if (!st.bar || !active || !st.bar.contains(active)) return;
  if (st.input && typeof st.input.focus === 'function') {
    try {
      st.input.focus({ preventScroll: true });
      return;
    } catch { /* 输入框不可聚焦时退化为直接 blur */ }
  }
  try { active.blur(); } catch { /* 忽略 */ }
}

function hideBar() {
  if (!st.bar) return;
  // 延后收起的定时器可能在面板销毁后才触发（关标签/切走）：此时 document 已不存在
  if (typeof document === 'undefined' || !document.body) return;
  releaseBarFocus();
  showPermButton(false);
  st.bar.classList.remove('show');
  st.bar.setAttribute('aria-hidden', 'true');
  st.barEls.forEach((el) => { el.style.height = ''; el.style.opacity = ''; });
  if (st.timerEl) st.timerEl.textContent = '00:00';
}

function updateWave(rms) {
  if (!st.barEls.length) return;
  const level = Math.min(1, Math.sqrt(Math.max(0, rms)) * 6);
  // 左移一格 + 新值入队，形成滚动波形
  for (let i = 0; i < st.barEls.length - 1; i++) {
    st.barEls[i].style.height = st.barEls[i + 1].style.height;
    st.barEls[i].style.opacity = st.barEls[i + 1].style.opacity;
  }
  const last = st.barEls[st.barEls.length - 1];
  last.style.height = `${Math.max(2, Math.round(level * 18))}px`;
  last.style.opacity = level > 0.06 ? '1' : '0.35';
}

function setButtonState(recording) {
  if (!st.btn) return;
  st.btn.classList.toggle('recording', recording);
  st.btn.setAttribute('aria-pressed', recording ? 'true' : 'false');
  st.btn.setAttribute('aria-label', recording ? t('voice.stop') : t('voice.start'));
  st.btn.title = recording ? t('voice.stop') : t('voice.start');
}

function setInputRecordingClass(on) {
  document.body?.classList.toggle('voice-recording-active', !!on);
}

// ==================== 采集 ====================

function ensurePort() {
  if (st.port) return st.port;
  try {
    const port = chrome.runtime.connect({ name: 'asr' });
    port.onMessage.addListener(onAgentEvent);
    port.onDisconnect.addListener(() => {
      st.port = null;
      if (st.phase === 'recording' || st.phase === 'finalizing') {
        // 代理端断开：立即结束本次采集。已写入的文字保留（用户已经看得见），
        // 但清掉 draft 让后续事件不再替换/回滚它。
        stopCapture();
        resetToIdle();
        st.draft = null;
        st.lastText = '';
        setButtonState(false);
        setInputRecordingClass(false);
        setBarStatus(t('voice.connectionLost'), 'warn');
        setTimeout(() => { if (st.phase === 'idle') hideBar(); }, 3500);
      }
    });
    st.port = port;
    return port;
  } catch (err) {
    logger.warn('[Voice] connect port failed:', err?.message || err);
    return null;
  }
}

function sendChunk(int16, rms) {
  updateWave(rms);
  trackSilence(rms);
  if (!st.port) return;
  try {
    st.port.postMessage({ type: 'audio', data: pcmToBase64(int16) });
  } catch (err) {
    logger.debug('[Voice] post audio failed:', err?.message || err);
  }
}

/**
 * 静音检测：连续 SILENCE_HINT_MS 低于阈值 → 录音条提示「没有听到声音」；
 * 重新有声音时回到「正在聆听…」（不是一次性 toast，用户一直没声音就一直提示）。
 * @param {number} rms 本帧 RMS
 */
function trackSilence(rms) {
  if (st.phase !== 'recording' && st.phase !== 'starting') return;
  if (rms >= SILENCE_RMS) {
    st.silentSince = 0;
    if (st.silenceWarned) {
      st.silenceWarned = false;
      setBarStatus(t('voice.listening'));
    }
    return;
  }
  const now = Date.now();
  if (!st.silentSince) { st.silentSince = now; return; }
  if (st.silenceWarned) return;
  if (now - st.silentSince >= SILENCE_HINT_MS) {
    st.silenceWarned = true;
    setBarStatus(t('voice.noSpeech'), 'warn');
  }
}

/** AudioWorklet 路径 */
// worklet 文件所在层级随「扩展根」而变，写死一个路径必然有一半安装形态加载失败：
//   - 商店 zip / load unpacked dist（manifest.json 在扩展根）→ 文件就在扩展根
//   - load unpacked 项目根（源码形态）→ 文件在 dist/ 子目录
// 早先只写了 'dist/...'，于是最常见的安装形态下拿到的是 ERR_FILE_NOT_FOUND，
// 静默退到 ScriptProcessor，并带出一条 deprecation 警告。
const WORKLET_PATHS = ['voice-capture-worklet.js', 'dist/voice-capture-worklet.js'];
let workletUrl; // 解析成功后缓存：一次会话里扩展根不会变

/**
 * 解析 worklet 的真实 URL。
 * 先用 fetch 探一下再交给 addModule：addModule 失败会由浏览器直接打一条
 * 「Failed to load worklet module script」错误，那是纯噪音，不能拿来当探测手段。
 * @returns {Promise<string|null>} 两处都没有 → null（调用方走 ScriptProcessor 兜底）
 */
async function resolveWorkletUrl() {
  if (workletUrl !== undefined) return workletUrl;
  for (const rel of WORKLET_PATHS) {
    let url = '';
    try { url = chrome.runtime.getURL(rel); } catch { continue; }
    try {
      const res = await fetch(url);
      if (res && res.ok) { workletUrl = url; return url; }
    } catch { /* 换下一个候选 */ }
  }
  workletUrl = null;
  return null;
}

async function startWorklet(ctx, source) {
  const url = await resolveWorkletUrl();
  if (!url) throw new Error('worklet not found in extension');
  await ctx.audioWorklet.addModule(url);
  const node = new AudioWorkletNode(ctx, 'voice-capture');
  const needResample = Math.abs(ctx.sampleRate - TARGET_RATE) > 1;
  node.port.onmessage = (e) => {
    const data = e.data;
    if (!data || data.type !== 'chunk' || !data.pcm) return;
    let int16 = new Int16Array(data.pcm);
    if (needResample) {
      const floats = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) floats[i] = int16[i] / 32768;
      int16 = floatToInt16(resample(floats, ctx.sampleRate, TARGET_RATE));
    }
    sendChunk(int16, data.rms || 0);
  };
  source.connect(node);
  // 不接 destination：本地采集不需要回放，接了还会产生回声
  st.node = node;
}

/** 兜底路径：ScriptProcessor（AudioWorklet 加载失败时） */
function startScriptProcessor(ctx, source) {
  const bufferSize = 4096;
  const node = ctx.createScriptProcessor(bufferSize, 1, 1);
  const needResample = Math.abs(ctx.sampleRate - TARGET_RATE) > 1;
  node.onaudioprocess = (e) => {
    const input = e.inputBuffer.getChannelData(0);
    let floats = new Float32Array(input);
    if (needResample) floats = resample(floats, ctx.sampleRate, TARGET_RATE);
    let peak = 0;
    for (let i = 0; i < floats.length; i++) peak += floats[i] * floats[i];
    sendChunk(floatToInt16(floats), Math.sqrt(peak / Math.max(1, floats.length)));
  };
  source.connect(node);
  // ScriptProcessor 只有被拉到 destination 才会回调，但不能让用户听见自己说话：
  // 串一个 0 增益节点再进 destination（worklet 不需要这一步，它悬空也会被驱动）。
  const mute = ctx.createGain();
  mute.gain.value = 0;
  node.connect(mute);
  mute.connect(ctx.destination);
  st.mute = mute;
  st.node = node;
}

async function startCapture() {
  if (!navigator.mediaDevices?.getUserMedia) {
    setBarStatus(t('voice.unsupported'), 'warn');
    throw new Error('unsupported');
  }
  // 设备选择每次开录都从存储重读：用户可能刚插了个麦，也可能刚在配置页改过
  // （存储是唯一真源，不在这里缓存一份 —— 缓存的代价是改了配置却还在用旧设备）
  const selectedDeviceId = await loadSelectedDeviceId();
  const acquired = await acquireAudioStream(selectedDeviceId);
  st.stream = acquired.stream;
  st.deviceFellBack = acquired.fellBack === true;

  const Ctx = window.AudioContext || window.webkitAudioContext;
  // 尽量让浏览器直接给 16k，省一次重采样；拿不到就在回调里线性插值
  let ctx;
  try {
    ctx = new Ctx({ sampleRate: TARGET_RATE });
  } catch {
    ctx = new Ctx();
  }
  if (ctx.state === 'suspended') {
    try { await ctx.resume(); } catch { /* 忽略 */ }
  }
  st.ctx = ctx;

  const source = ctx.createMediaStreamSource(acquired.stream);
  st.source = source;

  try {
    await startWorklet(ctx, source);
  } catch (err) {
    logger.warn('[Voice] worklet unavailable, fallback to ScriptProcessor:', err?.message || err);
    startScriptProcessor(ctx, source);
  }
}

function stopCapture() {
  if (st.timer) { clearInterval(st.timer); st.timer = null; }
  try { st.node?.port?.close?.(); } catch { /* 忽略 */ }
  try { st.node?.disconnect?.(); } catch { /* 忽略 */ }
  try { st.mute?.disconnect?.(); } catch { /* 忽略 */ }
  try { st.source?.disconnect?.(); } catch { /* 忽略 */ }
  try { st.stream?.getTracks?.().forEach((tr) => tr.stop()); } catch { /* 忽略 */ }
  try { st.ctx?.close?.(); } catch { /* 忽略 */ }
  st.node = null;
  st.mute = null;
  st.source = null;
  st.stream = null;
  st.ctx = null;
}

// ==================== 生命周期 ====================

/**
 * 回到空闲。所有「回到 idle」的出口都走这里 ——
 * 60s 兜底定时器只能在这里统一清掉，否则 cancel/错误路径会把上一轮的定时器
 * 带到下一次录音里（触发时提前定稿，紧接着的真实 final 被当成「迟到」丢弃）。
 */
function resetToIdle() {
  if (st.finishWaitTimer) { clearTimeout(st.finishWaitTimer); st.finishWaitTimer = null; }
  st.phase = 'idle';
}

function startTimer() {
  const tick = () => {
    const elapsed = Date.now() - st.startedAt;
    if (st.timerEl) st.timerEl.textContent = fmtTime(elapsed);
    const status = st.status;
    const limit = (status && status.maxRecordingMs) || 5 * 60 * 1000;
    if (elapsed >= limit) finish('stop');
  };
  if (st.timer) clearInterval(st.timer);
  st.timer = setInterval(tick, 200);
  tick();
}

async function startRecording(opts = {}) {
  if (st.phase !== 'idle') return false;
  if (!st.armed && !opts.force) {
    // 未 armed 时给一次性反馈（配置页才是修复入口）
    await refreshGating();
    if (!st.armed) return false;
    // refreshGating 要问代理端，是个 await：这期间又有人点 🎤 / 按 Alt+V，另一路可能
    // 已经进了 starting/recording。不复查就会两路并发采集，前一组 AudioContext 与
    // MediaStream 被后者覆盖、永不释放（麦克风指示常亮），两路帧还会同时上送。
    if (st.phase !== 'idle') return false;
  }
  st.phase = 'starting';
  st.lastText = '';
  st.appliedText = '';
  st.openText = '';
  st.draft = captureInsertPoint();
  st.appliedValue = st.input ? st.input.value : '';
  st.draftSupported = true;
  st.silentSince = 0;
  st.silenceWarned = false;

  showBar();
  setBarStatus(t('voice.listening'));
  setButtonState(true);
  setInputRecordingClass(true);

  const port = ensurePort();
  if (!port) {
    setBarStatus(t('voice.failed'), 'warn');
    resetToIdle();
    setButtonState(false);
    setInputRecordingClass(false);
    return false;
  }

  try {
    await startCapture();
  } catch (err) {
    // 采集途中已被 abort（发送 / 再点一次 🎤 / 切走）：这条迟到的错误已经无处可报，
    // 继续往下走只会在已收起的录音条上闪一条「失败」
    if (st.phase !== 'starting') {
      stopCapture();
      return false;
    }
    const name = err?.name || '';
    // 侧边栏/弹窗里根本弹不出授权框（Chromium 限制），能做的只是把人送到配置页授权一次
    const denied = name === 'NotAllowedError' || name === 'SecurityError';
    if (denied) {
      setBarStatus(t('voice.micDenied'), 'warn');
      showPermButton(true);
    } else {
      setBarStatus(t('voice.failed'), 'warn');
    }
    stopCapture();
    resetToIdle();
    setButtonState(false);
    setInputRecordingClass(false);
    try { port.postMessage({ type: 'cancel' }); } catch { /* 忽略 */ }
    // 未授权时条内多一个「去授权」按钮，给用户留出点击时间；其它失败仍快速收起
    setTimeout(() => { if (st.phase === 'idle') hideBar(); }, denied ? 12000 : 4000);
    return false;
  }

  // getUserMedia 的授权框、worklet 的 fetch + addModule 都可能等上几百毫秒。这期间用户
  // 完全可能按 Enter 发送（或再点一次 🎤 关掉）—— abort 已把 phase 打回 idle，而采集恰好
  // 在这时才就绪。不复查的话，下面那句 phase = 'recording' 会把刚停掉的录音重新拉起来，
  // 表现就是「消息已经发出去了，麦克风还亮着，说一句又往空输入框里冒字」。
  // 这里必须 stopCapture()：刚申请到手的流要当场释放，否则浏览器的录音指示会一直亮。
  if (st.phase !== 'starting') {
    stopCapture();
    return false;
  }

  st.startedAt = Date.now();
  st.phase = 'recording';
  setBarStatus(t('voice.listening'));
  // 回落提示：只在本次录音的开头亮几秒，随后回到正常状态（不影响后续的静音提醒）
  if (st.deviceFellBack) {
    st.deviceFellBack = false;
    setBarStatus(t('voice.deviceFallback'), 'warn');
    setTimeout(() => {
      if (st.phase === 'recording') setBarStatus(t('voice.listening'));
    }, 4000);
  }
  startTimer();

  try {
    port.postMessage({ type: 'start', language: (st.status && st.status.language) || 'auto' });
  } catch (err) {
    logger.debug('[Voice] post start failed:', err?.message || err);
  }
  return true;
}

/**
 * 结束录音
 * @param {'stop'|'cancel'} mode
 */
function finish(mode) {
  if (st.phase !== 'recording') return;
  st.phase = 'finalizing';
  const elapsed = Date.now() - st.startedAt;
  stopCapture();
  setButtonState(false);
  setInputRecordingClass(false);

  if (mode === 'cancel') {
    try { st.port?.postMessage({ type: 'cancel' }) } catch { /* 忽略 */ }
    rollbackDraft();
    resetToIdle();
    hideBar();
    return;
  }

  if (elapsed < MIN_RECORD_MS && !st.lastText) {
    try { st.port?.postMessage({ type: 'cancel' }) } catch { /* 忽略 */ }
    rollbackDraft();
    setBarStatus(t('voice.tooShort'), 'warn');
    resetToIdle();
    setTimeout(() => { if (st.phase === 'idle') hideBar(); }, 2200);
    return;
  }

  setBarStatus(t('voice.transcribing'));
  try { st.port?.postMessage({ type: 'stop' }) } catch { /* 忽略 */ }

  // 兜底：代理端迟迟不回 final（网络挂住/模型加载慢）时收尾，不让 UI 卡在转写态
  if (st.finishWaitTimer) clearTimeout(st.finishWaitTimer);
  st.finishWaitTimer = setTimeout(() => {
    if (st.phase === 'finalizing') finalizeText(st.lastText, { fallback: true });
  }, 60_000);
}

function cancelRecording({ rollback = true } = {}) {
  if (st.phase === 'idle') return false;
  // 'starting' 期间还没发过 start：代理端没有会话可取消，发 cancel 只会多一条无主消息
  const startSent = st.phase === 'recording' || st.phase === 'finalizing';
  st.phase = 'finalizing';
  stopCapture();
  if (startSent) { try { st.port?.postMessage({ type: 'cancel' }) } catch { /* 忽略 */ } }
  if (rollback) rollbackDraft();
  resetToIdle();
  setButtonState(false);
  setInputRecordingClass(false);
  hideBar();
  return true;
}

/**
 * 定稿收尾
 *
 * 文本策略：字词取整段补正、断句取逐句（mergeRefined）。
 * 实测：两路字词差异最大 1 字（它/他），但整段会把 4 句串成 2 个句号；
 * 所以默认只缝字不动标点，差异超阈值才让整段接管。
 * @param {string} text
 * @param {{fallback?: boolean, texts?: string[]}} [opts]
 */
function finalizeText(text, opts = {}) {
  const finalText = s(text).trim();
  if (!finalText) {
    // 没识别到：撤掉草稿并提示（不弹 toast）
    rollbackDraft();
    setBarStatus(t('voice.noResult'), 'warn');
    resetToIdle();
    setTimeout(() => { if (st.phase === 'idle') hideBar(); }, 2200);
    return;
  }
  if (!st.draft) {
    // 已无草稿区间（重入 / 提前收尾）：直接插到光标处，不能把结果丢掉
    const input = st.input;
    if (input) {
      const caret = typeof input.selectionStart === 'number' ? input.selectionStart : input.value.length;
      writeInput(input.value.slice(0, caret) + finalText + input.value.slice(caret), caret + finalText.length);
    }
    setBarStatus(t('voice.done'));
    resetToIdle();
    setTimeout(() => { if (st.phase === 'idle') hideBar(); }, 1200);
    return;
  }

  const texts = Array.isArray(opts.texts)
    ? opts.texts.filter((x) => typeof x === 'string' && x.trim())
    : [];
  // 没有逐句帧（流式缺席/旧代理）：整段结果已按 texts 分好句，直接拿来当句表
  if (texts.length > 1 && !st.draft.items.some((i) => i.id !== null)) {
    st.draft.items = texts.map((tx, i) => ({ id: i + 1, text: tx, state: 'refined' }));
  }
  // 句表全空（流式草稿一次都没出过）：定稿文本整个作为唯一一句，不能丢结果
  if (st.draft.items.length === 0) {
    st.draft.items = [{ id: null, text: finalText, state: 'refined' }];
  }

  const { items, changed, takeAll } = mergeRefined(st.draft.items, finalText);
  st.draft.items = items;
  rewriteDraftBlock(true);
  if (takeAll) {
    // 整段接管：句表已合并成一条，行尾多余的空响应已消失
    logger.debug('[Voice] final text took over the whole draft');
  }
  st.draft = null;
  st.lastText = '';
  st.appliedText = '';
  st.openText = '';
  resetToIdle();
  setBarStatus(changed > 0 ? t('voice.refineCorrected', { n: changed }) : t('voice.done'));
  setTimeout(() => { if (st.phase === 'idle') hideBar(); }, changed > 0 ? 1800 : 1200);
}

/** 代理端事件分发 */
function onAgentEvent(evt) {
  if (!evt || typeof evt.type !== 'string') return;

  if (evt.type === 'ready') {
    if (evt.draft === false && st.phase === 'recording') {
      // 没有流式模型：只靠 offline 定稿，草稿区保持安静
      logger.debug('[Voice] online model missing, draft disabled');
    }
    return;
  }

  if (evt.type === 'partial') {
    if (st.phase !== 'recording' && st.phase !== 'finalizing') return;
    st.lastText = s(evt.text);
    // open = 未切句的那一段；text = 含已定稿句的全文（只有开放句该被草稿刷新）
    applyDraft(typeof evt.open === 'string' ? evt.open : st.lastText);
    return;
  }

  // endpoint 只表示「服务端把这一句定稿了」：内容已经由 sentence 帧落到句表，
  // 这里再整段写一次会把尚未精修的另一句盖成旧文本。
  if (evt.type === 'endpoint') {
    if (st.phase !== 'recording' && st.phase !== 'finalizing') return;
    return;
  }

  // sentence：同一 id 发两次 —— refined:null 是切句（草稿转正），带 refined 是精修回填
  if (evt.type === 'sentence') {
    if (st.phase !== 'recording' && st.phase !== 'finalizing') return;
    if (!st.draft || typeof evt.id !== 'number') return;
    const refined = typeof evt.refined === 'string' && evt.refined ? evt.refined : null;
    const items = Array.isArray(st.draft.items) ? st.draft.items : [];
    const openIdx = items.findIndex((i) => i.id === null);
    let nextItems = items;

    if (!refined && openIdx >= 0) {
      // 切句：开放句就地转正（id 由服务端给）；下一个 partial 会另起一条开放句
      nextItems = items.map((i, k) => (k === openIdx
        ? { id: evt.id, text: s(evt.draft) || i.text, state: 'draft' }
        : i));
      st.openText = '';
    }

    if (refined) {
      if (nextItems.some((i) => i.id === evt.id)) {
        nextItems = applySentence(nextItems, { id: evt.id, text: refined })
          .map((i) => (i.id === evt.id && i.state !== 'locked' ? { ...i, state: 'refined' } : i));
      } else if (!nextItems.some((i) => i.id === null)) {
        // 句表里没有对应句（重连/丢帧）：补一条，不能把精修结果丢掉
        nextItems = nextItems.concat([{ id: evt.id, text: refined, state: 'refined' }]);
      }
    }

    if (nextItems !== items) {
      st.draft.items = nextItems;
      rewriteDraftBlock();
    }
    if (refined && st.phase === 'recording') {
      const done = st.draft.items.filter((i) => i.id !== null && i.state === 'refined').length;
      setBarStatus(t('voice.refineListening', { n: done }));
    }
    return;
  }

  // refine：本会话的精修被永久关掉（机器跟不上），松手后的整段校正照旧
  if (evt.type === 'refine') {
    if (evt.enabled === false && (st.phase === 'recording' || st.phase === 'finalizing')) {
      setBarStatus(t('voice.refineDegraded'), 'warn');
    }
    return;
  }

  if (evt.type === 'final') {
    // 已收尾（发送 / 取消 / 超时重入）后迟到的 final 一律丢弃：
    // 否则发送完再弹一条「已完成」的空条，看起来像又录了一次
    if (st.phase !== 'recording' && st.phase !== 'finalizing') return;
    finalizeText(evt.text || st.lastText, { fallback: evt.fallback === true, texts: evt.texts });
    return;
  }

  if (evt.type === 'closed') {
    if (st.phase === 'finalizing') finalizeText(st.lastText, { fallback: true });
    return;
  }

  if (evt.type === 'error') {
    const code = evt.code || 'internal';

    // 时长上限不是失败：代理端紧接着会用整段音频跑一次 offline 定稿（质量比 partial 高）。
    // 这里只改文案、保持 finalizing 等那条 final；提前用 partial 定稿会把它丢掉，
    // 而且用户看到的会是「识别失败」而不是「到上限了」。
    if (code === 'max_duration') {
      // 面板计时器被后台节流时，agent 的上限事件就是唯一可靠信号：这里补一刀停录
      if (st.phase === 'recording') finish('stop');
      // 必须在 finish 之后设：finish 内部会先写「正在转写…」，再写就把上限文案盖掉了
      setBarStatus(t('voice.maxDuration'), 'warn');
      return;
    }

    if (code === 'busy') setBarStatus(t('voice.busy'), 'warn');
    else if (code === 'model_missing') setBarStatus(`${t('voice.modelMissing')} — ${t('voice.modelMissingHelp')}`, 'warn');
    else setBarStatus(t('voice.failed'), 'warn');

    // 硬失败：直接回滚，不留半截草稿
    stopCapture();
    if (st.phase === 'recording' || st.phase === 'finalizing') rollbackDraft();
    resetToIdle();
    setButtonState(false);
    setInputRecordingClass(false);
    if (code === 'model_missing') refreshGating();
    setTimeout(() => { if (st.phase === 'idle') hideBar(); }, 3500);
  }
}

/** 🎤 / Alt+V 的统一入口 */
export async function toggleVoiceInput() {
  if (st.phase === 'recording') {
    finish('stop');
    return true;
  }
  if (st.phase === 'starting') return false;
  if (st.phase === 'finalizing') return false;
  return startRecording();
}

/** 录音中返回 true，供 Esc 抢占「清空输入框」优先级 */
export function isVoiceRecording() {
  return st.phase === 'recording' || st.phase === 'starting' || st.phase === 'finalizing';
}

/** Esc 处理：录音中 → 取消；否则 false（交由既有逻辑） */
export function handleVoiceEscape() {
  if (!isVoiceRecording()) return false;
  return cancelRecording({ rollback: true });
}

/** 供外部在切换会话/切标签页时主动收尾 */
export function abortVoiceInput() {
  if (st.phase === 'idle') return false;
  return cancelRecording({ rollback: false });
}

// ==================== 一次性 pending 标记 ====================

async function consumePendingStart() {
  try {
    const got = await chrome.storage.session?.get?.('pendingVoiceStart');
    const at = got?.pendingVoiceStart;
    if (!at) return false;
    await chrome.storage.session.remove('pendingVoiceStart');
    if (typeof at !== 'number' || Date.now() - at > PENDING_START_TTL_MS) return false;
    return true;
  } catch {
    return false;
  }
}

// ==================== 单键快捷键（右侧 Alt / 右侧 Ctrl） ====================

/**
 * 🎤 的 tooltip 跟着配置走：开了单键就把键位一起写出来，否则用户永远发现不了
 * （配置页只负责存，提示得在真正能按的地方露出来）
 */
function applyShortcutHint() {
  if (!st.btn) return;
  const keys = ['Alt+V'];
  if (st.shortcutCfg.rightAlt) keys.push(t('voice.keyRightAlt'));
  if (st.shortcutCfg.rightCtrl) keys.push(t('voice.keyRightCtrl'));
  const label = t('voice.btnTitle', { keys: keys.join(' / ') });
  st.btn.title = label;
  st.btn.setAttribute('aria-label', label);
}

/**
 * 面板有焦点时生效的那一路。
 * 与 content script 共用 shared/voice-shortcut.js 的同一套判定（含「按住期间按了别的键就作废」），
 * 保证同一按键在面板与网页里行为一致。
 */
async function initShortcutKeys() {
  // 配置每次初始化都重读（存储是唯一真源）；trigger 只建一次，靠闭包现读 st.shortcutCfg
  st.shortcutCfg = await loadVoiceShortcutConfig();
  if (!st.shortcutTrigger) {
    st.shortcutTrigger = createSingleKeyTrigger(() => st.shortcutCfg);
  }
  applyShortcutHint();

  if (st.shortcutBound) return;
  st.shortcutBound = true;

  document.addEventListener('keydown', (e) => {
    if (st.shortcutTrigger?.onKeyDown(e) === 'cancel') {
      // Windows 上裸按 Alt 会去聚焦浏览器菜单：不拦就会把焦点从输入框抢走
      e.preventDefault();
    }
  }, true);

  document.addEventListener('keyup', (e) => {
    if (st.shortcutTrigger?.onKeyUp(e) !== 'trigger') return;
    // 门控未就绪时不吞这个键：单键是「有需求才开」的，没开语音就不该抢用户的按键
    if (!st.armed && st.phase === 'idle') return;
    e.preventDefault();
    toggleVoiceInput();
  }, true);

  // 窗口失焦时按下状态可能收不到 keyup：丢掉，避免下次松开莫名开录
  window.addEventListener('blur', () => { st.shortcutTrigger?.reset(); });

  // 配置页勾选后实时生效，不用重开面板
  watchVoiceShortcutConfig((cfg) => {
    st.shortcutCfg = cfg;
    applyShortcutHint();
  });

  // 兜底：storage 事件不应被当成唯一通道 —— 面板被隐藏、SW 刚重启等情况下
  // 事件可能没送到，表现为「勾了要重开面板才生效」。回到面板时再与存储对一次。
  const resyncShortcutConfig = async () => {
    try {
      const cfg = await loadVoiceShortcutConfig();
      if (cfg.rightAlt === st.shortcutCfg.rightAlt && cfg.rightCtrl === st.shortcutCfg.rightCtrl) return;
      st.shortcutCfg = cfg;
      applyShortcutHint();
    } catch { /* 读不到就维持现状 */ }
  };
  window.addEventListener('focus', () => { resyncShortcutConfig(); });
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resyncShortcutConfig();
  });
}

// ==================== 初始化 ====================

/**
 * @param {{adjustInputHeight?: Function}} [opts]
 */
export async function initVoiceInput(opts = {}) {
  st.input = document.getElementById('userInput');
  st.btn = document.getElementById('voiceInputBtn');
  st.bar = document.getElementById('voiceRecorderBar');
  st.wave = document.getElementById('voiceWave');
  st.timerEl = document.getElementById('voiceTimer');
  st.statusEl = document.getElementById('voiceStatusText');
  st.permBtn = document.getElementById('voicePermBtn');
  st.adjustInputHeight = typeof opts.adjustInputHeight === 'function' ? opts.adjustInputHeight : null;

  if (!st.input || !st.btn) {
    logger.debug('[Voice] input or button missing, skip init');
    return;
  }

  buildWaveBars();
  setButtonState(false);
  setBarStatus(t('voice.listening'));
  // 监听器无条件挂上：门控可能稍后才就绪（配完依赖 / 开总开关回来），那时不应该还要重开面板
  await initShortcutKeys();

  st.btn.addEventListener('click', (e) => {
    e.preventDefault();
    toggleVoiceInput();
  });

  document.getElementById('voiceCancelBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    cancelRecording({ rollback: true });
  });
  document.getElementById('voiceDoneBtn')?.addEventListener('click', (e) => {
    e.preventDefault();
    finish('stop');
  });

  // 未授权时条内的「去授权」：跳配置页的麦克风小节（侧边栏里弹不出授权框）
  st.permBtn?.addEventListener('click', (e) => {
    e.preventDefault();
    try {
      chrome.runtime.sendMessage({ type: 'OPEN_OPTIONS_PAGE', hash: 'asr' }).catch?.(() => {});
    } catch { /* background 可能未运行：忽略 */ }
    setBarStatus(t('voice.micDeniedHelp'), 'warn');
    showPermButton(false);
  });

  // 用户手改输入框 → 后续只追加，不覆盖
  st.input.addEventListener('input', () => {
    if (st.programmatic) return;
    if (st.phase === 'recording' || st.phase === 'finalizing') markDirty();
  });

  // 页面焦点下按 Alt+V：background 转发到这里
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (msg?.type === 'VOICE_TOGGLE') {
      toggleVoiceInput();
      sendResponse?.({ success: true });
      return false;
    }
    if (msg?.type === 'ASR_STATUS_CHANGED') {
      refreshGating();
      return false;
    }
    return false;
  });

  // 录音中关面板/切标签页 → 收尾（保留已定稿文本由 finish 逻辑处理）
  window.addEventListener('pagehide', () => { abortVoiceInput(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && st.phase === 'recording') abortVoiceInput();
  });

  const armed = await refreshGating();
  if (!armed) return;

  // 页面快捷键在面板未开时留下的标记：消费一次并自动开录
  const pending = await consumePendingStart();
  if (pending) {
    setTimeout(() => { toggleVoiceInput(); }, 220);
  }
}
