// @vitest-environment jsdom
// 完成度校验器 Phase 3：内容脚本客观取证器 evaluateDoneCriteria 守卫（真实 DOM 求值）。
//
// 定位（AUDIT_STATUS line 85）：校验优先用真实工具取证、而非问模型。本函数在页面真实 DOM 上
// 对每条 doneCriteria 求值，供 background 取证器经 EVALUATE_DONE_CRITERIA 调用。
//
// B-new-1：取证口径必须与交互工具族一致（deepQuerySelector/deepGetText 穿透 shadow DOM/iframe），
//         否则 shadow 内 modal 会让 element_absent 误判达成、shadow 内元素让 element_exists 误判未达。
// M-new-3：三态如实上报——"求不出值"（缺 target / 非法选择器 / 坏 attr 格式 / 未知 check / 无 DOM）
//         一律 available:false（取证不可用），绝不折成 pass:false（谎报成经取证确认未达标）。
import { describe, test, expect, beforeEach } from 'vitest';
import { evaluateDoneCriteria } from '../../src/content/advanced-tools.js';

beforeEach(() => {
  document.body.innerHTML = '<a id="x" href="go">Hello World</a>';
});

describe('evaluateDoneCriteria：element_exists / element_absent（可用项给真实 DOM 结论）', () => {
  test('存在 → pass:true available:true，不存在 → pass:false available:true（确证未达非不可用）', () => {
    const [hit] = evaluateDoneCriteria([{ id: 'a', check: 'element_exists', target: '#x' }]);
    const [miss] = evaluateDoneCriteria([{ id: 'b', check: 'element_exists', target: '#nope' }]);
    expect(hit).toMatchObject({ pass: true, available: true });
    expect(miss).toMatchObject({ pass: false, available: true });
  });

  test('element_absent 语义相反', () => {
    const [gone] = evaluateDoneCriteria([{ id: 'a', check: 'element_absent', target: '#nope' }]);
    const [still] = evaluateDoneCriteria([{ id: 'b', check: 'element_absent', target: '#x' }]);
    expect(gone).toMatchObject({ pass: true, available: true });
    expect(still).toMatchObject({ pass: false, available: true });
  });
});

describe('evaluateDoneCriteria B-new-1：穿透 shadow DOM（口径对齐交互工具）', () => {
  test('shadow root 内元素 element_exists → pass:true（浅层 querySelector 会漏 → 假未达）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<button id="inner">ok</button>';
    const [r] = evaluateDoneCriteria([{ id: 's', check: 'element_exists', target: '#inner' }]);
    expect(r).toMatchObject({ pass: true, available: true });
  });

  test('shadow root 内 modal 存在时 element_absent → pass:false（浅层会假 ✅ 盖章达成）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<div class="modal">x</div>';
    const [r] = evaluateDoneCriteria([{ id: 'm', check: 'element_absent', target: '.modal' }]);
    expect(r).toMatchObject({ pass: false, available: true });
  });

  test('text_contains 在 shadow root 内文本命中（deepGetText 穿透）', () => {
    const host = document.createElement('div');
    document.body.appendChild(host);
    host.attachShadow({ mode: 'open' }).innerHTML = '<span>OrderConfirmed</span>';
    const [r] = evaluateDoneCriteria([{ id: 't', check: 'text_contains', expected: 'OrderConfirmed' }]);
    expect(r).toMatchObject({ pass: true, available: true });
  });
});

