// @vitest-environment jsdom
// realtime-log-raf.unit.test.js —— 实时执行日志面板 rAF 合帧调度状态机
// 背景：updateRealtimeExecutionLogPanel 从「每次同步全量渲染」改为 rAF 合帧
// （同一帧多次状态更新只渲最后一次，长任务千条日志的全量 innerHTML 重建是
// 侧边栏最大 CPU/GC 开销来源）。本测试钉住调度状态机的四个关键行为，防回归：
//   ① 合帧：同帧多次更新合并为一次渲染且为最新状态（MutationObserver 计数）
//   ② 推迟：调度阶段（rAF 冲刷前）不做任何 DOM 渲染
//   ③ 安全早退：渲染前面板已被移除时，flush 不抛错
//   ④ 兜底：无 requestAnimationFrame 的环境走同步渲染（jsdom 默认无 rAF 即此路径）
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { updateRealtimeExecutionLogPanel } from '../../src/side_panel/execution-log-render.js';

let rafQueue = [];
const flushRaf = () => {
  const q = rafQueue;
  rafQueue = [];
  q.forEach(cb => cb());
};

/** 渲染体依赖的最小面板结构（renderRealtimeExecutionLogPanel 查询的选择器） */
function mountPanel() {
  document.body.innerHTML = `
    <div class="execution-log-panel realtime-mode">
      <div class="log-summary">
        <span class="realtime-executing-node"></span>
        <span class="combo-value">0</span>
        <div class="combo-stat success"><span class="stat-value">0</span></div>
        <div class="combo-stat failed"><span class="stat-value">0</span></div>
        <div class="combo-stat subtask" style="display:none"><span class="stat-value">0/0</span></div>
      </div>
      <div class="timeline"></div>
    </div>`;
  return document.querySelector('.execution-log-panel.realtime-mode');
}

function makeEntry(i) {
  return {
    id: 'e' + i,
    iteration: 1,
    timestamp: new Date(Date.now() + i).toISOString(),
    status: 'success',
    nodeType: 'tool_exec',
    nodeName: '工具 ' + i,
  };
}

const statusWith = (...entries) => ({
  nodeName: 'N' + entries.length,
  status: 'processing',
  executionLog: entries,
});

beforeEach(() => {
  rafQueue = [];
  globalThis.requestAnimationFrame = (cb) => { rafQueue.push(cb); return rafQueue.length; };
});
afterEach(() => {
  // jsdom 默认无 rAF：删掉 mock，恢复环境原状（也避免影响其他测试文件）
  delete globalThis.requestAnimationFrame;
  document.body.innerHTML = '';
});

describe('实时执行日志面板 rAF 合帧调度', () => {
  test('①② 同帧三次更新：调度期不渲染，单次 flush 后只渲一次且为最新状态', async () => {
    const panel = mountPanel();
    const timeline = panel.querySelector('.timeline');

    let mutations = 0;
    const observer = new MutationObserver(() => { mutations++; });
    observer.observe(timeline, { childList: true, subtree: true });

    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1)));
    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1), makeEntry(2)));
    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1), makeEntry(2), makeEntry(3)));

    // ② 调度阶段推迟渲染：rAF 冲刷前 timeline 仍是空
    expect(timeline.querySelectorAll('.timeline-item').length).toBe(0);

    flushRaf();
    // MutationObserver 回调在 jsdom 中异步派发，等一拍再计数
    await new Promise(r => setTimeout(r, 0));

    // ① 合帧：一次渲染（一次 innerHTML 替换 = 一次 MutationObserver 回调批次），
    // 内容为最新状态（3 条）
    expect(mutations).toBe(1);
    expect(timeline.querySelectorAll('.timeline-item').length).toBe(3);

    // 没有残余排队的回调：再次 flush 不产生新渲染
    flushRaf();
    await new Promise(r => setTimeout(r, 0));
    expect(mutations).toBe(1);
    observer.disconnect();
  });

  test('③ 渲染前面板被移除：flush 安全早退不抛错', () => {
    const panel = mountPanel();
    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1)));
    panel.remove();
    expect(() => flushRaf()).not.toThrow();
  });

  test('④ 无 requestAnimationFrame 环境：同步兜底立即渲染', () => {
    delete globalThis.requestAnimationFrame;
    const panel = mountPanel();
    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1)));
    // 不需要任何 flush：同步路径当场完成渲染
    expect(panel.querySelectorAll('.timeline-item').length).toBe(1);
  });

  test('渲染后新到的更新会重新调度，不丢更新', () => {
    const panel = mountPanel();
    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1)));
    flushRaf();
    expect(panel.querySelectorAll('.timeline-item').length).toBe(1);

    updateRealtimeExecutionLogPanel(statusWith(makeEntry(1), makeEntry(2)));
    // 新一帧渲染前保持旧内容，flush 后追上最新
    expect(panel.querySelectorAll('.timeline-item').length).toBe(1);
    flushRaf();
    expect(panel.querySelectorAll('.timeline-item').length).toBe(2);
  });
});
