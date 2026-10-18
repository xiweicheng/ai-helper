// 完成度校验器 Phase 3：background 取证器 + 内容脚本路由接线守卫（脱离 chrome，注入 sendMessage）。
//
// 覆盖：createContentEvidenceCollector 把单条断言发成 EVALUATE_DONE_CRITERIA、按响应 pass 映射、
// 空响应/异常一律 fail-closed=false；以及 dispatch 层确实接上路由与 import（防重构静默拆线）。
import { describe, test, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createContentEvidenceCollector } from '../../src/background/completion-verifier.js';

const INDEX_SRC = readFileSync(join(process.cwd(), 'src/content/index.js'), 'utf8');

describe('createContentEvidenceCollector：真实 DOM 取证客户端', () => {
  test('发正确的消息形状并映射 pass=true', async () => {
    let captured = null;
    const send = async (tabId, msg) => { captured = { tabId, msg }; return [{ id: msg.criteria[0].id, pass: true }]; };
    const collect = createContentEvidenceCollector(42, send);
    const ok = await collect({ id: 'c1', check: 'element_exists', target: '#x' });
    expect(ok).toBe(true);
    expect(captured.tabId).toBe(42);
    expect(captured.msg.type).toBe('EVALUATE_DONE_CRITERIA');
    expect(captured.msg.criteria).toEqual([{ id: 'c1', check: 'element_exists', target: '#x' }]);
  });

  test('内容脚本判未通过 → false（真实 DOM 结论，非不可用）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ pass: false }]);
    expect(await collect({ id: 'c', check: 'url_matches', target: 'x' })).toBe(false);
  });

  test('空/非数组响应 → null（取证不可用，不等于未达标）', async () => {
    expect(await createContentEvidenceCollector(1, async () => [])({ id: 'c' })).toBe(null);
    expect(await createContentEvidenceCollector(1, async () => null)({ id: 'c' })).toBe(null);
    expect(await createContentEvidenceCollector(1, async () => ({ results: [{ pass: true }] }))({ id: 'c' })).toBe(true);
  });

  test('sendMessage 抛错（内容脚本不可达）→ null（不可用 ≠ 未达标，交上层归 indeterminate）', async () => {
    const collect = createContentEvidenceCollector(1, async () => { throw new Error('Receiving end does not exist'); });
    expect(await collect({ id: 'c', check: 'element_exists', target: '#x' })).toBe(null);
  });

  // M-new-3：内容脚本报 available:false（求不出值）必须映射成 null（不可用），绝不折成 false（未达标）
  test('内容脚本 available:false（求不出值）→ null（不可用 ≠ 未达标）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ id: 'c', check: 'element_exists', pass: false, available: false }]);
    expect(await collect({ id: 'c', check: 'element_exists', target: '##bad' })).toBe(null);
  });

  test('内容脚本 available:true + pass:false（真实 DOM 确证未达）→ false（非不可用）', async () => {
    const collect = createContentEvidenceCollector(1, async () => [{ id: 'c', pass: false, available: true }]);
    expect(await collect({ id: 'c', check: 'element_exists', target: '#nope' })).toBe(false);
  });

  // M-new-4：单条取证超时（渲染进程阻塞）→ null（不可用），不无界挂起
  test('取证超时 → null（防无界挂起，计为不可用而非未达标）', async () => {
    const collect = createContentEvidenceCollector(1, () => new Promise(() => {}), 5);
    expect(await collect({ id: 'c', check: 'element_exists', target: '#x' })).toBe(null);
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
