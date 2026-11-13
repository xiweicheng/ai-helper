// @vitest-environment jsdom
// 配置页 Agent Skill 导出：卡片入口、ZIP 下载、在途锁与成功/失败反馈
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { t } from '../../src/shared/i18n.js';

const mock = vi.hoisted(() => ({
  apiCalls: [],
  toastCalls: [],
  response: null,
  deferred: null,
  state: { agentConnected: true, cachedSkills: [] }
}));

vi.mock('../../src/options/toolbox-shared.js', () => ({
  state: mock.state,
  agentApi: vi.fn(async (method, path) => {
    mock.apiCalls.push({ method, path });
    if (mock.deferred) return mock.deferred.promise;
    return mock.response || { success: true, fileName: 'demo-skill.zip', zipData: 'UEsDBA==' };
  }),
  escapeHtml: (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;'),
  getAgentConnection: vi.fn(async () => ({})),
  showCustomConfirm: vi.fn(),
  showAgentSkillViewer: vi.fn(),
  showToast: vi.fn((message, type) => mock.toastCalls.push({ message, type })),
  triggerRefresh: vi.fn()
}));

const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
let downloadCalls;
let mod;

beforeEach(async () => {
  vi.resetModules();
  mock.apiCalls.length = 0;
  mock.toastCalls.length = 0;
  mock.response = null;
  mock.deferred = null;
  mock.state.agentConnected = true;
  mock.state.cachedSkills = [];
  downloadCalls = [];
  URL.createObjectURL = vi.fn(() => 'blob:agent-skill');
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function () {
    downloadCalls.push({ fileName: this.download, href: this.href });
  });
  document.body.innerHTML = '<div id="skillList"></div>';
  mod = await import('../../src/options/toolbox-skills.js');
});

afterEach(() => {
  vi.restoreAllMocks();
  if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL;
  else delete URL.createObjectURL;
  if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL;
  else delete URL.revokeObjectURL;
  document.body.innerHTML = '';
});

describe('配置页 Agent Skill 导出', () => {
  it('仅为 Agent 技能卡片渲染导出入口', () => {
    mod.renderSkills([
      { name: 'demo-skill', type: 'agent', description: 'Agent', resources: [] },
      { name: 'workflow-skill', type: 'workflow', description: 'Workflow', parameters: {} }
    ]);

    const agentCard = document.querySelector('.skill-card-agent');
    const workflowCard = document.querySelector('.skill-card-workflow');
    expect(agentCard.querySelector('[data-action="export-agent-skill"]')).toBeTruthy();
    expect(workflowCard.querySelector('[data-action="export-agent-skill"]')).toBeNull();
  });

  it('下载技能 ZIP，并在导出期间锁定按钮、完成后恢复', async () => {
    expect(mod.exportAgentSkill).toBeTypeOf('function');
    let resolveExport;
    mock.deferred = { promise: new Promise(resolve => { resolveExport = resolve; }) };
    const button = document.createElement('button');
    button.textContent = t('toolbox.exportSkill');

    const firstExport = mod.exportAgentSkill('demo-skill', button);
    expect(button.disabled).toBe(true);
    expect(button.textContent).toBe(t('toolbox.exportingSkill'));
    expect(await mod.exportAgentSkill('demo-skill', button)).toBe(false);
    expect(mock.apiCalls).toHaveLength(1);

    resolveExport({ success: true, fileName: 'demo-skill.zip', zipData: 'UEsDBA==' });
    expect(await firstExport).toBe(true);
    expect(mock.apiCalls[0]).toEqual({
      method: 'GET',
      path: '/api/skill/export?name=demo-skill'
    });
    expect(downloadCalls).toEqual([{ fileName: 'demo-skill.zip', href: 'blob:agent-skill' }]);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:agent-skill');
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('toolbox.exportSkill'));
    expect(mock.toastCalls).toContainEqual({
      message: t('toolbox.skillExported', { name: 'demo-skill' }),
      type: 'success'
    });
  });

  it('导出失败时提示错误且不触发下载', async () => {
    mock.response = { success: false, error: 'disk unavailable' };
    const button = document.createElement('button');
    button.textContent = t('toolbox.exportSkill');

    expect(await mod.exportAgentSkill('demo-skill', button)).toBe(false);
    expect(downloadCalls).toHaveLength(0);
    expect(button.disabled).toBe(false);
    expect(button.textContent).toBe(t('toolbox.exportSkill'));
    expect(mock.toastCalls).toContainEqual({
      message: t('toolbox.skillExportFailed', { error: 'disk unavailable' }),
      type: 'error'
    });
  });
});
