// side_panel/page-selector.js - 网页选择器（@ 弹出框中「网页」Tab）
import state from './state.js';
import { escapeHtml, adjustInputHeight } from './utils.js';
import { hideAgentAtSelector } from './agent-at-selector.js';
import logger from '../shared/logger.js';

/**
 * 获取当前窗口所有打开的标签页
 */
export async function getOpenTabs() {
  try {
    const tabs = await chrome.tabs.query({ currentWindow: true });
    return tabs;
  } catch (err) {
    logger.error('[PageSelector] 获取标签页失败:', err);
    return [];
  }
}

/**
 * 渲染网页列表
 */
export async function renderPageList(filterText = '') {
  const pageList = document.getElementById('agentPageList');
  if (!pageList) return;

  const tabs = await getOpenTabs();
  const filterLower = filterText.toLowerCase();

  // 过滤标签页（按标题或 URL）
  const filteredTabs = tabs.filter(tab => {
    if (!tab.url) return false;
    if (!filterText) return true;
    const titleMatch = (tab.title || '').toLowerCase().includes(filterLower);
    const urlMatch = tab.url.toLowerCase().includes(filterLower);
    return titleMatch || urlMatch;
  });

  if (filteredTabs.length === 0) {
    pageList.innerHTML = '<div class="prompt-empty">暂无打开的网页</div>';
    state.selectedPageIndex = -1;
    return;
  }

  state.selectedPageIndex = 0;
  const currentSelectedPageId = state.selectedPage ? state.selectedPage.id : null;

  pageList.innerHTML = filteredTabs.map((tab, index) => {
    const title = tab.title || '无标题';
    const url = tab.url || '';
    const favIcon = tab.favIconUrl
      ? `<img src="${escapeHtml(tab.favIconUrl)}" width="16" height="16" style="flex-shrink:0;" onerror="this.style.display='none'">`
      : '<span style="font-size:14px;flex-shrink:0;">🌐</span>';
    const isActive = tab.active ? ' · 当前' : '';
    const isPageSelected = tab.id === currentSelectedPageId;

    return `
      <div class="prompt-item ${index === 0 ? 'selected' : ''}"
           data-index="${index}" data-tab-id="${tab.id}">
        <span class="prompt-item-index">${index + 1}</span>
        ${favIcon}
        <span class="prompt-item-content" title="${escapeHtml(title)}">${escapeHtml(title)}</span>
        <span class="prompt-item-code" title="${escapeHtml(url)}">${escapeHtml(url)}${isActive}</span>
        ${isPageSelected ? `<span class="page-item-actions"><span class="page-selected-mark">✓</span></span>` : ''}
      </div>
    `;
  }).join('');

  // 绑定点击事件
  pageList.querySelectorAll('.prompt-item').forEach(item => {
    item.addEventListener('click', () => {
      const tabId = parseInt(item.dataset.tabId);
      selectPageByTabId(tabId);
    });
  });
}

/**
 * 更新网页列表选中状态
 */
export function updatePageSelection(items) {
  items.forEach((item, index) => {
    if (index === state.selectedPageIndex) {
      item.classList.add('selected');
      // 自动滚动到可见区域
      item.scrollIntoView({ block: 'nearest' });
    } else {
      item.classList.remove('selected');
    }
  });
}

/**
 * 选中网页
 */
export function selectPage(tab) {
  state.selectedPage = {
    id: tab.id,
    title: tab.title || '无标题',
    url: tab.url || '',
    favIconUrl: tab.favIconUrl || ''
  };

  // 显示网页指示器
  const indicator = document.getElementById('pageIndicator');
  const indicatorName = document.getElementById('pageIndicatorName');
  if (indicator && indicatorName) {
    const displayTitle = (state.selectedPage.title && state.selectedPage.title !== '无标题') ? state.selectedPage.title : '';
    const displayUrl = state.selectedPage.url || '';
    if (displayTitle && displayUrl) {
      indicatorName.textContent = `${displayTitle} · ${displayUrl}`;
    } else {
      indicatorName.textContent = displayTitle || displayUrl;
    }
    indicator.style.display = 'flex';
  }
}

/**
 * 取消选中网页
 */
export function clearPageSelection() {
  state.selectedPage = null;
  state.selectedPageIndex = -1;

  const indicator = document.getElementById('pageIndicator');
  if (indicator) {
    indicator.style.display = 'none';
  }
}

/**
 * 通过 tabId 选中网页
 */
function selectPageByTabId(tabId) {
  const userInput = document.getElementById('userInput');
  const value = userInput ? userInput.value : '';

  // 找到最后一个 @ 的位置
  const lastAtIndex = value.lastIndexOf('@');

  if (lastAtIndex !== -1) {
    // 移除 @ 及其后面的过滤文本
    const newValue = value.substring(0, lastAtIndex);
    userInput.value = newValue;
    userInput.focus();
    userInput.selectionStart = userInput.selectionEnd = newValue.length;
  }

  // 通过代理获取 tab 信息
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError || !tab) {
      logger.error('[PageSelector] 获取标签页信息失败:', chrome.runtime.lastError);
      return;
    }

    selectPage(tab);

    // 隐藏选择器
    hideAgentAtSelector();

    // 聚焦输入框
    if (userInput) {
      userInput.focus();
      adjustInputHeight();
    }
  });
}

/**
 * 初始化页面指标器事件
 */
export function initPageIndicatorEvents() {
  const closeBtn = document.getElementById('pageIndicatorClose');
  if (closeBtn) {
    closeBtn.addEventListener('click', () => {
      clearPageSelection();
    });
  }
}
