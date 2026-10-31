// Goal 模式纯内核（src/shared/goal.js）的行为锁。
//
// 分三层：
//   1. 数据模型：objective 裁剪/约束归一/doneCriteria 只认白名单，脏数据一律不崩；
//   2. 状态机：met/unmet/impossible/评估器失败四条路径的终态与动作，尤其
//      「评估失败不烧轮次」「停滞三次即暂停」「达成后不复活」这三条红线；
//   3. 提示词：锚点只在 active 时产出、续跑指令必须点名缺项。
import { describe, it, expect } from 'vitest';
import {
  GOAL_STATUS,
  GOAL_VERDICTS,
  GOAL_ACTIONS,
  MAX_OBJECTIVE_CHARS,
  MAX_CONSTRAINTS,
  MAX_CONSTRAINT_CHARS,
  DEFAULT_GOAL_LIMITS,
  truncateObjective,
  createGoal,
  normalizeGoal,
  goalIsRunning,
  goalHaltCheckpointReason,
  GOAL_HALT_CHECKPOINT_REASONS,
  appendGoalConstraint,
  checkGoalBudget,
  recordGoalTurn,
  settleGoalElapsed,
  applyGoalVerdict,
  pauseGoal,
  resumeGoal,
  clearGoal,
  goalIsFinished,
  parseGoalVerdictJson,
  buildGoalAnchorText,
  buildGoalContinuationText,
  buildGoalMetaParts,
  GOAL_TURNS_LEFT_HINT,
} from '../../src/shared/goal.js';

const T0 = 1_700_000_000_000;

