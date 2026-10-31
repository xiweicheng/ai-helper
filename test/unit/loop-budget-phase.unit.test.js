// loop-budget-phase 单元测试（纯 Node 环境；模块零浏览器依赖、零 i18n 依赖）
// 覆盖软着陆决策的三条硬约束：
// ① 开关关闭时必须逐字节回退旧语义（hard_stop，由调用方抛错）；
// ② 宽限轮有界（最多 graceMaxRounds 轮后转本地兜底，绝不无限延长）；
// ③ 预警注入的节奏可预期（轮数维度沿用历史 cadence；时间维度按十分位推进且不重复）。
import { describe, test, expect } from 'vitest';
import {
  BUDGET_PHASE_CONFIG,
  evaluateBudgetStep,
  buildBudgetNotices,
  buildGraceNotice,
  summarizeBudgetProgress,
  buildBudgetFallbackReport,
} from '../../src/background/loop-budget-phase.js';

const cfg = BUDGET_PHASE_CONFIG;
const step = (o) => evaluateBudgetStep({ enabled: true, cfg, ...o });

describe('① evaluateBudgetStep：阶段决策', () => {
  test('预算充裕 → iterate，且开关关闭时同样 iterate（正常路径零改变）', () => {
    expect(step({ iteration: 3, maxIterations: 100, usedMs: 1000, budgetMs: 100000 })).toEqual({ step: 'iterate', exhaustedBy: null });
    expect(evaluateBudgetStep({ enabled: false, cfg, iteration: 3, maxIterations: 100, usedMs: 1000, budgetMs: 100000 }))
      .toEqual({ step: 'iterate', exhaustedBy: null });
  });

  test('时间撞线 → enter_grace（软着陆），开关关闭 → hard_stop（旧抛错语义）', () => {
    expect(step({ iteration: 5, maxIterations: 100, usedMs: 100001, budgetMs: 100000 })).toEqual({ step: 'enter_grace', exhaustedBy: 'time' });
    expect(evaluateBudgetStep({ enabled: false, cfg, iteration: 5, maxIterations: 100, usedMs: 100001, budgetMs: 100000 }))
      .toEqual({ step: 'hard_stop', exhaustedBy: 'time' });
  });

  test('轮数撞线 → enter_grace；时间未耗尽也带正确归因', () => {
    expect(step({ iteration: 100, maxIterations: 100, usedMs: 1000, budgetMs: 100000 })).toEqual({ step: 'enter_grace', exhaustedBy: 'rounds' });
  });

  test('时间优先于轮数归因（两者同时耗尽时按 time 上报）', () => {
    expect(step({ iteration: 200, maxIterations: 100, usedMs: 200000, budgetMs: 100000 }).exhaustedBy).toBe('time');
  });

  test('宽限期内的轮数撞线不再重新归因，保持 grace_iterate 并透传原因', () => {
    expect(step({ iteration: 200, maxIterations: 100, usedMs: 1000, budgetMs: 100000, graceEntered: true, graceRoundsUsed: 0, exhaustedBy: 'time' }))
      .toEqual({ step: 'grace_iterate', exhaustedBy: 'time' });
  });

  test('宽限轮用满 → finalize_local（有界，不再请求模型）', () => {
    expect(step({ iteration: 200, maxIterations: 100, usedMs: 1000, budgetMs: 100000, graceEntered: true, graceRoundsUsed: cfg.graceMaxRounds, exhaustedBy: 'rounds' }))
      .toEqual({ step: 'finalize_local', exhaustedBy: 'rounds' });
  });

  test('无时间预算（budgetMs=0，设置页极小值/未配置）→ 时间维度永不判耗尽', () => {
    expect(step({ iteration: 1, maxIterations: 100, usedMs: 999999999, budgetMs: 0 })).toEqual({ step: 'iterate', exhaustedBy: null });
  });
});

describe('② buildBudgetNotices：预警节奏', () => {
  const n = (o) => buildBudgetNotices({ cfg, ...o });

  test('轮数维度阈值与重申节奏与历史实现一致（80% 起、每 10 轮一次）', () => {
    const warnAt = Math.ceil(100 * cfg.warnIterationRatio); // 80
    expect(n({ iteration: warnAt - 1, maxIterations: 100, usedMs: 0, budgetMs: 100000 }).notices).toEqual([]);
    expect(n({ iteration: warnAt, maxIterations: 100, usedMs: 0, budgetMs: 100000 }).notices).toHaveLength(1);
    expect(n({ iteration: warnAt + 5, maxIterations: 100, usedMs: 0, budgetMs: 100000 }).notices).toEqual([]);
    expect(n({ iteration: warnAt + 10, maxIterations: 100, usedMs: 0, budgetMs: 100000 }).notices).toHaveLength(1);
  });

  test('轮数提醒文案带真实用量（供模型判断还剩多少）', () => {
    const [text] = n({ iteration: 80, maxIterations: 100, usedMs: 0, budgetMs: 100000 }).notices;
    expect(text).toContain('80/100');
    expect(text).toMatch(/converg/i);
    expect(text).toMatch(/what remains/i);
  });

  test('时间维度：85% 起首次提醒，同一十分位内不重申，跨档重申', () => {
    const budget = 100000;
    expect(n({ iteration: 1, maxIterations: 100, usedMs: 84000, budgetMs: budget, lastTimeWarnDecile: -1 }).notices).toEqual([]);
    const first = n({ iteration: 1, maxIterations: 100, usedMs: 86000, budgetMs: budget, lastTimeWarnDecile: -1 });
    expect(first.notices).toHaveLength(1);
    expect(first.timeWarnDecile).toBe(8);
    expect(first.notices[0]).toMatch(/time budget/i);
    // 同档内推进（8.6 → 8.9）不再提醒
    expect(n({ iteration: 2, maxIterations: 100, usedMs: 89000, budgetMs: budget, lastTimeWarnDecile: first.timeWarnDecile }).notices).toEqual([]);
    // 跨到 9 档提醒一次
    const next = n({ iteration: 3, maxIterations: 100, usedMs: 91000, budgetMs: budget, lastTimeWarnDecile: first.timeWarnDecile });
    expect(next.notices).toHaveLength(1);
    expect(next.timeWarnDecile).toBe(9);
  });

  test('时间维度可关闭（开关 off 时逐字节回退旧行为：只有轮数提醒）', () => {
    const r = n({ iteration: 1, maxIterations: 100, usedMs: 91000, budgetMs: 100000, lastTimeWarnDecile: -1, timeWarnEnabled: false });
    expect(r.notices).toEqual([]);
    expect(r.timeWarnDecile).toBe(-1);
  });

  test('双维度同时命中 → 两条提醒都下发', () => {
    const r = n({ iteration: 80, maxIterations: 100, usedMs: 86000, budgetMs: 100000, lastTimeWarnDecile: -1 });
    expect(r.notices).toHaveLength(2);
  });
});

