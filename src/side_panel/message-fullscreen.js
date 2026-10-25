// ========== AI 回答全屏查看（节点迁移方案） ==========
// 把消息的真实 DOM 节点移入全屏覆盖层，退出时按占位锚点归位。
// 选择"迁移"而非"克隆"的原因：
// - 节点上的事件监听随节点保留，表格工具条/代码复制/展开折叠等交互零损失；
// - 流式输出中打开时展示的是活节点，新 token 直接呈现在全屏视图，无需同步逻辑。
// 入口：footer 按钮（.fullscreen-btn，委托捕获）、Alt+F、Alt+双击消息区；Esc 退出。

import logger from '../shared/logger.js';
import { t, registerTranslations } from '../shared/i18n.js';

registerTranslations('zh', {
  msgFullscreen: {
    title: '全屏阅读',
    btnTitle: '全屏查看本回答 (Alt+双击 / Alt+F)',
    btnLabel: '全屏',
    copy: '复制',
    copyTitle: '复制回答内容（Ctrl/⌘+点击复制富文本）',
    export: '导出',
    exportTitle: '导出下载本回答',
    exportWord: '导出 Word',
    exportPdf: '导出 PDF',
    exportImage: '导出图片',
    exportMarkdown: '导出 Markdown',
    close: '退出全屏',
    closeTitle: '退出全屏 (Esc)',
  },
});

registerTranslations('en', {
  msgFullscreen: {
    title: 'Fullscreen Reading',
    btnTitle: 'View this answer fullscreen (Alt+Double-click / Alt+F)',
    btnLabel: 'Fullscreen',
    copy: 'Copy',
    copyTitle: 'Copy answer (Ctrl/Cmd+click for rich text)',
    export: 'Export',
    exportTitle: 'Export / download this answer',
    exportWord: 'Export Word',
    exportPdf: 'Export PDF',
    exportImage: 'Export Image',
    exportMarkdown: 'Export Markdown',
    close: 'Exit fullscreen',
    closeTitle: 'Exit fullscreen (Esc)',
  },
});

const OVERLAY_ID = 'messageFullscreenOverlay';
const BODY_ID = 'messageFullscreenBody';
const TITLE_ID = 'messageFullscreenTitle';
const COPY_BTN_ID = 'messageFullscreenCopyBtn';
const CLOSE_BTN_ID = 'messageFullscreenCloseBtn';
const EXPORT_BTN_ID = 'messageFullscreenExportBtn';
const EXPORT_DROPDOWN_ID = 'messageFullscreenExportDropdown';

// 当前全屏中的消息节点与其在原容器中的前兄弟锚点（注释节点，DOM 顺序标记）
let currentEl = null;
let anchor = null;
let followObserver = null;
let followPaused = false;
// 进入全屏前主列表的滚动位置：节点移出会使 #chatContainer 高度骤减、浏览器夹紧 scrollTop，
// 退出时需还原；切换消息（全屏中再开另一条）期间不提前还原，保留最初值
let chatScrollBefore = null;
let switching = false;

/** 是否处于全屏查看中 */
export function isFullscreenActive() {
  return currentEl !== null;
}

/**
 * 会话 DOM 缓存快照守卫：全屏期间消息节点不在 chatContainer 内，
 * 直接取 innerHTML 会缓存缺失该消息的内容，此时返回 null，调用方跳过缓存。
 * @param {HTMLElement} container
 * @returns {string|null}
 */
export function getSessionDOMSnapshot(container) {
  if (!container || isFullscreenActive()) return null;
  return container.innerHTML;
}

/** 取消息区最后一条助手消息（Alt+F 无上下文时的作用对象） */
export function getLastAssistantMessage() {
  const msgs = document.querySelectorAll('#chatContainer .message.assistant');
  return msgs.length ? msgs[msgs.length - 1] : null;
}

/**
 * 创建 footer 全屏查看按钮（图标态，约 24px，不占文字宽度）。
 * 点击由 initMessageFullscreen 的 document 委托统一处理（只认 .fullscreen-btn），
 * 因此无需在此绑定监听，也天然覆盖历史恢复的消息。
 * @returns {HTMLButtonElement}
 */
