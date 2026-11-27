// side_panel/panel-fullscreen.js - 侧边浮层的全屏切换
//
// 搜索 / 收藏 / 目录 / 工作目录 / 定时任务共用同一套语义：
// - 全屏用 fixed 铺满侧边面板视口（样式见 .panel-fullscreen），退出后恢复各面板原有浮层定位；
// - 工作目录嵌入模式下全屏只是覆盖，不改变模式，退出自然回到分栏；
// - 浮层关闭时必须退出全屏，避免下次打开还停在全屏态。

import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  panelFs: {
    enter: '全屏',
    exit: '退出全屏',
  },
});

registerTranslations('en', {
  panelFs: {
    enter: 'Fullscreen',
    exit: 'Exit fullscreen',
  },
});

export const FULLSCREEN_CLASS = 'panel-fullscreen';

const ICON_EXPAND = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M16 3h3a2 2 0 0 1 2 2v3"/><path d="M8 21H5a2 2 0 0 1-2-2v-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/></svg>';
const ICON_COLLAPSE = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 8h3a2 2 0 0 0 2-2V3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M21 16h-3a2 2 0 0 0-2 2v3"/></svg>';

// 用元素本身作 key：面板都是单例，关闭后也不必手动清理
const fullscreenPanels = new WeakSet();

export function isPanelFullscreen(panelEl) {
  return !!panelEl && fullscreenPanels.has(panelEl);
}

export function setPanelFullscreen(panelEl, on) {
  if (!panelEl) return;
  if (on) fullscreenPanels.add(panelEl);
  else fullscreenPanels.delete(panelEl);
  // 切换瞬间禁用过渡：浮层的 top/transform 与全屏的 inset 同时参与过渡时，
  // 两者叠加会先冲过头再回落（表现为「回弹一下」）。强制一次布局后再恢复过渡。
  panelEl.classList.add('panel-fs-no-anim');
  panelEl.classList.toggle(FULLSCREEN_CLASS, !!on);
  void panelEl.offsetWidth;
  requestAnimationFrame(() => panelEl.classList.remove('panel-fs-no-anim'));
}

export function exitPanelFullscreen(panelEl) {
  setPanelFullscreen(panelEl, false);
}

/** 切换图标与文案；语言切换后由面板再调一次即可对齐 */
export function syncFullscreenButton(btn, on) {
  if (!btn) return;
  const label = t(on ? 'panelFs.exit' : 'panelFs.enter');
  btn.innerHTML = on ? ICON_COLLAPSE : ICON_EXPAND;
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(!!on));
}

/**
 * 创建一个与面板头部其它图标按钮同风格的全屏按钮
 * @param {string} [className] 复用目标面板已有的按钮样式类
 */
export function createFullscreenButton(className = '') {
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.className = ['panel-fullscreen-btn', className].filter(Boolean).join(' ');
  btn.innerHTML = ICON_EXPAND;
  return btn;
}

/**
 * 绑定全屏切换：只负责面板形态，退出时机由各面板的打开/关闭函数自己保证
 * @param {HTMLButtonElement} btn
 * @param {HTMLElement} panelEl
 * @param {{ onToggle?: (on: boolean) => void }} [options]
 * @returns {() => void} 重新同步按钮状态（语言切换时调用）
 */
export function bindFullscreenButton(btn, panelEl, { onToggle } = {}) {
  if (!btn || !panelEl) return () => {};
  const sync = () => syncFullscreenButton(btn, isPanelFullscreen(panelEl));
  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    const next = !isPanelFullscreen(panelEl);
    setPanelFullscreen(panelEl, next);
    sync();
    if (onToggle) onToggle(next);
  });
  sync();
  return sync;
}