describe('③ buildGraceNotice：宽限收尾指令', () => {
  test('明确禁用工具 + 要求三段式报告（已完成 / 未完成 / 如何继续）', () => {
    const text = buildGraceNotice({ exhaustedBy: 'time', iteration: 42, maxIterations: 100, usedMs: 7300000, budgetMs: 7200000, round: 1 });
    expect(text).toMatch(/no longer available/i);
    expect(text).toMatch(/do not call any tools/i);
    expect(text).toMatch(/completed/i);
    expect(text).toMatch(/remaining/i);
    expect(text).toMatch(/hour/i); // 时长用人话而非裸毫秒
  });

  test('归因为轮数时文案引用轮数而非时间', () => {
    const text = buildGraceNotice({ exhaustedBy: 'rounds', iteration: 100, maxIterations: 100, usedMs: 1000, budgetMs: 100000, round: 1 });
    expect(text).toMatch(/100 rounds/i);
  });

  test('第二轮（模型仍想调工具后的补答轮）语义更强硬', () => {
    const r1 = buildGraceNotice({ exhaustedBy: 'time', iteration: 1, maxIterations: 100, usedMs: 1, budgetMs: 1, round: 1 });
    const r2 = buildGraceNotice({ exhaustedBy: 'time', iteration: 1, maxIterations: 100, usedMs: 1, budgetMs: 1, round: 2 });
    expect(r2).not.toBe(r1);
    expect(r2).toMatch(/answer with text only/i);
  });
});

describe('④ summarizeBudgetProgress + buildBudgetFallbackReport：本地兜底', () => {
  const labels = {
    title: '预算已用完', completed: '已完成', remaining: '未完成', resume: '可继续执行', none: '（无记录）',
  };

  test('按节点状态归类计数：成功/失败/取消分别计入，subtask_plan 与 grace 节点单列', () => {
    const log = [
      { nodeType: 'tool_exec', status: 'success' },
      { nodeType: 'tool_exec', status: 'success' },
      { nodeType: 'tool_exec', status: 'failed' },
      { nodeType: 'tool_exec', status: 'cancelled' },
      { nodeType: 'tool_exec', status: 'processing' },
      { nodeType: 'api_call', status: 'success' },
      { nodeType: 'subtask_plan', status: 'success', subtaskCount: 3 },
    ];
    const s = summarizeBudgetProgress(log, null);
    expect(s.successNodes).toBe(2);
    expect(s.failedNodes).toBe(1);
    expect(s.cancelledNodes).toBe(1);
    expect(s.inflightNodes).toBe(1);
    expect(s.plannedSubtasks).toBe(3);
  });

  test('taskState 锚点提供未完成子任务名（缺项清单的来源）', () => {
    const taskState = { subtasks: [{ id: 1, name: '抓取列表', status: 'done' }, { id: 2, name: '写入表格', status: 'pending' }, { id: 3, name: '校验结果', status: 'failed' }] };
    const s = summarizeBudgetProgress([], taskState);
    expect(s.pendingSubtaskNames).toEqual(['写入表格']);
    expect(s.failedSubtaskNames).toEqual(['校验结果']);
  });

  test('兜底报告含归因、计数与缺项，且无产出时不编造', () => {
    const report = buildBudgetFallbackReport({
      exhaustedBy: 'time',
      progress: summarizeBudgetProgress([{ nodeType: 'tool_exec', status: 'success' }], { subtasks: [{ id: 1, name: 'A', status: 'pending' }] }),
      budget: { usedMs: 7200000, budgetMs: 7200000, iteration: 50, maxIterations: 2000 },
      labels,
    });
    expect(report).toContain('预算已用完');
    expect(report).toContain('A');
    expect(report).toContain('可继续执行');
  });

  test('空日志 + 无锚点 → 仍产出结构化报告（不抛错、不出现 undefined）', () => {
    const report = buildBudgetFallbackReport({
      exhaustedBy: 'rounds',
      progress: summarizeBudgetProgress([], null),
      budget: { usedMs: 0, budgetMs: 0, iteration: 0, maxIterations: 0 },
      labels,
    });
    expect(report).not.toMatch(/undefined|NaN/);
    expect(report).toContain(labels.none);
  });
});
