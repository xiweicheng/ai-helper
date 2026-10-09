// @vitest-environment jsdom
// input-add-menu.unit.test.js - "+" 添加菜单：开合、外部点击关闭、菜单项点击关闭（含 capture 机制）、
// 蓝点状态；选择器直达（7 项 tab 导航、打开时可见性刷新、stopPropagation 防外部点击误关）
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { initInputAddMenu } from '../../src/side_panel/input-add-menu.js';
import { showPromptSelector, hidePromptSelector } from '../../src/side_panel/prompt-manager.js';
import {
  showAgentAtSelector,
  hideAgentAtSelector,
  getPairedAgents,
  fetchKnowledgeCollections,
} from '../../src/side_panel/agent-at-selector.js';
import { hideFileAtSelector, showFileAtSelector } from '../../src/side_panel/file-at-selector.js';
import { shouldShowSkillsTab, shouldShowMcpTab } from '../../src/side_panel/skill-selector.js';
import { getWorkspaceRoot } from '../../src/side_panel/workspace-manager.js';

vi.mock('../../src/side_panel/prompt-manager.js', () => ({
  showPromptSelector: vi.fn(async () => {}),
  hidePromptSelector: vi.fn(),
}));
vi.mock('../../src/side_panel/agent-at-selector.js', () => ({
  showAgentAtSelector: vi.fn(async () => {}),
  hideAgentAtSelector: vi.fn(),
  getPairedAgents: vi.fn(async () => []),
  fetchKnowledgeCollections: vi.fn(async () => ({ ok: true, collections: [] })),
}));
vi.mock('../../src/side_panel/file-at-selector.js', () => ({
  hideFileAtSelector: vi.fn(),
  showFileAtSelector: vi.fn(async () => {}),
}));
vi.mock('../../src/side_panel/workspace-manager.js', () => ({
  getWorkspaceRoot: vi.fn(async () => '/ws'),
}));
vi.mock('../../src/side_panel/skill-selector.js', () => ({
  shouldShowSkillsTab: vi.fn(async () => true),
  shouldShowMcpTab: vi.fn(async () => true),
}));

function setupDom() {
  document.body.innerHTML = `
    <div class="input-bottom-row">
      <div class="input-bottom-left">
        <div class="input-add-wrapper">
          <button id="inputAddBtn">+</button>
          <div class="input-add-menu" id="inputAddMenu" style="display:none;">
            <button class="input-add-item" id="promptTriggerBtn">提示词</button>
            <button class="input-add-item" id="addMenuSkillBtn">技能</button>
            <button class="input-add-item" id="addMenuMcpBtn">MCP</button>
            <div class="input-add-divider"></div>
            <button class="input-add-item" id="addMenuPageBtn">网页</button>
            <button class="input-add-item" id="addMenuKnowledgeBtn">知识库</button>
            <button class="input-add-item" id="addMenuAgentBtn">助手</button>
            <button class="input-add-item" id="addMenuProxyBtn">代理</button>
            <button class="input-add-item" id="addMenuWorkspaceBtn" style="display:none;">工作目录</button>
            <div class="input-add-divider"></div>
            <button class="input-add-item" id="screenshotBtn">截图</button>
            <button class="input-add-item" id="fileAttachBtn">附件</button>
            <div class="input-add-menu-switches" id="inputAddMenuSwitches">
              <div class="input-add-menu-switches-title">开关</div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <textarea id="userInput"></textarea>
    <div id="outside">外部</div>`;
  initInputAddMenu();
  return {
    btn: document.getElementById('inputAddBtn'),
    item: document.getElementById('promptTriggerBtn'),
    menu: document.getElementById('inputAddMenu'),
    switches: document.getElementById('inputAddMenuSwitches'),
    userInput: document.getElementById('userInput'),
  };
}

const tick = () => new Promise((r) => setTimeout(r, 0));

