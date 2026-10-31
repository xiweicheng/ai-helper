// options/loop-timeout-slider.js - 「整体循环超时」档位滑杆
//
// 为什么用档位吸附而不是线性滑杆：范围 10min–24h 跨两个数量级，线性拖动时
// 每像素约 3 分钟，「拖到整 4 小时」得瞄准；档位把用户真正会选的 12 个值固定下来，
// 拖动与键盘都只会落在可解释的值上（与 ctx-popover.js 的上下文窗口滑杆同一套交互）。
//
// 交互约定：input（拖动中）→ 只更新读数预览；change（松手 / 键盘步进）→ onCommit 落盘。
// 纯函数全部导出，可在 Node 直接单测（与 ctx-popover.js 同约定）。

import { t } from '../shared/i18n.js';

// 档位（分钟）。下限 10min 与工具执行超时上限对齐——低于它的配置连一次工具调用都跑不完
// （工具超时 10min + API 超时 5min 才是完整的一轮）。上限 24h 与 background/constants.js 一致。
export const LOOP_TIMEOUT_LADDER = [10, 15, 30, 60, 90, 120, 180, 240, 360, 480, 720, 1440];

export const LOOP_TIMEOUT_MIN_MINUTES = LOOP_TIMEOUT_LADDER[0];
export const LOOP_TIMEOUT_MAX_MINUTES = LOOP_TIMEOUT_LADDER[LOOP_TIMEOUT_LADDER.length - 1];
export const LOOP_TIMEOUT_MAX_INDEX = LOOP_TIMEOUT_LADDER.length - 1;

/**
 * 找最接近 minutes 的档位索引（越界夹取到首尾档位）
 * @param {number} minutes
 * @returns {number}
 */
export function nearestLadderIndex(minutes) {
  const n = Number(minutes) || 0;
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < LOOP_TIMEOUT_LADDER.length; i++) {
    const dist = Math.abs(LOOP_TIMEOUT_LADDER[i] - n);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * 档位索引 → 分钟（越界夹取到首尾档位）
 * @param {number} index
 * @returns {number}
 */
export function indexToMinutes(index) {
  const i = Math.min(Math.max(Math.round(Number(index) || 0), 0), LOOP_TIMEOUT_MAX_INDEX);
  return LOOP_TIMEOUT_LADDER[i];
}

/**
 * 分钟 → 小时/分钟拆分（语言无关，便于单测与复用）
 * @param {number} totalMinutes
 * @returns {{hours: number, minutes: number}}
 */
export function splitLoopTimeout(totalMinutes) {
  const total = Math.max(1, Math.round(Number(totalMinutes) || 0));
  return { hours: Math.floor(total / 60), minutes: total % 60 };
}

/**
 * 读数文案：<60min → 「N 分钟」；整小时 → 「N 小时」；否则 → 「N 小时 M 分钟」
 * @param {number} totalMinutes
 * @returns {string}
 */
export function formatLoopTimeout(totalMinutes) {
  const { hours, minutes } = splitLoopTimeout(totalMinutes);
  if (hours === 0) return t('react.durationMinutes', { n: minutes });
  if (minutes === 0) return t('react.durationHours', { n: hours });
  return t('react.durationHoursMinutes', { hours, minutes });
}

// 单例元素 + 一次性绑定标记（loadConfig 可能被重复调用，重复 addEventListener 会重复落盘）
let attached = false;
let sliderEl = null;
let valueEl = null;
let scaleDots = [];

// 元素与刻度点只建一次：档位在索引空间等距，所以刻度点用 flex 均分即可与 thumb 对齐
function ensureEls() {
  if (!sliderEl) sliderEl = document.getElementById('reactLoopTimeout');
  if (!sliderEl) return;
  if (!valueEl) valueEl = document.getElementById('reactLoopTimeoutValue');
  if (scaleDots.length) return;
  const scaleEl = document.getElementById('reactLoopTimeoutScale');
  if (!scaleEl) return;
  for (let i = 0; i < LOOP_TIMEOUT_LADDER.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'loop-timeout-scale-dot';
    scaleEl.appendChild(dot);
  }
  scaleDots = [...scaleEl.children];
}

// 把档位索引画到滑杆上：位置、填充进度、读数、aria-valuetext、当前档位高亮
function paintIndex(index) {
  const i = Math.min(Math.max(Math.round(Number(index) || 0), 0), LOOP_TIMEOUT_MAX_INDEX);
  const landed = indexToMinutes(i);
  const text = formatLoopTimeout(landed);
  sliderEl.value = String(i);
  sliderEl.dataset.minutes = String(landed);
  sliderEl.setAttribute('aria-valuetext', text);
  if (valueEl) valueEl.textContent = text;
  const pct = (i / LOOP_TIMEOUT_MAX_INDEX * 100).toFixed(1) + '%';
  sliderEl.style.setProperty('--loop-fill', pct);
  scaleDots.forEach((dot, di) => dot.classList.toggle('is-active', di === i));
}

/**
 * 按存储值渲染滑杆（就近吸附显示，不改写 storage）
 * @param {number} minutes
 */
export function renderLoopTimeoutSlider(minutes) {
  ensureEls();
  if (!sliderEl) return;
  paintIndex(nearestLadderIndex(minutes));
}

/**
 * 语言热切换后重绘读数与 aria-valuetext：只按当前档位重算文案，不读存储、不改值。
 * applyI18n 只刷带 data-i18n 的静态标签，够不到 JS 拼的读数节点（output / aria），
 * 不重绘就会停在旧语言（标签变英文、读数仍写「4 小时」），须由 index.js 的语言订阅调用。
 */
export function repaintLoopTimeout() {
  if (!sliderEl) return;
  paintIndex(sliderEl.value);
}

/**
 * 绑定滑杆交互（幂等）。松手 / 键盘步进即提交，与上下文窗口滑杆一致。
 * 注意：模块级 attached 只绑定一次，因此仅首个 onCommit 生效——本滑杆唯一调用方
 * 是设置页 loadConfig，两处传的是同一逻辑；若将来新增第二个入口需带不同 onCommit，
 * 必须改为可重绑或按元素实例存回调，否则后传入的回调会被静默忽略。
 * @param {{onCommit?: (minutes:number)=>void}} [options]
 */
export function attachLoopTimeoutSlider({ onCommit } = {}) {
  ensureEls();
  if (!sliderEl) return;
  if (attached) return;
  attached = true;

  // 拖动中只预览读数：避免每移动一像素就写一次 storage
  sliderEl.addEventListener('input', () => paintIndex(sliderEl.value));

  // 松手 / 键盘步进 → 立即生效（用户已确认「松手即落盘」，不必再点保存）
  sliderEl.addEventListener('change', () => {
    onCommit?.(indexToMinutes(sliderEl.value));
  });
}
