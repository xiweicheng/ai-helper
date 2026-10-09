// @vitest-environment jsdom
// 面板模块：八类渲染/搜索过滤/空态/竞态/选择接线/Ctrl 行为/关闭重置
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
vi.mock('../../src/side_panel/agent-at-selector.js', () => ({
  fetchKnowledgeCollections: vi.fn(async () => ({ ok: true, collections: [] })),
  getPairedAgents: vi.fn(async () => []),
  selectKnowledgeByAt: vi.fn(),
  refreshKnowledgePickedState: vi.fn(),
  selectAgentByAt: vi.fn(async () => {}),
  selectProxyByAt: vi.fn(async () => {}),
  getAgentDisplayName: vi.fn((a) => (a && a.id === 'default' ? '默认助手' : a.name)),
  getAgentDisplayDesc: vi.fn((a) => (a && a.id === 'default' ? '' : a.description)),
}));
vi.mock('../../src/side_panel/agent-store.js', () => ({
  getAllAgents: vi.fn(async () => []),
}));
vi.mock('../../src/side_panel/workspace-manager.js', () => ({
  getWorkspaceRoot: vi.fn(async () => null),
  listDirectory: vi.fn(async () => ({ success: true, entries: [] })),
  getFileIcon: vi.fn((name, type) => (type === 'directory' ? '📁' : '📄')),
  formatFileSize: vi.fn((size) => `${size} B`),
}));
vi.mock('../../src/side_panel/workspace-panel.js', () => ({
  attachFilesForQuestion: vi.fn(async () => {}),
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
import {
  fetchKnowledgeCollections, getPairedAgents,
  selectKnowledgeByAt, refreshKnowledgePickedState,
  selectAgentByAt, selectProxyByAt,
} from '../../src/side_panel/agent-at-selector.js';
import { getAllAgents } from '../../src/side_panel/agent-store.js';
import { getWorkspaceRoot, listDirectory } from '../../src/side_panel/workspace-manager.js';
import { attachFilesForQuestion } from '../../src/side_panel/workspace-panel.js';
import state from '../../src/side_panel/state.js';
import { registerTranslations } from '../../src/shared/i18n.js';

// 被 mock 模块运行时注册的文案需在测试中补齐（模拟真实环境）
registerTranslations('zh', {
  skillSelector: {
    disabledTooltip: '未启用（不会自动注入 AI 提示词），仍可手动选择使用',
    mcpInactiveBadge: '未开放',
    mcpInactiveTooltip: '该服务当前未开放（已关闭或被当前助手排除），选中后将随本次请求强制启用',
  },
  knowledgeSelector: {
    docChunk: '{docs} 文档 · {chunks} 分块',
    disabledBadge: '已停用',
    disabledTooltip: '已停用（大模型不会自主检索该库），仍可手动 @ 引用',
  },
  promptSelector: {
    inheritGlobal: '继承全局设置',
    toolCount: '{count} 个工具',
    unnamedProxy: '未命名代理',
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
const KNOWLEDGE = [
  { id: 'kb-1', name: '产品知识库', documentCount: 3, chunkCount: 12 },
  { id: 'kb-2', name: '研发知识库', documentCount: 1, chunkCount: 4, enabled: false },
];
const AGENTS = [
  { id: 'default', name: 'Default Assistant', description: '', toolIds: null, icon: '🤖' },
  { id: 'ag-1', name: '写作助手', description: '文案写作', toolIds: ['t1', 't2'] },
  { id: 'ag-2', name: '翻译助手', description: '', toolIds: ['t1'] },
];
const PROXIES = [
  { id: 'pa_1', name: '本地代理', url: 'ws://127.0.0.1:9222', isActive: true, isDisabled: false },
  { id: 'pa_2', name: '远程代理', url: 'ws://10.0.0.5:9222', isActive: false, isDisabled: true },
];
// 排序断言：同一 mtime 目录在前（名称序）→ 其余按 mtime 降序
const ENTRIES = [
  { name: 'z.txt', type: 'file', size: 100, mtime: 2000 },
  { name: 'dir-b', type: 'directory', size: 0, mtime: 2000 },
  { name: 'dir-a', type: 'directory', size: 0, mtime: 2000 },
  { name: 'old.txt', type: 'file', size: 100, mtime: 500 },
];

function setupDom() {
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div class="input-add-panel" id="inputAddPanel" style="display:none;">
      <div class="input-add-panel-search-wrap">
        <input id="inputAddPanelSearch" type="text">
        <button class="input-add-panel-search-clear" id="inputAddPanelSearchClear" type="button" style="display:none;"></button>
      </div>
      <div id="inputAddPanelList"></div>
    </div>`;
  closeSpy = vi.fn();
  initInputAddPanel({ onRequestClose: closeSpy });
  return {
    panel: document.getElementById('inputAddPanel'),
    search: document.getElementById('inputAddPanelSearch'),
    clear: document.getElementById('inputAddPanelSearchClear'),
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
const tick = () => new Promise((r) => setTimeout(r, 0));

beforeEach(() => {
  closeCategoryPanel(); // 重置模块级状态，保证用例间隔离
  vi.clearAllMocks();
  vi.mocked(getVisibleSkills).mockResolvedValue(SKILLS);
  vi.mocked(getMcpServices).mockResolvedValue(SERVICES);
  vi.mocked(getOpenTabs).mockResolvedValue(TABS);
  vi.mocked(fetchKnowledgeCollections).mockResolvedValue({ ok: true, collections: KNOWLEDGE });
  vi.mocked(getAllAgents).mockResolvedValue(AGENTS);
  vi.mocked(getPairedAgents).mockResolvedValue(PROXIES);
  vi.mocked(getWorkspaceRoot).mockResolvedValue('/ws');
  vi.mocked(listDirectory).mockResolvedValue({ success: true, entries: ENTRIES });
  state.customPrompts = [
    { code: 'p1', content: '发送内容一' },
    { code: 'p2', content: '发送内容二' },
  ];
  state.selectedPage = null;
  state.activeAgentId = null;
  state.knowledgeRefs = [];
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

  it('skills：渲染技能项（名称+描述双行），禁用项带灰显 class，已选标记被刷新', async () => {
    await openCategoryPanel('skills');
    const items = dom.list.querySelectorAll('.skill-list-item.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.skillName).toBe('技能A');
    expect(items[0].classList.contains('input-add-panel-item-two-line')).toBe(true);
    expect(items[0].textContent).toContain('技能A');
    expect(items[0].textContent).toContain('A描述');
    expect(items[0].querySelector('.input-add-panel-item-sub').title).toBe('A描述');
    expect(items[1].classList.contains('skill-list-item-disabled')).toBe(true);
    expect(items[1].textContent).toContain('技能B');
    expect(items[1].textContent).toContain('B描述');
    expect(refreshSkillPickedState).toHaveBeenCalled();
  });

  it('skills：无描述技能不渲染副文本行', async () => {
    vi.mocked(getVisibleSkills).mockResolvedValue([{ name: '无描述技能', enabled: true }]);
    await openCategoryPanel('skills');
    const items = dom.list.querySelectorAll('.input-add-panel-item');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('无描述技能');
    expect(items[0].querySelector('.input-add-panel-item-sub')).toBeNull();
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

  it('prompts/skills/pages 项带 two-line 类（标题整行 + 副文本第二行，不被长副文本挤压）', async () => {
    await openCategoryPanel('prompts');
    expect(dom.list.querySelectorAll('.input-add-panel-item-two-line')).toHaveLength(2);
    await openCategoryPanel('skills');
    expect(dom.list.querySelectorAll('.input-add-panel-item-two-line')).toHaveLength(2);
    await openCategoryPanel('pages');
    expect(dom.list.querySelectorAll('.input-add-panel-item-two-line')).toHaveLength(2);
  });

  it('knowledge：渲染知识库项（双行），停用库带「已停用」徽标，标记被刷新', async () => {
    await openCategoryPanel('knowledge');
    const items = dom.list.querySelectorAll('.prompt-item-knowledge.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.kbId).toBe('kb-1');
    expect(items[0].dataset.kbName).toBe('产品知识库');
    expect(items[0].dataset.kbDisabled).toBe('0');
    expect(items[0].classList.contains('input-add-panel-item-two-line')).toBe(true);
    expect(items[0].textContent).toContain('产品知识库');
    expect(items[0].textContent).toContain('3 文档 · 12 分块');
    expect(items[1].classList.contains('knowledge-item-disabled')).toBe(true);
    expect(items[1].dataset.kbDisabled).toBe('1');
    expect(items[1].querySelector('.badge-disabled')).toBeTruthy();
    expect(refreshKnowledgePickedState).toHaveBeenCalled();
  });

  it('agents：默认助手走 displayName、无描述回落工具数/继承全局，激活项带 ✓', async () => {
    state.activeAgentId = 'ag-1';
    await openCategoryPanel('agents');
    const items = dom.list.querySelectorAll('.input-add-panel-item');
    expect(items).toHaveLength(3);
    expect(items[0].dataset.agentId).toBe('default');
    expect(items[0].textContent).toContain('默认助手');
    expect(items[0].textContent).toContain('继承全局设置');
    expect(items[1].textContent).toContain('写作助手');
    expect(items[1].textContent).toContain('文案写作');
    expect(items[1].querySelector('.input-add-panel-item-mark')).toBeTruthy();
    expect(items[2].textContent).toContain('1 个工具');
    expect(items[0].querySelector('.input-add-panel-item-mark')).toBeNull();
  });

  it('proxies：渲染代理项（双行 name/url），激活 ✓、禁用灰显', async () => {
    await openCategoryPanel('proxies');
    const items = dom.list.querySelectorAll('.input-add-panel-item');
    expect(items).toHaveLength(2);
    expect(items[0].dataset.proxyId).toBe('pa_1');
    expect(items[0].textContent).toContain('本地代理');
    expect(items[0].textContent).toContain('ws://127.0.0.1:9222');
    expect(items[0].querySelector('.input-add-panel-item-mark')).toBeTruthy();
    expect(items[1].classList.contains('agent-disabled')).toBe(true);
    expect(items[1].querySelector('.input-add-panel-item-mark')).toBeNull();
  });

  it('workspace：根目录条目排序（mtime 降序 → 目录优先 → 名称序），目录带 /、文件显大小', async () => {
    await openCategoryPanel('workspace');
    const items = [...dom.list.querySelectorAll('.input-add-panel-item')];
    expect(items.map((el) => el.dataset.path)).toEqual(['/ws/dir-a', '/ws/dir-b', '/ws/z.txt', '/ws/old.txt']);
    expect(items[0].textContent).toContain('dir-a/');
    expect(items[0].title).toBe('/ws/dir-a');
    expect(items[1].textContent).toContain('dir-b/');
    expect(items[2].textContent).not.toContain('/');
    expect(items[2].textContent).toContain('100 B');
    expect(items[0].querySelector('.input-add-panel-item-sub')).toBeNull();
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

  it('知识库/助手/代理/工作目录均支持本地过滤', async () => {
    await openCategoryPanel('knowledge');
    fireSearch('研发');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(1);
    expect(dom.list.querySelector('.input-add-panel-item').dataset.kbId).toBe('kb-2');

    await openCategoryPanel('agents');
    fireSearch('写作');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(1);
    expect(dom.list.querySelector('.input-add-panel-item').dataset.agentId).toBe('ag-1');

    await openCategoryPanel('proxies');
    fireSearch('10.0.0.5');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(1);
    expect(dom.list.querySelector('.input-add-panel-item').dataset.proxyId).toBe('pa_2');

    await openCategoryPanel('workspace');
    fireSearch('dir');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(2);
  });

  it('切换类别时清空搜索框', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容一');
    await openCategoryPanel('skills');
    expect(dom.search.value).toBe('');
  });
});

describe('搜索一键清除', () => {
  it('有输入时显示、点击后清空恢复全量并回焦搜索框、按钮隐藏', async () => {
    await openCategoryPanel('prompts');
    expect(dom.clear.style.display).toBe('none');
    fireSearch('内容一');
    expect(dom.clear.style.display).not.toBe('none');
    dom.clear.click();
    expect(dom.search.value).toBe('');
    expect(document.activeElement).toBe(dom.search);
    expect(dom.clear.style.display).toBe('none');
    expect(dom.list.querySelectorAll('.input-add-panel-item')).toHaveLength(2);
  });

  it('切换类别重置搜索时按钮同步隐藏', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容一');
    expect(dom.clear.style.display).not.toBe('none');
    await openCategoryPanel('skills');
    expect(dom.clear.style.display).toBe('none');
  });

  it('closeCategoryPanel 后按钮隐藏', async () => {
    await openCategoryPanel('prompts');
    fireSearch('内容一');
    closeCategoryPanel();
    expect(dom.clear.style.display).toBe('none');
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

  it('knowledge：RAG 不可用（ok:false）时显示空态', async () => {
    vi.mocked(fetchKnowledgeCollections).mockResolvedValue({ ok: false, collections: [] });
    await openCategoryPanel('knowledge');
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
  });

  it('workspace：无工作目录时显示空态且不请求目录列表', async () => {
    vi.mocked(getWorkspaceRoot).mockResolvedValue(null);
    await openCategoryPanel('workspace');
    expect(dom.list.querySelector('.prompt-empty')).toBeTruthy();
    expect(listDirectory).not.toHaveBeenCalled();
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

  it('点击知识库（普通）→ selectKnowledgeByAt(clearTrigger:false)，面板不收起（多选）', async () => {
    await openCategoryPanel('knowledge');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(selectKnowledgeByAt).toHaveBeenCalledWith(
      { id: 'kb-1', name: '产品知识库', enabled: true },
      { clearTrigger: false },
    );
    expect(closeSpy).not.toHaveBeenCalled();
  });

  it('Ctrl+点击停用知识库 → enabled:false 透传 + 选中后收起', async () => {
    await openCategoryPanel('knowledge');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1], true);
    expect(selectKnowledgeByAt).toHaveBeenCalledWith(
      { id: 'kb-2', name: '研发知识库', enabled: false },
      { clearTrigger: false },
    );
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击助手 → selectAgentByAt(clearTrigger:false) + 收起菜单', async () => {
    await openCategoryPanel('agents');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[1]);
    expect(selectAgentByAt).toHaveBeenCalledWith('ag-1', { clearTrigger: false });
    await tick();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击代理 → selectProxyByAt(clearTrigger:false) + 收起菜单', async () => {
    await openCategoryPanel('proxies');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(selectProxyByAt).toHaveBeenCalledWith('pa_1', { clearTrigger: false });
    await tick();
    expect(closeSpy).toHaveBeenCalled();
  });

  it('点击工作目录条目 → attachFilesForQuestion([entry]) + 回焦 + 收起菜单', async () => {
    await openCategoryPanel('workspace');
    clickItem(dom.list.querySelectorAll('.input-add-panel-item')[0]);
    expect(attachFilesForQuestion).toHaveBeenCalledWith([
      { name: 'dir-a', type: 'directory', size: 0, mtime: 2000, fullPath: '/ws/dir-a' },
    ]);
    expect(document.activeElement).toBe(dom.userInput);
    await tick();
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
