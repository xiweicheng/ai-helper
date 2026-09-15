// 定时任务调度规则单测：间隔解析、cron 下次触发、一次性/间隔下次执行、停用条件（maxRuns/endAt）、参数规范化
// 纯函数模块，不依赖 chrome / IndexedDB
import { describe, test, expect } from 'vitest';
import {
  parseIntervalMinutes,
  nextCronRun,
  computeNextRun,
  shouldDisableAfterRun,
  normalizeTaskPayload,
} from '../../src/background/scheduler-rules.js';

// 固定基准时间：2026-09-15 10:00:00（本地时间），月从 0 开始
const FROM = new Date(2026, 8, 15, 10, 0, 0).getTime();
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

// 独立的测试预言机：按本地字段逐日扫描下一个满足谓词的 00:00（实现方式与被测代码不同）
function nextMidnightWhere(from, predicate, maxDays = 400) {
  const d = new Date(from + MIN);
  d.setSeconds(0, 0);
  d.setHours(0, 0, 0, 0);
  for (let i = 0; i < maxDays; i++) {
    if (predicate(d)) return d.getTime();
    d.setDate(d.getDate() + 1);
  }
  return null;
}

describe('parseIntervalMinutes - 间隔值解析', () => {
  test('分钟单位：30m / 纯数字按分钟', () => {
    expect(parseIntervalMinutes('30m')).toBe(30);
    expect(parseIntervalMinutes('30')).toBe(30);
    expect(parseIntervalMinutes('  15m  ')).toBe(15);
  });

  test('小时单位：h / hour，大小写不敏感', () => {
    expect(parseIntervalMinutes('2h')).toBe(120);
    expect(parseIntervalMinutes('2H')).toBe(120);
    expect(parseIntervalMinutes('1hour')).toBe(60);
  });

  test('天单位：d / day', () => {
    expect(parseIntervalMinutes('1d')).toBe(1440);
    expect(parseIntervalMinutes('2day')).toBe(2880);
  });

  test('min 长单位与小数', () => {
    expect(parseIntervalMinutes('90min')).toBe(90);
    expect(parseIntervalMinutes('0.5h')).toBe(30);
    expect(parseIntervalMinutes('1.5h')).toBe(90);
    expect(parseIntervalMinutes('1.5m')).toBe(2); // Math.round
  });

  test('最小 1 分钟兜底', () => {
    expect(parseIntervalMinutes('0m')).toBe(1);
    expect(parseIntervalMinutes('0')).toBe(1);
    expect(parseIntervalMinutes('0.1m')).toBe(1);
  });

  test('非法输入返回 null（防止任务静默永不执行）', () => {
    expect(parseIntervalMinutes('')).toBeNull();
    expect(parseIntervalMinutes(null)).toBeNull();
    expect(parseIntervalMinutes(undefined)).toBeNull();
    expect(parseIntervalMinutes('abc')).toBeNull();
    expect(parseIntervalMinutes('30s')).toBeNull();   // 不支持秒
    expect(parseIntervalMinutes('m')).toBeNull();
    expect(parseIntervalMinutes('-5m')).toBeNull();   // 不支持负数
    expect(parseIntervalMinutes('5x')).toBeNull();    // 未知单位
  });
});

