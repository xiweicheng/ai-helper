// side_panel/section-select.js - 模型设置弹窗内的内嵌下拉（厂商/模型选择行）
//
// 弹窗高度必须恒定：选择行展开的是绝对定位浮层（覆盖在下文之上），不占文档流高度。
// 交互规则：
//   - 点击选择行：展开/收起对应浮层（同时至多一个展开）
//   - 点击浮层内选项：由调用方主动调用 closeAllSectionSelects() 收起（选中即收起）
//   - 点击行/浮层之外的任意区域：收起
// 实现为文档级事件委托 + 单例 openList，兼容列表 innerHTML 重建（无需重新绑定）。

let openList = null;

/**
 * 收起当前展开的浮层
 */
export function closeAllSectionSelects() {
  if (!openList) return;
  openList.classList.remove('open');
  const row = openList.parentElement
    ? openList.parentElement.querySelector('.section-select-row')
    : null;
  if (row) row.classList.remove('open');
  openList = null;
}

document.addEventListener('click', (e) => {
  const row = e.target.closest('.section-select-row');
  if (row) {
    const list = row.parentElement.querySelector('.section-select-list');
    if (!list) return;
    if (list === openList) {
      closeAllSectionSelects();
    } else {
      closeAllSectionSelects();
      list.classList.add('open');
      row.classList.add('open');
      openList = list;
    }
    return;
  }
  // 点击浮层选项之外的外部区域时收起（选项自身由调用方收起）
  if (openList && !openList.parentElement.contains(e.target)) {
    closeAllSectionSelects();
  }
});
