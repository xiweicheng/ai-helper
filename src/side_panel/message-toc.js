// ========== 消息目录功能 ==========

/**
 * 消息目录功能
 * 当 hover 到 assistant 消息时，检测 H 标题并生成可导航的目录
 */

import state from './state.js';

/**
 * 初始化消息目录功能
 */
export function initMessageToc() {
  // 使用 mouseover/mouseout 来检测鼠标移动
  document.addEventListener('mouseover', handleMouseOver, true);
  document.addEventListener('mouseout', handleMouseOut, true);
  
  console.log('[SidePanel] 消息目录功能已初始化');
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
  
  // 如果鼠标不在目录区域内，隐藏目录
  if (!state.isMouseOverToc) {
    hideMessageToc();
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
  if (state.messageTocContainer) {
    state.messageTocContainer.remove();
    state.messageTocContainer = null;
  }
}