describe('nextCronRun - cron 下次触发', () => {
  test('空/段数非法返回 null', () => {
    expect(nextCronRun('', FROM)).toBeNull();
    expect(nextCronRun(null, FROM)).toBeNull();
    expect(nextCronRun('* * * *', FROM)).toBeNull();      // 4 段
    expect(nextCronRun('* * * * * *', FROM)).toBeNull();  // 6 段
  });

  test('全通配 *：下一分钟整点，秒清零', () => {
    const r = nextCronRun('* * * * *', FROM);
    const d = new Date(r);
    expect(d.getTime()).toBe(FROM + MIN);
    expect(d.getSeconds()).toBe(0);
    expect(d.getMilliseconds()).toBe(0);
  });

  test('? 等价于通配', () => {
    expect(nextCronRun('? ? ? ? ?', FROM)).toBe(FROM + MIN);
  });

  test('固定分钟：0 * * * * → 下个整点', () => {
    const d = new Date(nextCronRun('0 * * * *', FROM));
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(0);
  });

  test('固定时：分 0 9 * * *，今天 9 点已过则取明天', () => {
    const d = new Date(nextCronRun('0 9 * * *', FROM));
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(9);
    expect(d.getMinutes()).toBe(0);
  });

  test('固定时刻 30 8 * * * → 次日 08:30', () => {
    const d = new Date(nextCronRun('30 8 * * *', FROM));
    expect(d.getDate()).toBe(16);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(30);
  });

  test('步长 */15：分钟命中 0/15/30/45', () => {
    const d = new Date(nextCronRun('*/15 * * * *', FROM));
    expect(d.getHours()).toBe(10);
    expect(d.getMinutes()).toBe(15);
    expect(d.getMinutes() % 15).toBe(0);
  });

  test('列表 0,30：分钟只能为 0 或 30', () => {
    const d = new Date(nextCronRun('0,30 * * * *', FROM));
    expect(d.getMinutes()).toBe(30);
  });

  test('小时区间 0 9-17 * * *：命中工作时间整点', () => {
    const d = new Date(nextCronRun('0 9-17 * * *', FROM));
    expect(d.getHours()).toBe(11);
    expect(d.getMinutes()).toBe(0);
  });

  test('小时步长 0 */6：小时命中 0/6/12/18', () => {
    const d = new Date(nextCronRun('0 */6 * * *', FROM));
    expect(d.getHours()).toBe(12);
    expect(d.getMinutes()).toBe(0);
  });

  test('星期：0 0 * * 1 → 下一个周一 00:00（与独立逐日扫描结果一致）', () => {
    const r = nextCronRun('0 0 * * 1', FROM);
    const expected = nextMidnightWhere(FROM, (d) => d.getDay() === 1);
    expect(r).toBe(expected);
  });

  test('每月某日：0 8 1 * * → 下个月 1 号 08:00', () => {
    const d = new Date(nextCronRun('0 8 1 * *', FROM));
    expect(d.getMonth()).toBe(9); // 10 月（0 基）
    expect(d.getDate()).toBe(1);
    expect(d.getHours()).toBe(8);
    expect(d.getMinutes()).toBe(0);
  });

  test('月份：0 0 1 1 * → 下一年 1 月 1 日 00:00', () => {
    const d = new Date(nextCronRun('0 0 1 1 *', FROM));
    expect(d.getFullYear()).toBe(2027);
    expect(d.getMonth()).toBe(0);
    expect(d.getDate()).toBe(1);
  });

  test('日/周同时受限按 OR：0 0 13 * 5 → 13 号或周五取更早者', () => {
    const r = nextCronRun('0 0 13 * 5', FROM);
    const next13 = nextMidnightWhere(FROM, (d) => d.getDate() === 13);
    const nextFri = nextMidnightWhere(FROM, (d) => d.getDay() === 5);
    expect(r).toBe(Math.min(next13, nextFri));
  });

  test('不可能日期（2 月 30 日）扫描一年无匹配返回 null', () => {
    expect(nextCronRun('0 0 30 2 *', FROM)).toBeNull();
  });

  test('严格晚于起始时间（当前分钟即使匹配也不取）', () => {
    // FROM=10:00，表达式精确匹配 10:00，也应返回下一次而非当前
    const d = new Date(nextCronRun('0 10 * * *', FROM));
    expect(d.getTime()).toBeGreaterThan(FROM);
    expect(d.getHours()).toBe(10);
  });
});

