// 子任务时间预算放开 + 中断原因口径 + 已完成节点摘要回灌（重试/恢复复用）
//
// 背景三条事实（实施前核对）：
// 1) 子任务曾被 SUBTASK_LOOP_TIMEOUT_MS=900000 硬封顶，设置页「整体循环超时」（默认 2h）
//    对子任务无效，用户把预算调到最大仍会在 15 分钟被杀 → 放开，上限只由配置值决定。
// 2) 超时文案只报预算值不报实际耗时，且"不含澄清等待时间"漏了「敏感操作确认等待」
//    （两者都走 pauseLoopTimer 豁免）→ 文案需带实际耗时与完整豁免项。
// 3) 子任务不存 checkpoint（中断即整体失败由父任务重试），且 buildSubtaskPartialSummary
//    只在"重试耗尽的最终失败"处送给父模型 —— 重跑/恢复后的同一个子任务对自己上次做过
//    什么零知情，等于从零重做。放开时长上限后单次丢失工作量放大到小时级，必须回灌。
// @vitest-environment node
import { describe, test, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';

const REACT_LOOP_SRC = readFileSync(
  new URL('../../src/background/react-loop.js', import.meta.url),
  'utf8'
);

let computeSubtaskLoopTimeoutMs;
let formatDurationMs;
let shouldSkipSubtaskReplay;
let recordSubtaskPartialProgress;
let buildSubtaskResumeContext;

beforeAll(async () => {
  const rl = await import('../../src/background/react-loop.js');
  computeSubtaskLoopTimeoutMs = rl.computeSubtaskLoopTimeoutMs;
  formatDurationMs = rl.formatDurationMs;
  shouldSkipSubtaskReplay = rl.shouldSkipSubtaskReplay;
  recordSubtaskPartialProgress = rl.recordSubtaskPartialProgress;
  buildSubtaskResumeContext = rl.buildSubtaskResumeContext;
});

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

// ==================== A：预算只受配置与父剩余约束 ====================

describe('A 子任务超时预算：取消硬封顶且不透支父预算', () => {
  test('单子任务：取 min(配置, 父剩余 - 收尾预留)，不再被 900000 截断', () => {
    // 预留按父剩余的 5%、[30s, 5min] 区间：2h 封顶取 5min
    expect(computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, 1)).toBe(2 * HOUR - 5 * MIN);
  });

  test('配置小于父剩余时按配置封顶（配置才是权威上限）', () => {
    expect(computeSubtaskLoopTimeoutMs(2 * HOUR, 20 * MIN, 1)).toBe(20 * MIN);
  });

  test('H1 分摊：N 个并发子任务不得各享满额父剩余', () => {
    const one = computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, 1);
    const four = computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, 4);
    expect(four).toBeLessThan(one);
    // 同刻快照下 N 份预算之和不得超过父可用份额：否则首波吃干父预算，
    // 本轮结果拿不到综合答复（旧 15min 硬顶下几乎不会发生）。
    // 注意该不变量仅在 60s 下限未接管时成立，大 N 的例外见下一条。
    expect(four * 4).toBeLessThanOrEqual(one);
  });

  test('pendingCount 极大时 60s 下限接管：总和可超父剩余（设计取舍，非 bug）', () => {
    // N≥116 时 perChild < 60000，SUBTASK_TIMEOUT_MIN_BUDGET 下限接管，总和突破上一条
    // 的不变量——实现刻意「宁超不饿死」（防刚起步即被杀）。钉住行为，防止被误判为
    // 越权 bug，也防止有人在不动注释口径的情况下悄然加码下限。
    expect(computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, 200)).toBe(60000);
  });

  test('父剩余为零/为负（父已超时）：预算归零，不得凭 60s 下限起死回生', () => {
    expect(computeSubtaskLoopTimeoutMs(0, 2 * HOUR, 1)).toBe(0);
    expect(computeSubtaskLoopTimeoutMs(-1, 2 * HOUR, 1)).toBe(0);
  });

  test('H1 下限不越权：父只剩 5s 时不能给子任务 60s 预算', () => {
    expect(computeSubtaskLoopTimeoutMs(5000, 2 * HOUR, 1)).toBe(5000);
    expect(computeSubtaskLoopTimeoutMs(30000, 2 * HOUR, 1)).toBe(30000);
    // 任何入参下都不得比父实际剩余更多
    for (const remain of [1, 999, 10000, 59000, 61000, 90000]) {
      expect(computeSubtaskLoopTimeoutMs(remain, 2 * HOUR, 1)).toBeLessThanOrEqual(remain);
    }
  });

  test('无父预算（dispatch_task 子代理）回退配置值本身，不再无端扣 10s', () => {
    expect(computeSubtaskLoopTimeoutMs(undefined, 2 * HOUR)).toBe(2 * HOUR);
  });

  test('配置缺失/非法时回退到 DEFAULT_REACT_CONFIG.loopTimeout（默认值变更新默认，不钉字面量）', async () => {
    const { DEFAULT_REACT_CONFIG } = await import('../../src/background/constants.js');
    expect(computeSubtaskLoopTimeoutMs(undefined, undefined)).toBe(DEFAULT_REACT_CONFIG.loopTimeout);
    expect(computeSubtaskLoopTimeoutMs(undefined, 0)).toBe(DEFAULT_REACT_CONFIG.loopTimeout);
    expect(computeSubtaskLoopTimeoutMs(undefined, Number.NaN)).toBe(DEFAULT_REACT_CONFIG.loopTimeout);
  });

  test('pendingCount 非法/缺省时当作 1（不因除零得 Infinity/NaN）', () => {
    const one = computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, 1);
    expect(computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR)).toBe(one);
    expect(computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, 0)).toBe(one);
    expect(computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, -3)).toBe(one);
    expect(Number.isFinite(computeSubtaskLoopTimeoutMs(2 * HOUR, 2 * HOUR, NaN))).toBe(true);
  });

  test('源码中 SUBTASK_LOOP_TIMEOUT_MS 常数已彻底移除', () => {
    expect(REACT_LOOP_SRC).not.toMatch(/SUBTASK_LOOP_TIMEOUT_MS/);
  });

  test('接线：内层 loopTimeout 取 min(配置, 父注入预算)，缺省回退配置值', () => {
    expect(REACT_LOOP_SRC).toMatch(
      /Math\.min\(reactConfig\.loopTimeout, apiParams\.subtaskLoopTimeoutMs \|\| reactConfig\.loopTimeout\)/
    );
  });

  test('接线：两处预算计算都把配置上限与待跑子任务数一并传入', () => {
    const calls = REACT_LOOP_SRC.match(/computeSubtaskLoopTimeoutMs\(/g) || [];
    // 定义 + 首跑 + 重跑 = 3；摘除任一处调用即红
    expect(calls.length).toBe(3);
    expect((REACT_LOOP_SRC.match(/computeSubtaskLoopTimeoutMs\(parentRemainMs, config\?\.reactConfig\?\.loopTimeout, pendingSubtaskCount\)/g) || []).length).toBe(1);
    expect((REACT_LOOP_SRC.match(/computeSubtaskLoopTimeoutMs\(rerunRemainMs, config\?\.reactConfig\?\.loopTimeout, 1\)/g) || []).length).toBe(1);
  });

  test('接线：pendingSubtaskCount 按策略取值（并发池按向上取整的波次数）', () => {
    // 间隔有界（实际距离约 50 字符，200 留余量）：无界 [\s\S]* 会越过本处三元、
    // 命中文件更后方任何无关 Math.ceil，导致删掉波次计算守卫仍绿
    expect(REACT_LOOP_SRC).toMatch(
      /const pendingSubtaskCount = strategy === 'parallel'[\s\S]{0,200}Math\.ceil/
    );
    // 顺序/依赖用「含本子在内的剩余个数」，后启动的子任务不能再按满额算
    expect(REACT_LOOP_SRC).toMatch(/sortedSubtasks\.length - subtaskIndex/);
  });
});

