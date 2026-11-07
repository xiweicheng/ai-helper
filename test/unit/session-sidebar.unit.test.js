// @vitest-environment jsdom
// test/unit/session-sidebar.unit.test.js - 左侧纵向会话栏
// 左栏与横向 session-tabs 并存：标签栏快速切换，左栏做全量管理器（搜索/归档/批量关闭）。
// 三态：宽屏收起=36px 图标轨；宽屏展开=200-480px 可拖拽面板；窄屏（mainRow<560）整条隐藏，
// ⋯ 回退打开全屏覆盖列表（兜底视图，sessionDropdown 保留不删）。本文件用源码守卫锁定这些约定。
import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

const html = read('side_panel.html');
const src = read('src/side_panel/session-manager-ui.js');
const css = read('src/side_panel/styles.css');

/** 截取函数体辅助：从 anchor 开始取 len 字符 */
const sliceFrom = (anchor, len = 1200, source = src) => {
  const idx = source.indexOf(anchor);
  expect(idx, `找不到锚点：${anchor}`).toBeGreaterThan(-1);
  return source.slice(idx, idx + len);
};

describe('左栏 DOM 结构（源码守卫）', () => {
  it('左栏容器插在 mainRow 内、mainLeft 前，作 main-left 的兄弟节点', () => {
    const mainRowIdx = html.indexOf('id="mainRow"');
    const sidebarIdx = html.indexOf('id="sessionSidebar"');
    const mainLeftIdx = html.indexOf('id="mainLeft"');
    expect(mainRowIdx).toBeGreaterThan(-1);
    expect(sidebarIdx).toBeGreaterThan(mainRowIdx);
    expect(sidebarIdx).toBeLessThan(mainLeftIdx);
  });

  it('图标轨与展开面板的全部控件 id 齐全', () => {
    // 图标轨
    expect(html).toContain('id="sessionSidebarExpand"');
    expect(html).toContain('id="sessionRailAdd"');
    expect(html).toContain('id="sessionRailSearch"');
    expect(html).toContain('id="sessionRailArchiveEntry"');
    // 收起态图标轨不展示归档数量（无意义的注意力干扰），只有图标
    expect(html).not.toContain('sessionRailArchiveCount');
    // 展开面板
    expect(html).toContain('id="sessionSidebarCollapse"');
    expect(html).toContain('id="sessionSidebarAdd"');
    expect(html).toContain('id="sessionSidebarSearch"');
    expect(html).toContain('id="sessionSidebarSearchClear"');
    expect(html).toContain('id="sessionSidebarList"');
    expect(html).toContain('id="sessionSidebarArchiveEntry"');
    expect(html).toContain('id="sessionSidebarArchiveLabel"');
    expect(html).toContain('id="sessionSidebarCloseAll"');
    // 宽度拖拽把手
    expect(html).toContain('id="sessionSidebarGrip"');
  });

  it('全屏会话列表（sessionDropdown）保留不删，角色降级为窄屏兜底视图', () => {
    expect(html).toContain('id="sessionDropdown"');
    expect(html).toContain('id="sessionDropdownSearch"');
    expect(html).toContain('id="sessionDropdownList"');
    expect(html).toContain('id="sessionArchiveEntry"');
    expect(html).toContain('id="sessionArchiveEntryLabel"');
  });

  it('新建会话入口两态都有：图标轨 ＋ 与展开面板头部 ＋ 绑同一个 newSession', () => {
    const init = sliceFrom('async function initSessionSidebar', 3000);
    expect(init).toContain("document.getElementById('sessionRailAdd')?.addEventListener('click', () => { void newSession(); })");
    expect(init).toContain("document.getElementById('sessionSidebarAdd')?.addEventListener('click', () => { void newSession(); })");
    // 复用既有 i18n key，不另起新 key
    expect(html).toContain('id="sessionSidebarAdd" data-i18n-title="session.newSessionTitle"');
  });
});