export function createFullscreenButton() {
  const btn = document.createElement('button');
  btn.className = 'fullscreen-btn';
  btn.title = t('msgFullscreen.btnTitle');
  btn.innerHTML = [
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14">',
    '<path d="M6 2H2v4M10 2h4v4M6 14H2v-4M10 14h4v-4"/>',
    '</svg>',
    `<span>${t('msgFullscreen.btnLabel')}</span>`,
  ].join('');
  return btn;
}

function getOverlayParts() {
  const overlay = document.getElementById(OVERLAY_ID);
  const body = document.getElementById(BODY_ID);
  if (!overlay || !body) {
    logger.warn('[MsgFullscreen] overlay/body element missing');
    return null;
  }
  return {
    overlay,
    body,
    title: document.getElementById(TITLE_ID),
    copyBtn: document.getElementById(COPY_BTN_ID),
    closeBtn: document.getElementById(CLOSE_BTN_ID),
  };
}

/**
 * 进入全屏：把消息节点移入覆盖层 body，原位留注释锚点
 * @param {HTMLElement} messageEl - .message 节点
 */
export function openMessageFullscreen(messageEl) {
  if (!messageEl) return;
  const parts = getOverlayParts();
  if (!parts) return;
  if (currentEl === messageEl) return;
  // 首次进入（非切换）先记录主列表滚动位置，供最终退出时还原
  if (!currentEl) {
    const c = document.getElementById('chatContainer');
    chatScrollBefore = c ? c.scrollTop : null;
  }
  // 切换目标：前一条先归位，但暂不还原滚动（保持最初记录的位置）
  if (currentEl) {
    switching = true;
    closeMessageFullscreen();
    switching = false;
  }

  anchor = document.createComment('msg-fullscreen-anchor');
  messageEl.parentNode.insertBefore(anchor, messageEl);
  messageEl.dataset.fullscreen = '1';
  parts.body.appendChild(messageEl);
  currentEl = messageEl;

  parts.overlay.style.display = 'flex';
  document.body.classList.add('message-fullscreen-viewing');
  if (parts.title) parts.title.textContent = t('msgFullscreen.title');
  if (parts.copyBtn) parts.copyBtn.title = t('msgFullscreen.copyTitle');
  if (parts.closeBtn) parts.closeBtn.title = t('msgFullscreen.closeTitle');
  // 头栏导出菜单（惰性构建一次，插在退出按钮之前）
  ensureHeaderExportMenu();

  // 流式跟随：全屏 body 是新的滚动容器，内容增高时滚到底（用户上滚则暂停跟随）
  startFollowScroll(parts.body);
}

/** 退出全屏：节点按锚点归位，清理标志与占位 */
export function closeMessageFullscreen() {
  if (!currentEl) return;
  const parts = getOverlayParts();
  stopFollowScroll();
  hideHeaderExportDropdown();

  if (anchor && anchor.parentNode) {
    anchor.parentNode.insertBefore(currentEl, anchor);
  } else if (parts) {
    // 锚点所在容器已被重建（如会话切换全量重渲染）：回退到消息区末尾
    const container = document.getElementById('chatContainer');
    if (container) container.appendChild(currentEl);
  }
  if (anchor && anchor.parentNode) anchor.parentNode.removeChild(anchor);
  delete currentEl.dataset.fullscreen;
  currentEl = null;
  anchor = null;

  if (parts) {
    parts.overlay.style.display = 'none';
    parts.body.innerHTML = '';
    // rail 是覆盖层常驻节点（不随 body 清空），退出时移除其中残留的目录容器，
    // 避免下次打开另一条时头栏右缘残留上一次的目录入口
    const rail = parts.overlay.querySelector('.message-fullscreen-rail');
    if (rail) rail.querySelectorAll('.message-toc-container').forEach((n) => n.remove());
  }
  document.body.classList.remove('message-fullscreen-viewing');

  // 真正退出（非切换中转）时还原主列表滚动到进入前位置
  if (!switching && chatScrollBefore !== null) {
    const container = document.getElementById('chatContainer');
    if (container) container.scrollTop = chatScrollBefore;
    chatScrollBefore = null;
  }
}

