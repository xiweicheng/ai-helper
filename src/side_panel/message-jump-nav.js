// message-jump-nav.js - 左侧「消息跳转」把手：▲▼ 问答组跳转 + 问题列表（悬停/键盘展开、钉住、搜索过滤）
//
// 从 index.js 初始化闭包提取（方案文档 §4/§6 的既定方向）：接线只有成为可独立
// import 的模块，真实浏览器测试才能用真鼠标/键盘驱动 hover、pin、Esc 这些
// 源码守卫测不到的路径。分组/过滤/渲染等纯逻辑在 utils.js（buildMessageJumpGroups 等）。
import { t } from '../shared/i18n.js';
import {
  buildMessageJumpGroups,
  findActiveGroupIndex,
  resolveJumpTarget,
  renderQuestionListHtml,
} from './utils.js';

/**
 * 绑定页面上的把手/▲▼/问题列表面板，返回供全局快捷键委托调用的 API。
 * DOM 按 id 获取，缺失时对应能力静默降级（与提取前 index.js 的行为一致）。
 */
export function initMessageJumpNav() {
  const chatNavUp = document.getElementById('chatNavUp');
  const chatNavDown = document.getElementById('chatNavDown');
  const chatNavHotzone = document.getElementById('chatNavHotzone');
  const chatNavButtons = document.getElementById('chatNavButtons');
  const chatNavQuestionPanel = document.getElementById('chatNavQuestionPanel');

  // 跳转列表与 ▲▼ 共用「问答组」口径（分组由 utils.buildMessageJumpGroups 提供），编号才能与跳转位置一一对应
  let navJumpGroups = [];
  let isNavPinned = false;
  let navHideTimer = null;
  let navQuery = '';
  // 收起时把焦点交回把手会被 focus 监听重新展开，用它在这一拍里挡住
  let suppressFocusExpand = false;

  function navViewportTop() {
    const chatContainer = document.getElementById('chatContainer');
    return chatContainer ? chatContainer.getBoundingClientRect().top : 0;
  }

  // ========== ▲▼ 跳转与边界反馈 ==========

  /**
   * 在问答组之间跳转。
   * @returns {'jumped'|'blocked'|'noop'} 已在边界要跳时返回 blocked 并给按钮抖动反馈
   */
  function jumpToMessage(direction, toEnd) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return 'noop';

    const groups = buildMessageJumpGroups(chatContainer);
    if (groups.length === 0) return 'noop';
    const viewportTop = chatContainer.getBoundingClientRect().top;

    // 快速回到顶部/底部（Ctrl/Cmd+点击 或 Alt+Ctrl/Cmd+方向键）
    if (toEnd) {
      if (direction === 'prev') {
        groups[0].start.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        const elements = groups[groups.length - 1].elements;
        elements[elements.length - 1].scrollIntoView({ behavior: 'smooth', block: 'end' });
      }
      return 'jumped';
    }

    const target = resolveJumpTarget(groups.length, findActiveGroupIndex(groups, viewportTop), direction);
    if (target === null) {
      flashNavBlocked(direction);
      return 'blocked';
    }
    groups[target].start.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return 'jumped';
  }

  // 边界无动作不再是静默失败：按钮轻抖一下，告诉用户「到头了」。
  // 动画本体在 styles.css（prefers-reduced-motion 下自动退化为无位移闪烁）。
  function flashNavBlocked(direction) {
    const btn = direction === 'prev' ? chatNavUp : chatNavDown;
    if (!btn) return;
    btn.classList.remove('blocked');
    // 强制回流以便重复点击时动画能重新起跑（classList 同值 add 不会重启 animation）
    void btn.offsetWidth;
    btn.classList.add('blocked');
    btn.addEventListener('animationend', () => btn.classList.remove('blocked'), { once: true });
  }

  // ========== 列表构建 / 当前组同步 ==========

  function paintActiveQuestion(activeIndex, total) {
    const items = chatNavQuestionPanel.querySelectorAll('.chat-nav-question-item');
    items.forEach((item) => {
      // 过滤态下条目是子集，按渲染时写好的原始组下标比对，不能按位置
      const gi = Number(item.dataset.groupIndex);
      if (gi === activeIndex) {
        item.classList.add('current');
        item.setAttribute('aria-current', 'true');
      } else {
        item.classList.remove('current');
        item.setAttribute('aria-current', 'false');
      }
    });
    const countEl = chatNavQuestionPanel.querySelector('.chat-nav-question-header .count');
    if (countEl) {
      countEl.textContent = t('chat.navPosition', {
        current: activeIndex >= 0 ? activeIndex + 1 : total,
        total,
      });
    }
    // 当前项不在列表可见范围时把它滚进来（只滚面板，不动聊天区）
    const activeItem = Array.from(items).find((item) => Number(item.dataset.groupIndex) === activeIndex);
    if (activeIndex >= 0 && activeItem) activeItem.scrollIntoView({ block: 'nearest' });
  }

  // 滚动/跳转后同步当前组；组数变了说明列表已过期，直接重建
  function updateActiveQuestion() {
    if (!chatNavQuestionPanel || !chatNavQuestionPanel.classList.contains('expanded')) return;
    navJumpGroups = buildMessageJumpGroups(document.getElementById('chatContainer'));
    const renderedAll = navQuery ? buildMessageJumpGroups(document.getElementById('chatContainer')).length : chatNavQuestionPanel.querySelectorAll('.chat-nav-question-item').length;
    if (navJumpGroups.length === 0) {
      chatNavQuestionPanel.innerHTML = '';
      chatNavQuestionPanel.classList.remove('expanded');
      return;
    }
    // 过滤态渲染的是子集，条目数与组数没有可比性，只重建不比对（比对逻辑留给无过滤路径）
    if (!navQuery && renderedAll !== navJumpGroups.length) {
      buildQuestionList();
      return;
    }
    paintActiveQuestion(findActiveGroupIndex(navJumpGroups, navViewportTop()), navJumpGroups.length);
  }

  // 构建问答组列表：悬停/聚焦把手时右侧展开，点击条目定位到对应提问
  function buildQuestionList() {
    if (!chatNavQuestionPanel) return false;
    navJumpGroups = buildMessageJumpGroups(document.getElementById('chatContainer'));
    if (navJumpGroups.length === 0) {
      chatNavQuestionPanel.innerHTML = '';
      return false;
    }
    const activeIndex = findActiveGroupIndex(navJumpGroups, navViewportTop());
    const searchWasFocused = document.activeElement === chatNavQuestionPanel.querySelector('[data-role="nav-search"]');
    chatNavQuestionPanel.innerHTML = renderQuestionListHtml(navJumpGroups, activeIndex, isNavPinned, navQuery);
    chatNavQuestionPanel.querySelector('.chat-nav-pin').addEventListener('click', (e) => {
      e.stopPropagation();
      toggleNavPin();
    });
    const searchInput = chatNavQuestionPanel.querySelector('[data-role="nav-search"]');
    if (searchInput) {
      const applyQuery = () => {
        if (navQuery === searchInput.value) return;
        navQuery = searchInput.value;
        buildQuestionList();
      };
      searchInput.addEventListener('input', (e) => {
        // IME 组合期间（中文/日文拼音上屏前）不能重建列表：buildQuestionList 会整体
        // 替换 innerHTML、销毁正在组合的 input，导致拼音永远转不出汉字只剩字母。
        // 组合提交后由 compositionend 再触发过滤。
        if (e.isComposing) return;
        applyQuery();
      });
      searchInput.addEventListener('compositionend', applyQuery);
      // 重建 innerHTML 会把焦点从被销毁的 input 上踢掉，过滤输入时逐字找回
      if (searchWasFocused) {
        searchInput.focus();
        searchInput.setSelectionRange(searchInput.value.length, searchInput.value.length);
      }
    }
    if (activeIndex >= 0) {
      const activeItem = chatNavQuestionPanel.querySelector(`.chat-nav-question-item[data-group-index="${activeIndex}"]`);
      if (activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    }
    return true;
  }

  // ========== 展开 / 收起 / 钉住 ==========

  function navContainsFocus() {
    const active = document.activeElement;
    if (!active) return false;
    return [chatNavHotzone, chatNavButtons, chatNavQuestionPanel]
      .some((el) => el && (el === active || el.contains(active)));
  }

  function collapseChatNav() {
    chatNavButtons.classList.remove('expanded');
    if (chatNavQuestionPanel) chatNavQuestionPanel.classList.remove('expanded');
  }

  // 收起并把焦点交回把手：程序化 focus 会触发把手的 focus 监听重新展开，
  // 用 suppressFocusExpand 在这一拍里挡住，避免“收起即弹回”。
  function collapseChatNavReturningFocus() {
    const hadFocus = navContainsFocus();
    collapseChatNav();
    if (hadFocus && chatNavHotzone) {
      suppressFocusExpand = true;
      chatNavHotzone.focus({ preventScroll: true });
      suppressFocusExpand = false;
    }
  }

  function showChatNav() {
    clearTimeout(navHideTimer);
    chatNavButtons.classList.add('expanded');
    if (!chatNavQuestionPanel) return;
    if (chatNavQuestionPanel.classList.contains('expanded')) {
      updateActiveQuestion();
      return;
    }
    if (buildQuestionList()) chatNavQuestionPanel.classList.add('expanded');
    else chatNavQuestionPanel.classList.remove('expanded');
  }

  function hideChatNav(immediate) {
    clearTimeout(navHideTimer);
    if (isNavPinned) return;
    // 键盘用户正在把手/列表里操作时不收，收起只跟鼠标走
    if (navContainsFocus()) return;
    if (immediate) collapseChatNav();
    else navHideTimer = setTimeout(collapseChatNav, 300);
  }

  function setNavPinned(pinned) {
    isNavPinned = pinned;
    if (chatNavHotzone) {
      chatNavHotzone.classList.toggle('pinned', pinned);
      chatNavHotzone.setAttribute('aria-pressed', String(pinned));
    }
    if (chatNavQuestionPanel) {
      chatNavQuestionPanel.classList.toggle('pinned', pinned);
      const btn = chatNavQuestionPanel.querySelector('.chat-nav-pin');
      if (btn) {
        const label = t(pinned ? 'chat.navUnpinLabel' : 'chat.navPinLabel');
        btn.textContent = label;
        btn.title = label;
        btn.setAttribute('aria-pressed', String(pinned));
        btn.classList.toggle('on', pinned);
      }
    }
  }

  function toggleNavPin() {
    setNavPinned(!isNavPinned);
  }

  // ========== 接线 ==========

  if (chatNavUp) {
    chatNavUp.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToMessage('prev', e.ctrlKey || e.metaKey);
      updateActiveQuestion();
    });
  }
  if (chatNavDown) {
    chatNavDown.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      jumpToMessage('next', e.ctrlKey || e.metaKey);
      updateActiveQuestion();
    });
  }

  if (chatNavHotzone && chatNavButtons) {
    chatNavHotzone.addEventListener('mouseenter', showChatNav);
    chatNavHotzone.addEventListener('mouseleave', () => hideChatNav(false));
    chatNavHotzone.addEventListener('click', () => toggleNavPin());
    // 键盘可达：Tab 聚焦把手即展开列表，Enter/Space 与点击同义（切钉住）
    chatNavHotzone.addEventListener('focus', () => {
      if (suppressFocusExpand) return;
      showChatNav();
    });
    chatNavHotzone.addEventListener('blur', () => hideChatNav(false));
    chatNavHotzone.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        toggleNavPin();
      }
    });
    chatNavButtons.addEventListener('mouseenter', showChatNav);
    chatNavButtons.addEventListener('mouseleave', () => hideChatNav(false));
    chatNavButtons.addEventListener('focusin', showChatNav);
    if (chatNavQuestionPanel) {
      chatNavQuestionPanel.addEventListener('mouseenter', showChatNav);
      chatNavQuestionPanel.addEventListener('mouseleave', () => hideChatNav(false));
      chatNavQuestionPanel.addEventListener('focusin', showChatNav);
      // 列表内 ↑/↓ 在条目间移动焦点（搜索框不参与，Home/End 跳首尾）
      chatNavQuestionPanel.addEventListener('keydown', (e) => {
        if (e.target.matches('[data-role="nav-search"]')) return;
        const items = Array.from(chatNavQuestionPanel.querySelectorAll('.chat-nav-question-item'));
        if (items.length === 0) return;
        const current = items.indexOf(document.activeElement);
        let next = null;
        if (e.key === 'ArrowDown') next = Math.min(current + 1, items.length - 1);
        else if (e.key === 'ArrowUp') next = current <= 0 ? 0 : current - 1;
        else if (e.key === 'Home') next = 0;
        else if (e.key === 'End') next = items.length - 1;
        if (next !== null) {
          e.preventDefault();
          items[next].focus();
        }
      });
      // 事件委托：列表重建后无需重新绑定，条目按 messageId 定位避免索引错位
      chatNavQuestionPanel.addEventListener('click', (e) => {
        const item = e.target.closest('.chat-nav-question-item');
        if (!item || !item.dataset.messageId) return;
        const group = navJumpGroups.find(
          g => (g.userElement || g.start).dataset.messageId === item.dataset.messageId
        );
        if (!group) return;
        const anchor = group.userElement || group.start;
        anchor.scrollIntoView({ behavior: 'instant', block: 'start' });
        anchor.classList.add('bookmark-highlight');
        setTimeout(() => anchor.classList.remove('bookmark-highlight'), 2000);
        if (!isNavPinned) {
          collapseChatNavReturningFocus();
        } else {
          updateActiveQuestion();
        }
      });
    }
  }

  // 面板展开期间跟随滚动更新当前组
  {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      let navScrollScheduled = false;
      chatContainer.addEventListener('scroll', () => {
        if (!chatNavQuestionPanel || !chatNavQuestionPanel.classList.contains('expanded')) return;
        if (navScrollScheduled) return;
        navScrollScheduled = true;
        requestAnimationFrame(() => {
          navScrollScheduled = false;
          updateActiveQuestion();
        });
      }, { passive: true });
    }
  }

  /**
   * 全局 Esc 的导航分支：搜索框有词先清词，否则退钉住/收起并把焦点还给把手。
   * @returns {boolean} 是否消费了这次 Esc（调用方据此短路）
   */
  function handleEscape() {
    const panelOpen = chatNavQuestionPanel && chatNavQuestionPanel.classList.contains('expanded');
    if (!isNavPinned && !panelOpen) return false;
    const searchInput = chatNavQuestionPanel && chatNavQuestionPanel.querySelector('[data-role="nav-search"]');
    if (searchInput && navQuery) {
      navQuery = '';
      buildQuestionList();
      const input = chatNavQuestionPanel.querySelector('[data-role="nav-search"]');
      if (input) input.focus();
      return true;
    }
    setNavPinned(false);
    collapseChatNavReturningFocus();
    return true;
  }

  return {
    jumpToMessage,
    updateActiveQuestion,
    handleEscape,
    isPinned: () => isNavPinned,
  };
}
