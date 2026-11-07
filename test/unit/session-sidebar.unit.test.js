// @vitest-environment jsdom
// test/unit/session-sidebar.unit.test.js - 左侧纵向会话栏
// 左栏与横向 session-tabs 并存：标签栏快速切换，左栏做全量管理器（搜索/归档/批量关闭）。
// 两种形态：宽屏收起=不占位（标签栏左端只留切换图标）；宽屏展开=200-480px 可拖拽面板；窄屏（mainRow<560）
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

  it('展开面板与切换按钮的全部控件 id 齐全，收起态不留竖向窄条', () => {
    // 切换入口在标签栏左端，收起时不占位
    expect(html).toContain('id="sessionSidebarToggle"');
    expect(html.indexOf('id="sessionSidebarToggle"')).toBeLessThan(html.indexOf('id="sessionTabsScroll"'));
    // 旧的收起态图标轨已整体移除
    expect(html).not.toContain('id="sessionSidebarRail"');
    expect(html).not.toContain('id="sessionSidebarExpand"');
    expect(html).not.toContain('id="sessionRailAdd"');
    expect(html).not.toContain('id="sessionRailSearch"');
    expect(html).not.toContain('id="sessionRailArchiveEntry"');
    // 展开面板：头部含新建与收起（收起与标签栏左端展开图标互斥显示）
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

  it('切换按钮点击走 toggleSidebarOrOverlay，展开面板头部 ＋ 绑 newSession、« 绑 collapseSidebar', () => {
    const init = sliceFrom('async function initSessionSidebar', 3000);
    expect(init).toContain("document.getElementById('sessionSidebarToggle')?.addEventListener('click', () => toggleSidebarOrOverlay())");
    expect(init).toContain("document.getElementById('sessionSidebarAdd')?.addEventListener('click', () => { void newSession(); })");
    expect(init).toContain("document.getElementById('sessionSidebarCollapse')?.addEventListener('click', () => collapseSidebar())");
    // 复用既有 i18n key，不另起新 key
    expect(html).toContain('id="sessionSidebarAdd" data-i18n-title="session.newSessionTitle"');
  });

  it('展开图标与收起按钮互斥显示：展开或窄屏时不显示标签栏左端图标', () => {
    const apply = sliceFrom('function applySidebarState', 800);
    expect(apply).toContain("classList.toggle('sidebar-hidden', sidebarState.narrow || sidebarState.expanded)");
  });

  it('两种会话列表不并存：左栏展开时整条标签栏隐藏，收起/窄屏回退时恢复并重定位激活标签', () => {
    const apply = sliceFrom('function applySidebarState', 1500);
    expect(apply).toContain('const hideTabs = !sidebarState.narrow && sidebarState.expanded;');
    expect(apply).toContain("tabsEl.classList.toggle('tabs-hidden', hideTabs)");
    // 标签栏隐藏时宽度为 0，重新出现必须重算激活标签位置
    expect(apply).toContain('scrollToActiveTab(scrollContainer)');
    expect(css).toContain('.session-tabs.tabs-hidden');
    expect(css).toMatch(/\.session-tabs\.tabs-hidden \{\s*display: none;/);
  });
});

describe('左栏三态与窄屏兜底（源码守卫）', () => {
  it('窄屏阈值 = 左栏最小 200 + 对话区至少 360', () => {
    expect(src).toContain('const SIDEBAR_MIN_TOTAL_W = 560');
    expect(src).toContain('const SIDEBAR_MIN_W = 200');
    expect(src).toContain('const SIDEBAR_MAX_W = 480');
  });

  it('窄屏时面板与切换图标一起隐藏，用 sidebar-hidden 类控制', () => {
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
    const init = sliceFrom('async function initSessionSidebar', 1300);
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
    const render = sliceFrom('function renderSidebarList', 1400);
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

  it('底部不展示数量：归档区与关闭全部都只显示文案，避免语言切换后数字丢失', () => {
    const refresh = sliceFrom('async function refreshArchiveEntryCount', 900);
    // 两处文字入口（全屏列表底部 + 展开面板底部）同源，且不带计数
    expect(refresh).toContain('sessionArchiveEntryLabel');
    expect(refresh).toContain('sessionSidebarArchiveLabel');
    expect(refresh).toContain("t('session.archiveEntry')");
    expect(refresh).not.toContain('archiveEntryCount');
    // 关闭全部按钮由 data-i18n 负责文案，渲染层不再写入带计数的文本
    expect(src).not.toContain('closeAllCount');
    expect(src).not.toContain('archiveEntryCount');
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

  it('执行中圆点顶替会话图标位，标题不因状态出现而位移', () => {
    const item = sliceFrom('function createSessionListItem', 2500);
    // 判据与横向 tab 一致，且执行中时圆点放进图标槽内而不是另起一个节点
    expect(item).toContain('session.isGenerating || state.generatingSessionIds.has(session.id)');
    expect(item).toContain('session-dropdown-item-running');
    expect(item).toMatch(/if \(isRunning\) \{[\s\S]{0,120}iconSpan\.appendChild\(runningDot\)/);
    // 图标槽固定 13×13：圆点替换图标时占位不变，文字起点不跳
    const iconCss = css.slice(css.indexOf('.session-dropdown-item-icon {'), css.indexOf('.session-dropdown-item-icon {') + 260);
    expect(iconCss).toContain('width: 13px');
    expect(iconCss).toContain('justify-content: center');
    // 圆点自身不再额外占位：只截 .session-dropdown-item-running 这一条规则，避免串到下一条
    const dotStart = css.indexOf('.session-dropdown-item-running {');
    const dotCss = css.slice(dotStart, css.indexOf('}', dotStart) + 1);
    expect(dotCss).toContain('animation: sessionPulse');
    expect(dotCss).not.toContain('margin-right');
  });

  it('执行中会话停靠条（.session-dock）为左栏让位：left 跟随 CSS 变量，拖拽时实时更新', () => {
    // CSS：left 不再写死 0，改读 --session-sidebar-offset
    const dock = css.slice(css.indexOf('.session-dock {'), css.indexOf('.session-dock {') + 300);
    expect(dock).toContain('left: var(--session-sidebar-offset, 0px)');
    // JS：applySidebarState 维护该变量（收起/隐藏 0 / 展开面板宽度），拖拽把手 onMove 实时跟随
    const offsetFn = sliceFrom('function updateSidebarOffsetVar', 300);
    expect(offsetFn).toContain("--session-sidebar-offset");
    const apply = sliceFrom('function applySidebarState', 500);
    expect(apply).toContain('updateSidebarOffsetVar()');
    const grip = sliceFrom('function setupSidebarGrip', 900);
    expect(grip).toContain('updateSidebarOffsetVar()');
  });
});

describe('左栏排序规则（手动 / 最近更新）', () => {
  it('默认手动排序：不按时间重排，只把共用的一份 order 倒序展示', () => {
    const filter = sliceFrom('function filterSidebarSessions', 700);
    expect(filter).toContain('sidebarState.sortMode === SIDEBAR_SORT_RECENT');
    expect(filter).toContain('? sortByUpdatedAt(filtered)');
    expect(filter).toContain(': filtered.reverse();');
    expect(src).toContain("const SIDEBAR_SORT_MANUAL = 'manual'");
    expect(src).toContain('sortMode: SIDEBAR_SORT_MANUAL');
  });

  it('排序偏好持久化：写入与其他偏好同一批，读回时校验取值', () => {
    expect(src).toContain("const STORAGE_SIDEBAR_SORT = 'sessionSidebarSortMode'");
    const persist = sliceFrom('async function persistSidebarState', 400);
    expect(persist).toContain('[STORAGE_SIDEBAR_SORT]: sidebarState.sortMode');
    const init = sliceFrom('async function initSessionSidebar', 900);
    expect(init).toContain('STORAGE_SIDEBAR_SORT');
  });

  it('互斥：手动可拖拽不分组；最近更新分组带批量关闭但不拖拽', () => {
    const list = sliceFrom('function renderSidebarList', 900);
    expect(list).toContain('grouped: isRecent');
    expect(list).toContain('draggable: !isRecent && !hasSearch');
    // 视图层：分组标题与分组批量关闭整体受 grouped 控制，拖拽单独受 draggable 控制
    const view = sliceFrom('function renderSessionListView', 2600);
    expect(view).toContain('grouped = true, draggable = false');
    expect(view).toContain('if (grouped) {');
    expect(view).toContain('if (draggable) bindListDrag(item, session.id);');
  });

  it('拖拽落点与标签栏同源：改 state.sessions 后持久化 order 并重渲染', () => {
    const drop = sliceFrom('async function handleSidebarDrop', 800);
    expect(drop).toContain('state.sessions = reordered;');
    expect(drop).toContain('await reorderSessions(reordered.map(s => s.id));');
    expect(drop).toContain('await renderSessionTabs();');
    // 搜索中禁用拖拽：子集顺序与真实 order 对不上，拖拽会让别的会话位置乱跳
    expect(src).toContain("const hasSearch = !!(document.getElementById('sessionSidebarSearch')?.value || '').trim();");
  });

  it('切换模式后重置滚动基准，把当前会话带回可视区', () => {
    const set = sliceFrom('function setSidebarSortMode', 800);
    expect(set).toContain('sidebarState.lastActiveId = null;');
    expect(set).toContain('filterSidebarSessions(');
    expect(set).toContain('void persistSidebarState();');
    const init = sliceFrom('async function initSessionSidebar', 3200);
    expect(init).toContain("btn.addEventListener('click', () => setSidebarSortMode(btn.dataset.mode))");
  });

  it('只翻转左栏展示顺序：新会话在左栏顶端，顶部标签栏仍留在最右侧', () => {
    const filter = sliceFrom('function filterSidebarSessions', 800);
    expect(filter).toContain(': filtered.reverse();');
    // 数据层不动：新建仍是 order=Date.now()（升序末位 = 标签栏最右侧）
    const store = read('src/storage/session-store.js');
    expect(store).toContain('order: Date.now(),');
    expect(store).not.toContain('nextSessionOrderAtTop');
  });

  it('倒序展示下拖拽落点仍按底层 order 计算（标准 splice 语义与视觉一致）', () => {
    // 左栏渲染 reverse(state.sessions)，落点用底层的 dragged/target 下标做「移到目标位置」，
    // 两种顺序互为镜像，相对位置结论一致，因此不需要额外的下标翻转
    const drop = sliceFrom('async function handleSidebarDrop', 700);
    expect(drop).toContain('const draggedIndex = sessions.findIndex(s => s.id === movedId);');
    expect(drop).toContain('const targetIndex = sessions.findIndex(s => s.id === targetId);');
    expect(drop).toContain('reordered.splice(targetIndex, 0, moved);');
  });

  it('DOM 与样式：头部两枚排序按钮、当前态高亮、可拖拽行光标', () => {
    expect(html).toContain('id="sessionSidebarSort"');
    expect(html).toContain('data-mode="manual"');
    expect(html).toContain('data-mode="recent"');
    expect(css).toContain('.session-sidebar-sort-btn.active');
    expect(css).toContain('.session-sidebar-list .session-dropdown-item.draggable');
  });

  it('可拖拽行内的工具按钮保持按钮光标，不继承行的抓手光标', () => {
    // cursor 沿 DOM 继承：只给行设 grab 会把重命名/分叉/归档/关闭也变成抓手
    expect(css).toMatch(
      /\.session-sidebar-list \.session-dropdown-item\.draggable \.session-dropdown-item-actions[\s\S]*?cursor: pointer/
    );
  });
});

describe('左栏样式与文案（源码守卫）', () => {
  it('核心样式：收起不占位（display:none），展开才用 CSS var 宽度，grip col-resize', () => {
    const base = css.slice(css.indexOf('.session-sidebar {'), css.indexOf('.session-sidebar {') + 400);
    expect(base).toContain('display: none');
    expect(css).toContain('.session-sidebar.expanded');
    expect(css).toContain('var(--session-sidebar-width, 240px)');
    expect(css).toContain('.session-sidebar-grip');
    expect(css).toContain('cursor: col-resize');
    // 旧的 36px 图标轨样式已删除
    expect(css).not.toContain('.session-sidebar-rail');
    expect(css).not.toContain('.session-rail-btn');
    // 切换按钮在标签栏左端
    expect(css).toContain('.session-sidebar-toggle');
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

  it('底部两个按钮各贴一侧：面板加宽时「关闭全部」不跟着居中漂移', () => {
    // 共用样式是 width:100%（全屏列表的整行按钮），左栏必须按文字宽度收缩
    const entryIdx = css.indexOf('.session-sidebar-footer .session-archive-entry {');
    expect(entryIdx).toBeGreaterThan(-1);
    const entry = css.slice(entryIdx, entryIdx + 200);
    expect(entry).toContain('width: auto');
    const closeIdx = css.indexOf('.session-sidebar-footer .session-dropdown-close-all {');
    expect(closeIdx).toBeGreaterThan(-1);
    const close = css.slice(closeIdx, closeIdx + 220);
    expect(close).toContain('width: auto');
    expect(close).toContain('text-align: right');
    expect(close).toContain('white-space: nowrap');
    // 只做左栏作用域覆盖，全屏列表的整行按钮不受影响
    const sharedIdx = css.indexOf('.session-dropdown-close-all {');
    const shared = css.slice(sharedIdx, sharedIdx + 260);
    expect(shared).toContain('width: 100%');
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
