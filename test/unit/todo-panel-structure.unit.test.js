// 待办面板结构守卫
// 守住容易被后续改动破坏的事：
// 1) 入口按轨道均分、配色沿用 tinted 语义族（不回退实心亮块/硬编码色值）；
// 2) 行内操作默认隐藏、悬停或键盘聚焦才浮现（面板清爽的核心交互）；
// 3) 纯逻辑与编排层不碰 DOM，保证可单测且不被渲染细节污染；
// 4) 行内编辑在重渲染中存活、**每一个**写操作失败都有反馈（代码评审的一主一拦路缺陷）；
// 5) 双 Tab / 智能恢复 / 优先级色条 / 链接协议白名单 / 底部锚定输入区上沿（本轮 UX 重做的不变量）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const STYLES = read('src/side_panel/styles.css');
const RAIL = read('src/side_panel/side-rail.js');
const PANEL = read('src/side_panel/todo-panel.js');
const MODEL = read('src/side_panel/todo-model.js');
const MANAGER = read('src/side_panel/todo-manager.js');
const MODAL_HTML = read('side_panel.html');
const LOCALE_ZH = read('src/shared/locales/zh.js');
const LOCALE_EN = read('src/shared/locales/en.js');

// 面板自己注册的中英文案块（用于「中英成对」守卫）
const ZH = PANEL.slice(PANEL.indexOf("registerTranslations('zh'"), PANEL.indexOf("registerTranslations('en'"));
const EN = PANEL.slice(PANEL.indexOf("registerTranslations('en'"));

/** 取出某条规则块（从选择器到首个右花括号） */
function rule(src, selector) {
  const start = src.indexOf(selector);
  expect(start, `缺少规则 ${selector}`).toBeGreaterThan(-1);
  const end = src.indexOf('}', start);
  return src.slice(start, end);
}

