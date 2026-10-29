// 待办面板结构守卫
// 守住容易被后续改动破坏的事：
// 1) 入口按轨道均分、配色沿用 tinted 语义族（不回退实心亮块/硬编码色值）；
// 2) 行内操作默认隐藏、悬停或键盘聚焦才浮现（面板清爽的核心交互）；
// 3) 纯逻辑与编排层不碰 DOM，保证可单测且不被渲染细节污染；
// 4) 行内编辑在重渲染中存活、**每一个**写操作失败都有反馈（代码评审的一主一拦路缺陷）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (rel) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

const STYLES = read('src/side_panel/styles.css');
const RAIL = read('src/side_panel/side-rail.js');
const PANEL = read('src/side_panel/todo-panel.js');
const MODEL = read('src/side_panel/todo-model.js');
const MANAGER = read('src/side_panel/todo-manager.js');

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

  test('待办面板进入「打开态需重新夹取视口」名单', () => {
    expect(RAIL).toContain('.todo-panel.expanded');
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
    expect(block).toContain('var(--clamp-y, 0px)');
    expect(PANEL).toContain('clampPanelToViewport(panelEl)');
    expect(PANEL).toContain('releasePanelClamp(panelEl)');
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

describe('一键填入输入框', () => {
  test('追加而非覆盖草稿，并复用 adjustInputHeight', () => {
    expect(PANEL).toContain("document.getElementById('userInput')");
    expect(PANEL).toContain('adjustInputHeight()');
    // 必须有「保留原草稿」的拼接，不允许直接赋值覆盖
    expect(PANEL).toMatch(/base\s*\?\s*`\$\{base\}\\n\\n\$\{digest\}`\s*:\s*digest/);
  });

  test('Markdown 由模型层生成（面板不自己拼清单）', () => {
    expect(PANEL).toContain('buildTodoDigest');
    expect(MODEL).toContain('export function buildTodoDigest');
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

  test('三种编辑器都以草稿为底稿，而不是库里的旧值', () => {
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'title'\)/);
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'note'\)/);
    expect(PANEL).toMatch(/draftFor\(todo\.id, 'due'\)/);
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

  test('persist 失败走统一的 saveFailed 文案', () => {
    const helper = PANEL.slice(PANEL.indexOf('function persist('));
    expect(helper.slice(0, helper.indexOf('\n}'))).toContain("t('todo.saveFailed')");
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
    const zh = PANEL.slice(PANEL.indexOf("registerTranslations('zh'"), PANEL.indexOf("registerTranslations('en'"));
    const en = PANEL.slice(PANEL.indexOf("registerTranslations('en'"));
    expect(zh).toContain('copyFailed');
    expect(en).toContain('copyFailed');
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
