// @vitest-environment jsdom
// 验证知识库 @ 选择器连续多选（与技能/MCP 行为对齐）：
// 1) 选中/取消选中后弹窗保持打开（不再调用 hideAgentAtSelector）
// 2) 连续多选 + chips 指示器
// 3) 列表项 picked / agent-at-active 标记同步刷新（单独 Tab 视图与合并视图）
// 4) removeKnowledgeRef / clearKnowledgeRefs 同步刷新标记
import { describe, test, expect, beforeAll, beforeEach } from 'vitest';

const noop = () => {};

globalThis.chrome = {
  storage: {
    local: {
      get: (keys, cb) => {
        const result = {};
        const list = Array.isArray(keys) ? keys : (keys ? [keys] : []);
        if (list.includes('ragEnabled')) result.ragEnabled = true;
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
      // renderKnowledgeAtList 经 background 转发 RAG_LIST_COLLECTIONS
      if (msg && msg.type === 'RAG_LIST_COLLECTIONS' && typeof cb === 'function') {
        cb({
          success: true,
          // 刻意乱序：停用库在接口返回时排最前，验证展示层会将其稳定排到末尾
          collections: [
            { id: 'kb-3', name: '知识库三', documentCount: 1, chunkCount: 3, enabled: false },
            { id: 'kb-1', name: '知识库一', documentCount: 2, chunkCount: 10 },
            { id: 'kb-2', name: '知识库二', documentCount: 1, chunkCount: 5 },
          ],
        });
        return Promise.resolve({});
      }
      if (typeof cb === 'function') cb({});
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

beforeAll(async () => {
  selector = await import('../../src/side_panel/agent-at-selector.js');
  state = (await import('../../src/side_panel/state.js')).default;
});

beforeEach(() => {
  document.body.innerHTML = `
    <textarea id="userInput"></textarea>
    <div class="knowledge-indicator" id="knowledgeIndicator" style="display: none;"></div>
    <div id="agentAtSelector" style="display: block;">
      <div class="prompt-dropdown show" id="agentAtDropdown">
        <div id="agentAtList">
          <div class="prompt-item prompt-item-knowledge" data-type="knowledge" data-kb-id="kb-1" data-kb-name="知识库一">知识库一</div>
          <div class="prompt-item prompt-item-knowledge" data-type="knowledge" data-kb-id="kb-2" data-kb-name="知识库二">知识库二</div>
        </div>
        <div id="agentPageList" style="display: none;"></div>
        <div id="agentProxyList" style="display: none;"></div>
        <div id="agentKnowledgeList" style="display: none;">
          <div class="prompt-item selected prompt-item-knowledge" data-kb-id="kb-1" data-kb-name="知识库一">知识库一</div>
          <div class="prompt-item prompt-item-knowledge" data-kb-id="kb-2" data-kb-name="知识库二">知识库二</div>
        </div>
      </div>
    </div>
  `;
  state.knowledgeRefs = [];
});

describe('知识库 @ 选择器连续多选', () => {
  test('选中后弹窗保持打开，两个视图同步显示 picked/agent-at-active 标记', () => {
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });

    // 弹窗未关闭（与技能/MCP 多选一致：点击外部才关闭）
    expect(document.getElementById('agentAtSelector').style.display).not.toBe('none');

    // 单独 Tab 视图 + 合并视图的 kb-1 项都标记 picked
    const pickedItems = document.querySelectorAll('.prompt-item-knowledge.picked');
    expect(pickedItems).toHaveLength(2);
    pickedItems.forEach(item => expect(item.dataset.kbId).toBe('kb-1'));
    // agent-at-active 高亮同步（code 文字变紫的既有视觉）
    expect(document.querySelectorAll('.prompt-item-knowledge.agent-at-active')).toHaveLength(2);
  });

  test('连续选中两个知识库 → chips 显示两个且弹窗保持打开', () => {
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });
    selector.selectKnowledgeByAt({ id: 'kb-2', name: '知识库二' });

    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-1', 'kb-2']);
    expect(document.getElementById('agentAtSelector').style.display).not.toBe('none');

    const indicator = document.getElementById('knowledgeIndicator');
    expect(indicator.style.display).toBe('flex');
    expect(indicator.querySelectorAll('.knowledge-chip')).toHaveLength(2);
  });

  test('再次选中同一知识库 → 取消选择并清除标记', () => {
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });

    expect(state.knowledgeRefs).toHaveLength(0);
    expect(document.querySelectorAll('.prompt-item-knowledge.picked')).toHaveLength(0);
    expect(document.getElementById('knowledgeIndicator').style.display).toBe('none');
  });

  test('选中时移除 @ 触发文本并保持焦点（可继续输入或连续勾选）', () => {
    const input = document.getElementById('userInput');
    input.value = '@知识';
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });

    expect(input.value).toBe('');
    expect(document.activeElement).toBe(input);
  });

  test('removeKnowledgeRef 后列表标记同步移除', () => {
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });
    selector.selectKnowledgeByAt({ id: 'kb-2', name: '知识库二' });

    selector.removeKnowledgeRef('kb-1');
    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-2']);
    const pickedItems = document.querySelectorAll('.prompt-item-knowledge.picked');
    expect(pickedItems).toHaveLength(2); // 两个视图中的 kb-2 保持标记
    pickedItems.forEach(item => expect(item.dataset.kbId).toBe('kb-2'));
  });

  test('clearKnowledgeRefs 清空全部引用与标记', () => {
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });
    selector.selectKnowledgeByAt({ id: 'kb-2', name: '知识库二' });

    selector.clearKnowledgeRefs();
    expect(state.knowledgeRefs).toHaveLength(0);
    expect(document.querySelectorAll('.prompt-item-knowledge.picked')).toHaveLength(0);
    expect(document.getElementById('knowledgeIndicator').style.display).toBe('none');
  });
});

