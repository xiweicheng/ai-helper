/**
 * 右侧功能入口轨道（side-rail）
 *
 * 背景：工作目录/收藏/消息目录/搜索/定时任务五个入口原先是各自独立的
 * position: fixed 容器，垂直位置硬编码（150px / 50%-80px / 50% / 50%+80px / 50%+160px），
 * 间距不随侧边栏高度自适应，矮窗口下入口会互相重叠。
 *
 * 方案：
 * - 统一轨道容器固定在视口右缘，上下边界与聊天区可视区实时对齐
 *   （ResizeObserver 观察 chatContainer + window resize）；
 * - 五个槽位 flex 纵向 space-evenly 布局，gap 为间距下限：窗口高度变化时
 *   间距自动均分，入口按钮永不重叠；
 * - 各功能模块通过 getSideRailSlot(name) 把容器挂入对应槽位，容器由 fixed
 *   改为 relative 定位；弹出面板仍锚定自己的入口按钮（right:26px / 垂直居中），
 *   弹框与按钮的相对位置保持不变。
 */

import { clampPanelToViewport } from './utils.js';

const SLOT_ORDER = ['workspace', 'bookmark', 'toc', 'search', 'schedule'];

// 处于打开态的浮层面板：尺寸变化后需重新夹取入视口
const OPEN_PANEL_SELECTOR = '.workspace-panel.expanded, .bookmark-panel.expanded, .message-toc-panel.expanded, .search-panel.expanded, .schedule-panel.open';

let railEl = null;
let reclampTimer = null;

/**
 * 初始化入口轨道；重复调用返回同一实例
 * @returns {HTMLElement} 轨道容器
 */
export function initSideRail() {
  if (railEl) return railEl;
  railEl = document.createElement('div');
  railEl.className = 'side-rail';
  railEl.id = 'sideRail';
  railEl.innerHTML = SLOT_ORDER
    .map(name => `<div class="side-rail-slot" data-slot="${name}"></div>`)
    .join('');
  document.body.appendChild(railEl);
  syncRailBounds();
  // 聊天区尺寸变化（窗口拉伸、输入区高度变化、标签栏显隐）→ 重新对齐边界
  const chatContainer = document.getElementById('chatContainer');
  if (chatContainer && typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(syncRailBounds).observe(chatContainer);
  }
  window.addEventListener('resize', syncRailBounds);
  return railEl;
}

/**
 * 获取指定功能的挂载槽位（workspace/bookmark/toc/search/schedule）
 * @param {string} name - 槽位名
 * @returns {HTMLElement} 槽位元素
 */
export function getSideRailSlot(name) {
  const rail = railEl || initSideRail();
  return rail.querySelector(`.side-rail-slot[data-slot="${name}"]`);
}

/** 轨道上下边界与聊天区可视区对齐 */
function syncRailBounds() {
  if (!railEl) return;
  const chatContainer = document.getElementById('chatContainer');
  if (!chatContainer) return;
  const rect = chatContainer.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  railEl.style.top = `${Math.max(0, Math.round(rect.top))}px`;
  railEl.style.bottom = `${Math.max(0, Math.round(viewportHeight - rect.bottom))}px`;
  scheduleReclampOpenPanels();
}

/** 尺寸变化停稳后重新夹取打开中的面板，避免 resize 过程中逐帧抖动 */
function scheduleReclampOpenPanels() {
  if (reclampTimer) clearTimeout(reclampTimer);
  reclampTimer = setTimeout(() => {
    reclampTimer = null;
    document.querySelectorAll(OPEN_PANEL_SELECTOR).forEach(clampPanelToViewport);
  }, 120);
}