describe('左栏三态与窄屏兜底（源码守卫）', () => {
  it('窄屏阈值 = 左栏最小 200 + 对话区至少 360', () => {
    expect(src).toContain('const SIDEBAR_MIN_TOTAL_W = 560');
    expect(src).toContain('const SIDEBAR_MIN_W = 200');
    expect(src).toContain('const SIDEBAR_MAX_W = 480');
  });

  it('窄屏时整条左栏隐藏（图标轨也不留），用 sidebar-hidden 类控制', () => {
    const apply = sliceFrom('function applySidebarState', 500);
    expect(apply).toContain("classList.toggle('sidebar-hidden', sidebarState.narrow)");
    expect(apply).toContain("classList.toggle('expanded', !sidebarState.narrow && sidebarState.expanded)");
    expect(css).toContain('.session-sidebar.sidebar-hidden');
  });

  it('⋯ 按钮按宽度分流：宽屏 toggle 左栏，窄屏打开全屏覆盖列表', () => {
    const toggle = sliceFrom('function toggleSidebarOrOverlay', 400);
    expect(toggle).toContain('isSidebarNarrow()');
    expect(toggle).toContain('toggleDropdown()');
    expect(toggle).toContain('expandSidebar()');
    // bindMoreButton 不再直接 toggleDropdown
    const bind = sliceFrom('function bindMoreButton', 500);
    expect(bind).toContain('toggleSidebarOrOverlay()');
    expect(bind).not.toContain('toggleDropdown();');
  });

  it('宽屏时 ⋯ 恒隐藏（与图标轨 » 重复），窄屏才按溢出/归档数显隐', () => {
    const check = sliceFrom('function checkOverflow', 600);
    expect(check).toContain('if (!isSidebarNarrow()) {');
    expect(check).toContain("moreBtn.style.display = 'none';");
    // 窄屏分支保留原有显隐条件（归档测试守卫的表达式不可丢）
    expect(check).toContain('scrollWidth > scrollContainer.clientWidth');
    expect(check).toContain('archivedCountForMoreBtn > 0');
  });

  it('窄屏时 expandSidebar 直接拒绝停靠', () => {
    const expand = sliceFrom('function expandSidebar', 300);
    expect(expand).toContain('if (isSidebarNarrow()) return;');
  });

  it('展开中被挤窄：记 pendingRestore 不清除偏好，宽度恢复后自动重新展开', () => {
    const ro = sliceFrom('function setupSidebarResizeObserver', 900);
    expect(ro).toContain('sidebarState.pendingRestore = true');
    expect(ro).toContain('sidebarState.pendingRestore = false');
    expect(ro).toContain('applySidebarState()');
    // pendingRestore 期间不做 expanded=false，持久化偏好必须保住
    expect(ro).not.toContain('sidebarState.expanded = false');
  });
});

describe('左栏偏好持久化与宽度拖拽（源码守卫）', () => {
  it('展开态与宽度持久化到 chrome.storage.local', () => {
    expect(src).toContain("const STORAGE_SIDEBAR_EXPANDED = 'sessionSidebarExpanded'");
    expect(src).toContain("const STORAGE_SIDEBAR_WIDTH = 'sessionSidebarWidth'");
    const persist = sliceFrom('async function persistSidebarState', 400);
    expect(persist).toContain('chrome.storage.local.set');
    const init = sliceFrom('async function initSessionSidebar', 700);
    expect(init).toContain('chrome.storage.local.get');
  });

  it('拖拽把手复用 mousedown/mousemove/mouseup + CSS var 模式，宽度 clamp 在 200-480', () => {
    const grip = sliceFrom('function setupSidebarGrip', 1200);
    expect(grip).toContain("addEventListener('mousedown'");
    expect(grip).toContain("addEventListener('mousemove'");
    expect(grip).toContain("addEventListener('mouseup'");
    expect(grip).toContain('clampSidebarWidth(');
    expect(grip).toContain("--session-sidebar-width");
    const clamp = sliceFrom('function clampSidebarWidth', 300);
    expect(clamp).toContain('SIDEBAR_MIN_W');
    expect(clamp).toContain('SIDEBAR_MAX_W');
    // 动态上限：拖拽再宽也不能把对话区挤到 360 以下
    expect(clamp).toContain('mainRow.clientWidth - CHAT_MIN_W');
  });

  it('启动即窄屏且偏好为展开时挂起 pendingRestore', () => {
    const init = sliceFrom('async function initSessionSidebar', 700);
    expect(init).toContain('sidebarState.pendingRestore = true');
  });
});

