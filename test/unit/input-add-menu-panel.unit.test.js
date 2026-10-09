// @vitest-environment jsdom
// 面板模块：四类渲染/搜索过滤/空态/竞态/选择接线/Ctrl 行为/关闭重置
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../../src/side_panel/prompt-manager.js', () => ({
  sendPromptByCode: vi.fn(async () => {}),
  insertPromptToInputByCode: vi.fn(),
}));
vi.mock('../../src/side_panel/skill-selector.js', () => ({
  getVisibleSkills: vi.fn(async () => []),
  getMcpServices: vi.fn(async () => []),
  selectSkill: vi.fn(),
  selectMcpService: vi.fn(),
  refreshSkillPickedState: vi.fn(),
  refreshMcpPickedState: vi.fn(),
}));
vi.mock('../../src/side_panel/page-selector.js', () => ({
  getOpenTabs: vi.fn(async () => []),
  selectPage: vi.fn(),
}));

import {
  initInputAddPanel, openCategoryPanel, closeCategoryPanel,
  isCategoryPanelOpen, getPanelCategory, isPanelSearchFocused,
} from '../../src/side_panel/input-add-menu-panel.js';
import {
  getVisibleSkills, getMcpServices, selectSkill, selectMcpService,
  refreshSkillPickedState, refreshMcpPickedState,
} from '../../src/side_panel/skill-selector.js';
import { sendPromptByCode, insertPromptToInputByCode } from '../../src/side_panel/prompt-manager.js';
import { getOpenTabs, selectPage } from '../../src/side_panel/page-selector.js';
import state from '../../src/side_panel/state.js';
import { registerTranslations } from '../../src/shared/i18n.js';

// skill-selector.js 被 mock，其运行时注册的文案需在测试中补齐（模拟真实环境）
registerTranslations('zh', {
  skillSelector: {
    disabledTooltip: '未启用（不会自动注入 AI 提示词），仍可手动选择使用',
    mcpInactiveBadge: '未开放',
    mcpInactiveTooltip: '该服务当前未开放（已关闭或被当前助手排除），选中后将随本次请求强制启用',
  },
});

let dom;
let closeSpy;

const SKILLS = [
  { name: '技能A', description: 'A描述', enabled: true },
  { name: '技能B', description: 'B描述', enabled: false },
];
const SERVICES = [
  { serverId: 'srv-x', serverName: '服务X', toolCount: 2, effectiveOpen: true },
  { serverId: 'srv-y', serverName: '服务Y', toolCount: 1, effectiveOpen: false },
];
const TABS = [
  { id: 1, title: '页面一', url: 'https://a.com', active: true, favIconUrl: '' },
  { id: 2, title: '页面二', url: 'https://b.com', active: false, favIconUrl: '' },
];

