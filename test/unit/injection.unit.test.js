// injection.unit.test.js - 「见缝插针」待注入缓冲（背景侧纯逻辑）
//
// 这一层要保证的三件事：
//   1. 登记 → drain 取走，取走即出缓冲（绝不重复注入同一条）；
//   2. 会话之间互不串台（A 会话的插话不会插进 B 的任务）；
//   3. 注入文案带上时间与三条硬性规则（不许放弃原任务 / 冲突以本条为准 / 不用单独汇报）。
import { describe, test, expect, beforeEach } from 'vitest';
import {
  enqueueInjection,
  drainPendingInjections,
  dropPendingInjections,
  buildInjectionContent,
  __resetInjectionForTest,
  MAX_PENDING_PER_SESSION,
  MAX_CARRY_PER_ITERATION,
  MAX_INJECT_TEXT_CHARS,
} from '../../src/background/injection.js';

beforeEach(() => {
  __resetInjectionForTest();
});

describe('待注入缓冲', () => {
  test('登记后能被 drain 取走，且取走即出缓冲（不会重复注入）', () => {
    enqueueInjection('s1', { itemId: 'q1', text: '顺便把标题改一下' });

    const first = drainPendingInjections('s1');
    expect(first).toHaveLength(1);
    expect(first[0]).toMatchObject({ itemId: 'q1', text: '顺便把标题改一下' });
    expect(typeof first[0].requestedAt).toBe('number');

    // 第二次取必须是空的：重复注入等于让模型做两遍
    expect(drainPendingInjections('s1')).toEqual([]);
  });

  test('同 itemId 重复登记是幂等的（连点 ⚡ 不会灌出两条）', () => {
    const a = enqueueInjection('s1', { itemId: 'q1', text: '改标题' });
    const b = enqueueInjection('s1', { itemId: 'q1', text: '改标题' });

    expect(a.ok).toBe(true);
    // pending 由返回值观测（不再读内部计数）：幂等登记没有让缓冲变长
    expect(b).toMatchObject({ ok: true, duplicate: true, pending: 1 });
  });

  test('单会话挂起有上限（防一口气把上下文塞爆）', () => {
    for (let i = 0; i < MAX_PENDING_PER_SESSION; i++) {
      expect(enqueueInjection('s1', { itemId: `q${i}`, text: `第${i}条` }).ok).toBe(true);
    }
    const overflow = enqueueInjection('s1', { itemId: 'q-over', text: '再来一条' });
    expect(overflow).toMatchObject({ ok: false, error: 'too_many_pending' });
  });

  test('单次 drain 最多携带固定条数，剩下的留到下一轮', () => {
    const total = MAX_CARRY_PER_ITERATION + 2;
    for (let i = 0; i < total; i++) {
      enqueueInjection('s1', { itemId: `q${i}`, text: `第${i}条` });
    }

    const first = drainPendingInjections('s1');
    expect(first).toHaveLength(MAX_CARRY_PER_ITERATION);

    const second = drainPendingInjections('s1');
    expect(second).toHaveLength(2);
    // 顺序保持 FIFO：先点的先插
    expect(second.map((it) => it.itemId)).toEqual([`q${MAX_CARRY_PER_ITERATION}`, `q${MAX_CARRY_PER_ITERATION + 1}`]);
  });

  test('会话之间互不串台', () => {
    enqueueInjection('s1', { itemId: 'q1', text: 'A 会话的' });
    enqueueInjection('s2', { itemId: 'q2', text: 'B 会话的' });

    expect(drainPendingInjections('s1').map((it) => it.itemId)).toEqual(['q1']);
    // s2 的条目原样留着：A 会话取走不影响 B 会话（由 s2 自己取出的结果证明）
    expect(drainPendingInjections('s2').map((it) => it.itemId)).toEqual(['q2']);
  });

  test('drop 返回被丢弃的条目（供后台立刻通知面板回退）', () => {
    enqueueInjection('s1', { itemId: 'q1', text: 'a' });
    enqueueInjection('s1', { itemId: 'q2', text: 'b' });

    const dropped = dropPendingInjections('s1');
    expect(dropped.map((it) => it.itemId)).toEqual(['q1', 'q2']);
    // 再 drop 不应报错/返回对象（缓冲已空由返回值证明）
    expect(dropPendingInjections('s1')).toEqual([]);
  });

  test('缺字段或空正文一律拒收', () => {
    expect(enqueueInjection('', { itemId: 'q1', text: 'x' })).toMatchObject({ ok: false, error: 'missing_fields' });
    expect(enqueueInjection('s1', { text: 'x' })).toMatchObject({ ok: false, error: 'missing_fields' });
    expect(enqueueInjection('s1', { itemId: 'q1', text: '   ' })).toMatchObject({ ok: false, error: 'empty' });
  });

  test('插话条目不再携带形同虚设的 callId（面板从未发送，后台从未读取）', () => {
    enqueueInjection('s1', { itemId: 'q1', text: '改标题' });
    const [item] = drainPendingInjections('s1');
    // 曾经的 callId 字段恒为 null：投递方（queue-runner）从不发它，
    // 消费方（react-loop）只读 itemId/text —— 留着只会诱使后人以为它能过滤迭代
    expect(item).not.toHaveProperty('callId');
  });
});

describe('注入文案', () => {
  const at14h32 = new Date(2026, 9, 25, 14, 32, 0).getTime();

  test('带上时间标记、用户原文与三条硬性规则', () => {
    const content = buildInjectionContent({ text: '顺便把登录页的报错文案改一下', requestedAt: at14h32 });

    expect(content).toContain('[User interjection while you were working · 14:32]');
    expect(content).toContain('顺便把登录页的报错文案改一下');
    // 三条规则各自防一种翻车，少一条都可能让模型跑偏
    expect(content).toContain('Do NOT abandon the original task');
    expect(content).toContain('If this conflicts with the original task, follow this one and state why');
    expect(content).toContain('No separate report on this message is needed');
  });

  test('超长正文被截断并显式标记（不静默砍）', () => {
    const content = buildInjectionContent({ text: 'x'.repeat(MAX_INJECT_TEXT_CHARS + 500), requestedAt: at14h32 });
    expect(content).toContain('(truncated)');
    expect(content.length).toBeLessThan(MAX_INJECT_TEXT_CHARS + 600);
  });

  test('时间取登记时刻，而不是渲染时刻', () => {
    const a = buildInjectionContent({ text: 'a', requestedAt: at14h32 }, new Date(2026, 9, 25, 23, 59, 0));
    expect(a).toContain('· 14:32');
  });
});

describe('injection 已移除的死接口', () => {
  test('pendingInjectionCount 产品代码零调用，已移除（观测改用返回值）', async () => {
    const mod = await import('../../src/background/injection.js');
    expect(mod.pendingInjectionCount).toBeUndefined();
  });
});
