// ========== 消息目录功能 ==========

/**
 * 消息目录功能
 * 当 hover 到 assistant 消息时，检测 H 标题并生成可导航的目录
 */

import state from './state.js';
import logger from '../shared/logger.js';
import { clampPanelToViewport, releasePanelClamp } from './utils.js';
import { getSideRailSlot } from './side-rail.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  messageToc: {
    toggleTitle: '显示目录（H{count}个标题）',
    title: '目录',
    headingCount: '{count} 个',
    lock: '锁定目录（不自动收起）',
    unlock: '解锁目录',
    close: '关闭目录',
  },
});
registerTranslations('en', {
  messageToc: {
    toggleTitle: 'Show table of contents (H{count} headings)',
    title: 'Contents',
    headingCount: '{count}',
    lock: 'Pin table of contents',
    unlock: 'Unpin table of contents',
    close: 'Close table of contents',
  },
});

// ==================== 目录锁定（常驻）状态 ====================

/** chrome.storage.local 中记忆目录锁定态的键名 */
const TOC_LOCKED_KEY = 'messageTocLocked';
/** 锁定态：目录面板常驻展开，鼠标移开不自动收起 */
let tocLocked = false;

const LOCK_OPEN_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 9.9-1"/></svg>';
const LOCK_CLOSED_SVG = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

/** 按当前锁定态刷新锁按钮的图标 / 提示 / 高亮 */
function applyLockButton(btn) {
  if (!btn) return;
  btn.innerHTML = tocLocked ? LOCK_CLOSED_SVG : LOCK_OPEN_SVG;
  btn.title = t(tocLocked ? 'messageToc.unlock' : 'messageToc.lock');
  btn.classList.toggle('locked', tocLocked);
}

/** 持久化锁定态（失败不影响本次生效） */
function persistTocLocked() {
  try {
    const p = chrome.storage?.local?.set?.({ [TOC_LOCKED_KEY]: tocLocked });
    if (p && typeof p.catch === 'function') p.catch(() => {});
  } catch { /* 忽略：持久化失败不影响本次锁定 */ }
}

/**
 * 初始化消息目录功能
 */
export function initMessageToc() {
  // 使用 mouseover/mouseout 来检测鼠标移动
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);

  // 恢复上次的目录锁定态：重开侧边栏仍保持常驻
  try {
    const r = chrome.storage?.local?.get?.(TOC_LOCKED_KEY);
    if (r && typeof r.then === 'function') {
      r.then((res) => { tocLocked = !!(res && res[TOC_LOCKED_KEY]); }).catch(() => {});
    } else if (r && typeof r === 'object') {
      tocLocked = !!r[TOC_LOCKED_KEY];
    }
  } catch { /* 读取失败按未锁定处理 */ }

  logger.debug('[SidePanel] messagedirectory featureinitializing');
}

/**
 * 处理鼠标进入事件
 */
export function handleMouseOver(event) {
  if (!(event.target instanceof Element)) return;
  
  // 如果目标是目录容器，标记为在目录区域内
  if (event.target.closest('.message-toc-container')) {
    state.isMouseOverToc = true;
    return;
  }
  
  // 如果目标是消息区域或工作目录预览 Markdown 区域
  const messageDiv = event.target.closest('.message.assistant');
  const workspacePreview = event.target.closest('.workspace-preview-markdown');
  if (!messageDiv && !workspacePreview) return;

  const container = messageDiv || workspacePreview;
  
  // 检查是否包含 H 标题
  const headings = container.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
  
  if (headings.length === 0) {
    if (!tocLocked) hideMessageToc();
    return;
  }
  
  // 生成目录
  showMessageToc(container, headings);
}

/**
 * 处理鼠标离开事件
 */
export function handleMouseOut(event) {
  if (!(event.target instanceof Element)) return;
  
  // 如果目标是目录容器，取消标记
  if (event.target.closest('.message-toc-container')) {
    state.isMouseOverToc = false;
    // 清除可能存在的延迟隐藏定时器
    if (state.tocHideTimer) {
      clearTimeout(state.tocHideTimer);
      state.tocHideTimer = null;
    }
    return;
  }
  
  // 如果目标是消息区域或工作目录预览 Markdown 区域
  const messageDiv = event.target.closest('.message.assistant');
  const workspacePreview = event.target.closest('.workspace-preview-markdown');
  if (!messageDiv && !workspacePreview) return;

  // 锁定态：目录常驻，鼠标移出消息/预览区也不自动收起
  if (tocLocked) return;

  const container = messageDiv || workspacePreview;
  
  // 检查 relatedTarget 是否在目录区域或容器区域内
  const relatedTarget = event.relatedTarget;
  if (relatedTarget) {
    if (relatedTarget.closest('.message-toc-container') || relatedTarget.closest('.message.assistant') || relatedTarget.closest('.workspace-preview-markdown')) {
      return; // 移动到目录区域或容器区域，不隐藏
    }
  }
  
  // 如果鼠标不在目录区域内，延迟隐藏目录（给用户时间移动到目录）
  if (!state.isMouseOverToc) {
    // 清除之前的定时器
    if (state.tocHideTimer) {
      clearTimeout(state.tocHideTimer);
    }
    // 延迟 800ms 隐藏目录，让用户有充足时间将鼠标移动到目录区域
    state.tocHideTimer = setTimeout(() => {
      // 再次检查鼠标是否已经进入目录区域
      if (!state.isMouseOverToc) {
        hideMessageToc();
      }
      state.tocHideTimer = null;
    }, 800);
  }
}

/**
 * 显示目录
 */