describe('goal 数据模型', () => {
  it('空 objective 返回 null（调用方按普通消息处理，不能凭空造出目标）', () => {
    expect(createGoal({})).toBeNull();
    expect(createGoal({ objective: '   ' })).toBeNull();
    expect(createGoal({ objective: null })).toBeNull();
  });

  it('objective 超长静默截断到上限', () => {
    const long = 'x'.repeat(MAX_OBJECTIVE_CHARS + 500);
    const goal = createGoal({ objective: long, now: T0 });
    expect(goal.objective).toHaveLength(MAX_OBJECTIVE_CHARS);
    expect(truncateObjective(`  ${long}  `)).toHaveLength(MAX_OBJECTIVE_CHARS);
  });

  it('新目标一律 active，计数从零开始，createdBy 只认两个来源', () => {
    const goal = createGoal({ objective: '把首页 LCP 降到 2.5s 内', now: T0 });
    expect(goal.status).toBe(GOAL_STATUS.ACTIVE);
    expect(goal.turnsUsed).toBe(0);
    expect(goal.tokensUsed).toBe(0);
    expect(goal.stagnationCount).toBe(0);
    expect(goal.startedAt).toBe(T0);
    expect(goal.createdBy).toBe('toggle');
    expect(createGoal({ objective: 'x', createdBy: 'intent', now: T0 }).createdBy).toBe('intent');
    expect(createGoal({ objective: 'x', createdBy: 'model', now: T0 }).createdBy).toBe('toggle');
  });

  it('turnBudget 被夹在允许区间内（防手误填 10000 把上下文烧穿）', () => {
    expect(createGoal({ objective: 'x', limits: { turnBudget: 1 }, now: T0 }).turnBudget)
      .toBe(DEFAULT_GOAL_LIMITS.minTurnBudget);
    expect(createGoal({ objective: 'x', limits: { turnBudget: 99999 }, now: T0 }).turnBudget)
      .toBe(DEFAULT_GOAL_LIMITS.maxTurnBudget);
    expect(createGoal({ objective: 'x', limits: { turnBudget: 'abc' }, now: T0 }).turnBudget)
      .toBe(DEFAULT_GOAL_LIMITS.turnBudget);
    expect(createGoal({ objective: 'x', limits: { turnBudget: 30.9 }, now: T0 }).turnBudget).toBe(30);
  });

  it('doneCriteria 只保留 completion-verdict 白名单内的断言，未知断言丢弃', () => {
    const goal = createGoal({
      objective: 'x',
      doneCriteria: [
        { check: 'element_exists', target: '#done', expected: 'visible' },
        { check: 'made_up_check', target: 'y' },
        { check: 'command_exit_zero', target: 'npm test', expected: '0' },
        'not-an-object',
      ],
      now: T0,
    });
    expect(goal.doneCriteria.map((c) => c.check)).toEqual(['element_exists', 'command_exit_zero']);
  });

  it('constraints 归一：折叠空白、截断、丢弃空串', () => {
    const goal = createGoal({
      objective: 'x',
      constraints: ['  用 pnpm  不要用 npm  ', '', '   ', 'y'.repeat(MAX_CONSTRAINT_CHARS + 10)],
      now: T0,
    });
    expect(goal.constraints[0]).toBe('用 pnpm 不要用 npm');
    expect(goal.constraints).toHaveLength(2);
    expect(goal.constraints[1]).toHaveLength(MAX_CONSTRAINT_CHARS);
  });

  it('normalizeGoal 对脏数据返回 null，未知状态回落 paused（绝不自动烧 token 续跑）', () => {
    expect(normalizeGoal(null)).toBeNull();
    expect(normalizeGoal('goal')).toBeNull();
    expect(normalizeGoal({})).toBeNull();
    expect(normalizeGoal({ objective: 'x', status: 'whatever', now: T0 }).status).toBe(GOAL_STATUS.PAUSED);
    expect(normalizeGoal({ objective: 'x', status: GOAL_STATUS.ACTIVE }, T0).status).toBe(GOAL_STATUS.ACTIVE);
  });

  it('normalizeGoal 补全缺失字段，负数计数归零', () => {
    const goal = normalizeGoal({ objective: 'x', turnsUsed: -5, tokensUsed: -1, elapsedMs: -3 }, T0);
    expect(goal.turnsUsed).toBe(0);
    expect(goal.tokensUsed).toBe(0);
    expect(goal.elapsedMs).toBe(0);
    expect(goal.turnBudget).toBe(DEFAULT_GOAL_LIMITS.turnBudget);
    expect(Array.isArray(goal.criteria)).toBe(true);
    expect(Array.isArray(goal.constraints)).toBe(true);
  });

  it('goalIsRunning 只认 active；停住现场的 checkpoint 原因与表一致', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    expect(goalIsRunning(goal)).toBe(true);
    expect(goalIsRunning({ ...goal, status: GOAL_STATUS.PAUSED })).toBe(false);
    expect(goalIsRunning(null)).toBe(false);
    // 写侧（checkpoint 原因）与读侧（auto-resume 终态集）共用同一张表：
    // 一边漏了某个状态，闹钟就会替用户按他没按的「继续」按钮
    expect(GOAL_HALT_CHECKPOINT_REASONS).toEqual([
      `goal_${GOAL_STATUS.PAUSED}`,
      `goal_${GOAL_STATUS.BUDGET_LIMITED}`,
    ]);
    // 达成/已清除是真终态（现场不留 checkpoint），不该被当作「可续跑的停住」
    expect(GOAL_HALT_CHECKPOINT_REASONS).not.toContain(goalHaltCheckpointReason(GOAL_STATUS.ACHIEVED));
    expect(GOAL_HALT_CHECKPOINT_REASONS).not.toContain(goalHaltCheckpointReason(GOAL_STATUS.CLEARED));
  });
});