/** 对同一条消息开/关；传入另一条则切换 */
export function toggleMessageFullscreen(messageEl) {
  if (currentEl && currentEl === messageEl) {
    closeMessageFullscreen();
    return;
  }
  openMessageFullscreen(messageEl || getLastAssistantMessage());
}

// ---------- 流式跟随滚动 ----------

function startFollowScroll(body) {
  stopFollowScroll();
  followPaused = false;
  body.scrollTop = body.scrollHeight;
  body.addEventListener('scroll', onFollowScroll, { passive: true });
  if (typeof ResizeObserver !== 'undefined') {
    followObserver = new ResizeObserver(() => {
      if (!followPaused) body.scrollTop = body.scrollHeight;
    });
    followObserver.observe(body.firstElementChild || body);
  }
}

function onFollowScroll() {
  const body = document.getElementById(BODY_ID);
  if (!body) return;
  // 距底部超过阈值视为用户上滚，暂停自动跟随
  followPaused = body.scrollHeight - body.scrollTop - body.clientHeight > 60;
}

function stopFollowScroll() {
  const body = document.getElementById(BODY_ID);
  if (body) body.removeEventListener('scroll', onFollowScroll);
  if (followObserver) {
    followObserver.disconnect();
    followObserver = null;
  }
}

// ---------- 入口绑定（document 级委托，历史消息免重绑） ----------

function onDocKeydown(e) {
  // Alt+F（不含其他修饰键）：开/关全屏。已激活则直接关闭——
  // 不能用 toggle(getLastAssistantMessage())，因为全屏后该节点已移出 #chatContainer 查不到
  if (e.altKey && !e.ctrlKey && !e.metaKey && !e.shiftKey && e.code === 'KeyF') {
    e.preventDefault();
    if (currentEl) closeMessageFullscreen();
    else openMessageFullscreen(getLastAssistantMessage());
    return;
  }
  // 全屏中 Esc 优先消费：阻断传播，避免误触问题列表/快捷键面板的 Esc 逻辑
  if (e.key === 'Escape' && currentEl) {
    e.preventDefault();
    e.stopImmediatePropagation();
    closeMessageFullscreen();
  }
}

function onDocDblClick(e) {
  // Alt+双击助手消息：进入全屏（Ctrl/⌘+单击保留给复制/展开，Shift 保留给划词选区）
  if (!e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
  const msg = e.target.closest?.('#chatContainer .message.assistant');
  if (!msg) return;
  e.preventDefault();
  toggleMessageFullscreen(msg);
}

async function onHeaderCopyClick(e) {
  if (!currentEl) return;
  // 延迟导入：chat-copy 与 chat-manager 存在既有循环依赖，静态导入会成环
  const { copyAssistantMessage } = await import('./chat-copy.js');
  copyAssistantMessage(currentEl, document.getElementById(COPY_BTN_ID), e);
}

// 头栏导出菜单：与消息 footer 的“导出”同功能，作用于当前全屏节点。
// 格式项图标用 currentColor 线性风格，跟随头栏其它按钮与主题；导出实现按需
// import chat-export（docx 等重依赖不进首屏 chunk，与 footer 同策略）。
const EXPORT_ICONS = {
  docx: '<path d="M4 1.5h6L13 4.5v10H4z"/><path d="M10 1.5v3h3"/><path d="M6 8h4M6 10.5h4"/>',
  pdf: '<path d="M4 1.5h6L13 4.5v10H4z"/><path d="M10 1.5v3h3"/><path d="M6.5 11.5c2-1 2.5-4 1-4s-1 4 2 4"/>',
  image: '<rect x="2.5" y="3" width="11" height="10" rx="1.2"/><circle cx="6" cy="6.5" r="1"/><path d="M13.5 10 10 6.5 4.5 12.5"/>',
  markdown: '<path d="M2.5 12V4l3 3 3-3v8"/><path d="M12.5 4v6m0 0 2-2.2m-2 2.2L10.5 7.8"/>',
};

function buildHeaderExportMenu() {
  const wrap = document.createElement('div');
  wrap.className = 'message-fullscreen-export';

  const trigger = document.createElement('button');
  trigger.className = 'message-fullscreen-icon-btn';
  trigger.id = EXPORT_BTN_ID;
  trigger.type = 'button';
  trigger.title = t('msgFullscreen.exportTitle');
  trigger.innerHTML = [
    '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" width="16" height="16">',
    '<path d="M8 2v8m0 0 3-3M8 10 5 7M2.5 13.5h11"/>',
    '</svg>',
    `<span>${t('msgFullscreen.export')}</span>`,
    '<svg class="dropdown-arrow" width="8" height="6" viewBox="0 0 8 6" fill="currentColor"><path d="M0 0l4 6 4-6z"/></svg>',
  ].join('');

  const dropdown = document.createElement('div');
  dropdown.className = 'message-fullscreen-export-dropdown';
  dropdown.id = EXPORT_DROPDOWN_ID;
  const itemSvg = (key) => `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round">${EXPORT_ICONS[key]}</svg>`;
  dropdown.innerHTML = [
    `<button class="export-dropdown-item export-docx-item" type="button">${itemSvg('docx')}<span>${t('msgFullscreen.exportWord')}</span></button>`,
    `<button class="export-dropdown-item export-pdf-item" type="button">${itemSvg('pdf')}<span>${t('msgFullscreen.exportPdf')}</span></button>`,
    `<button class="export-dropdown-item export-image-item" type="button">${itemSvg('image')}<span>${t('msgFullscreen.exportImage')}</span></button>`,
    `<button class="export-dropdown-item export-md-item" type="button">${itemSvg('markdown')}<span>${t('msgFullscreen.exportMarkdown')}</span></button>`,
  ].join('');

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    dropdown.classList.toggle('show');
  });

  const wireItem = (selector, fnName) => {
    const item = dropdown.querySelector(selector);
    item.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (!currentEl) return;
      dropdown.classList.remove('show');
      const chatExport = await import('./chat-export.js');
      chatExport[fnName](currentEl, item, dropdown);
    });
  };
  wireItem('.export-docx-item', 'exportAssistantMessageToDocx');
  wireItem('.export-pdf-item', 'exportAssistantMessageToPdf');
  wireItem('.export-image-item', 'exportAssistantMessageToImage');
  wireItem('.export-md-item', 'exportAssistantMessageToMarkdown');

  wrap.appendChild(trigger);
  wrap.appendChild(dropdown);
  return wrap;
}

