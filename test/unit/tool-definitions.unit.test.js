// tool-definitions 单元测试：7 个工具定义文件的 schema 合规性校验（纯数据，node 环境）
import { describe, test, expect } from 'vitest';
import { RAW_TOOLS } from '../../src/background/constants.js';
import { BROWSER_TOOLS } from '../../src/background/tools/browser-tools.js';
import { TAB_TOOLS } from '../../src/background/tools/tab-tools.js';
import { STORAGE_TOOLS } from '../../src/background/tools/storage-tools.js';
import { MEDIA_TOOLS } from '../../src/background/tools/media-tools.js';
import { AI_TOOLS } from '../../src/background/tools/ai-tools.js';
import { AGENT_TOOLS } from '../../src/background/tools/agent-tools.js';
import { MEMORY_TOOLS } from '../../src/background/tools/memory-tools.js';

const VALID_EXECUTIONS = ['content_script', 'background'];
const ALL_GROUPS = { BROWSER_TOOLS, TAB_TOOLS, STORAGE_TOOLS, MEDIA_TOOLS, AI_TOOLS, AGENT_TOOLS, MEMORY_TOOLS };

describe('工具定义聚合 - RAW_TOOLS', () => {
  test('RAW_TOOLS 非空且包含全部 7 组', () => {
    expect(RAW_TOOLS.length).toBeGreaterThan(0);
    const expected = BROWSER_TOOLS.length + TAB_TOOLS.length + STORAGE_TOOLS.length
      + MEDIA_TOOLS.length + AI_TOOLS.length + AGENT_TOOLS.length + MEMORY_TOOLS.length;
    expect(RAW_TOOLS.length).toBe(expected);
  });

  test('所有工具 id 全局唯一', () => {
    const ids = RAW_TOOLS.map(t => t.id);
    const dup = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect(dup, `重复 id: ${dup.join(', ')}`).toEqual([]);
  });
});

describe('工具定义 schema 合规性', () => {
  test('每个工具具备必需字段', () => {
    RAW_TOOLS.forEach(tool => {
      expect(tool.id, `工具缺少 id: ${JSON.stringify(tool)}`).toBeTruthy();
      expect(tool.type, `${tool.id} 缺少 type`).toBe('function');
      expect(tool.category, `${tool.id} 缺少 category`).toBeTruthy();
      expect(tool.execution, `${tool.id} execution 缺失`).toBeDefined();
      expect(tool.function, `${tool.id} 缺少 function`).toBeDefined();
      expect(tool.function.name, `${tool.id} 缺少 function.name`).toBeTruthy();
      expect(tool.function.parameters, `${tool.id} 缺少 parameters`).toBeDefined();
    });
  });

  test('function.name === id', () => {
    RAW_TOOLS.forEach(tool => {
      expect(tool.function.name, `${tool.id} 的 name(${tool.function.name}) ≠ id`).toBe(tool.id);
    });
  });

  test('execution 取值合法', () => {
    RAW_TOOLS.forEach(tool => {
      expect(VALID_EXECUTIONS, `${tool.id} execution 非法: ${tool.execution}`).toContain(tool.execution);
    });
  });

  test('parameters.type === "object"', () => {
    RAW_TOOLS.forEach(tool => {
      expect(tool.function.parameters.type, `${tool.id} parameters.type 非法`).toBe('object');
    });
  });

  test('required 中每个字段都在 properties 中存在', () => {
    RAW_TOOLS.forEach(tool => {
      const required = tool.function.parameters.required || [];
      const props = tool.function.parameters.properties || {};
      required.forEach(field => {
        expect(props[field], `${tool.id} 的 required 字段 "${field}" 不在 properties 中`).toBeDefined();
      });
    });
  });

  test('enum 字段值为字符串数组', () => {
    RAW_TOOLS.forEach(tool => {
      const props = tool.function.parameters.properties || {};
      Object.entries(props).forEach(([name, schema]) => {
        if (schema.enum !== undefined) {
          expect(Array.isArray(schema.enum), `${tool.id}.${name} enum 非数组`).toBe(true);
          schema.enum.forEach(v => {
            expect(typeof v, `${tool.id}.${name} enum 含非字符串值`).toBe('string');
          });
        }
      });
    });
  });

  test('array 类型字段的 items 定义存在', () => {
    RAW_TOOLS.forEach(tool => {
      const props = tool.function.parameters.properties || {};
      Object.entries(props).forEach(([name, schema]) => {
        if (schema.type === 'array') {
          expect(schema.items, `${tool.id}.${name} 是 array 但缺 items`).toBeDefined();
        }
      });
    });
  });
});

describe('各分组工具定义非空', () => {
  Object.entries(ALL_GROUPS).forEach(([group, tools]) => {
    test(`${group} 非空且每项有 id`, () => {
      expect(tools.length, `${group} 为空`).toBeGreaterThan(0);
      tools.forEach(t => expect(t.id).toBeTruthy());
    });
  });
});
