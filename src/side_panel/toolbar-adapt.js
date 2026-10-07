// side_panel/toolbar-adapt.js - 输入工具栏溢出探测自适应
//
// 空间不足时逐级降级以避免元素被裁剪：① 隐藏温度数字 ② 折叠助手名称为 emoji
// （固定断点无法适配英文文案 / 自定义长名的多语言场景）。
//
// 两个关键约束：
//   1) 测量必须排除打开的绝对定位浮层（助手选择器 / 模型设置等）——浮层按设计可
//      探出工具栏边界，计入 scrollWidth 会被误判为布局空间不足而误折叠文案；
//   2) 临时隐藏再恢复浮层会让其 CSS 关键帧入场动画（dropdownFadeIn）从头重播：
//      读取 scrollWidth 强制样式重算时 display:none 已生效（动画被取消），
//      恢复后动画从第 0 帧重新计时，下一帧渲染出近全透明状态（弹框"闪一下"）。
//      因此恢复显示后立即把重播动画快进到终态，同一帧内消化，用户不可见。

let toolbarAdaptRafId = 0;

/**
 * 判定节点是否位于工具栏内的绝对定位浮层中
 * （自身或任一祖先 computed position 为 absolute；toolbar 自身不算浮层）
 */
export function isInsideOverlay(node, toolbar) {
  const start = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
  for (let el = start; el && el !== toolbar; el = el.parentElement) {
    if (getComputedStyle(el).position === 'absolute') return true;
  }
  return false;
}

/** 收集工具栏内可见的绝对定位浮层（测量前临时隐藏，恢复后需快进重播动画） */
function collectOverlays(toolbar) {
  const overlays = [];
  toolbar.querySelectorAll('*').forEach((el) => {
    if (getComputedStyle(el).position === 'absolute' && el.getClientRects().length > 0) {
      overlays.push(el);
    }
  });
  return overlays;
}

/** display 恢复显示后，CSS 关键帧动画会从头重播：立即快进到终态避免闪帧 */
export function finishReplayedAnimations(elements) {
  elements.forEach((el) => {
    (el.getAnimations?.() || []).forEach((a) => {
      if (a.playState !== 'idle') a.finish?.();
    });
  });
}

/** rAF 节流：合并 resize 拖动与 DOM 批量变更期间的高频触发 */
function scheduleToolbarAdapt() {
  if (toolbarAdaptRafId) return;
  toolbarAdaptRafId = requestAnimationFrame(() => {
    toolbarAdaptRafId = 0;
    adaptInputToolbar();
  });
}

/** 输入工具栏溢出探测：空间不足时逐级降级以避免元素被裁剪 */
export function adaptInputToolbar() {
  const toolbar = document.querySelector('.input-toolbar');
  const container = toolbar?.closest('.input-container') || null;
  if (!toolbar || !container) return;

  const overlays = collectOverlays(toolbar);
  const overlayDisplays = overlays.map((el) => el.style.display);
  overlays.forEach((el) => { el.style.display = 'none'; });
  const restoreOverlays = () => {
    overlays.forEach((el, i) => { el.style.display = overlayDisplays[i]; });
    finishReplayedAnimations(overlays);
  };

  // 先恢复完整状态再测量，保证空间恢复时能还原
  container.classList.remove('temp-collapsed', 'agent-collapsed');
  if (toolbar.scrollWidth <= toolbar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('temp-collapsed');
  if (toolbar.scrollWidth <= toolbar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('agent-collapsed');
  restoreOverlays();
}

/** 初始化工具栏自适应：窗口缩放 / 工具栏内可见文字变化（语言切换、助手名与记忆标签更新）后重测 */
export function initToolbarAdaptive() {
  adaptInputToolbar();
  window.addEventListener('resize', scheduleToolbarAdapt);
  const toolbar = document.querySelector('.input-toolbar');
  if (toolbar && typeof MutationObserver !== 'undefined') {
    new MutationObserver((mutations) => {
      // 浮层内部变更不影响工具栏宽度（浮层为绝对定位覆盖层），且重测的隐藏-恢复
      // 会打断浮层动画（切厂商/模型更新列表文本即此场景），故直接跳过；
      // 仅工具栏可见布局元素的变化才触发重测。
      if (mutations.some((m) => !isInsideOverlay(m.target, toolbar))) {
        scheduleToolbarAdapt();
      }
    }).observe(toolbar, { subtree: true, childList: true, characterData: true });
  }
}
