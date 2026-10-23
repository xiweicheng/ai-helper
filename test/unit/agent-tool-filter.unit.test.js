// 助手编辑器工具列表过滤纯函数的守卫：
// 编辑器工具区块的两个过滤能力——按名称/描述搜索、只看已勾选（可叠加）。
// 锁定：匹配口径（名称/展示描述/MCP 服务名+ID+服务内工具名）、大小写不敏感、
// selectedOnly 与 query 叠加、原顺序保持、空输入兜底不炸
import { describe, it, expect } from 'vitest';
import {
  matchesToolFilter,
  matchesServiceFilter,
  filterAgentToolEntries,
} from '../../src/side_panel/agent-tool-filter.js';

const tools = [
  { id: 'page_extract', name: '页面提取', description: 'Extract page text', category: 'content_extraction' },
  { id: 'knowledge_search', name: '知识库检索', description: 'Search knowledge bases', category: 'knowledge' },
  { id: 'agent_exec', name: '命令执行', description: 'Execute shell command', category: 'local_agent' },
];
const services = [
  { serverId: 'srv-a', serverName: 'Filesystem', tools: [{ name: 'read_file', description: 'Read a file' }] },
  { serverId: 'srv-b', serverName: 'Browser', tools: [{ name: 'screenshot', description: 'Capture screen' }] },
];

describe('matchesToolFilter', () => {
  it('空条件时全部通过', () => {
    expect(matchesToolFilter(tools[0], { query: '', selectedOnly: false, selectedSet: new Set() })).toBe(true);
  });

  it('按名称子串匹配（大小写不敏感）', () => {
    const opts = { query: 'KNOWLEDGE', selectedOnly: false, selectedSet: new Set() };
    expect(matchesToolFilter(tools[1], opts)).toBe(true);
    expect(matchesToolFilter(tools[0], opts)).toBe(false);
  });

  it('按描述匹配，getDesc 注入时优先展示口径', () => {
    const byRaw = { query: 'shell', selectedOnly: false, selectedSet: new Set() };
    expect(matchesToolFilter(tools[2], byRaw)).toBe(true);
    const getDesc = (t) => (t.id === 'page_extract' ? '自定义展示描述' : '');
    const byDisplay = { query: '自定义', selectedOnly: false, selectedSet: new Set(), getDesc };
    expect(matchesToolFilter(tools[0], byDisplay)).toBe(true);
    // 展示口径覆盖后，原始 description 不再命中
    expect(matchesToolFilter(tools[0], { ...byDisplay, query: 'extract' })).toBe(false);
  });

  it('selectedOnly 只看已勾选集合', () => {
    const opts = { query: '', selectedOnly: true, selectedSet: new Set(['agent_exec']) };
    expect(matchesToolFilter(tools[2], opts)).toBe(true);
    expect(matchesToolFilter(tools[0], opts)).toBe(false);
  });
});

describe('matchesServiceFilter', () => {
  it('匹配服务名与服务 ID', () => {
    const opts = { query: 'srv-b', selectedOnly: false, excludedSet: new Set() };
    expect(matchesServiceFilter(services[1], opts)).toBe(true);
    expect(matchesServiceFilter(services[0], opts)).toBe(false);
  });

  it('匹配服务内工具名', () => {
    const opts = { query: 'read_file', selectedOnly: false, excludedSet: new Set() };
    expect(matchesServiceFilter(services[0], opts)).toBe(true);
    expect(matchesServiceFilter(services[1], opts)).toBe(false);
  });

  it('selectedOnly 下已排除服务不显示，开放服务显示', () => {
    const opts = { query: '', selectedOnly: true, excludedSet: new Set(['srv-a']) };
    expect(matchesServiceFilter(services[0], opts)).toBe(false);
    expect(matchesServiceFilter(services[1], opts)).toBe(true);
  });
});

describe('filterAgentToolEntries', () => {
  const base = {
    tools, services,
    selectedSet: new Set(['knowledge_search']),
    excludedSet: new Set(['srv-b']),
  };

  it('无过滤条件时返回全量且保持原顺序', () => {
    const out = filterAgentToolEntries({ ...base, query: '', selectedOnly: false });
    expect(out.tools.map(t => t.id)).toEqual(['page_extract', 'knowledge_search', 'agent_exec']);
    expect(out.services.map(s => s.serverId)).toEqual(['srv-a', 'srv-b']);
  });

  it('搜索与只看已勾选叠加：两者同时命中才可见', () => {
    const out = filterAgentToolEntries({ ...base, query: '知识', selectedOnly: true });
    expect(out.tools.map(t => t.id)).toEqual(['knowledge_search']);
    // srv-a 名称命中 query 且未被排除 → 可见；srv-b 命中不了 query → 不可见
    const out2 = filterAgentToolEntries({ ...base, query: 'filesystem', selectedOnly: true });
    expect(out2.services.map(s => s.serverId)).toEqual(['srv-a']);
  });

  it('selectedOnly：工具按勾选集合、服务按未排除过滤', () => {
    const out = filterAgentToolEntries({ ...base, query: '', selectedOnly: true });
    expect(out.tools.map(t => t.id)).toEqual(['knowledge_search']);
    expect(out.services.map(s => s.serverId)).toEqual(['srv-a']);
  });

  it('输入缺失/空集合时兜底不抛异常', () => {
    const out = filterAgentToolEntries({
      tools: undefined, services: undefined,
      selectedSet: new Set(), excludedSet: new Set(),
      query: '   ', selectedOnly: true,
    });
    expect(out.tools).toEqual([]);
    expect(out.services).toEqual([]);
  });
});