describe('evaluateDoneCriteria：text_contains / url_matches', () => {
  test('正文包含 expected → pass', () => {
    const [hit] = evaluateDoneCriteria([{ id: 'a', check: 'text_contains', expected: 'Hello' }]);
    const [miss] = evaluateDoneCriteria([{ id: 'b', check: 'text_contains', expected: 'Goodbye' }]);
    expect(hit).toMatchObject({ pass: true, available: true });
    expect(miss).toMatchObject({ pass: false, available: true });
  });

  test('url_matches 对注入的 loc.href 做子串匹配', () => {
    const loc = { href: 'https://example.com/orders/123' };
    const [hit] = evaluateDoneCriteria([{ id: 'a', check: 'url_matches', target: '/orders/' }], document, loc);
    const [miss] = evaluateDoneCriteria([{ id: 'b', check: 'url_matches', target: '/cart' }], document, loc);
    expect(hit).toMatchObject({ pass: true, available: true });
    expect(miss).toMatchObject({ pass: false, available: true });
  });

  // M5 回落：模型常把待查值写进与实现默认字段不同的位置，取 ?? 另一字段避免恒 false
  test('text_contains 只给 target 时回落到 target 作为待查文本', () => {
    const [hit] = evaluateDoneCriteria([{ id: 'a', check: 'text_contains', target: 'World' }]);
    expect(hit.pass).toBe(true);
  });

  test('url_matches 只给 expected 时回落到 expected 作为 URL 子串', () => {
    const loc = { href: 'https://example.com/done' };
    const [hit] = evaluateDoneCriteria([{ id: 'a', check: 'url_matches', expected: '/done' }], document, loc);
    expect(hit.pass).toBe(true);
  });
});

describe('evaluateDoneCriteria：attribute_equals', () => {
  test('expected 解析为 attr=value，命中属性值才 pass', () => {
    const [hit] = evaluateDoneCriteria([{ id: 'a', check: 'attribute_equals', target: '#x', expected: 'href=go' }]);
    const [wrongVal] = evaluateDoneCriteria([{ id: 'b', check: 'attribute_equals', target: '#x', expected: 'href=no' }]);
    expect(hit).toMatchObject({ pass: true, available: true });
    expect(wrongVal).toMatchObject({ pass: false, available: true });
  });

  // M-new-3：expected 非 attr=value 格式 → 求不出值，不可用（≠ 确证未达标）
  test('attribute_equals expected 缺 = 号 → available:false（坏格式求不出，非未达标）', () => {
    const [badFmt] = evaluateDoneCriteria([{ id: 'c', check: 'attribute_equals', target: '#x', expected: 'href' }]);
    expect(badFmt.available).toBe(false);
  });
});

describe('evaluateDoneCriteria M-new-3：求不出值一律 available:false（绝不谎报未达标）', () => {
  test('未知 check 类型 → available:false（无从取证）', () => {
    const [r] = evaluateDoneCriteria([{ id: 'a', check: 'vague_hope', target: '#x' }]);
    expect(r.available).toBe(false);
  });

  test('非法选择器 → available:false（语法错误求不出，非确证未达）', () => {
    const [r] = evaluateDoneCriteria([{ id: 'a', check: 'element_exists', target: '##[[bad' }]);
    expect(r.available).toBe(false);
  });

  test('element_exists 缺 target → available:false', () => {
    const [r] = evaluateDoneCriteria([{ id: 'a', check: 'element_exists' }]);
    expect(r.available).toBe(false);
  });

  test('text_contains 无待查文本 → available:false', () => {
    const [r] = evaluateDoneCriteria([{ id: 'a', check: 'text_contains' }]);
    expect(r.available).toBe(false);
  });

  test('url_matches 无 href 上下文 → available:false', () => {
    const [r] = evaluateDoneCriteria([{ id: 'a', check: 'url_matches', target: '/x' }], document, {});
    expect(r.available).toBe(false);
  });

  test('doc 无法求值（无 querySelector 能力的空壳 DOM）→ available:false', () => {
    const inert = {}; // 非 document：既无 querySelector 也无 body → 求值抛错被捕获
    const [r] = evaluateDoneCriteria([{ id: 'a', check: 'element_exists', target: '#x' }], inert, { href: 'x' });
    expect(r.available).toBe(false);
  });
});

describe('evaluateDoneCriteria：输入形状兜底', () => {
  test('非数组输入 → 空结果，缺 id 时保留 undefined', () => {
    expect(evaluateDoneCriteria(undefined)).toEqual([]);
    const [r] = evaluateDoneCriteria([{ check: 'element_exists', target: '#x' }]);
    expect(r.id).toBeUndefined();
    expect(r.check).toBe('element_exists');
    expect(r).toMatchObject({ pass: true, available: true });
  });
});