export function showMessageToc(messageDiv, headings) {
  // 将 NodeList 转换为数组
  const headingsArray = Array.from(headings);
  
  // 如果目录已存在，先移除
  if (state.messageTocContainer) {
    hideMessageToc();
  }
  
  // 为标题添加 ID（如果还没有）
  headingsArray.forEach((heading, index) => {
    if (!heading.id) {
      heading.id = `toc-heading-${Date.now()}-${index}`;
    }
  });
  
  // 创建目录容器
  const container = document.createElement('div');
  container.className = 'message-toc-container';
  container.dataset.headingsCount = headingsArray.length;
  
  // 生成目录列表
  let itemIndex = 0;
  const tocList = headingsArray.map((heading) => {
    const level = parseInt(heading.tagName.charAt(1));
    const text = heading.textContent.trim();
    const displayText = text.length > 30 ? text.substring(0, 30) + '...' : text;
    const anchor = `H${level}`;
    
    itemIndex++;
    return `
      <li class="message-toc-item level-${level}" 
          data-target="${heading.id}"
          data-anchor="${anchor}"
          title="${text}">
        <span class="toc-anchor">${anchor}</span>
        <span class="toc-text">${displayText}</span>
      </li>
    `;
  }).join('');
  
  container.innerHTML = `
    <button class="message-toc-toggle" title="${t('messageToc.toggleTitle', { count: headings.length })}">
      ☰
    </button>
    <div class="message-toc-panel${tocLocked ? ' locked' : ''}">
      <div class="message-toc-header">
        <span>☰</span>
        <span>${t('messageToc.title')}</span>
        <span class="message-toc-count">${t('messageToc.headingCount', { count: headings.length })}</span>
        <button class="message-toc-lock" type="button" title="${t(tocLocked ? 'messageToc.unlock' : 'messageToc.lock')}">${tocLocked ? LOCK_CLOSED_SVG : LOCK_OPEN_SVG}</button>
        <button class="message-toc-close" type="button" title="${t('messageToc.close')}">×</button>
      </div>
      <div class="message-toc-content">
        <ul class="message-toc-list">
          ${tocList}
        </ul>
      </div>
    </div>
  `;
  
  // 挂载点：全屏中的消息/预览挂到覆盖层内的 rail —— 覆盖层 fixed 铺满视口并盖住 side-rail，
  // 若仍挂 side-rail 会被遮挡（表现为全屏里"目录导航没了"）；
  // 普通列表与工作目录浮窗预览仍挂入口轨道 toc 槽位
  const fsOverlay = messageDiv.closest('.message-fullscreen-overlay');
  const previewFs = messageDiv.closest('.workspace-preview-overlay.fullscreen');
  const mountHost = fsOverlay
    ? (fsOverlay.querySelector('.message-fullscreen-rail') || getSideRailSlot('toc'))
    : previewFs
      ? (previewFs.querySelector('.workspace-preview-rail') || getSideRailSlot('toc'))
      : getSideRailSlot('toc');
  mountHost.appendChild(container);
  state.messageTocContainer = container;

  // 容器已入轨，垂直位置由轨道均分；hover 桥接由 800ms 延迟隐藏 + 面板 mouseenter 保证
  
  // 绑定事件
  const toggle = container.querySelector('.message-toc-toggle');
  const panel = container.querySelector('.message-toc-panel');

  // 锁定态：目录面板立即常驻展开（不依赖悬停），换消息/预览重建后依旧展开
  if (tocLocked) {
    panel.classList.add('expanded', 'locked');
    clampPanelToViewport(panel);
  }

  // 锁定按钮：切换「常驻不自动消失」；锁定即展开，解锁恢复悬停显隐
  const lockBtn = container.querySelector('.message-toc-lock');
  lockBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    tocLocked = !tocLocked;
    persistTocLocked();
    applyLockButton(lockBtn);
    if (tocLocked) {
      panel.classList.add('expanded', 'locked');
      clampPanelToViewport(panel);
    } else {
      panel.classList.remove('locked');
    }
  });

  // 关闭叉：无论是否锁定都收起当前目录；若处于锁定态一并解锁，避免下次悬停又常驻
  const closeBtn = container.querySelector('.message-toc-close');
  closeBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (tocLocked) {
      tocLocked = false;
      persistTocLocked();
    }
    hideMessageToc();
  });
  
  // 鼠标进入目录图标时展开
  toggle.addEventListener('mouseenter', () => {
    panel.classList.add('expanded');
    clampPanelToViewport(panel);
  });
  
  // 点击切换展开/收起
  toggle.addEventListener('click', () => {
    const expanded = panel.classList.toggle('expanded');
    if (expanded) {
      clampPanelToViewport(panel);
    } else {
      releasePanelClamp(panel);
    }
  });
  
  // 鼠标进入目录面板时保持展开
  panel.addEventListener('mouseenter', () => {
    panel.classList.add('expanded');
  });
  
  // 点击目录项滚动定位
  container.querySelectorAll('.message-toc-item').forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.dataset.target;
      const targetHeading = document.getElementById(targetId);
      
      if (targetHeading) {
        // 滚动到标题位置
        targetHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
        
        // 添加高亮效果
        targetHeading.classList.add('toc-highlight');
        setTimeout(() => {
          targetHeading.classList.remove('toc-highlight');
        }, 1500);
      }
      
      // 收起目录
      // panel.classList.remove('expanded');
    });
  });
  
  // 默认折叠，用户需要点击按钮展开
}

/**
 * 隐藏目录
 */
export function hideMessageToc() {
  // 清除可能存在的延迟隐藏定时器
  if (state.tocHideTimer) {
    clearTimeout(state.tocHideTimer);
    state.tocHideTimer = null;
  }
  
  if (state.messageTocContainer) {
    state.messageTocContainer.remove();
    state.messageTocContainer = null;
  }
}
