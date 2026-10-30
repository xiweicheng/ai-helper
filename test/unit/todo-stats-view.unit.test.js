// 统计视图的纯渲染部分：给一份 summarizeStats 的结果，吐出浮层里的 HTML。
// 与 DOM 解耦，数字口径与柱图归一化都能直接单测。
import { describe, it, expect } from 'vitest';
import { buildStatsHtml } from '../../src/side_panel/todo-stats-view.js';

function week(values) {
  return values.map((done, idx) => ({ date: `2026-10-${23 + idx}`, added: done, done }));
}

const STATS = {
  total: 10,
  done: 4,
  doing: 2,
  pending: 4,
  overdue: 1,
  high: 3,
  doneRate: 40,
  today: { added: 2, done: 1 },
  week: week([0, 1, 0, 3, 2, 1, 1]),
  streak: 3,
};

describe('统计浮层渲染', () => {
  it('完成率 + 四态 + 逾期都上屏', () => {
    const html = buildStatsHtml(STATS);
    expect(html).toContain('40%');
    expect(html).toContain('已完成 4 / 10');
    for (const label of ['待处理', '处理中', '已完成', '逾期']) {
      expect(html, `缺 ${label}`).toContain(label);
    }
    // 处理中的真实数量必须出现，不能只有「待办 6」这种合计数
    expect(html).toContain('>2<');
  });

  it('近 7 天 7 根柱，按当周最大值归一，0 不画高度', () => {
    const html = buildStatsHtml(STATS);
    expect(html.match(/todo-stats-bar-col/g)).toHaveLength(7);
    expect(html).toContain('height:100%');
    expect(html).toContain('height:0%');
    // 柱上悬停要能读到当天新增与完成
    expect(html).toContain('完成 3');
    expect(html).toContain('新增 3');
  });

  it('今日 / 连续 / 高优先级在同一行事实区', () => {
    const html = buildStatsHtml(STATS);
    expect(html).toContain('今日新增');
    expect(html).toContain('今日完成');
    expect(html).toContain('连续完成');
    expect(html).toContain('高优先级');
  });

  it('空清单给一句引导，不画空的柱状图', () => {
    const html = buildStatsHtml({
      total: 0, done: 0, doing: 0, pending: 0, overdue: 0, high: 0,
      doneRate: 0, today: { added: 0, done: 0 }, week: week([0, 0, 0, 0, 0, 0, 0]), streak: 0,
    });
    expect(html).toContain('还没有待办');
    expect(html).not.toContain('todo-stats-week');
  });

  it('0 完成率不写 NaN，除零已被口径层兜住', () => {
    const html = buildStatsHtml({ ...STATS, total: 0, done: 0, doneRate: 0 });
    expect(html).not.toContain('NaN');
  });
});