describe('会话内追加约束：累加不替换', () => {
  it('追加约束不改 objective、不改状态、不动轮次', () => {
    const goal = createGoal({ objective: '修好登录页', now: T0 });
    const next = appendGoalConstraint(goal, '只用 CSS 改，别动 JS', T0 + 1000);
    expect(next.objective).toBe('修好登录页');
    expect(next.status).toBe(GOAL_STATUS.ACTIVE);
    expect(next.turnsUsed).toBe(0);
    expect(next.constraints).toEqual(['只用 CSS 改，别动 JS']);
    // 原对象不可变（便于 React 式比对与断点回放）
    expect(goal.constraints).toEqual([]);
  });

  it('连续完全相同的约束去重（无信息量还白吃锚点 token）', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    const a = appendGoalConstraint(goal, '别动数据库', T0);
    const b = appendGoalConstraint(a, '别动数据库', T0 + 1);
    expect(b).toBe(a);
    expect(a.constraints).toHaveLength(1);
  });

  it('超上限时丢最早的一条（最近的指导优先级最高）', () => {
    let goal = createGoal({ objective: 'x', now: T0 });
    for (let i = 0; i < MAX_CONSTRAINTS + 3; i++) {
      goal = appendGoalConstraint(goal, `约束${i}`, T0 + i);
    }
    expect(goal.constraints).toHaveLength(MAX_CONSTRAINTS);
    expect(goal.constraints[goal.constraints.length - 1]).toBe(`约束${MAX_CONSTRAINTS + 2}`);
    expect(goal.constraints).not.toContain('约束0');
  });

  it('空文本不产生约束', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    expect(appendGoalConstraint(goal, '   ', T0)).toBe(goal);
    expect(appendGoalConstraint(null, 'y', T0)).toBeNull();
  });
});

describe('预算闸门', () => {
  it('轮数撞线即 exhausted=turns', () => {
    const goal = { ...createGoal({ objective: 'x', limits: { turnBudget: 5 }, now: T0 }), turnsUsed: 5 };
    expect(checkGoalBudget(goal, { now: T0 })).toEqual({ exhausted: true, reason: 'turns' });
  });

  it('时间预算：goal 自身 timeBudgetMs 优先，否则回落 loopTimeout', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    expect(checkGoalBudget(goal, { now: T0 + 1000, fallbackTimeBudgetMs: 10_000 }).exhausted).toBe(false);
    expect(checkGoalBudget(goal, { now: T0 + 20_000, fallbackTimeBudgetMs: 10_000 }))
      .toEqual({ exhausted: true, reason: 'time' });
    const own = { ...goal, timeBudgetMs: 5_000 };
    expect(checkGoalBudget(own, { now: T0 + 6_000, fallbackTimeBudgetMs: 10_000_000 }))
      .toEqual({ exhausted: true, reason: 'time' });
  });

  it('elapsedMs 结算后 startedAt 归零为此刻（暂停/恢复不重复计时）', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    const settled = settleGoalElapsed(goal, T0 + 3000);
    expect(settled.elapsedMs).toBe(3000);
    expect(settled.startedAt).toBe(T0 + 3000);
    expect(settleGoalElapsed(settled, T0 + 5000).elapsedMs).toBe(5000);
  });

  it('recordGoalTurn 累加轮次与评估 token', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    const next = recordGoalTurn(goal, 321.6, T0 + 1);
    expect(next.turnsUsed).toBe(1);
    expect(next.tokensUsed).toBe(322);
    expect(recordGoalTurn(goal, -10, T0).tokensUsed).toBe(0);
  });
});

