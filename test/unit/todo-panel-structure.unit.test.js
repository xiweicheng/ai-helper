// 待办面板结构守卫
// 守住三件容易被后续改动破坏的事：
// 1) 入口按轨道均分、配色沿用 tinted 语义族（不回退实心亮块/硬编码色值）；
// 2) 行内操作默认隐藏、悬停或键盘聚焦才浮现（面板清爽的核心交互）；
// 3) 纯逻辑与编排层不碰 DOM，保证可单测且不被渲染细节污染。
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
