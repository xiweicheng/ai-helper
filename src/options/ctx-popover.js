// options/ctx-popover.js - 模型上下文窗口滑杆浮层（单例）
//
// 浮层挂到 document.body 并以 position:fixed 定位：
// 模型下拉容器（.model-dropdown）限高 240px + overflow-y:auto，内部浮层会被裁切。
//
// 交互约定（由 index.js 接线）：
// - 拖拽 input 事件 → onPreview(tokens)：实时预览徽标，不持久化
// - change 事件（松手/键盘步进）→ onCommit(tokens)：持久化
// - 点击「自动」→ onReset()：清除该模型的自定义值（0 = 自动推断）

import { t } from '../shared/i18n.js';
import { inferContextWindow, formatContextWindow } from '../shared/token-counter.js';

// 标准档位（1000 进制，与「128K=128000, 1M=1000000」文案约定一致）
export const CTX_LADDER = [
  1000, 2000, 4000, 8000, 16000, 32000,
  64000, 128000, 200000, 256000, 512000, 1000000,
];

const MAX_INDEX = CTX_LADDER.length - 1;

/**
 * 找最接近 tokens 的档位索引（越界夹取到首尾档位）
 * @param {number} tokens
 * @returns {number}
 */
export function tokensToIndex(tokens) {
  const n = Number(tokens) || 0;
  let bestIndex = 0;
  let bestDist = Infinity;
  for (let i = 0; i < CTX_LADDER.length; i++) {
    const dist = Math.abs(CTX_LADDER[i] - n);
    if (dist < bestDist) {
      bestDist = dist;
      bestIndex = i;
    }
  }
  return bestIndex;
}

/**
 * 档位索引 → tokens（越界夹取到首尾档位）
 * @param {number} index
 * @returns {number}
 */
export function indexToTokens(index) {
  const i = Math.min(Math.max(Math.round(Number(index) || 0), 0), MAX_INDEX);
  return CTX_LADDER[i];
}

// 单例元素与状态
let popoverEl = null;
let sliderEl = null;
let valueEl = null;
let autoTagEl = null;
let autoBtnEl = null;
let scaleDots = [];
let state = null;

// 自动推断值：统一复用 token-counter 的 inferContextWindow（与 getContextWindow 内置映射口径一致）

// 构建浮层 DOM（每次打开重建，关闭时整体移除）
function buildPopoverEl() {
  popoverEl = document.createElement('div');
  popoverEl.className = 'ctx-popover';
  popoverEl.setAttribute('role', 'dialog');
  popoverEl.setAttribute('aria-label', t('settings.ctxSliderIconTitle'));
  popoverEl.innerHTML = `
    <div class="ctx-popover-title-row">
      <span class="ctx-popover-title"></span>
      <button type="button" class="ctx-popover-auto-btn"></button>
    </div>
    <div class="ctx-popover-value-row">
      <span class="ctx-popover-value"></span>
      <span class="ctx-popover-auto-tag"></span>
    </div>
    <input type="range" class="ctx-popover-slider" min="0" max="${MAX_INDEX}" step="1">
    <div class="ctx-popover-scale" aria-hidden="true"></div>
    <div class="ctx-popover-scale-labels" aria-hidden="true">
      <span class="ctx-popover-scale-start"></span>
      <span class="ctx-popover-scale-end"></span>
    </div>
  `;

  sliderEl = popoverEl.querySelector('.ctx-popover-slider');
  valueEl = popoverEl.querySelector('.ctx-popover-value');
  autoTagEl = popoverEl.querySelector('.ctx-popover-auto-tag');
  autoBtnEl = popoverEl.querySelector('.ctx-popover-auto-btn');

  // 刻度：12 个点与档位一一对应（对齐由 CSS 的 thumb 半径内缩保证），起止文字取首末档位
  const scaleEl = popoverEl.querySelector('.ctx-popover-scale');
  for (let i = 0; i < CTX_LADDER.length; i++) {
    const dot = document.createElement('span');
    dot.className = 'ctx-popover-scale-dot';
    scaleEl.appendChild(dot);
  }
  scaleDots = [...scaleEl.children];
  popoverEl.querySelector('.ctx-popover-scale-start').textContent = formatContextWindow(CTX_LADDER[0]);
  popoverEl.querySelector('.ctx-popover-scale-end').textContent = formatContextWindow(CTX_LADDER[MAX_INDEX]);

  // 按钮文案与状态标签区分（「恢复自动」 vs 「自动」），避免两处同名造成“同一控件跳位”的误读
  autoBtnEl.textContent = t('settings.ctxSliderResetAuto');
  autoBtnEl.title = t('settings.ctxSliderAutoTitle');
  autoTagEl.textContent = t('settings.ctxSliderAuto');

  // 拖拽会话：pointerdown 记录起点（未松手期间只预览不落存储，收口逻辑见 pointerup）
  sliderEl.addEventListener('pointerdown', () => {
    if (!state) return;
    const originTokens = parseInt(state.optionEl.dataset.contextWindow, 10) || 0;
    state.drag = {
      originTokens,
      originIndex: tokensToIndex(originTokens || inferContextWindow(state.optionEl.dataset.value)),
      moved: false,
    };
  });

  // 拖拽实时预览：只更新徽标，不写存储
  sliderEl.addEventListener('input', () => {
    if (!state) return;
    if (state.drag) state.drag.moved = true;
    const tokens = indexToTokens(sliderEl.value);
    renderValue(tokens, false);
    state.callbacks.onPreview?.(tokens);
  });

  // 松手 / 键盘步进后提交并持久化
  sliderEl.addEventListener('change', () => {
    if (!state) return;
    state.callbacks.onCommit?.(indexToTokens(sliderEl.value));
  });

  // 恢复自动推断
  autoBtnEl.addEventListener('click', () => {
    if (!state) return;
    state.callbacks.onReset?.();
    renderValue(inferContextWindow(state.optionEl.dataset.value), true);
  });
}

