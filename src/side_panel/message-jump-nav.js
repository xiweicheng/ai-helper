// message-jump-nav.js - 左侧「消息跳转」把手：▲▼ 问答组跳转 + 问题列表（悬停/键盘展开、钉住、搜索过滤）
//
// 从 index.js 初始化闭包提取（方案文档 §4/§6 的既定方向）：接线只有成为可独立
// import 的模块，真实浏览器测试才能用真鼠标/键盘驱动 hover、pin、Esc 这些
// 源码守卫测不到的路径。分组/过滤/渲染等纯逻辑在 utils.js（buildMessageJumpGroups 等）。
import { t } from '../shared/i18n.js';
import {
  buildMessageJumpGroups,
  buildNavDensityBuckets,
  computeNavRailHeight,
  findActiveGroupIndex,
  findNearestGroupIndex,
  resolveJumpTarget,
  renderQuestionListHtml,
  focusMessageInView,
  scrollElementIntoChatView,
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
  // 指针是否停在列表面板内：为 true 时禁止列表“跟随当前项”自动滚动，
  // 否则用户手动滚列表去点远处条目时，任一次重绘都会把列表拽回旧当前项。
  let pointerInPanel = false;

  function navViewportTop() {
    const chatContainer = document.getElementById('chatContainer');
    return chatContainer ? chatContainer.getBoundingClientRect().top : 0;
  }

  /**
   * 列表高亮用的「当前组」：就近原则（视口内的提问优先，否则取上下最近的一条）。
   * 不能沿用 findActiveGroupIndex 的 -1 语义——滚到会话底部时末组提问已被顶出
   * 视口，-1 会让列表停在顶端且没有任何选中项，用户还得自己滚列表找位置。
   */
  function findCurrentGroupIndex(groups) {
    const chatContainer = document.getElementById('chatContainer');
    if (!chatContainer) return -1;
    const rect = chatContainer.getBoundingClientRect();
    return findNearestGroupIndex(groups, rect.top, rect.bottom);
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
    // 统一走带校正的滚动：content-visibility 占位高度会让裸 scrollIntoView 落到别处
    if (toEnd) {
      if (direction === 'prev') {
        scrollElementIntoChatView(groups[0].start, { align: 'start', behavior: 'smooth' });
      } else {
        const elements = groups[groups.length - 1].elements;
        scrollElementIntoChatView(elements[elements.length - 1], { align: 'end', behavior: 'smooth' });
      }
      return 'jumped';
    }

    const target = resolveJumpTarget(groups.length, findActiveGroupIndex(groups, viewportTop), direction);
    if (target === null) {
      flashNavBlocked(direction);
      return 'blocked';
    }
    scrollElementIntoChatView(groups[target].start, { align: 'start', behavior: 'smooth' });
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

  // ========== 把手密度圆点 ==========
  // 把手（左侧竖直小长条）里的点 = 提问：点越多问题越多，把手也按提问数长高；
  // 高度有上限，超量的提问合并成「密度点」（点更大更深），不至于密到糊成一条线。
  let navRailTotal = -1;
  let navRailHeight = 0;
  let navRailBuckets = [];

  /**
   * 按提问数渲染把手圆点。只有提问数/把手高度变了才重建 DOM：
   * 流式输出期间 MutationObserver 每帧都会走到这里，重建 innerHTML 没必要，
   * 当前点高亮由 paintDensityActive 单独负责。
   * @param {number|null} activeIndex - 当前组下标；null 表示只同步数量、暂不复位高亮
   */
  function renderDensityRail(activeIndex = null) {
    if (!chatNavHotzone) return;
    const rail = chatNavHotzone.querySelector('.chat-nav-density');
    if (!rail) return;
    const chatContainer = document.getElementById('chatContainer');
    const total = chatContainer ? chatContainer.querySelectorAll('.message.user').length : 0;
    if (total === 0) {
      rail.innerHTML = '';
      rail.classList.remove('single');
      navRailBuckets = [];
      navRailTotal = 0;
      navRailHeight = 0;
      chatNavHotzone.style.removeProperty('--nav-rail-h');
      return;
    }
    const viewportHeight = (chatContainer && chatContainer.clientHeight) || window.innerHeight || 0;
    const height = computeNavRailHeight(total, viewportHeight);
    if (total === navRailTotal && height === navRailHeight) {
      paintDensityActive(activeIndex);
      return;
    }
    navRailTotal = total;
    navRailHeight = height;
    // 高度写给 CSS（fallback 96px），圆点用 space-between 均匀分布，无需逐点算坐标
    chatNavHotzone.style.setProperty('--nav-rail-h', `${height}px`);
    navRailBuckets = buildNavDensityBuckets(total, height);
    rail.classList.toggle('single', navRailBuckets.length === 1);
    rail.innerHTML = navRailBuckets
      .map((bucket) => {
        const level = bucket.count >= 4 ? 3 : bucket.count >= 2 ? 2 : 1;
        return `<span class="chat-nav-dot${level > 1 ? ` lv${level}` : ''}"></span>`;
      })
      .join('');
    paintDensityActive(activeIndex);
  }

  function paintDensityActive(activeIndex) {
    if (!chatNavHotzone || activeIndex === null || activeIndex === undefined) return;
    const dots = chatNavHotzone.querySelectorAll('.chat-nav-density .chat-nav-dot');
    if (dots.length === 0) return;
    // 合并态下一个点代表一段提问：当前组落在谁的区间里，谁就是当前点
    const bucketIndex = navRailBuckets.findIndex((b) => activeIndex >= b.start && activeIndex < b.end);
    dots.forEach((dot, i) => dot.classList.toggle('current', i === bucketIndex));
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
    // 当前项不在列表可见范围时把它滚进来（只滚面板，不动聊天区）。
    // 仅当指针不在列表面板内时才跟随：指针在面板内说明用户正在自己滚列表找
    // 目标，此时拽回旧当前项会让他点不中；指针移到对话区滚对话时则应滚列表露出当前项。
    // 不能用“焦点是否在面板内”判断：点过条目后焦点会滞留在条目上，会错误地
    // 长期屏蔽跟随，导致滚对话时当前项不露出。
    const activeItem = Array.from(items).find((item) => Number(item.dataset.groupIndex) === activeIndex);
    if (!pointerInPanel && activeIndex >= 0 && activeItem) activeItem.scrollIntoView({ block: 'nearest' });
    paintDensityActive(activeIndex);
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
    paintActiveQuestion(findCurrentGroupIndex(navJumpGroups), navJumpGroups.length);
  }

  // 构建问答组列表：悬停/聚焦把手时右侧展开，点击条目定位到对应提问
  function buildQuestionList() {
    if (!chatNavQuestionPanel) return false;
    navJumpGroups = buildMessageJumpGroups(document.getElementById('chatContainer'));
    if (navJumpGroups.length === 0) {
      chatNavQuestionPanel.innerHTML = '';
      renderDensityRail(-1);
      return false;
    }
    const activeIndex = findCurrentGroupIndex(navJumpGroups);
    // 圆点与列表同一份分组：编号 N 的条目就是第 N 个点
    renderDensityRail(activeIndex);
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
      chatNavQuestionPanel.addEventListener('mouseenter', () => { pointerInPanel = true; showChatNav(); });
      chatNavQuestionPanel.addEventListener('mouseleave', () => { pointerInPanel = false; hideChatNav(false); });
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
        // 与收藏/搜索共用定位口径：贴顶 + 多帧校正（含高亮），避免占位高度导致落点偏移
        if (!focusMessageInView(anchor.dataset.messageId)) {
          scrollElementIntoChatView(anchor, { align: 'start', behavior: 'instant' });
          anchor.classList.add('bookmark-highlight');
          setTimeout(() => anchor.classList.remove('bookmark-highlight'), 2000);
        }
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

  // ========== 空会话隐藏 ==========
  // 没有任何用户提问时，{把手 / ▲▼ / 问题列表} 都没有可跳转的内容：
  // 空会话里留着一组箭头既无意义又挡视线，整组隐藏，等首条提问出现再恢复。
  let navVisibilityState = null;
  function hasUserQuestion() {
    const chatContainer = document.getElementById('chatContainer');
    return !!chatContainer && !!chatContainer.querySelector('.message.user');
  }

  function syncNavVisibility() {
    const show = hasUserQuestion();
    if (chatNavHotzone) chatNavHotzone.classList.toggle('chat-nav-empty', !show);
    if (chatNavButtons) chatNavButtons.classList.toggle('chat-nav-empty', !show);
    if (chatNavQuestionPanel) chatNavQuestionPanel.classList.toggle('chat-nav-empty', !show);
    if (!show && navVisibilityState !== false) {
      // 会话被清空/切到空会话：顺手复位钉住与展开态，避免留下不可见的“已钉住”状态
      setNavPinned(false);
      collapseChatNav();
      navQuery = '';
      if (chatNavQuestionPanel) chatNavQuestionPanel.innerHTML = '';
    }
    // 新提问 / 切会话都会走到这里：圆点按提问数增删，不依赖面板是否展开。
    // 只有面板开着时才顺手把当前点标出来（收起态没有列表，就不为它多算一次定位）。
    const expanded = !!(chatNavQuestionPanel && chatNavQuestionPanel.classList.contains('expanded'));
    renderDensityRail(expanded && navJumpGroups.length ? findCurrentGroupIndex(navJumpGroups) : null);
    navVisibilityState = show;
  }

  // 消息是异步渲染的（新会话、切会话、清空），用 rAF 合并 MutationObserver 的高频回调
  {
    const chatContainer = document.getElementById('chatContainer');
    if (chatContainer) {
      let navVisibilityScheduled = false;
      const scheduleNavVisibility = () => {
        if (navVisibilityScheduled) return;
        navVisibilityScheduled = true;
        requestAnimationFrame(() => {
          navVisibilityScheduled = false;
          syncNavVisibility();
        });
      };
      new MutationObserver(scheduleNavVisibility).observe(chatContainer, { childList: true, subtree: true });
      document.addEventListener('session-switched', scheduleNavVisibility);
      syncNavVisibility();
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