describe('computeNextRun - 各调度类型下次执行', () => {
  test('一次性-相对：30 分钟后', () => {
    const task = { schedule: { type: 'once', onceMode: 'relative', value: '30' } };
    expect(computeNextRun(task, FROM)).toBe(FROM + 30 * MIN);
  });

  test('一次性-相对：2 小时后', () => {
    const task = { schedule: { type: 'once', onceMode: 'relative', value: '2h' } };
    expect(computeNextRun(task, FROM)).toBe(FROM + 2 * HOUR);
  });

  test('一次性-相对：非法间隔返回 null', () => {
    const task = { schedule: { type: 'once', onceMode: 'relative', value: 'abc' } };
    expect(computeNextRun(task, FROM)).toBeNull();
  });

  test('一次性-绝对时间点：返回该时间戳', () => {
    const iso = '2026-10-01T08:30';
    const task = { schedule: { type: 'once', onceMode: 'absolute', value: iso } };
    expect(computeNextRun(task, FROM)).toBe(new Date(iso).getTime());
  });

  test('一次性-绝对时间点：非法日期返回 null', () => {
    const task = { schedule: { type: 'once', onceMode: 'absolute', value: 'not-a-date' } };
    expect(computeNextRun(task, FROM)).toBeNull();
  });

  test('间隔：2h → 2 小时后；非法值 → null', () => {
    expect(computeNextRun({ schedule: { type: 'interval', value: '2h' } }, FROM)).toBe(FROM + 2 * HOUR);
    expect(computeNextRun({ schedule: { type: 'interval', value: '1d' } }, FROM)).toBe(FROM + DAY);
    expect(computeNextRun({ schedule: { type: 'interval', value: 'bad' } }, FROM)).toBeNull();
  });

  test('cron 类型委托 nextCronRun', () => {
    expect(computeNextRun({ schedule: { type: 'cron', value: '* * * * *' } }, FROM)).toBe(FROM + MIN);
  });

  test('空/未知规则返回 null（含 task 为 null）', () => {
    expect(computeNextRun({}, FROM)).toBeNull();
    expect(computeNextRun({ schedule: null }, FROM)).toBeNull();
    expect(computeNextRun({ schedule: { type: 'unknown', value: 'x' } }, FROM)).toBeNull();
    expect(computeNextRun(null, FROM)).toBeNull();
  });
});

describe('shouldDisableAfterRun - 执行后停用条件（maxRuns / endAt / 一次性）', () => {
  const intervalTask = (over = {}) => ({
    enabled: true,
    schedule: { type: 'interval', value: '1h' },
    runHistory: [],
    ...over,
  });

  test('一次性任务执行完一律停用', () => {
    expect(shouldDisableAfterRun({ schedule: { type: 'once' } }, FROM)).toBe(true);
  });

  test('无任何约束的间隔任务不停用', () => {
    const task = intervalTask({ runHistory: [{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }] });
    expect(shouldDisableAfterRun(task, FROM)).toBe(false);
  });

  test('最大执行次数：达到/超过即停，未达到继续', () => {
    const runs = (n) => Array.from({ length: n }, (_, i) => ({ id: 'r' + i }));
    expect(shouldDisableAfterRun(intervalTask({ maxRuns: 3, runHistory: runs(2) }), FROM)).toBe(false);
    expect(shouldDisableAfterRun(intervalTask({ maxRuns: 3, runHistory: runs(3) }), FROM)).toBe(true);
    expect(shouldDisableAfterRun(intervalTask({ maxRuns: 3, runHistory: runs(5) }), FROM)).toBe(true);
    expect(shouldDisableAfterRun(intervalTask({ maxRuns: 1, runHistory: runs(1) }), FROM)).toBe(true);
  });

  test('maxRuns 缺省不限制；runHistory 缺失时不误停', () => {
    expect(shouldDisableAfterRun(intervalTask({ maxRuns: null }), FROM)).toBe(false);
    expect(shouldDisableAfterRun(intervalTask({ maxRuns: 3, runHistory: undefined }), FROM)).toBe(false);
  });

  test('截止时间：已过/恰好相等停用，未到继续', () => {
    expect(shouldDisableAfterRun(intervalTask({ endAt: FROM - 1 }), FROM)).toBe(true);
    expect(shouldDisableAfterRun(intervalTask({ endAt: FROM }), FROM)).toBe(true);       // >= 语义
    expect(shouldDisableAfterRun(intervalTask({ endAt: FROM + HOUR }), FROM)).toBe(false);
  });

  test('cron 任务同样受 maxRuns/endAt 约束', () => {
    const runs = [{ id: 1 }, { id: 2 }];
    expect(shouldDisableAfterRun({ schedule: { type: 'cron', value: '0 9 * * *' }, maxRuns: 2, runHistory: runs }, FROM)).toBe(true);
  });

  test('task 为空返回 false', () => {
    expect(shouldDisableAfterRun(null, FROM)).toBe(false);
  });
});

