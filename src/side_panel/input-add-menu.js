// side_panel/input-add-menu.js - 底行 "+" 添加菜单
//
// 职责：
//   1) 开合菜单：点击 "+" 切换；点击菜单项或菜单外部关闭；打开时互斥收起
//      已打开的选择器弹窗（/ @ $ 三弹窗，避免浮层遮挡菜单）；
//   2) "+" 蓝点：菜单开关区内存在已激活开关时显示（划词 ④ 级降级移入的场景）；
//   3) 选择器直达：8 个菜单项打开对应弹窗并定位到目标 Tab/视图（/、@ 弹窗各 Tab
//      与 $ 文件选择器的统一入口），每次打开菜单刷新可见性——不可用项自动隐藏
//      （与弹窗内 Tab 的可见性判定一致）；
//   4) 悬停二级面板：悬停提示词/技能/MCP/网页四项时在菜单右侧展开独立浮层卡片
//      「搜索 + 列表」（防误触 200ms），可直接选择触发；鼠标移出菜单 150ms 后收起，
//      窄屏越界由 clampPanelPosition 收敛到视口内。与“点击打开弹窗”双通道并存
//      （面板逻辑见 input-add-menu-panel.js）。
//
// 选择器项 handler 会 stopPropagation，避免刚打开的弹窗被 document 冒泡层的“点击外部关闭”
// 逻辑立即关闭；因此菜单收起使用 capture 阶段监听（先于 stopPropagation 执行）。截图/附件
// 项的业务监听仍由各模块在 index.js 绑定（id 不变），本模块不重复绑定。

import { showPromptSelector, hidePromptSelector } from './prompt-manager.js';
import {
  showAgentAtSelector, hideAgentAtSelector,
  getPairedAgents, fetchKnowledgeCollections
} from './agent-at-selector.js';
import { showFileAtSelector, hideFileAtSelector } from './file-at-selector.js';
import { shouldShowSkillsTab, shouldShowMcpTab } from './skill-selector.js';
import { getWorkspaceRoot } from './workspace-manager.js';
import {
  initInputAddPanel, openCategoryPanel, closeCategoryPanel,
  isCategoryPanelOpen, getPanelCategory, isPanelSearchFocused,
} from './input-add-menu-panel.js';

// 可见性刷新序号：快速重复开合菜单时只应用最后一次刷新的结果
let visibilitySeq = 0;

// 二级面板悬停时序：展开防误触 200ms；收起防抖动 150ms
const SHOW_DELAY = 200;
const HIDE_DELAY = 150;
const PANEL_ITEMS = {
  promptTriggerBtn: 'prompts',
  addMenuSkillBtn: 'skills',
  addMenuMcpBtn: 'mcp',
  addMenuPageBtn: 'pages',
};

/**
 * 菜单打开时刷新选择器项可见性（与弹窗 Tab 可见性判定一致）：
 * 技能/MCP 依赖连接与开关状态、知识库依赖 RAG 可用性、代理依赖配对列表、
 * 工作目录依赖已连接 Agent 的工作目录；判定失败的项保持显示（宁可显示后
 * 打开为空，也不误藏可用入口）。
 */
async function refreshSelectorVisibility() {
  const checks = [
    { id: 'addMenuSkillBtn', available: () => shouldShowSkillsTab() },
    { id: 'addMenuMcpBtn', available: () => shouldShowMcpTab() },
    { id: 'addMenuKnowledgeBtn', available: async () => (await fetchKnowledgeCollections()).ok },
    { id: 'addMenuProxyBtn', available: async () => (await getPairedAgents()).length > 0 },
    { id: 'addMenuWorkspaceBtn', available: async () => !!(await getWorkspaceRoot()) },
  ];
  const seq = ++visibilitySeq;
  await Promise.all(checks.map(async ({ id, available }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    let visible = true;
    try {
      visible = await available();
    } catch {
      visible = true;
    }
    if (seq !== visibilitySeq) return; // 已有更新的刷新进行中，丢弃过期结果
    btn.style.display = visible ? '' : 'none';
  }));
}

