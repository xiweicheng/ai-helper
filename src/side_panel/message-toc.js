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

// ==================== 目录与正文章节联动（滚动高亮 + 目录自动跟滚） ====================

/** 当前目录的滚动联动清理函数 */
let tocScrollSpyCleanup = null;
/** 把当前激活目录项滚入目录可视区（仅在目录展开时生效） */
let tocScrollActiveIntoView = null;

/** 查找元素的可滚动祖先（找不到返回 null） */
function findScrollParent(el) {
  let node = el.parentElement;
  while (node && node !== document.body && node !== document.documentElement) {
    const style = getComputedStyle(node);
    const oy = style.overflowY;
    if ((oy === 'auto' || oy === 'scroll' || oy === 'overlay') && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

/**
 * 绑定「正文滚动 → 目录高亮」联动
 * @param {HTMLElement} tocContainer 目录容器
 * @param {HTMLElement} contentRoot 正文根节点（消息 / 预览 Markdown）
 * @param {HTMLElement[]} headings 正文标题集合
 * @param {HTMLElement} panel 目录面板
 */
function bindTocScrollSpy(tocContainer, contentRoot, headings, panel) {
  unbindTocScrollSpy();
  if (headings.length === 0) return;

  const scrollEl = findScrollParent(contentRoot);
  const tocContent = tocContainer.querySelector('.message-toc-content');
  const items = Array.from(tocContainer.querySelectorAll('.message-toc-item'));
  const itemById = new Map(items.map((it) => [it.dataset.target, it]));

  let rafId = 0;
  let activeId = null;
  let activeIndex = -1;

  /** 目录项滚入目录可视区（居中），避免高亮项被裁在面板外 */
  const ensureItemVisible = (item) => {
    if (!tocContent) return;
    const itemRect = item.getBoundingClientRect();
    const listRect = tocContent.getBoundingClientRect();
    if (itemRect.top < listRect.top || itemRect.bottom > listRect.bottom) {
      tocContent.scrollTop += itemRect.top - listRect.top - (listRect.height - itemRect.height) / 2;
    }
  };

  /** 正文可视区（找不到滚动祖先时回退到窗口视口，并裁剪到窗口范围内） */
  const getViewport = () => {
    const winTop = 0;
    const winBottom = window.innerHeight || document.documentElement.clientHeight || 0;
    if (!scrollEl) return { top: winTop, bottom: winBottom };
    const rect = scrollEl.getBoundingClientRect();
    return {
      top: Math.max(rect.top, winTop),
      bottom: Math.min(rect.top + scrollEl.clientHeight, winBottom),
    };
  };
  const isScrollAtBottom = () => {
    if (scrollEl) {
      return scrollEl.scrollTop + scrollEl.clientHeight >= scrollEl.scrollHeight - 2;
    }
    const doc = document.documentElement;
    return window.scrollY + window.innerHeight >= doc.scrollHeight - 2;
  };
  const isScrollAtTop = () => {
    if (scrollEl) return scrollEl.scrollTop <= 2;
    return window.scrollY <= 2;
  };

  const update = () => {
    rafId = 0;
    if (!tocContainer.isConnected) return;

    // 判定规则：
    // 1）基准章节 = 最后一个已越过可视区顶部的标题（正在阅读的章节）
    // 2）下一个章节的标题一旦进入可视区上部 75%，就提前切到下一章节，
    //    避免「标题已经明显出现在视野里，目录却还停在上一个章节」的滞后感
    // 3）已切到下一章节后，要等它的标题完全移出可视区才回退，防止边界处来回抖动
    const view = getViewport();
    const viewTop = view.top;
    const viewBottom = view.bottom;
    const viewHeight = Math.max(viewBottom - viewTop, 1);

    const tops = headings.map((heading) => heading.getBoundingClientRect().top);

    let anchorIndex = 0;
    for (let i = 0; i < tops.length; i++) {
      if (tops[i] <= viewTop) {
        anchorIndex = i;
      } else {
        break;
      }
    }

    const advanceLine = viewTop + viewHeight * 0.75;
    let targetIndex = anchorIndex;
    const nextIndex = anchorIndex + 1;
    if (nextIndex < tops.length) {
      const nextTop = tops[nextIndex];
      if (activeIndex === nextIndex) {
        if (nextTop <= viewBottom) targetIndex = nextIndex;
      } else if (nextTop <= advanceLine) {
        targetIndex = nextIndex;
      }
    }

    // 顶部 / 底部边界：直接落到第一个 / 最后一个章节
    if (isScrollAtTop()) {
      targetIndex = 0;
    } else if (isScrollAtBottom()) {
      targetIndex = headings.length - 1;
    }

    const current = headings[targetIndex];
    if (!current || current.id === activeId) return;

    activeIndex = targetIndex;
    activeId = current.id;
    items.forEach((item) => item.classList.toggle('active', item.dataset.target === activeId));
    // 目录展开时才跟随滚动，折叠态只记录高亮
    const activeItem = itemById.get(activeId);
    if (activeItem && panel.classList.contains('expanded')) {
      ensureItemVisible(activeItem);
    }
  };

  const schedule = () => {
    if (rafId) return;
    rafId = requestAnimationFrame(update);
  };

  // scroll 事件不冒泡，用捕获阶段统一兜住任意滚动容器（含滚动条拖动、程序化平滑滚动），
  // 避免因滚动祖先判断偏差导致高亮停留在旧章节
  document.addEventListener('scroll', schedule, { capture: true, passive: true });
  window.addEventListener('resize', schedule, { passive: true });
  // 兜底：标题进出可视区 / 布局高度变化时也会触发，覆盖未派发 scroll 的场景
  const io = typeof IntersectionObserver === 'function'
    ? new IntersectionObserver(schedule, { threshold: [0, 0.25, 0.5, 0.75, 1] })
    : null;
  if (io) headings.forEach((heading) => io.observe(heading));

  update();

  tocScrollActiveIntoView = () => {
    // 展开瞬间先按当前滚动位置校准一次，再滚动高亮项
    update();
    if (!activeId) return;
    const item = itemById.get(activeId);
    if (item) ensureItemVisible(item);
  };

  tocScrollSpyCleanup = () => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = 0;
    document.removeEventListener('scroll', schedule, { capture: true });
    window.removeEventListener('resize', schedule);
    if (io) io.disconnect();
  };
}

/** 解绑正文滚动联动 */
function unbindTocScrollSpy() {
  if (tocScrollSpyCleanup) {
    tocScrollSpyCleanup();
    tocScrollSpyCleanup = null;
  }
  tocScrollActiveIntoView = null;
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
      requestAnimationFrame(() => tocScrollActiveIntoView && tocScrollActiveIntoView());
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
    // 展开后把当前章节高亮项滚入目录可视区
    requestAnimationFrame(() => tocScrollActiveIntoView && tocScrollActiveIntoView());
  });
  
  // 点击切换展开/收起
  toggle.addEventListener('click', () => {
    const expanded = panel.classList.toggle('expanded');
    if (expanded) {
      clampPanelToViewport(panel);
      requestAnimationFrame(() => tocScrollActiveIntoView && tocScrollActiveIntoView());
    } else {
      releasePanelClamp(panel);
    }
  });
  
  // 鼠标进入目录面板时保持展开
  panel.addEventListener('mouseenter', () => {
    panel.classList.add('expanded');
    // 进入面板时按当前滚动位置重新校准高亮
    requestAnimationFrame(() => tocScrollActiveIntoView && tocScrollActiveIntoView());
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

  // 正文滚动 → 目录章节高亮联动
  bindTocScrollSpy(container, messageDiv, headingsArray, panel);

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

  // 解绑正文滚动联动，避免残留监听
  unbindTocScrollSpy();

  if (state.messageTocContainer) {
    state.messageTocContainer.remove();
    state.messageTocContainer = null;
  }
}