describe('入口轨道', () => {
  test('槽位为 6 个，待办排在搜索之后、定时任务之前', () => {
    const slots = RAIL.match(/const SLOT_ORDER = \[(.*?)\]/s);
    expect(slots).toBeTruthy();
    const names = slots[1].split(',').map(s => s.trim().replace(/['"]/g, '')).filter(Boolean);
    expect(names).toEqual(['workspace', 'bookmark', 'toc', 'search', 'todo', 'schedule']);
  });

  test('入口容器真的挂进 todo 槽位（只建不挂，入口永远不出现）', () => {
    expect(PANEL).toContain("getSideRailSlot('todo').appendChild(containerEl)");
  });

  test('待办不用共享夹取：它只按视口底夹，正好会把面板压到输入框上', () => {
    const list = RAIL.match(/const OPEN_PANEL_SELECTOR = '([^']+)'/);
    expect(list).toBeTruthy();
    expect(list[1]).not.toContain('.todo-panel');
    // 另外几个面板仍然走共享夹取，不能连带改掉
    expect(list[1]).toContain('.schedule-panel.open');
    expect(PANEL).not.toMatch(/clampPanelToViewport\(/);
    expect(PANEL).not.toMatch(/releasePanelClamp\(/);
  });

  test('入口与面板都接收指针事件（否则轨道 pointer-events:none 会吃掉点击）', () => {
    const block = rule(STYLES, '.side-rail .workspace-panel-toggle,');
    expect(block).toContain('.side-rail .todo-panel-toggle');
    expect(block).toContain('.side-rail .todo-panel,');
  });

  test('矮窗口兜底：6 个入口压缩槽高与间距，避免与聊天区挤压', () => {
    const start = STYLES.indexOf('@media (max-height: 620px)');
    expect(start).toBeGreaterThan(-1);
    const block = STYLES.slice(start, STYLES.indexOf('\n}', start) + 2);
    expect(block).toContain('gap: 8px');
    expect(block).toContain('height: 30px');
  });
});

describe('入口 tinted 风格', () => {
  test('待办入口使用 violet 语义族，且不是实心块/硬编码色值', () => {
    const block = rule(STYLES, '.todo-panel-toggle {');
    expect(block).toContain('rgba(var(--brand-violet-rgb), 0.1');
    expect(block).toContain('var(--brand-violet-500)');
    expect(block).not.toContain('0.85');
    expect(block).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  test('入口尺寸由 padding 决定，与其它入口同为 24 宽（不撑满 28px 轨道）', () => {
    const block = rule(STYLES, '.todo-panel-toggle {');
    expect(block).toContain('padding: 8px 4px');
    expect(block).not.toMatch(/\bwidth:\s*100%/);
    expect(block).not.toMatch(/\bheight:\s*100%/);
  });

  test('面板锚定入口按钮、与收藏/搜索同宽同位置语法', () => {
    const block = rule(STYLES, '.todo-panel {');
    expect(block).toContain('right: 26px');
    expect(block).toContain('width: 320px');
  });
});

describe('面板底部不遮住输入区', () => {
  test('底部锚定（与定时任务同一锁点），不再垂直居中', () => {
    const block = rule(STYLES, '.todo-panel {');
    expect(block).toContain('top: auto');
    expect(block).toContain('bottom: -40px');
    expect(block).toContain('translateY(var(--fit-y, 0px))');
    // 只负向匹配「声明行」：同一规则块里那句「以前的 top:50% 居中…」是注释
    expect(block).not.toMatch(/^\s*top:\s*50%/m);
    expect(block).toContain('max-height: var(--todo-max-h,');
  });

  test('限高与位移都以输入区上沿为界，量不到时回退轨道预留', () => {
    expect(PANEL).toContain("const INPUT_AREA_SELECTOR = '.input-container'");
    const measure = PANEL.slice(PANEL.indexOf('function measureInputTop('));
    expect(measure.slice(0, measure.indexOf('\n}'))).toContain('window.innerHeight - RAIL_BOTTOM_RESERVE');

    const fit = PANEL.slice(PANEL.indexOf('function fitPanelToInputArea('));
    const body = fit.slice(0, fit.indexOf('\n}'));
    expect(body).toContain('measureInputTop() - BOTTOM_GAP');
    expect(body).toContain("'--todo-max-h'");
    expect(body).toContain("'--fit-y'");
    expect(body).toContain('if (!panelEl || !isOpen()) return;');
    // 可用高度必须用「输入区上沿」算：拿面板当前底边当基准等于自己限制自己，
    // 面板悬在输入区上方时永远长不到真实可用高度
    expect(body).toContain('Math.floor(limit - TOP_RESERVE)');
    expect(body).not.toContain('rect.bottom - TOP_RESERVE');
    // 底边要真正贴到输入区上沿：悬空时向下补齐，越界时向上让开
    expect(body).toContain('Math.floor(limit - rect.bottom)');
    expect(body).not.toContain('Math.min(0, Math.floor(limit - rect.bottom))');
  });

  test('贴合后的位移不做 0.2s 过渡：否则每次打开都往下滑一下', () => {
    const block = rule(STYLES, '.todo-panel.expanded {');
    expect(block).toContain('transition:');
    expect(block).not.toContain('transform');
  });

  test('监听只在面板开着时存在，关闭即解除（常驻观察者会一直重排）', () => {
    expect(PANEL).toMatch(/function watchInputArea\(\) \{[\s\S]*?stopWatchingInputArea\(\);/);
    expect(PANEL).toContain('new ResizeObserver(');
    expect(PANEL).toMatch(/function closePanel\(\) \{[\s\S]*?stopWatchingInputArea\(\);/);
    expect(PANEL).toMatch(/function closePanel\(\) \{[\s\S]*?removeProperty\('--fit-y'\)/);
    expect(PANEL).toMatch(/function closePanel\(\) \{[\s\S]*?removeProperty\('--todo-max-h'\)/);
  });

  test('每次重渲染后重新量一次（条目增减会改面板高度）', () => {
    const render = PANEL.slice(PANEL.indexOf('function render() {'));
    const body = render.slice(0, render.indexOf('\n}\n'));
    expect(body.slice(body.indexOf('bodyEl.innerHTML')).indexOf('fitPanelToInputArea()')).toBeGreaterThan(-1);
  });

  test('高度只增不减：切到条目更少的 Tab 不能把面板缩一截', () => {
    const fit = PANEL.slice(PANEL.indexOf('function fitPanelToInputArea('));
    const body = fit.slice(0, fit.indexOf('\n}'));
    // 先放开自己写回的 height，否则量到的永远是上次的值，条目增加也长不上去
    expect(body).toMatch(/if \(heightFloor\) panelEl\.style\.height = 'auto';/);
    expect(body).toContain('Math.max(heightFloor, panelEl.offsetHeight)');
    // 上限仍由可用高度把住，不会顶到输入区以外
    expect(body).toContain('Math.min(available, Math.max(heightFloor');
    expect(body).toMatch(/panelEl\.style\.height = `\$\{heightFloor\}px`;/);
  });

  test('锁定高度只在一次打开内生效，开关面板必须归零', () => {
    expect(PANEL).toMatch(/function openPanel\(\) \{[\s\S]*?heightFloor = 0;[\s\S]*?render\(\);/);
    expect(PANEL).toMatch(/function closePanel\(\) \{[\s\S]*?removeProperty\('height'\);[\s\S]*?heightFloor = 0;/);
  });

  test('撤销按钮不收缩也不折行（标题一长会被压成竖排两行）', () => {
    const block = rule(STYLES, '.todo-undo .todo-mini-btn {');
    expect(block).toContain('flex: 0 0 auto');
    expect(block).toContain('white-space: nowrap');
    expect(rule(STYLES, '.todo-undo-text {')).toContain('text-overflow: ellipsis');
  });
});

describe('按钮收纳（清爽）', () => {
  test('行内操作默认透明且不可点', () => {
    const block = rule(STYLES, '.todo-item-actions {');
    expect(block).toMatch(/opacity:\s*0/);
    expect(block).toMatch(/pointer-events:\s*none/);
  });

  test('仅在悬停或键盘聚焦时浮现', () => {
    const start = STYLES.indexOf('.todo-item:hover .todo-item-actions');
    expect(start).toBeGreaterThan(-1);
    const block = STYLES.slice(start, STYLES.indexOf('}', start) + 1);
    expect(block).toMatch(/opacity:\s*1/);
    expect(block).toMatch(/pointer-events:\s*auto/);
    // 键盘可达：聚焦内部按钮时同样要浮现，否则 Tab 到按钮却看不见
    const hoverBlock = STYLES.slice(start, start + 400);
    expect(hoverBlock).toContain(':focus-within');
  });

  test('更多菜单是 fixed 层，不会被列表滚动容器裁切', () => {
    const block = rule(STYLES, '.todo-menu {');
    expect(block).toContain('position: fixed');
    expect(PANEL).toContain('openRowMenu');
    expect(PANEL).toContain('openHeaderMenu');
  });
});

describe('待办 / 已完成双 Tab', () => {
  test('一次只渲染当前 Tab 的那一组', () => {
    const render = PANEL.slice(PANEL.indexOf('function render() {'));
    const body = render.slice(0, render.indexOf('\n}\n'));
    expect(body).toContain("activeTab === 'done' ? done : active");
    expect(body).toContain('data-group="${activeTab}"');
  });

  test('折叠分组的旧结构不得复活（它把已完成顶到屏幕外）', () => {
    expect(STYLES).not.toContain('.todo-section');
    expect(PANEL).not.toContain('toggle-done');
    expect(PANEL).not.toContain('persistDoneExpanded');
    expect(PANEL).not.toContain('DONE_EXPANDED_KEY');
  });

  test('Tab 条在 body 之外，只改选中态与计数，不重建 DOM（否则抢走列表里的焦点）', () => {
    const update = PANEL.slice(PANEL.indexOf('function updateTabs('));
    const body = update.slice(0, update.indexOf('\n}'));
    expect(body).not.toContain('innerHTML');
    expect(body).toContain("aria-selected");
    expect(PANEL).toContain('switchTab(actionEl.dataset.tab)');
    expect(STYLES).toMatch(/\.todo-tab\.active \{[^}]*background/);
  });

  test('两个 Tab 各带自己的计数，进度文字写明「完成」二字', () => {
    expect(PANEL).toContain('todo-tab-count');
    expect(PANEL).toMatch(/t\('todo\.progressLabel', \{ done: stats\.done, total: stats\.total \}\)/);
    expect(ZH).toContain("progressLabel: '完成 {done} / {total}'");
    // 计数从 header 搬到了进度行，不再孤悬在标题右边
    expect(STYLES).toMatch(/\.todo-progress-row \{[^}]*display: flex/);
  });

  test('清除已完成只出现在已完成 Tab，且非空才给', () => {
    const render = PANEL.slice(PANEL.indexOf('function render() {'));
    const body = render.slice(0, render.indexOf('\n}\n'));
    expect(body).toContain("activeTab === 'done' && done.length > 0");
    expect(body).toContain('clear-completed-btn');
    // 空列表要有完成 Tab 自己的空态文案，不能只说「暂无待办」
    expect(body).toContain("isDoneTab ? 'todo.emptyDone' : 'todo.empty'");
  });

  test('已完成 Tab 里回车新增要先切回待办，否则「加了但看不见」', () => {
    expect(PANEL).toMatch(/function submitQuickAdd\(\) \{[\s\S]*?if \(activeTab === 'done'\) activeTab = 'active';/);
  });
});

describe('状态动作可见（不能只藏在状态圈上）', () => {
  test('菜单按当前状态给「开始处理 / 标记完成 / 恢复」文字项', () => {
    const items = PANEL.slice(PANEL.indexOf('function statusMenuItems('));
    const body = items.slice(0, items.indexOf('\n}'));
    expect(body).toContain("'set-doing'");
    expect(body).toContain("'set-done'");
    expect(body).toContain("'restore'");
    expect(body).toContain("'set-pending'");
    expect(body).toContain('restoreTarget(todo)');
    // 智能恢复已经会回到待办时不再给重复项
    expect(body).toContain('target !== TODO_STATUS.PENDING');
    expect(PANEL).toContain('...statusMenuItems(todo)');
  });

  test('已完成条目行内悬浮按钮直接给「恢复」入口', () => {
    expect(PANEL).toContain('data-action="restore"');
    expect(PANEL).toMatch(/const restoreAction = isDone/);
    expect(PANEL).toMatch(/case 'restore':[\s\S]*?restoreOne\(id\);/);
  });

  test('状态菜单里的每一个动作都过 persist（失败要说）', () => {
    const menu = PANEL.slice(PANEL.indexOf('async function handleMenuAction('));
    expect(menu.slice(0, menu.indexOf('\n}\n'))).toMatch(/persist\(setTodoStatus\(id, TODO_STATUS\.DOING\)\)/);
    expect(menu).toMatch(/persist\(setTodoStatus\(id, TODO_STATUS\.PENDING\)\)/);
  });

  test('标记完成立即移走 + 面板内联撤销条（toast 只有 textContent，放不了按钮）', () => {
    expect(PANEL).toMatch(/markUndoable\(todo\);[\s\S]*?persist\(setTodoStatus\(id, TODO_STATUS\.DONE\)\)/);
    expect(PANEL).toContain('data-action="undo-complete"');
    expect(PANEL).toContain('UNDO_DURATION_MS');
    expect(PANEL).toMatch(/function clearUndo\(\) \{[\s\S]*?undoable = null;/);
    expect(PANEL).toMatch(/function closePanel\(\) \{[\s\S]*?clearUndo\(\);/);
    // 每次开面板都回到待办 Tab，旧的撤销条不跨开关留存
    expect(PANEL).toMatch(/function openPanel\(\) \{[\s\S]*?activeTab = 'active';[\s\S]*?undoable = null;/);
    expect(STYLES).toMatch(/\.todo-undo \{[^}]*flex/);
  });
});

describe('优先级色条只说优先级', () => {
  test('竖条默认透明，三档各取一个语义 token（不撞色也不硬编码）', () => {
    expect(rule(STYLES, '.todo-item::before {')).toContain('background: transparent');
    const high = rule(STYLES, '.todo-item.prio-high::before {');
    const medium = rule(STYLES, '.todo-item.prio-medium::before {');
    const low = rule(STYLES, '.todo-item.prio-low::before {');
    expect(high).toContain('var(--danger-500)');
    expect(medium).toContain('var(--warning-500)');
    expect(low).toContain('var(--brand-500)');
    const tokens = [high, medium, low].map(b => b.match(/var\((--[a-z0-9-]+)\)/)[1]);
    expect(new Set(tokens)).toHaveLength(3);
    for (const b of [high, medium, low]) expect(b).not.toMatch(/#[0-9a-f]{3,6}/i);
  });

  test('「处理中」不再抢竖条，改用底色 + 圈内实心点', () => {
    expect(STYLES).not.toMatch(/\.todo-item\.doing::before/);
    expect(rule(STYLES, '.todo-item.doing {')).toMatch(/background:/);
    expect(PANEL).toMatch(/if \(todo\.status === TODO_STATUS\.DOING\) classes\.push\('doing'\);/);
    expect(PANEL).toContain('classes.push(`prio-${todo.priority}`)');
    expect(PANEL).toMatch(/TODO_STATUS\.DOING \? '<i><\/i>' : ''/);
  });

  test('档位白名单在模型层，菜单色块走 data-priority-value 并过 persist', () => {
    expect(MODEL).toContain('PRIORITY_LEVELS');
    expect(MANAGER).toContain('export function setTodoPriority');
    expect(PANEL).toContain('data-priority-value');
    expect(PANEL).toContain('persist(setTodoPriority(sid, value))');
  });
});

describe('外部链接', () => {
  test('协议白名单写在模型层，编排层校完才允许落库', () => {
    expect(MODEL).toContain("ALLOWED_LINK_PROTOCOLS = ['http:', 'https:']");
    expect(MANAGER).toContain("reason: 'invalid'");
    expect(MANAGER).toMatch(/if \(!parsed\.valid\) return/);
  });

  test('链接渲染成可点胶囊，但不把 href 写进 DOM', () => {
    const chip = PANEL.slice(PANEL.indexOf('function renderLinkChip('));
    const body = chip.slice(0, chip.indexOf('\n}'));
    expect(body).toContain('<button class="todo-link-chip"');
    expect(body).not.toMatch(/<a\b/);
    expect(body).not.toContain('href=');
    expect(body).toContain('linkLabel(todo)');
    // 无链接不出胶囊，不留一个点了没反应的洞
    expect(body).toContain('if (!host) return \'\';');
    expect(STYLES).toMatch(/\.todo-link-chip \{[^}]*var\(--text-link\)/);
    expect(STYLES).toMatch(/\.todo-link-chip:hover[\s\S]*?text-decoration: underline/);
  });

  test('点击走 chrome.tabs.create 开新标签，打开前再校一次协议', () => {
    const open = PANEL.slice(PANEL.indexOf('function openTodoLink('));
    const body = open.slice(0, open.indexOf('\n}'));
    expect(body).toContain('isLinkOpenable(url)');
    expect(body).toContain('chrome.tabs.create({ url })');
    expect(body).toMatch(/catch \(e\) \{/);
    expect(PANEL).toMatch(/case 'open-link':[\s\S]*?openTodoLink\(findTodo\(id\)\);/);
  });

  test('链接失焦即保存，且走 persist（非法要有专门文案）', () => {
    expect(PANEL).toMatch(/contains\('todo-link-input'\)[\s\S]*?saveLink\(id, e\.target\.value\)/);
    expect(PANEL).toMatch(/function saveLink[\s\S]*?persist\(setTodoLink\(id, value\)/);
    expect(PANEL).toMatch(/function cancelInlineEdit\(\) \{[\s\S]*?linkEditId = null;/);
    expect(PANEL).toContain("data-action=\"link-cancel\"");
  });

  test('change 与 focusout 两条通道只能有一条生效（探针实测到会写两次、弹两条 toast）', () => {
    const change = PANEL.slice(PANEL.indexOf('function handleChange('));
    const changeBody = change.slice(0, change.indexOf('\n}\n'));
    expect(changeBody).toMatch(/contains\('todo-link-input'\)[\s\S]*?if \(!linkEditId \|\| linkEditId !== id\) return;/);
    const focusOut = PANEL.slice(PANEL.indexOf('function handleFocusOut('));
    expect(focusOut.slice(0, focusOut.indexOf('\n}\n')))
      .toMatch(/if \(!linkEditId \|\| linkEditId !== id\) return;/);
  });

  test('点「取消」不能被自动保存抢跑（change / focusout 都比 click 早）', () => {
    // 不能靠 relatedTarget 分流：实测 change 比 focusout 还先，那时什么焦点信息都拿不到
    const bind = PANEL.slice(PANEL.indexOf("addEventListener('pointerdown'"));
    const bindBody = bind.slice(0, bind.indexOf('\n  });'));
    expect(bindBody).toContain('[data-action="link-cancel"]');
    expect(bindBody).toContain('e.preventDefault()');
    expect(bindBody).toContain('cancelLinkEdit(');
    // 取消只是关编辑器，一个字节也不写库
    const cancelFn = PANEL.slice(PANEL.indexOf('function cancelLinkEdit('));
    const cancelBody = cancelFn.slice(0, cancelFn.indexOf('\n}'));
    expect(cancelBody).toContain('clearDraft(id)');
    expect(cancelBody).not.toContain('setTodoLink');
    expect(cancelBody).not.toContain('persist(');
  });
});

describe('更多菜单不换行、不被裁', () => {
  test('宽度自适应文案，条目禁止折行', () => {
    const menu = rule(STYLES, '.todo-menu {');
    expect(menu).toContain('width: max-content');
    expect(menu).toContain('max-width: min(280px, calc(100vw - 16px))');
    expect(menu).toContain('max-height: calc(100vh - 16px)');
    expect(menu).toContain('overflow-y: auto');
    expect(rule(STYLES, '.todo-menu-item {')).toContain('white-space: nowrap');
    expect(rule(STYLES, '.todo-menu-row {')).toContain('white-space: nowrap');
  });

  test('定位拿实测宽度，不留写死的常量', () => {
    const open = PANEL.slice(PANEL.indexOf('function openMenuAt('));
    const body = open.slice(0, open.indexOf('\n}'));
    expect(body).toContain('menu.offsetWidth');
    expect(body).toContain('window.innerWidth - width - 8');
    // 底下放不下要往上翻，否则靠屏幕底部的条目菜单直接溢出视口
    expect(body).toContain('rect.top - height - 4');
    expect(PANEL).not.toMatch(/const MENU_WIDTH/);
  });
});

describe('文案中英成对', () => {
  /** 取出 todo 命名空间的 key 列表 */
  function todoKeys(src) {
    const start = src.indexOf('todo: {');
    expect(start).toBeGreaterThan(-1);
    const body = src.slice(start, src.indexOf('\n  },', start));
    return [...body.matchAll(/^ {4}(\w+):/gm)].map(m => m[1]).sort();
  }

  test('本轮新增的每一个 key 都要中英同时补齐，缺一边就是半边英文界面', () => {
    expect(todoKeys(EN)).toEqual(todoKeys(ZH));
    for (const key of [
      'emptyDone', 'tabActive', 'tabDone', 'progressLabel', 'startDoing', 'markDone',
      'backToPending', 'restoreTo', 'undoBar', 'undoAction', 'restoredToast',
      'priority', 'priorityHigh', 'priorityNone', 'addLink', 'editLink',
      'linkInvalid', 'openLinkTitle', 'statusTip',
    ]) {
      expect(todoKeys(ZH), key).toContain(key);
      expect(todoKeys(EN), key).toContain(key);
    }
  });

  test('旧的误导文案不得回流（组名「进行中」、markAs 这种看不出动作的弱动词）', () => {
    for (const gone of ['activeGroup', 'doneGroup', 'markAs']) {
      expect(ZH).not.toContain(gone);
      expect(EN).not.toContain(gone);
    }
    // 摘要分组标题跟 Tab 同名，不再叫「进行中」
    expect(MODEL).toContain("active: '待办'");
    expect(MODEL).toContain("active: 'To do'");
  });
});

describe('分层约束', () => {
  test('纯逻辑层不触碰 DOM', () => {
    expect(MODEL).not.toMatch(/\bdocument\./);
    expect(MODEL).not.toMatch(/\bwindow\./);
    expect(MODEL).not.toMatch(/from '\.\/utils\.js'/);
  });

  test('编排层不触碰 DOM（渲染只在面板层）', () => {
    expect(MANAGER).not.toMatch(/\bdocument\./);
    expect(MANAGER).not.toMatch(/\bwindow\./);
    expect(MANAGER).not.toMatch(/querySelector/);
  });

  test('面板层通过订阅刷新，不直接改 state.todos', () => {
    expect(PANEL).toContain('subscribeTodos');
    expect(PANEL).not.toMatch(/state\.todos\s*=/);
  });
});

describe('单条填入输入框', () => {
  test('追加而非覆盖草稿，并复用 adjustInputHeight', () => {
    expect(PANEL).toContain("document.getElementById('userInput')");
    expect(PANEL).toContain('adjustInputHeight()');
    // 必须有「保留原草稿」的拼接，不允许直接赋值覆盖
    expect(PANEL).toMatch(/base\s*\?\s*`\$\{base\}\\n\\n\$\{digest\}`\s*:\s*digest/);
  });

  test('组合文本由模型层生成（面板不自己拼清单）', () => {
    expect(PANEL).toContain('buildItemDigest');
    expect(MODEL).toContain('export function buildItemDigest');
  });
});

// 评审 Blocker：每一次落库成功都会 emitChange → render() 重建整段列表，
// 不先把未提交的编辑值抓下来，用户敲了一半的备注就会静默退回库里的旧值。
describe('行内编辑在重渲染中存活', () => {
  test('重建 innerHTML 之前必须先采集草稿与焦点', () => {
    const render = PANEL.slice(PANEL.indexOf('function render() {'));
    const beforeWrite = render.slice(0, render.indexOf('bodyEl.innerHTML'));
    expect(beforeWrite).toContain('captureDrafts()');
    expect(beforeWrite).toContain('getFocusMarker()');
  });

  test('四种编辑器都以草稿为底稿，而不是库里的旧值', () => {
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'title'\)/);
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'note'\)/);
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'due'\)/);
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'link'\)/);
    expect(PANEL).toMatch(/const EDITOR_CLASSES = \[[^\]]*'todo-link-input'/);
    expect(PANEL).toMatch(/'todo-link-input': 'link'/);
  });

  test('重渲染后还原焦点与光标（date 输入读 selectionStart 会抛，必须兜住）', () => {
    expect(PANEL).toContain('restoreFocus(focusMarker)');
    expect(PANEL).toMatch(/function safeCaret[\s\S]*?try \{[\s\S]*?selectionStart/);
  });

  test('保存与取消都要丢草稿，避免脏值回流到下一次编辑', () => {
    const saveNote = PANEL.slice(PANEL.indexOf('function saveNote'));
    expect(saveNote.slice(0, saveNote.indexOf('\n}'))).toContain('clearDraft(id)');
    const cancel = PANEL.slice(PANEL.indexOf('function cancelInlineEdit'));
    expect(cancel.slice(0, cancel.indexOf('\n}'))).toContain('clearDraft()');
  });

  test('离开清单的条目必须连草稿一起清（删除/清除已完成不留脏数据）', () => {
    const render = PANEL.slice(PANEL.indexOf('function render() {'));
    expect(render.slice(0, render.indexOf('bodyEl.innerHTML'))).toContain('pruneDrafts(');
  });
});

describe('落库失败必须有反馈', () => {
  test('状态圈与截止日都不允许丢 Promise（静默失败等于假装成功）', () => {
    expect(PANEL).toMatch(/persist\(cycleTodoStatus\(id\)\)/);
    expect(PANEL).toMatch(/persist\(updateTodo\(id, \{ dueAt: null \}\)\)/);
    expect(PANEL).not.toMatch(/^\s*cycleTodoStatus\(id\);$/m);
    expect(PANEL).not.toMatch(/^\s*updateTodo\(id, \{ dueAt: null \}\);\s*$/m);
  });

  test('persist 失败区分「链接非法」与「写库失败」', () => {
    const helper = PANEL.slice(PANEL.indexOf('function persist('));
    const body = helper.slice(0, helper.indexOf('\n}'));
    expect(body).toContain("'todo.saveFailed'");
    expect(body).toContain("'todo.linkInvalid'");
    expect(body).toContain("result.reason === 'invalid'");
    // manager 开始返 {ok,reason}，只认布尔值会把链接的成功当失败
    expect(body).toContain('result === true || (result && result.ok === true)');
  });

  test('删除 / 清除已完成 / 拖拽重排的写操作也必须过 persist（只报成功不报失败不算反馈）', () => {
    expect(PANEL).toMatch(/persist\(removeTodo\(id\), t\('todo\.deletedToast'\)\)/);
    expect(PANEL).toMatch(/persist\(clearCompletedTodos\(\), t\('todo\.clearedToast'\)\)/);
    expect(PANEL).toMatch(/persist\(reorderActiveTodos\(from, to\)\)/);
    // 不允许退回「拿布尔值只弹成功」的旧形态
    expect(PANEL).not.toMatch(/const removed = await removeTodo/);
    expect(PANEL).not.toMatch(/const cleared = await clearCompletedTodos/);
  });

  test('复制失败提示复制本身，不能借用「未找到输入框」', () => {
    const copy = PANEL.slice(PANEL.indexOf('function copyText'));
    const body = copy.slice(0, copy.indexOf('\n}\n'));
    expect(body).toContain("t('todo.copyFailed')");
    expect(body).not.toContain('noInputToast');
  });

  test('copyFailed 中英成对', () => {
    expect(ZH).toContain('copyFailed');
    expect(EN).toContain('copyFailed');
  });
});

describe('与左侧会话停靠条共存', () => {
  test('窄窗宽度兜底给左走廊让位：60 = 右入口轨 26 + 停靠条走廊 34', () => {
    const block = rule(STYLES, '.todo-panel {');
    expect(block).toContain('max-width: calc(100vw - 60px)');
  });

  test('打开态在轨道内提层，不被后续槽位的定时任务面板按树序压住', () => {
    const block = rule(STYLES, '.todo-panel.expanded {');
    expect(block).toMatch(/z-index:/);
  });
});

describe('不留无人调用的导出', () => {
  test('closeTodoPanel 全仓无调用方，不得重新引入', () => {
    expect(PANEL).not.toContain('export function closeTodoPanel');
  });
});

describe('语言热切换（换语言不必重启插件）', () => {
  const SKELETON = PANEL.slice(
    PANEL.indexOf('containerEl.innerHTML = `'),
    PANEL.indexOf("getSideRailSlot('todo')")
  );

  test('骨架文案挂 data-i18n 系列属性，交给 applyI18n 统一填充', () => {
    expect(SKELETON).toContain('data-i18n-title="todo.toggleTitle"');
    expect(SKELETON).toContain('data-i18n="todo.title"');
    expect(SKELETON).toContain('data-i18n="todo.tabActive"');
    expect(SKELETON).toContain('data-i18n="todo.tabDone"');
    expect(SKELETON).toContain('data-i18n-placeholder="todo.placeholder"');
    expect(SKELETON).toContain('data-i18n-title="todo.addTitle"');
  });

  test('骨架里不能再有建 DOM 时求值的 t(...)：那会在建 DOM 那一刻定稿', () => {
    expect(SKELETON).not.toMatch(/\$\{escapeHtml\(t\('/);
    expect(SKELETON).not.toMatch(/\$\{escapeAttr\(t\('/);
  });

  test('语言变更时既 applyI18n 也要重渲列表（列表是 JS 拼的，applyI18n 碰不到）', () => {
    const sub = PANEL.slice(PANEL.indexOf('subscribe(() => {'));
    expect(sub.length, '面板必须订阅语言变更').toBeGreaterThan(0);
    const body = sub.slice(0, sub.indexOf('\n  });'));
    expect(body).toContain('applyI18n(');
    expect(body).toContain('render()');
  });

  test('initI18n 完成后再对齐一次，兜住「面板先初始化、语言后到」的时序', () => {
    expect(PANEL).toContain('subscribe');
    expect(PANEL).toContain('applyI18n');
    expect(PANEL).toContain('initI18n');
    expect(PANEL).toMatch(/initI18n\(\)\.then\(\(\) => \{[\s\S]*?applyI18n\(containerEl\)[\s\S]*?render\(\)[\s\S]*?\}\)/);
  });
});

describe('单条进出输入框（批量入口已撤）', () => {
  test('头部批量「填入输入框」按钮已删', () => {
    expect(PANEL).not.toContain('data-action="fill-input"');
    expect(PANEL).not.toMatch(/case 'fill-input'/);
    expect(PANEL).not.toContain('todo-fill-btn');
  });

  test('头部菜单不再放批量复制：积压越多越无意义', () => {
    const menu = PANEL.slice(PANEL.indexOf('function openHeaderMenu'));
    const body = menu.slice(0, menu.indexOf('\n}'));
    expect(body).not.toContain('copy-clipboard');
    expect(body).not.toContain('copy-with-prompt');
  });

  test('「复制」提到行内，与编辑按钮同级；菜单里两个复制项全部下线', () => {
    const item = PANEL.slice(PANEL.indexOf('function renderItem'));
    const body = item.slice(0, item.indexOf('\n}\n'));
    const actions = body.slice(body.indexOf('todo-item-actions'));
    expect(body).toContain('data-action="fill-item"');
    expect(actions).toContain('data-action="copy-item"');
    // 同一排按钮：编辑 → 复制 → 填入，不用先进菜单再点一次
    expect(actions.indexOf('data-action="edit-title"'))
      .toBeLessThan(actions.indexOf('data-action="copy-item"'));
    expect(actions.indexOf('data-action="copy-item"'))
      .toBeLessThan(actions.indexOf('data-action="fill-item"'));

    const rowMenu = PANEL.slice(PANEL.indexOf('function openRowMenu'));
    const menuBody = rowMenu.slice(0, rowMenu.indexOf('\n}'));
    expect(menuBody).not.toContain("action: 'copy-item'");
    expect(menuBody).not.toContain('copy-item-prompt');
  });

  test('「复制并附提问模板」整体下线：动作、词条、模型分支一个不留', () => {
    expect(PANEL).not.toContain('copy-item-prompt');
    expect(PANEL).not.toContain('copyWithPrompt');
    expect(PANEL).not.toContain('copiedPromptToast');
    // 模型层留着 withPrompt 就是「看起来还支持」的假象
    expect(MODEL).not.toContain('withPrompt');
    expect(MODEL).not.toContain('todoDigest.prompt');
    // 顺带清掉早就没人引用的 copyClipboard 死词条
    expect(PANEL).not.toContain('copyClipboard');
  });

  test('行内复制只在 handleClick 分发一次，菜单那份副本不再重复接', () => {
    const click = PANEL.slice(PANEL.indexOf('function handleClick('));
    const clickBody = click.slice(0, click.indexOf('\n}\n'));
    expect(clickBody).toContain("case 'copy-item':");
    expect(clickBody).toMatch(/case 'copy-item':\s*\n\s*e\.stopPropagation\(\);\s*\n\s*copyItem\(id\);/);
    const menu = PANEL.slice(PANEL.indexOf('async function handleMenuAction('));
    expect(menu.slice(0, menu.indexOf('\n}\n'))).not.toContain("case 'copy-item'");
  });

  test('填入/复制/拖拽都走单条组合文本，不再只丢一个标题', () => {
    expect(PANEL).not.toMatch(/copyText\(todo\.title/);
    expect(PANEL).toContain('buildItemDigest(');
  });

  test('拖出去带的是组合文本（内部重排靠 dragState，不读 dataTransfer）', () => {
    const start = PANEL.slice(PANEL.indexOf('function handleDragStart'));
    const body = start.slice(0, start.indexOf('\n}\n'));
    expect(body).toContain("setData('text/plain', buildItemDigest(");
    expect(body).toContain("effectAllowed = 'copyMove'");
  });
});

describe('编辑态不被行内操作遮挡', () => {
  const itemBody = () => {
    const src = PANEL.slice(PANEL.indexOf('function renderItem'));
    return src.slice(0, src.indexOf('\n}\n'));
  };

  test('标题 / 备注 / 截止 / 链接任一在编辑，就不渲染操作区', () => {
    const body = itemBody();
    expect(body).toContain('const editing = titleEditId === todo.id');
    expect(body).toContain('noteEditId === todo.id');
    expect(body).toContain('dueEditId === todo.id');
    expect(body).toContain('linkEditId === todo.id');
    // 输出时不带 actions：DOM 里没有按钮，就不存在「绝对定位盖住输入框右端」
    expect(body).toContain("${editing ? '' : actions}");
    expect(body).not.toContain('${actions}');
  });

  test('操作区仍然是绝对定位的行尾浮层（普通态照旧悬停才现）', () => {
    const block = rule(STYLES, '.todo-item-actions {');
    expect(block).toContain('position: absolute');
    expect(block).toContain('opacity: 0');
    // :focus-within 正是「编辑时按钮冒出来」的入口，所以只能从 DOM 层撤掉
    expect(STYLES).toContain('.todo-item:focus-within .todo-item-actions');
  });
});

describe('待办快捷键（Alt + 字母，作用于选中行）', () => {
  test('条目可键盘聚焦，↑/↓ 在条目间移动', () => {
    const item = PANEL.slice(PANEL.indexOf('function renderItem'));
    expect(item.slice(0, item.indexOf('\n}\n'))).toContain('tabindex="0"');
    expect(PANEL).toContain("'ArrowDown'");
    expect(PANEL).toContain('moveRowFocus(');
  });

  test('方向键只在焦点不在输入框/编辑器时接手（不与光标移动抢）', () => {
    expect(PANEL).toContain("'input, textarea, [contenteditable=\"true\"]'");
    const scope = PANEL.slice(PANEL.indexOf('function moveRowFocus'));
    expect(scope.slice(0, scope.indexOf('\n}\n'))).toContain('next.focus()');
  });

  test('六个键位：T 开关 / A 聚焦添加 / B 备注 / L 链接 / D 完成 / P 优先级', () => {
    const table = PANEL.slice(PANEL.indexOf('const TODO_SHORTCUTS = {'));
    const body = table.slice(0, table.indexOf('\n};'));
    for (const code of ['KeyT', 'KeyA', 'KeyB', 'KeyL', 'KeyD', 'KeyP']) {
      expect(body, `缺少 ${code}`).toContain(`${code}:`);
    }
    // 与仓库其它快捷键同一守卫：不带 shift/ctrl/meta，避免和 Alt+Shift+S 这类撞车
    expect(PANEL).toContain('if (!e.altKey || e.shiftKey || e.ctrlKey || e.metaKey) return;');
  });

  test('一条待办都没有时不抢键（不 preventDefault）', () => {
    const handler = PANEL.slice(PANEL.indexOf('function handleTodoShortcut'));
    const body = handler.slice(0, handler.indexOf('\n}\n'));
    const guardAt = body.indexOf('const id = resolveTargetId()');
    expect(guardAt).toBeGreaterThan(-1);
    expect(body.slice(guardAt)).toContain('if (!id) return;');
    expect(body.slice(guardAt).indexOf('e.preventDefault()'))
      .toBeGreaterThan(body.slice(guardAt).indexOf('if (!id) return;'));
  });

  test('重渲染后把焦点送回原来那一行（否则连按快捷键就没反应）', () => {
    const render = PANEL.slice(PANEL.indexOf('function render() {'));
    const body = render.slice(0, render.indexOf('\n}\n'));
    expect(body).toContain("closest?.('.todo-item')");
    expect(body).toContain('restoreRowFocus(');
  });

  test('快捷键登记进快捷键弹窗与中英词条（不许只存在于代码里）', () => {
    for (const key of ['todoToggle', 'todoAdd', 'todoSelect', 'todoNote', 'todoLink', 'todoDone', 'todoPriority']) {
      expect(MODAL_HTML, `弹窗缺 shortcuts.${key}`).toContain(`shortcuts.${key}`);
      expect(LOCALE_ZH, `中文词条缺 ${key}`).toContain(`${key}:`);
      expect(LOCALE_EN, `英文词条缺 ${key}`).toContain(`${key}:`);
    }
  });

  test('键盘聚焦的行要有可见焦点环（否则方向键移动看不见）', () => {
    expect(STYLES).toContain('.todo-item:focus-visible');
  });
});

describe('批量导入导出（一个入口 + 一个弹窗）', () => {
  const fnBody = (name) => {
    const src = PANEL.slice(PANEL.indexOf(name));
    expect(src, `缺少 ${name}`).not.toBe('');
    return src.slice(0, src.indexOf('\n}\n'));
  };

  test('头部菜单只剩 统计 / 导出… / 导入…，不再用多级菜单铺开', () => {
    const header = fnBody('function headerMenuItems(');
    const actions = [...header.matchAll(/action: '([a-z-]+)'/g)].map(m => m[1]);
    expect(actions).toEqual(['stats', 'export-options', 'import-options']);
  });

  test('头部菜单每一项都带图标：混排会让文案左缘参差', () => {
    const rows = fnBody('function headerMenuItems(').split('\n').filter(line => line.includes("action: '"));
    expect(rows.length).toBe(3);
    for (const row of rows) {
      expect(row.trim()).toContain('icon: ICONS.');
    }
  });

  test('导出：一个弹窗选完范围与格式，确认后交给 io 层；空范围不导空文件', () => {
    expect(PANEL).toContain("from './todo-io-dialogs.js'");
    const dialog = fnBody('async function openExportDialog(');
    expect(dialog).toContain('openExportOptions(');
    expect(dialog).toContain('counts:');
    expect(dialog).toContain('exportTodoScope(');
    expect(PANEL).not.toContain('openExportFormatMenu');

    const scope = fnBody('function exportTodoScope(');
    expect(scope).toContain('downloadTodoExport(');
    expect(scope).toContain('exportEmptyToast');
  });

  test('导入：选文件 → 解析 → 弹窗选合并/替换 → 交给编排层，解析错有专门提示', () => {
    const body = fnBody('async function importTodoFile(');
    expect(body).toContain('pickTodoImportFile(');
    expect(body).toContain('readTodoImportFile(');
    expect(body).toContain('openImportOptions(');
    expect(body).toContain('importTodos(');
    expect(body).toContain('importJsonError');
    expect(body).toContain('importFormatError');
  });

  test('替换的二次确认在选项弹窗里（选中即亮警告），不再弹第二个确认框', () => {
    const body = fnBody('async function importTodoFile(');
    expect(body).not.toContain('confirmAction(');
    expect(body.indexOf('openImportOptions(')).toBeLessThan(body.indexOf('importTodos('));
  });

  test('新增入口中英词条成对（缺一个英文就是半截翻译）', () => {
    const keys = ['exportEntry', 'importEntry', 'exportJson', 'exportMd', 'importedToast'];
    for (const key of keys) {
      expect(ZH, `中文缺 ${key}`).toContain(`${key}:`);
      expect(EN, `英文缺 ${key}`).toContain(`${key}:`);
    }
  });
});

describe('统计视图（处理中计数 + 统计浮层）', () => {
  test('进度行显示处理中条数（不能只有「完成 / 总数」）', () => {
    expect(PANEL).toContain('stats.doing');
    expect(ZH).toContain('progressDoing:');
    expect(EN).toContain('progressDoing:');
  });

  test('头部菜单有统计入口，点了打开浮层', () => {
    const header = PANEL.slice(PANEL.indexOf('function headerMenuItems()'));
    expect(header.slice(0, header.indexOf('\n}\n'))).toContain("action: 'stats'");
    const handler = PANEL.slice(PANEL.indexOf('async function handleMenuAction('));
    const body = handler.slice(0, handler.indexOf('\n}\n'));
    expect(body).toContain("case 'stats':");
    expect(body).toContain('openTodoStats()');
    expect(PANEL).toContain("from './todo-stats-panel.js'");
  });

  test('浮层：纯视图函数渲染，Esc / 遮罩 / 关闭按钮都能关，关掉摘监听', () => {
    const src = read('src/side_panel/todo-stats-panel.js');
    expect(src).toContain('buildStatsHtml(');
    expect(src).toContain("'Escape'");
    expect(src).toContain('e.target === overlayEl');
    expect(src).toContain('export async function openTodoStats');
    expect(src).toContain('export function closeTodoStats');
    expect(src).toContain('removeEventListener');
  });

  test('浮层数字来自流水：loadStatsLog + summarizeStats + 当前清单', () => {
    const src = read('src/side_panel/todo-stats-panel.js');
    expect(src).toContain('loadStatsLog(');
    expect(src).toContain('summarizeStats(');
    expect(src).toContain('getTodoGroups(');
  });

  test('统计文案中英成对', () => {
    const view = read('src/side_panel/todo-stats-view.js');
    const zh = view.slice(view.indexOf("registerTranslations('zh'"), view.indexOf("registerTranslations('en'"));
    const en = view.slice(view.indexOf("registerTranslations('en'"));
    for (const key of ['title', 'rate', 'doneOf', 'pending', 'doing', 'done', 'overdue', 'week', 'todayAdded', 'todayDone', 'streak', 'empty']) {
      expect(zh, `中文缺 ${key}`).toContain(`${key}:`);
      expect(en, `英文缺 ${key}`).toContain(`${key}:`);
    }
  });

  test('浮层样式走 token，层级低于菜单（菜单要能盖在浮层上）', () => {
    const overlay = rule(STYLES, '.todo-stats-overlay {');
    expect(overlay).toContain('position: fixed');
    const card = rule(STYLES, '.todo-stats-card {');
    expect(card).toContain('var(--bg-elevated)');
    const z = STYLES.match(/\.todo-stats-overlay \{[\s\S]*?z-index: (\d+)/);
    expect(z).toBeTruthy();
    expect(Number(z[1])).toBeLessThan(10020);
  });
});

describe('菜单动作必须有落点', () => {
  /** 取函数体：从声明处到首个独占一行的右花括号 */
  const fnBody = (src, name) => {
    const start = src.indexOf(name);
    expect(start, `缺少 ${name}`).toBeGreaterThan(-1);
    const body = src.slice(start);
    return body.slice(0, body.indexOf('\n}\n'));
  };

  test('行菜单 / 头部菜单声明的每个 action，handleMenuAction 都要有分支', () => {
    const declared = new Set();
    for (const name of [
      'function statusMenuItems(',
      'function openRowMenu(',
      'function headerMenuItems(',
    ]) {
      for (const m of fnBody(PANEL, name).matchAll(/action: '([a-z-]+)'/g)) declared.add(m[1]);
    }
    expect(declared.size).toBeGreaterThan(0);

    const handler = fnBody(PANEL, 'async function handleMenuAction(');
    const missing = [...declared].filter(action => !handler.includes(`case '${action}':`));
    // 漏接的表现就是「菜单项点下去什么都不发生」，静态守卫比探针更早发现
    expect(missing, `这些菜单项点了没反应：${missing.join(', ')}`).toEqual([]);
  });

  test('菜单动作只从 handleMenuAction 分发，行内复制不再留重复分支', () => {
    const click = fnBody(PANEL, 'function handleClick(');
    // 复制已经提到行内：这里必须有一份处理器，否则点下去毫无反应
    expect(click).toContain("case 'copy-item':");
    // 「复制并附提问模板」已整体下线，两处分发都不许再出现
    expect(click).not.toContain("case 'copy-item-prompt':");
    const menu = fnBody(PANEL, 'async function handleMenuAction(');
    expect(menu).not.toContain("case 'copy-item'");
  });
});

describe('菜单分割线', () => {
  const fnBody = (src, name) => {
    const start = src.indexOf(name);
    expect(start, `缺少 ${name}`).toBeGreaterThan(-1);
    const body = src.slice(start);
    return body.slice(0, body.indexOf('\n}\n'));
  };

  test('首项不画上分割线：上面没有菜单项，那条线是多余的', () => {
    const open = fnBody(PANEL, 'function openMenuAt(');
    expect(open).toContain('menuRowHtml(item, id)');
    // divider 的语义是「这一项上方还有内容」：菜单顶部没有，因此渲染前先归零
    expect(open).toMatch(/index === 0 && item\.divider/);
  });
});

describe('行菜单标注快捷键', () => {
  const fnBody = (src, name) => {
    const start = src.indexOf(name);
    expect(start, `缺少 ${name}`).toBeGreaterThan(-1);
    const body = src.slice(start);
    return body.slice(0, body.indexOf('\n}\n'));
  };

  test('真有快捷键的菜单项在文案旁标出键位', () => {
    const row = fnBody(PANEL, 'function openRowMenu(');
    expect(row).toMatch(/action: 'edit-note'[^\n]*shortcut: 'Alt\+B'/);
    expect(row).toMatch(/action: 'edit-link'[^\n]*shortcut: 'Alt\+L'/);
    expect(row).toMatch(/swatches: true[^\n]*shortcut: 'Alt\+P'/);

    const status = fnBody(PANEL, 'function statusMenuItems(');
    expect(status).toMatch(/action: 'set-done'[^\n]*shortcut: 'Alt\+D'/);
    expect(status).toMatch(/action: 'restore'[^\n]*shortcut: 'Alt\+D'/);
  });

  test('标注的键位与真实快捷键同源，不能改一处忘另一处', () => {
    for (const [label, code] of [['Alt+B', 'KeyB'], ['Alt+L', 'KeyL'], ['Alt+D', 'KeyD'], ['Alt+P', 'KeyP']]) {
      expect(PANEL, `快捷键表缺 ${code}`).toContain(`${code}:`);
      expect(PANEL, `菜单缺 ${label} 标注`).toContain(`shortcut: '${label}'`);
    }
  });

  test('kbd 统一由 menuRowHtml 输出，没快捷键的项不占位', () => {
    const row = fnBody(PANEL, 'function menuRowHtml(');
    expect(row).toContain('kbdHtml(item.shortcut)');
    const kbd = fnBody(PANEL, 'function kbdHtml(');
    expect(kbd).toContain('todo-menu-kbd');
    // 没有 shortcut 就返回空串：否则每一行都会留一个空白角标位
    expect(kbd).toMatch(/return shortcut\s*\?/);
  });

  test('角标样式走 token，且靠右对齐', () => {
    const block = rule(STYLES, '.todo-menu-kbd {');
    expect(block).toContain('margin-left: auto');
    expect(block).toContain('var(--text-tertiary)');
  });
});
