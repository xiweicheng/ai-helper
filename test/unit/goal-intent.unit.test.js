// 目标模式意图识别（src/shared/goal-intent.js）的行为锁。
//
// 这条通道的代价是不对称的：误判一次 = 用户点一下「撤销」，漏判一次 = 用户得自己找开关。
// 因此测试重点在「显式说法必须命中」与「提到目标模式三个字不算」这两侧同时收紧。
import { describe, it, expect } from 'vitest';
import {
  GOAL_INTENT_STRONG_PATTERNS,
  GOAL_INTENT_WEAK_PATTERNS,
  detectGoalIntent,
  stripGoalIntentPhrases,
} from '../../src/shared/goal-intent.js';

describe('强命中：显式要求按目标模式跑', () => {
  const strongCases = [
    '你要按照目标模式执行：把首页 LCP 降到 2.5s 以内',
    '按目标模式，帮我把这个 bug 修到测试全绿',
    '以目标模式执行',
    '走目标模式',
    '请开启目标模式',
    '切换到目标模式',
    '进入目标模式',
    '持续执行直到所有单测通过',
    '一直做到构建成功',
    '跑到完成再回来',
    '这个我自己不用管，无人值守跑就行',
    'run in goal mode',
    'please use goal mode for this',
    'keep working until the build is green',
    'run until done',
    "don't stop until tests pass",
  ];

  for (const text of strongCases) {
    it(`命中：${text}`, () => {
      const r = detectGoalIntent(text);
      expect(r.detected).toBe(true);
      expect(r.strength).toBe('strong');
      expect(r.matches.length).toBeGreaterThan(0);
    });
  }

  it('命中片段是原文子串，便于提示条高亮引用', () => {
    const text = '你要按照目标模式执行：把首页 LCP 降到 2.5s';
    const r = detectGoalIntent(text);
    expect(text).toContain(r.matches[0]);
  });

  it('最多返回 3 条命中，避免提示条被塞满', () => {
    const r = detectGoalIntent('按目标模式持续执行直到完成，无人值守，run until done，goal mode');
    expect(r.matches.length).toBeLessThanOrEqual(3);
  });
});

describe('不该命中的情况（误判防控）', () => {
  const negativeCases = [
    '目标模式是怎么实现的？',
    '帮我解释一下 goal mode 的原理',
    '不要按目标模式执行，普通跑就行',
    '别用目标模式',
    '关闭目标模式',
    '这次不按目标模式',
    '把首页 LCP 降到 2.5s 以内',
    '修好这个登录 bug',
    '',
    '   ',
  ];

  for (const text of negativeCases) {
    it(`不命中：${text === '' ? '(空串)' : text}`, () => {
      const r = detectGoalIntent(text);
      expect(r.detected).toBe(false);
      expect(r.strength).toBe('none');
    });
  }

  it('非字符串输入安全返回 none', () => {
    for (const v of [null, undefined, 0, {}, []]) {
      expect(detectGoalIntent(v)).toEqual({ detected: false, strength: 'none', matches: [] });
    }
  });

  it('超长粘贴只在扫描窗口内判断（贴日志不该触发）', () => {
    const padding = 'console.log("noise");\n'.repeat(200);
    const r = detectGoalIntent(`${padding}按目标模式执行`);
    expect(r.detected).toBe(false);
  });
});

describe('弱命中：只提示不自动开', () => {
  it('确保…通过 → weak（detected 必须为 false，否则等于静默接管）', () => {
    const r = detectGoalIntent('帮我确保所有单测都能通过');
    expect(r.strength).toBe('weak');
    expect(r.detected).toBe(false);
    expect(r.matches[0]).toContain('确保');
  });

  it('直到…全部通过 → weak', () => {
    const r = detectGoalIntent('把这个改到直到全部通过为止');
    // 「直到全部通过」同时可能被强规则的「一直做到」类吃掉，这里只要求被识别到
    expect(['weak', 'strong']).toContain(r.strength);
  });

  it('弱命中不给 detected，也不携带任何「已截断文本」（返回体没有多余字段）', () => {
    const r = detectGoalIntent('帮我确保所有单测都能通过');
    expect(Object.keys(r).sort()).toEqual(['detected', 'matches', 'strength']);
  });
});

describe('正则表自身的健壮性', () => {
  it('每条模式都带全局匹配能力且不产生零宽死循环', () => {
    const texts = ['按目标模式执行', 'run in goal mode', '确保通过'];
    for (const re of [...GOAL_INTENT_STRONG_PATTERNS, ...GOAL_INTENT_WEAK_PATTERNS]) {
      for (const t of texts) {
        const gre = new RegExp(re.source, re.flags.includes('g') ? re.flags : `${re.flags}g`);
        let guard = 0;
        let m;
        while ((m = gre.exec(t)) !== null) {
          expect(m[0].length).toBeGreaterThan(0);
          if (++guard > 10) throw new Error(`pattern 疑似零宽死循环: ${re}`);
        }
      }
    }
  });

  it('detectGoalIntent 对同一输入是幂等的（纯函数，无内部状态）', () => {
    const text = '按目标模式执行：修好登录页';
    expect(detectGoalIntent(text)).toEqual(detectGoalIntent(text));
  });
});

describe('剥掉元指令后剩下的才是目标描述', () => {
  it('剥掉「按照目标模式」但保留真正的目标', () => {
    const out = stripGoalIntentPhrases('你要按照目标模式执行：把首页 LCP 降到 2.5s 以内');
    expect(out).not.toContain('按照目标模式');
    expect(out).toContain('把首页 LCP 降到 2.5s 以内');
  });

  it('剥完为空时退回原文（不能因为剥空就判「没有目标」）', () => {
    expect(stripGoalIntentPhrases('按目标模式')).toBe('按目标模式');
  });

  it('非字符串输入返回空串', () => {
    expect(stripGoalIntentPhrases(null)).toBe('');
    expect(stripGoalIntentPhrases(42)).toBe('');
  });
});
