// loop-detector 单元测试（纯 Node 环境；模块零浏览器依赖）
// 设计文档：docs/superpowers/specs/2026-10-10-loop-detection-upgrade-design.md
//
// 测试数据契约：
// - 每个用例使用互不相同的工具/参数/结果组合，隔离跨模式噪音；
// - 重读/失败等场景若与 repeat 同轮命中（fullKey 必然相同），断言采用 warning 文案子串；
//   stop 一律断言 reason 精确值（stop 优先级最高，不会被其他模式干扰）。
import { describe, test, expect } from 'vitest';
import { createLoopDetector, LOOP_DETECTOR_CONFIG } from '../../src/background/loop-detector.js';

const d = () => createLoopDetector();

// 通用结果构造：tag 不同 → 结果哈希不同（隔离 repeat 的 fullKey）
const ok = (tag) => ({ success: true, content: `result-${tag}` });

// query_elements 参数/结果构造（字段与真实工具 schema 对齐）
const qArgs = (page, extra = {}) => ({ page, maxResults: 100, maxChars: 6000, filterByText: '', frames: 'auto', ...extra });
const qRes = (page, tag, hasMore = true, totalPages = 10) => ({ success: true, page, totalPages, hasMore, content: `page-${page}-${tag}` });

describe('① 重复检测（窗口制）', () => {
  test('同 fullKey 窗口内 3 次 → nudge；片段内节流仅 1 条', () => {
    const det = d();
    const r = [];
    for (let i = 0; i < 5; i++) r.push(det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('none');
    expect(r[2].kind).toBe('nudge');
    expect(r[2].warning).toContain('identical tool call');
    expect(r[3].kind).toBe('none'); // 同片段节流
    expect(r[4].kind).toBe('none');
  });

  test('反例·轮询（同参变果）任意次恒 none', () => {
    const det = d();
    for (let i = 0; i < 20; i++) {
      expect(det.record(1, 'read_page', { q: 'x' }, ok(`v${i}`)).kind).toBe('none');
    }
  });

  test('累计 8 次 → stop(repeat)（穿插其他调用不清零）', () => {
    const det = d();
    const outcomes = [];
    for (let i = 0; i < 3; i++) outcomes.push(det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    for (let i = 0; i < 3; i++) det.record(1, 'browser_info', { i }, ok(`o${i}`));
    for (let i = 0; i < 5; i++) outcomes.push(det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    const stops = outcomes.filter(o => o.kind === 'stop');
    expect(stops).toHaveLength(1);
    expect(stops[0].reason).toBe('repeat');
    expect(stops[0].params.count).toBe(8);
  });

  test('nudge 节流 + 健康调用 2 次重武装后可再次提醒', () => {
    const det = d();
    const r1 = [0, 1, 2].map(() => det.record(1, 'read_page', { q: 'x' }, ok('stable')));
    expect(r1[2].kind).toBe('nudge');
    det.record(1, 'browser_info', { i: 1 }, ok('h1'));
    det.record(1, 'browser_info', { i: 2 }, ok('h2'));
    const r2 = det.record(1, 'read_page', { q: 'x' }, ok('stable'));
    expect(r2.kind).toBe('nudge'); // 重武装后同 key 可再次提醒
  });
});

describe('② ref 枚举（query_elements）', () => {
  test('正例·合法顺序翻页 1→10（hasMore 链）恒 none', () => {
    const det = d();
    for (let p = 1; p <= 10; p++) {
      expect(det.record(1, 'query_elements', qArgs(p), qRes(p, `p${p}`, p < 10, 10)).kind).toBe('none');
    }
  });

  test('正例·乱序跳页 12 次 → stop(refEnum)', () => {
    const det = d();
    const pages = [1, 3, 5, 7, 9, 11, 13, 15, 17, 19, 2, 4, 6];
    let last;
    for (let i = 0; i < pages.length; i++) {
      last = det.record(1, 'query_elements', qArgs(pages[i]), qRes(pages[i], `j${i}`, true, 20));
    }
    expect(last.kind).toBe('stop');
    expect(last.reason).toBe('refEnum');
  });

  test('正例·重读同页且结果未变化：3 次 nudge、6 次 stop（与 repeat 双命中：warning 用子串断言）', () => {
    const det = d();
    // 固定 page=1 重读（等待型刷新场景）：1 !== lastPage+1 恒不满足顺序豁免，s 逐次累计
    const rs = [];
    for (let i = 0; i < 7; i++) {
      rs.push(det.record(1, 'query_elements', qArgs(1), qRes(1, 'p1')));
    }
    expect(rs[0].kind).toBe('none'); // 首次读：中性
    expect(rs[1].kind).toBe('none'); // s=1
    expect(rs[2].kind).toBe('nudge'); // repeat 先命中（s=2 未达 3）
    expect(rs[3].kind).toBe('nudge'); // s=3 → refEnum 提醒
    expect(rs[3].warning).toContain('enumeration');
    expect(rs[4].kind).toBe('none'); // 双模式节流
    expect(rs[5].kind).toBe('none');
    expect(rs[6].kind).toBe('stop'); // s=6 → 硬停
    expect(rs[6].reason).toBe('refEnum');
  });

  test('反例·同页重读但结果有变化（轮询型）恒 none', () => {
    const det = d();
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'v0'));
    for (let i = 1; i <= 10; i++) {
      expect(det.record(1, 'query_elements', qArgs(1), qRes(1, `v${i}`)).kind).toBe('none');
    }
  });

  test('反例·多搜索（不同 filterByText 各自首页）恒 none', () => {
    const det = d();
    for (let i = 0; i < 4; i++) {
      expect(det.record(1, 'query_elements', qArgs(1, { filterByText: `term${i}` }), qRes(1, `t${i}`, false, 1)).kind).toBe('none');
    }
  });

  test('正例·非法页计可疑 ×3 → nudge', () => {
    const det = d();
    det.record(1, 'query_elements', qArgs(1), qRes(1, 'a', true, 5));
    const r1 = det.record(1, 'query_elements', qArgs(7), qRes(7, 'x', false, 5));
    const r2 = det.record(1, 'query_elements', qArgs(8), qRes(8, 'y', false, 5));
    const r3 = det.record(1, 'query_elements', qArgs(9), qRes(9, 'z', false, 5));
    expect(r1.kind).toBe('none');
    expect(r2.kind).toBe('none');
    expect(r3.kind).toBe('nudge');
    expect(r3.warning).toContain('enumeration');
  });

  test('豁免·作用域切换不清累计（切换后回来不逃逸）', () => {
    const det = d();
    const A = { filterByText: 'a' };
    const B = { filterByText: 'b' };
    // A,A,B,B,A 顺序重读：避开 A,B,A,B 交替触发 ABAB 振荡（该行为由 ③ 覆盖）
    const r1 = det.record(1, 'query_elements', qArgs(1, A), qRes(1, 'a1'));
    const r2 = det.record(1, 'query_elements', qArgs(1, A), qRes(1, 'a1')); // A 重读 → s1
    const r3 = det.record(1, 'query_elements', qArgs(1, B), qRes(1, 'b1'));
    const r4 = det.record(1, 'query_elements', qArgs(1, B), qRes(1, 'b1')); // B 重读 → s2
    const r5 = det.record(1, 'query_elements', qArgs(1, A), qRes(1, 'a1')); // 回 A 重读 → s3
    expect(r1.kind).toBe('none');
    expect(r2.kind).toBe('none');
    expect(r3.kind).toBe('none');
    expect(r4.kind).toBe('none');
    expect(r5.kind).toBe('nudge');
    expect(r5.warning).toContain('enumeration');
  });

  test('非 query 已执行调用 → 枚举状态整体清零', () => {
    const det = d();
    // 固定 page=1 重读 ×6：s 累计到 5（未达 stop 阈值 6）
    for (let i = 0; i < 6; i++) {
      det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    }
    // 6 个互不相同的非 query 调用：清零枚举状态 + 稀释 repeat 窗口 + 完成健康重武装
    for (let i = 0; i < 6; i++) {
      det.record(1, 'browser_info', { probe: i }, ok(`h${i}`));
    }
    const r = det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    expect(r.kind).toBe('none'); // 已清零 → p1 视为新作用域首页中性；未清零则 s=6 → stop(refEnum)
  });

  test('失败读不更新枚举状态', () => {
    const det = d();
    // 固定 page=1 重读 ×6：s 累计到 5
    for (let i = 0; i < 6; i++) {
      det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    }
    // 失败读若被计可疑则 s=6 → 立即 stop，此处 none 断言会被击穿
    const rFail = det.record(1, 'query_elements', qArgs(1), { success: false, error: 'frame gone' });
    expect(rFail.kind).toBe('none'); // 既不计可疑也不清零
    // 状态保留：下一次重读 → s=6 → stop(refEnum)（若失败读清了状态则表现为新首页中性）
    const r = det.record(1, 'query_elements', qArgs(1), qRes(1, 'a'));
    expect(r.kind).toBe('stop');
    expect(r.reason).toBe('refEnum');
  });
});

describe('③ ABAB 振荡', () => {
  test('正例·A,B,A,B → nudge；8 条全交替 → stop（导航乒乓同链路）', () => {
    const det = d();
    const A = (i) => det.record(1, 'interact_element', { ref: 1, action: 'click' }, ok(`a${i}`));
    const B = () => det.record(1, 'manage_tab', { action: 'navigate', direction: 'back' }, { success: true });
    const r = [A(0), B(), A(1), B(), A(2), B(), A(3), B()];
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('none');
    expect(r[2].kind).toBe('none');
    expect(r[3].kind).toBe('nudge'); // 第 4 条构成 A,B,A,B
    expect(r[3].warning).toContain('Oscillation');
    expect(r[4].kind).toBe('none'); // 片段内节流（导航重置不清 flowWarned）
    expect(r[5].kind).toBe('none');
    expect(r[6].kind).toBe('none');
    expect(r[7].kind).toBe('stop'); // 8 条全交替
    expect(r[7].reason).toBe('oscillation');
    expect(r[7].params.keyA).toBe('interact_element');
    expect(r[7].params.keyB).toBe('manage_tab');
  });

  test('反例·AAAA（单调用重复形态）不触发振荡', () => {
    const det = d();
    for (let i = 0; i < 6; i++) {
      const r = det.record(1, 'interact_element', { ref: 1, action: 'click' }, ok(`c${i}`));
      expect(r.kind).toBe('none');
    }
  });

  test('反例·交替被第三调用打断后重新计数', () => {
    const det = d();
    const A = (i) => det.record(1, 'interact_element', { ref: 1, action: 'click' }, ok(`a${i}`));
    const B = () => det.record(1, 'manage_tab', { action: 'navigate', direction: 'back' }, { success: true });
    const X = () => det.record(1, 'interact_element', { ref: 99, action: 'click' }, ok('x'));
    const rs = [A(0), B(), A(1), X(), B(), A(2), B()];
    for (const r of rs) expect(r.kind).toBe('none');
  });
});

describe('④ 失败作用域', () => {
  test('正例·同 ref 失败 ×2 nudge / ×3 stop（stop 优先于同轮 repeat nudge）', () => {
    const det = d();
    const click = () => det.record(1, 'interact_element', { ref: 5, action: 'click' }, { success: false, error: 'element not found' });
    const r = [click(), click(), click()];
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('nudge');
    expect(r[1].warning).toContain('failure');
    expect(r[2].kind).toBe('stop');
    expect(r[2].reason).toBe('failureScope');
    expect(r[2].params.scope).toBe('ref:5');
  });

  test('反例·成功退休 + 不同目标独立', () => {
    const det = d();
    const F = (ref) => det.record(1, 'interact_element', { ref, action: 'click' }, { success: false, error: 'not found' });
    F(5);
    det.record(1, 'interact_element', { ref: 5, action: 'click' }, ok('typed'));
    const r = F(5);
    expect(r.kind).toBe('none'); // 成功已退休：重新从 1 计数（未退休则 count=2 → nudge）
    F(6); F(6);
    const r6 = F(6);
    expect(r6.kind).toBe('stop');
    expect(r6.params.scope).toBe('ref:6');
  });

  test('归一·同 ref 不同 action 不逃逸（按目标归一）', () => {
    const det = d();
    det.record(1, 'interact_element', { ref: 7, action: 'click' }, { success: false, error: 'e1' });
    const r = det.record(1, 'interact_element', { ref: 7, action: 'type', value: 'x' }, { success: false, error: 'e2' });
    expect(r.kind).toBe('nudge');
    expect(r.warning).toContain('failure');
    expect(r.warning).toContain('ref:7');
  });

  test('declined（确认被拒）计失败', () => {
    const det = d();
    const dec = () => det.record(1, 'interact_element', { ref: 9, action: 'click' }, { success: false, declined: true });
    const r = [dec(), dec(), dec()];
    expect(r[1].kind).toBe('nudge');
    expect(r[2].kind).toBe('stop');
    expect(r[2].reason).toBe('failureScope');
  });

  test('反例·白名单外工具不参与', () => {
    const det = d();
    for (let i = 0; i < 5; i++) {
      expect(det.record(1, 'browser_info', { i }, { success: false, error: `e${i}` }).kind).toBe('none');
    }
  });
});

describe('⑤ 导航处理', () => {
  test('manage_tab navigate back 成功 → 清失败计数（窗口保留）', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 5, action: 'click' }, { success: false, error: 'nf' });
    F(); F(); // count=2（已 nudge）
    det.record(1, 'browser_info', { d: 1 }, ok('h1'));
    det.record(1, 'browser_info', { d: 2 }, ok('h2'));
    det.record(1, 'browser_info', { d: 3 }, ok('h3'));
    det.record(1, 'browser_info', { d: 4 }, ok('h4'));
    det.record(1, 'manage_tab', { action: 'navigate', direction: 'back' }, { success: true }); // 历史导航重置
    const r = F();
    expect(r.kind).toBe('none'); // 未重置则 count=3 → stop(failureScope)
  });

  test('wait_navigation 成功同样重置', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 6, action: 'click' }, { success: false, error: 'nf6' });
    F(); F();
    det.record(1, 'browser_info', { w: 1 }, ok('w1'));
    det.record(1, 'browser_info', { w: 2 }, ok('w2'));
    det.record(1, 'browser_info', { w: 3 }, ok('w3'));
    det.record(1, 'browser_info', { w: 4 }, ok('w4'));
    det.record(1, 'wait_navigation', {}, { success: true });
    const r = F();
    expect(r.kind).toBe('none');
  });

  test('反例·失败导航不重置（第 3 次失败照常 stop）', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 8, action: 'click' }, { success: false, error: 'nf8' });
    F(); F();
    det.record(1, 'manage_tab', { action: 'navigate', direction: 'back' }, { success: false, error: 'nav failed' });
    const r = F();
    expect(r.kind).toBe('stop');
    expect(r.reason).toBe('failureScope');
  });

  test('反例·open/switch（非历史导航）不重置失败计数', () => {
    const det = d();
    const F = () => det.record(1, 'interact_element', { ref: 7, action: 'click' }, { success: false, error: 'nf7' });
    F(); F(); // count=2（已 nudge）
    det.record(1, 'manage_tab', { action: 'open', url: 'https://example.com' }, { success: true });
    det.record(1, 'manage_tab', { action: 'switch', tabId: 2 }, { success: true });
    const r = F();
    expect(r.kind).toBe('stop'); // 未重置：count=3 → stop(failureScope)
    expect(r.reason).toBe('failureScope');
  });
});

