// @vitest-environment jsdom
// 执行日志统计区自适应降级：宽度不足时逐级折叠文案
//（① 组合块文案 → ② 总耗时/Token 文案 → ③ 整块换行兜底），空间恢复时还原
import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { adaptLogSummary, scheduleLogSummaryAdapt } from '../../src/side_panel/log-summary-adaptive.js';

/**
 * 构建统计区 DOM 并模拟宽度关系：
 * scrollWidth 随降级类变化（模拟真实布局收缩），clientWidth 固定且可中途修改
 */
function buildPanel(metrics) {
  document.body.innerHTML = `
    <div class="execution-log-panel">
      <div class="log-summary">
        <div class="summary-item">
          <span class="summary-label">总耗时</span><span class="summary-value">26.6min</span>
        </div>
        <div class="summary-combo">
          <div class="combo-main">
            <span class="combo-label">执行节点</span><span class="combo-value">124</span>
          </div>
          <div class="combo-stats">
            <div class="combo-stat success"><span class="stat-label">成功</span><span class="stat-value">120</span></div>
            <div class="combo-stat failed"><span class="stat-label">失败</span><span class="stat-value">4</span></div>
          </div>
        </div>
      </div>
    </div>`;
  const panel = document.querySelector('.execution-log-panel');
  const summary = panel.querySelector('.log-summary');
  Object.defineProperty(summary, 'clientWidth', { get: () => metrics.client });
  Object.defineProperty(summary, 'scrollWidth', {
    get: () => {
      if (summary.classList.contains('summary-wrapped')) return metrics.client; // 换行兜底后无横向溢出
      if (summary.classList.contains('summary-collapsed')) return metrics.collapsedAll;
      if (summary.classList.contains('combo-collapsed')) return metrics.collapsedCombo;
      return metrics.full;
    },
  });
  return { panel, summary };
}

function classes(summary) {
  return ['combo-collapsed', 'summary-collapsed', 'summary-wrapped'].filter(c => summary.classList.contains(c));
}

let rafCallbacks = [];
let originalRaf;

beforeEach(() => {
  document.body.innerHTML = '';
  rafCallbacks = [];
  originalRaf = globalThis.requestAnimationFrame;
  globalThis.requestAnimationFrame = (cb) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  };
});

afterEach(() => {
  globalThis.requestAnimationFrame = originalRaf;
  // 排空遗留回调，避免模块级 rAF 状态影响后续用例
  rafCallbacks.forEach(cb => cb());
  rafCallbacks = [];
});

describe('执行日志统计区自适应降级', () => {
  test('宽度充足时不做任何降级', () => {
    const { panel, summary } = buildPanel({ client: 440, full: 400, collapsedCombo: 360, collapsedAll: 320 });
    adaptLogSummary(panel);
    expect(classes(summary)).toEqual([]);
  });

  test('轻度不足时仅折叠组合块文案', () => {
    const { panel, summary } = buildPanel({ client: 440, full: 500, collapsedCombo: 430, collapsedAll: 400 });
    adaptLogSummary(panel);
    expect(classes(summary)).toEqual(['combo-collapsed']);
  });

  test('中度不足时连总耗时/Token 文案一并折叠', () => {
    const { panel, summary } = buildPanel({ client: 440, full: 500, collapsedCombo: 480, collapsedAll: 420 });
    adaptLogSummary(panel);
    expect(classes(summary)).toEqual(['combo-collapsed', 'summary-collapsed']);
  });

  test('极窄时允许整块换行兜底', () => {
    const { panel, summary } = buildPanel({ client: 440, full: 500, collapsedCombo: 470, collapsedAll: 460 });
    adaptLogSummary(panel);
    expect(classes(summary)).toEqual(['combo-collapsed', 'summary-collapsed', 'summary-wrapped']);
  });

  test('宽度恢复后还原为完整显示', () => {
    const metrics = { client: 440, full: 500, collapsedCombo: 430, collapsedAll: 400 };
    const { panel, summary } = buildPanel(metrics);
    adaptLogSummary(panel);
    expect(classes(summary)).toEqual(['combo-collapsed']);
    metrics.client = 600;
    adaptLogSummary(panel);
    expect(classes(summary)).toEqual([]);
  });

  test('面板中无统计区或参数为空时不抛错', () => {
    expect(() => adaptLogSummary(document.createElement('div'))).not.toThrow();
    expect(() => adaptLogSummary(null)).not.toThrow();
  });

  test('scheduleLogSummaryAdapt 通过 rAF 合并多次调用并执行降级', () => {
    const { panel, summary } = buildPanel({ client: 440, full: 500, collapsedCombo: 430, collapsedAll: 400 });
    scheduleLogSummaryAdapt(panel);
    scheduleLogSummaryAdapt(panel);
    expect(rafCallbacks.length).toBe(1);
    rafCallbacks.shift()();
    expect(classes(summary)).toEqual(['combo-collapsed']);
  });

  test('窗口 resize 时对已打开面板重新测量', () => {
    const metrics = { client: 440, full: 500, collapsedCombo: 430, collapsedAll: 400 };
    const { panel, summary } = buildPanel(metrics);
    scheduleLogSummaryAdapt(panel);
    rafCallbacks.shift()();
    expect(classes(summary)).toEqual(['combo-collapsed']);
    metrics.client = 600;
    window.dispatchEvent(new Event('resize'));
    expect(rafCallbacks.length).toBe(1);
    rafCallbacks.shift()();
    expect(classes(summary)).toEqual([]);
  });
});