/** 惰性构建头栏导出菜单并插入到退出按钮之前（幂等，已存在则跳过） */
function ensureHeaderExportMenu() {
  if (document.getElementById(EXPORT_BTN_ID)) return;
  const closeBtn = document.getElementById(CLOSE_BTN_ID);
  const host = closeBtn ? closeBtn.parentNode : document.querySelector('.message-fullscreen-actions');
  if (!host) return;
  host.insertBefore(buildHeaderExportMenu(), closeBtn || null);
}

function hideHeaderExportDropdown() {
  const dd = document.getElementById(EXPORT_DROPDOWN_ID);
  if (dd) dd.classList.remove('show');
}


let bound = false;

/** 初始化全屏模块的 document 级监听（幂等），由 side_panel 启动流程调用 */
export function initMessageFullscreen() {
  if (bound) return;
  bound = true;

  // 捕获阶段 + 只认 class：footer 按钮在 addMessage 与流式 finalize 两处创建，
  // 委托免于逐消息绑定，也天然覆盖缓存恢复的历史消息（与 PERF-10 工具栏委托同模式）
  document.addEventListener('click', (e) => {
    // 点击导出菜单之外时收起下拉
    const dd = document.getElementById(EXPORT_DROPDOWN_ID);
    if (dd && dd.classList.contains('show') && !e.target.closest?.('.message-fullscreen-export')) {
      dd.classList.remove('show');
    }
    const btn = e.target.closest?.('.fullscreen-btn');
    if (btn) {
      e.stopPropagation();
      toggleMessageFullscreen(btn.closest('.message'));
      return;
    }
    if (e.target.closest?.('#' + CLOSE_BTN_ID)) {
      e.stopPropagation();
      closeMessageFullscreen();
      return;
    }
    if (e.target.closest?.('#' + COPY_BTN_ID)) {
      e.stopPropagation();
      onHeaderCopyClick(e);
    }
  }, true);

  document.addEventListener('keydown', onDocKeydown, true);
  document.addEventListener('dblclick', onDocDblClick, true);
}