describe('⑥ 无进展滚动', () => {
  test('正例·top moved:false ×2 nudge / ×3 stop', () => {
    const det = d();
    const stuck = () => det.record(1, 'scroll_to', { target: 'top' }, { success: true, message: 'scrolled', moved: false });
    const r = [stuck(), stuck(), stuck()];
    expect(r[0].kind).toBe('none');
    expect(r[1].kind).toBe('nudge');
    expect(r[1].warning).toContain('scroll_to(top)');
    expect(r[2].kind).toBe('stop');
    expect(r[2].reason).toBe('noProgressScroll');
    expect(r[2].params.key).toBe('top');
  });

  test('正例·坐标 5px 网格归一（102/201、101/199 归入 100/200）', () => {
    const det = d();
    const c = (x, y) => det.record(1, 'scroll_to', { target: 'coordinates', x, y }, { success: true, message: 'm', moved: false });
    c(100, 200);
    c(102, 201);
    const r = c(101, 199);
    expect(r.kind).toBe('stop');
    expect(r.reason).toBe('noProgressScroll');
    expect(r.params.key).toBe('coords:100,200');
  });

  test('反例·任意一次真实滚动清零', () => {
    const det = d();
    const stuck = () => det.record(1, 'scroll_to', { target: 'top' }, { success: true, message: 'm', moved: false });
    stuck(); stuck(); // count=2（nudge）
    det.record(1, 'scroll_to', { target: 'bottom' }, { success: true, message: 'm' }); // 真实滚动 → 清零
    det.record(1, 'browser_info', { s: 1 }, ok('s1'));
    det.record(1, 'browser_info', { s: 2 }, ok('s2'));
    det.record(1, 'browser_info', { s: 3 }, ok('s3'));
    const r = det.record(1, 'scroll_to', { target: 'top' }, { success: true, message: 'm', moved: false });
    expect(r.kind).toBe('none'); // 未清零则 count=3 → stop
  });

  test('反例·selector 目标不参与判定（即使带 moved:false）', () => {
    const det = d();
    const sel = () => det.record(1, 'scroll_to', { target: 'selector', selector: '#x' }, { success: true, message: 'm', moved: false });
    expect(sel().kind).toBe('none');
    expect(sel().kind).toBe('none'); // 若 selector 参与判定，第 2 次应为 nudge
  });
});