describe('input-add-menu', () => {
  let dom;

  beforeEach(() => {
    vi.mocked(showPromptSelector).mockClear();
    vi.mocked(showAgentAtSelector).mockClear();
    vi.mocked(hidePromptSelector).mockClear();
    vi.mocked(hideAgentAtSelector).mockClear();
    vi.mocked(hideFileAtSelector).mockClear();
    vi.mocked(shouldShowSkillsTab).mockReset().mockResolvedValue(true);
    vi.mocked(shouldShowMcpTab).mockReset().mockResolvedValue(true);
    vi.mocked(fetchKnowledgeCollections).mockReset().mockResolvedValue({ ok: true, collections: [] });
    vi.mocked(getPairedAgents).mockReset().mockResolvedValue([]);
    vi.mocked(getWorkspaceRoot).mockReset().mockResolvedValue('/ws');
    vi.mocked(showFileAtSelector).mockClear();
    dom = setupDom();
  });

  it('点击 "+" 切换开合', () => {
    expect(dom.menu.style.display).toBe('none');
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    dom.btn.click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('点击菜单外部关闭', () => {
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    document.getElementById('outside').click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('菜单项自身 stopPropagation 时仍能关闭（capture 监听）', () => {
    // 真实场景：选择器项 handler 会 stopPropagation 防止弹窗被外部点击逻辑误关
    dom.item.addEventListener('click', (e) => e.stopPropagation());
    dom.btn.click();
    expect(dom.menu.style.display).not.toBe('none');
    dom.item.click();
    expect(dom.menu.style.display).toBe('none');
  });

  it('蓝点：开关区内无开关时隐藏；移入已激活开关时显示；取消勾选后消失', async () => {
    expect(dom.btn.classList.contains('has-active-switch')).toBe(false);

    // ④级降级把划词组（含已勾选的划词开关）移入菜单开关区
    const group = document.createElement('div');
    group.className = 'toolbar-chip-group';
    group.innerHTML = '<input type="checkbox" checked>';
    dom.switches.appendChild(group);
    await tick();
    expect(dom.btn.classList.contains('has-active-switch')).toBe(true);

    // 在菜单里取消勾选（change 冒泡到开关区）
    const checkbox = group.querySelector('input');
    checkbox.checked = false;
    checkbox.dispatchEvent(new Event('change', { bubbles: true }));
    expect(dom.btn.classList.contains('has-active-switch')).toBe(false);
  });

  it('8 个选择器项均已接线：点击各自打开对应弹窗与目标 tab，且菜单收起', async () => {
    const cases = [
      ['promptTriggerBtn', showPromptSelector, ['', 'prompts']],
      ['addMenuSkillBtn', showPromptSelector, ['', 'skills']],
      ['addMenuMcpBtn', showPromptSelector, ['', 'mcp']],
      ['addMenuPageBtn', showAgentAtSelector, ['', 'pages']],
      ['addMenuKnowledgeBtn', showAgentAtSelector, ['', 'knowledge']],
      ['addMenuAgentBtn', showAgentAtSelector, ['', 'agents']],
      ['addMenuProxyBtn', showAgentAtSelector, ['', 'proxies']],
      ['addMenuWorkspaceBtn', showFileAtSelector, ['']],
    ];
    for (const [id, spy, args] of cases) {
      spy.mockClear();
      dom.btn.click(); // 打开菜单（上一轮点击后已收起）
      document.getElementById(id).click();
      await tick();
      expect(spy, id).toHaveBeenCalledWith(...args);
      expect(dom.menu.style.display, id).toBe('none');
    }
  });

  it('打开目标弹窗前互斥收起其他弹窗、焦点回输入框、不冒泡（防外部点击立即关闭）', async () => {
    const bubbleSpy = vi.fn();
    document.addEventListener('click', bubbleSpy);
    try {
      dom.btn.click(); // "+" 自身 stopPropagation，不冒泡
      expect(bubbleSpy).not.toHaveBeenCalled();
      document.getElementById('addMenuSkillBtn').click();
      await tick();
      // 互斥：三个弹窗全部先收起，再打开目标弹窗
      expect(hidePromptSelector).toHaveBeenCalled();
      expect(hideAgentAtSelector).toHaveBeenCalled();
      expect(hideFileAtSelector).toHaveBeenCalled();
      // stopPropagation：事件不到 document，刚打开的弹窗不会被“点击外部关闭”逻辑误关
      expect(bubbleSpy).not.toHaveBeenCalled();
      // 焦点回到输入框，可直接键盘操作
      expect(document.activeElement).toBe(dom.userInput);
    } finally {
      document.removeEventListener('click', bubbleSpy);
    }
  });

  it('「提示词」项 Ctrl+单击等同单击（复合行为已移除，统一直达 prompts tab）', async () => {
    dom.btn.click();
    dom.item.click();
    await tick();
    expect(showPromptSelector).toHaveBeenCalledWith('', 'prompts');
    expect(showAgentAtSelector).not.toHaveBeenCalled();

    showPromptSelector.mockClear();
    dom.btn.click();
    dom.item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    await tick();
    expect(showPromptSelector).toHaveBeenCalledWith('', 'prompts');
    expect(showAgentAtSelector).not.toHaveBeenCalled();
  });

  it('菜单打开时刷新可见性：不可用项隐藏，恒显项与可用项不受影响', async () => {
    vi.mocked(shouldShowSkillsTab).mockResolvedValue(false); // 技能不可用
    vi.mocked(fetchKnowledgeCollections).mockResolvedValue({ ok: false, collections: [] }); // 知识库不可用
    vi.mocked(getPairedAgents).mockResolvedValue([]); // 无配对代理
    vi.mocked(getWorkspaceRoot).mockResolvedValue(null); // 无工作目录
    dom.btn.click();
    await tick();
    await tick();
    expect(document.getElementById('addMenuSkillBtn').style.display).toBe('none');
    expect(document.getElementById('addMenuKnowledgeBtn').style.display).toBe('none');
    expect(document.getElementById('addMenuProxyBtn').style.display).toBe('none');
    expect(document.getElementById('addMenuWorkspaceBtn').style.display).toBe('none');
    // 可用项恢复显示；恒显项（提示词/网页/助手/MCP）不受影响
    expect(document.getElementById('addMenuMcpBtn').style.display).not.toBe('none');
    expect(dom.item.style.display).not.toBe('none');
    expect(document.getElementById('addMenuPageBtn').style.display).not.toBe('none');
    expect(document.getElementById('addMenuAgentBtn').style.display).not.toBe('none');
  });

  it('工作目录项可见性随 getWorkspaceRoot 变化（无目录隐藏，有目录显示）', async () => {
    vi.mocked(getWorkspaceRoot).mockResolvedValue(null);
    dom.btn.click();
    await tick();
    await tick();
    expect(document.getElementById('addMenuWorkspaceBtn').style.display).toBe('none');

    vi.mocked(getWorkspaceRoot).mockResolvedValue('/ws');
    dom.btn.click(); // 关闭菜单
    dom.btn.click(); // 重新打开 → 再次刷新可见性
    await tick();
    await tick();
    expect(document.getElementById('addMenuWorkspaceBtn').style.display).not.toBe('none');
  });

  it('选择器打开失败时不崩溃，菜单照常收起', async () => {
    showPromptSelector.mockRejectedValueOnce(new Error('boom'));
    dom.btn.click();
    dom.item.click();
    await tick();
    expect(dom.menu.style.display).toBe('none');
  });
});