function setupDom() {
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div class="input-add-panel" id="inputAddPanel" style="display:none;">
      <input id="inputAddPanelSearch" type="text">
      <div id="inputAddPanelList"></div>
    </div>`;
  closeSpy = vi.fn();
  initInputAddPanel({ onRequestClose: closeSpy });
  return {
    panel: document.getElementById('inputAddPanel'),
    search: document.getElementById('inputAddPanelSearch'),
    list: document.getElementById('inputAddPanelList'),
    userInput: document.getElementById('userInput'),
  };
}

const fireSearch = (value) => {
  dom.search.value = value;
  dom.search.dispatchEvent(new Event('input'));
};
const clickItem = (el, ctrl = false) =>
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: ctrl }));

beforeEach(() => {
  closeCategoryPanel(); // 重置模块级状态，保证用例间隔离
  vi.clearAllMocks();
  vi.mocked(getVisibleSkills).mockResolvedValue(SKILLS);
  vi.mocked(getMcpServices).mockResolvedValue(SERVICES);
  vi.mocked(getOpenTabs).mockResolvedValue(TABS);
  state.customPrompts = [
    { code: 'p1', content: '发送内容一' },
    { code: 'p2', content: '发送内容二' },
  ];
  state.selectedPage = null;
  dom = setupDom();
});

describe('渲染', () => {
  it('prompts：渲染全部提示词项（data-code + code/content）', async () => {
    await openCategoryPanel('prompts');
    const items = dom.list.querySelectorAll('.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.code).toBe('p1');
    expect(items[0].textContent).toContain('/p1');
    expect(items[0].textContent).toContain('发送内容一');
    expect(dom.panel.style.display).not.toBe('none');
  });

  it('skills：渲染技能项，禁用项带灰显 class，已选标记被刷新', async () => {
    await openCategoryPanel('skills');
    const items = dom.list.querySelectorAll('.skill-list-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.skillName).toBe('技能A');
    expect(items[1].classList.contains('skill-list-item-disabled')).toBe(true);
    expect(refreshSkillPickedState).toHaveBeenCalled();
  });

  it('mcp：未开放服务带「未开放」徽标', async () => {
    await openCategoryPanel('mcp');
    const items = dom.list.querySelectorAll('.mcp-list-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[1].classList.contains('mcp-list-item-inactive')).toBe(true);
    expect(items[1].textContent).toContain('未开放');
  });

  it('pages：当前已选网页带 ✓ 标记', async () => {
    state.selectedPage = { id: 2, title: '页面二', url: 'https://b.com' };
    await openCategoryPanel('pages');
    const items = dom.list.querySelectorAll('.prompt-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.tabId).toBe('1');
    expect(items[1].querySelector('.page-selected-mark')).toBeTruthy();
  });
});

describe('搜索过滤', () => {
  it('输入关键字过滤；清空恢复全量', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容二');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(1);
    fireSearch('');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(2);
  });

  it('无命中时显示空态（prompt-empty）', async () => {
    await openCategoryPanel('prompts');
    fireSearch('不存在');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(0);
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('切换类别时清空搜索框', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容一');
    await openCategoryPanel('skills');
    expect(dom.search.value).toBe('');
  });
});

describe('空态 / 失败 / 竞态', () => {
  it('数据为空显示空态', async () => {
    state.customPrompts = [];
    await openCategoryPanel('prompts');
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('数据源 reject 不抛出，显示空态', async () => {
    vi.mocked(getVisibleSkills).mockRejectedValue(new Error('boom'));
    await expect(openCategoryPanel('skills')).resolves.toBeUndefined();
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('快速切换类别：先发的慢响应被丢弃，只渲染最后一次', async () => {
    let resolveSkills;
    vi.mocked(getVisibleSkills).mockReturnValue(new Promise((r) => { resolveSkills = r; }));
    const p1 = openCategoryPanel('skills');
    const p2 = openCategoryPanel('mcp');
    resolveSkills(SKILLS);
    await Promise.all([p1, p2]);
    expect(dom.list.querySelectorAll('.mcp-list-item')).toHaveLength(2);
    expect(dom.list.querySelector('.skill-list-item')).toBeNull();
  });

  it('同类别重复打开不重复请求', async () => {
    await openCategoryPanel('skills');
    await openCategoryPanel('skills');
    expect(getVisibleSkills).toHaveBeenCalledTimes(1);
  });
});

describe('选择接线', () => {
  it('点击提示词 → sendPromptByCode + 收起菜单', async () => {
    await openCategoryPanel('prompts');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(sendPromptByCode).toHaveBeenCalledWith('p1');
    expect(closeSpy).toHaveBeenCalled();
  });

  it('Ctrl+点击提示词 → insertPromptToInputByCode(skipTriggerStrip) + 收起菜单', async () => {
    await openCategoryPanel('prompts');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1], true);
    expect(insertPromptToInputByCode).toHaveBeenCalledWith('p2', { skipTriggerStrip: true });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击技能（普通）→ selectSkill(clearTrigger:false)，面板不收起', async () => {
    await openCategoryPanel('skills');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(selectSkill).toHaveBeenCalledWith('技能A', SKILLS, { clearTrigger: false });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('Ctrl+点击技能 → 选中后收起菜单', async () => {
    await openCategoryPanel('skills');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0], true);
    expect(selectSkill).toHaveBeenCalledWith('技能A', SKILLS, { clearTrigger: false });
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击 MCP → selectMcpService(clearTrigger:false)，普通点击不收起', async () => {
    await openCategoryPanel('mcp');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1]);
    expect(selectMcpService).toHaveBeenCalledWith('srv-y', '服务Y', SERVICES, { clearTrigger: false });
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('点击网页 → selectPage(tab 对象) + 回焦输入框 + 收起菜单', async () => {
    await openCategoryPanel('pages');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1]);
    expect(selectPage).toHaveBeenCalledWith(TABS[1]);
    expect(document.activeElement).toBe(dom.userInput);
    expect(closeSpy).toHaveBeenCalled();
  });
});

describe('状态查询与关闭重置', () => {
  it('isCategoryPanelOpen/getPanelCategory 反映当前类别', async () => {
    expect(isCategoryPanelOpen()).toBe(false);
    await openCategoryPanel('skills');
    expect(isCategoryPanelOpen()).toBe(true);
    expect(getPanelCategory()).toBe('skills');
  });

  it('closeCategoryPanel：隐藏面板、清空搜索与列表、状态重置、作废在途请求', async () => {
    await openCategoryPanel('skills');
    fireSearch('技能A');
    let resolveMcp;
    vi.mocked(getMcpServices).mockReturnValue(new Promise((r) => { resolveMcp = r; }));
    const pending = openCategoryPanel('mcp');
    closeCategoryPanel();
    resolveMcp(SERVICES);
    await pending;
    expect(dom.panel.style.display).toBe('none');
    expect(dom.search.value).toBe('');
    expect(dom.list.innerHTML).toBe('');
    expect(isCategoryPanelOpen()).toBe(false);
  });

  it('isPanelSearchFocused 仅搜索框聚焦时为 true', () => {
    expect(isPanelSearchFocused()).toBe(false);
    dom.search.focus();
    expect(isPanelSearchFocused()).toBe(true);
  });
});