// ==================== D：中断原因带实际耗时与完整豁免项 ====================

describe('D 超时文案：实际耗时 + 预算 + 澄清与确认双豁免', () => {
  test('formatDurationMs：整分钟不带小数，非整分钟保留一位小数', () => {
    expect(formatDurationMs(900000)).toBe('15min');
    expect(formatDurationMs(90000)).toBe('1.5min');
    expect(formatDurationMs(2 * HOUR)).toBe('120min'); // 2*HOUR 即 7200000，不再重复写字面量断言
  });

  test('formatDurationMs：不足一分钟按秒显示，亚秒不得谎报为 0s', () => {
    expect(formatDurationMs(45000)).toBe('45s');
    expect(formatDurationMs(1000)).toBe('1s');
    // 评审 L-b：999ms 向下取整成 "0s" —— 文案会说「已用 0s，预算 120min」，
    // 用户据此判定「一秒都没跑就被杀」。非零耗时必须可读为非零。
    expect(formatDurationMs(999)).toBe('<1s');
    expect(formatDurationMs(1)).toBe('<1s');
    // 真零仍写 0s：把 0 也显示成 <1s 是另一种谎报
    expect(formatDurationMs(0)).toBe('0s');
    expect(formatDurationMs(-5)).toBe('0s');
    expect(formatDurationMs(NaN)).toBe('0s');
  });

  test('formatDurationMs：时长单位与设置页读数单位对齐（都是分钟）', () => {
    // 设置页的「整体循环超时」已从 number 输入改成 28 档吸附滑杆：输入本身只存档位索引，
    // 真分钟数在 data-minutes 上，读数由 options/loop-timeout-slider.js 格式化。
    // 这里把「对齐」从口头结论变成可执行守卫：滑杆末档分钟数必须读成「Nmin」，
    // 且末档索引必须与档位表长度一致（否则拖到底也不是 24 小时）。
    const optionsSrc = readFileSync(
      new URL('../../options.html', import.meta.url),
      'utf8'
    );
    const inputMatch = optionsSrc.match(/<input[^>]*id="reactLoopTimeout"[^>]*>/);
    expect(inputMatch).not.toBeNull();
    expect(inputMatch[0]).toMatch(/type="range"/);
    const maxIndexMatch = inputMatch[0].match(/max="(\d+)"/);
    expect(maxIndexMatch).not.toBeNull();

    const sliderSrc = readFileSync(
      new URL('../../src/options/loop-timeout-slider.js', import.meta.url),
      'utf8'
    );
    const ladderMatch = sliderSrc.match(/LOOP_TIMEOUT_LADDER = \[([^\]]+)\]/);
    expect(ladderMatch).not.toBeNull();
    const ladder = ladderMatch[1].split(',').map(s => Number(s.trim())).filter(n => Number.isFinite(n) && n > 0);
    expect(ladder.length - 1).toBe(Number(maxIndexMatch[1]));

    const maxMinutes = ladder[ladder.length - 1];
    expect(maxMinutes).toBeGreaterThan(15); // 硬封顶放开后上限必须真的高于旧 15min
    // 满额配置读出来必须是「Nmin」形态（与滑杆读数同单位）
    expect(formatDurationMs(maxMinutes * MIN)).toBe(`${maxMinutes}min`);
  });

  test('中断原因文案含实际耗时与等待时长占位符，且豁免项写全「澄清/确认」', () => {
    const zh = REACT_LOOP_SRC.match(/loopTimeout: '[^']*'/g) || [];
    const text = zh.join(' | ');
    expect(text).toMatch(/\{elapsed\}/);
    expect(text).toMatch(/\{paused\}/);
    expect(text).toMatch(/\{timeout\}/);
    expect(text).toMatch(/澄清/);
    expect(text).toMatch(/确认/);
  });

  test('接线：抛出超时走读数 seam，已用值剔除等待时间', () => {
    // 旧断言写的是 `elapsed: formatDurationMs(elapsedTime)`（墙钟含暂停），
    // 与文案里「等待不计入」自相矛盾 → 改锚剔除后的 usedMs（口径细节见 wiring 专测）
    expect(REACT_LOOP_SRC).toMatch(/elapsed: formatDurationMs\(\w+\.usedMs\)/);
    expect(REACT_LOOP_SRC).not.toMatch(/elapsed: formatDurationMs\(elapsedTime\)/);
  });
});