describe('状态机 applyGoalVerdict', () => {
  const base = () => createGoal({ objective: '把首页 LCP 降到 2.5s 内', now: T0 });

  it('met → achieved 终态，动作 STOP_ACHIEVED', () => {
    const r = applyGoalVerdict(base(), { verdict: GOAL_VERDICTS.MET, reason: 'Lighthouse 实测 2.1s', tokensUsed: 120 }, { now: T0 + 1000 });
    expect(r.action).toBe(GOAL_ACTIONS.STOP_ACHIEVED);
    expect(r.goal.status).toBe(GOAL_STATUS.ACHIEVED);
    expect(r.goal.tokensUsed).toBe(120);
    expect(r.goal.lastVerdict.reason).toBe('Lighthouse 实测 2.1s');
    expect(goalIsFinished(r.goal)).toBe(true);
  });

  it('impossible → unmet 终态，绝不冒充达成', () => {
    const r = applyGoalVerdict(base(), { verdict: GOAL_VERDICTS.IMPOSSIBLE, reason: '依赖的服务已下线' }, { now: T0 });
    expect(r.action).toBe(GOAL_ACTIONS.STOP_UNMET);
    expect(r.goal.status).toBe(GOAL_STATUS.UNMET);
    expect(r.stopReason).toBe('impossible');
  });

  it('unmet 且有工具进展 → CONTINUE，轮次 +1、停滞清零、带上缺项', () => {
    const r = applyGoalVerdict(
      { ...base(), stagnationCount: 2 },
      { verdict: GOAL_VERDICTS.UNMET, reason: '还没跑测试', missing: ['单测未通过'], toolCallsSucceeded: 3 },
      { now: T0 + 500 }
    );
    expect(r.action).toBe(GOAL_ACTIONS.CONTINUE);
    expect(r.goal.status).toBe(GOAL_STATUS.ACTIVE);
    expect(r.goal.turnsUsed).toBe(1);
    expect(r.goal.stagnationCount).toBe(0);
    expect(r.goal.lastVerdict.missing).toEqual(['单测未通过']);
  });

  it('连续无工具进展的 unmet 达到阈值 → paused（不再无限续跑）', () => {
    let goal = base();
    let last = null;
    for (let i = 0; i < DEFAULT_GOAL_LIMITS.stagnationLimit; i++) {
      last = applyGoalVerdict(goal, { verdict: GOAL_VERDICTS.UNMET, toolCallsSucceeded: 0 }, { now: T0 + i * 1000 });
      goal = last.goal;
    }
    expect(last.action).toBe(GOAL_ACTIONS.STOP_PAUSED);
    expect(last.stopReason).toBe('stagnation');
    expect(goal.status).toBe(GOAL_STATUS.PAUSED);
    expect(goal.turnsUsed).toBe(DEFAULT_GOAL_LIMITS.stagnationLimit);
  });

  it('unmet 撞轮预算 → budget_limited（保留现场，可 resume）', () => {
    const goal = { ...base(), turnBudget: 1 };
    const r = applyGoalVerdict(goal, { verdict: GOAL_VERDICTS.UNMET, toolCallsSucceeded: 2 }, { now: T0 });
    expect(r.action).toBe(GOAL_ACTIONS.STOP_BUDGET);
    expect(r.stopReason).toBe('turns');
    expect(r.goal.status).toBe(GOAL_STATUS.BUDGET_LIMITED);
  });

  it('评估器失败不烧轮次，只累加失败次数；连续到上限即暂停', () => {
    const r1 = applyGoalVerdict(base(), { evaluatorError: true }, { now: T0 });
    expect(r1.action).toBe(GOAL_ACTIONS.CONTINUE);
    expect(r1.goal.turnsUsed).toBe(0);
    expect(r1.goal.evaluatorFailures).toBe(1);

    const r2 = applyGoalVerdict(r1.goal, { evaluatorError: true }, { now: T0 + 1 });
    expect(r2.action).toBe(GOAL_ACTIONS.STOP_PAUSED);
    expect(r2.stopReason).toBe('evaluator_unavailable');
    expect(r2.goal.status).toBe(GOAL_STATUS.PAUSED);
    expect(r2.goal.turnsUsed).toBe(0);
  });

  it('verdict 为 null 等同评估器失败（绝不默认判达成）', () => {
    const r = applyGoalVerdict(base(), { verdict: null }, { now: T0 });
    expect(r.action).toBe(GOAL_ACTIONS.CONTINUE);
    expect(r.goal.status).toBe(GOAL_STATUS.ACTIVE);
    expect(r.goal.evaluatorFailures).toBe(1);
  });

  it('终态/非 active 忽略迟到的评估结论，且出口必须是「停」', () => {
    const achieved = { ...base(), status: GOAL_STATUS.ACHIEVED };
    const r = applyGoalVerdict(achieved, { verdict: GOAL_VERDICTS.UNMET, toolCallsSucceeded: 1 }, { now: T0 });
    expect(r.goal).toBe(achieved);
    // 不能回 CONTINUE：这条路不计轮次也不落终态，接线一旦漏判 status 就是无上限烧钱
    expect(r.action).toBe(GOAL_ACTIONS.STOP_PAUSED);
    expect(r.stopReason).toBe('not_active');

    const cleared = { ...base(), status: GOAL_STATUS.CLEARED };
    const rc = applyGoalVerdict(cleared, { verdict: GOAL_VERDICTS.MET }, { now: T0 });
    expect(rc.goal.status).toBe(GOAL_STATUS.CLEARED);
    expect(rc.action).toBe(GOAL_ACTIONS.STOP_PAUSED);

    const rn = applyGoalVerdict(null, { verdict: GOAL_VERDICTS.MET });
    expect(rn.goal).toBeNull();
    expect(rn.action).toBe(GOAL_ACTIONS.STOP_PAUSED);
  });
});

