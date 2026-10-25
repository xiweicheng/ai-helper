// tool-timeout-params.unit.test.js - 工具超时参数契约（毫秒语义 + 执行侧归一）
//
// 回归背景：fetch_url 的 timeout 曾只是裸 { type: 'integer' }，模型按"秒"传 30，执行侧照毫秒用，
// 控制台实录 "请求超时 (30ms)"。顺着同一模式排查，manage_tab.loadTimeout、wait_navigation /
// wait_element / select_dropdown / interact_element 的 timeout 也都是裸参数（后四者连执行侧
// 钳制都没有，30ms 内必然判失败）。本文件钉住两件事：
//   1. 归一函数的行为（非数字/0/负数回落 fallback、越界钳制、小数取整）；
//   2. 所有工具模块里名字含 timeout 的参数都必须写出 minimum 与毫秒单位描述——
//      新增裸 timeout 参数会直接红，防止同一坑再被引入。
import { describe, test, expect } from 'vitest';
import { clampTimeoutMs, TOOL_TIMEOUT_BOUNDS } from '../../src/shared/tool-timeout.js';
import { TAB_TOOLS } from '../../src/background/tools/tab-tools.js';
import { BROWSER_TOOLS } from '../../src/background/tools/browser-tools.js';
import { STORAGE_TOOLS } from '../../src/background/tools/storage-tools.js';
import { AGENT_TOOLS } from '../../src/background/tools/agent-tools.js';
import { MEDIA_TOOLS } from '../../src/background/tools/media-tools.js';
import { MEMORY_TOOLS } from '../../src/background/tools/memory-tools.js';
import { RAG_TOOLS } from '../../src/background/tools/rag-tools.js';
import { AI_TOOLS } from '../../src/background/tools/ai-tools.js';
import { DEBUGGER_TOOLS } from '../../src/background/tools/debugger-tools.js';

const TOOL_MODULES = {
  TAB_TOOLS, BROWSER_TOOLS, STORAGE_TOOLS, AGENT_TOOLS, MEDIA_TOOLS,
  MEMORY_TOOLS, RAG_TOOLS, AI_TOOLS, DEBUGGER_TOOLS,
};

describe('clampTimeoutMs - 毫秒语义归一', () => {
  // 表格：bound 名 + 输入 + 期望值（期望值按 TOOL_TIMEOUT_BOUNDS 里的边界推导，不写死成魔法数）
  test.each([
    ['fetchUrl', 30, 1000],      // 模型按"秒"传 30 → 抬到下限
    ['fetchUrl', '30', 1000],    // 字符串形式同解
    ['fetchUrl', 0, 15000],      // 0 视为未提供
    ['fetchUrl', -5, 15000],     // 负数视为未提供
    ['fetchUrl', undefined, 15000],
    ['fetchUrl', 'abc', 15000],
    ['fetchUrl', NaN, 15000],
    ['fetchUrl', 1500.9, 1500],  // 小数向下取整
    ['fetchUrl', 999999, 120000],
    ['tabLoad', 30, 1000],
    ['navigation', 30, 1000],
    ['navigation', undefined, 30000],
    ['waitElement', 30, 200],
    ['waitElement', undefined, 10000],
    ['selectOption', 30, 200],
    ['actionWait', 30, 200],
    ['actionWait', 999999, 30000],
    ['actionMinWait', 30, 200],
    ['actionMinWait', undefined, 300],
  ])('%s: %s → %s', (boundName, input, expected) => {
    expect(clampTimeoutMs(input, TOOL_TIMEOUT_BOUNDS[boundName])).toBe(expected);
  });

  test('边界表本身自洽（fallback 落在 [min, max] 内，min < max）', () => {
    for (const [name, b] of Object.entries(TOOL_TIMEOUT_BOUNDS)) {
      expect(b.min, name).toBeLessThan(b.max);
      expect(b.fallback, name).toBeGreaterThanOrEqual(b.min);
      expect(b.fallback, name).toBeLessThanOrEqual(b.max);
    }
  });

  test('归一结果始终可直接用于 setTimeout（不返回 NaN/0）', () => {
    // 防回归：任何输入都不能让 setTimeout(x) 退化成"下一轮事件循环即触发"
    for (const input of [undefined, null, '', 'abc', NaN, 0, -1, 1, 1e12]) {
      for (const b of Object.values(TOOL_TIMEOUT_BOUNDS)) {
        const r = clampTimeoutMs(input, b);
        expect(Number.isFinite(r) && r > 0, `input=${String(input)}`).toBe(true);
      }
    }
  });
});

describe('schema 契约：名字含 timeout 的参数必须写清单位与下限', () => {
  const collectTimeoutParams = () => {
    const found = [];
    for (const [moduleName, tools] of Object.entries(TOOL_MODULES)) {
      for (const tool of tools) {
        const props = tool.function?.parameters?.properties || {};
        for (const [key, def] of Object.entries(props)) {
          if (!/timeout/i.test(key)) continue;
          found.push({ moduleName, tool: tool.function?.name || tool.id, key, def });
        }
      }
    }
    return found;
  };

  test('至少扫到已知的 6 个超时参数（扫描本身不是空转）', () => {
    const names = collectTimeoutParams().map(p => `${p.tool}.${p.key}`).sort();
    expect(names).toEqual(expect.arrayContaining([
      'fetch_url.timeout',
      'manage_tab.loadTimeout',
      'wait_navigation.timeout',
      'wait_element.timeout',
      'select_dropdown.timeout',
      'interact_element.timeout',
    ]));
  });

  test.each(
    (() => {
      const found = [];
      for (const [moduleName, tools] of Object.entries(TOOL_MODULES)) {
        for (const tool of tools) {
          const props = tool.function?.parameters?.properties || {};
          for (const [key, def] of Object.entries(props)) {
            if (/timeout/i.test(key)) found.push([`${moduleName}:${tool.function?.name || tool.id}.${key}`, def]);
          }
        }
      }
      return found;
    })()
  )('%s 声明了 minimum 与毫秒单位描述', (_label, def) => {
    expect(typeof def.minimum, 'missing minimum').toBe('number');
    expect(typeof def.description, 'missing description').toBe('string');
    expect(def.description).toMatch(/ms|millisecond/i);
    expect(def.description).toMatch(/clamp/i);
  });
});
