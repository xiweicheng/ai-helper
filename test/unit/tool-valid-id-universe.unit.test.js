// getValidToolIdUniverse 单元测试：工具勾选的有效性全集必须包含 RAG 知识库工具静态全集。
// 复现 bug：代理离线时 storage.ragTools 被清空（RAG 工具临时卸载），若只按"内置 + 当前已注册"
// 判定有效性，用户已勾选的知识库工具会被各加载/切换/保存路径当作残留 ID 清理并持久化，
// 代理重连后（ragToolsIntroduced=true 不再重新引入）勾选丢失，须手动重勾。
import { describe, test, expect } from 'vitest';
import { getValidToolIdUniverse } from '../../src/side_panel/tool-panel.js';
import { RAG_TOOL_IDS } from '../../src/side_panel/constants.js';

const KNOWLEDGE_IDS = ['knowledge_search', 'knowledge_ingest', 'knowledge_list'];

describe('getValidToolIdUniverse - 工具勾选有效性全集', () => {
  test('RAG 静态全集与 background 注册表同源（3 个知识库工具）', () => {
    expect(RAG_TOOL_IDS).toEqual(KNOWLEDGE_IDS);
  });

  test('代理离线（ragTools 为空）：知识库工具仍属有效 ID', () => {
    const universe = getValidToolIdUniverse([]);
    for (const id of KNOWLEDGE_IDS) {
      expect(universe.has(id), `${id} 不应被判定为无效`).toBe(true);
    }
  });

  test('代理离线过滤后不丢失用户勾选（复现修复前的清理链路）', () => {
    const saved = ['page_content', ...KNOWLEDGE_IDS];
    const filtered = saved.filter(id => getValidToolIdUniverse([]).has(id));
    expect(filtered).toEqual(saved);
  });

  test('真正无效的残留 ID（旧版 MCP 工具）仍会被清理', () => {
    const saved = ['page_content', 'mcp_someServer_someTool'];
    const filtered = saved.filter(id => getValidToolIdUniverse([]).has(id));
    expect(filtered).toEqual(['page_content']);
  });

  test('已注册的动态 RAG 工具并入全集且去重', () => {
    const universe = getValidToolIdUniverse([{ id: 'knowledge_search' }, { id: 'future_rag_tool' }]);
    expect(universe.has('knowledge_search')).toBe(true);
    expect(universe.has('future_rag_tool')).toBe(true);
    expect([...universe].filter(id => id === 'knowledge_search').length).toBe(1);
  });

  test('内置工具 ID 始终有效；ragTools 缺省/非法时安全降级', () => {
    expect(getValidToolIdUniverse(undefined).has('page_content')).toBe(true);
    expect(getValidToolIdUniverse(null).has('knowledge_list')).toBe(true);
  });
});
