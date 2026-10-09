// @vitest-environment jsdom
// 验证技能/MCP 多选能力：
// 1) selectSkill/selectMcpService toggle 多选与 chips 指示器渲染/单独移除
// 2) getSkillContextText/getMcpContextText 多段拼接（选择顺序、空行连接）
// 3) refreshSkillPickedState/refreshMcpPickedState 列表已选标记（Tab 视图与合并视图）
// 4) addMessage 显示剥离对多段注入文本循环生效（中/英双语格式）
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
        list.forEach(k => {
          if (k === 'skillsEnabled') result.skillsEnabled = true;
          if (k === 'mcpTools') result.mcpTools = [
            { serverId: 'srv-x', serverName: '服务X' },
            { serverId: 'srv-x', serverName: '服务X' },
            { serverId: 'srv-x', serverName: '服务X' },
            { serverId: 'srv-y', serverName: '服务Y' },
          ];
        });
        if (typeof cb === 'function') cb(result);
        else return Promise.resolve(result);
      },
      set: noop,
    },
    onChanged: { addListener: noop },
    session: { set: () => Promise.resolve(), get: () => Promise.resolve({}), remove: () => Promise.resolve() },
  },
  runtime: {
    lastError: null,
    getManifest: () => ({ content_scripts: [{ js: [] }] }),
    getURL: (p) => p,
    sendMessage: (msg, cb) => {
      // getSkillContextText 走 callback 风格 GET_AGENT_SKILL_PROMPT
      if (msg && msg.type === 'GET_AGENT_SKILL_PROMPT' && typeof cb === 'function') {
        cb({ success: true, prompt: 'SKILL_PROMPT_' + msg.name });
      }
      // renderSkillList 走 GET_SKILL_LIST（SKILLS 运行时已定义）
      if (msg && msg.type === 'GET_SKILL_LIST' && typeof cb === 'function') {
        cb({ success: true, skills: SKILLS });
      }
      return Promise.resolve({});
    },
    connect: () => ({ onMessage: { addListener: noop }, postMessage: noop, disconnect: noop }),
    onMessage: { addListener: noop, removeListener: noop },
    getContexts: noop,
  },
  tabs: {
    query: noop, get: noop, sendMessage: noop, create: noop, update: noop,
    remove: noop, reload: noop, goBack: noop, goForward: noop,
    captureVisibleTab: noop, onUpdated: { addListener: noop }, onActivated: { addListener: noop },
  },
  scripting: { executeScript: noop },
  bookmarks: { getTree: noop, search: noop },
  history: { search: noop },
  cookies: { get: noop, getAll: noop, set: noop, remove: noop },
  downloads: { download: noop },
  notifications: { create: noop },
  offscreen: { createDocument: noop, hasDocument: noop },
};

let selector;
let state;
let chatManager;

const SKILLS = [
  { name: '技能A', description: 'A描述', type: 'agent', stepCount: 1, parameters: {}, enabled: true },
  { name: '技能B', description: '', type: 'workflow', stepCount: 2, parameters: {}, enabled: false },
];

const SERVICES = [
  { serverId: 'srv-x', serverName: '服务X', toolCount: 3 },
  { serverId: 'srv-y', serverName: '服务Y', toolCount: 5 },
];

beforeAll(async () => {
  selector = await import('../../src/side_panel/skill-selector.js');
  state = (await import('../../src/side_panel/state.js')).default;
  chatManager = await import('../../src/side_panel/chat-manager.js');
});

beforeEach(() => {
  document.body.innerHTML = `
    <div id="chatContainer" style="height: 500px; overflow-y: auto;"></div>
    <textarea id="userInput"></textarea>
    <div class="skill-indicator" id="skillIndicator" style="display: none;"></div>
    <div class="mcp-indicator" id="mcpIndicator" style="display: none;"></div>
    <div id="promptSelector" style="display: block;">
      <div class="prompt-dropdown show" id="promptDropdown">
        <div id="skillList" style="display: none;"></div>
        <div id="mcpList" style="display: none;"></div>
      </div>
    </div>
    <div class="prompt-list">
      <div class="skill-list-item" data-skill-name="技能A">A</div>
      <div class="skill-list-item" data-skill-name="技能B">B</div>
      <div class="merged-skill-item" data-skill-name="技能B">B-merged</div>
      <div class="mcp-list-item" data-server-name="服务X">X</div>
      <div class="merged-mcp-item" data-server-name="服务Y">Y-merged</div>
    </div>
  `;
  state.selectedSkills = [];
  state.selectedMcpServices = [];
});