describe('左栏列表复用与联动（源码守卫）', () => {
  it('全屏列表与左栏共用同一套行渲染（renderSessionListView / createSessionListItem）', () => {
    const dropdown = sliceFrom('function renderDropdownList', 400);
    expect(dropdown).toContain('renderSessionListView({');
    const sidebar = sliceFrom('function renderSidebarList', 400);
    expect(sidebar).toContain('renderSessionListView({');
    expect(src).toContain('function createSessionListItem(session, { index, highlightIndex, onSelect })');
  });

  it('左栏点选会话不收起（常驻管理器），全屏列表点选仍关闭自身', () => {
    const sidebarSelect = sliceFrom('async function handleSidebarSelectSession', 300);
    expect(sidebarSelect).toContain('handleSessionSwitch(sessionId)');
    expect(sidebarSelect).not.toContain('collapseSidebar()');
    const dropdownSelect = sliceFrom('async function handleDropdownSelectSession', 300);
    expect(dropdownSelect).toContain('closeDropdown()');
  });

  it('renderSessionTabs 尾部同步刷新左栏列表并幂等初始化', () => {
    const render = sliceFrom('export async function renderSessionTabs', 6000);
    expect(render).toContain('refreshSidebarView()');
    expect(render).toContain('void initSessionSidebar()');
  });

  it('激活会话联动：激活项变化时滚动进可视区，手动滚动浏览时不被拽回', () => {
    const render = sliceFrom('function renderSidebarList', 800);
    expect(render).toContain('sidebarState.lastActiveId');
    expect(render).toContain(".session-dropdown-item.active");
    expect(render).toContain("scrollIntoView({ block: 'nearest' })");
  });

  it('左栏搜索框键盘导航与全屏列表同款（上下/Enter/Escape 收起）', () => {
    const keydown = sliceFrom('function handleSidebarKeydown', 1100);
    expect(keydown).toContain("case 'ArrowDown'");
    expect(keydown).toContain("case 'ArrowUp'");
    expect(keydown).toContain("case 'Enter'");
    expect(keydown).toContain("case 'Escape'");
    expect(keydown).toContain('collapseSidebar()');
  });

  it('归档计数：文字入口统一「归档区(N)」括号形式（同关闭全部），收起态图标轨不显示数字', () => {
    const refresh = sliceFrom('async function refreshArchiveEntryCount', 900);
    // 两处文字入口（全屏列表底部 + 展开面板底部）同源用括号文本
    expect(refresh).toContain('sessionArchiveEntryLabel');
    expect(refresh).toContain('sessionSidebarArchiveLabel');
    expect(refresh).toContain("t('session.archiveEntryCount'");
    // 收起态图标轨不展示归档数量
    expect(refresh).not.toContain('sessionRailArchiveCount');
    // i18n key 中英文齐全
    expect(src).toContain("archiveEntryCount: '归档区({count})'");
    expect(src).toContain("archiveEntryCount: 'Archived ({count})'");
  });

  it('归档面板返回按宽度分流：宽屏展开左栏，窄屏打开全屏兜底列表', () => {
    const ret = sliceFrom('function returnToSessionListView', 300);
    expect(ret).toContain('isSidebarNarrow()');
    expect(ret).toContain('openDropdown()');
    expect(ret).toContain('expandSidebar()');
    // 返回按钮与归档搜索框 Escape 都走这条分流
    expect(src).toMatch(/sessionArchiveBackBtn[\s\S]{0,300}returnToSessionListView\(\)/);
    const panel = sliceFrom('function initArchivePanel', 2400);
    expect(panel.match(/returnToSessionListView\(\)/g)?.length ?? 0).toBeGreaterThanOrEqual(2);
  });

  it('高亮滚动限定容器，避免左栏与全屏列表互相滚错', () => {
    const scroll = sliceFrom('function scrollHighlightedIntoView', 400);
    expect(scroll).toContain('containerEl || document');
  });

  it('执行中会话停靠条（.session-dock）为左栏让位：left 跟随 CSS 变量，拖拽时实时更新', () => {
    // CSS：left 不再写死 0，改读 --session-sidebar-offset
    const dock = css.slice(css.indexOf('.session-dock {'), css.indexOf('.session-dock {') + 300);
    expect(dock).toContain('left: var(--session-sidebar-offset, 0px)');
    // JS：applySidebarState 维护该变量（隐藏 0 / 图标轨 36 / 面板宽度），拖拽把手 onMove 实时跟随
    const offsetFn = sliceFrom('function updateSidebarOffsetVar', 300);
    expect(offsetFn).toContain("--session-sidebar-offset");
    const apply = sliceFrom('function applySidebarState', 500);
    expect(apply).toContain('updateSidebarOffsetVar()');
    const grip = sliceFrom('function setupSidebarGrip', 900);
    expect(grip).toContain('updateSidebarOffsetVar()');
  });
});