// ==================== C：已完成节点摘要回灌给重跑的子任务 ====================

describe('C 子任务进行中进度：摘要回灌与防重放边界', () => {
  const node = (over = {}) => ({
    id: Math.random().toString(36).slice(2),
    nodeType: 'tool_exec',
    nodeName: '执行工具',
    status: 'success',
    result: 'ok',
    ...over,
  });

  test('recordSubtaskPartialProgress：把成功产出节点写进进度 Map 的 partialSummary（生产字段 observation）', () => {
    const progress = new Map();
    // 生产 tool_exec 节点的产出正文写 observation（读数口径 observation 优先、result 兜底），
    // fixture 必须照抄生产形态；此前全用 result 曾造成主路径回归假绿灯
    recordSubtaskPartialProgress(progress, 's1', [node({ observation: 'created package.json' })], { subtaskName: '初始化' });
    const rec = progress.get('s1');
    expect(rec).toBeTruthy();
    expect(rec.success).toBe(false);
    expect(rec.subtaskName).toBe('初始化');
    expect(rec.partialSummary).toContain('created package.json');
  });

  test('recordSubtaskPartialProgress：result 仅为兜底路径契约（observation 缺失时仍可读）', () => {
    // 该兜底分支是历史兼容层：清理它属于显式契约变更，本用例变红即为提醒
    const progress = new Map();
    recordSubtaskPartialProgress(progress, 's1', [node({ observation: null, result: 'legacy output' })]);
    expect(progress.get('s1').partialSummary).toContain('legacy output');
  });

  test('recordSubtaskPartialProgress：无有效产出时不写入空记录（避免污染进度）', () => {
    const progress = new Map();
    recordSubtaskPartialProgress(progress, 's1', [node({ result: null }), node({ status: 'failed' })]);
    expect(progress.has('s1')).toBe(false);
  });

  test('recordSubtaskPartialProgress：绝不覆盖已成功的整子任务记录（防重放语义不降级）', () => {
    const progress = new Map([['s1', { success: true, subtaskId: 's1', result: 'done' }]]);
    recordSubtaskPartialProgress(progress, 's1', [node({ result: 'partial' })]);
    expect(progress.get('s1').success).toBe(true);
    expect(progress.get('s1').partialSummary).toBeUndefined();
  });

  test('shouldSkipSubtaskReplay：只有 success===true 才跳过，进行中记录必须重跑', () => {
    expect(shouldSkipSubtaskReplay({ success: true })).toBe(true);
    expect(shouldSkipSubtaskReplay({ success: false, partialSummary: 'did stuff' })).toBe(false);
    expect(shouldSkipSubtaskReplay(undefined)).toBe(false);
    expect(shouldSkipSubtaskReplay({ success: 'truthy-but-not-true' })).toBe(false);
  });

  test('buildSubtaskResumeContext：产出「不要重做」的续跑段落，无摘要时返回空串', () => {
    const ctx = buildSubtaskResumeContext({ partialSummary: '- 工具A: 已创建目录' });
    expect(ctx).toContain('this subtask');
    expect(ctx).toContain('Do not redo');
    expect(ctx).toContain('已创建目录');
    expect(buildSubtaskResumeContext({ partialSummary: '' })).toBe('');
    expect(buildSubtaskResumeContext(undefined)).toBe('');
  });

  // 注：本 describe 原为三条源码正则，其中两条命中的是函数定义行（删空调用点仍绿），
  // 已改为行为 seam 覆盖在 subtask-progress-wiring.unit.test.js；第三条
  // `if (shouldSkipSubtaskReplay(recorded))` 接线守卫的单一来源收敛到
  // subtask-checkpoint-replay.unit.test.js（连同 progress?.get 与 skippedReplay 一起锁）。
});