describe('selectSkill 多选 toggle 与 chips 指示器', () => {
  test('选中→chip 显示；再次选择同一技能→移除并隐藏', () => {
    selector.selectSkill('技能A', SKILLS);
    expect(state.selectedSkills).toHaveLength(1);
    expect(state.selectedSkills[0].name).toBe('技能A');

    const indicator = document.getElementById('skillIndicator');
    expect(indicator.style.display).toBe('flex');
    let chips = indicator.querySelectorAll('.skill-ref-chip');
    expect(chips).toHaveLength(1);
    expect(chips[0].textContent).toContain('技能A');

    selector.selectSkill('技能A', SKILLS);
    expect(state.selectedSkills).toHaveLength(0);
    expect(indicator.style.display).toBe('none');
    expect(indicator.querySelectorAll('.skill-ref-chip')).toHaveLength(0);
  });

  test('连续选两个技能→两个 chip；未启用技能 chip 带 manual 类', () => {
    selector.selectSkill('技能A', SKILLS);
    selector.selectSkill('技能B', SKILLS);

    const indicator = document.getElementById('skillIndicator');
    expect(state.selectedSkills).toHaveLength(2);
    expect(indicator.querySelectorAll('.skill-ref-chip')).toHaveLength(2);
    const manualChip = indicator.querySelector('.skill-ref-chip-manual');
    expect(manualChip).toBeTruthy();
    expect(manualChip.textContent).toContain('技能B');
  });

  test('chip ✕ 仅移除对应技能', () => {
    selector.selectSkill('技能A', SKILLS);
    selector.selectSkill('技能B', SKILLS);

    const indicator = document.getElementById('skillIndicator');
    indicator.querySelector('.ref-chip-close[data-skill-name="技能A"]').click();

    expect(state.selectedSkills.map(s => s.name)).toEqual(['技能B']);
    expect(indicator.querySelectorAll('.skill-ref-chip')).toHaveLength(1);
  });

  test('clearSkillSelection 清空全部技能并隐藏指示器', () => {
    selector.selectSkill('技能A', SKILLS);
    selector.selectSkill('技能B', SKILLS);
    selector.clearSkillSelection();

    expect(state.selectedSkills).toHaveLength(0);
    expect(document.getElementById('skillIndicator').style.display).toBe('none');
  });

  test('列表项 picked 标记同步刷新（Tab 视图与合并视图）', () => {
    selector.selectSkill('技能A', SKILLS);
    expect(document.querySelector('.skill-list-item[data-skill-name="技能A"]').classList.contains('picked')).toBe(true);
    expect(document.querySelector('.skill-list-item[data-skill-name="技能B"]').classList.contains('picked')).toBe(false);
    expect(document.querySelector('.merged-skill-item[data-skill-name="技能B"]').classList.contains('picked')).toBe(false);

    selector.selectSkill('技能B', SKILLS);
    expect(document.querySelector('.merged-skill-item[data-skill-name="技能B"]').classList.contains('picked')).toBe(true);
  });

  test('clearTrigger:false 时不截断输入框中的 "/" 正文，仅回焦', () => {
    const input = document.getElementById('userInput');
    input.value = '看这个 https://a.com/b 页面';
    selector.selectSkill('技能A', SKILLS, { clearTrigger: false });
    expect(input.value).toBe('看这个 https://a.com/b 页面'); // 未被截断
    expect(document.activeElement).toBe(input); // 仍回焦
  });
});