describe('用户操作：暂停 / 恢复 / 清除', () => {
  it('pause 结算时长并落 paused', () => {
    const paused = pauseGoal(createGoal({ objective: 'x', now: T0 }), T0 + 2000);
    expect(paused.status).toBe(GOAL_STATUS.PAUSED);
    expect(paused.elapsedMs).toBe(2000);
  });

  it('resume 只从 paused / budget_limited 恢复，且重置停滞与失败计数', () => {
    const paused = {
      ...createGoal({ objective: 'x', now: T0 }),
      status: GOAL_STATUS.PAUSED,
      stagnationCount: 3,
      evaluatorFailures: 2,
    };
    const resumed = resumeGoal(paused, T0 + 100);
    expect(resumed.status).toBe(GOAL_STATUS.ACTIVE);
    expect(resumed.stagnationCount).toBe(0);
    expect(resumed.evaluatorFailures).toBe(0);
    expect(resumed.startedAt).toBe(T0 + 100);

    const achieved = { ...createGoal({ objective: 'x', now: T0 }), status: GOAL_STATUS.ACHIEVED };
    expect(resumeGoal(achieved, T0).status).toBe(GOAL_STATUS.ACHIEVED);
  });

  it('从 budget_limited 恢复补一档轮预算，否则一动就再次撞线', () => {
    const limited = {
      ...createGoal({ objective: 'x', limits: { turnBudget: 10 }, now: T0 }),
      status: GOAL_STATUS.BUDGET_LIMITED,
      turnsUsed: 10,
    };
    const resumed = resumeGoal(limited, T0 + 10);
    expect(resumed.turnBudget).toBe(10 + DEFAULT_GOAL_LIMITS.turnBudget);
    expect(checkGoalBudget(resumed, { now: T0 + 10 }).exhausted).toBe(false);
    // 但不会无限膨胀
    const maxed = resumeGoal({ ...limited, turnBudget: DEFAULT_GOAL_LIMITS.maxTurnBudget }, T0);
    expect(maxed.turnBudget).toBe(DEFAULT_GOAL_LIMITS.maxTurnBudget);
  });

  it('撞线时记下撞的是哪条预算（恢复要据此补对额度）', () => {
    const byTime = {
      ...createGoal({ objective: 'x', limits: { timeBudgetMs: 60_000 }, now: T0 }),
      elapsedMs: 61_000,
      startedAt: T0,
    };
    const timeVerdict = applyGoalVerdict(
      byTime,
      { verdict: GOAL_VERDICTS.UNMET, toolCallsSucceeded: 1 },
      { now: T0 }
    );
    expect(timeVerdict.action).toBe(GOAL_ACTIONS.STOP_BUDGET);
    expect(timeVerdict.goal.status).toBe(GOAL_STATUS.BUDGET_LIMITED);
    expect(timeVerdict.goal.budgetStopReason).toBe('time');

    const byTurns = {
      ...createGoal({ objective: 'x', limits: { turnBudget: 5 }, now: T0 }),
      turnsUsed: 5,
      startedAt: T0,
    };
    const turnVerdict = applyGoalVerdict(
      byTurns,
      { verdict: GOAL_VERDICTS.UNMET, toolCallsSucceeded: 1 },
      { now: T0 }
    );
    expect(turnVerdict.action).toBe(GOAL_ACTIONS.STOP_BUDGET);
    expect(turnVerdict.goal.budgetStopReason).toBe('turns');
  });

  it('时间预算耗尽后恢复必须重新计一份时间，否则点「继续」一动就再次撞线', () => {
    const limited = {
      ...createGoal({ objective: 'x', limits: { timeBudgetMs: 60_000 }, now: T0 }),
      status: GOAL_STATUS.BUDGET_LIMITED,
      budgetStopReason: 'time',
      elapsedMs: 61_000,
      startedAt: T0,
    };
    const resumed = resumeGoal(limited, T0 + 1000);
    expect(resumed.status).toBe(GOAL_STATUS.ACTIVE);
    expect(resumed.elapsedMs).toBe(0);
    expect(resumed.budgetStopReason).toBeNull();
    // 轮数没耗尽就不白送轮预算
    expect(resumed.turnBudget).toBe(DEFAULT_GOAL_LIMITS.turnBudget);
    // 恢复后能跑满一份，超出才再次撞线
    expect(checkGoalBudget(resumed, { now: T0 + 1000 }).exhausted).toBe(false);
    expect(checkGoalBudget(resumed, { now: T0 + 60_000 }).exhausted).toBe(false);
    expect(checkGoalBudget(resumed, { now: T0 + 61_000 }).exhausted).toBe(true);
  });

  it('轮数预算耗尽后恢复只补轮数，不白送时间预算', () => {
    const limited = {
      ...createGoal({ objective: 'x', limits: { turnBudget: 10 }, now: T0 }),
      status: GOAL_STATUS.BUDGET_LIMITED,
      budgetStopReason: 'turns',
      turnsUsed: 10,
      elapsedMs: 5000,
    };
    const resumed = resumeGoal(limited, T0 + 10);
    expect(resumed.turnBudget).toBe(10 + DEFAULT_GOAL_LIMITS.turnBudget);
    expect(resumed.elapsedMs).toBe(5000);
  });

  it('clear 落 cleared 终态', () => {
    const cleared = clearGoal(createGoal({ objective: 'x', now: T0 }), T0 + 1);
    expect(cleared.status).toBe(GOAL_STATUS.CLEARED);
    expect(goalIsFinished(cleared)).toBe(true);
    expect(clearGoal(null)).toBeNull();
  });
});

