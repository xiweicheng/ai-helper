// test/unit/tool-panel-no-dom-import.unit.test.js
// tool-panel.js 必须能在无 DOM 环境（node）里安全导入。
// 背景：模块初始化会预加载 MCP / RAG 工具缓存，并在 .then 回调里调用 updateToolsToggleState()
//   去摸 document；单测以 node 环境导入本模块时，回调在微任务里抛 "document is not defined"，
//   表现为游离于任何断言之外的 unhandled rejection —— 套件仍是绿的，但每次跑都埋两条噪音，
//   真出问题时它会被淹在里面。
import { describe, it, expect } from 'vitest';

describe('tool-panel 无 DOM 导入', () => {
  it('导入后微任务里不产生未处理的 rejection', async () => {
    expect(typeof document, '本测试前提是无 DOM 环境').toBe('undefined');

    const rejections = [];
    const collect = (reason) => rejections.push(String(reason && reason.message ? reason.message : reason));
    process.on('unhandledRejection', collect);
    try {
      await import('../../src/side_panel/tool-panel.js');
      // 让模块初始化里那条 .then 链跑完
      await new Promise((resolve) => setTimeout(resolve, 80));
    } finally {
      process.off('unhandledRejection', collect);
    }

    expect(rejections, `无 DOM 时不应抛错：${rejections.join(' | ')}`).toEqual([]);
  });
});