describe('selectMcpService 多选 toggle 与 chips 指示器', () => {
  test('选中→chip 显示；再次选择同一服务→移除', () => {
    selector.selectMcpService('srv-x', '服务X', SERVICES);
    expect(state.selectedMcpServices).toHaveLength(1);

    const indicator = document.getElementById('mcpIndicator');
    expect(indicator.style.display).toBe('flex');
    expect(indicator.querySelectorAll('.mcp-ref-chip')).toHaveLength(1);
    expect(indicator.textContent).toContain('服务X');

    selector.selectMcpService('srv-x', '服务X', SERVICES);
    expect(state.selectedMcpServices).toHaveLength(0);
    expect(indicator.style.display).toBe('none');
  });

  test('多服务 chips + chip ✕ 单独移除', () => {
    selector.selectMcpService('srv-x', '服务X', SERVICES);
    selector.selectMcpService('srv-y', '服务Y', SERVICES);

    const indicator = document.getElementById('mcpIndicator');
    expect(indicator.querySelectorAll('.mcp-ref-chip')).toHaveLength(2);

    indicator.querySelector('.ref-chip-close[data-server-name="服务X"]').click();
    expect(state.selectedMcpServices.map(s => s.serverName)).toEqual(['服务Y']);
    expect(indicator.querySelectorAll('.mcp-ref-chip')).toHaveLength(1);
  });

  test('列表项 picked 标记同步刷新', () => {
    selector.selectMcpService('srv-y', '服务Y', SERVICES);
    expect(document.querySelector('.merged-mcp-item[data-server-name="服务Y"]').classList.contains('picked')).toBe(true);
    expect(document.querySelector('.mcp-list-item[data-server-name="服务X"]').classList.contains('picked')).toBe(false);
  });

  test('clearTrigger:false 时不截断输入框中的 "/" 正文，仅回焦', () => {
    const input = document.getElementById('userInput');
    input.value = '路径 src/side_panel 分析';
    selector.selectMcpService('srv-x', '服务X', SERVICES, { clearTrigger: false });
    expect(input.value).toBe('路径 src/side_panel 分析');
    expect(document.activeElement).toBe(input);
  });
});

