// side_panel/input-add-menu.js - 底行 "+" 添加菜单
//
// 职责：
//   1) 开合菜单：点击 "+" 切换；点击菜单项或菜单外部关闭；
//   2) "+" 蓝点：菜单开关区内存在已激活开关时显示（划词 ④ 级降级移入的场景）。
//
// 菜单项按钮（提示词/截图/附件）的业务事件监听分别绑定在 index.js / 各模块
// （id 不变），本模块不重复绑定业务行为；菜单项 handler 会 stopPropagation，
// 因此菜单项点击关闭使用 capture 阶段监听。

export function initInputAddMenu() {
  const addBtn = document.getElementById('inputAddBtn');
  const menu = document.getElementById('inputAddMenu');
  if (!addBtn || !menu) return;
  const wrapper = addBtn.closest('.input-add-wrapper');

  const setOpen = (open) => {
    menu.style.display = open ? '' : 'none';
  };
  const isOpen = () => menu.style.display !== 'none';

  // 点击 "+" 切换开合
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    setOpen(!isOpen());
  });

  // 点击菜单项后自动关闭：capture 阶段先于按钮自身的 handler（其会
  // stopPropagation 阻断冒泡），保证业务逻辑执行的同时菜单收起
  menu.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.input-add-item')) setOpen(false);
  }, true);

  // 点击菜单外部关闭
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    if (wrapper && wrapper.contains(e.target)) return;
    setOpen(false);
  });

  // "+" 蓝点：开关区内有开启的开关时显示（当前仅划词会移入）
  const switches = document.getElementById('inputAddMenuSwitches');
  const syncDot = () => {
    const checkbox = switches?.querySelector('input[type="checkbox"]');
    addBtn.classList.toggle('has-active-switch', !!(checkbox && checkbox.checked));
  };
  if (switches) {
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncDot).observe(switches, { subtree: true, childList: true });
    }
    // 开关切换（在菜单内操作划词）时同步蓝点
    switches.addEventListener('change', syncDot);
  }
  syncDot();
}
