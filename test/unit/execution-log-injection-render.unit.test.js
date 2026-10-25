// @vitest-environment jsdom
// execution-log-injection-render.unit.test.js —— 插话（user_injection）在**三套**日志渲染里都必须可见
//
// 坑：同一份 executionLog 有三条渲染路径 ——
//   renderExecutionTimeline      → 流式中的实时面板
//   renderExecutionLogOriginal   → 事后「执行日志」面板（无任务组）
//   renderSingleEntry            → 事后「执行日志」面板（按任务组分组）
// 只给其中一条加 user_injection 分支，另外两条就会把插话渲染成“没有图标、点开也没有内容”
// 的普通节点。这个测试把三条路径钉在一起，避免以后又只改一处。
import { describe, test, expect } from 'vitest';
import { renderExecutionTimeline, renderExecutionLogForPanel } from '../../src/side_panel/execution-log-render.js';

const INJECTION_TEXT = '顺便把日志级别调成 debug';

function buildLog(withGroup = false) {
  const injection = {
    id: 'inj-1',
    iteration: 1,
    timestamp: new Date().toISOString(),
    nodeType: 'user_injection',
    nodeName: '用户插话',
    content: INJECTION_TEXT,
    status: 'success',
  };
  const tool = {
    id: 'tool-1',
    iteration: 1,
    timestamp: new Date().toISOString(),
    nodeType: 'tool_exec',
    nodeName: '执行工具:take_note',
    action: { name: 'take_note', params: { content: 'x' } },
    status: 'success',
    duration: 12,
  };
  const entries = [injection, tool];
  return withGroup
    ? entries.map((e) => ({ ...e, taskGroup: 'g1', taskGroupIndex: 0, taskGroupName: '任务组' }))
    : entries;
}

describe('插话在执行日志的三种渲染里都可见', () => {
  // 这三条用例都不含 api_call，所以 💬 只可能来自插话节点本身
  test('实时面板（renderExecutionTimeline）：💬 图标 + 插话原文', () => {
    const html = renderExecutionTimeline(buildLog());
    expect(html).toContain('💬');
    expect(html).toContain(INJECTION_TEXT);
  });

  test('事后日志（无任务组）：💬 图标 + 插话原文', () => {
    const html = renderExecutionLogForPanel(buildLog(false));
    expect(html).toContain('💬');
    expect(html).toContain(INJECTION_TEXT);
  });

  test('事后日志（按任务组分组）：💬 图标 + 插话原文', () => {
    const html = renderExecutionLogForPanel(buildLog(true));
    expect(html).toContain('💬');
    expect(html).toContain(INJECTION_TEXT);
  });

  test('没有 content 的插话不会渲染空标题区块', () => {
    const entries = [{ ...buildLog()[0], content: '' }];
    const html = renderExecutionLogForPanel(entries);
    expect(html).not.toContain('timeline-section');
  });

  test('普通节点不会被误标成插话（💬 不扩散）', () => {
    const html = renderExecutionLogForPanel([buildLog()[1]]);
    expect(html).not.toContain('💬');
  });
});