describe('多段注入文本拼接', () => {
  test('getMcpContextText 按选择顺序拼接两个服务段', () => {
    selector.selectMcpService('srv-x', '服务X', SERVICES);
    selector.selectMcpService('srv-y', '服务Y', SERVICES);

    const text = selector.getMcpContextText();
    expect((text.match(/\[已选MCP服务: /g) || [])).toHaveLength(2);
    expect(text.indexOf('服务X')).toBeLessThan(text.indexOf('服务Y'));
    // 每服务一段（段间以 \n 连接，不共享同一段）
    const lines = text.split('\n').filter(l => l.startsWith('[已选MCP服务: '));
    expect(lines).toHaveLength(2);
  });

  test('getSkillContextText 按选择顺序拼接两个技能段（agent 完整说明 + workflow 提示）', async () => {
    selector.selectSkill('技能A', SKILLS);
    selector.selectSkill('技能B', SKILLS);

    const text = await selector.getSkillContextText();
    expect((text.match(/\[已选技能: /g) || [])).toHaveLength(2);
    expect(text.indexOf('技能A')).toBeLessThan(text.indexOf('技能B'));
    // Agent 技能：内联完整说明（GET_AGENT_SKILL_PROMPT 返回的内容）
    expect(text).toContain('SKILL_PROMPT_技能A');
    // 多段之间以空行连接
    expect(text).toContain('\n\n');
  });

  test('未选择时返回空字符串', () => {
    expect(selector.getMcpContextText()).toBe('');
  });
});

describe('addMessage 显示剥离支持多段注入', () => {
  test('中文格式：多技能 + 多 MCP 全部剥离，仅显示用户问题', () => {
    const text =
      '[已选MCP服务: 服务X]\n请使用「服务X」MCP服务来处理以下问题：\n' +
      '[已选MCP服务: 服务Y]\n请使用「服务Y」MCP服务来处理以下问题：\n' +
      '[已选技能: 技能A - A描述]\n技能A完整说明正文\n\n请根据上述技能说明，使用相关工具处理以下问题：\n' +
      '[已选技能: 技能B - B描述]\n请使用 `agent_skill`（action=run）执行「技能B」技能来处理以下问题。\n' +
      '用户的问题';

    const { element } = chatManager.addMessage('user', text, false);
    expect(element.textContent).toContain('用户的问题');
    expect(element.textContent).not.toContain('已选技能');
    expect(element.textContent).not.toContain('已选MCP服务');
  });

  test('英文格式：多 MCP + 多技能全部剥离', () => {
    const text =
      '[Selected MCP service: SvcX]\nPlease use the "SvcX" MCP service to handle the following problem:\n' +
      '[Selected MCP service: SvcY]\nPlease use the "SvcY" MCP service to handle the following problem:\n' +
      '[Selected skill: SkillA - descA]\nSkillA full doc\n\nPlease use the relevant tools to handle the following problem.\n' +
      'question';

    const { element } = chatManager.addMessage('user', text, false);
    expect(element.textContent).toContain('question');
    expect(element.textContent).not.toContain('Selected skill');
    expect(element.textContent).not.toContain('Selected MCP service');
  });

  test('单段注入（回归）：单技能 + 单 MCP 仍正常剥离', () => {
    const text =
      '[已选MCP服务: 服务X]\n请使用「服务X」MCP服务来处理以下问题：\n' +
      '[已选技能: 技能A - A描述]\n技能A完整说明正文\n\n请根据上述技能说明，使用相关工具处理以下问题：\n' +
      '只问一句';

    const { element } = chatManager.addMessage('user', text, false);
    expect(element.textContent).toContain('只问一句');
    expect(element.textContent).not.toContain('已选');
  });
});

describe('Ctrl/Cmd+点击单选并关闭（技能/MCP）', () => {
  test('普通点击技能项 → 选中且下拉框保持打开（多选）', async () => {
    await selector.renderSkillList('');
    const item = document.querySelector('#skillList .skill-list-item[data-skill-name="技能A"]');
    expect(item).toBeTruthy();
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.selectedSkills.map(s => s.name)).toEqual(['技能A']);
    // hidePromptSelector 未被调用：promptSelector 仍显示
    expect(document.getElementById('promptSelector').style.display).not.toBe('none');
  });

  test('Ctrl+点击技能项 → 选中并关闭下拉框', async () => {
    await selector.renderSkillList('');
    const item = document.querySelector('#skillList .skill-list-item[data-skill-name="技能A"]');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(state.selectedSkills.map(s => s.name)).toEqual(['技能A']);
    expect(document.getElementById('promptSelector').style.display).toBe('none');
  });

  test('Cmd+点击技能项 → 选中并关闭下拉框（macOS）', async () => {
    await selector.renderSkillList('');
    const item = document.querySelector('#skillList .skill-list-item[data-skill-name="技能A"]');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    expect(state.selectedSkills.map(s => s.name)).toEqual(['技能A']);
    expect(document.getElementById('promptSelector').style.display).toBe('none');
  });

  test('Ctrl+点击 MCP 项 → 选中并关闭下拉框', async () => {
    await selector.renderMcpList('');
    const item = document.querySelector('#mcpList .mcp-list-item[data-server-name="服务X"]');
    expect(item).toBeTruthy();
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(state.selectedMcpServices.map(s => s.serverName)).toEqual(['服务X']);
    expect(document.getElementById('promptSelector').style.display).toBe('none');
  });

  test('普通点击 MCP 项 → 选中且下拉框保持打开（多选）', async () => {
    await selector.renderMcpList('');
    const item = document.querySelector('#mcpList .mcp-list-item[data-server-name="服务Y"]');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.selectedMcpServices.map(s => s.serverName)).toEqual(['服务Y']);
    expect(document.getElementById('promptSelector').style.display).not.toBe('none');
  });
});

describe('默认行为回归（弹窗侧不受签名扩展影响）', () => {
  test('selectSkill 默认仍截断最后一个 "/" 之后文本', () => {
    const input = document.getElementById('userInput');
    input.value = '前缀/过滤词';
    selector.selectSkill('技能A', SKILLS);
    expect(input.value).toBe('前缀');
  });
});