describe('评估结论 JSON 解析', () => {
  it('解析标准 JSON', () => {
    expect(parseGoalVerdictJson('{"verdict":"met","reason":"ok"}'))
      .toEqual({ verdict: GOAL_VERDICTS.MET, reason: 'ok', missing: [] });
  });

  it('剥掉 ```json 围栏与前后夹叙', () => {
    const text = '我认为结果如下：\n```json\n{"verdict":"unmet","reason":"缺测试","missing":["未跑 npm test"]}\n```\n以上。';
    expect(parseGoalVerdictJson(text)).toEqual({
      verdict: GOAL_VERDICTS.UNMET,
      reason: '缺测试',
      missing: ['未跑 npm test'],
    });
  });

  it('兼容字段别名与同义词', () => {
    expect(parseGoalVerdictJson('{"status":"satisfied"}').verdict).toBe(GOAL_VERDICTS.MET);
    expect(parseGoalVerdictJson('{"result":"not_met"}').verdict).toBe(GOAL_VERDICTS.UNMET);
    expect(parseGoalVerdictJson('{"verdict":"blocked","explanation":"做不到"}')).toEqual({
      verdict: GOAL_VERDICTS.IMPOSSIBLE,
      reason: '做不到',
      missing: [],
    });
    expect(parseGoalVerdictJson('{"verdict":"unmet","gaps":[{"text":"a"},{"text":"b"}]}').missing)
      .toEqual(['a', 'b']);
  });

  it('畸形/未知结论一律返回 null（绝不默认判达成）', () => {
    expect(parseGoalVerdictJson('')).toBeNull();
    expect(parseGoalVerdictJson(null)).toBeNull();
    expect(parseGoalVerdictJson('我认为已经完成了')).toBeNull();
    expect(parseGoalVerdictJson('{not json}')).toBeNull();
    expect(parseGoalVerdictJson('{"verdict":"maybe"}')).toBeNull();
    expect(parseGoalVerdictJson('{"foo":1}')).toBeNull();
  });
});

