// side_panel/section-select.js - 弹窗内嵌下拉（选择行 + 绝对定位浮层列表）
//
// 浮层不占文档流，保证模型设置弹窗高度恒定；至多一个浮层展开。
// 交互采用文档级事件委托（兼容列表 innerHTML 全量重建）：
//   - click：选择行开 / 关，点击浮层外收起
//   - input：.section-select-search 关键字过滤（无匹配时显示空态提示）
//
// 列表渲染方（provider-selector.js / index.js 模型列表）负责：把
// sectionSelectSearchHtml() 输出插入列表容器首部，并按名称排序后渲染选项。

import { t } from '../shared/i18n.js';

let openList = null;

/** 关闭当前展开的浮层列表（至多一个） */
export function closeAllSectionSelects() {
  if (!openList) return;
  openList.classList.remove('open');
  const row = openList.parentElement
    ? openList.parentElement.querySelector('.section-select-row')
    : null;
  if (row) row.classList.remove('open');
  openList = null;
}

/**
 * 列表顶部过滤搜索框的 HTML（列表渲染方插入为列表容器首个子元素）
 * 吸顶显示不随选项滚动；data-i18n-placeholder 使语言切换时 placeholder 自动刷新
 * @returns {string}
 */
export function sectionSelectSearchHtml() {
  return `<input type="search" class="section-select-search" placeholder="${t('sectionSelect.searchPlaceholder')}" data-i18n-placeholder="sectionSelect.searchPlaceholder" spellcheck="false">`;
}

/**
 * 按关键字过滤列表选项：不区分大小写、包含匹配整项文本（名称 / 域名 / 窗口徽标均可命中）；
 * 无匹配时显示"无匹配项"空态（按需创建，列表重建后自动恢复）
 * @param {Element} list - .section-select-list 容器
 * @param {string} query - 关键字（空串恢复全部显示）
 */
export function filterSectionSelectList(list, query) {
  if (!list) return;
  const q = String(query || '').trim().toLowerCase();
  const options = Array.from(list.children).filter(el => el.hasAttribute('data-value'));

  let visible = 0;
  for (const option of options) {
    const hit = !q || option.textContent.toLowerCase().includes(q);
    option.style.display = hit ? '' : 'none';
    if (hit) visible += 1;
  }

  let empty = list.querySelector('.section-select-empty');
  if (q && visible === 0) {
    if (!empty) {
      empty = document.createElement('div');
      empty.className = 'section-select-empty';
      list.appendChild(empty);
    }
    empty.textContent = t('sectionSelect.noMatch');
  } else if (empty) {
    empty.remove();
  }
}

/**
 * 打开浮层：清空上次关键字恢复全量显示，并聚焦搜索框（打开即可直接输入过滤）
 */
function openSectionSelect(list, row) {
  closeAllSectionSelects();
  list.classList.add('open');
  row.classList.add('open');
  openList = list;

  const search = list.querySelector('.section-select-search');
  if (search) {
    search.value = '';
    filterSectionSelectList(list, '');
    search.focus();
  }
}

document.addEventListener('click', (e) => {
  const row = e.target.closest('.section-select-row');
  if (row) {
    const list = row.parentElement.querySelector('.section-select-list');
    if (!list) return;
    if (list === openList) {
      closeAllSectionSelects();
    } else {
      openSectionSelect(list, row);
    }
    return;
  }
  if (openList && !openList.parentElement.contains(e.target)) {
    closeAllSectionSelects();
  }
});

document.addEventListener('input', (e) => {
  const target = e.target;
  if (!target || !target.classList || !target.classList.contains('section-select-search')) return;
  const list = target.closest('.section-select-list');
  if (list) filterSectionSelectList(list, target.value);
});