export function initInputAddMenu() {
  const addBtn = document.getElementById('inputAddBtn');
  const menu = document.getElementById('inputAddMenu');
  if (!addBtn || !menu) return;
  const wrapper = addBtn.closest('.input-add-wrapper');
  const nav = menu.querySelector('.input-add-nav');
  let showTimer = null;
  let hideTimer = null;
  let isPointerInMenu = false;

  const syncPanelActive = () => {
    const active = isCategoryPanelOpen() ? getPanelCategory() : null;
    menu.querySelectorAll('.input-add-item').forEach((el) => {
      el.classList.toggle('panel-active', !!active && PANEL_ITEMS[el.id] === active);
    });
  };

  // 面板定位：水平贴菜单右侧 +8px（越视口右缘时 clamp）；
  // 垂直与展开项顶部对齐（常规二级菜单惯例），超出菜单底部时整体上移
  const clampPanelPosition = (anchorEl) => {
    const panel = document.getElementById('inputAddPanel');
    if (!panel || panel.style.display === 'none') return;
    panel.style.left = ''; // 先复位到 CSS 默认位置再测量
    const menuRect = menu.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();
    const gap = 8;
    let left = menuRect.right + gap;
    if (left + panelRect.width > window.innerWidth - gap) {
      left = window.innerWidth - gap - panelRect.width;
    }
    if (left < gap) left = gap;
    panel.style.left = `${Math.round(left - menuRect.left)}px`;

    const item = anchorEl || menu.querySelector('.input-add-item.panel-active');
    const itemRect = item ? item.getBoundingClientRect() : menuRect;
    let top = itemRect.top;
    if (top + panelRect.height > menuRect.bottom) top = menuRect.bottom - panelRect.height;
    if (top < gap) top = gap;
    panel.style.top = `${Math.round(top - menuRect.top - menu.clientTop)}px`;
  };

  const setOpen = (open) => {
    menu.style.display = open ? '' : 'none';
    if (open) {
      closeCategoryPanel(); // 每次打开从单栏开始
      syncPanelActive();
      refreshSelectorVisibility();
    } else {
      if (showTimer) { clearTimeout(showTimer); showTimer = null; }
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      closeCategoryPanel();
      syncPanelActive();
    }
  };
  const isOpen = () => menu.style.display !== 'none';

  // 面板初始化（须在 setOpen 定义之后：onRequestClose 闭包引用它）
  initInputAddPanel({ onRequestClose: () => setOpen(false) });

  // 点击 "+" 切换开合；打开时互斥收起已打开的选择器弹窗
  // （弹窗浮层 z-index 高于菜单，不收起会遮挡新打开的菜单）
  addBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    const opening = !isOpen();
    if (opening) {
      hidePromptSelector();
      hideAgentAtSelector();
      hideFileAtSelector();
    }
    setOpen(opening);
  });

  // 点击菜单项后自动关闭：capture 阶段先于按钮自身的 handler（其会
  // stopPropagation 阻断冒泡），保证业务逻辑执行的同时菜单收起
  menu.addEventListener('click', (e) => {
    if (e.target.closest && e.target.closest('.input-add-item')) setOpen(false);
  }, true);

  // 点击菜单外部关闭
  document.addEventListener('click', (e) => {
    if (!isOpen()) return;
    if (wrapper && wrapper.contains(e.target)) return;
    setOpen(false);
  });

  // 面板悬停状态机：防抖展开/收起（委托挂 .input-add-nav——面板内移动的 mouseover
  // 不经过 nav，天然不会触发收起）
  const scheduleHide = () => {
    if (showTimer) { clearTimeout(showTimer); showTimer = null; }
    if (hideTimer) clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      hideTimer = null;
      if (isPanelSearchFocused()) return; // 搜索中不收起（blur 时补判）
      closeCategoryPanel();
      syncPanelActive();
    }, HIDE_DELAY);
  };

  if (nav) {
    nav.addEventListener('mouseover', (e) => {
      if (!isOpen()) return;
      const item = e.target.closest('.input-add-item');
      const category = item ? PANEL_ITEMS[item.id] : null;
      if (!category) { scheduleHide(); return; } // 非面板项 / 左列空白 → 延迟收起
      if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
      // 已展开同类别：no-op
      if (isCategoryPanelOpen() && getPanelCategory() === category) return;
      if (showTimer) clearTimeout(showTimer);
      showTimer = setTimeout(async () => {
        showTimer = null;
        const loading = openCategoryPanel(category);
        clampPanelPosition(item); // display:flex 已置位（openCategoryPanel 同步段），先对齐一次
        try {
          await loading;
        } catch {
          // 面板内部已兜底（失败显示空态），此处仅防意外未处理拒绝
        }
        clampPanelPosition(item); // 数据渲染后高度变化 → 重新垂直对齐
        syncPanelActive();
      }, SHOW_DELAY);
    });
  }

  menu.addEventListener('mouseenter', () => {
    isPointerInMenu = true;
    if (hideTimer) { clearTimeout(hideTimer); hideTimer = null; }
  });
  menu.addEventListener('mouseleave', () => {
    isPointerInMenu = false;
    scheduleHide();
  });

  // 搜索框失焦补判：鼠标不在菜单内且已失焦 → 防抖收起
  const panelSearch = document.getElementById('inputAddPanelSearch');
  if (panelSearch) {
    panelSearch.addEventListener('blur', () => {
      if (!isPointerInMenu) scheduleHide();
    });
  }

  // 面板展开期间窗口宽度变化（侧边栏拖宽/缩窄）→ 重新 clamp 位置
  window.addEventListener('resize', () => {
    if (isCategoryPanelOpen()) clampPanelPosition();
  });

  // 选择器直达项：点击打开对应弹窗并定位目标 Tab（先互斥收起其他弹窗）
  const selectorItems = [
    { id: 'promptTriggerBtn', open: () => showPromptSelector('', 'prompts') },
    { id: 'addMenuSkillBtn', open: () => showPromptSelector('', 'skills') },
    { id: 'addMenuMcpBtn', open: () => showPromptSelector('', 'mcp') },
    { id: 'addMenuPageBtn', open: () => showAgentAtSelector('', 'pages') },
    { id: 'addMenuKnowledgeBtn', open: () => showAgentAtSelector('', 'knowledge') },
    { id: 'addMenuAgentBtn', open: () => showAgentAtSelector('', 'agents') },
    { id: 'addMenuProxyBtn', open: () => showAgentAtSelector('', 'proxies') },
    { id: 'addMenuWorkspaceBtn', open: () => showFileAtSelector('') },
  ];
  selectorItems.forEach(({ id, open }) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('click', async (e) => {
      e.stopPropagation(); // 事件不冒泡到 document 外部关闭层，避免刚打开的弹窗被误关
      btn.blur();
      hidePromptSelector();
      hideAgentAtSelector();
      hideFileAtSelector();
      try {
        await open();
      } catch {
        // 打开失败（数据获取异常等）不阻塞输入
      }
      const input = document.getElementById('userInput');
      if (input) input.focus();
    });
  });

  // "+" 蓝点：开关区内有开启的开关时显示（当前仅划词会移入）
  const switches = document.getElementById('inputAddMenuSwitches');
  const syncDot = () => {
    const checkbox = switches?.querySelector('input[type="checkbox"]');
    addBtn.classList.toggle('has-active-switch', !!(checkbox && checkbox.checked));
  };
  if (switches) {
    if (typeof MutationObserver !== 'undefined') {
      new MutationObserver(syncDot).observe(switches, { subtree: true, childList: true });
    }
    // 开关切换（在菜单内操作划词）时同步蓝点
    switches.addEventListener('change', syncDot);
  }
  syncDot();
}
