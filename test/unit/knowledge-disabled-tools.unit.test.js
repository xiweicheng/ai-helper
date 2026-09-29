// test/unit/knowledge-disabled-tools.unit.test.js
// 验证 LLM 知识库工具对停用库的过滤（停用 = 对模型完全不可见）：
// 1) knowledge_list：不列出停用库（全停用时返回"暂无知识库"引导）
// 2) knowledge_search：指名停用库 → 拒绝且不发起检索；指名启用库 → 正常检索
// 3) knowledge_ingest：导入到停用库 → 拒绝且不发起导入
// 4) fail-open：停用状态查询失败（代理不可用）时放行，不误伤正常检索
// 注：@ 手动引用链路（RAG_SEARCH 显式 IDs 直达 agent）不经过本模块，显式 IDs 红线由 agent 路由测试覆盖
import { describe, test, expect, vi, beforeEach } from 'vitest';

vi.mock('../../src/background/local-agent-client.js', () => ({
  ragListCollections: vi.fn(),
  ragSearch: vi.fn(),
  ragIngest: vi.fn(),
}));

import * as AgentClient from '../../src/background/local-agent-client.js';
import { RAG_TOOL_HANDLERS } from '../../src/background/tool-executor.js';
import { t } from '../../src/shared/i18n.js';

const ON_KB = { id: 'kb_on', name: '启用库', documentCount: 1, chunkCount: 2 };
const OFF_KB = { id: 'kb_off', name: '停用库', enabled: false, documentCount: 3, chunkCount: 4 };

beforeEach(() => {
  vi.clearAllMocks();
});

describe('knowledge_list - 停用库从 LLM 可见列表中隐藏', () => {
  test('列表只包含已启用库', async () => {
    AgentClient.ragListCollections.mockResolvedValue({ success: true, collections: [ON_KB, OFF_KB] });
    const res = await RAG_TOOL_HANDLERS.knowledge_list({}, 'tc-list-1');
    expect(res.success).toBe(true);
    expect(res.content).toContain('启用库');
    expect(res.content).not.toContain('停用库');
  });

  test('全部停用：回退为"暂无知识库"引导（模型不应感知停用库存在）', async () => {
    AgentClient.ragListCollections.mockResolvedValue({ success: true, collections: [OFF_KB] });
    const res = await RAG_TOOL_HANDLERS.knowledge_list({}, 'tc-list-2');
    expect(res.success).toBe(true);
    expect(res.content).toBe(t('toolExec.knowledgeListEmpty'));
  });
});

describe('knowledge_search - 指名停用库拒绝', () => {
  test('指名停用库：拒绝且不发起检索', async () => {
    AgentClient.ragListCollections.mockResolvedValue({ success: true, collections: [ON_KB, OFF_KB] });
    const res = await RAG_TOOL_HANDLERS.knowledge_search({ query: '测试', collectionId: 'kb_off' }, 'tc-search-1');
    expect(res.success).toBe(false);
    expect(AgentClient.ragSearch).not.toHaveBeenCalled();
  });

  test('指名已启用库：正常检索（collectionIds 透传）', async () => {
    AgentClient.ragListCollections.mockResolvedValue({ success: true, collections: [ON_KB, OFF_KB] });
    AgentClient.ragSearch.mockResolvedValue({ success: true, results: [] });
    await RAG_TOOL_HANDLERS.knowledge_search({ query: '测试', collectionId: 'kb_on' }, 'tc-search-2');
    expect(AgentClient.ragSearch).toHaveBeenCalledWith({ query: '测试', collectionIds: ['kb_on'] });
  });

  test('未指定库：透传（全库检索的停用过滤由 agent 端 /api/rag/search 无 ids 分支负责）', async () => {
    AgentClient.ragSearch.mockResolvedValue({ success: true, results: [] });
    await RAG_TOOL_HANDLERS.knowledge_search({ query: '测试' }, 'tc-search-3');
    expect(AgentClient.ragSearch).toHaveBeenCalledWith({ query: '测试' });
  });

  test('fail-open：停用状态查询失败时放行检索（代理抖动不误伤）', async () => {
    AgentClient.ragListCollections.mockRejectedValue(new Error('agent offline'));
    AgentClient.ragSearch.mockResolvedValue({ success: true, results: [] });
    await RAG_TOOL_HANDLERS.knowledge_search({ query: '测试', collectionId: 'kb_on' }, 'tc-search-4');
    expect(AgentClient.ragSearch).toHaveBeenCalled();
  });
});

describe('knowledge_ingest - 导入停用库拒绝', () => {
  test('导入到停用库：拒绝且不发起导入', async () => {
    AgentClient.ragListCollections.mockResolvedValue({ success: true, collections: [ON_KB, OFF_KB] });
    const res = await RAG_TOOL_HANDLERS.knowledge_ingest(
      { collectionId: 'kb_off', type: 'text', content: 'x' },
      'tc-ingest-1'
    );
    expect(res.success).toBe(false);
    expect(AgentClient.ragIngest).not.toHaveBeenCalled();
  });

  test('导入到已启用库：正常执行', async () => {
    AgentClient.ragListCollections.mockResolvedValue({ success: true, collections: [ON_KB] });
    AgentClient.ragIngest.mockResolvedValue({ success: true, chunkCount: 1 });
    const res = await RAG_TOOL_HANDLERS.knowledge_ingest(
      { collectionId: 'kb_on', type: 'text', content: 'x' },
      'tc-ingest-2'
    );
    expect(res.success).toBe(true);
    expect(AgentClient.ragIngest).toHaveBeenCalledWith('kb_on', { type: 'text', content: 'x', name: undefined, metadata: undefined });
  });
});