// 值区渲染：显式值用品牌色；自动态灰色 + 「自动」标签（滑杆同步到最近档位并填充进度）
function renderValue(tokens, isAuto) {
  const index = tokensToIndex(tokens);
  sliderEl.value = String(index);
  valueEl.textContent = formatContextWindow(tokens);
  valueEl.classList.toggle('is-auto', isAuto);
  autoTagEl.style.display = isAuto ? '' : 'none';
  autoBtnEl.style.display = isAuto ? 'none' : '';
  // 当前档位刻度点高亮
  scaleDots.forEach((dot, i) => dot.classList.toggle('is-active', i === index));
  const pct = (index / MAX_INDEX * 100).toFixed(1) + '%';
  sliderEl.style.setProperty('--ctx-fill', pct);
}

// 回滚未松手拖拽的预览副作用（中断/关闭时调用）：恢复 dataset/徽标与浮层显示，不改存储
function revertDragPreview(drag) {
  if (!drag || !drag.moved || !state) return;
  state.callbacks.onPreview?.(drag.originTokens);
  if (drag.originTokens > 0) {
    renderValue(drag.originTokens, false);
  } else {
    renderValue(inferContextWindow(state.optionEl.dataset.value), true);
  }
}

// 定位：水平右缘对齐图标并夹取在视口内；垂直默认下方，空间不足翻转上方
function positionPopover() {
  const rect = state.anchorBtn.getBoundingClientRect();
  const popRect = popoverEl.getBoundingClientRect();
  const gap = 6;
  const margin = 8;

  let left = rect.right - popRect.width;
  left = Math.max(margin, Math.min(left, window.innerWidth - popRect.width - margin));

  let top = rect.bottom + gap;
  if (top + popRect.height > window.innerHeight - margin) {
    const above = rect.top - gap - popRect.height;
    top = above >= margin ? above : Math.max(margin, window.innerHeight - popRect.height - margin);
  }

  popoverEl.style.left = `${Math.round(left)}px`;
  popoverEl.style.top = `${Math.round(top)}px`;
}

/**
 * 打开上下文窗口滑杆浮层（再次点击同一锚点 = 收起）
 * @param {HTMLElement} anchorBtn - 触发图标（.ctx-set-btn）
 * @param {HTMLElement} optionEl - 对应的模型选项（.model-option）
 * @param {{onPreview?:Function,onCommit?:Function,onReset?:Function}} [callbacks]
 */
