// applyRagToolIntroduction 单元测试：RAG 知识库工具一次性引入（默认并入启用列表，之后跟随用户勾选）
import { describe, test, expect } from 'vitest';
import { applyRagToolIntroduction, getRagToolIds } from '../../src/side_panel/tool-panel.js';

const RAG_TOOLS = [
  { id: 'knowledge_search' },
  { id: 'knowledge_ingest' },
  { id: 'knowledge_list' },
];

describe('applyRagToolIntroduction - RAG 工具一次性引入', () => {
  test('已完成引入（introduced=true）时原样返回，不合并', () => {
    const r = applyRagToolIntroduction(['page_content'], RAG_TOOLS, true);
    expect(r.tools).toEqual(['page_content']);
    expect(r.migrated).toBe(false);
  });

  test('未引入但无 RAG 工具（未注册）时原样返回', () => {
    expect(applyRagToolIntroduction(['a'], [], undefined)).toEqual({ tools: ['a'], migrated: false });
    expect(applyRagToolIntroduction(['a'], null, undefined)).toEqual({ tools: ['a'], migrated: false });
  });

  test('首次引入：把全部 RAG 工具并入并标记 migrated', () => {
    const r = applyRagToolIntroduction(['page_content'], RAG_TOOLS, undefined);
    expect(r.tools).toEqual(['page_content', 'knowledge_search', 'knowledge_ingest', 'knowledge_list']);
    expect(r.migrated).toBe(true);
  });

  test('部分已存在时只补缺失的，不产生重复', () => {
    const r = applyRagToolIntroduction(['knowledge_search', 'x'], RAG_TOOLS, undefined);
    expect(r.tools).toEqual(['knowledge_search', 'x', 'knowledge_ingest', 'knowledge_list']);
    expect(r.migrated).toBe(true);
  });

  test('全部已存在时 migrated=false（无需持久化引入标记）', () => {
    const r = applyRagToolIntroduction(['knowledge_search', 'knowledge_ingest', 'knowledge_list'], RAG_TOOLS, undefined);
    expect(r.tools).toEqual(['knowledge_search', 'knowledge_ingest', 'knowledge_list']);
    expect(r.migrated).toBe(false);
  });

  test('savedTools 非数组时按空列表处理', () => {
    expect(applyRagToolIntroduction(null, RAG_TOOLS, undefined).tools).toEqual(['knowledge_search', 'knowledge_ingest', 'knowledge_list']);
    expect(applyRagToolIntroduction(undefined, RAG_TOOLS, undefined).migrated).toBe(true);
  });

  test('不修改传入的原数组（纯函数）', () => {
    const base = ['a'];
    applyRagToolIntroduction(base, RAG_TOOLS, undefined);
    expect(base).toEqual(['a']);
  });
});

describe('getRagToolIds - 已注册 RAG 工具 ID 列表', () => {
  test('storage 无缓存时返回空数组', () => {
    expect(getRagToolIds()).toEqual([]);
  });

  test('返回类型为数组', () => {
    expect(Array.isArray(getRagToolIds())).toBe(true);
  });
});
