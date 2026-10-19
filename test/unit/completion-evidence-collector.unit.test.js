// 完成度校验器 Phase 3：background 取证器 + 内容脚本路由接线守卫（脱离 chrome，注入 sendMessage）。
//
// 覆盖：createContentEvidenceCollector 把单条断言发成 EVALUATE_DONE_CRITERIA、按响应 pass 映射、
// 空响应/异常一律 fail-closed=false；以及 dispatch 层确实接上路由与 import（防重构静默拆线）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContentEvidenceCollector } from '../../src/background/completion-verifier.js';

const INDEX_SRC = readFileSync(join(process.cwd(), 'src/content/index.js'), 'utf8');

describe('createContentEvidenceCollector：真实 DOM 取证客户端（返回 {available,pass,reason}）', () => {
  test('发正确的消息形状并映射 available:true pass:true', async () => {
    let captured = null;
    const send = async (tabId, msg) => { captured = { tabId, msg }; return [{ id: msg.criteria[0].id, available: true, pass: true }]; };
    const collect = createContentEvidenceCollector(42, send);
    const ok = await collect({ id: 'c1', check: 'element_exists', target: '#x' });
    expect(ok).toMatchObject({ available: true, pass: true });
    expect(captured.tabId).toBe(42);
    expect(captured.msg.type).toBe('EVALUATE_DONE_CRITERIA');
    expect(captured.msg.criteria).toEqual([{ id: 'c1', check: 'element_exists', target: '#x' }]);
  });

  test('内容脚本判未通过 → available:true pass:false（真实 DOM 结论，非不可用）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ available: true, pass: false }]);
    expect(await collect({ id: 'c', check: 'url_matches', target: 'x' })).toMatchObject({ available: true, pass: false });
  });

  test('空/非数组响应 → available:false reason:response_shape', async () => {
    expect(await createContentEvidenceCollector(1, async () => [])({ id: 'c' })).toMatchObject({ available: false, reason: 'response_shape' });
    expect(await createContentEvidenceCollector(1, async () => null)({ id: 'c' })).toMatchObject({ available: false, reason: 'response_shape' });
    expect(await createContentEvidenceCollector(1, async () => ({ results: [{ available: true, pass: true }] }))({ id: 'c' })).toMatchObject({ available: true, pass: true });
  });

  test('sendMessage reject（内容脚本不可达）→ available:false reason:channel_no_receiver', async () => {
    const collect = createContentEvidenceCollector(1, async () => { throw new Error('Receiving end does not exist'); });
    expect(await collect({ id: 'c', check: 'element_exists', target: '#x' })).toMatchObject({ available: false, reason: 'channel_no_receiver' });
  });

  test('扩展页/不可访问 → reason:page_unreachable', async () => {
    const collect = createContentEvidenceCollector(1, async () => { throw new Error('Cannot access a chrome-extension:// URL'); });
    expect(await collect({ id: 'c' })).toMatchObject({ available: false, reason: 'page_unreachable' });
  });

  // M-new-3 + #1：内容脚本报 available:false 必须映射为不可用且透传其 reason
  test('内容脚本 available:false → 透传 reason（不可用 ≠ 未达标）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ id: 'c', available: false, reason: 'invalid_selector' }]);
    expect(await collect({ id: 'c', check: 'element_exists', target: '##bad' })).toMatchObject({ available: false, reason: 'invalid_selector' });
  });

  test('内容脚本 available:false 但无 reason（老脚本）→ reason:content_unavailable（向后兼容）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ id: 'c', available: false }]);
    expect(await collect({ id: 'c' })).toMatchObject({ available: false, reason: 'content_unavailable' });
  });

  test('内容脚本 available:true + pass:false → available:true pass:false（非不可用）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ id: 'c', available: true, pass: false }]);
    expect(await collect({ id: 'c', check: 'element_exists', target: '#nope' })).toMatchObject({ available: true, pass: false });
  });

  // M-new-4：单条取证超时（渲染进程阻塞）→ 不可用，不无界挂起
  test('取证超时 → available:false reason:channel_timeout（防无界挂起）', async () => {
    const collect = createContentEvidenceCollector(1, () => new Promise(() => {}), 5);
    expect(await collect({ id: 'c', check: 'element_exists', target: '#x' })).toMatchObject({ available: false, reason: 'channel_timeout' });
  });
});

describe('dispatch 接线守卫：内容路由与 import 确在', () => {
  test('content/index.js 注册了 EVALUATE_DONE_CRITERIA 路由', () => {
    expect(INDEX_SRC).toMatch(/EVALUATE_DONE_CRITERIA:\s*\(msg\)\s*=>\s*evaluateDoneCriteria\(msg\.criteria\)/);
  });

  test('content/index.js 从 advanced-tools 引入了 evaluateDoneCriteria', () => {
    expect(INDEX_SRC).toMatch(/import\s*\{[^}]*\bevaluateDoneCriteria\b[^}]*\}\s*from\s*'\.\/advanced-tools\.js'/);
  });

  // M2 守卫：all_frames:true 下取证读真实 DOM 必须顶层 frame 独占响应，否则 iframe 抢先应答 → 取证帧不确定
  test('EVALUATE_DONE_CRITERIA 已纳入 TOP_FRAME_ONLY_TYPES（顶层 frame 独占响应）', () => {
    const setBlock = INDEX_SRC.match(/const TOP_FRAME_ONLY_TYPES = new Set\(\[([\s\S]*?)\]\)/);
    expect(setBlock).not.toBeNull();
    expect(setBlock[1]).toContain("'EVALUATE_DONE_CRITERIA'");
  });
});