describe('提示词文本', () => {
  it('锚点只对 active 目标产出（终态不再每轮占上下文）', () => {
    expect(buildGoalAnchorText(null)).toBe('');
    expect(buildGoalAnchorText({ ...createGoal({ objective: 'x', now: T0 }), status: GOAL_STATUS.ACHIEVED })).toBe('');
  });

  it('锚点包含目标、验收标准、追加约束与进度', () => {
    const goal = {
      ...createGoal({ objective: '把 LCP 降到 2.5s', criteria: ['Lighthouse ≥90'], now: T0 }),
      constraints: ['别动构建脚本'],
      turnsUsed: 2,
      turnBudget: 20,
      tokensUsed: 640,
      lastVerdict: { verdict: GOAL_VERDICTS.UNMET, reason: '仍是 3.1s', missing: [], at: T0 },
    };
    const text = buildGoalAnchorText(goal);
    expect(text).toContain('[System Notice]');
    expect(text).toContain('把 LCP 降到 2.5s');
    expect(text).toContain('Lighthouse ≥90');
    expect(text).toContain('别动构建脚本');
    expect(text).toContain('attempt 3/20');
    expect(text).toContain('~640 tokens');
    expect(text).toContain('仍是 3.1s');
  });

  it('锚点按 maxCriteria 截断标准与约束，避免撑爆上下文', () => {
    const goal = {
      ...createGoal({ objective: 'x', criteria: ['c1', 'c2', 'c3'], now: T0 }),
      constraints: ['k1', 'k2', 'k3'],
    };
    const text = buildGoalAnchorText(goal, { maxCriteria: 2 });
    expect(text).toContain('c2');
    expect(text).not.toContain('c3');
    expect(text).toContain('k3');
    expect(text).not.toContain('k1');
  });

  it('续跑指令点名缺项并禁止重复已完成步骤', () => {
    const goal = { ...createGoal({ objective: 'x', now: T0 }), turnsUsed: 1, turnBudget: 20 };
    const text = buildGoalContinuationText(goal, {
      verdict: GOAL_VERDICTS.UNMET,
      reason: '单测没跑',
      missing: ['npm test 未执行'],
    });
    expect(text).toContain('[Goal Mode]');
    expect(text).toContain('单测没跑');
    expect(text).toContain('npm test 未执行');
    expect(text).toContain('Do not repeat steps already completed');
    expect(text).toContain('Attempt 2/20');
  });

  it('续跑指令在 goal 缺失时也不崩（防御式模板）', () => {
    expect(buildGoalContinuationText(null, {})).toContain('[Goal Mode]');
  });

  it('目标锚点的无人值守文案只在真获放行时出现', () => {
    const goal = createGoal({ objective: 'x', now: T0 });
    // unattended=true：与工具表摘掉 clarify_question 同一个判据
    const unattended = buildGoalAnchorText(goal, { unattended: true });
    expect(unattended).toContain('running unattended');
    expect(unattended).toContain('do NOT ask the user questions');
    expect(unattended).toContain('do not look for a workaround');
    // 未放行（意图识别出的目标 autoApprove 恒为 false）：不能剥提问权，
    // 否则就是「prompt 叫模型别问、工具表里还挂着 clarify_question」的自相矛盾
    const attended = buildGoalAnchorText(goal, { unattended: false });
    expect(attended).not.toContain('running unattended');
    expect(attended).toContain('ask with the clarification tool');
    // 缺省也是保守侧：没明说放行就当用户在
    expect(buildGoalAnchorText(goal)).not.toContain('running unattended');
  });
});