describe('左栏样式与文案（源码守卫）', () => {
  it('核心样式：收起 36px、展开 CSS var 宽度、grip col-resize', () => {
    expect(css).toContain('.session-sidebar {');
    expect(css).toContain('width: 36px');
    expect(css).toContain('.session-sidebar.expanded');
    expect(css).toContain('var(--session-sidebar-width, 240px)');
    expect(css).toContain('.session-sidebar-grip');
    expect(css).toContain('cursor: col-resize');
  });

  it('行操作按钮可读性：hover 时用行底色遮住标题，图标基色提一档', () => {
    // 窄行下图标直接压在标题文字上（actions 是绝对定位无背景），必须用行 hover 底色遮住
    expect(css).toContain('.session-dropdown-item:hover .session-dropdown-item-actions');
    expect(css).toContain('background: var(--bg-subtle)');
    // --text-disabled 在 hover 底色上对比不足，统一提到 --text-tertiary
    expect(css).toMatch(/\.session-dropdown-item-rename,[\s\S]*?color: var\(--text-tertiary\)/);
  });

  it('激活行选中态加强：品牌浅底色 + 左缘 inset 指示条（不占布局）', () => {
    expect(css).toMatch(/\.session-dropdown-item\.active \{[\s\S]*?background: var\(--brand-soft-bg\)/);
    expect(css).toMatch(/\.session-dropdown-item\.active \{[\s\S]*?box-shadow: inset 3px 0 0 var\(--brand-500\)/);
  });

  it('新增 i18n key 中英文齐全', () => {
    expect(src).toContain("expandSidebar: '展开会话列表'");
    expect(src).toContain("collapseSidebar: '收起会话列表'");
    expect(src).toContain("expandSidebar: 'Expand session list'");
    expect(src).toContain("collapseSidebar: 'Collapse session list'");
  });

  it('今天的时间只显示 HH:mm，不带「今天」二字（默认就是今天）', () => {
    // 昨天及更早仍保留相对日期，否则只看到 HH:mm 无法判断是哪天
    expect(src).toContain("todayFormat: '{hour}:{minute}'");
    expect(src).not.toContain("todayFormat: '今天 {hour}:{minute}'");
    expect(src).not.toContain("todayFormat: 'Today {hour}:{minute}'");
    expect(src).toContain("yesterdayFormat: '昨天 {hour}:{minute}'");
  });
});
