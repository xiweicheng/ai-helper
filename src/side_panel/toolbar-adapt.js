// side_panel/toolbar-adapt.js - 输入底行溢出探测自适应
//
// 空间不足时逐级降级以避免元素被裁剪：
//   ① temp-collapsed    温度数字隐藏（仅留图标）
//   ② agent-collapsed   助手名折叠为 emoji
//   ③ switches-icon     记忆/工具/划词 图标化
//   ④ selection-in-menu 划词开关整组移入 "+" 菜单（兜底）
// 采用实测而非固定断点，适配英文文案 / 自定义长名的多语言场景。
//
// 三个关键约束：
//   1) 测量必须排除打开的绝对定位浮层（助手选择器 / 模型设置 / "+" 菜单等）——
//      浮层按设计可探出底行边界，计入 scrollWidth 会被误判为空间不足而误折叠；
//   2) 临时隐藏再恢复浮层会让其 CSS 关键帧入场动画（dropdownFadeIn）从头
//      重播：读取 scrollWidth 强制样式重算时 display:none 已生效（动画被取消），
//      恢复后动画从第 0 帧重新计时，下一帧渲染出近全透明状态（弹框“闪一下”）。
//      因此恢复显示后立即把重播动画快进到终态，同一帧内消化，用户不可见；
//   3) ④ 级把划词开关组真实移入 "+" 菜单（DOM 移动）会触发 MutationObserver——
//      必须过滤“划词组自身被移动”的 mutation，否则每次移动都触发重测 → 再移动，
//      形成死循环。事件监听绑定在元素自身（id 不变），DOM 移动不会丢失监听。

let toolbarAdaptRafId = 0;

/**
 * 判定节点是否位于底行内的绝对定位浮层中
 * （自身或任一祖先 computed position 为 absolute；底行自身不算浮层）
 */
export function isInsideOverlay(node, bar) {
  const start = node && node.nodeType === 1 ? node : (node ? node.parentElement : null);
  for (let el = start; el && el !== bar; el = el.parentElement) {
    if (getComputedStyle(el).position === 'absolute') return true;
  }
  return false;
}

/** 收集底行内可见的绝对定位浮层（测量前临时隐藏，恢复后需快进重播动画） */
function collectOverlays(bar) {
  const overlays = [];
  bar.querySelectorAll('*').forEach((el) => {
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

/** ④ 级兜底：划词组移入 "+" 菜单开关区 */
function moveSelectionGroupToMenu() {
  const group = document.getElementById('selectionToggleGroup');
  const target = document.getElementById('inputAddMenuSwitches');
  if (group && target && group.parentElement !== target) target.appendChild(group);
}

/** 恢复完整布局：划词组归位底行左组（appendChild 到末尾与原始顺序一致） */
function restoreSelectionGroup() {
  const group = document.getElementById('selectionToggleGroup');
  const left = document.querySelector('.input-bottom-left');
  if (group && left && group.parentElement !== left) left.appendChild(group);
}

/** 输入底行溢出探测：空间不足时逐级降级以避免元素被裁剪 */
export function adaptInputToolbar() {
  const bar = document.querySelector('.input-bottom-row');
  const container = bar?.closest('.input-container') || null;
  if (!bar || !container) return;

  // 测量期间禁用容器内过渡：.memory-limit-label / .tool-config-btn 等带
  // transition:all，会过渡 border-width / padding 等布局属性——“移除降级类→
  // 同帧读 scrollWidth”读到的是过渡起点值（仍接近降级态），空间恢复时会被
  // 误判为“无需降级”，而布局稍后展开为溢出且不再自愈。测量全同步
  // （scrollWidth 强制 reflow），同一帧内添加与移除，浏览器不渲染中间态。
  container.classList.add('measuring');
  try {
    adaptMeasured(bar, container);
  } finally {
    container.classList.remove('measuring');
  }
}

/** 测量主体：所有布局读取都发生在 container.measuring 生效期间 */
function adaptMeasured(bar, container) {
  // 先恢复完整状态再测量，保证空间恢复时能还原。此步必须在 collectOverlays
  // 之前：③ 级降级态下 .memory-limit-label 是探出底行边界的绝对定位角标
  // （可见）——若此时收集，它会被误当浮层内联 display:none 隐藏；随后清理
  // 降级类本应让它回到文档流参与测量，却因仍为 display:none 缺席，测量宽度
  // 被低估（实测 326 vs 345），空间恢复时被误判“无需降级”而清空全部降级类，
  // 布局展开后溢出且不再自愈。清理后角标回到 static 流内，collectOverlays
  // 只收集真正的浮层（打开的助手选择器 / 模型设置 / “+” 菜单等）。
  container.classList.remove('temp-collapsed', 'agent-collapsed', 'switches-icon', 'selection-in-menu');
  restoreSelectionGroup();

  const overlays = collectOverlays(bar);
  const overlayDisplays = overlays.map((el) => el.style.display);
  overlays.forEach((el) => { el.style.display = 'none'; });
  const restoreOverlays = () => {
    overlays.forEach((el, i) => { el.style.display = overlayDisplays[i]; });
    finishReplayedAnimations(overlays);
  };

  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('temp-collapsed');
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('agent-collapsed');
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('switches-icon');
  if (bar.scrollWidth <= bar.clientWidth) { restoreOverlays(); return; }
  container.classList.add('selection-in-menu');
  moveSelectionGroupToMenu();
  restoreOverlays();
}

/** 初始化底行自适应：窗口缩放 / 底行内可见文字变化（语言切换、助手名与记忆标签更新）后重测 */
export function initToolbarAdaptive() {
  adaptInputToolbar();
  window.addEventListener('resize', scheduleToolbarAdapt);
  const bar = document.querySelector('.input-bottom-row');
  if (bar && typeof MutationObserver !== 'undefined') {
    new MutationObserver((mutations) => {
      // 浮层内部变更不影响底行宽度（浮层为绝对定位覆盖层），且重测的隐藏-恢复
      // 会打断浮层动画（切厂商/模型更新列表文本即此场景），故直接跳过；
      // ④ 级移动划词组是适配器自身的职责（移动后随即重新测量），同样跳过；
      // 仅底行可见布局元素的变化才触发重测。
      const selectionGroup = document.getElementById('selectionToggleGroup');
      const isSelectionGroupMove = (m) =>
        !!selectionGroup
        && ([...m.addedNodes, ...m.removedNodes].includes(selectionGroup));
      if (mutations.some((m) => !isInsideOverlay(m.target, bar) && !isSelectionGroupMove(m))) {
        scheduleToolbarAdapt();
      }
    }).observe(bar, { subtree: true, childList: true, characterData: true });
  }
}