describe('全局机制', () => {
  test('全局预算：第 8 条提醒转为 stop(budget)', () => {
    const det = d();
    const outcomes = [];
    for (let frag = 0; frag < 8; frag++) {
      for (let i = 0; i < 3; i++) {
        outcomes.push(det.record(1, 'read_page', { q: `frag${frag}` }, ok(`frag${frag}`)));
      }
    }
    const nudges = outcomes.filter(o => o.kind === 'nudge');
    const stops = outcomes.filter(o => o.kind === 'stop');
    expect(nudges).toHaveLength(7);
    expect(stops).toHaveLength(1);
    expect(stops[0].reason).toBe('budget');
    expect(stops[0].params.nudges).toBe(8);
  });

  test('多 tab 分桶隔离', () => {
    const det = d();
    const r1 = [0, 1, 2].map(() => det.record(1, 'read_page', { q: 'x' }, ok('same')));
    expect(r1[2].kind).toBe('nudge');
    const r2 = [0, 1, 2].map(() => det.record(2, 'read_page', { q: 'x' }, ok('same')));
    expect(r2[0].kind).toBe('none');
    expect(r2[1].kind).toBe('none');
    expect(r2[2].kind).toBe('nudge'); // tab2 独立计数（若共享则第 1 次就 nudge）
  });

  test('实例隔离（run / 子任务递归各自独立）', () => {
    const det1 = d();
    const det2 = d();
    for (let i = 0; i < 3; i++) det1.record(1, 'read_page', { q: 'x' }, ok('s'));
    const r = det2.record(1, 'read_page', { q: 'x' }, ok('s'));
    expect(r.kind).toBe('none');
  });

  test('R1 铁证·正常多步任务全 none（零注入）', () => {
    const det = d();
    const calls = [
      ['query_elements', qArgs(1), qRes(1, 'a', true, 3)],
      ['query_elements', qArgs(2), qRes(2, 'b', true, 3)],
      ['query_elements', qArgs(3), qRes(3, 'c', false, 3)],
      ['interact_element', { ref: 11, action: 'click' }, ok('clicked')],
      ['browser_info', { type: 'title' }, ok('title')],
      ['interact_element', { ref: 12, action: 'type', value: 'hi' }, { success: false, error: 'not editable' }],
      ['interact_element', { ref: 12, action: 'type', value: 'hi' }, ok('typed')],
      ['scroll_to', { target: 'top' }, { success: true, message: 'm', moved: false }],
      ['scroll_to', { target: 'bottom' }, { success: true, message: 'm' }],
      ['manage_tab', { action: 'navigate', direction: 'back' }, { success: true }],
      ['query_elements', qArgs(1, { filterByText: 'login' }), qRes(1, 'L', false, 1)],
      ['wait_navigation', {}, { success: true }],
    ];
    const outcomes = calls.map(([n, a, r]) => det.record(1, n, a, r));
    expect(outcomes.every(o => o.kind === 'none')).toBe(true);
  });

  test('配置可注入（阈值单点可调）', () => {
    const det = createLoopDetector({ repeat: { nudgeAt: 2, stopAt: 4 } });
    const r = [0, 1, 2].map(() => det.record(1, 'read_page', { q: 'x' }, ok('m')));
    expect(r[1].kind).toBe('nudge');
    expect(r[2].kind).toBe('none');
    const r4 = det.record(1, 'read_page', { q: 'x' }, ok('m'));
    expect(r4.kind).toBe('stop');
    expect(r4.params.count).toBe(4);
    expect(LOOP_DETECTOR_CONFIG.repeat.stopAt).toBe(8); // 默认常量不被污染
  });
});