describe('Ctrl/Cmd+点击单选并关闭（知识库）', () => {
  test('普通点击知识库项 → 选中且弹窗保持打开（多选）', async () => {
    await selector.switchAtTab('knowledge');
    const item = document.querySelector('#agentKnowledgeList .prompt-item-knowledge[data-kb-id="kb-1"]');
    expect(item).toBeTruthy();
    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-1']);
    expect(document.getElementById('agentAtSelector').style.display).not.toBe('none');
  });

  test('Ctrl+点击知识库项 → 选中并关闭弹窗', async () => {
    await selector.switchAtTab('knowledge');
    const item = document.querySelector('#agentKnowledgeList .prompt-item-knowledge[data-kb-id="kb-1"]');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-1']);
    expect(document.getElementById('agentAtSelector').style.display).toBe('none');
  });

  test('Cmd+点击知识库项 → 选中并关闭弹窗（macOS）', async () => {
    await selector.switchAtTab('knowledge');
    const item = document.querySelector('#agentKnowledgeList .prompt-item-knowledge[data-kb-id="kb-2"]');
    item.dispatchEvent(new MouseEvent('click', { bubbles: true, metaKey: true }));
    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-2']);
    expect(document.getElementById('agentAtSelector').style.display).toBe('none');
  });
});

describe('停用知识库：@ 选择器展示与手动引用', () => {
  test('停用库在列表中带"已停用"徽标，仍可正常选中引用', async () => {
    await selector.switchAtTab('knowledge');
    const item = document.querySelector('#agentKnowledgeList .prompt-item-knowledge[data-kb-id="kb-3"]');
    expect(item).toBeTruthy();
    expect(item.querySelector('.badge-disabled')).toBeTruthy();

    item.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-3']);
  });

  test('停用库引用后 chip 显示"手动引用"后缀与橙色样式类', () => {
    selector.selectKnowledgeByAt({ id: 'kb-3', name: '知识库三', enabled: false });
    const chip = document.querySelector('#knowledgeIndicator .knowledge-chip');
    expect(chip).toBeTruthy();
    expect(chip.textContent).toContain('手动引用');
    expect(chip.classList.contains('knowledge-chip-manual')).toBe(true);
  });

  test('启用库引用后 chip 无"手动引用"后缀', () => {
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' });
    const chip = document.querySelector('#knowledgeIndicator .knowledge-chip');
    expect(chip).toBeTruthy();
    expect(chip.textContent).not.toContain('手动引用');
    expect(chip.classList.contains('knowledge-chip-manual')).toBe(false);
  });
});

describe('@ 选择器知识库列表：启用在前、停用在后', () => {
  test('fetchKnowledgeCollections 返回顺序：启用库在前、停用库在后（组内保持原顺序）', async () => {
    const kbState = await selector.fetchKnowledgeCollections(true);
    expect(kbState.ok).toBe(true);
    expect(kbState.collections.map(c => c.id)).toEqual(['kb-1', 'kb-2', 'kb-3']);
  });

  test('知识库 Tab 列表渲染顺序：启用在前、停用在后', async () => {
    await selector.switchAtTab('knowledge');
    const ids = [...document.querySelectorAll('#agentKnowledgeList .prompt-item-knowledge')].map(el => el.dataset.kbId);
    expect(ids).toEqual(['kb-1', 'kb-2', 'kb-3']);
  });
});

describe('菜单面板入口（clearTrigger=false）：不截断输入框中的 @ 正文', () => {
  test('selectKnowledgeByAt(kb, { clearTrigger: false }) 保留原文、回焦且光标置末', () => {
    const input = document.getElementById('userInput');
    input.value = '@知识 请参考这份资料';
    selector.selectKnowledgeByAt({ id: 'kb-1', name: '知识库一' }, { clearTrigger: false });

    expect(state.knowledgeRefs.map(r => r.id)).toEqual(['kb-1']);
    expect(input.value).toBe('@知识 请参考这份资料'); // 未被截断
    expect(document.activeElement).toBe(input); // 仍回焦
    expect(input.selectionStart).toBe(input.value.length); // 光标置末
  });

  test('默认（clearTrigger=true）仍截断 @ 触发文本（弹窗行为不变）', () => {
    const input = document.getElementById('userInput');
    input.value = '@知识';
    selector.selectKnowledgeByAt({ id: 'kb-2', name: '知识库二' });
    expect(input.value).toBe('');
  });
});