describe('normalizeTaskPayload - 任务参数规范化', () => {
  test('缺省值：默认启用、fetch 上下文模式、可空字段为 null', () => {
    const n = normalizeTaskPayload({ name: 'n', prompt: 'p', schedule: { type: 'interval', value: '1h' } });
    expect(n.enabled).toBe(true);
    expect(n.contextMode).toBe('fetch');
    expect(n.contextUrl).toBeNull();
    expect(n.sessionId).toBeNull();
    expect(n.model).toBeNull();
    expect(n.agentId).toBeNull();
    expect(n.maxRuns).toBeNull();
    expect(n.endAt).toBeNull();
  });

  test('maxRuns 数字容错转换；0/非法值归零为 null', () => {
    expect(normalizeTaskPayload({ maxRuns: 5 }).maxRuns).toBe(5);
    expect(normalizeTaskPayload({ maxRuns: '5' }).maxRuns).toBe(5);
    expect(normalizeTaskPayload({ maxRuns: 0 }).maxRuns).toBeNull();
    expect(normalizeTaskPayload({ maxRuns: 'abc' }).maxRuns).toBeNull();
    expect(normalizeTaskPayload({}).maxRuns).toBeNull();
    expect(normalizeTaskPayload({ maxRuns: null }).maxRuns).toBeNull();
  });

  test('endAt 数字容错转换', () => {
    expect(normalizeTaskPayload({ endAt: FROM }).endAt).toBe(FROM);
    expect(normalizeTaskPayload({ endAt: String(FROM) }).endAt).toBe(FROM);
    expect(normalizeTaskPayload({ endAt: 0 }).endAt).toBeNull();
    expect(normalizeTaskPayload({ endAt: undefined }).endAt).toBeNull();
  });

  test('布尔/数值开关：false 与 0 必须被保留（不能被当缺省）', () => {
    const n = normalizeTaskPayload({ enabled: false, useTools: false, temperature: 0, topP: 0 });
    expect(n.enabled).toBe(false);
    expect(n.useTools).toBe(false);
    expect(n.temperature).toBe(0);
    expect(n.topP).toBe(0);
  });

  test('contextMode=url_only 与基础字段透传', () => {
    const n = normalizeTaskPayload({
      name: '任务', prompt: '指令', description: '描述',
      schedule: { type: 'cron', value: '0 9 * * *' },
      contextMode: 'url_only', contextUrl: 'https://example.com',
    });
    expect(n.name).toBe('任务');
    expect(n.prompt).toBe('指令');
    expect(n.description).toBe('描述');
    expect(n.schedule).toEqual({ type: 'cron', value: '0 9 * * *' });
    expect(n.contextMode).toBe('url_only');
    expect(n.contextUrl).toBe('https://example.com');
  });

  test('入参为 null/undefined 不抛错', () => {
    expect(() => normalizeTaskPayload()).not.toThrow();
    expect(normalizeTaskPayload().enabled).toBe(true);
  });
});