export function openCtxPopover(anchorBtn, optionEl, callbacks = {}) {
  if (!anchorBtn || !optionEl) return;
  if (state && state.anchorBtn === anchorBtn) {
    closeCtxPopover();
    return;
  }
  closeCtxPopover();

  const tokens = parseInt(optionEl.dataset.contextWindow, 10) || 0;
  buildPopoverEl();
  state = { anchorBtn, optionEl, callbacks };

  popoverEl.querySelector('.ctx-popover-title').textContent = optionEl.dataset.value || '';
  if (tokens > 0) {
    renderValue(tokens, false);
  } else {
    renderValue(inferContextWindow(optionEl.dataset.value), true);
  }

  document.body.appendChild(popoverEl);
  positionPopover();
  // preventScroll：聚焦滑杆不影响页面/列表滚动，避免误触 scroll 关闭
  sliderEl.focus({ preventScroll: true });

  // 关闭时机监听：
  // - click 用捕获阶段，不受各元素 stopPropagation 影响（如输入框的点击拦截）
  // - scroll 用捕获阶段，覆盖下拉列表滚动与页面滚动
  state.onDocClick = (e) => {
    if (popoverEl.contains(e.target) || anchorBtn.contains(e.target)) return;
    closeCtxPopover();
  };
  state.onKeyDown = (e) => {
    if (e.key === 'Escape') closeCtxPopover();
  };
  state.onScroll = () => closeCtxPopover();
  state.onResize = () => closeCtxPopover();
  // pointerup 收口拖拽会话：Chrome 在「终点档位 == 起点档位」时不派发 change，
  // 需在此补提交固化；终点不同则交给随后的 change 提交（避免重复）
  state.onDocPointerUp = () => {
    if (!state?.drag) return;
    const drag = state.drag;
    state.drag = null;
    if (!drag.moved) return;
    const currentIndex = Number(sliderEl.value);
    if (currentIndex === drag.originIndex) {
      state.callbacks.onCommit?.(indexToTokens(currentIndex));
    }
  };
  // 指针被系统中断（如触控被接管）：视为操作未完成，回滚预览不提交
  state.onDocPointerCancel = () => {
    if (!state?.drag) return;
    const drag = state.drag;
    state.drag = null;
    revertDragPreview(drag);
  };

  document.addEventListener('click', state.onDocClick, true);
  document.addEventListener('keydown', state.onKeyDown);
  document.addEventListener('scroll', state.onScroll, true);
  document.addEventListener('pointerup', state.onDocPointerUp, true);
  document.addEventListener('pointercancel', state.onDocPointerCancel, true);
  window.addEventListener('resize', state.onResize);
}

/**
 * 关闭浮层（幂等）
 *
 * 若存在未收口的拖拽（未松手），视为操作未完成：回滚预览副作用且不提交。
 * remove() 会使拖拽中的 range 同步派发 change，故先置 state = null，
 * 让事件处理器中的 `if (!state) return` 拦截，避免以中途值误提交。
 */
export function closeCtxPopover() {
  if (!state) return;
  const s = state;
  revertDragPreview(s.drag);
  state = null;
  document.removeEventListener('click', s.onDocClick, true);
  document.removeEventListener('keydown', s.onKeyDown);
  document.removeEventListener('scroll', s.onScroll, true);
  document.removeEventListener('pointerup', s.onDocPointerUp, true);
  document.removeEventListener('pointercancel', s.onDocPointerCancel, true);
  window.removeEventListener('resize', s.onResize);
  popoverEl?.remove();
  popoverEl = null;
  sliderEl = null;
  valueEl = null;
  autoTagEl = null;
  autoBtnEl = null;
  scaleDots = [];
}

/**
 * 判断事件目标是否位于浮层内部（供下拉的文档级关闭逻辑排除浮层点击）
 * @param {EventTarget|null} el
 * @returns {boolean}
 */
export function containsCtxPopoverEl(el) {
  return !!(popoverEl && el && popoverEl.contains(el));
}