describe('nullish result 入参兜底（record 入口防御）', () => {
  test('null/undefined result 不抛异常（query_elements 路径使用兜底后对象）', () => {
    const d = createLoopDetector();
    expect(() => d.record(1, 'query_elements', { page: 1 }, null)).not.toThrow();
    expect(() => d.record(1, 'interact_element', { ref: 1, action: 'click' }, undefined)).not.toThrow();
    expect(d.record(1, 'query_elements', { page: 2 }, null).kind).toBe('none');
  });

  test('nullish result 不视为成功导航（isNavResetSignal 仍读原始值，不触发重置）', () => {
    // 防过度修正：若入口对 isNavResetSignal 也使用 result||{} 兜底，
    // wait_navigation + null result 会被误判为成功导航→失败计数被清，永远到不了 stop
    const d = createLoopDetector();
    const fail = { success: false, error: 'x' };
    d.record(1, 'interact_element', { ref: 9, action: 'click' }, fail);      // 失败 1
    d.record(1, 'wait_navigation', {}, null);                               // null 不得触发重置
    const second = d.record(1, 'interact_element', { ref: 9, action: 'click' }, fail);
    expect(second.kind).toBe('nudge');                                      // 第 2 次失败 → 提醒（若被重置则为 none）
    const third = d.record(1, 'interact_element', { ref: 9, action: 'click' }, fail);
    expect(third.kind).toBe('stop');                                        // 第 3 次 → 硬停（计数未被中途重置）
  });
});
