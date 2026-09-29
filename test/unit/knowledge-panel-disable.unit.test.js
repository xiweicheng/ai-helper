// @vitest-environment jsdom
// 验证选项页知识库面板的停用能力：
// 1) 停用库卡片弱化（kb-card-disabled）+「已停用」徽标 + 启停按钮文案切换
// 2) 状态筛选标签（全部 / 已启用 / 已停用）联动列表
// 3) 启停按钮 → POST /api/rag/collections/{id}/toggle → 成功提示 + 列表刷新
import { describe, test, expect, beforeEach, vi } from 'vitest';
import { t } from '../../src/shared/i18n.js';

const noop = () => {};

// 在模块注册表重置后仍共享的调用记录（vi.hoisted 保证 mock 工厂可引用）
const { apiCalls, toastCalls } = vi.hoisted(() => ({ apiCalls: [], toastCalls: [] }));

vi.mock('../../src/options/toolbox-shared.js', () => ({
  agentApi: vi.fn(async (method, path) => {
    apiCalls.push({ method, path });
    if (method === 'GET' && path === '/api/rag/collections') {
      return {
        success: true,
        collections: [
          { id: 'kb-1', name: '知识库一', documentCount: 2, chunkCount: 10 },
          { id: 'kb-2', name: '知识库二', documentCount: 1, chunkCount: 5, enabled: false }
        ]
      };
    }
    if (method === 'POST' && path === '/api/rag/collections/kb-2/toggle') {
      return { success: true, enabled: true };
    }
    if (method === 'POST' && path === '/api/rag/collections/kb-1/toggle') {
      return { success: true, enabled: false };
    }
    return { success: false, error: 'unexpected api call' };
  }),
  escapeHtml: (str) => {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  },
  showToast: (...args) => { toastCalls.push(args); },
  showCustomConfirm: vi.fn(async () => true)
}));

vi.mock('../../src/options/toolbox-rag.js', () => ({
  loadRagStatus: vi.fn(async () => ({ connected: true, ragAvailable: true, nodeVersion: 'v22.0.0' })),
  refreshRagSection: vi.fn(async () => {}),
  initRagEvents: noop,
  setRagAvailabilityChangeHandler: noop
}));

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = { ragEnabled: true };
        if (typeof cb === 'function') {
          cb(result);
          return;
        }
        return Promise.resolve(result);
      },
      set: async () => {}
    },
    onChanged: { addListener: noop }
  }
};

const DOM = `
  <div id="knowledgeGate" style="display:none;"></div>
  <div id="knowledgeMain">
    <input type="text" id="kbSearchInput">
    <button id="kbSearchClear" type="button">✕</button>
    <div class="toolbox-filter-tabs">
      <button class="toolbox-filter-tab active" data-filter="all" data-target="kb" type="button">全部</button>
      <button class="toolbox-filter-tab" data-filter="enabled" data-target="kb" type="button">已启用</button>
      <button class="toolbox-filter-tab" data-filter="disabled" data-target="kb" type="button">已停用</button>
    </div>
    <button id="createKbBtn" type="button"></button>
    <div class="knowledge-list" id="knowledgeList"></div>
    <span id="knowledgeCount" style="display:none;"></span>
  </div>
`;

let mod;

beforeEach(async () => {
  vi.resetModules(); // 重置知识库面板的模块级筛选/缓存状态
  apiCalls.length = 0;
  toastCalls.length = 0;
  document.body.innerHTML = DOM;
  mod = await import('../../src/options/knowledge-panel.js');
  mod.initKnowledgePanel();
  await mod.refreshKnowledgePanel();
  await vi.waitFor(() => expect(document.querySelectorAll('.kb-card')).toHaveLength(2));
});

describe('选项页知识库卡片：停用态与启停操作', () => {
  test('停用库卡片弱化 +「已停用」徽标；启停按钮文案切换', () => {
    const disabledCard = document.querySelector('.kb-card[data-kb-id="kb-2"]');
    expect(disabledCard.classList.contains('kb-card-disabled')).toBe(true);
    const badge = disabledCard.querySelector('.kb-card-badge.badge-disabled');
    expect(badge).toBeTruthy();
    expect(badge.textContent).toBe(t('knowledge.badgeDisabled'));
    expect(disabledCard.querySelector('[data-action="toggle"]').textContent).toBe(t('knowledge.actionEnable'));

    const enabledCard = document.querySelector('.kb-card[data-kb-id="kb-1"]');
    expect(enabledCard.classList.contains('kb-card-disabled')).toBe(false);
    expect(enabledCard.querySelector('.kb-card-badge')).toBeNull();
    expect(enabledCard.querySelector('[data-action="toggle"]').textContent).toBe(t('knowledge.actionDisable'));
  });

  test('点击启停按钮 → POST toggle + 成功提示 + 列表刷新', async () => {
    document.querySelector('.kb-card[data-kb-id="kb-2"] [data-action="toggle"]').click();

    await vi.waitFor(() => {
      const toggled = apiCalls.some(c => c.method === 'POST' && c.path === '/api/rag/collections/kb-2/toggle');
      expect(toggled).toBe(true);
    });
    await vi.waitFor(() => {
      const toasted = toastCalls.some(([msg]) => msg === t('knowledge.enableSuccess', { name: '知识库二' }));
      expect(toasted).toBe(true);
    });
    await vi.waitFor(() => {
      // 操作完成后列表已重新加载（≥2 次 GET）
      const gets = apiCalls.filter(c => c.method === 'GET' && c.path === '/api/rag/collections');
      expect(gets.length).toBeGreaterThanOrEqual(2);
    });
  });
});

describe('选项页知识库状态筛选标签', () => {
  test('已停用标签仅显示停用库；已启用标签仅显示启用库；全部恢复', () => {
    const clickTab = (filter) => document.querySelector(`.toolbox-filter-tab[data-filter="${filter}"]`).click();

    clickTab('disabled');
    expect(document.querySelector('.toolbox-filter-tab[data-filter="disabled"]').classList.contains('active')).toBe(true);
    let cards = document.querySelectorAll('.kb-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.kbId).toBe('kb-2');

    clickTab('enabled');
    cards = document.querySelectorAll('.kb-card');
    expect(cards).toHaveLength(1);
    expect(cards[0].dataset.kbId).toBe('kb-1');

    clickTab('all');
    expect(document.querySelectorAll('.kb-card')).toHaveLength(2);
  });
});

describe('选项页知识库计数：已启用 / 共（与 MCP / 技能一致）', () => {
  test('计数显示「已启用 X / 共 Y」：停用库计入总数、不计入已启用', () => {
    const el = document.getElementById('knowledgeCount');
    expect(el.style.display).not.toBe('none');
    expect(el.textContent).toBe(t('toolbox.enabledCountTotal', { enabled: 1, total: 2 }));
  });

  test('切换状态筛选标签后计数不变（始终基于全量）', () => {
    const el = document.getElementById('knowledgeCount');
    const expected = t('toolbox.enabledCountTotal', { enabled: 1, total: 2 });

    document.querySelector('.toolbox-filter-tab[data-filter="disabled"]').click();
    expect(el.textContent).toBe(expected);

    document.querySelector('.toolbox-filter-tab[data-filter="enabled"]').click();
    expect(el.textContent).toBe(expected);
  });
});
