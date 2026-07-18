// ========== 消息目录功能 ==========

/**
 * 消息目录功能
 * 当 hover 到 assistant 消息时，检测 H 标题并生成可导航的目录
 */

import state from './state.js';
import logger from '../shared/logger.js';

/**
 * 初始化消息目录功能
 */
export function initMessageToc() {
  // 使用 mouseover/mouseout 来检测鼠标移动
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  
  logger.debug('[SidePanel] 消息目录功能已初始化');
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
  
  // 如果目标是消息区域
  const messageDiv = event.target.closest('.message.assistant');
  if (!messageDiv) return;
  
  // 检查是否包含 H 标题
  const headings = messageDiv.querySelectorAll('.markdown-body h1, .markdown-body h2, .markdown-body h3, .markdown-body h4, .markdown-body h5, .markdown-body h6');
  
  if (headings.length === 0) {
    hideMessageToc();
    return;
  }
  
  // 生成目录
  showMessageToc(messageDiv, headings);
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
  
  // 如果目标是消息区域
  const messageDiv = event.target.closest('.message.assistant');
  if (!messageDiv) return;
  
  // 检查 relatedTarget 是否在目录区域或消息区域内
  const relatedTarget = event.relatedTarget;
  if (relatedTarget) {
    if (relatedTarget.closest('.message-toc-container') || relatedTarget.closest('.message.assistant')) {
      return; // 移动到目录区域或消息区域，不隐藏
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
    <button class="message-toc-toggle" title="显示目录（H${headings.length}个标题）">
      ☰
    </button>
    <div class="message-toc-panel">
      <div class="message-toc-header">
        <span>☰</span>
        <span>目录</span>
        <span style="margin-left: auto; font-weight: normal; color: #999; font-size: 11px;">${headings.length} 个</span>
      </div>
      <div class="message-toc-content">
        <ul class="message-toc-list">
          ${tocList}
        </ul>
      </div>
    </div>
  `;
  
  // 添加到页面
  document.body.appendChild(container);
  state.messageTocContainer = container;

  // 动态调整容器位置：让容器左边界对齐消息的右边界，消除消息到目录之间的间隙
  const messageRect = messageDiv.getBoundingClientRect();
  // 容器默认 CSS 为 right: 0; width: 280px，其默认左边界 = viewportWidth - 280
  const defaultContainerLeft = window.innerWidth - 280;
  // 如果消息右边界在容器左边界左侧（存在间隙），则扩展容器左边界以覆盖间隙
  if (messageRect.right < defaultContainerLeft) {
    container.style.left = messageRect.right + 'px';
    container.style.right = '0';
    // 移除固定宽度，改用 left/right 拉伸
    container.style.width = 'auto';
  }
  
  // 绑定事件
  const toggle = container.querySelector('.message-toc-toggle');
  const panel = container.querySelector('.message-toc-panel');
  
  // 鼠标进入目录图标时展开
  toggle.addEventListener('mouseenter', () => {
    panel.classList.add('expanded');
  });
  
  // 点击切换展开/收起
  toggle.addEventListener('click', () => {
    panel.classList.toggle('expanded');
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