// 敏感操作放行授权的授予边界。这块是安全闸本身，必须锁死：
// 面板开关（toggle）可授予，意图识别（intent）永不能授予，
// 且反序列化路径也不能被 storage/checkpoint 里的脏数据骗过去。
describe('autoApprove：放行授权只认显式 UI', () => {
  it('默认不开：createGoal 不传 autoApprove 时恒为 false', () => {
    expect(createGoal({ objective: 'x', now: T0 }).autoApprove).toBe(false);
  });

  it('面板开关（createdBy=toggle）可以授予', () => {
    const goal = createGoal({ objective: 'x', autoApprove: true, createdBy: 'toggle', now: T0 });
    expect(goal.autoApprove).toBe(true);
  });

  it('意图识别（createdBy=intent）即使传了 autoApprove 也强制 false', () => {
    const goal = createGoal({ objective: 'x', autoApprove: true, createdBy: 'intent', now: T0 });
    expect(goal.createdBy).toBe('intent');
    expect(goal.autoApprove).toBe(false);
  });

  it('normalizeGoal 同样不采信 intent 目标的放行（脏 storage / checkpoint）', () => {
    const forged = { ...createGoal({ objective: 'x', now: T0 }), autoApprove: true, createdBy: 'intent' };
    expect(normalizeGoal(forged, T0).autoApprove).toBe(false);
    // 非 intent 来源的授权字段可以恢复（面板重亮开关后继续跑的场景）
    const legit = { ...createGoal({ objective: 'x', now: T0 }), autoApprove: true };
    expect(normalizeGoal(legit, T0).autoApprove).toBe(true);
  });
});

describe('目标条副行文案（把内部「轮」翻译成「次尝试」）', () => {
  // 假的 t()：不回显变量名，而是把 key+参数拼成一个可断言的串
  const t = (key, vars = {}) => `${key}:${Object.entries(vars).map(([k, v]) => `${k}=${v}`).join(',')}`;

  it('还没评估过时不显示次数：0/N 不携带任何信息', () => {
    const goal = { ...createGoal({ objective: 'x', now: T0 }) };
    expect(goal.turnsUsed).toBe(0);
    expect(buildGoalMetaParts(goal, t)).toEqual([]);
  });

  it('有进展时只说「已尝试 N 次」，远离上限时不催剩余', () => {
    const goal = { ...createGoal({ objective: 'x', now: T0 }), turnsUsed: 3 };
    expect(buildGoalMetaParts(goal, t)).toEqual(['goal.turnsUsed:turns=3']);
  });

  it(`剩 ≤${GOAL_TURNS_LEFT_HINT} 次才补一句剩余`, () => {
    const budget = DEFAULT_GOAL_LIMITS.turnBudget;
    const near = { ...createGoal({ objective: 'x', now: T0 }), turnsUsed: budget - GOAL_TURNS_LEFT_HINT };
    expect(buildGoalMetaParts(near, t)).toEqual([
      `goal.turnsUsed:turns=${budget - GOAL_TURNS_LEFT_HINT}`,
      `goal.turnsLeft:turns=${GOAL_TURNS_LEFT_HINT}`,
    ]);
    // 再往前一轮：还剩 4 次，仍然提示
    const nearer = { ...near, turnsUsed: budget - 4 };
    expect(buildGoalMetaParts(nearer, t)[1]).toBe('goal.turnsLeft:turns=4');
    // 离上限还远：不提示
    const far = { ...near, turnsUsed: budget - GOAL_TURNS_LEFT_HINT - 1 };
    expect(buildGoalMetaParts(far, t)).toHaveLength(1);
  });

  it('撞线后只说已尝试次数，不再说「还剩 0 次」', () => {
    const budget = DEFAULT_GOAL_LIMITS.turnBudget;
    const spent = { ...createGoal({ objective: 'x', now: T0 }), turnsUsed: budget };
    expect(buildGoalMetaParts(spent, t)).toEqual([`goal.turnsUsed:turns=${budget}`]);
  });

  it('补充约束条数独立于轮次，刚开跑也要显示', () => {
    const goal = { ...createGoal({ objective: 'x', now: T0 }), constraints: ['a', 'b'] };
    expect(buildGoalMetaParts(goal, t)).toEqual(['goal.constraints:count=2']);
  });

  it('脏数据不炸：缺字段 / 非数组 constraints / 无 t 都返回可渲染结果', () => {
    expect(buildGoalMetaParts(null, t)).toEqual([]);
    expect(buildGoalMetaParts({ turnsUsed: 2, turnBudget: 20, constraints: 'oops' }, t)).toEqual(['goal.turnsUsed:turns=2']);
    expect(buildGoalMetaParts({ turnsUsed: -5, turnBudget: 20 }, t)).toEqual([]);
    expect(buildGoalMetaParts({ turnsUsed: 2, turnBudget: 20 }, null)).toEqual([]);
  });
});
